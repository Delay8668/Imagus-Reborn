// src/background/ConfigService.js
"use strict";

import { StorageService } from './StorageService.js';
import { extensionURL } from '../utils/UrlUtils.js';

export class ConfigService {
    #storage;
    #cachedPrefs = {};
    #cachedSieve = [];
    #cachedSieveRes = [];
    #manifest;

    constructor(storageService, manifest) {
        this.#storage = storageService;
        this.#manifest = manifest;
    }

    getPrefs() { return this.#cachedPrefs; }
    getSieve() { return this.#cachedSieve; }
    getSieveRes(id) { return this.#cachedSieveRes[id]; }

    /**
     * Checks if a given origin URL is blocked by the user's grants.
     * @param {string} origin - The URL of the sender tab.
     * @returns {boolean} - True if blocked, false otherwise.
     */
    isOriginBlocked(origin) {
        const grants = this.#cachedPrefs.grants;
        if (!grants) return false;

        for (let i = 0, len = grants.length; i < len; ++i) {
            const grant = grants[i];
            if (grant.url === "*" || (grant.op[1] && grant.url.test(origin)) || origin.indexOf(grant.url) > -1) {
                if (grant.op[0] === "!") return true; // Blocked
            }
        }
        return false;
    }

    /**
     * Loads defaults, merges with stored settings, and caches them.
     * @param {object} [prefs] - New preferences to save.
     */
    async initialize(prefs = {}) {
        const defaults = await (await fetch(extensionURL("data/defaults.json"))).json();
        const storedPrefs = await this.#storage.get(Object.keys(defaults));
        let newPrefs = {};
        let changes = {};

        for (const key in defaults) {
            let isChanged = false;
            if (typeof defaults[key] === "object") {
                newPrefs[key] = prefs[key] || storedPrefs[key] || defaults[key];
                isChanged = true;
                if (!Array.isArray(defaults[key])) {
                    for (const subKey in defaults[key]) {
                        if (newPrefs[key][subKey] === undefined ||
                            typeof newPrefs[key][subKey] !== typeof defaults[key][subKey]) {
                            newPrefs[key][subKey] =
                                this.#cachedPrefs?.[key]?.[subKey] !== undefined
                                    ? this.#cachedPrefs[key][subKey]
                                    : defaults[key][subKey];
                        }
                    }
                }
            } else {
                let value = prefs[key] || storedPrefs[key] || defaults[key];
                if (typeof value !== typeof defaults[key]) {
                    value = defaults[key];
                }
                if (!this.#cachedPrefs || this.#cachedPrefs[key] !== value) {
                    isChanged = true;
                }
                newPrefs[key] = value;
            }
            if (isChanged || storedPrefs[key] === undefined) {
                changes[key] = newPrefs[key];
            }
        }

        // Process grants
        if (newPrefs.grants?.length > 0) {
            newPrefs.grants = newPrefs.grants
                .filter(g => g.op !== ";")
                .map(g => ({
                    op: g.op,
                    url: g.op.length === 2 ? new RegExp(g.url, "i") : g.url,
                }));
            if (!newPrefs.grants.length) delete newPrefs.grants;
        } else {
            delete newPrefs.grants;
        }

        this.#cachedPrefs = newPrefs;
        
        if (prefs.sieve) {
            changes.sieve = typeof prefs.sieve === "string" ? JSON.parse(prefs.sieve) : prefs.sieve;
            this.#cacheSieve(changes.sieve);
        }
        
        await this.#storage.set(changes);
        
        if (!prefs.sieve) {
            const data = await this.#storage.get("sieve");
            if (!data?.sieve) {
                await this.updateSieve(true); // Force update from local
            } else {
                this.#cacheSieve(data.sieve);
            }
        }
    }

    /**
     * Saves new preferences.
     * @param {object} prefs - The preferences object to save.
     */
    async savePrefs(prefs) {
        await this.initialize(prefs);
    }

    /**
     * Fetches and updates the Sieve rules.
     * @param {boolean} [local=false] - Force update from local file.
     * @returns {Promise<object>} - Result of the update.
     */
    async updateSieve(local = false) {
        const { sieve: curSieve, sieveRepository: sieveRepoUrl } = await this.#storage.get(["sieveRepository", "sieve"]);
        const isLocal = local || !sieveRepoUrl;
        const url = isLocal ? extensionURL("data/sieve.json") : sieveRepoUrl;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("HTTP " + response.status);

            let newSieve = await response.json();
            if (curSieve) {
                let merged = {};
                // Keep custom rules
                for (let key in curSieve) {
                    if (key.startsWith("_")) {
                        merged[key] = curSieve[key];
                    }
                }
                // Add new/updated rules
                for (let key in newSieve) {
                    merged[key] = newSieve[key];
                }
                // Add old rules as disabled
                for (let key in curSieve) {
                    if (!merged[key]) {
                        curSieve[key].off = 1;
                        merged[key] = curSieve[key];
                    }
                }
                newSieve = merged;
            }

            await this.savePrefs({ sieve: newSieve });
            console.info(`${this.#manifest.name}: Sieve updated from ${isLocal ? "local" : "remote"} repository.`);
            return { updated_sieve: newSieve };

        } catch (error) {
            console.warn(`${this.#manifest.name}: Sieve failed to update from ${isLocal ? "local" : "remote"}! | ${error.message}`);
            if (!isLocal && !curSieve) {
                // If remote fails and we have no sieve, try local
                return this.updateSieve(true);
            }
            return { error: "Error. " + error.message };
        }
    }

    /**
     * Processes and caches the Sieve rules for the content script.
     * @param {object} newSieve - The raw Sieve object.
     */
    #cacheSieve(newSieve) {
        const sieveObj = typeof newSieve === "string" ? JSON.parse(newSieve) : JSON.parse(JSON.stringify(newSieve));
        const cachedSieve = [];
        const cachedSieveRes = [];

        for (const ruleName in sieveObj) {
            const rule = sieveObj[ruleName];
            if ((!rule.link && !rule.img) || (rule.img && !rule.to && !rule.res)) continue;

            try {
                if (rule.off) throw `${ruleName} is off`;
                if (rule.res) {
                    if (/^:\n/.test(rule.res)) {
                        // Dynamic function rule
                        cachedSieveRes[cachedSieve.length] = rule.res.slice(2);
                        rule.res = 1; // Mark as dynamic
                    } else {
                        // Regex rule
                        if (rule.res.indexOf("\n") > -1) {
                            const lines = rule.res.split(/\n+/);
                            rule.res = new RegExp(lines[0]);
                            if (lines[1]) rule.res = [rule.res, new RegExp(lines[1])];
                        } else {
                            rule.res = new RegExp(rule.res);
                        }
                        cachedSieveRes[cachedSieve.length] = rule.res;
                        rule.res = true; // Mark as regex
                    }
                }
            } catch (ex) {
                if (typeof ex === "object") console.error(ruleName, rule, ex);
                else console.info(ex);
                continue;
            }
            if (rule.to && rule.to.indexOf("\n") > 0 && rule.to.indexOf(":\n") !== 0) {
                rule.to = rule.to.split("\n");
            }
            delete rule.note;
            cachedSieve.push(rule);
        }
        
        this.#cachedSieve = cachedSieve;
        this.#cachedSieveRes = cachedSieveRes;
        this.#cachedPrefs.sieve = cachedSieve; // Update the cachedPrefs object
    }
}