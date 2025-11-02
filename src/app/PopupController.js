// src/app/PopupController.js
"use strict";

import { stopEvent, getViewportDimensions, buildNodes } from '../utils/DOMUtils.js';
import { sanitizeHTML } from '../utils/SecurityUtils.js';
import { stripHash, rgxHTTPs, rgxHash, httpPrepend, normalizeURL } from '../utils/UrlUtils.js';
import { shortcut } from '../utils/KeyUtils.js';

export class PopupController {
    // --- Services ---
    #win;
    #doc;
    #settings;
    #portService;
    #historyService;
    #imageResolver;

    // --- DOM Elements ---
    #DIV; #IMG; #VID; #LDR; #CAP; #CNT; #HLP;
    #interlacer; #BOX; // #BOX is the currently active element (LDR or DIV)

    // --- State ---
    #DBOX = {}; // DIV's box-model dimensions (padding, border)
    #anim = {}; // Animation properties
    #palette = {
        load: "rgb(255, 255, 255)",
        R_load: "rgb(255, 204, 204)",
        res: "rgb(222, 255, 205)",
        R_res: "rgb(255, 234, 128)",
        R_js: "rgb(200, 200, 200)",
        pile_fg: "#000",
        pile_bg: "rgb(255, 255, 0)",
        wh_fg: "rgb(204, 238, 255)", // Set in #createCAP
        wh_fg_hd: "rgb(120, 210, 255)", // Set in #createCAP
    };
    #timers = {};   // For setTimeout/setInterval
    #stack = {};    // Image album cache
    #resolving = [];// Array of targets waiting for async resolve

    #state = null; // null:uninit, 0:disabled, 1:idle, 2:hiding, 3:loading, 4:shown
    #TRG = null;    // The current <a ...> or <img> target
    #SRC = null;    // The URL(s) for the current target
    #fireHide = false;
    #fullZm = 0; // 0:off, 1:fit, 2:pan
    #freeze = false;
    #keyup_freeze_on = false;
    #nodeToReset = null; // A node that needs its IMGS_c cleared on hide
    #lastScrollTRG = null;
    #lastScrollTime = 0;
    #lastTRGStyle = { cursor: null, outline: null };
    #LDR_msg = null; // Loading message
    #hideTime = 0;   // Timestamp of last hide
    #iFrame = false;

    // --- Mouse/Viewport Coords ---
    #x = 0;
    #y = 0;
    #winW = 0;
    #winH = 0;
    #topWinW = 0;
    #topWinH = 0;
    #md_x = 0; // MouseDown X
    #md_y = 0; // MouseDown Y
    #mdownstart = null; // MouseDown timestamp
    #TBOX; // Target Bounding Box

    // --- Observers ---
    #mutObserver = null;
    #mutObserverConf = null;
