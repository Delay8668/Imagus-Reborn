// src/main.js
"use strict";

import { PopupController } from './app/PopupController.js';
import { EventListenerService } from './app/EventListenerService.js';
import { Settings } from './core/Settings.js';
import { ImageResolver } from './core/ImageResolver.js';
import { Port } from './infra/PortService.js';
import { HistoryService } from './infra/HistoryService.js';

console.log('[Imagus] Content script loaded');

const win = window;
const doc = document;

// --- Services ---
// These are initialized *inside* initialize() once config is ready.
let settings = null;
const portService = Port;
let historyService = null;
let imageResolver = null;

// --- Controllers ---
let controller = null;
let eventService = null;

// State
let initialMoveEvent = null;

/**
 * Captures the first mouse move to get initial coordinates.
 * @param {MouseEvent} e
 */
function onInitMouseMove(e) {
    initialMoveEvent = e;
    //console.log('[Imagus] Mouse move captured:', e.clientX, e.clientY);
}

/**
 * Initializes the extension with received configuration.
 * @param {object} config
 */
function initialize(config) {
    
    console.log('[Imagus] Initialize called with config:', config);
    
    // Remove the init listener NOW that we're initializing
    win.removeEventListener('mousemove', onInitMouseMove, true);
    
    if (!config) {
        console.warn('[Imagus] No config provided, shutting down');
        shutdown();
        return;
    }

    // --- FIX: Instantiate services here ---
    settings = new Settings(config);
    historyService = new HistoryService(portService);
    imageResolver = new ImageResolver(settings);
    console.log('[Imagus] Services initialized');
    
    // (Old settings.update(config) is no longer needed as it's passed to constructor)

    // Initialize controller
    controller = new PopupController(
        win,
        doc,
        settings,
        portService,
        historyService,
        imageResolver
    );
    controller.initialSetup();
    console.log('[Imagus] Controller initialized');

    // Initialize event service
    eventService = new EventListenerService(controller, win, doc);
    
    // Attach all event listeners (including mouseover)
    eventService.attach();
    console.log('[Imagus] Event listeners attached');

    // If we captured a mouse position during init, simulate a mouseover
    if (initialMoveEvent) {
        const e = initialMoveEvent;
        initialMoveEvent = null;
        
        // Small delay to ensure everything is ready
        setTimeout(() => {
            if (controller && eventService) {
                console.log('[Imagus] Simulating initial mouseover');
                controller.handleMouseOver(e);
            }
        }, 10);
    }
}

/**
 * Shuts down the extension.
 */
function shutdown() {
    console.log('[Imagus] Shutting down');
    if (eventService) {
        eventService.detach();
        eventService = null;
    }
    if (controller) {
        controller.destroy();
        controller = null;
    }
    // (settings, historyService, imageResolver are let, not const,
    //  so we can null them if needed, but they don't have detach/destroy methods)
    settings = null;
    historyService = null;
    imageResolver = null;
}


win.addEventListener('message', function(event) {
    const d = event.data;
    if (d && d.hasOwnProperty('vdfDpshPtdhhd')) {
        event.stopImmediatePropagation();
        const cmd = d.vdfDpshPtdhhd;
        if (controller) {
            if (cmd === 'isFrame') {
                controller.setIsFrame(d.parent === 'BODY');
            } else if (cmd === 'toggle') {
                controller.toggle(win.sessionStorage.IMGS_suspend === '1');
            } else if (cmd === 'preload') {
                controller.preload();
            } else if (cmd === 'fromframe') {
                controller.handleFrameMessage(d);
            }
        }
    }
}, true);
// --- Request Settings from Background ---
console.log('[Imagus] Sending hello request to background');
portService.send({ cmd: 'hello' }).then(response => {
    console.log('[Imagus] Received response from background:', response);
    
    // --- START: MOVED AND FIXED LOGIC ---
    // Check for valid config
    if (!response || !response.prefs || !response.prefs.hz) {
        console.error('[Imagus] Invalid config received, missing hz settings', response);
        win.removeEventListener('mousemove', onInitMouseMove, true);
        return;
    }

    // --- FIX: Add "Always On + No Trigger" disable check ---
    // If "deactivate" mode is OFF (meaning "Always on") but the trigger is "None",
    // the script would be stuck on. The old code disabled it, so we do too.
    if (!response.prefs.hz.deactivate && response.prefs.hz.actTrigger === "0") {
        console.warn('[Imagus] Conflicting config: "Always on" mode with "None" trigger. Shutting down.');
        win.removeEventListener('mousemove', onInitMouseMove, true);
        return;
    }
    
    // Add the dynamic key needed by the controller
    response.prefs.hz._freezeTriggerEventKey = response.prefs.hz.actTrigger.toLowerCase() + "Key";

    if (response && response.cmd === 'hello') {
        console.log('[Imagus] Hello message received, initializing...');
        
        // Pass toggle/preload messages to the top window
        if (win !== win.top) {
            win.top.postMessage({ vdfDpshPtdhhd: 'isFrame' }, '*');
        }
        
        // Initialize with received preferences
        initialize(response.prefs);
        
        // Setup the permanent listener for other messages (like 'resolved')
        if (controller) {
            portService.listen(controller.handleMessage.bind(controller));
            console.log('[Imagus] Permanent message listener attached.');
        }
    }
    // --- END: MOVED AND FIXED LOGIC ---

}).catch(error => {
    console.error('[Imagus] Error sending hello:', error);
    win.removeEventListener('mousemove', onInitMouseMove, true);
});

// --- Start Listening for Mouse Movement ---
console.log('[Imagus] Adding mousemove listener');
win.addEventListener('mousemove', onInitMouseMove, true);
console.log('[Imagus] Content script setup complete');