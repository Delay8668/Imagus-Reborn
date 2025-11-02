// src/background/StorageService.js
"use strict";

/**
 * Promisifies Chrome's callback-based APIs.
 * @param {Function} fn - The Chrome API function (e.g., chrome.storage.local.get).
 * @param {Array} args - Arguments to pass to the function.
 * @param {object} context - The 'this' context for the function (e.g., chrome.storage.local).
 * @returns {Promise<any>}
 */
async function callChrome(fn, args = [], context) {
    return new Promise((resolve, reject) => {
        try {
            const target = context ?? chrome;
            const maybePromise = fn.call(target, ...args, function callback(result) {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });

            if (maybePromise && typeof maybePromise.then === "function") {
                maybePromise.then(resolve, reject);
            }
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * A service for interacting with chrome.storage.
 * Handles JSON parsing and promisification.
 */
export const StorageService = {
    async sessionGet(keys) {
        if (!chrome.storage?.session) return Promise.resolve({});
        return callChrome(chrome.storage.session.get, [keys], chrome.storage.session);
    },

    async sessionSet(items) {
        if (!chrome.storage?.session) return Promise.resolve();
        return callChrome(chrome.storage.session.set, [items], chrome.storage.session);
    },

    async sessionRemove(keys) {
        if (!chrome.storage?.session) return Promise.resolve();
        return callChrome(chrome.storage.session.remove, [keys], chrome.storage.session);
    },

    /**
     * Gets and parses JSON values from local storage.
     * @param {string|string[]} keys
     * @returns {Promise<object>}
     */
    async get(keys) {
        const items = await callChrome(chrome.storage.local.get, [keys], chrome.storage.local);
        for (const key in items) {
            try {
                if (!items[key]) throw new Error("Empty value");
                items[key] = JSON.parse(items[key]);
            } catch (error) {
                delete items[key]; // Corrupted or invalid data
            }
        }
        return items;
    },

    /**
     * Stringifies and sets values in local storage.
     * @param {object} items
     */
    async set(items) {
        const prepared = {};
        for (const key in items) {
            prepared[key] = JSON.stringify(items[key]);
        }
        await callChrome(chrome.storage.local.set, [prepared], chrome.storage.local);
    },

    /**
     * Removes items from local storage.
     * @param {string|string[]} keys
     */
    async remove(keys) {
        return callChrome(chrome.storage.local.remove, [keys], chrome.storage.local);
    },
};