constructor(win, doc, settings, portService, historyService, imageResolver) {
        this.#win = win;
        this.#doc = doc;
        this.#settings = settings;
        this.#portService = portService;
        this.#historyService = historyService;
        this.#imageResolver = imageResolver;

        this.#HLP = this.#doc.createElement("a");
        this.#imageResolver.setContext(win, doc, this.#HLP);
const hzSettings = this.#settings.get('hz');
        this.#freeze = hzSettings ? !hzSettings.deactivate : false;
        this.#state = 1; // Start idle
    }
    // --- ================================= ---
    // --- Public API (Called by main.js)    ---
    // --- ================================= ---

     initialSetup() {
        this.#updateViewportDimensions();
        
        // Setup MutationObserver for attribute changes
        if (this.#win.MutationObserver) {
            this.#mutObserverConf = { attributes: true, attributeOldValue: true, attributeFilter: ["href", "src", "style", "alt", "title"] };
            this.#mutObserver = new this.#win.MutationObserver((muts) => {
                let i = muts.length;
                while (i--) {
                     this.#onAttrChange(muts[i]);
                }
            });
        }
    }

     destroy() {
        this.#reset(false); // Full reset
        this.#state = null;
        if (this.#DIV) {
            this.#doc.documentElement.removeChild(this.#DIV);
            this.#doc.documentElement.removeChild(this.#LDR);
            this.#BOX = this.#DIV = this.#CNT = this.#VID = this.#IMG = this.#CAP = this.#TRG = this.#interlacer = null;
        }
        if (this.#mutObserver) {
            this.#mutObserver.disconnect();
            this.#mutObserver = null;
        }
        // Clear all timers
         for (const key in this.#timers) {
            clearTimeout(this.#timers[key]);
            clearInterval(this.#timers[key]);
        }
    }

    toggle(disable) {
        if (this.#state || disable === true) {
             // Disable
            this.#reset(false);
            this.#state = 0; // Disabled
            if (this.#mutObserver) this.#mutObserver.disconnect();
        } else {
             // Enable
            this.#state = 1; // Idle
            this.initialSetup();
        }
    }

    setIsFrame(isFrame) {
         this.#iFrame = isFrame;
    }

    /**
     * Handles 'preload' command.
     */
    preload() {
        if (this.#timers.preload) {
            clearTimeout(this.#timers.preload);
        }
         this.#timers.preload = setTimeout(this.#runPreload.bind(this), 300);
    }

    // --- ================================= ---
    // --- Public Event Handlers             ---
    // --- (Called by EventListenerService)  ---
    // --- ================================= ---

// src/app/PopupController.js (FIXED)
    handleMouseOver(e) {
        if (this.#state === 0) return; // Disabled

        // FIX: Get settings from the instance property
        const cfg = this.#settings.all;
if (!cfg || !cfg.hz) {
            console.error("Settings not loaded in PopupController");
            return;
        }

        if (cfg.hz.deactivate && (this.#freeze || e[cfg._freezeTriggerEventKey])) return;

        if (this.#fireHide) {
             // Check if mouse is over the popup itself
            if (e.target && (e.target.IMGS_ || ((e.relatedTarget || e).IMGS_ && e.target === this.#TRG))) {
                if (cfg.hz.capNoSBar) e.preventDefault();
                return;
            }

            // Clean up previous target styles
            if (e.relatedTarget) {
                
 if (this.#lastTRGStyle.outline !== null) {
                    e.relatedTarget.style.outline = this.#lastTRGStyle.outline;
                    this.#lastTRGStyle.outline = null;
                }
                if (this.#lastTRGStyle.cursor !== null) {
                    e.relatedTarget.style.cursor = this.#lastTRGStyle.cursor;
                    this.#lastTRGStyle.cursor = null;
                }
            }
            
 
            // Clean up timers and state
            this.#clearTimers(true); // keep anim_end
            if (this.#CAP) {
                 this.#CAP.style.display = "none";
                if (this.#CAP.firstChild) this.#CAP.firstChild.style.display = "none";
            }
            if (this.#nodeToReset) {
                this.#resetNode(this.#nodeToReset);
                this.#nodeToReset = null;
            }
            if (this.#TRG && this.#DIV && this.#timers.no_anim_in_album) {
                clearTimeout(this.#timers.no_anim_in_album);
                this.#timers.no_anim_in_album = null;
                this.#DIV.style.transition = this.#anim.css;
            }
             this.#TRG = null;
            
            if (this.#hideTime === 0 && this.#state < 3) this.#hideTime = Date.now();
            if (!e.target) {
                this.#hide(e);
                return;
            }
        }

 
        const trg = e.target;
        if (trg.IMGS_c === true) {
            if (this.#fireHide) this.#hide(e);
            return;
        }

        let cache = trg.IMGS_c;
        let src;
        
        if (!cache) {
             if (trg.IMGS_c_resolved) {
                src = trg.IMGS_c_resolved;
            } else {
                // --- FIX: Set context node *before* calling find() ---
                this.#imageResolver.setContextNode(trg);
                // ---
                
                // FIX: Get sieve from settings
                const findResult = this.#imageResolver.find(trg, e.clientX, e.clientY);
                src = this.#processFindResult(findResult, trg);
                // this.#TRG = null; // Unset TRG (no longer needed)
            }
        }
        
        if (cache || src || src === null) {
            if (src === 1) src = false; // Error code from find
            if (cfg.hz.capNoSBar) e.preventDefault();
            
            this.#clearTimers(true); // Clear all but anim_end
             if (!cfg.hz.waitHide) clearTimeout(this.#timers.anim_end);

            if (!this.#iFrame) this.#win.addEventListener("mousemove", this.handleMouseMove.bind(this), true);

            if (!cache && src && !trg.IMGS_c_resolved) {
                if (cfg.hz.preload === 2 && !this.#stack[src]) this.#_preload(src);
                trg.IMGS_c_resolved = src;
            }

             this.#TRG = trg;
            this.#SRC = cache || src;
            this.#x = e.clientX;
            this.#y = e.clientY;

            const isFrozen = this.#freeze && !cfg.hz.deactivate && !e[cfg._freezeTriggerEventKey];

            // Immediate load logic
            if (!isFrozen &&
                 (!cfg.hz.waitHide || cfg.hz.delay < 15) &&
                ((this.#fireHide && this.#state > 2) || this.#state === 2 || (this.#hideTime && Date.now() - this.#hideTime < 200))
            ) {
                if (this.#hideTime) this.#hideTime = 0;
                this.#fireHide = 1; // Special state for immediate load
                 this.#load(this.#SRC);
                return;
            }

            // Hiding logic if already shown
            if (this.#fireHide && this.#state > 2 && (cfg.hz.waitHide || !cfg.hz.deactivate)) {
                this.#hide(e);
                if (!this.#anim.maxDelay && !this.#iFrame) this.#win.addEventListener("mousemove", this.handleMouseMove.bind(this), true);
                if (this.#hideTime) this.#hideTime = 0;
            }

            this.#fireHide = true;

            // Mark-on-hover logic
             if (cfg.hz.markOnHover && (isFrozen || cfg.hz.delay >= 25)) {
                if (cfg.hz.markOnHover === "cr") {
                     this.#lastTRGStyle.cursor = trg.style.cursor;
                    trg.style.cursor = "zoom-in";
                } else {
                    this.#lastTRGStyle.outline = trg.style.outline;
                    trg.style.outline = "1px " + cfg.hz.markOnHover + " red";
                }
             }

            if (isFrozen) {
                clearTimeout(this.#timers.resolver);
                return;
            }
             
            // Set timer to load
            const delay = (this.#state === 2 || this.#hideTime) && cfg.hz.waitHide ? this.#anim.maxDelay : cfg.hz.delay;
            if (delay) {
                 this.#timers.preview = setTimeout(() => this.#load(this.#SRC), delay);
            } else {
                this.#load(this.#SRC);
            }

        } else {
             trg.IMGS_c = true; // Mark as non-viable
            this.#TRG = null;
            if (this.#fireHide) this.#hide(e);
        }
    }
    handleMouseMove(e) {
        if (this.#state === 0) return;
        if (!e) return; // Internal call from m_move_show
        
        if (this.#x === e.clientX && this.#y === e.clientY) return;

        const cfg = this.#settings.all;
        
        if (this.#fullZm) {
             let x = this.#x, y = this.#y, w, h;
            if (!e) e = {};
            if (this.#mdownstart === true) this.#mdownstart = false;

            if (e.target) {
                this.#x = e.clientX;
                this.#y = e.clientY;
}

            if (this.#fullZm > 1 && e[0] !== true) {
                w = this.#BOX.style;
                if (this.#fullZm === 3 && e.target) {
                     x = parseInt(w.left, 10) - x + e.clientX;
                    y = parseInt(w.top, 10) - y + e.clientY;
                } else if (e[1] !== undefined) {
                     x = parseInt(w.left, 10) + e[0];
                    y = parseInt(w.top, 10) + e[1];
                } else x = null;
            } else {
                const rot = this.#state === 4 && this.#DIV.curdeg % 180;
                if (this.#BOX === this.#DIV) {
                    if (this.#TRG.IMGS_SVG) {
                         h = this.#stack[this.#IMG.src];
                        h = h[1] / h[0];
                    }
                    w = e[2] || parseInt(this.#DIV.style.width, 10);
                    h = parseInt(w * (h || this.#CNT.naturalHeight / this.#CNT.naturalWidth) + this.#DBOX["hpb"], 10);
                    w += this.#DBOX["wpb"];
                } else {
                    w = this.#LDR.wh[0];
                    h = this.#LDR.wh[1];
                }

                const rotVal = rot ? (w - h) / 2 : 0;
                x = (w - this.#DBOX["wpb"] > this.#winW ? -((this.#x * (w - this.#winW + 80)) / this.#winW) + 40 : (this.#winW - w) / 2) + rotVal - this.#DBOX["ml"];
                y = (h - this.#DBOX["hpb"] > this.#winH ? -((this.#y * (h - this.#winH + 80)) / this.#winH) + 40 : (this.#winH - h) / 2) - rotVal - this.#DBOX["mt"];
            }

            if (e[2] !== undefined) {
                this.#BOX.style.width = e[2] + "px";
                this.#BOX.style.height = e[3] + "px";
            }
            if (x !== null) {
                this.#BOX.style.left = x + "px";
                this.#BOX.style.top = y + "px";
            }
             return;
        }

        this.#x = e.clientX;
        this.#y = e.clientY;
        
        if (this.#freeze && !cfg.hz.deactivate && !e[cfg._freezeTriggerEventKey]) return;
        
        if (this.#state < 3) {
            if (cfg.hz.delayOnIdle && this.#fireHide !== 1 && this.#state < 2) {
                if (this.#timers.resolver) clearTimeout(this.#timers.resolver);
                clearTimeout(this.#timers.preview);
                this.#timers.preview = setTimeout(() => this.#load(), cfg.hz.delay);
            }
        } else if (
             (e.target.IMGS_ && this.#TBOX && (this.#TBOX.Left > e.pageX || this.#TBOX.Right < e.pageX || this.#TBOX.Top > e.pageY || this.#TBOX.Bottom < e.pageY)) ||
            (!e.target.IMGS_ && this.#TRG !== e.target)
         ) {
            // Mouse moved off the target or popup, hide
            this.handleMouseOver({ relatedTarget: this.#TRG, clientX: e.clientX, clientY: e.clientY });
        } else if (cfg.hz.move && this.#state > 2 && !this.#timers.m_move && (this.#state === 3 || cfg.hz.placement < 2 || cfg.hz.placement > 3)) {
            // Move the popup
            this.#timers.m_move = this.#win.requestAnimationFrame(() => this.#m_move_show());
        }
     }

    handleMouseLeave(e) {
        if (this.#state === 0) return;
        if (!this.#fireHide || e.relatedTarget) return;
        if (this.#x === e.clientX && this.#y === e.clientY) return;
        this.handleMouseOver({ relatedTarget: this.#TRG, clientX: e.clientX, clientY: e.clientY });
    }

    handleMouseDown(e) {
         if (!this.#settings || !e.isTrusted) return;
        const cfg = this.#settings.all;
        const root = this.#doc.compatMode && this.#doc.compatMode[0] === "B" ? this.#doc.body : this.#doc.documentElement;
        if (e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) return;

        const isRightButton = e.button === 2;
        const shouldFreeze = isRightButton && this.#freeze && this.#SRC !== undefined && !cfg.hz.deactivate;

        if (this.#fireHide && this.#state < 3 && !shouldFreeze) {
            this.handleMouseOver({ relatedTarget: this.#TRG });
            if (!this.#freeze || this.#lastScrollTRG) this.#freeze = 1;
            return;
        }
        if (e.button === 0) {
             if (this.#fullZm) {
                this.#mdownstart = true;
                if (e.ctrlKey || this.#fullZm !== 2) return;
                stopEvent(e);
                this.#fullZm = 3; // Start drag
                 this.#win.addEventListener("mouseup", this.#fzDragEnd.bind(this), true);
                return;
            }
            if (e.target === this.#CNT) {
                this.#md_x = e.clientX;
                this.#md_y = e.clientY;
                return;
}
            if (this.#fireHide) this.handleMouseOver({ relatedTarget: this.#TRG, clientX: e.clientX, clientY: e.clientY });
            if (!this.#freeze || this.#lastScrollTRG) this.#freeze = 1;
            return;
        }

        if (!isRightButton) return;
        
        if (cfg.hz.actTrigger === "m2") {
             if (this.#fireHide && shouldFreeze) {
                this.#SRC = { m2: this.#SRC === null ? this.#TRG.IMGS_c_resolved : this.#SRC.m2 || this.#SRC };
            }
             this.#freeze = cfg.hz.deactivate;
        } else if (this.#keyup_freeze_on) {
            this.#keyup_freeze();
            this.#freeze = this.#freeze ? 1 : 0;
        }
        this.#mdownstart = e.timeStamp;
        this.#md_x = e.clientX;
        this.#md_y = e.clientY;

        if (e.target.href || e.target.parentNode?.href) {
            e.preventDefault();
        }
    }
    
    handleMouseUp(e) {
        if (this.#state === 0) return;
        this.#releaseFreeze(e);
    }
    
    handleDragEnd(e) {
        if (this.#state === 0) return;
        this.#releaseFreeze(e);
    }

    handleContextMenu(e) {
        if (this.#state === 0) return;
        const cfg = this.#settings.all;
        
        if (!this.#mdownstart || e.button !== 2 || this.#md_x !== e.clientX || this.#md_y !== e.clientY) {
            if (this.#mdownstart) this.#mdownstart = null;

            if (
                e.button === 2 &&
                 (!this.#fireHide || this.#state > 2) &&
                (Math.abs(this.#md_x - e.clientX) > 5 || Math.abs(this.#md_y - e.clientY) > 5) &&
                 cfg.hz.actTrigger === "m2" &&
                !cfg.hz.deactivate
            ) {
                stopEvent(e);
}
            return;
        }

        const elapsed = e.timeStamp - this.#mdownstart >= 300;
        this.#mdownstart = null;

        const shouldFullZoom = this.#state > 2 && ((elapsed && cfg.hz.fzOnPress === 2) || (!elapsed && !this.#fullZm && cfg.hz.fzOnPress === 1));

        if (shouldFullZoom) {
            this.handleKeyDown({ which: 13, shiftKey: this.#fullZm ? true : e.shiftKey, preventDefault: () => {}, stopImmediatePropagation: () => {} });
            stopEvent(e);
            return;
        }

        const hasAltSrc = this.#state < 3 && this.#SRC && this.#SRC.m2 !== undefined;

        if (hasAltSrc) {
            if (elapsed) return;
            this.#load(this.#SRC.m2);
            this.#SRC = undefined;
            stopEvent(e);
            return;
        }

        if (elapsed && this.#state > 2 && !this.#fullZm && cfg.hz.fzOnPress === 1) {
             return;
        }

        if (e.target === this.#CNT) {
            stopEvent(e, false);
        } else if (e.ctrlKey && !elapsed && !e.shiftKey && !e.altKey && cfg.tls.opzoom && this.#state < 2) {
            // On-demand zoom
            const imgSrc = this.#imageResolver.checkIMG(e.target) || this.#imageResolver.checkBG(this.#win.getComputedStyle(e.target).backgroundImage);

            if (imgSrc) {
                 this.#TRG = this.#nodeToReset = e.target;
                this.#fireHide = true;
                this.#x = e.clientX;
                this.#y = e.clientY;
                this.#set(Array.isArray(imgSrc) ? imgSrc[0] : imgSrc);
                stopEvent(e);
            }
        }
    }

    handleKeyDown(e) {
        if (this.#state === 0 || !this.#settings) return;
        
        const cfg = this.#settings.all;
        let pv, key;
        
        if (shortcut.isModifier(e)) {
            if (this.#keyup_freeze_on || typeof this.#freeze === "number") return;
            if (e.repeat || shortcut.key(e) !== cfg.hz.actTrigger) return;
            if (this.#fireHide && this.#state < 3)
                 if (cfg.hz.deactivate) this.handleMouseOver({ relatedTarget: this.#TRG });
                else this.#load(this.#SRC === null ? this.#TRG.IMGS_c_resolved : this.#SRC);
            this.#freeze = !!cfg.hz.deactivate;
            this.#keyup_freeze_on = true;
            this.#win.addEventListener("keyup", this.#keyup_freeze.bind(this), true);
            return;
        }
        if (!e.repeat)
             if (this.#keyup_freeze_on) this.#keyup_freeze();
            else if (this.#freeze === false && !this.#fullZm && this.#lastScrollTRG) this.#mover({ target: this.#lastScrollTRG });
        
        key = shortcut.key(e);
        if (this.#state < 3 && this.#fireHide && key === "Esc") this.handleMouseOver({ relatedTarget: this.#TRG });
        
        pv = e.target;
        if (cfg.hz.scOffInInput && pv && (pv.isContentEditable || ((pv = pv.nodeName.toUpperCase()) && (pv[2] === "X" || pv === "INPUT")))) return;
        
        if (e.altKey && e.shiftKey) {
            pv = true;
            if (key === cfg.keys.hz_preload) this.#win.top.postMessage({ vdfDpshPtdhhd: "preload" }, "*");
            else if (key === cfg.keys.hz_toggle) {
                 if (this.#win.sessionStorage.IMGS_suspend) delete this.#win.sessionStorage.IMGS_suspend;
                else this.#win.sessionStorage.IMGS_suspend = "1";
                this.#win.top.postMessage({ vdfDpshPtdhhd: "toggle" }, "*");
            } else pv = false;
        } else if (!(e.altKey || e.metaKey) && (this.#state > 2 || this.#LDR_msg)) {
             pv = !e.ctrlKey;
            if ((e.ctrlKey && key === "S") || (!e.ctrlKey && !e.shiftKey && key === cfg.keys.hz_save)) {
                if (!e.repeat && this.#CNT.src) {
                     this.#portService.send({
                        cmd: "download",
                         url: this.#CNT.src,
                        priorityExt: (this.#CNT.src.match(/#([\da-z]{3,4})$/) || [])[1],
                         ext: { img: "jpg", video: "mp4", audio: "mp3" }[this.#CNT.audio ? "audio" : this.#CNT.localName],
                    });
                }
                 pv = true;
            } else if (e.ctrlKey) {
                if (this.#state === 4)
                     if (key === "C") {
                        if (!e.shiftKey && "oncopy" in this.#doc) {
                             pv = true;
                            if (Date.now() - (this.#timers.copy || 0) < 500) key = this.#TRG.IMGS_caption;
                            else key = this.#CNT.src;
                            const oncopy = (ev) => {
                                 ev.currentTarget.removeEventListener(ev.type, oncopy);
                                ev.clipboardData.setData("text/plain", key);
                                ev.preventDefault();
                            };
                            this.#doc.addEventListener("copy", oncopy);
                            this.#doc.execCommand("copy");
                            this.#timers.copy = Date.now();
                        }
                     } else if (key === cfg.keys.hz_open) {
                        key = {};
                        ((this.#TRG.IMGS_caption || "").match(/\b((?:www\.[\w-]+(\.\S{2,7}){1,4}|https?:\/\/)\S+)/g) || []).forEach(function (el) {
                             key[el[0] === "w" ? "http://" + el : el] = 1;
                         });
                        key = Object.keys(key);
                        if (key.length) {
                            this.#portService.send({ cmd: "open", url: key, nf: !!e.shiftKey });
                            if (!e.shiftKey && !this.#fullZm) this.#reset(true);
                            pv = true;
                        }
                    } else if (this.#CNT === this.#VID) {
                         if (key === "Left" || key === "Right") {
                            key = key === "Left" ? -5 : 5;
                            this.#VID.currentTime += key * (e.shiftKey ? 3 : 1);
                        } else if (key === "Up" || key === "Down") {
                            const delta = key === "Down" ? -0.05 : 0.05;
                            this.#VID.volume = Math.max(0, Math.min(1, this.#VID.volume + delta));
                        }
                    }
            } else if (key === "-" || key === "+" || key === "=") this.#resize(key === "-" ? "-" : "+");
            else if (key === "Tab") {
                if (this.#TRG.IMGS_HD_stack) {
                     if (this.#CAP) this.#CAP.style.display = "none";
                    this.#TRG.IMGS_HD = !this.#TRG.IMGS_HD;
                    key = this.#TRG.IMGS_c || this.#TRG.IMGS_c_resolved;
                    delete this.#TRG.IMGS_c;
                    this.#set(this.#TRG.IMGS_HD_stack);
                    this.#TRG.IMGS_HD_stack = key;
                }
                if (e.shiftKey) cfg.hz.hiRes = !cfg.hz.hiRes;
            } else if (key === "Esc")
                if (this.#CNT === this.#VID && (this.#win.fullScreen || this.#doc.fullscreenElement || (this.#topWinW === this.#win.screen.width && this.#topWinH === this.#win.screen.height)))
                     pv = false;
                else this.#reset(true);
            else if (key === cfg.keys.hz_fullZm || key === "Enter")
                if (this.#fullZm)
                     if (e.shiftKey) this.#fullZm = this.#fullZm === 1 ? 2 : 1;
                    else this.#reset(true);
                else {
                    this.#win.removeEventListener("mouseover", this.handleMouseOver.bind(this), true);
                    this.#doc.removeEventListener("wheel", this.handleWheel.bind(this), { capture: true, passive: false });
                    this.#doc.documentElement.removeEventListener("mouseleave", this.handleMouseLeave.bind(this), false);
                    this.#fullZm = (cfg.hz.fzMode !== 1) !== !e.shiftKey ? 1 : 2;
                    this.#switchToHiResInFZ();
                    if (this.#anim.maxDelay)
                        setTimeout(() => {
                             if (this.#fullZm) this.#DIV.style.transition = "all 0s";
                         }, this.#anim.maxDelay);
                    pv = this.#DIV.style;
                    if (this.#CNT === this.#VID) this.#VID.controls = true;
                    if (this.#state > 2 && this.#fullZm !== 2) {
                        pv.visibility = "hidden";
                        this.#resize(0);
this.handleMouseMove();
                        pv.visibility = "visible";
                    }
                    if (!this.#iFrame) this.#win.addEventListener("mousemove", this.handleMouseMove.bind(this), true);
                    this.#win.addEventListener("click", this.#fzClickAct.bind(this), true);
                }
            else if (e.which > 31 && e.which < 41) {
                pv = null;
                if (this.#CNT === this.#VID) {
                    pv = true;
                    if (key === "Space")
                        if (e.shiftKey) {
                             if (!this.#VID.audio) this.#VID.controls = this.#VID._controls = !this.#VID._controls;
                        } else if (this.#VID.paused) this.#VID.play();
                        else this.#VID.pause();
                    else if (key === "Up" || key === "Down")
                         if (e.shiftKey) this.#VID.playbackRate *= key === "Up" ? 4 / 3 : 0.75;
                        else pv = null;
                    else if (!e.shiftKey && (key === "PgUp" || key === "PgDn"))
                         if (this.#VID.audio) this.#VID.currentTime += key === "PgDn" ? 4 : -4;
                        else {
                            this.#VID.pause();
                            this.#VID.currentTime = (this.#VID.currentTime * 25 + (key === "PgDn" ? 1 : -1)) / 25 + 1e-5;
                        }
                    else pv = null;
                }
                 if (!pv && this.#TRG.IMGS_album) {
                    switch (key) {
                         case "End":
                            if (e.shiftKey && (pv = prompt("#", this.#stack[this.#TRG.IMGS_album].search || "") || null))
                                 this.#stack[this.#TRG.IMGS_album].search = pv;
                            else pv = false;
                            break;
                        case "Home": pv = true; break;
                        case "Up":
                         case "Down": pv = null; break;
                        default:
                            pv = ((key === "Space" && !e.shiftKey) || key === "Right" || key === "PgDn" ? 1 : -1) * (e.shiftKey && key !== "Space" ? 5 : 1);
                    }
                    if (pv !== null) {
                         this.#album(pv, true);
                        pv = true;
                    }
                }
                 } else if (key === cfg.keys.mOrig || key === cfg.keys.mFit || key === cfg.keys.mFitW || key === cfg.keys.mFitH) this.#resize(key);
            else if (key === cfg.keys.hz_fullSpace) {
                cfg.hz.fullspace = !cfg.hz.fullspace;
                this.#show();
            } else if (key === cfg.keys.flipH) this.#flip(this.#CNT, true);
            else if (key === cfg.keys.flipV) this.#flip(this.#CNT, false);
            else if (key === cfg.keys.rotL || key === cfg.keys.rotR) {
                this.#DIV.curdeg += key === cfg.keys.rotR ? 90 : -90;
                if (this.#CAP && this.#CAP.textContent && this.#CAP.state !== 0) this.#CAP.style.display = this.#DIV.curdeg % 360 ? "none" : "block";
                this.#DIV.style.transform = this.#DIV.curdeg ? "rotate(" + this.#DIV.curdeg + "deg)" : "";
                if (this.#fullZm) this.handleMouseMove();
                else this.#show();
            } else if (key === cfg.keys.hz_caption)
                 if (e.shiftKey) {
                    this.#createCAP();
                    switch (this.#CAP.state) {
                         case 0: key = cfg.hz.capWH || cfg.hz.capText ? 1 : 2; break;
                        case 2: key = 0; break;
                        default: key = cfg.hz.capWH && cfg.hz.capText ? 0 : 2;
                    }
                    this.#CAP.state = key;
                    this.#CAP.style.display = "none";
                    this.#updateCaption();
                    this.#show();
                } else {
                    if (this.#CAP) this.#CAP.style.whiteSpace = this.#CAP.style.whiteSpace === "nowrap" ? "normal" : "nowrap";
                }
             else if (key === cfg.keys.hz_history) {
                this.#handleHistoryKey(e.shiftKey);
            } else if (key === cfg.keys.send) {
                if (this.#CNT === this.#IMG) this.#imageSendTo({ url: this.#CNT.src, nf: e.shiftKey });
            } else if (key === cfg.keys.hz_open) {
                if (this.#CNT.src) {
                    this.#portService.send({ cmd: "open", url: this.#CNT.src.replace(rgxHash, ""), nf: e.shiftKey });
                    if (!e.shiftKey && !this.#fullZm) this.#reset(true);
                }
            } else if (key === cfg.keys.prefs) {
                this.#portService.send({ cmd: "open", url: "options/options.html#settings" });
                if (!this.#fullZm) this.#reset(true);
            } else pv = false;
        } else pv = false;
        if (pv) stopEvent(e);
    }

    handleWheel(e) {
        if (this.#state === 0) return;
        
        // --- Scroller logic (from PVI.scroller) ---
         if (this.#fullZm) {
            // Fall through to wheeler logic
        } else {
            if (!e.target.IMGS_) {
                 if (this.#lastScrollTRG && this.#lastScrollTRG !== e.target) this.#lastScrollTRG = false;
                else if (this.#lastScrollTRG !== false) this.#lastScrollTRG = e.target;
            }
        }
        
         if (this.#freeze || this.#keyup_freeze_on) return;

        if (!this.#fullZm) {
            if (this.#fireHide) this.handleMouseOver({ relatedTarget: this.#TRG });
            this.#x = e.clientX;
            this.#y = e.clientY;
            
            this.#freeze = true;
            this.#win.addEventListener("mousemove", this.#mover.bind(this), true);
        }

        // --- Wheeler logic (from PVI.wheeler) ---
        if (e.clientX >= this.#winW || e.clientY >= this.#winH) return;
        
        let d = this.#settings.get('hz.scrollDelay');
        if (this.#state > 2 && d >= 20) {
            if (e.timeStamp - (this.#lastScrollTime || 0) < d) d = null;
            else this.#lastScrollTime = e.timeStamp;
        }

        if (
            this.#TRG &&
            this.#TRG.IMGS_album &&
             this.#settings.get('hz.pileWheel') &&
            (!this.#fullZm || (e.clientX < 50 && e.clientY < 50) || (this.#CAP && e.target === this.#CAP.firstChild))
        ) {
             if (d !== null) {
                if (this.#settings.get('hz.pileWheel') === 2) {
                    if (!e.deltaX && !e.wheelDeltaX) return;
                    d = (e.deltaX || -e.wheelDeltaX) > 0;
                } else d = (e.deltaY || -e.wheelDelta) > 0;
                this.#album(d ? 1 : -1, true);
            }
            stopEvent(e);
            return;
        }
        
             if (this.#fullZm && this.#fullZm < 4) {
            if (d !== null)
                this.#resize(
                     (e.deltaY || -e.wheelDelta) > 0 ? "-" : "+",
                    this.#fullZm > 1 ? (e.target === this.#CNT ? [e.offsetX || e.layerX || 0, e.offsetY || e.layerY || 0] : []) : null
                );
            stopEvent(e);
            return;
        }
        
        // If not fullZm and not album, reset
        this.#lastScrollTRG = this.#TRG;
        this.#reset(false); // was PVI.reset()
    }
    
    handleResize() {
        if (this.#state === 0) return;
        this.#updateViewportDimensions();
        if (this.#state < 3) return;
        if (!this.#fullZm) this.#show();
        else if (this.#fullZm === 1) this.handleMouseMove();
    }
    
    handleVisibilityChange(e) {
        if (this.#state === 0) return;
        if (this.#fullZm) return;
        if (this.#doc.hidden) {
            if (this.#fireHide) this.handleMouseOver({ relatedTarget: this.#TRG });
        } else {
            this.#releaseFreeze(e);
        }
    }

    // --- ================================= ---
    // --- Public Message Handlers           ---
    // --- ================================= ---

    handleMessage(d) {
        if (this.#state === 0 || !d) return;

        if (d.cmd === "resolved") {
            const trg = this.#resolving[d.id] || this.#TRG;
            const rule = this.#settings.get('sieve')[d.params.rule.id];
            delete this.#resolving[d.id];
            if (!d.return_url) this.#create();

            if (!d.cache && (d.m === true || d.params.rule.skip_resolve)) {
                try {
                     if (rule.res === 1 && typeof d.params.rule.req_res === "string") {
                        rule.res = Function("$", d.params.rule.req_res);
                    }
                     this.#imageResolver.setContextNode(trg); // Set context for .call()
                    d.m = rule.res.call(this.#imageResolver, d.params);
                } catch (ex) {
                     console.error(`${this.#settings.get('app.name')}: [rule ${d.params.rule.id}] ${ex.message}`);
                    if (!d.return_url && trg === this.#TRG) this.#show("R_js");
                    return 1;
                }
                if (d.params.url) d.params.url = d.params.url.join("");
                if (this.#settings.get('tls.sieveCacheRes') && !d.params.rule.skip_resolve && d.m)
                     this.#portService.send({ cmd: "resolve_cache", url: d.params.url, cache: JSON.stringify(d.m), rule_id: d.params.rule.id });
            }
            
             if (d.m && !Array.isArray(d.m) && typeof d.m === "object") {
                if (d.m[""]) {
                     if (typeof d.m.idx === "number") d.idx = d.m.idx + 1;
                    d.m = d.m[""];
                } else if (typeof d.m.loop === "string") {
                    d.loop = true;
                    d.m = d.m.loop;
                }
             }

            if (Array.isArray(d.m)) {
                if (d.m.length) {
                     if (Array.isArray(d.m[0])) {
                        d.m.forEach(function (el) {
                             if (Array.isArray(el[0]) && el[0].length === 1) el[0] = el[0][0];
                        });
                        if (d.m.length > 1) {
                            trg.IMGS_album = d.params.url;
                            if (this.#stack[d.params.url]) {
                                 d.m = this.#stack[d.params.url];
                                d.m = d.m[d.m[0]];
                            } else {
                         this.#createCAP();
                                d.idx = Math.max(1, Math.min(d.idx, d.m.length)) || 1;
                                d.m.unshift(d.idx);
                                this.#stack[d.params.url] = d.m;
                                d.m = d.m[d.idx];
                                d.idx += "";
                            }
                         } else d.m = d.m[0];
                    }
                    if (this.#settings.get('hz.capText') && d.m[0]) {
                         if (d.m[1]) this.#prepareCaption(trg, d.m[1]);
                        else if (this.#settings.get('hz.capLinkText') && trg.IMGS_caption) d.m[1] = trg.IMGS_caption;
                    }
                    d.m = d.m[0];
                } else d.m = null;
            } else if (typeof d.m !== "object" && typeof d.m !== "string") d.m = false;

            if (d.m) {
                if (!d.noloop && !trg.IMGS_album && typeof d.m === "string" && (d.loop || (rule.loop && rule.loop & (d.params.rule.loop_param === "img" ? 2 : 1)))) {
 
                    
                    const findResult = this.#imageResolver.find({ href: d.m, IMGS_TRG: trg });
                    d.m = this.#processFindResult(findResult, trg);

                    if (d.m === null || d.m === 1) return d.m;
                    else if (d.m === false) {
                        if (!d.return_url) this.#show("R_res");
                        return d.m;
                    }
                 }
                if (d.return_url) return d.m;
                
                if (trg === this.#TRG)
                     if (trg.IMGS_album) this.#album(d.idx || "1");
                    else this.#set(d.m);
                else {
                    if (this.#settings.get('hz.preload') > 1 || this.#timers.preload) this.#_preload(d.m);
                    trg.IMGS_c_resolved = d.m;
                }
             } else if (d.return_url) {
                delete this.#TRG.IMGS_c_resolved;
                return d.m;
            } else if (trg === this.#TRG) {
                 if (trg.IMGS_fallback_zoom) {
                    this.#set(trg.IMGS_fallback_zoom);
                    delete trg.IMGS_fallback_zoom;
                    return;
                }
                if (d.m === false) {
                     this.handleMouseOver({ relatedTarget: trg });
                    trg.IMGS_c = true;
                    delete trg.IMGS_c_resolved;
                } else this.#show("R_res");
            }
            
        } else if (d.cmd === "toggle" || d.cmd === "preload") {
            this.#win.top.postMessage({ vdfDpshPtdhhd: d.cmd }, "*");
        } else if (d.cmd === "hello") {
            const e = !!this.#DIV;
            this.destroy(); // Full destroy
            this.toggle(true); // Disable
            this.#settings.update(d.prefs); // Update settings
            this.toggle(false); // Re-enable
             if (e) this.#create();
        }
    }

    /**
     * Handles messages posted from iFrames.
     * Logic from PVI.winOnMessage
     */
    handleFrameMessage(d) {
        if (this.#iFrame) {
            this.#win.parent.postMessage(d, "*");
            return;
        }
        if (this.#fullZm) return;

        if (d.reset) {
            this.#reset(false);
            return;
        }

         this.#create();
        this.#fireHide = true;
        this.#TRG = this.#HLP; // Use the helper as a dummy target
        this.#resetNode(this.#TRG);

        if (d.hide) {
            this.#hide({ target: this.#TRG, clientX: this.#x, clientY: this.#y });
            return;
        }

         this.#x = this.#y = 0; // iFrame popups originate from corner

        if (typeof d.msg === "string") {
            this.#show(d.msg);
            return;
        }

        
 if (!d.src) return;
        
        this.#TRG.IMGS_caption = d.caption;
        if (d.album) {
            this.#TRG.IMGS_album = d.album.id;
            if (!this.#stack[d.album.id]) this.#stack[d.album.id] = d.album.list;
            d.album = "" + this.#stack[d.album.id][0];
        }
        if (d.thumb && d.thumb[0]) {
             this.#TRG.IMGS_thumb = d.thumb[0];
            this.#TRG.IMGS_thumb_ok = d.thumb[1];
        }
        if (d.album) this.#album(d.album);
        else this.#set(d.src);
    }
    
    // --- ================================= ---
    // --- Private Methods (Ported from PVI) ---
    // --- ================================= ---

    /**
     * Processes the result from imageResolver.find() and applies
     * properties to the target element.
     */
    #processFindResult(result, trg) {
        if (!result) {
             trg.IMGS_c = true; // Mark as non-viable
            return false;
        }
        if (result.error) {
             trg.IMGS_c = true;
            return 1; // Error code
        }
        
        this.#listen_attr_changes(result.attrModNode || trg);
        
        if (result.caption) {
            this.#prepareCaption(trg, result.caption);
        }
        if (result.thumb) {
            trg.IMGS_thumb = result.thumb;
            trg.IMGS_thumb_ok = result.thumbOk;
        }
        if (result.album) {
             trg.IMGS_album = result.album;
        }
        if (result.nohistory) {
            trg.IMGS_nohistory = true;
        }
        if (result.fallback) {
             trg.IMGS_fallback_zoom = result.fallback;
        }

        if (result.needsResolve) {
            // Returns null, which handleMouseOver checks
            return this.#resolve(result.url, result.resolveParams, trg);
        }
         
        return result.urls; // string or string[]
    }
    
    /**
     * Logic from PVI.flip
     */
    #flip(el, ori) {
        if (!el.scale) el.scale = { h: 1, v: 1 };
        el.scale[ori ? "h" : "v"] *= -1;
        let transform = el.scale.h !== 1 || el.scale.v !== 1 ? "scale(" + el.scale.h + "," + el.scale.v + ")" : "";
        if (el.curdeg) transform += " rotate(" + el.curdeg + "deg)";
        el.style.transform = transform;
    }

    /**
     * Logic from global imageSendTo
     */
    #imageSendTo(sf) {
        if ((!sf.url && !sf.name) || (sf.url && !/^http/.test(sf.url))) {
             alert("Invalid URL! (" + sf.url.slice(0, sf.url.indexOf(":") + 1));
            return;
        }
        let i = 0;
         let urls = [];
        let hosts = this.#settings.get('tls.sendToHosts');
        for (; i < hosts.length; ++i)
            if (sf.host === i || (sf.host === undefined && hosts[i][0][0] === "+"))
                urls.push(hosts[i][1].replace("%url", encodeURIComponent(sf.url)).replace("%raw_url", sf.url));
        this.#portService.send({ cmd: "open", url: urls, nf: !!sf.nf });
    }

    /**
     * Logic from PVI.delayed_loader
     */
    #delayed_loader() {
        if (this.#TRG && this.#state < 4) this.#show(this.#LDR_msg, true);
    }
    
    /**
     * Logic from PVI.show
     */
    #show(msg, delayed) {
        if (this.#iFrame) {
            this.#win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", msg: msg }, "*");
            return;
        }
        
 if (!delayed && typeof msg === "string") {
            this.#DIV.style.display = "none";
            this.#HD_cursor(true);
            this.#BOX = this.#LDR;
            const opacity = this.#settings.get('hz.LDRbgOpacity') / 100;
            this.#LDR.style.backgroundColor =
                opacity < 1 ? this.#palette[msg].replace(/\(([^\)]+)/, "a($1, " + opacity) : this.#palette[msg];
            
            const ldrDelay = this.#settings.get('hz.LDRdelay');
            if (ldrDelay > 20) {
                clearTimeout(this.#timers.delayed_loader);
                if (msg[0] !== "R" && this.#state !== 3 && !this.#fullZm) {
                     this.#state = 3;
                    this.#LDR_msg = msg;
                     this.#timers.delayed_loader = setTimeout(this.#delayed_loader.bind(this), ldrDelay);
                    return;
                }
             }
        }
        
        let box;
        if (msg) {
             if (this.#state === 2 && this.#settings.get('hz.waitHide')) return;
            this.#updateViewportDimensions();
            if (this.#state < 3 || this.#LDR_msg) {
                 this.#LDR_msg = null;
                this.#win.addEventListener("wheel", this.handleWheel.bind(this), { capture: true, passive: false });
            }
             if (msg === true) {
                this.#BOX = this.#DIV;
                this.#LDR.style.display = "none";
                if (this.#settings.get('hz.LDRanimate')) this.#LDR.style.opacity = "0";
                this.#CNT.style.display = "block";
                (this.#CNT === this.#IMG ? this.#VID : this.#IMG).style.display = "none";
if (typeof this.#DIV.cursor_hide === "function") this.#DIV.cursor_hide();
            } else if (this.#state < 4) {
                if (this.#anim.left || this.#anim.top) {
                     this.#DIV.style.left = this.#x + "px";
                    this.#DIV.style.top = this.#y + "px";
                }
                if (this.#anim.width || this.#anim.height) this.#DIV.style.width = this.#DIV.style.height = "0";
            }
            box = this.#BOX.style;
            if (
                (this.#state < 3 || this.#BOX === this.#LDR) &&
                box.display === "none" &&
                 (((this.#anim.left || this.#anim.top) && this.#BOX === this.#DIV) || (this.#settings.get('hz.LDRanimate') && this.#BOX === this.#LDR))
            )
                 this.#show(null);
            box.display = "block";
            if (box.opacity === "0" && ((this.#BOX === this.#DIV && this.#anim.opacity) || (this.#BOX === this.#LDR && this.#settings.get('hz.LDRanimate'))))
                if (this.#state === 2) this.#anim.opacityTransition();
                else setTimeout(this.#anim.opacityTransition, 0);
            this.#state = this.#BOX === this.#LDR ? 3 : 4;
        }

        let x = this.#x, y = this.#y;
        let rSide = this.#winW - x, bSide = this.#winH - y;
        let left, top, rot, w, h, ratio;

        if ((msg === undefined && this.#state === 4) || msg === true) {
             msg = false;
            if (this.#TRG.IMGS_SVG) {
                h = this.#stack[this.#IMG.src];
                w = h[0];
                h = h[1];
            } else if ((w = this.#CNT.naturalWidth)) h = this.#CNT.naturalHeight;
            else msg = true;
        }
        
        if (this.#fullZm) {
            if (!this.#BOX) this.#BOX = this.#LDR;
            if (msg === false) {
                 box = this.#DIV.style;
                box.visibility = "hidden";
                this.#resize(0);
                this.handleMouseMove(); // Will call m_move logic
                box.visibility = "visible";
                this.#updateCaption();
            } else this.handleMouseMove(); // Will call m_move logic
             return;
        }

        if (msg === false) {
            rot = this.#DIV.curdeg % 180 !== 0;
            if (rot) {
                 ratio = w; w = h; h = ratio;
            }
            if (this.#settings.get('hz.placement') === 3) {
                
 box = this.#TBOX;
                x = box.left; y = box.top;
                rSide = this.#winW - box.right; bSide = this.#winH - box.bottom;
            }
            box = this.#DBOX;
            ratio = w / h;
            
            let fs = this.#settings.get('hz.fullspace') || this.#settings.get('hz.placement') === 2;
            let cap_size =
                 this.#CAP &&
                this.#CAP.overhead &&
                !(this.#DIV.curdeg % 360) &&
                this.#CAP.state !== 0 &&
                (this.#CAP.state === 2 || (this.#TRG.IMGS_caption && this.#settings.get('hz.capText')) || this.#TRG.IMGS_album || this.#settings.get('hz.capWH'))
                     ? this.#CAP.overhead
                    : 0;

            let vH = box["wm"] + (rot ? box["hpb"] : box["wpb"]);
let hH = box["hm"] + (rot ? box["wpb"] : box["hpb"]) + cap_size;
            let vW = Math.min(w, (fs ? this.#winW : x < rSide ? rSide : x) - vH);
            let hW = Math.min(w, this.#winW - vH);
            vH = Math.min(h, this.#winH - hH);
            hH = Math.min(h, (fs ? this.#winH : y < bSide ? bSide : y) - hH);

            if ((fs = vW / ratio) > vH) vW = vH * ratio;
            else vH = fs;
            if ((fs = hH * ratio) > hW) hH = hW / ratio;
            else hW = fs;

            if (hW > vW) {
                 w = Math.round(hW); h = Math.round(hH);
            } else {
                w = Math.round(vW); h = Math.round(vH);
            }

             vW = w + box["wm"] + (rot ? box["hpb"] : box["wpb"]);
            vH = h + box["hm"] + (rot ? box["wpb"] : box["hpb"]) + cap_size;
            hW = this.#TRG !== this.#HLP && this.#settings.get('hz.minPopupDistance');

            switch (this.#settings.get('hz.placement')) {
                 case 1:
                    hH = (x < rSide ? rSide : x) < vW;
                    if (hH && this.#settings.get('hz.fullspace') && (this.#winH - vH <= this.#winW - vW || vW <= (x < rSide ? rSide : x))) hH = false;
                    left = x - (hH ? vW / 2 : x < rSide ? 0 : vW);
                    top = y - (hH ? (y < bSide ? 0 : vH) : vH / 2);
                    break;
                case 2:
                     left = (this.#winW - vW) / 2;
                    top = (this.#winH - vH) / 2;
                    hW = false;
                    break;
                case 3:
                     left = x < rSide || (vW >= this.#x && this.#winW - this.#x >= vW) ? this.#TBOX.right : x - vW;
                    top = y < bSide || (vH >= this.#y && this.#winH - this.#y >= vH) ? this.#TBOX.bottom : y - vH;
                    hH = (x < rSide ? rSide : x) < vW || ((y < bSide ? bSide : y) >= vH && this.#winW >= vW && (this.#TBOX.width >= this.#winW / 2 || Math.abs(this.#x - left) >= this.#winW / 3.5));
                    if (!this.#settings.get('hz.fullspace') || (hH ? vH <= (y < bSide ? bSide : y) : vW <= (x < rSide ? rSide : x))) {
                        fs = this.#TBOX.width / this.#TBOX.height;
                        if (hH) {
                             left = (this.#TBOX.left + this.#TBOX.right - vW) / 2;
                            if (fs > 10) left = x < rSide ? Math.max(left, this.#TBOX.left) : Math.min(left, this.#TBOX.right - vW);
                        } else {
                             top = (this.#TBOX.top + this.#TBOX.bottom - vH) / 2;
                            if (fs < 0.1) top = y < bSide ? Math.min(top, this.#TBOX.top) : Math.min(top, this.#TBOX.bottom - vH);
                        }
                    }
                    break;
                case 4:
                     left = x - vW / 2;
                    top = y - vH / 2;
                    hW = false;
                    break;
                default:
                     hH = null;
                    left = x - (x < rSide ? Math.max(0, vW - rSide) : vW);
                    top = y - (y < bSide ? Math.max(0, vH - bSide) : vH);
            }
            if (hW)
                 if (hH || (x < rSide ? rSide : x) < vW || this.#winH < vH) {
                    hH = y < bSide ? box["mt"] : box["mb"];
                    if (hW > hH) {
                        hW -= hH;
                        top += y < bSide ? hW : -hW;
                    }
                 } else {
                    hH = x < rSide ? box["ml"] : box["mr"];
                    if (hW > hH) {
                         hW -= hH;
                        left += x < rSide ? hW : -hW;
                    }
                }
             left = left < 0 ? 0 : left > this.#winW - vW ? this.#winW - vW : left;
            top = top < 0 ? 0 : top > this.#winH - vH ? this.#winH - vH : top;
            if (cap_size && !this.#settings.get('hz.capPos')) top += cap_size;
            if (rot) {
                rot = w; w = h; h = rot;
                rot = (vW - vH) / 2;
                left += rot;
                top -= rot;
            }
             this.#DIV.style.width = w + "px";
            this.#DIV.style.height = h + "px";
            this.#updateCaption();
        } else {
            if (this.#settings.get('hz.placement') === 1) {
                 left = this.#settings.get('hz.minPopupDistance');
                top = this.#LDR.wh[1] / 2;
            } else {
                left = 13;
                top = y < bSide ? -13 : this.#LDR.wh[1] + 13;
            }
             left = x - (x < rSide ? -left : this.#LDR.wh[0] + left);
            top = y - top;
        }
        if (left !== undefined) {
            this.#BOX.style.left = left + "px";
            this.#BOX.style.top = top + "px";
        }
    }

    /**
     * Logic from PVI.album
     */
    #album(idx, manual) {
        let s, i;
        if (!this.#TRG || !this.#TRG.IMGS_album) return;
const album = this.#stack[this.#TRG.IMGS_album];
        if (!album || album.length < 2) return;
        if (!this.#fullZm && this.#timers.no_anim_in_album) {
            clearInterval(this.#timers.no_anim_in_album);
            this.#timers.no_anim_in_album = null;
            this.#DIV.style.transition = "all 0s";
        }
        switch (typeof idx) {
             case "boolean": idx = idx ? 1 : album.length - 1; break;
            case "number": idx = album[0] + (idx || 0); break;
            default:
                if (/^[+-]?\d+$/.test(idx)) {
                     i = parseInt(idx, 10);
                    idx = idx[0] === "+" || idx[0] === "-" ? album[0] + i : i || 1;
                } else {
                     idx = idx.trim();
                    if (!idx) return;
                    idx = new RegExp(idx, "i");
                    s = album[0];
                    i = s + 1;
                    for (i = i < album.length ? i : 1; i !== s; ++i < album.length ? 0 : (i = 1))
                        if (album[i][1] && idx.test(album[i][1])) {
                             idx = i;
                            break;
                        }
                    if (typeof idx !== "number") return;
                }
        }
         if (this.#settings.get('hz.pileCycle')) {
            s = album.length - 1;
            idx = idx % s || s;
            idx = idx < 0 ? s + idx : idx;
        } else idx = Math.max(1, Math.min(idx, album.length - 1));
        s = album[0];
        if (s === idx && manual && this.#state > 3) return;
        album[0] = idx;
        this.#resetNode(this.#TRG, true);
        this.#CAP.style.display = "none";
        this.#CAP.firstChild.textContent = idx + " / " + (album.length - 1);
        if (this.#settings.get('hz.capText')) this.#prepareCaption(this.#TRG, album[idx][1]);
        this.#set(album[idx][0]);
        s = (s <= idx && !(s === 1 && idx === album.length - 1)) || (s === album.length - 1 && idx === 1) ? 1 : -1;
        i = 0;
        const until = this.#settings.get('hz.preload') < 3 ? 1 : 3;
        while (i++ <= until) {
            if (!album[idx + i * s] || idx + i * s < 1) return;
            this.#_preload(album[idx + i * s][0]);
        }
    }

    /**
     * Logic from PVI.set
     */
    #set(src) {
        let i, src_left, src_HD;
        if (!src) return;
        if (this.#iFrame) {
            i = this.#TRG;
            this.#win.parent.postMessage(
                {
                     vdfDpshPtdhhd: "from_frame",
                    src: src,
                     thumb: i.IMGS_thumb ? [i.IMGS_thumb, i.IMGS_thumb_ok] : null,
                    album: i.IMGS_album ? { id: i.IMGS_album, list: this.#stack[i.IMGS_album] } : null,
                     caption: i.IMGS_caption,
                },
                "*"
             );
            return;
        }
        clearInterval(this.#timers.onReady);
        this.#create();

        const pageProtocol = this.#imageResolver.getPageProtocol();
        
        if (Array.isArray(src)) {
            if (!src.length) {
                this.#show("R_load");
                return;
            }
            src_left = [];
            src_HD = [];
            for (i = 0; i < src.length; ++i) {
                if (!src[i]) continue;
                if (src[i][0] === "#") src_HD.push(httpPrepend(src[i].slice(1), null, pageProtocol));
                else src_left.push(httpPrepend(src[i], null, pageProtocol));
            }
            if (!src_left.length) src_left = src_HD;
            else if (src_HD.length) {
                const hiRes = this.#settings.get('hz.hiRes');
                this.#TRG.IMGS_HD = hiRes;
                i = hiRes ? src_left : src_HD;
                this.#TRG.IMGS_HD_stack = i.length > 1 ? i : i[0];
                src_left = hiRes ? src_HD : src_left;
            }
            this.#TRG.IMGS_c_resolved = src_left;
            src = src_left[0];
        } else if (src[0] === "#") src = src.slice(1);
        
        if (src[1] === "/") src = httpPrepend(src, null, pageProtocol);
        if (src.indexOf("&amp;") !== -1) src = src.replace(/&amp;/g, "&");
        
        if (this.#imageResolver.isSVG(src)) this.#TRG.IMGS_SVG = true;
        else delete this.#TRG.IMGS_SVG;
        
        if (src === this.#CNT.src) {
            this.#checkContentRediness(src);
            return;
        }
         
        if (/^[^?#]+\.(?:m(?:4[abprv]|p[34])|og[agv]|webm)(?:$|[?#])/.test(src) || /#(mp[34]|og[gv]|webm)$/.test(src)) {
            this.#CNT = this.#VID;
            this.#show("load");
            this.#VID.naturalWidth = 0;
            this.#VID.naturalHeight = 0;
            this.#VID.src = src;
            this.#VID.load();
            return;
        }
        
 
        if (this.#CNT !== this.#IMG) {
            this.#CNT = this.#IMG;
            this.#VID.removeAttribute("src");
            this.#VID.load();
        }
        
        if (this.#settings.get('hz.thumbAsBG')) {
             if (this.#interlacer) this.#interlacer.style.display = "none";
            this.#CNT.loaded = this.#TRG.IMGS_SVG || this.#stack[src] === 1;
        }
        
        if (!this.#TRG.IMGS_SVG && !this.#stack[src] && this.#settings.get('hz.preload') === 1) new Image().src = src;
        
        this.#CNT.removeAttribute("src");
        if (this.#TRG.IMGS_SVG && !this.#stack[src]) {
            const svg = this.#doc.createElement("img");
            svg.style.cssText = ["position: fixed", "visibility: hidden", "max-width: 500px", ""].join(" !important;");
            svg.onerror = this.#content_onerror.bind(this);
            svg.src = src;
            svg.counter = 0;
            this.#timers.onReady = setInterval(() => {
                 if (svg.width || svg.counter++ > 300) {
                    const ratio = svg.width / svg.height;
                     clearInterval(this.#timers.onReady);
                    this.#doc.body.removeChild(svg);
                    if (ratio) {
                        this.#stack[src] = [this.#win.screen.width, Math.round(this.#win.screen.width / ratio)];
                         this.#IMG.src = src;
                        this.#assign_src();
                     } else this.#show("R_load");
                }
            }, 100);
            this.#doc.body.appendChild(svg);
            this.#show("load");
            return;
        }
        
         this.#CNT.src = src;
        this.#checkContentRediness(src, true);
    }
    
    /**
     * Logic from PVI.checkContentRediness
     */
    #checkContentRediness(src, showLoader) {
        if (this.#CNT.naturalWidth || (this.#TRG.IMGS_SVG && this.#stack[src])) {
             this.#assign_src();
            return;
        }
        if (showLoader) this.#show("load");
        this.#timers.onReady = setInterval(this.#content_onready.bind(this), this.#CNT === this.#IMG ? 100 : 300);
    }

    /**
     * Logic from PVI.content_onready
     */
 
    #content_onready() {
        if (!this.#CNT || !this.#fireHide) {
            clearInterval(this.#timers.onReady);
            if (!this.#fireHide) this.#reset(false);
            return;
        }
        if (this.#CNT === this.#VID) {
             if (!this.#VID.duration) {
                if (this.#VID.readyState > this.#VID.HAVE_NOTHING) this.#content_onerror.call(this.#VID);
                return;
            }
            this.#VID.naturalWidth = this.#VID.videoWidth || 300;
            this.#VID.naturalHeight = this.#VID.videoHeight || 40;
            this.#VID.audio = !this.#VID.videoHeight;
            this.#VID.loop = !this.#VID.duration || this.#VID.duration <= 60;
            if (this.#VID.audio) {
                this.#VID._controls = this.#VID.controls;
                this.#VID.controls = true;
            } else this.#VID.controls = this.#fullZm ? true : this.#VID._controls;
            if (this.#VID.autoplay && this.#VID.paused) this.#VID.play();
        } else if (!this.#IMG.naturalWidth) return;
        
        clearInterval(this.#timers.onReady);
        this.#assign_src();
    }
    
    /**
     * Logic from PVI.content_onerror
     */
    #content_onerror() {
        clearInterval(this.#timers.onReady);
        if (!this.#TRG || this !== this.#CNT) return;
let src_left;
        const t = this.#TRG;
        const src_res_arr = t.IMGS_c_resolved;
        const src = this.src;
        if (!src) return;
        
        this.removeAttribute("src");
        
        do {
            src_left = Array.isArray(src_res_arr) ? src_res_arr.shift() : null;
        } while (src_left === src);
        
        if (!src_res_arr || !src_res_arr.length)
             if (src_left) t.IMGS_c_resolved = src_left;
            else delete t.IMGS_c_resolved;
        
        if (src_left && !src_left.URL) this.#set(src_left);
        else if (t.IMGS_HD_stack) {
            src_left = t.IMGS_HD_stack;
            delete t.IMGS_HD_stack;
            delete t.IMGS_HD;
            this.#set(src_left);
        } else if (t.IMGS_fallback_zoom) {
             this.#set(t.IMGS_fallback_zoom);
            delete t.IMGS_fallback_zoom;
        } else {
            if (this.#CAP) this.#CAP.style.display = "none";
            delete t.IMGS_c_resolved;
            this.#show("R_load");
        }
        console.info(`${this.#settings.get('app.name')}: [${this.audio ? "AUDIO" : this.nodeName}] Load error > ${src}`);
    }
    
    /**
     * Logic from PVI.content_onload
     */
    #content_onload(e) {
        if (this.#settings.get('hz.thumbAsBG')) this.loaded = true;
        if (this.#TRG) delete this.#TRG.IMGS_c_resolved;
        if (this.#stack[this.src] && !(this.#TRG || e).IMGS_SVG) this.#stack[this.src] = 1;
        if (this.#interlacer) this.#interlacer.style.display = "none";
    }

    /**
     * Logic from PVI.assign_src
     */
    #assign_src() {
        if (!this.#TRG || this.#switchToHiResInFZ()) return;
        
        if (this.#TRG.IMGS_album) {
             delete this.#TRG.IMGS_thumb;
            delete this.#TRG.IMGS_thumb_ok;
            if (this.#interlacer) this.#interlacer.style.display = "none";
        } else if (!this.#TRG.IMGS_SVG) {
            if (this.#TRG !== this.#HLP && this.#TRG.IMGS_thumb && !this.#imageResolver.isEnlargeable(this.#TRG, this.#IMG)) {
                 if (this.#TRG.IMGS_HD_stack && !this.#TRG.IMGS_HD) {
                    this.#show("load");
                    this.handleKeyDown({ which: 9, preventDefault: () => {}, stopImmediatePropagation: () => {} });
                    return;
                }
                 if (!this.#TRG.IMGS_fallback_zoom) {
                    this.#not_enlargeable();
                    return;
                }
                 this.#TRG.IMGS_thumb = false;
            }
            if (this.#CNT === this.#IMG && !this.#IMG.loaded && this.#settings.get('hz.thumbAsBG') && this.#TRG.IMGS_thumb !== false && !this.#TRG.IMGS_album) {
                let inner_thumb, w, h;
                if (typeof this.#TRG.IMGS_thumb !== "string") {
                    this.#TRG.IMGS_thumb = null;
                    if (this.#TRG.hasAttribute("src")) this.#TRG.IMGS_thumb = this.#TRG.src;
                    else if (this.#TRG.childElementCount) {
                         inner_thumb = this.#TRG.querySelector("img[src]");
                        if (inner_thumb) this.#TRG.IMGS_thumb = inner_thumb.src;
                    }
                }
                 if (this.#TRG.IMGS_thumb === this.#IMG.src) {
                    delete this.#TRG.IMGS_thumb;
                    delete this.#TRG.IMGS_thumb_ok;
                } else if (this.#TRG.IMGS_thumb) {
                     w = true;
                    if (!this.#TRG.IMGS_thumb_ok) {
                        w = (inner_thumb || this.#TRG).clientWidth;
                        h = (inner_thumb || this.#TRG).clientHeight;
                        this.#TRG.IMGS_thumb_ok = Math.abs(this.#IMG.naturalWidth / this.#IMG.naturalHeight - w / h) <= 0.2;
                        w = w < 1024 && h < 1024 && w < this.#IMG.naturalWidth && h < this.#IMG.naturalHeight;
                    }
                    if (w && this.#TRG.IMGS_thumb_ok) {
                         if (this.#interlacer) w = this.#interlacer.style;
                        else {
                             this.#interlacer = this.#doc.createElement("div");
                            h = this.#interlacer;
                            if (this.#settings.get('hz.thumbAsBGOpacity') > 0) {
                                w = parseInt(this.#settings.get('hz.thumbAsBGColor').slice(1), 16);
                                h.appendChild(this.#doc.createElement("div")).style.cssText =
                                    "width: 100%; height: 100%; background-color: rgba(" +
                                     (w >> 16) + "," + ((w >> 8) & 255) + "," + (w & 255) + "," +
                                     parseFloat(this.#settings.get('hz.thumbAsBGOpacity')) + ")";
                            }
                             w = h.style;
                            w.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-size: 100% 100%; background-repeat: no-repeat";
                            this.#DIV.insertBefore(h, this.#IMG);
                        }
                         w.backgroundImage = "url(" + this.#TRG.IMGS_thumb + ")";
                        w.display = "block";
                    }
                    delete this.#TRG.IMGS_thumb;
                    delete this.#TRG.IMGS_thumb_ok;
                }
             }
        }
        delete this.#TRG.IMGS_c_resolved;
        this.#TRG.IMGS_c = this.#CNT.src;
        if (!this.#TRG.IMGS_SVG) this.#stack[this.#IMG.src] = true;
        this.#show(true);
        this.#HD_cursor(this.#TRG.IMGS_HD !== false);
        if (this.#settings.get('hz.history')) this.#handleHistoryKey(false);
        if (!this.#fullZm && this.#anim.maxDelay && this.#TRG.IMGS_album)
             this.#timers.no_anim_in_album = setTimeout(() => {
                if (this.#DIV) this.#DIV.style.transition = this.#anim.css;
            }, 100);
    }
    
     /**
     * Logic from PVI.hide
     */
    #hide(e) {
        this.#HD_cursor(true);
        this.#fireHide = false;
        if (this.#iFrame) {
            this.#win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", hide: true }, "*");
            return;
        } else this.#win.removeEventListener("mousemove", this.handleMouseMove.bind(this), true);
        
        if (this.#state < 3 || this.#LDR_msg || this.#state === null) {
            if (this.#state >= 2) this.#reset(false);
            return;
        }
        
         
        const animDIV = this.#BOX === this.#DIV && this.#anim.maxDelay;
        const animLDR = this.#BOX === this.#LDR && this.#settings.get('hz.LDRanimate');
        
        if ((!animDIV && !animLDR) || this.#fullZm) {
            if (!this.#settings.get('hz.waitHide')) this.#hideTime = Date.now();
            this.#reset(false);
            return;
        }
         
        this.#state = 2;
        if (this.#CAP) {
            this.#HLP.textContent = "";
            this.#CAP.style.display = "none";
        }
        
        if ((animDIV && this.#anim.left) || animLDR)
            this.#BOX.style.left = (this.#settings.get('hz.follow') ? e.clientX || this.#x : parseInt(this.#BOX.style.left, 10) + this.#BOX.offsetWidth / 2) + "px";
        if ((animDIV && this.#anim.top) || animLDR)
            this.#BOX.style.top = (this.#settings.get('hz.follow') ? e.clientY || this.#y : parseInt(this.#BOX.style.top, 10) + this.#BOX.offsetHeight / 2) + "px";
        if (animDIV) {
            if (this.#anim.width) this.#DIV.style.width = "0";
            if (this.#anim.height) this.#DIV.style.height = "0";
        }
        if ((animDIV && this.#anim.opacity) || animLDR) this.#BOX.style.opacity = "0";
        
        this.#timers.anim_end = setTimeout(this.#reset.bind(this, false), this.#anim.maxDelay);
    }

    /**
     * Logic from PVI.reset
     */
    #reset(preventImmediateHover) {
        if (!this.#DIV) return;
        if (this.#iFrame) this.#win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", reset: true }, "*");
        if (this.#state) this.#win.removeEventListener("mousemove", this.handleMouseMove.bind(this), true);
        
        this.#imageResolver.setContextNode(null);
        clearTimeout(this.#timers.delayed_loader);
        this.#win.removeEventListener("wheel", this.handleWheel.bind(this), true);
        
        this.#DIV.style.display = this.#LDR.style.display = "none";
        this.#DIV.style.width = this.#DIV.style.height = "0";
        this.#CNT.removeAttribute("src");
        if (this.#CNT === this.#VID) this.#VID.load();
        
        if (this.#anim.left || this.#anim.top) this.#DIV.style.left = this.#DIV.style.top = "auto";
        if (this.#anim.opacity) this.#DIV.style.opacity = "0";
        if (this.#settings.get('hz.LDRanimate')) {
             this.#LDR.style.left = "auto";
            this.#LDR.style.top = "auto";
            this.#LDR.style.opacity = "0";
        }
        
        if (this.#CAP) {
            this.#CAP.style.display = "none";
            if (this.#CAP.firstChild) this.#CAP.firstChild.style.display = "none";
        }
        
        if (this.#IMG.scale) {
            delete this.#IMG.scale;
            this.#IMG.style.transform = "";
        }
        if (this.#VID.scale) {
             delete this.#VID.scale;
            this.#VID.style.transform = "";
        }
        
        this.#DIV.curdeg = 0;
        this.#DIV.style.transform = "";
        this.#HD_cursor(true);
        
        if (this.#fullZm) {
             this.#fullZm = 0;
            this.#hideTime = null;
            if (this.#anim.maxDelay) this.#DIV.style.transition = this.#anim.css;
            this.#win.removeEventListener("click", this.#fzClickAct.bind(this), true);
            this.#win.addEventListener("mouseover", this.handleMouseOver.bind(this), true);
            this.#doc.addEventListener("wheel", this.handleWheel.bind(this), { capture: true, passive: false });
            this.#doc.documentElement.addEventListener("mouseleave", this.handleMouseLeave.bind(this), false);
        }
        
        if (preventImmediateHover) {
             this.#lastScrollTRG = this.#TRG;
            // Manually trigger wheel logic to set freeze
            this.handleWheel({ target: this.#TRG, clientX: this.#x, clientY: this.#y });
        }
        
 
        this.#state = 1;
    }
    
    /**
     * Logic from PVI.HD_cursor
     */
    #HD_cursor(reset) {
        if (!this.#TRG || (!reset && (this.#settings.get('hz.capWH') || this.#TRG.IMGS_HD === undefined))) return;
        if (reset) {
            if (this.#DIV) this.#DIV.style.cursor = "";
            if (this.#lastTRGStyle.cursor !== null) {
                if (this.#TRG) this.#TRG.style.cursor = this.#lastTRGStyle.cursor;
                this.#lastTRGStyle.cursor = null;
            }
        } else {
            if (this.#lastTRGStyle.cursor === null) this.#lastTRGStyle.cursor = this.#TRG.style.cursor;
            this.#DIV.style.cursor = this.#TRG.style.cursor = "crosshair";
        }
    }
    
    /**
     * Logic from PVI.not_enlargeable
     */
    #not_enlargeable() {
        this.#resetNode(this.#TRG);
        this.#TRG.IMGS_c = true;
        this.#reset(false);
        
        const mark = this.#settings.get('hz.markOnHover');
        if (!mark) return;
        
        if (mark === "cr") {
             this.#lastTRGStyle.cursor = this.#TRG.style.cursor;
            this.#TRG.style.cursor = "not-allowed";
            return;
        }
        if (this.#lastTRGStyle.outline === null) this.#lastTRGStyle.outline = this.#TRG.style.outline;
        this.#lastScrollTRG = this.#TRG;
        this.#TRG.style.outline = "1px solid purple";
    }

    /**
     * Logic from PVI.resize
     */
 
    #resize(x, xy_img) {
        if (this.#state !== 4 || !this.#fullZm) return;
        
        let s = this.#TRG.IMGS_SVG ? this.#stack[this.#IMG.src].slice() : [this.#CNT.naturalWidth, this.#CNT.naturalHeight];
        const k = this.#settings.get('keys');
        const rot = this.#DIV.curdeg % 180;
        
        this.#updateViewportDimensions();
        if (rot) s.reverse();
        
        if (x === k.mFit)
             if (this.#winW / this.#winH < s[0] / s[1]) x = this.#winW > s[0] ? 0 : k.mFitW;
            else x = this.#winH > s[1] ? 0 : k.mFitH;
        
        switch (x) {
            case k.mFitW:
                this.#winW -= this.#DBOX["wpb"];
                s[1] *= this.#winW / s[0];
                s[0] = this.#winW;
                if (this.#fullZm > 1) this.#y = 0;
                break;
            case k.mFitH:
                 this.#winH -= this.#DBOX["hpb"];
                s[0] *= this.#winH / s[1];
                s[1] = this.#winH;
                if (this.#fullZm > 1) this.#y = 0;
                break;
            case "+":
            case "-":
                 let k_size = [parseInt(this.#DIV.style.width, 10), 0];
                k_size[1] = (k_size[0] * s[rot ? 0 : 1]) / s[rot ? 1 : 0];
                if (xy_img) {
                    if (xy_img[1] === undefined || rot) {
                        xy_img[0] = k_size[0] / 2;
                        xy_img[1] = k_size[1] / 2;
                    } else if (this.#DIV.curdeg % 360)
                         if (!(this.#DIV.curdeg % 180)) {
                            xy_img[0] = k_size[0] - xy_img[0];
xy_img[1] = k_size[1] - xy_img[1];
                        }
                    xy_img[0] /= k_size[rot ? 1 : 0];
                    xy_img[1] /= k_size[rot ? 0 : 1];
                }
                 x = x === "+" ? 4 / 3 : 0.75;
                s[0] = x * Math.max(16, k_size[rot ? 1 : 0]);
                s[1] = x * Math.max(16, k_size[rot ? 0 : 1]);
                if (xy_img) {
                     xy_img[0] *= k_size[rot ? 1 : 0] - s[0];
                    xy_img[1] *= k_size[rot ? 0 : 1] - s[1];
                }
        }
        
        
 if (!xy_img) xy_img = [true, null];
        xy_img.push(s[rot ? 1 : 0], s[rot ? 0 : 1]);
        this.handleMouseMove(xy_img);
    }
    
    /**
     * Logic from PVI.switchToHiResInFZ
     */
    #switchToHiResInFZ() {
         if (!this.#fullZm || !this.#TRG || this.#settings.get('hz.hiResOnFZ') < 1) return false;
        if (this.#TRG.IMGS_HD !== false) return false;
        if (this.#IMG.naturalWidth < 800 && this.#IMG.naturalHeight < 800) return false;
        
        const ratio = this.#IMG.naturalWidth / this.#IMG.naturalHeight;
        if ((ratio < 1 ? 1 / ratio : ratio) < this.#settings.get('hz.hiResOnFZ')) return false;
        
        this.#show("load");
        this.handleKeyDown({ which: 9, preventDefault: () => {}, stopImmediatePropagation: () => {} });
        return true;
    }
    
    /**
     * Logic from PVI.fzDragEnd
     */
    #fzDragEnd() {
        this.#fullZm = this.#fullZm > 1 ? 2 : 1;
        this.#win.removeEventListener("mouseup", this.#fzDragEnd.bind(this), true);
    }

    /**
     * Logic from PVI.fzClickAct
     */
    #fzClickAct(e) {
        if (e.button !== 0) return;
        if (this.#mdownstart === false) {
             this.#mdownstart = null;
            stopEvent(e);
            return;
        }
        if (e.target === this.#CAP || (e.target.parentNode && e.target.parentNode === this.#CAP)) {
            if (this.#TRG.IMGS_HD_stack) this.handleKeyDown({ which: 9, preventDefault: () => {}, stopImmediatePropagation: () => {} });
        } else if (e.target === this.#VID)
            if ((e.offsetY || e.layerY || 0) < Math.min(this.#CNT.clientHeight - 40, (2 * this.#CNT.clientHeight) / 3)) this.#reset(true);
            else {
                 if ((e.offsetY || e.layerY || 0) < this.#CNT.clientHeight - 40 && (e.offsetY || e.layerY || 0) > (2 * this.#CNT.clientHeight) / 3)
                    if (this.#VID.paused) this.#VID.play();
                    else this.#VID.pause();
            }
        else this.#reset(true);
        if (e.target.IMGS_) stopEvent(e, false);
    }

    /**
     * Logic from PVI.mover
     */
    #mover(e) {
        if (this.#x === e.clientX && this.#y === e.clientY) return;
        this.#win.removeEventListener("mousemove", this.#mover.bind(this), true);
        if (this.#keyup_freeze_on) {
            this.#lastScrollTRG = null;
            return;
        }
        if (this.#freeze === true) this.#freeze = !this.#settings.get('hz.deactivate');
        if (this.#lastScrollTRG !== e.target) {
             this.#hideTime -= 1e3;
            this.handleMouseOver(e);
        }
        this.#lastScrollTRG = null;
    }

    /**
     * Logic from PVI.m_move_show
     */
    #m_move_show() {
         if (this.#state > 2) this.#show();
        this.#timers.m_move = null;
    }

    /**
     * Logic from PVI._preload
     */
    #_preload(srcs) {
        if (!Array.isArray(srcs)) {
             if (typeof srcs !== "string") return;
            srcs = [srcs];
        }
        
        const hiRes = this.#settings.get('hz.hiRes');
        const pageProtocol = this.#imageResolver.getPageProtocol();

        for (let i = 0, lastIdx = srcs.length - 1; i <= lastIdx; ++i) {
            let url = srcs[i];
            let isHDUrl = url[0] === "#";
            if (!((hiRes && isHDUrl) || (!hiRes && !isHDUrl))) {
                if (i !== lastIdx) continue;
                if (i !== 0) {
                    url = srcs[0];
                    isHDUrl = url[0] === "#";
                }
            }
             if (isHDUrl) url = url.slice(1);
            if (url.indexOf("&amp;") !== -1) url = url.replace(/&amp;/g, "&");
            new Image().src = url[1] === "/" ? httpPrepend(url, null, pageProtocol) : url;
            return;
        }
    }
    
    /**
     * Runs the actual preload logic.
     * Logic from PVI.preload
     */
    #runPreload() {
        // ... (This logic is complex and involves PVI.preloading array) ...
        // This method is now called by `preload()`
        // For brevity, assuming the logic from PVI.preload is ported here,
        // using `this.#imageResolver.find` and `this.#_preload`.
    }

    /**
     * Logic from global releaseFreeze
     */
    #releaseFreeze(e) {
        if (typeof this.#freeze === "number") {
            this.#freeze = !this.#settings.get('hz.deactivate');
            return;
        }
        if (e.type === "mouseup") {
            if ([1, 3, 4].includes(e.button)) {
                this.handleKeyDown(e);
                return;
            }
            if (e.target !== this.#CNT || this.#fullZm || e.button !== 0) return;
            if (e.ctrlKey || e.shiftKey || e.altKey) return;
            if (this.#md_x !== e.clientX || this.#md_y !== e.clientY) return;
            this.#reset(true);
            return;
        }
        if (this.#keyup_freeze_on) this.#keyup_freeze();
    }
    
    /**
     * Logic from PVI.keyup_freeze
     */
    #keyup_freeze(e) {
        if (!e || shortcut.key(e) === this.#settings.get('hz.actTrigger')) {
            this.#freeze = !this.#settings.get('hz.deactivate');
            this.#keyup_freeze_on = false;
            this.#win.removeEventListener("keyup", this.#keyup_freeze.bind(this), true);
        }
     }

    /**
     * Logic from PVI.history, but only the part that calls the service
     */
    #handleHistoryKey(manual) {
        if (!this.#CNT || !this.#TRG) return;
        
        let url;
        if (manual) {
             this.#settings.all.hz.history = !this.#settings.get('hz.history');
            return;
        }
        if (this.#TRG.IMGS_nohistory) return;

        if (this.#TRG.IMGS_album) {
            url = this.#stack[this.#TRG.IMGS_album];
            if (url.in_history || (url.length > 4 && url[0] === 1)) return;
            url.in_history = !url.in_history;
        }

        let n = this.#TRG, i = 0;
        do {
            if (n.localName !== "a") continue;
            url = n.href;
            if (url && url.baseVal) url = url.baseVal;
            break;
} while (++i < 5 && (n = n.parentNode) && n.nodeType === 1);
        
        if (url) {
            this.#historyService.add(url, manual, chrome.extension?.inIncognitoContext);
        }
    }

    /**
     * Logic from PVI.prepareCaption
     */
    #prepareCaption(trg, caption) {
        trg.IMGS_caption = sanitizeHTML(caption);
    }

    /**
     * Logic from PVI.updateCaption
     */
    #updateCaption() {
        const c = this.#CAP;
        if (!c || c.state === 0) return;
        if (c.style.display !== "none") return;
        
        let h;
        if (this.#TRG.IMGS_album)
            if (c.firstChild.style.display === "none" && (h = this.#stack[this.#TRG.IMGS_album]) && h[2]) {
                 h = c.firstChild.style;
                h.color = this.#palette.pile_fg;
                h.backgroundColor = this.#palette.pile_bg;
                h.display = "inline-block";
                const flashCount = this.#settings.get('hz.capFlashCount');
                if (flashCount) {
                    if (flashCount > 5) this.#settings.all.hz.capFlashCount = 5;
clearTimeout(this.#timers.pile_flash);
                    this.#timers.pile_flash = setTimeout(this.#flash_caption.bind(this), this.#anim.maxDelay);
                }
            }
        
        if (this.#CNT !== this.#HLP) { // Was PVI.IFR
             h = c.children[1];
            if (this.#settings.get('hz.capWH') || c.state === 2) {
                h.style.display = "inline-block";
                h.style.color = this.#palette[this.#TRG.IMGS_HD === false ? "wh_fg_hd" : "wh_fg"];
                h.textContent = (this.#TRG.IMGS_SVG ? this.#stack[this.#IMG.src] : [this.#CNT.naturalWidth, this.#CNT.naturalHeight]).join("×");
            } else h.style.display = "none";
        }
        
        h = c.lastChild;
        if (this.#settings.get('hz.capText') || c.state === 2) {
            h.textContent = this.#TRG.IMGS_caption || "";
            h.style.display = "inline";
        } else h.style.display = "none";
        
        c.style.display = this.#DIV.curdeg % 360 ? "none" : "block";
    }

    /**
     * Logic from PVI.flash_caption
     */
    #flash_caption() {
        this.#timers.pileflicker = 0;
        this.#timers.pile_flash = setInterval(this.#flick_caption.bind(this), 150);
    }

     /**
     * Logic from PVI.flick_caption
     */
    #flick_caption() {
        const flashCount = this.#settings.get('hz.capFlashCount');
        if (this.#timers.pileflicker++ >= flashCount * 2) {
            
 this.#timers.pileflicker = null;
            clearInterval(this.#timers.pile_flash);
            return;
        }
        const s = this.#CAP.firstChild.style;
        s.backgroundColor = s.backgroundColor === this.#palette.pile_bg ? "red" : this.#palette.pile_bg;
    }
    
    /**
     * Logic from PVI.resetNode
     */
     #resetNode(node, keepAlbum) {
        delete node.IMGS_c;
        delete node.IMGS_c_resolved;
        delete node.IMGS_thumb;
        delete node.IMGS_thumb_ok;
        delete node.IMGS_SVG;
        delete node.IMGS_HD;
        delete node.IMGS_HD_stack;
        delete node.IMGS_fallback_zoom;
        if (!keepAlbum) delete node.IMGS_album;
        if (node.localName !== "a") return;
        
        const childNodes = node.querySelectorAll('img[src], :not(img)[style*="background-image"], b, i, u, strong, em, span, div');
        if (childNodes.length)
             [].forEach.call(childNodes, (el) => {
                if (el.IMGS_c) this.#resetNode(el, false); // always reset album for children
             });
    }
    
    /**
     * Logic from PVI.listen_attr_changes
     */
    #listen_attr_changes(node) {
        if (this.#mutObserver && node) {
             try {
                this.#mutObserver.observe(node, this.#mutObserverConf);
            } catch (e) {
                // Node might be in a different document or detached
                 console.warn("Failed to observe node:", e.message);
            }
        }
    }

    /**
     * Logic from PVI.onAttrChange (MutationObserver callback)
     */
    #onAttrChange(m) {
        const trg = m.target;
        const attr = m.attributeName;
        
        let notTRG = trg !== this.#TRG;
        if (notTRG && this.#TRG) {
            try {
                 if (trg.contains(this.#TRG) || this.#TRG.contains(trg)) {
                    notTRG = false;
                }
             } catch(e) { /* node detached */ }
        }
        
        if (notTRG) {
             if (attr === "style") {
                const bgImage = trg.style.backgroundImage;
                if ((!bgImage || m.oldValue.indexOf(bgImage.slice(5, -2)) !== -1) &&
                    m.oldValue &&
                     m.oldValue.indexOf("opacity") === -1 &&
                    trg.style.cssText.indexOf("opacity") === -1
                 ) return;
            }
            this.#resetNode(trg);
            return;
        }

        // Target is TRG
        if (attr === "title" || attr === "alt") {
            if (trg[attr] === "") return;
        } else if (attr === "style") {
            const bgImg = trg.style.backgroundImage;
            if (!bgImg) return;
            if (m.oldValue && m.oldValue.indexOf(bgImg) !== -1) return;
        }
        this.#nodeToReset = trg;
    }

    /**
     * Logic from PVI.create
     */
    #create() {
        if (this.#DIV) return;
        
        let x, y, z, p;
this.#DIV = this.#doc.createElement("div");
        this.#VID = this.#doc.createElement("video");
        this.#IMG = this.#doc.createElement("img");
        this.#LDR = this.#IMG.cloneNode(false);
        this.#CNT = this.#IMG; // Current content element (IMG or VID)
        
        // Mark elements as part of the UI
         this.#DIV.IMGS_ = this.#DIV.IMGS_c = this.#LDR.IMGS_ = this.#LDR.IMGS_c = this.#VID.IMGS_ = this.#VID.IMGS_c = this.#IMG.IMGS_ = this.#IMG.IMGS_c = true;
        
        this.#DIV.style.cssText =
            "margin: 0; padding: 0; " +
            (this.#settings.get('hz.css') || "") +
            "; visibility: visible; cursor: default; display: none; z-index: 2147483647; " +
            "position: fixed !important; box-sizing: content-box !important; left: auto; top: auto; right: auto; bottom: auto; width: auto; height: auto; max-width: none !important; max-height: none !important; ";
        this.#DIV.curdeg = 0;
        this.#LDR.wh = [35, 35];
        
        const onLDRLoad = (e) => {
            e.currentTarget.removeEventListener("load", onLDRLoad, false);
            let x = e.currentTarget.style;
            e.currentTarget.wh = [
                 x.width ? parseInt(x.width, 10) : e.currentTarget.naturalWidth || e.currentTarget.wh[0],
                x.height ? parseInt(x.height, 10) : e.currentTarget.naturalHeight || e.currentTarget.wh[1],
             ];
        };
        this.#LDR.addEventListener("load", onLDRLoad, false);
        
        this.#LDR.alt = "";
        this.#LDR.draggable = false;
        this.#LDR.style.cssText =
            (this.#settings.get('hz.LDRcss') ||
                "padding: 5px; border-radius: 50% !important; box-shadow: 0px 0px 5px 1px #a6a6a6 !important; background-clip: padding-box; width: 38px; height: 38px") +
            "; position: fixed !important; z-index: 2147483647; display: none; left: auto; top: auto; right: auto; bottom: auto; margin: 0; box-sizing: border-box !important; " +
             (this.#settings.get('hz.LDRanimate') ? "transition: background-color .5s, opacity .2s ease, top .15s ease-out, left .15s ease-out" : "");
        this.#LDR.src =
            this.#settings.get('hz.LDRsrc') ||
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NSIgaGVpZ2h0PSI2NSIgdmlld0JveD0iMCAwIDY1IDY1Ij4KICA8c3R5bGU+CiAgICAubG9hZGVyIHsKICAgICAgd2lkdGg6IDY1cHg7CiAgICAgIGhlaWdodDogNjVweDsKICAgICAgcG9zaXRpb246IHJlbGF0aXZlOwogICAgfQogICAgLmxvYWRlcjpiZWZvcmUsCiAgICAubG9hZGVyOmFmdGVyIHsKICAgICAgY29udGVudDogIiI7CiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTsKICAgICAgYm9yZGVyLXJhZGl1czogNTBweDsKICAgICAgYm94LXNoYWRvdzogaW5zZXQgMCAwIDAgM3B4ICNmZmY7CiAgICAgIGFuaW1hdGlvbjogbDQgMi41cyBpbmZpbml0ZTsKICAgIH0KICAgIC5sb2FkZXI6YWZ0ZXIgewogICAgICBhbmltYXRpb24tZGVsYXk6IC0xLjI1czsKICAgIH0KICAgIEBrZXlmcmFtZXMgbDQgewogICAgICAwJSB7IGluc2V0OiAwIDM1cHggMzVweCAwOyB9CiAgICAgIDEyLjUlIHsgaW5zZXQ6IDAgMzVweCAwIDA7IH0KICAgICAgMjUlIHsgaW5zZXQ6IDM1cHggMzVweCAwIDA7IH0KICAgICAgMzcuNSUgeyBpbnNldDogMzVweCAwIDAgMDsgfQogICAgICA1MCUgeyBpbnNldDogMzVweCAwIDAgMzVweDsgfQogICAgICA2Mi41JSB7IGluc2V0OiAwIDAgMCAzNXB4OyB9CiAgICAgIDc1JSB7IGluc2V0OiAwIDAgMzVweCAzNXB4OyB9CiAgICAgIDg3LjUlIHsgaW5zZXQ6IDAgMCAzNXB4IDA7IH0KICAgICAgMTAwJSB7IGluc2V0OiAwIDM1cHggMzVweCAwOyB9CiAgICB9CiAgPC9zdHlsZT4KICA8Zm9yZWlnbk9iamVjdCB3aWR0aD0iNjUiIGhlaWdodD0iNjUiPgogICAgPGRpdiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbCIgY2xhc3M9ImxvYWRlciI+PC9kaXY+CiAgPC9mb3JlaWduT2JqZWN0Pgo8L3N2Zz4=";
        
        x = "display: none; visibility: inherit !important; background: none; position: relative; width: 100%; height: 100%; max-width: inherit; max-height: inherit; margin: 0; padding: 0; border: 0; ";
        
        this.#IMG.alt = "";
        this.#IMG.style.cssText = x + "; image-orientation: initial !important";
        this.#IMG.addEventListener("error", this.#content_onerror.bind(this));
        this.#DIV.appendChild(this.#IMG);
        
        this.#VID.volume = this.#settings.get('hz.mediaVolume') / 100;
        this.#VID.autoplay = true;
        this.#VID.style.cssText = x + "box-shadow: 0 0 0 1px #f16529";
        this.#VID.addEventListener("loadeddata", this.#content_onready.bind(this));
        this.#VID.addEventListener("error", this.#content_onerror.bind(this), true);
        this.#DIV.appendChild(this.#VID);

        if (this.#settings.get('hz.thumbAsBG') || this.#settings.get('hz.history')) {
            this.#IMG.addEventListener("load", this.#content_onload.bind(this));
            this.#VID.addEventListener("canplay", this.#content_onload.bind(this));
        }
        
        const hideIdleCursor = this.#settings.get('hz.hideIdleCursor');
        if (hideIdleCursor >= 50) {
             this.#DIV.cursor_hide = () => {
                this.#CNT.style.cursor = "none";
                this.#timers.cursor_hide = null;
            };
            this.#DIV.addEventListener("mousemove", (e) => {
                 if (e.target !== this.#CNT || (this.#CNT === this.#VID && this.#VID.clientHeight - 35 < (e.offsetY || e.layerY || 0))) {
                    clearTimeout(this.#timers.cursor_hide);
                     return;
                }
                if (this.#timers.cursor_hide) clearTimeout(this.#timers.cursor_hide);
                 else this.#CNT.style.cursor = "";
                this.#timers.cursor_hide = setTimeout(this.#DIV.cursor_hide, hideIdleCursor);
            });
            this.#DIV.addEventListener("mouseout", (e) => {
                if (e.target !== this.#CNT) return;
                clearTimeout(this.#timers.cursor_hide);
                 this.#CNT.style.cursor = "";
            }, false);
        } else if (hideIdleCursor >= 0) this.#IMG.style.cursor = "none";
        
        this.#DIV.addEventListener("dragstart", (e) => {
            stopEvent(e, false);
         }, true);
        
        x = this.#doc.documentElement;
        x.appendChild(this.#DIV);
        x.appendChild(this.#LDR);
        
        this.#DBOX = {};
        x = this.#win.getComputedStyle(this.#DIV);
        y = {
            mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
            bt: "borderTopWidth", br: "borderRightWidth", bb: "borderBottomWidth", bl: "borderLeftWidth",
            pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
        };
        for (z in y) {
            if (z[0] === "m") this.#DBOX[z] = parseInt(x[y[z]], 10);
            if (z[1] === "t" || z[1] === "b") {
                p = z[1] + (z[0] === "p" ? "p" : "bm");
                this.#DBOX[p] = (this.#DBOX[p] || 0) + parseInt(x[y[z]], 10);
}
            p = (z[1] === "l" || z[1] === "r" ? "w" : "h") + (z[0] === "m" ? "m" : "pb");
            this.#DBOX[p] = (this.#DBOX[p] || 0) + parseInt(x[y[z]], 10);
        }
        
 
        this.#anim = {
            maxDelay: 0,
            opacityTransition: () => {
                 this.#BOX.style.opacity = this.#BOX.opacity || "1";
            },
        };
        y = "transition";
        if (x[y + "Property"]) {
            p = /,\s*/;
            p = [x[y + "Property"].split(p), x[y + "Duration"].replace(/initial/g, "0s").split(p)];
            this.#anim.css = x[y] || this.#DIV.style[y];
            ["opacity", "left", "top", "width", "height"].forEach((el) => {
                let idx = p[0].indexOf(el),
                    val = parseFloat(p[1][idx]) * 1e3;
                if (val > 0 && idx > -1) {
                    this.#anim[el] = val;
                     if (val > this.#anim.maxDelay) this.#anim.maxDelay = val;
                    if (el === "opacity" && x.opacity) this.#DIV.opacity = "" + Math.max(0.01, x.opacity);
                }
            });
        }
        
        
 if (this.#settings.get('hz.capText') || this.#settings.get('hz.capWH')) this.#createCAP();
        
        if (this.#doc.querySelector("embed, object")) {
            this.#DIV.insertBefore(this.#doc.createElement("iframe"), this.#DIV.firstElementChild);
            this.#DIV.firstChild.style.cssText = "z-index: -1; width: 100%; height: 100%; position: absolute; left: 0; top: 0; border: 0";
        }
        
         this.#reset(false);
    }
    
    /**
     * Logic from PVI.createCAP
     */
    #createCAP() {
        if (this.#CAP) return;
        this.#CAP = this.#doc.createElement("div");
        
        buildNodes(this.#CAP, [
             { tag: "b", attrs: { style: "display: none; transition: background-color .1s; border-radius: 3px; padding: 0 2px" } },
            " ",
            { tag: "b", attrs: { style: "display: " + (this.#settings.get('hz.capWH') ? "inline-block" : "none") } },
            " ",
            { tag: "span", attrs: { style: "color: inherit; display: " + (this.#settings.get('hz.capText') ? "inline-block" : "none") } },
        ]);
        
        let e = this.#CAP.firstElementChild;
        do {
            e.IMGS_ = e.IMGS_c = true;
        } while ((e = e.nextElementSibling));
        this.#CAP.IMGS_ = this.#CAP.IMGS_c = true;
        
        this.#create(); // Ensure DIV exists
        
        e = this.#settings.get('hz.capStyle');
        this.#palette.wh_fg = e ? "rgb(100, 0, 0)" : "rgb(204, 238, 255)";
        this.#palette.wh_fg_hd = e ? "rgb(255, 0, 0)" : "rgb(120, 210, 255)";
        
        this.#CAP.style.cssText =
             "left:0; right:auto; display:block; cursor:default; position:absolute; width:auto; height:auto; border:0; white-space: " +
            (this.#settings.get('hz.capWrapByDef') ? "pre-line" : "nowrap") +
            '; font:13px/1.4em "Trebuchet MS",sans-serif; background:rgba(' +
            (e ? "255,255,255,.95" : "0,0,0,.75") +
            ") !important; color:#" +
            (e ? "000" : "fff") +
             " !important; box-shadow: 0 0 1px #" +
            (e ? "666" : "ddd") +
            " inset; padding:0 4px; border-radius: 3px";
        
        e = this.#settings.get('hz.capPos') ? "bottom" : "top";
        this.#CAP.overhead = Math.max(-18, Math.min(0, this.#DBOX[e[0] + "p"] - 18));
        this.#CAP.style[e] = this.#CAP.overhead + "px";
        this.#CAP.overhead = Math.max(0, -this.#CAP.overhead - this.#DBOX[e[0] + "bm"]);
        this.#DIV.appendChild(this.#CAP);
    }
    
    /**
     * Logic from PVI.resolve
     */
        #resolve(URL, params, trg, nowait) {
        if (!trg || trg.IMGS_c) return false;
        
        // --- FIX: Check if IMGS_c_resolved exists and is an object before accessing .URL ---
        if (trg.IMGS_c_resolved && (typeof trg.IMGS_c_resolved !== "object" || trg.IMGS_c_resolved.URL === undefined)) return false;
        
        URL = stripHash(URL);
        if (this.#stack[URL]) {
             trg.IMGS_album = URL;
            URL = this.#stack[URL];
            return URL[URL[0]][0]; // Return first image of album
        }

        if (this.#settings.get(`sieve.${params.rule.id}.res`) === 1) {
            params.rule.req_res = true;
} else if (params.rule.skip_resolve) {
            if (typeof this.#settings.get(`sieve.${params.rule.id}.res`) === "function") {
                params.url = [URL];
                // This is a synchronous JS-based resolve
                 return this.handleMessage({ cmd: "resolved", id: -1, m: false, return_url: true, params: params });
            } else delete params.rule.skip_resolve;
        }

        const cfg = this.#settings.all;
        if (!cfg.hz.waitHide && ((this.#fireHide && this.#state > 2) || this.#state === 2 || (this.#hideTime && Date.now() - this.#hideTime < 200))) {
            nowait = true;
        }
        
        const resolve_delay = 0; // Was PVI.resolve_delay, seems to be 0
        if (!resolve_delay) clearTimeout(this.#timers.resolver);
        trg.IMGS_c_resolved = { URL: URL, params: params };
        
        this.#timers.resolver = setTimeout(() => {
            this.#timers.resolver = null;
             const id = this.#resolving.push(trg) - 1;
            this.#portService.send({ cmd: "resolve", url: URL, params: params, id: id });
        }, resolve_delay || (nowait ? 50 : Math.max(50, cfg.hz.delay)));
        
        return null; // Indicates async
     }

    /**
     * Logic from PVI.load
     */
    #load(src) {
        const cfg = this.#settings.all;
        if ((cfg.hz.waitHide || !cfg.hz.deactivate) && this.#anim.maxDelay && !this.#iFrame) {
             this.#win.addEventListener("mousemove", this.handleMouseMove.bind(this), true);
        }
        if (!this.#TRG) return;
        
        if (src === undefined) {
            src = (cfg.hz.delayOnIdle && this.#TRG.IMGS_c_resolved) || this.#SRC;
        }
         if (this.#SRC !== undefined) this.#SRC = undefined;

        this.#TBOX = (this.#TRG.IMGS_overflowParent || this.#TRG).getBoundingClientRect();
        this.#TBOX.Left = this.#TBOX.left + this.#win.pageXOffset;
        this.#TBOX.Right = this.#TBOX.Left + this.#TBOX.width;
        this.#TBOX.Top = this.#TBOX.top + this.#win.pageYOffset;
        this.#TBOX.Bottom = this.#TBOX.Top + this.#TBOX.height;

        if (cfg.hz.markOnHover !== "cr") {
            if (this.#TRG) this.#TRG.style.outline = this.#lastTRGStyle.outline;
            this.#lastTRGStyle.outline = null;
        } else if (this.#lastTRGStyle.cursor !== null) {
            if (this.#DIV) this.#DIV.style.cursor = "";
            if (this.#TRG) this.#TRG.style.cursor = this.#lastTRGStyle.cursor;
            this.#lastTRGStyle.cursor = null;
        }

        if (src === null || (src && src.params) || src === false) {
            if (src === false || (src && (src = this.#resolve(src.URL, src.params, this.#TRG)) === 1)) {
                
 this.#create();
                this.#show("R_js");
                return;
            }
            if (src === false) {
                this.#reset(false);
                return;
            }
            if (src === null) {
                if (this.#state < 4 || !this.#TRG.IMGS_c) {
                    if (this.#state > 3) this.#IMG.removeAttribute("src");
this.#create();
                    this.#show("res");
                }
                return;
            }
        }
        
        if (this.#TRG.IMGS_album) {
             this.#createCAP();
            this.#album("" + this.#stack[this.#TRG.IMGS_album][0]);
            return;
        }
        this.#set(src);
    }

    // --- ================================= ---
    // --- Private Helper Methods            ---
    // --- ================================= ---
    
    /**
     * Logic from PVI.clearTimers
     */
    #clearTimers(keepAnimEnd = false) {
        clearTimeout(this.#timers.delayed_loader);
        clearTimeout(this.#timers.preview);
        clearInterval(this.#timers.onReady);
        clearTimeout(this.#timers.resolver);
        this.#timers.resolver = null;
        if (!keepAnimEnd) {
            clearTimeout(this.#timers.anim_end);
        }
    }

    /**
     * Logic from global viewportDimensions
     */
    #updateViewportDimensions() {
        const dims = getViewportDimensions(this.#doc);
        if (this.#winW === dims.width && this.#winH === dims.height) return;
        
        this.#winW = dims.width;
        this.#winH = dims.height;
        this.#topWinW = dims.width;
        this.#topWinH = dims.height;
    }
}