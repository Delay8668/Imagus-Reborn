// src/background/ActionService.js
"use strict";

export class ActionService {
    /**
     * Triggers a file download.
     * @param {string} url
     * @param {boolean} isPrivate - Whether the request is from an incognito window.
     */
    download(url, isPrivate) {
        if (!url) return;
        try {
            chrome.downloads.download({ url: url, incognito: isPrivate });
        } catch (e) {
            chrome.downloads.download({ url: url });
        }
    }

    /**
     * Adds or removes a URL from history.
     * @param {string} url
     * @param {boolean} manual - True to toggle, false to just add.
     * @param {boolean} inIncognito
     */
    handleHistory(url, manual, inIncognito) {
        if (inIncognito) return;

        if (manual) {
            chrome.history.getVisits({ url }, (hv) => {
                chrome.history[hv.length ? "delete" : "add" + "Url"]({ url });
            });
        } else {
            chrome.history.addUrl({ url });
        }
    }

/**
     * Opens one or more tabs, or downloads data: URIs.
     * @param {string|string[]} urls
     * @param {boolean} inBackground - True to open without focusing.
     * @param {number} senderTabId - The ID of the originating tab.
     */
    openTabs(urls, inBackground, senderTabId) {
        if (!Array.isArray(urls)) urls = [urls];

        urls.forEach(url => {
            if (!url || typeof url !== "string") return;

            // --- ADD THIS CHECK ---
            if (url.startsWith("data:")) {
                try {
                    // This is a data URI, download it instead of opening
                    chrome.downloads.download({ url: url, filename: "image.png" }); // You could try to guess a better filename
                } catch (e) {
                    console.error("Failed to download data: URI", e);
                }
            // --- END OF CHECK ---
            } else {
                // This is a regular URL, open it
                let tabOptions = { url, active: !inBackground };
                if (senderTabId) {
                    tabOptions.openerTabId = senderTabId;
                }
                try {
                    chrome.tabs.create(tabOptions);
                } catch (error) {
                    delete tabOptions.openerTabId;
                    chrome.tabs.create(tabOptions);
                }
            }
        });
    }
}