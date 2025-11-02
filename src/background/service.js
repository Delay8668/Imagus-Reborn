// src/background/service.js
"use strict";

import { StorageService } from './StorageService.js';
import { ConfigService } from './ConfigService.js';
import { ActionService } from './ActionService.js';
import { ResolveService } from './ResolveService.js';
import { MessageController } from './MessageController.js';

const manifest = chrome.runtime.getManifest();

// 1. Instantiate Services
const configService = new ConfigService(StorageService, manifest);
const actionService = new ActionService();
const resolveService = new ResolveService(configService, manifest);
const messageController = new MessageController(
    configService,
    resolveService,
    actionService,
    StorageService,
    manifest
);

// --- Extension Lifecycle ---

function keepAlive() {
    setInterval(chrome.runtime.getPlatformInfo, 25_000);
}


function registerContentScripts() {
    const contentScript = {
        id: 'imagus-reborn-content',
        allFrames: true,
        matches: ['<all_urls>'],
        js: [{ file: 'main.js' }], // This is correct from our last fix
        runAt: 'document_idle',
        world: 'USER' // <-- ADD THIS LINE
    };

    if (chrome.scripting && chrome.scripting.registerContentScripts) {
        chrome.scripting.getRegisteredContentScripts((scripts) => {
            const ids = scripts.map(s => s.id);
            chrome.scripting.unregisterContentScripts({ ids: ids }, () => {
                try {
                    chrome.scripting.registerContentScripts([contentScript], () => {
                       if (chrome.runtime.lastError) {
                            console.error("Failed to register content script:", chrome.runtime.lastError.message);
                         } else {
                            console.log("Content script registered.");
                         }
                    });
                } catch (error) {
                   console.error("Failed to register content script (Firefox catch):", error.message);
                }
            });
        });
    } else {
       console.warn("Dynamic script registration not supported.");
    }
}

// Pass registerContentScripts to the controller if needed
messageController.registerContentScripts = registerContentScripts;

// Set Action/Browser Action Title
const actionAPI = chrome.action ?? chrome.browserAction;
actionAPI?.setTitle?.({ title: `${manifest.name} v${manifest.version}` });

// Add Message Listeners
chrome.runtime.onMessage.addListener(messageController.listener.bind(messageController));
// REMOVED onUserScriptMessage listener

// Startup / Install Listeners
chrome.runtime.onStartup.addListener(() => {
    configService.initialize();
});

chrome.runtime.onInstalled.addListener((e) => {
    if (e.reason === "update") {
        registerContentScripts();
    } else if (e.reason === "install") {
        chrome.runtime.openOptionsPage();
    }
    configService.initialize().then(registerContentScripts);
});

// Initial load
configService.initialize().then(registerContentScripts);
keepAlive();