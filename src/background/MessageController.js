// src/background/MessageController.js
"use strict";

import { extensionURL } from '../utils/UrlUtils.js';

export class MessageController {
    #config;
    #resolve;
    #action;
    #storage;
    #manifest;

    constructor(configService, resolveService, actionService, storageService, manifest) {
        this.#config = configService;
        this.#resolve = resolveService;
        this.#action = actionService;
        this.#storage = storageService;
        this.#manifest = manifest;
    }

    /**
     * The main listener for all runtime messages.
     * @param {object} message - The message object.
     * @param {chrome.runtime.MessageSender} sender - The sender object.
     * @param {Function} sendResponse - The callback to send a response.
     * @returns {boolean} - True to indicate an async response.
     */
    listener(message, sender, sendResponse) {
        const msg = message;
        const context = {
            msg: message,
            origin: sender.url,
            tabId: sender.tab?.id,
            isPrivate: sender.incognito || false,
            postMessage: sendResponse
        };

        if (!msg.cmd) return false;

        switch (msg.cmd) {
            case "hello": {
                const isBlocked = this.#config.isOriginBlocked(context.origin);
                const prefs = this.#config.getPrefs();
                const response = {
                    hz: prefs.hz,
                    sieve: prefs.sieve, // This is the cached, processed sieve
                    tls: prefs.tls,
                    keys: prefs.keys,
                    app: { name: this.#manifest.name, version: this.#manifest.version },
                };
                context.postMessage({ cmd: "hello", prefs: isBlocked ? null : response });
                break;
            }
            
            // Note: These handlers are likely for an options page.
            // For security, you might want to check sender.url
            // to ensure they only come from your extension's options.
            case "cfg_get":
                this.#storage.get(msg.keys).then(data => {
                    context.postMessage({ cfg: data });
                });
                return true; // Async

            case "cfg_del":
                this.#storage.remove(msg.keys);
                break;

            case "savePrefs":
                this.#config.savePrefs(msg.prefs).then(() => {
                    context.postMessage({ success: true });
                });
                return true; // Async

            case "update_sieve":
                this.#config.updateSieve(msg.local).then(data => {
                    context.postMessage(data);
                });
                return true; // Async
            
            case "getLocaleList":
                fetch(extensionURL("data/locales.json"))
                    .then(resp => resp.text())
                    .then(resp => context.postMessage(resp));
                return true; // Async

            // Actions delegated from content script
            case "download":
                this.#action.download(msg.url, context.isPrivate);
                break;

            case "history":
                this.#action.handleHistory(msg.url, msg.manual, context.isPrivate);
                break;

            case "open":
                this.#action.openTabs(msg.url, msg.nf, context.tabId);
                break;

            // Complex resolve logic
            case "resolve":
                this.#resolve.handleResolve(msg, context.postMessage);
                return true; // Async
            
            case "loadScripts":
                // This command seems to be for dynamic registration,
                // which is already handled on install/startup.
                // We'll leave it here in case it's called from options.
                this.registerContentScripts?.(); // registerContentScripts must be passed in
                break;
        }
        
        return false; // Default to sync
    }
}