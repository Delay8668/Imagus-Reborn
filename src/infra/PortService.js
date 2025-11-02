// src/infra/PortService.js
"use strict";

let listener = null;

// Use the standard messaging APIs
const onMessage = chrome.runtime.onMessage;
const sendMessage = chrome.runtime.sendMessage;

export const Port = {
  /**
   * Sets a callback to listen for messages from the background script.
   * @param {Function|null} callback
   */
  listen: function(callback) {
    if (listener) {
      onMessage.removeListener(listener);
    }
    if (typeof callback === 'function') {
      // Firefox fix: In Firefox, sender is always defined when content script receives messages
      // The check should be for sender.tab existence (background has no tab)
      if (/ms-browser|moz-extension/.test(location.protocol)) {
        listener = function(message, sender) {
          // In Firefox, messages from background have sender but sender.tab is undefined
          // Messages from other content scripts have sender.tab defined
          callback(message);
        };
      } else {
        listener = callback;
      }
      onMessage.addListener(listener);
    } else {
      listener = null;
    }
  },

  /**
   * Sends a message to the background script.
   * @param {Object} message
   * @returns {Promise}
   */
  send: function(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const callback = (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError && !settled) {
          settled = true;
          reject(new Error(lastError.message));
          return;
        }
        if (!settled) {
          settled = true;
          resolve(response);
        }
      };
      
      try {
        const maybePromise = sendMessage(message, callback);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(
            (value) => {
              if (!settled) {
                settled = true;
                resolve(value);
              }
            },
            (error) => {
              if (!settled) {
                settled = true;
                reject(error);
              }
            }
          );
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  },

  /**
   * Sends a history request to the background script.
   * @param {string} url
   * @param {boolean} manual
   */
  sendHistoryRequest: function(url, manual) {
    this.send({ cmd: 'history', url, manual });
  }
};
