// src/utils/UrlUtils.js
"use strict";

export const rgxHTTPs = /^https?:\/\/(?:www\.)?/;
export const rgxHash = /#(?![?!].).*/;

// Helper 'a' tag for normalization, created once.
const HLP = document.createElement('a');

/**
 * Prepends a protocol and domain to a relative URL.
 * @param {string} url - The URL to process.
 * @param {string} preDomain - The domain to prepend (e.g., "http://example.com").
 * @param {string} pageProtocol - The page's protocol (e.g., "http:").
 * @returns {string}
 */
export function httpPrepend(url, preDomain, pageProtocol) {
    if (preDomain) {
        url = url.replace(/^(?!#?(?:https?:|\/\/|data:)|$)(#?)/, "$1" + preDomain);
    }
    if (url[1] === "/") {
        if (url[0] === "/") {
            url = pageProtocol + url;
        } else if (url[0] === "#" && url[2] === "/") {
            url = "#" + pageProtocol + url.slice(1);
        }
    }
    return url;
}

/**
 * Normalizes a URL to its absolute form.
 * @param {string} url - The URL to normalize.
 * @param {string} pageProtocol - The page's protocol.
 * @returns {string} The absolute URL.
 */
export function normalizeURL(url, pageProtocol) {
    if (url[1] === "/" && url[0] === "/") {
        url = pageProtocol + url;
    }
    HLP.href = url;
    return HLP.href;
}

/**
 * Strips the hash from a URL.
 * @param {string} url
 * @returns {string}
 */
export function stripHash(url) {
    return url.replace(rgxHash, "");
}

/**
 * Gets a full URL for an extension resource.
 * @param {string} resourcePath - Path relative to the extension root.
 * @returns {string}
 */
export function extensionURL(resourcePath) {
    if (typeof resourcePath !== "string") {
        return chrome.runtime.getURL("");
    }
    return chrome.runtime.getURL(resourcePath.replace(/^\//, ""));
}

/**
 * Resolves a relative URL against a base URL.
 * @param {string} base - The base URL.
 *CH_ext: 
 * @param {string} relative - The relative URL.
 * @param {boolean} [secure] - Use page's protocol for protocol-relative URLs.
 * @returns {string}
 */
export function withBaseURI(base, relative, secure) {
    if (relative[0] === '/' && relative[1] === '/') {
        return secure ? base.slice(0, base.indexOf(":") + 1) + relative : relative;
    } else if (/^[\w-]{2,20}:/i.test(relative)) {
        return relative; // Already absolute
    } else {
        const regex = relative[0] === '/' ? /(\/\/[^/]+)\/.*/ : /(\/)[^/]*(?:[?#].*)?$/;
        return base.replace(regex, "$1") + relative;
    }
}