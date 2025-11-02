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

// MV2 doesn't use dynamic script registration
function registerContentScripts() {
   console.log("Using static content script injection from manifest.json");
}

// Pass registerContentScripts to the controller if needed
messageController.registerContentScripts = registerContentScripts;

// Set Action/Browser Action Title
const actionAPI = chrome.action ?? chrome.browserAction;
actionAPI?.setTitle?.({ title: `${manifest.name} v${manifest.version}` });

// Add Message Listeners
chrome.runtime.onMessage.addListener(messageController.listener.bind(messageController));

// Startup / Install Listeners
chrome.runtime.onStartup.addListener(() => {
    configService.initialize();
});

chrome.runtime.onInstalled.addListener((e) => {
    if (e.reason === "install") {
        chrome.runtime.openOptionsPage();
    }
    configService.initialize();
});

// Initial load
configService.initialize();