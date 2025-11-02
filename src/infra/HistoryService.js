// src/infra/HistoryService.js
export class HistoryService {
    #portService;

    constructor(portService) {
        this.#portService = portService;
    }

    /**
     * Adds a URL to the history.
     * @param {string} url - The URL of the *link*, not the image.
     * @param {boolean} manual - If the action was triggered by a user keypress.
     * @param {boolean} inIncognito - Pass chrome.extension.inIncognitoContext
     */
    add(url, manual = false, inIncognito = false) {
        if (inIncognito || !url) return;
        this.#portService.sendHistoryRequest(url, manual);
    }
}