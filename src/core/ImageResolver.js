// src/core/ImageResolver.js
"use strict";

import { httpPrepend, normalizeURL, rgxHTTPs, rgxHash, stripHash } from '../utils/UrlUtils.js';

/**
 * Handles all business logic for finding and resolving image URLs,
 * including Sieve rule application.
 */
export class ImageResolver {
    #settings;
    #win;
    #doc;
    #HLP; // Helper 'a' tag for URL normalization
    
    // Context for 'toFunction' execution
    #node = null; 
    
    // --- ADD THIS GETTER ---
    /**
     * Public alias for the context node.
     * Sieve rules (from legacy code) expect `this.TRG` to be the target element.
     */
    get TRG() {
        return this.#node;
    }

    /**
     * Legacy alias for the context node.
     * Old Sieve rules use `this.node`.
     */
    get node() {
        return this.#node;
    }
    // --- END ADDITION ---

    // Regexes
    #rgxIsSVG = /\.svgz?$/i;
    #pageProtocol = '';
    
    // Viewport dimensions
    #topWinW = 0;
    #topWinH = 0;

    constructor(settings) {
        this.#settings = settings;
        this.#pageProtocol = window.location.protocol.replace(/^(?!https?:).+/, "http:");
    }

    /**
     * Sets the execution context (window, document) for the resolver.
     */
    setContext(win, doc, helperA) {
         this.#win = win;
        this.#doc = doc;
        this.#HLP = helperA;
        
        const d = (doc.compatMode === "BackCompat" && doc.body) || doc.documentElement;
        this.#topWinW = d.clientWidth;
        this.#topWinH = d.clientHeight;
    }
    
    /**
     * Sets the 'this' context for Sieve functions.
     */
    setContextNode(node) {
        this.#node = node;
    }
    
    /**
     * Public getter for the page protocol.
     */
    getPageProtocol() {
        return this.#pageProtocol;
    }

    /**
     * Public getter for SVG regex.
     */
    isSVG(url) {
        return this.#rgxIsSVG.test(url);
    }

    // --- ================================= ---
    // --- Public Find Logic (Ported PVI.find) ---
    // --- ================================= ---

