// src/utils/DOMUtils.js
"use strict";

/**
 * Prevents default event behavior and stops propagation.
 * @param {Event} e - The event object.
 * @param {boolean} [preventDefault=true] - Whether to prevent default.
 * @param {boolean} [stopImmediate=true] - Whether to stop immediate propagation.
 */
export function stopEvent(e, preventDefault = true, stopImmediate = true) {
    if (!e) return;
    if (preventDefault && e.preventDefault) {
        e.preventDefault();
    }
    if (stopImmediate && e.stopImmediatePropagation) {
        e.stopImmediatePropagation();
    } else if (e.stopPropagation) {
        e.stopPropagation();
    }
}

/**
 * Gets the viewport dimensions.
 * @param {Document} targetDoc - The document to measure.
 * @returns {{width: number, height: number}}
 */
export function getViewportDimensions(targetDoc) {
    const d = (targetDoc.compatMode === "BackCompat" && targetDoc.body) || targetDoc.documentElement;
    return {
        width: d.clientWidth,
        height: d.clientHeight
    };
}

/**
 * Recursively builds a DOM structure from a "nodes" array.
 * @param {HTMLElement} element - The parent element to append to.
 * @param {Array<object|string>} nodes - The array of node definitions.
 * @returns {HTMLElement} The parent element.
 */
export function buildNodes(element, nodes) {
    if (!element || !Array.isArray(nodes) || !nodes.length) {
        return element;
    }

    const doc = element.ownerDocument;
    const fragment = doc.createDocumentFragment();

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;

        if (typeof node !== "string") {
            const el = doc.createElement(node.tag);

            if (node.attrs) {
                for (const attr in node.attrs) {
                    if (attr === "style") {
                        el.style.cssText = node.attrs[attr];
                    } else {
                        el.setAttribute(attr, node.attrs[attr]);
                    }
                }
            }

            if (node.nodes) {
                buildNodes(el, node.nodes); // Recurse
            } else if (node.text) {
                el.textContent = node.text;
            }

            fragment.appendChild(el);
        } else {
            fragment.appendChild(doc.createTextNode(node));
        }
    }

    if (fragment.childNodes.length) {
        element.appendChild(fragment);
    }

    return element;
}