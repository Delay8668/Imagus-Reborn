// src/options/options-utils.js
"use strict";

/**
 * Gets an element by ID.
 * @param {string} id
 * @returns {HTMLElement}
 */
export const $ = (id) => document.getElementById(id);

/**
 * Gets an i18n message.
 * @param {string} msg - The message key.
 * @returns {string}
 */
export const _ = (msg) => {
    try {
        return chrome.i18n.getMessage(msg) || msg;
    } catch (err) {
        return msg;
    }
};

const sanitizer = {
    allowedTags: /^(a|p|b|i|u|s|q|d(iv|el)|em|h[1-6]|i(mg|ns)|s((pan|mall)|u[bp])|[bh]r|pre|code|blockquote|[ou]l|li|d[ltd]|t([rhd]|able|head|body|foot)|svg|symbol|line|path)$/i,
    allowedAttrs: /^(data-|stroke-|(class|style|xmlns|viewBox|i?d|fill|line(cap|join)|transform|[xy][12])$)/i,
    tempBody: document.implementation.createHTMLDocument("").body,
    cleanNode(node) {
        let childCount = node.childElementCount;
        let children = node.children || node.childNodes;
        while (childCount--) {
            let child = children[childCount];
            if (child.nodeType !== Node.TEXT_NODE) {
                if (this.allowedTags.test(child.nodeName)) {
                    let attrCount = child.attributes.length;
                    while (attrCount--) {
                        let attrName = child.attributes[attrCount].name;
                        if (!this.allowedAttrs.test(attrName)) {
                            child.removeAttribute(attrName);
                        }
                    }
                    if (child.childElementCount) {
                        this.cleanNode(child);
                    }
                } else {
                    child.parentNode.removeChild(child);
                }
            }
        }
    }
};

/**
 * Safely inserts i18n HTML.
 * @param {HTMLElement} element
 * @param {string} html
 */
export function insertHTML(element, html) {
    if (element && typeof html === "string") {
        if (html.indexOf("<") !== -1) {
            sanitizer.tempBody.innerHTML = html;
            sanitizer.cleanNode(sanitizer.tempBody);
            const doc = element.ownerDocument;
            const fragment = doc.createDocumentFragment();
            while (sanitizer.tempBody.firstChild) {
                let node = doc.adoptNode(sanitizer.tempBody.firstChild);
                fragment.appendChild(node);
            }
            element.appendChild(fragment);
        } else {
            element.insertAdjacentText("beforeend", html);
        }
    }
}

/**
 * Processes i18n for all elements in a node list.
 * @param {NodeList} nodes
 */
export function processLNG(nodes) {
    let els, l, args, attrs, attrnode, string;
    let i = nodes.length;
    while (i--) {
        if (nodes[i].lng_loaded) continue;
        els = nodes[i].querySelectorAll("[data-lng]");
        l = els.length;
        while (l--) {
            string = _(els[l].dataset["lng"]);
            attrs = els[l].dataset["lngattr"];
            if (attrs) {
                if (/^(title|placeholder)$/.test(attrs)) els[l][attrs] = string;
                els[l].removeAttribute("data-lngattr");
            } else insertHTML(els[l], string);
            els[l].removeAttribute("data-lng");
            if (els[l].dataset["lngargs"] === void 0) continue;
            args = els[l].dataset["lngargs"].split(" ");
            args.idx = args.length;
            while (args.idx--) {
                args[args.idx] = args[args.idx].split(":");
                args[args.idx][0] = "data-" + args[args.idx][0];
                attrnode = els[l].querySelector("[" + args[args.idx][0] + "]");
                if (!attrnode) continue;
                attrs = args[args.idx][1].split(",");
                attrs.idx = attrs.length;
                while (attrs.idx--) {
                    if (!/^(href|style|target)$/i.test(attrs[attrs.idx])) continue;
                    attrnode.setAttribute(attrs[attrs.idx], els[l].getAttribute(args[args.idx][0] + "-" + attrs[attrs.idx]));
                }
            }
            els[l].removeAttribute("data-lngargs");
        }
        nodes[i].lng_loaded = true;
    }
}

/**
 * Flashes the color of a node.
 * @param {HTMLElement} node
 * @param {string} color
 * @param {number} time
 */
export function color_trans(node, color, time) {
    clearTimeout(node.col_trans_timer);
    if (color === null) {
        node.style.color = "";
        delete node.col_trans_timer;
        return;
    }
    node.style.color = color;
    node.col_trans_timer = setTimeout(function () {
        color_trans(node, null);
    }, time || 2e3);
}

/**
 * Updates an <output> tag from its associated <input type="range">.
 * @param {Event|HTMLElement} e
 */
export function fill_output(e) {
    e = e.target || e;
    const op = e.previousElementSibling;
    op.textContent = op.dataset["as_percent"] ? parseInt(e.value * 100, 10) : e.value;
}

/**
 * Updates a color input from its associated text input.
 * @param {Event|HTMLElement} e
 */
export function color_text_input(e) {
    e = e.type === "input" ? this : e;
    let v = /^#([\da-f]{3}){1,2}$/i.test(e.value) ? e.value : "#ffffff";
    e.previousElementSibling.value = v.length === 4 ? "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : v;
}

/**
 * Updates a text input from its associated color input.
 */
export function color_change() {
    this.nextElementSibling.value = this.value;
}

/**
 * Resets a form element to its default value.
 * @param {HTMLElement} el
 */
export function setDefault(el) {
    if (!el) return;
    if (el.type === "checkbox") el.checked = el.defaultChecked;
    else if (/^SELECT/i.test(el.type))
        for (let i = el.length; i--;) {
            if (el[i].hasAttribute("selected")) {
                el.selectedIndex = i;
                break;
            }
        }
    else {
        el.value = el.defaultValue;
        if (el.type === "range") fill_output(el);
    }
}