    /**
     * Main function to find the image URL for a given target element.
     * This is a refactor of the massive PVI.find()
     * @param {HTMLElement} trg - The target element.
 * @param {number} x - Mouse X coordinate.
     * @param {number} y - Mouse Y coordinate.
     * @returns {object|null} A result object, or null for no match.
     * { error: 1 } for a rule compile error.
     */
    find(trg, x, y) {
         let i = 0,
            n = trg,
            ret = false,
            URL,
             rule,
            imgs,
            use_img,
            tmp_el,
             attrModNode;
            
        do {
            if (n.nodeType !== undefined)
                if (n.nodeType !== 1 || n === this.#doc.body) break;
                else if (n.localName !== "a") continue;
            
            if (!n.href) {
                if (n.href === "") attrModNode = n; // Listen for changes
                break;
            }
             if (n instanceof this.#win.HTMLElement) {
                if (n.childElementCount && n.querySelector("iframe, object, embed")) break;
                if (typeof x === "number" && typeof y === "number") {
                     tmp_el = this.#doc.elementsFromPoint(x, y);
                    for (i = 0; i < 5; ++i) {
                         if (tmp_el[i] === this.#doc.body) break;
                        if (!tmp_el[i].currentSrc && tmp_el[i].style.backgroundImage.lastIndexOf("url(", 0) !== 0) continue;
                        var elRect = tmp_el[i].getBoundingClientRect();
                         if (x >= elRect.left && x < elRect.right && y >= elRect.top && y < elRect.bottom) {
                             var trgRect = trg.getBoundingClientRect();
                            if (
                                 trgRect.left - 10 <= elRect.left &&
                                 trgRect.right + 10 >= elRect.right &&
                                trgRect.top - 10 <= elRect.top &&
                                trgRect.bottom + 10 >= elRect.bottom
                             )
                                imgs = this.getImages(tmp_el[i], true);
                        }
                        
 break;
                    }
                }
                 if (tmp_el) tmp_el = null;
                attrModNode = n;
            } else {
                 if (n.getAttributeNS) {
                    tmp_el = n.getAttributeNS("http://www.w3.org/1999/xlink", "href");
                    if (!tmp_el) continue;
                    n = { href: tmp_el };
                }
                 n.href = normalizeURL(n.href, this.#HLP, this.#pageProtocol);
            }
            URL = n.href.replace(rgxHTTPs, "");
            if (imgs && (URL === imgs.imgSRC || URL === imgs.imgBG)) break;
            
            const sieve = this.#settings.get('sieve');
            for (i = 0; (rule = sieve[i]); ++i) {
                 if (!(rule.link && rule.link.test(URL))) {
                    if (!rule.img) continue;
                    tmp_el = rule.img.test(URL);
                    if (tmp_el) use_img = true;
 else continue;
                }
                if (rule.useimg && rule.img) {
                    if (!imgs) imgs = this.getImages(trg);
                    if (imgs) {
                         if (imgs.imgSRC && rule.img.test(imgs.imgSRC)) {
                             use_img = [i, false];
                            break;
                        }
                        if (imgs.imgBG) {
                             use_img = rule.img.test(imgs.imgBG);
                            if (use_img) {
                                 use_img = [i, use_img];
                                break;
                            }
                        }
                     }
                }
                if (rule.res && (!tmp_el || (!rule.to && rule.url))) {
                     if (this.#win.location.href.replace(rgxHash, "") === n.href.replace(rgxHash, "")) break;
                    if (this.#toFunction(rule, "url", true) === false) return { error: 1 };
                    if (typeof rule.url === "function") this.#node = trg;
                    ret = rule.url ? URL.replace(rule[tmp_el ? "img" : "link"], rule.url) : URL;
                    
                    // Needs async resolve
                    return {
                        needsResolve: true,
                         url: httpPrepend(ret || URL, n.href.slice(0, n.href.length - URL.length), this.#pageProtocol),
                         resolveParams: {
                            rule: { id: i },
                             $: [n.href].concat((URL.match(rule[tmp_el ? "img" : "link"]) || []).slice(1)),
                            loop_param: tmp_el ? "img" : "link",
                            skip_resolve: ret === "",
                         },
                        attrModNode: attrModNode
                     };
                } else ret = this.#replace(rule, URL, n.href, tmp_el ? "img" : "link", trg);
                
                if (ret === 1) return { error: 1 };
                else if (ret === 2) ret = false;
                if (
                     typeof ret === "string" &&
                    n !== trg &&
                     trg.attributes.src?.value?.replace(/^https?:\/\//, "") === ret.replace(/^#?(https?:)?\/\//, "")
                )
                    ret = false;
                break;
            }
             break;
        } while (++i < 5 && (n = n.parentNode));
        
        if (!ret && ret !== null) {
            imgs = this.getImages(trg) || imgs;
            if (imgs && (imgs.imgSRC || imgs.imgBG)) {
                 if (typeof use_img === "object") {
                    i = use_img[0];
                    use_img[0] = true;
                } else {
                     i = 0;
                    use_img = [];
                }
                const sieve = this.#settings.get('sieve');
                for (; (rule = sieve[i]); ++i)
                     if (
                        use_img[0] ||
                         (rule.img && ((imgs.imgSRC && rule.img.test(imgs.imgSRC)) || (imgs.imgBG && (use_img[1] = rule.img.test(imgs.imgBG)))))
                    ) {
                         if (!use_img[1] && imgs.imgSRC) {
                             use_img = 1;
                            URL = imgs.imgSRC;
                            imgs = imgs.imgSRC_o;
                        } else {
                            use_img = 2;
                            URL = imgs.imgBG;
 imgs = imgs.imgBG_o;
                        }
                        if (!rule.to && rule.res && rule.url) {
                             if (this.#toFunction(rule, "url", true) === false) return { error: 1 };
                            if (typeof rule.url === "function") this.#node = trg;
                            ret = URL.replace(rule.img, rule.url);
                            
                            // Needs async resolve
                             return {
                                needsResolve: true,
                                 url: httpPrepend(ret, imgs.slice(0, imgs.length - URL.length), this.#pageProtocol),
                                 resolveParams: { 
                                     rule: { id: i }, 
                                    $: [imgs].concat((URL.match(rule.img) || []).slice(1)), 
                                    loop_param: "img", 
                                     skip_resolve: ret === "" 
                                 },
                                target: trg.IMGS_TRG || trg,
                                 attrModNode: attrModNode
                             };
                        } else ret = this.#replace(rule, URL, imgs, "img", trg);
                        
                        if (ret === 1) return { error: 1 };
                        else if (ret === 2) return null; // Was false, means no match
                         if (trg.nodeType === 1) {
                            attrModNode = trg;
                            if (this.#settings.get('hz.history')) trg.IMGS_nohistory = true;
                        }
                        break;
                    }
            }
        }
         
        if (rule && rule.loop && typeof ret === "string" && rule.loop & (use_img ? 2 : 1)) {
            if ((trg.nodeType !== 1 && ret === trg.href) || trg.IMGS_loop_count > 5) return null;
            rule = ret;
            // Recurse
            ret = this.find({ href: ret, IMGS_TRG: trg.IMGS_TRG || trg, IMGS_loop_count: 1 + (trg.IMGS_loop_count || 0) });
            
            // Handle recursive result
             if (ret && ret.urls) { // Success
                ret.urls = Array.isArray(ret.urls) ? ret.urls.concat(rule) : [ret.urls, rule];
                return ret;
            } else if (ret === null) { // Async
                 ret = rule; // Fallback to current rule
            } else { // No match or error
                 ret = rule;
            }
        }
        
        if (tmp_el === true) trg.IMGS_fallback_zoom = n.href;
        
        if (ret && (typeof ret === "string" || Array.isArray(ret))) {
             URL = /^https?:\/\//;
            URL = [
                n && n.href && n.href.replace(URL, ""),
                trg.nodeType === 1 && trg.src && trg.hasAttribute("src") && (trg.currentSrc || trg.src).replace(URL, ""),
            ];
            if (typeof ret === "string") ret = [ret];
            for (i = 0; i < ret.length; ++i) {
                 var url = ret[i].replace(/^#?(https?:)?\/\//, "");
                if (URL[1] === url) {
                    if (ret[i][0] === "#") {
                         use_img = ret = false;
                        break;
                    }
                } else if (URL[0] === url) continue;
                if (tmp_el === true) tmp_el = 1;
                else if (tmp_el === 1) ret.splice(i--, 1);
            }
            if (!ret.length)
                if (trg.IMGS_fallback_zoom) {
                     ret = trg.IMGS_fallback_zoom;
                    delete trg.IMGS_fallback_zoom;
                } else ret = false;
            else if (ret.length === 1) ret = ret[0][0] === "#" ? ret[0].slice(1) : ret[0];
        }
        
        if (trg.nodeType !== 1) {
            return ret ? { urls: ret, attrModNode: attrModNode } : null;
        }

        imgFallbackCheck: if (trg.localName === "img" && trg.hasAttribute("src")) {
             if (ret)
                if (ret === (trg.currentSrc || trg.src) && (!n || !n.href || n !== trg)) use_img = ret = false;
                else if (typeof use_img === "number") use_img = 3;
            if (this.#rgxIsSVG.test(trg.currentSrc || trg.src)) break imgFallbackCheck;
            if (trg.parentNode.localName === "picture") tmp_el = trg.parentNode.querySelectorAll("[srcset]");
            else if (trg.hasAttribute("srcset")) tmp_el = [trg];
            else tmp_el = [];
            
            rule = { naturalWidth: trg.naturalWidth, naturalHeight: trg.naturalHeight, src: null };
            for (i = 0; i < tmp_el.length; ++i) {
                 URL = tmp_el[i]
                    .getAttribute("srcset")
                    .trim()
                     .split(/,\s+/);
                var j = URL.length;
                while (j--) {
                    var srcItem = URL[j].trim().split(/\s+/);
                    if (srcItem.length !== 2) continue;
 var descriptor = srcItem[1].slice(-1);
                    if (descriptor === "x") srcItem[1] = trg.naturalWidth * srcItem[1].slice(0, -1);
                    else if (descriptor === "w") srcItem[1] = parseInt(srcItem[1], 10);
                    else continue;
                    if (srcItem[1] > rule.naturalWidth) {
                         rule.naturalWidth = srcItem[1];
                        this.#HLP.href = srcItem[0];
                        rule.src = this.#HLP.href;
                    }
                }
            }
             if (rule.src) rule.naturalHeight *= rule.naturalWidth / trg.naturalWidth;
            if (rule.src && this.isEnlargeable(trg, rule)) rule = rule.src;
            else if (this.isEnlargeable(trg)) rule = trg.currentSrc || trg.src;
            else rule = null;
            
            var oParent = trg;
            i = 0;
            do {
                 if (oParent === this.#doc.body || oParent.nodeType !== 1) break;
                tmp_el = this.#win.getComputedStyle(oParent);
                if (tmp_el.position === "fixed") break;
                if (i === 0) continue;
                if (tmp_el.overflowY === "visible" && tmp_el.overflowX === "visible") continue;
                switch (tmp_el.display) {
                     case "block": case "inline-block": case "flex":
                    case "inline-flex": case "list-item": case "table-caption":
                         break;
                    default:
                        continue;
                }
                 if (rule) {
                    if (typeof rule !== "string") rule = null;
                    trg.IMGS_overflowParent = oParent;
                    break;
                }
                 if (oParent.offsetWidth <= 32 || oParent.offsetHeight <= 32) continue;
                if (!this.isEnlargeable(oParent, trg, true)) continue;
                rule = trg.currentSrc || trg.src;
                trg.IMGS_fallback_zoom = trg.IMGS_fallback_zoom ? [trg.IMGS_fallback_zoom, rule] : rule;
                break;
            } while (++i < 5 && (oParent = oParent.parentNode));
            
            if (!rule) break imgFallbackCheck;
            attrModNode = trg;
            if (typeof ret === "object") { // Array
                if (trg.IMGS_fallback_zoom !== rule) trg.IMGS_fallback_zoom = trg.IMGS_fallback_zoom ? [trg.IMGS_fallback_zoom, rule] : rule;
            } else if (ret) {
                 if (ret !== rule) ret = [ret, rule];
            } else {
                ret = rule;
                if (this.#settings.get('hz.history')) trg.IMGS_nohistory = true;
            }
        }
         
        if (!ret && ret !== null) {
            // No match
            return null;
        }
         
        if (use_img && imgs) {
            if (use_img === 2) trg.IMGS_thumb_ok = true;
            trg.IMGS_thumb = imgs;
        } else if (use_img === 3) trg.IMGS_thumb = true;
        
        tmp_el = n && n.href ? (n.textContent || "").trim() : null;
        if (tmp_el === n.href) tmp_el = null;
        i = 0;
        n = trg;
        do {
            if (n.IMGS_caption || (n.title && (!trg.hasAttribute("src") || trg.src !== n.title))) trg.IMGS_caption = n.IMGS_caption || n.title;
            if (i === 0 && !this.#settings.get('hz.capNoSBar')) trg.title = "";
            if (trg.IMGS_caption) break;
        } while (++i <= 5 && (n = n.parentNode) && n.nodeType === 1);
        
        if (!trg.IMGS_caption)
            if (trg.alt && trg.alt !== trg.src && trg.alt !== imgs) trg.IMGS_caption = trg.alt;
            else if (tmp_el && this.#settings.get('hz.capLinkText')) trg.IMGS_caption = tmp_el;
        
        if (trg.IMGS_caption)
            if ((!this.#settings.get('hz.capLinkText') && trg.IMGS_caption === tmp_el) || trg.IMGS_caption === trg.href) delete trg.IMGS_caption;
            // else PVI.prepareCaption(trg, trg.IMGS_caption); // This is now done in PopupController

        // Success
         return {
            urls: ret,
            caption: trg.IMGS_caption,
            thumb: trg.IMGS_thumb,
             thumbOk: trg.IMGS_thumb_ok,
            album: trg.IMGS_album,
            nohistory: trg.IMGS_nohistory,
            fallback: trg.IMGS_fallback_zoom,
             attrModNode: attrModNode
        };
    }

    // --- ================================= ---
    // --- Public Find Helpers               ---
    // --- (Ported from PVI object)          ---
    // --- ================================= ---

    /**
     * Checks for image sources on various node types.
     * @param {Node} node
     * @returns {string|null}
     */
    checkIMG(node) {
        const nname = node.nodeName.toUpperCase();
        if (nname === "IMG" || node.type === "image" || nname === "EMBED") return node.src;
        if (nname === "CANVAS") return node.toDataURL();
        if (nname === "OBJECT" && node.data) return node.data;
        if (nname === "AREA") {
            const img = this.#doc.querySelector('img[usemap="#' + node.parentNode.name + '"]');
            return img ? img.src : null;
        }
        if (nname === "VIDEO") {
             const canvas = this.#doc.createElement("canvas");
            canvas.width = node.clientWidth;
            canvas.height = node.clientHeight;
            canvas.getContext("2d").drawImage(node, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg");
        }
        if (node.poster) return node.poster;
        return null;
    }

    /**
     * Extracts background image URLs from a style string.
     * @param {string} imgs
     * @returns {string[]|null}
     */
    checkBG(imgs) {
        if (imgs) {
            const matches = imgs.match(/\burl\(([^'"\)][^\)]*|"[^"\\]+(?:\\.[^"\\]*)*|'[^'\\]+(?:\\.[^'\\]*)*)(?=['"]?\))/g);
            if (Array.isArray(matches)) {
                let i = matches.length;
                 while (i--) {
                    matches[i] = matches[i].slice(/'|"/.test(matches[i][4]) ? 5 : 4);
                }
                return matches;
            }
         }
        return null;
    }

    /**
     * Gets image sources (src or background) from an element.
     * @param {HTMLElement} el
     * @returns {object|null}
     */
    getImages(el) {
        let imgs, p;
        const isHTMLElement = el && el instanceof this.#win.HTMLElement;
        if (isHTMLElement)
            if (el.childElementCount > 0 && el.childElementCount < 3) {
                 imgs = el.firstElementChild;
                if (imgs.childElementCount && imgs.childElementCount < 4)
                    if (imgs.firstElementChild.localName === "img") imgs = imgs.firstElementChild;
                    else if (imgs.lastElementChild.localName === "img") imgs = imgs.lastElementChild;
                if (imgs.src && !/\S/.test(el.textContent) && el.offsetWidth - imgs.offsetWidth < 25 && el.offsetHeight - imgs.offsetHeight < 25) el = imgs;
            } else if (
                !el.childElementCount &&
                 el.parentNode.childElementCount <= 5 &&
                (el.localName === "img"
                     ? el.src.lastIndexOf("data:", 0) === 0 || el.naturalWidth < 3 || el.naturalHeight < 3 || el.style.opacity === "0"
                    : !/\S/.test(el.textContent)) &&
                 el.style.backgroundImage[0] !== "u"
            ) {
                p = el.previousElementSibling;
                [p && p.previousElementSibling, p, el.nextElementSibling].some((sib) => {
                     if (
                        sib &&
                         sib.localName === "img" &&
                        sib.offsetParent === el.offsetParent &&
                         Math.abs(sib.offsetLeft - el.offsetLeft) <= 10 &&
                        Math.abs(sib.offsetTop - el.offsetTop) <= 10 &&
                        Math.abs(sib.clientWidth - el.clientWidth) <= 30 &&
                         Math.abs(sib.clientHeight - el.clientHeight) <= 30
                    ) {
                         el = sib;
                        return true;
                     }
                });
            }

        imgs = { imgSRC_o: el.currentSrc || el.src || el.data || null };
        if (!imgs.imgSRC_o && el.localName === "image") {
             imgs.imgSRC_o = el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
            if (imgs.imgSRC_o) imgs.imgSRC_o = normalizeURL(imgs.imgSRC_o, this.#HLP, this.#pageProtocol);
            else delete imgs.imgSRC_o;
        }
        if (imgs.imgSRC_o) {
            if (!isHTMLElement) imgs.imgSRC_o = normalizeURL(imgs.imgSRC_o, this.#HLP, this.#pageProtocol);
 else if ((el.naturalWidth > 0 && el.naturalWidth < 3) || (el.naturalHeight > 0 && el.naturalHeight < 3)) imgs.imgSRC_o = null;
            if (imgs.imgSRC_o) imgs.imgSRC = imgs.imgSRC_o.replace(rgxHTTPs, "");
        }
        if (!isHTMLElement) return imgs.imgSRC ? imgs : null;
        if (el.style.backgroundImage[0] === "u") imgs.imgBG_o = el.style.backgroundImage;
        else if (el.parentNode) {
            p = el.parentNode;
            if (p.offsetParent === el.offsetParent && p.style && p.style.backgroundImage[0] === "u")
                if (
                     Math.abs(p.offsetLeft - el.offsetLeft) <= 10 &&
                    Math.abs(p.offsetTop - el.offsetTop) <= 10 &&
                     Math.abs(p.clientWidth - el.clientWidth) <= 30 &&
                    Math.abs(p.clientHeight - el.clientHeight) <= 30
                 )
                    imgs.imgBG_o = p.style.backgroundImage;
        }
        if (!imgs.imgBG_o) return imgs.imgSRC ? imgs : null;
        imgs.imgBG_o = imgs.imgBG_o.match(/\burl\(([^'"\)][^\)]*|"[^"\\]+(?:\\.[^"\\]*)*|'[^'\\]+(?:\\.[^'\\]*)*)(?=['"]?\))/g);
         if (!imgs.imgBG_o || imgs.imgBG_o.length !== 1) return imgs.imgSRC ? imgs : null;
        el = imgs.imgBG_o[0];
        imgs.imgBG_o = normalizeURL(el.slice(/'|"/.test(el[4]) ? 5 : 4), this.#HLP, this.#pageProtocol);
        imgs.imgBG = imgs.imgBG_o.replace(rgxHTTPs, "");
        return imgs;
    }

    /**
     * Checks if an image is larger than its displayed size.
     * @param {HTMLElement} img - The displayed image element.
     * @param {HTMLImageElement} oImg - The loaded image object (optional).
     * @param {boolean} isOverflow - Check for overflow parent.
     * @returns {boolean}
     */
    isEnlargeable(img, oImg, isOverflow) {
        if (!oImg) oImg = img;
        var w = img.clientWidth;
        var h = img.clientHeight;
        var ow = oImg.naturalWidth;
        var oh = oImg.naturalHeight;
        if ((ow <= 64 && oh <= 64 && !isOverflow) || ow <= 1 || oh <= 1) return false;
        if (isOverflow) {
            w = img.getBoundingClientRect();
            ow = oImg.getBoundingClientRect();
            if (ow.right - 10 > w.right || ow.bottom - 10 > w.bottom || ow.left + 10 < w.left || ow.top + 10 < w.top) return true;
            return false;
        }
        if (img === oImg) {
            if (ow < 600 && oh < 600 && Math.abs(ow / 2 - (img.width || w)) < 8 && Math.abs(oh / 2 - (img.height || h)) < 8) return false;
        } else if (/^[^?#]+\.(?:gif|apng)(?:$|[?#])/.test(oImg.src)) return true;
        
        if ((w >= ow || h >= oh) && Math.abs(ow / oh - w / h) <= 0.2) return false;
        
        const zoomResized = this.#settings.get('hz.zoomresized');
        return (w < this.#topWinW * 0.9 && 100 - (w * 100) / ow >= zoomResized) || (h < this.#topWinH * 0.9 && 100 - (h * 100) / oh >= zoomResized);
    }


    // --- ================================= ---
    // --- Private Sieve Rule Helpers        ---
    // --- (Ported from PVI object)          ---
    // --- ================================= ---

    /**
     * Compiles a Sieve rule string into a function.
     * SECURITY: This uses `new Function`.
     */
    #toFunction(rule, param, inline) {
        if (typeof rule[param] === "function") return true;
        
        const code = rule[param];
        const prefix = inline ? /^:\s*\S/ : /^:\n\s*\S/;
        
        if (prefix.test(code)) {
            try {
                 rule[param] = Function("var $ = arguments; " + (inline ? "return " : "") + code.slice(1)).bind(this);
            } catch (ex) {
                 console.error(`${this.#settings.get('app.name')}: ${param} - ${ex.message}`);
                return false;
            }
        }
        return true;
    }

    /**
     * The core replacement logic for Sieve rules.
     */
    #_replace(rule, addr, http, param, to, trg) {
        let ret, i;
        if (typeof to === "function") this.#node = trg;
        var r = to ? addr.replace(rule[param], to) : addr;
        if (typeof to === "function") {
            if (r === "") return 2;
            else if (r === "null") return null;
            if (r.indexOf("\n", 7) > -1) {
                var prefixSuffix = addr.replace(rule[param], "\r").split("\r");
                r = r.trim().split(/[\n\r]+/g);
                ret = [];
                for (i = 0; i < r.length; ++i) {
                     if (i > 0) r[i] = prefixSuffix[0] + r[i];
                    if (i !== r.length - 1) r[i] += prefixSuffix[1];
                    r[i] = this.#_replace(rule, r[i], http, param, "", trg);
                    if (Array.isArray(r[i])) ret = ret.concat(r[i]);
 else ret.push(r[i]);
                }
                return ret.length > 1 ? ret : ret[0];
            }
        }
        if (rule.dc && ((param === "link" && rule.dc !== 2) || (param === "img" && rule.dc > 1))) r = decodeURIComponent(decodeURIComponent(r));
        if (to[0] === "#" && r[0] !== "#") r = "#" + r.replace("#", "");
        r = httpPrepend(r, http, this.#pageProtocol);
        ret = r.indexOf("#", 1);
        if (ret > 1 && (ret = [ret, r.indexOf("#", ret + 1)])[1] > 1) {
            ret = r.slice(ret[0], ret[1] + 1);
            r = r.split(ret).join("#");
            ret = ret.slice(1, -1).split(/ |%20/);
        } else ret = false;
        if (ret) {
            if (r[0] === "#") {
                 r = r.slice(1);
                addr = "#";
            } else addr = "";
            for (i = 0; i < ret.length; ++i) ret[i] = addr + r.replace("#", ret[i]);
            r = ret.length > 1 ? ret : ret[0];
        }
         return r;
    }

    /**
     * Applies a Sieve rule to an address.
     */
    #replace(rule, addr, http, param, trg) {
        let ret, i, j;
        if (this.#toFunction(rule, "to") === false) return 1;
        if (trg.IMGS_TRG) trg = trg.IMGS_TRG;
        http = http.slice(0, http.length - addr.length);
        if (Array.isArray(rule.to)) {
            ret = [];
            for (i = 0; i < rule.to.length; ++i) {
                 j = this.#_replace(rule, addr, http, param, rule.to[i], trg);
                if (Array.isArray(j)) ret = ret.concat(j);
                else ret.push(j);
            }
        } else if (rule.to) ret = this.#_replace(rule, addr, http, param, rule.to, trg);
        else ret = httpPrepend(addr, http, this.#pageProtocol);
        return ret;
    }
}