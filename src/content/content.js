"use strict";
(function (win, doc) {
    if (!doc || doc instanceof win.HTMLDocument === false) return;
    var imgDoc = doc.images && doc.images.length === 1 && doc.images[0];
    if (imgDoc && imgDoc.parentNode === doc.body && imgDoc.src === win.location.href) return;

    const toggleFlipTransform = function (el, ori) {
        if (!el.scale) el.scale = { h: 1, v: 1 };
        el.scale[ori ? "h" : "v"] *= -1;
        ori = el.scale.h !== 1 || el.scale.v !== 1 ? "scale(" + el.scale.h + "," + el.scale.v + ")" : "";
        if (el.curdeg) ori += " rotate(" + el.curdeg + "deg)";
        el.style.transform = ori;
    };

    const preventEvent = function (e, d, p) {
        if (!e || !e.preventDefault || !e.stopPropagation) return;
        if (d === undefined || d === true) e.preventDefault();
        if (p !== false) e.stopImmediatePropagation();
    };

    const openImageInHosts = function (request) {
        const candidateUrl = request?.url;
        if (!candidateUrl || !/^https?:/i.test(candidateUrl)) {
            console.warn("Imagus Reborn: blocked non-http(s) sendTo URL.", candidateUrl);
            return;
        }

        const hosts = cfg?.tls?.sendToHosts || [];
        if (!Array.isArray(hosts) || !hosts.length) {
            console.warn("Imagus Reborn: no sendTo hosts configured.");
            return;
        }

        const urls = [];
        for (let index = 0; index < hosts.length; index += 1) {
            const [hostMeta, hostTemplate] = hosts[index] || [];
            if (!hostMeta || !hostTemplate) continue;
            if (request.host === index || (request.host === undefined && hostMeta[0] === "+")) {
                const safeUrl = hostTemplate.replace("%url", encodeURIComponent(candidateUrl)).replace("%raw_url", candidateUrl);
                urls.push(safeUrl);
            }
        }

        if (urls.length) {
            Port.send({ cmd: "open", url: urls, nf: !!request?.nf });
        }
    };

    const extractBackgroundImageUrls = function (imgs) {
        if (imgs)
            if (Array.isArray((imgs = imgs.match(/\burl\(([^'"\)][^\)]*|"[^"\\]+(?:\\.[^"\\]*)*|'[^'\\]+(?:\\.[^'\\]*)*)(?=['"]?\))/g)))) {
                var i = imgs.length;
                while (i--) imgs[i] = imgs[i].slice(/'|"/.test(imgs[i][4]) ? 5 : 4);
                return imgs;
            }
        return null;
    };

    const extractMediaSource = function (node) {
        var nname = node.nodeName.toUpperCase();
        if (nname === "IMG" || node.type === "image" || nname === "EMBED") return node.src;
        else if (nname === "CANVAS") return node.toDataURL();
        else if (nname === "OBJECT" && node.data) return node.data;
        else if (nname === "AREA") {
            var img = doc.querySelector('img[usemap="#' + node.parentNode.name + '"]');
            return img.src;
        } else if (nname === "VIDEO") {
            nname = doc.createElement("canvas");
            nname.width = node.clientWidth;
            nname.height = node.clientHeight;
            nname.getContext("2d").drawImage(node, 0, 0, nname.width, nname.height);
            return nname.toDataURL("image/jpeg");
        } else if (node.poster) return node.poster;
        return null;
    };

    let mouseDownStarted, viewportWidth, viewportHeight, topViewportWidth, topViewportHeight;
    const hashFragmentRegex = /#(?![?!].).*/;
    const svgExtensionRegex = /\.svgz?$/i;
    const updateViewportDimensions = function (targetDoc) {
        var d = targetDoc || doc;
        d = (d.compatMode === "BackCompat" && d.body) || d.documentElement;
        var w = d.clientWidth;
        var h = d.clientHeight;
        if (targetDoc) return { width: w, height: h };
        if (w === viewportWidth && h === viewportHeight) return;
        viewportWidth = w;
        viewportHeight = h;
        topViewportWidth = w;
        topViewportHeight = h;
    };

    const handleFreezeRelease = function (e) {
        if (typeof previewOverlay.freeze === "number") {
            previewOverlay.freeze = !cfg.hz.deactivate;
            return;
        }
        if (e.type === "mouseup") {
            if ([1, 3, 4].includes(e.button)) {
                previewOverlay.key_action(e);
                return;
            }
            if (e.target !== previewOverlay.CNT || previewOverlay.fullZm || e.button !== 0) return;
            if (e.ctrlKey || e.shiftKey || e.altKey) return;
            if (previewOverlay.md_x !== e.clientX || previewOverlay.md_y !== e.clientY) return;
            previewOverlay.reset(true);
            return;
        }
        if (previewOverlay.keyup_freeze_on) previewOverlay.keyup_freeze();
    };

    const handleMouseDown = function (e) {
        if (!cfg || !e.isTrusted) return;
        const root = doc.compatMode && doc.compatMode[0] === "B" ? doc.body : doc.documentElement;
        if (e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) return;

        const isRightButton = e.button === 2;
        const shouldFreeze = isRightButton && previewOverlay.freeze && previewOverlay.SRC !== undefined && !cfg.hz.deactivate;

        if (previewOverlay.fireHide && previewOverlay.state < 3 && !shouldFreeze) {
            previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG });
            if (!previewOverlay.freeze || previewOverlay.lastScrollTRG) previewOverlay.freeze = 1;
            return;
        }
        if (e.button === 0) {
            if (previewOverlay.fullZm) {
                mouseDownStarted = true;
                if (e.ctrlKey || previewOverlay.fullZm !== 2) return;
                preventEvent(e);
                previewOverlay.fullZm = 3;
                win.addEventListener("mouseup", previewOverlay.fzDragEnd, true);
                return;
            }
            if (e.target === previewOverlay.CNT) {
                previewOverlay.md_x = e.clientX;
                previewOverlay.md_y = e.clientY;
                return;
            }
            if (previewOverlay.fireHide) previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG, clientX: e.clientX, clientY: e.clientY });
            if (!previewOverlay.freeze || previewOverlay.lastScrollTRG) previewOverlay.freeze = 1;
            return;
        }

        if (!isRightButton) return;
        if (cfg.hz.actTrigger === "m2") {
            if (previewOverlay.fireHide && shouldFreeze) {
                previewOverlay.SRC = { m2: previewOverlay.SRC === null ? previewOverlay.TRG.IMGS_c_resolved : previewOverlay.SRC.m2 || previewOverlay.SRC };
            }
            previewOverlay.freeze = cfg.hz.deactivate;
        } else if (previewOverlay.keyup_freeze_on) {
            previewOverlay.keyup_freeze();
            previewOverlay.freeze = previewOverlay.freeze ? 1 : 0;
        }
        mouseDownStarted = e.timeStamp;
        previewOverlay.md_x = e.clientX;
        previewOverlay.md_y = e.clientY;

        if (e.target.href || e.target.parentNode?.href) {
            e.preventDefault();
        }
    };

    const handleContextMenu = function (e) {
        if (!mouseDownStarted || e.button !== 2 || previewOverlay.md_x !== e.clientX || previewOverlay.md_y !== e.clientY) {
            if (mouseDownStarted) mouseDownStarted = null;

            if (
                e.button === 2 &&
                (!previewOverlay.fireHide || previewOverlay.state > 2) &&
                (Math.abs(previewOverlay.md_x - e.clientX) > 5 || Math.abs(previewOverlay.md_y - e.clientY) > 5) &&
                cfg.hz.actTrigger === "m2" &&
                !cfg.hz.deactivate
            ) {
                preventEvent(e);
            }
            return;
        }

        const elapsed = e.timeStamp - mouseDownStarted >= 300;
        mouseDownStarted = null;

        const shouldFullZoom = previewOverlay.state > 2 && ((elapsed && cfg.hz.fzOnPress === 2) || (!elapsed && !previewOverlay.fullZm && cfg.hz.fzOnPress === 1));

        if (shouldFullZoom) {
            previewOverlay.key_action({ which: 13, shiftKey: previewOverlay.fullZm ? true : e.shiftKey });
            preventEvent(e);
            return;
        }

        var hasAltSrc = previewOverlay.state < 3 && previewOverlay.SRC && previewOverlay.SRC.m2 !== undefined;

        if (hasAltSrc) {
            if (elapsed) return;
            previewOverlay.load(previewOverlay.SRC.m2);
            previewOverlay.SRC = undefined;
            preventEvent(e);
            return;
        }

        if (elapsed && previewOverlay.state > 2 && !previewOverlay.fullZm && cfg.hz.fzOnPress === 1) {
            return;
        }

        if (e.target === previewOverlay.CNT) {
            preventEvent(e, false);
        } else if (e.ctrlKey && !elapsed && !e.shiftKey && !e.altKey && cfg.tls.opzoom && previewOverlay.state < 2) {
            const imgSrc = extractMediaSource(e.target) || extractBackgroundImageUrls(win.getComputedStyle(e.target).backgroundImage);

            if (imgSrc) {
                previewOverlay.TRG = previewOverlay.nodeToReset = e.target;
                previewOverlay.fireHide = true;
                previewOverlay.x = e.clientX;
                previewOverlay.y = e.clientY;
                previewOverlay.set(Array.isArray(imgSrc) ? imgSrc[0] : imgSrc);
                preventEvent(e);
            }
        }
    };

    const previewOverlay = {
        TRG: null,
        DIV: null,
        IMG: null,
        CAP: null,
        HLP: doc.createElement("a"),
        anim: {},
        stack: {},
        timers: {},
        resolving: [],
        lastTRGStyle: { cursor: null, outline: null },
        iFrame: false,
        state: null,
        rgxHTTPs: /^https?:\/\/(?:www\.)?/,
        pageProtocol: win.location.protocol.replace(/^(?!https?:).+/, "http:"),
        palette: {
            load: "rgb(255, 255, 255)",
            R_load: "rgb(255, 204, 204)",
            res: "rgb(222, 255, 205)",
            R_res: "rgb(255, 234, 128)",
            R_js: "rgb(200, 200, 200)",
            pile_fg: "#000",
            pile_bg: "rgb(255, 255, 0)",
        },

        convertSieveRegexes: function () {
            let s = cfg.sieve,
                i;
            if (!Array.isArray(s) || !(i = s.length) || typeof (s[0].link || s[0].img) !== "string") return;
            while (i--) {
                if (s[i].link) s[i].link = RegExp(s[i].link, s[i].ci && s[i].ci & 1 ? "i" : "");
                if (s[i].img) s[i].img = RegExp(s[i].img, s[i].ci && s[i].ci & 2 ? "i" : "");
            }
        },

        create: function () {
            if (previewOverlay.DIV) return;
            var x, y, z, p;
            previewOverlay.HLP = doc.createElement("a");
            previewOverlay.DIV = doc.createElement("div");
            previewOverlay.VID = doc.createElement("video");
            previewOverlay.IMG = doc.createElement("img");
            previewOverlay.LDR = previewOverlay.IMG.cloneNode(false);
            previewOverlay.CNT = previewOverlay.IMG;
            previewOverlay.DIV.IMGS_ = previewOverlay.DIV.IMGS_c = previewOverlay.LDR.IMGS_ = previewOverlay.LDR.IMGS_c = previewOverlay.VID.IMGS_ = previewOverlay.VID.IMGS_c = previewOverlay.IMG.IMGS_ = previewOverlay.IMG.IMGS_c = true;
            previewOverlay.DIV.style.cssText =
                "margin: 0; padding: 0; " +
                (cfg.hz.css || "") +
                "; visibility: visible; cursor: default; display: none; z-index: 2147483647; " +
                "position: fixed !important; box-sizing: content-box !important; left: auto; top: auto; right: auto; bottom: auto; width: auto; height: auto; max-width: none !important; max-height: none !important; ";
            previewOverlay.DIV.curdeg = 0;
            previewOverlay.LDR.wh = [35, 35];
            var onLDRLoad = function () {
                this.removeEventListener("load", onLDRLoad, false);
                onLDRLoad = null;
                var x = this.style;
                this.wh = [
                    x.width ? parseInt(x.width, 10) : this.naturalWidth || this.wh[0],
                    x.height ? parseInt(x.height, 10) : this.naturalHeight || this.wh[1],
                ];
            };
            previewOverlay.LDR.addEventListener("load", onLDRLoad, false);
            previewOverlay.LDR.alt = "";
            previewOverlay.LDR.draggable = false;
            previewOverlay.LDR.style.cssText =
                (cfg.hz.LDRcss ||
                    "padding: 5px; border-radius: 50% !important; box-shadow: 0px 0px 5px 1px #a6a6a6 !important; background-clip: padding-box; width: 38px; height: 38px") +
                "; position: fixed !important; z-index: 2147483647; display: none; left: auto; top: auto; right: auto; bottom: auto; margin: 0; box-sizing: border-box !important; " +
                (cfg.hz.LDRanimate ? "transition: background-color .5s, opacity .2s ease, top .15s ease-out, left .15s ease-out" : "");
            previewOverlay.LDR.src =
                cfg.hz.LDRsrc ||
                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOng9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWluWU1pbiBub25lIj48Zz48cGF0aCBpZD0icCIgZD0iTTMzIDQyYTEgMSAwIDAgMSA1NS0yMCAzNiAzNiAwIDAgMC01NSAyMCIvPjx1c2UgeDpocmVmPSIjcCIgdHJhbnNmb3JtPSJyb3RhdGUoNzIgNTAgNTApIi8+PHVzZSB4OmhyZWY9IiNwIiB0cmFuc2Zvcm09InJvdGF0ZSgxNDQgNTAgNTApIi8+PHVzZSB4OmhyZWY9IiNwIiB0cmFuc2Zvcm09InJvdGF0ZSgyMTYgNTAgNTApIi8+PHVzZSB4OmhyZWY9IiNwIiB0cmFuc2Zvcm09InJvdGF0ZSgyODggNTAgNTApIi8+PGFuaW1hdGVUcmFuc2Zvcm0gYXR0cmlidXRlTmFtZT0idHJhbnNmb3JtIiB0eXBlPSJyb3RhdGUiIHZhbHVlcz0iMzYwIDUwIDUwOzAgNTAgNTAiIGR1cj0iMS44cyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiLz48L2c+PC9zdmc+";
            x =
                "display: none; visibility: inherit !important; background: none; position: relative; width: 100%; height: 100%; max-width: inherit; max-height: inherit; margin: 0; padding: 0; border: 0; ";
            previewOverlay.IMG.alt = "";
            previewOverlay.IMG.style.cssText = x + "; image-orientation: initial !important";
            previewOverlay.IMG.addEventListener("error", previewOverlay.content_onerror);
            previewOverlay.DIV.appendChild(previewOverlay.IMG);
            previewOverlay.VID.volume = cfg.hz.mediaVolume / 100;
            previewOverlay.VID.autoplay = true;
            previewOverlay.VID.style.cssText = x + "box-shadow: 0 0 0 1px #f16529";
            previewOverlay.VID.addEventListener("loadeddata", previewOverlay.content_onready);
            previewOverlay.VID.addEventListener("error", previewOverlay.content_onerror, true);
            previewOverlay.DIV.appendChild(previewOverlay.VID);
            if (cfg.hz.thumbAsBG || cfg.hz.history) {
                previewOverlay.IMG.addEventListener("load", previewOverlay.content_onload);
                previewOverlay.VID.addEventListener("canplay", previewOverlay.content_onload);
            }
            if (cfg.hz.hideIdleCursor >= 50) {
                previewOverlay.DIV.cursor_hide = function () {
                    previewOverlay.CNT.style.cursor = "none";
                    previewOverlay.timers.cursor_hide = null;
                };
                previewOverlay.DIV.addEventListener("mousemove", function (e) {
                    if (e.target !== previewOverlay.CNT || (previewOverlay.CNT === previewOverlay.VID && previewOverlay.VID.clientHeight - 35 < (e.offsetY || e.layerY || 0))) {
                        clearTimeout(previewOverlay.timers.cursor_hide);
                        return;
                    }
                    if (previewOverlay.timers.cursor_hide) clearTimeout(previewOverlay.timers.cursor_hide);
                    else previewOverlay.CNT.style.cursor = "";
                    previewOverlay.timers.cursor_hide = setTimeout(previewOverlay.DIV.cursor_hide, cfg.hz.hideIdleCursor);
                });
                previewOverlay.DIV.addEventListener(
                    "mouseout",
                    function (e) {
                        if (e.target !== previewOverlay.CNT) return;
                        clearTimeout(previewOverlay.timers.cursor_hide);
                        previewOverlay.CNT.style.cursor = "";
                    },
                    false
                );
            } else if (cfg.hz.hideIdleCursor >= 0) previewOverlay.IMG.style.cursor = "none";
            previewOverlay.DIV.addEventListener(
                "dragstart",
                function (e) {
                    preventEvent(e, false);
                },
                true
            );
            x = doc.documentElement;
            x.appendChild(previewOverlay.DIV);
            x.appendChild(previewOverlay.LDR);
            previewOverlay.DBOX = {};
            x = win.getComputedStyle(previewOverlay.DIV);
            y = {
                mt: "marginTop",
                mr: "marginRight",
                mb: "marginBottom",
                ml: "marginLeft",
                bt: "borderTopWidth",
                br: "borderRightWidth",
                bb: "borderBottomWidth",
                bl: "borderLeftWidth",
                pt: "paddingTop",
                pr: "paddingRight",
                pb: "paddingBottom",
                pl: "paddingLeft",
            };
            for (z in y) {
                if (z[0] === "m") previewOverlay.DBOX[z] = parseInt(x[y[z]], 10);
                if (z[1] === "t" || z[1] === "b") {
                    p = z[1] + (z[0] === "p" ? "p" : "bm");
                    previewOverlay.DBOX[p] = (previewOverlay.DBOX[p] || 0) + parseInt(x[y[z]], 10);
                }
                p = (z[1] === "l" || z[1] === "r" ? "w" : "h") + (z[0] === "m" ? "m" : "pb");
                previewOverlay.DBOX[p] = (previewOverlay.DBOX[p] || 0) + parseInt(x[y[z]], 10);
            }
            previewOverlay.anim = {
                maxDelay: 0,
                opacityTransition: function () {
                    previewOverlay.BOX.style.opacity = previewOverlay.BOX.opacity || "1";
                },
            };
            y = "transition";
            if (x[y + "Property"]) {
                p = /,\s*/;
                p = [x[y + "Property"].split(p), x[y + "Duration"].replace(/initial/g, "0s").split(p)];
                previewOverlay.anim.css = x[y] || previewOverlay.DIV.style[y];
                ["opacity", "left", "top", "width", "height"].forEach(function (el) {
                    var idx = p[0].indexOf(el),
                        val = parseFloat(p[1][idx]) * 1e3;
                    if (val > 0 && idx > -1) {
                        previewOverlay.anim[el] = val;
                        if (val > previewOverlay.anim.maxDelay) previewOverlay.anim.maxDelay = val;
                        if (el === "opacity" && x.opacity) previewOverlay.DIV.opacity = "" + Math.max(0.01, x.opacity);
                    }
                });
            }
            if (cfg.hz.capText || cfg.hz.capWH) previewOverlay.createCAP();
            if (doc.querySelector("embed, object")) {
                previewOverlay.DIV.insertBefore(doc.createElement("iframe"), previewOverlay.DIV.firstElementChild);
                previewOverlay.DIV.firstChild.style.cssText = "z-index: -1; width: 100%; height: 100%; position: absolute; left: 0; top: 0; border: 0";
            }
            previewOverlay.reset();
        },

        createCAP: function () {
            if (previewOverlay.CAP) return;
            previewOverlay.CAP = doc.createElement("div");
            buildNodes(previewOverlay.CAP, [
                { tag: "b", attrs: { style: "display: none; transition: background-color .1s; border-radius: 3px; padding: 0 2px" } },
                " ",
                { tag: "b", attrs: { style: "display: " + (cfg.hz.capWH ? "inline-block" : "none") } },
                " ",
                { tag: "span", attrs: { style: "color: inherit; display: " + (cfg.hz.capText ? "inline-block" : "none") } },
            ]);
            var e = previewOverlay.CAP.firstElementChild;
            do {
                e.IMGS_ = e.IMGS_c = true;
            } while ((e = e.nextElementSibling));
            previewOverlay.CAP.IMGS_ = previewOverlay.CAP.IMGS_c = true;
            previewOverlay.create();
            e = cfg.hz.capStyle;
            previewOverlay.palette.wh_fg = e ? "rgb(100, 0, 0)" : "rgb(204, 238, 255)";
            previewOverlay.palette.wh_fg_hd = e ? "rgb(255, 0, 0)" : "rgb(120, 210, 255)";
            previewOverlay.CAP.style.cssText =
                "left:0; right:auto; display:block; cursor:default; position:absolute; width:auto; height:auto; border:0; white-space: " +
                (cfg.hz.capWrapByDef ? "pre-line" : "nowrap") +
                '; font:13px/1.4em "Trebuchet MS",sans-serif; background:rgba(' +
                (e ? "255,255,255,.95" : "0,0,0,.75") +
                ") !important; color:#" +
                (e ? "000" : "fff") +
                " !important; box-shadow: 0 0 1px #" +
                (e ? "666" : "ddd") +
                " inset; padding:0 4px; border-radius: 3px";
            e = cfg.hz.capPos ? "bottom" : "top";
            previewOverlay.CAP.overhead = Math.max(-18, Math.min(0, previewOverlay.DBOX[e[0] + "p"] - 18));
            previewOverlay.CAP.style[e] = previewOverlay.CAP.overhead + "px";
            previewOverlay.CAP.overhead = Math.max(0, -previewOverlay.CAP.overhead - previewOverlay.DBOX[e[0] + "bm"]);
            previewOverlay.DIV.appendChild(previewOverlay.CAP);
        },

        prepareCaption: function (trg, caption) {
            if (caption && typeof caption === "string") {
                previewOverlay.HLP.innerHTML = caption.replace(/<[^>]+>/g, "").replace(/</g, "&lt;");
                trg.IMGS_caption = previewOverlay.HLP.textContent.trim().replace(/[\n\r]+/g, " ");
                previewOverlay.HLP.textContent = "";
            } else trg.IMGS_caption = "";
        },

        flash_caption: function () {
            previewOverlay.timers.pileflicker = 0;
            previewOverlay.timers.pile_flash = setInterval(previewOverlay.flick_caption, 150);
        },

        flick_caption: function () {
            if (previewOverlay.timers.pileflicker++ >= cfg.hz.capFlashCount * 2) {
                previewOverlay.timers.pileflicker = null;
                clearInterval(previewOverlay.timers.pile_flash);
                return;
            }
            var s = previewOverlay.CAP.firstChild.style;
            s.backgroundColor = s.backgroundColor === previewOverlay.palette.pile_bg ? "red" : previewOverlay.palette.pile_bg;
        },

        updateCaption: function () {
            var c = previewOverlay.CAP,
                h;
            if (!c || c.state === 0) return;
            if (c.style.display !== "none") return;
            if (previewOverlay.TRG.IMGS_album)
                if (c.firstChild.style.display === "none" && (h = previewOverlay.stack[previewOverlay.TRG.IMGS_album]) && h[2]) {
                    h = c.firstChild.style;
                    h.color = previewOverlay.palette.pile_fg;
                    h.backgroundColor = previewOverlay.palette.pile_bg;
                    h.display = "inline-block";
                    if (cfg.hz.capFlashCount) {
                        if (cfg.hz.capFlashCount > 5) cfg.hz.capFlashCount = 5;
                        clearTimeout(previewOverlay.timers.pile_flash);
                        previewOverlay.timers.pile_flash = setTimeout(previewOverlay.flash_caption, previewOverlay.anim.maxDelay);
                    }
                }
            if (previewOverlay.CNT !== previewOverlay.IFR) {
                h = c.children[1];
                if (cfg.hz.capWH || c.state === 2) {
                    h.style.display = "inline-block";
                    h.style.color = previewOverlay.palette[previewOverlay.TRG.IMGS_HD === false ? "wh_fg_hd" : "wh_fg"];
                    h.textContent = (previewOverlay.TRG.IMGS_SVG ? previewOverlay.stack[previewOverlay.IMG.src] : [previewOverlay.CNT.naturalWidth, previewOverlay.CNT.naturalHeight]).join("×");
                } else h.style.display = "none";
            }
            h = c.lastChild;
            if (cfg.hz.capText || c.state === 2) {
                h.textContent = previewOverlay.TRG.IMGS_caption || "";
                h.style.display = "inline";
            } else h.style.display = "none";
            c.style.display = previewOverlay.DIV.curdeg % 360 ? "none" : "block";
        },

        attrObserver: function (target, isStyle, oldValue) {
            if (isStyle) {
                var bgImage = target.style.backgroundImage;
                if (
                    (!bgImage || oldValue.indexOf(bgImage.slice(5, -2)) !== -1) &&
                    oldValue &&
                    oldValue.indexOf("opacity") === -1 &&
                    target.style.cssText.indexOf("opacity") === -1
                )
                    return;
            }
            previewOverlay.resetNode(target);
        },

        onAttrChange: function (e) {
            if (e.attrChange !== 1) return;
            var target = e.target;
            switch (e.attrName) {
                case "style":
                    var bgImg = target.style.backgroundImage;
                    if (
                        (!bgImg || e.prevValue.indexOf(bgImg.slice(5, -2)) !== -1) &&
                        e.prevValue.indexOf("opacity") === -1 &&
                        target.style.cssText.indexOf("opacity") === -1
                    )
                        return;
                case "href":
                case "src":
                case "title":
                case "alt":
                    if (target === previewOverlay.TRG) previewOverlay.nodeToReset = target;
                    else previewOverlay.resetNode(target);
            }
            e.stopPropagation();
        },

        listen_attr_changes: function (node) {
            previewOverlay.mutObserver?.observe(node, previewOverlay.mutObserverConf);
        },

        resetNode: function (node, keepAlbum) {
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
            var childNodes = node.querySelectorAll('img[src], :not(img)[style*="background-image"], b, i, u, strong, em, span, div');
            if (childNodes.length)
                [].forEach.call(childNodes, function (el) {
                    if (el.IMGS_c) previewOverlay.resetNode(el);
                });
        },

        getImages: function (el) {
            var imgs, p;
            var isHTMLElement = el && el instanceof win.HTMLElement;
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
                    [p && p.previousElementSibling, p, el.nextElementSibling].some(function (sib) {
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
            /* commented out because that did not allow large images (bigger than viewport)
            if (el.clientWidth > topViewportWidth * 0.7 && el.clientHeight > topViewportHeight * 0.7) return null; */
            imgs = { imgSRC_o: el.currentSrc || el.src || el.data || null };
            if (!imgs.imgSRC_o && el.localName === "image") {
                imgs.imgSRC_o = el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
                if (imgs.imgSRC_o) imgs.imgSRC_o = previewOverlay.normalizeURL(imgs.imgSRC_o);
                else delete imgs.imgSRC_o;
            }
            if (imgs.imgSRC_o) {
                if (!isHTMLElement) imgs.imgSRC_o = previewOverlay.normalizeURL(imgs.imgSRC_o);
                else if ((el.naturalWidth > 0 && el.naturalWidth < 3) || (el.naturalHeight > 0 && el.naturalHeight < 3)) imgs.imgSRC_o = null;
                if (imgs.imgSRC_o) imgs.imgSRC = imgs.imgSRC_o.replace(previewOverlay.rgxHTTPs, "");
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
            imgs.imgBG_o = previewOverlay.normalizeURL(el.slice(/'|"/.test(el[4]) ? 5 : 4));
            imgs.imgBG = imgs.imgBG_o.replace(previewOverlay.rgxHTTPs, "");
            return imgs;
        },

        _replace: function (rule, addr, http, param, to, trg) {
            var ret, i;
            if (typeof to === "function") previewOverlay.node = trg;
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
                        r[i] = previewOverlay._replace(rule, r[i], http, param, "", trg);
                        if (Array.isArray(r[i])) ret = ret.concat(r[i]);
                        else ret.push(r[i]);
                    }
                    return ret.length > 1 ? ret : ret[0];
                }
            }
            if (rule.dc && ((param === "link" && rule.dc !== 2) || (param === "img" && rule.dc > 1))) r = decodeURIComponent(decodeURIComponent(r));
            if (to[0] === "#" && r[0] !== "#") r = "#" + r.replace("#", "");
            r = previewOverlay.httpPrepend(r, http);
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
        },
        replace: function (rule, addr, http, param, trg) {
            var ret, i, j;
            if (previewOverlay.toFunction(rule, "to") === false) return 1;
            if (trg.IMGS_TRG) trg = trg.IMGS_TRG;
            http = http.slice(0, http.length - addr.length);
            if (Array.isArray(rule.to)) {
                ret = [];
                for (i = 0; i < rule.to.length; ++i) {
                    j = previewOverlay._replace(rule, addr, http, param, rule.to[i], trg);
                    if (Array.isArray(j)) ret = ret.concat(j);
                    else ret.push(j);
                }
            } else if (rule.to) ret = previewOverlay._replace(rule, addr, http, param, rule.to, trg);
            else ret = previewOverlay.httpPrepend(addr, http);
            return ret;
        },

        toFunction: function (rule, param, inline) {
            if (typeof rule[param] !== "function" && (inline ? /^:\s*\S/ : /^:\n\s*\S/).test(rule[param])) {
                try {
                    rule[param] = Function("var $ = arguments; " + (inline ? "return " : "") + rule[param].slice(1)).bind(previewOverlay);
                } catch (ex) {
                    console.error(cfg.app?.name + ": " + param + " - " + ex.message);
                    return false;
                }
            }
        },

        httpPrepend: function (url, preDomain) {
            if (preDomain) url = url.replace(/^(?!#?(?:https?:|\/\/|data:)|$)(#?)/, "$1" + preDomain);
            if (url[1] === "/")
                if (url[0] === "/") url = previewOverlay.pageProtocol + url;
                else if (url[0] === "#" && url[2] === "/") url = "#" + previewOverlay.pageProtocol + url.slice(1);
            return url;
        },

        normalizeURL: function (url) {
            if (url[1] === "/" && url[0] === "/") url = previewOverlay.pageProtocol + url;
            previewOverlay.HLP.href = url;
            return previewOverlay.HLP.href;
        },

        resolve: function (URL, rule, trg, nowait) {
            if (!trg || trg.IMGS_c) return false;
            if (trg.IMGS_c_resolved && typeof trg.IMGS_c_resolved.URL !== "string") return false;
            URL = URL.replace(hashFragmentRegex, "");
            if (previewOverlay.stack[URL]) {
                trg.IMGS_album = URL;
                URL = previewOverlay.stack[URL];
                return URL[URL[0]][0];
            }
            var params, i;
            if (rule.rule) {
                params = rule;
                rule = params.rule;
            } else {
                params = {};
                i = 0;
                while (i < rule.$.length) params[i] = rule.$[i++];
                params.length = rule.$.length;
                delete rule.$;
                params.rule = rule;
            }
            if (cfg.sieve[rule.id].res === 1) rule.req_res = true;
            else if (rule.skip_resolve)
                if (typeof cfg.sieve[rule.id].res === "function") {
                    params.url = [URL];
                    return previewOverlay.onMessage({ cmd: "resolved", id: -1, m: false, return_url: true, params: params });
                } else delete rule.skip_resolve;
            if (!cfg.hz.waitHide && ((previewOverlay.fireHide && previewOverlay.state > 2) || previewOverlay.state === 2 || (previewOverlay.hideTime && Date.now() - previewOverlay.hideTime < 200))) nowait = true;
            if (!previewOverlay.resolve_delay) clearTimeout(previewOverlay.timers.resolver);
            trg.IMGS_c_resolved = { URL: URL, params: params };
            previewOverlay.timers.resolver = setTimeout(function () {
                previewOverlay.timers.resolver = null;
                Port.send({ cmd: "resolve", url: URL, params: params, id: previewOverlay.resolving.push(trg) - 1 });
            }, previewOverlay.resolve_delay || (nowait ? 50 : Math.max(50, cfg.hz.delay)));
            return null;
        },

        find: function (trg, x, y) {
            var i = 0,
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
                    if (n.nodeType !== 1 || n === doc.body) break;
                    else if (n.localName !== "a") continue;
                if (!n.href) {
                    if (n.href === "") previewOverlay.listen_attr_changes(n);
                    break;
                }
                if (n instanceof win.HTMLElement) {
                    if (n.childElementCount && n.querySelector("iframe, object, embed")) break;
                    if (typeof x === "number" && typeof y === "number") {
                        tmp_el = doc.elementsFromPoint(x, y);
                        for (i = 0; i < 5; ++i) {
                            if (tmp_el[i] === doc.body) break;
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
                                    imgs = previewOverlay.getImages(tmp_el[i], true);
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
                    n.href = previewOverlay.normalizeURL(n.href);
                }
                URL = n.href.replace(previewOverlay.rgxHTTPs, "");
                if (imgs && (URL === imgs.imgSRC || URL === imgs.imgBG)) break;
                for (i = 0; (rule = cfg.sieve[i]); ++i) {
                    if (!(rule.link && rule.link.test(URL))) {
                        if (!rule.img) continue;
                        tmp_el = rule.img.test(URL);
                        if (tmp_el) use_img = true;
                        else continue;
                    }
                    if (rule.useimg && rule.img) {
                        if (!imgs) imgs = previewOverlay.getImages(trg);
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
                        if (win.location.href.replace(hashFragmentRegex, "") === n.href.replace(hashFragmentRegex, "")) break;
                        if (previewOverlay.toFunction(rule, "url", true) === false) return 1;
                        if (typeof rule.url === "function") previewOverlay.node = trg;
                        ret = rule.url ? URL.replace(rule[tmp_el ? "img" : "link"], rule.url) : URL;
                        ret = previewOverlay.resolve(
                            previewOverlay.httpPrepend(ret || URL, n.href.slice(0, n.href.length - URL.length)),
                            {
                                id: i,
                                $: [n.href].concat((URL.match(rule[tmp_el ? "img" : "link"]) || []).slice(1)),
                                loop_param: tmp_el ? "img" : "link",
                                skip_resolve: ret === "",
                            },
                            trg.IMGS_TRG || trg
                        );
                    } else ret = previewOverlay.replace(rule, URL, n.href, tmp_el ? "img" : "link", trg);
                    if (ret === 1) return 1;
                    else if (ret === 2) ret = false;
                    if (
                        typeof ret === "string" &&
                        n !== trg &&
                        /* access the attribute directly because src property could be missed in custom media elements (new reddit for example)
                        trg.hasAttribute("src") &&
                        trg.src.replace(/^https?:\/\//, "") === ret.replace(/^#?(https?:)?\/\//, "") */
                        trg.attributes.src?.value?.replace(/^https?:\/\//, "") === ret.replace(/^#?(https?:)?\/\//, "")
                    )
                        ret = false;
                    break;
                }
                break;
            } while (++i < 5 && (n = n.parentNode));
            if (!ret && ret !== null) {
                imgs = previewOverlay.getImages(trg) || imgs;
                if (imgs && (imgs.imgSRC || imgs.imgBG)) {
                    if (typeof use_img === "object") {
                        i = use_img[0];
                        use_img[0] = true;
                    } else {
                        i = 0;
                        use_img = [];
                    }
                    for (; (rule = cfg.sieve[i]); ++i)
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
                                if (previewOverlay.toFunction(rule, "url", true) === false) return 1;
                                if (typeof rule.url === "function") previewOverlay.node = trg;
                                ret = URL.replace(rule.img, rule.url);
                                ret = previewOverlay.resolve(
                                    previewOverlay.httpPrepend(ret, imgs.slice(0, imgs.length - URL.length)),
                                    { id: i, $: [imgs].concat((URL.match(rule.img) || []).slice(1)), loop_param: "img", skip_resolve: ret === "" },
                                    trg.IMGS_TRG || trg
                                );
                            } else ret = previewOverlay.replace(rule, URL, imgs, "img", trg);
                            if (ret === 1) return 1;
                            else if (ret === 2) return false;
                            if (trg.nodeType === 1) {
                                attrModNode = trg;
                                if (cfg.hz.history) trg.IMGS_nohistory = true;
                            }
                            break;
                        }
                }
            }
            if (rule && rule.loop && typeof ret === "string" && rule.loop & (use_img ? 2 : 1)) {
                if ((trg.nodeType !== 1 && ret === trg.href) || trg.IMGS_loop_count > 5) return false;
                rule = ret;
                ret = previewOverlay.find({ href: ret, IMGS_TRG: trg.IMGS_TRG || trg, IMGS_loop_count: 1 + (trg.IMGS_loop_count || 0) });
                if (ret) ret = Array.isArray(ret) ? ret.concat(rule) : [ret, rule];
                else if (ret !== null) ret = rule;
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
            if (trg.nodeType !== 1) return ret;
            imgFallbackCheck: if (trg.localName === "img" && trg.hasAttribute("src")) {
                if (ret)
                    if (ret === (trg.currentSrc || trg.src) && (!n || !n.href || n !== trg)) use_img = ret = false;
                    else if (typeof use_img === "number") use_img = 3;
                if (svgExtensionRegex.test(trg.currentSrc || trg.src)) break imgFallbackCheck;
                if (trg.parentNode.localName === "picture") tmp_el = trg.parentNode.querySelectorAll("[srcset]");
                else if (trg.hasAttribute("srcset")) tmp_el = [trg];
                else tmp_el = [];
                rule = { naturalWidth: trg.naturalWidth, naturalHeight: trg.naturalHeight, src: null };
                for (i = 0; i < tmp_el.length; ++i) {
                    URL = tmp_el[i]
                        .getAttribute("srcset")
                        .trim()
                        // split with ", ", to avoid issues with URIs containing commas
                        // .split(/\s*,\s*/);
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
                            previewOverlay.HLP.href = srcItem[0];
                            rule.src = previewOverlay.HLP.href;
                        }
                    }
                }
                if (rule.src) rule.naturalHeight *= rule.naturalWidth / trg.naturalWidth;
                if (rule.src && previewOverlay.isEnlargeable(trg, rule)) rule = rule.src;
                else if (previewOverlay.isEnlargeable(trg)) rule = trg.currentSrc || trg.src;
                else rule = null;
                var oParent = trg;
                i = 0;
                do {
                    if (oParent === doc.body || oParent.nodeType !== 1) break;
                    tmp_el = win.getComputedStyle(oParent);
                    if (tmp_el.position === "fixed") break;
                    if (i === 0) continue;
                    if (tmp_el.overflowY === "visible" && tmp_el.overflowX === "visible") continue;
                    switch (tmp_el.display) {
                        case "block":
                        case "inline-block":
                        case "flex":
                        case "inline-flex":
                        case "list-item":
                        case "table-caption":
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
                    if (!previewOverlay.isEnlargeable(oParent, trg, true)) continue;
                    rule = trg.currentSrc || trg.src;
                    trg.IMGS_fallback_zoom = trg.IMGS_fallback_zoom ? [trg.IMGS_fallback_zoom, rule] : rule;
                    break;
                } while (++i < 5 && (oParent = oParent.parentNode));
                if (!rule) break imgFallbackCheck;
                attrModNode = trg;
                if (typeof ret === "object") {
                    if (trg.IMGS_fallback_zoom !== rule) trg.IMGS_fallback_zoom = trg.IMGS_fallback_zoom ? [trg.IMGS_fallback_zoom, rule] : rule;
                } else if (ret) {
                    if (ret !== rule) ret = [ret, rule];
                } else {
                    ret = rule;
                    if (cfg.hz.history) trg.IMGS_nohistory = true;
                }
            }
            if (!ret && ret !== null) {
                if (attrModNode) previewOverlay.listen_attr_changes(attrModNode);
                return ret;
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
                if (i === 0 && !cfg.hz.capNoSBar) trg.title = "";
                if (trg.IMGS_caption) break;
            } while (++i <= 5 && (n = n.parentNode) && n.nodeType === 1);
            if (!trg.IMGS_caption)
                if (trg.alt && trg.alt !== trg.src && trg.alt !== imgs) trg.IMGS_caption = trg.alt;
                else if (tmp_el && cfg.hz.capLinkText) trg.IMGS_caption = tmp_el;
            if (trg.IMGS_caption)
                if ((!cfg.hz.capLinkText && trg.IMGS_caption === tmp_el) || trg.IMGS_caption === trg.href) delete trg.IMGS_caption;
                else previewOverlay.prepareCaption(trg, trg.IMGS_caption);
            if (attrModNode) previewOverlay.listen_attr_changes(attrModNode);
            return ret;
        },

        delayed_loader: function () {
            if (previewOverlay.TRG && previewOverlay.state < 4) previewOverlay.show(previewOverlay.LDR_msg, true);
        },

        show: function (msg, delayed) {
            if (previewOverlay.iFrame) {
                win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", msg: msg }, "*");
                return;
            }
            if (!delayed && typeof msg === "string") {
                previewOverlay.DIV.style.display = "none";
                previewOverlay.HD_cursor(true);
                previewOverlay.BOX = previewOverlay.LDR;
                previewOverlay.LDR.style.backgroundColor =
                    cfg.hz.LDRbgOpacity < 100 ? previewOverlay.palette[msg].replace(/\(([^\)]+)/, "a($1, " + cfg.hz.LDRbgOpacity / 100) : previewOverlay.palette[msg];
                if (cfg.hz.LDRdelay > 20) {
                    clearTimeout(previewOverlay.timers.delayed_loader);
                    if (msg[0] !== "R" && previewOverlay.state !== 3 && !previewOverlay.fullZm) {
                        previewOverlay.state = 3;
                        previewOverlay.LDR_msg = msg;
                        previewOverlay.timers.delayed_loader = setTimeout(previewOverlay.delayed_loader, cfg.hz.LDRdelay);
                        return;
                    }
                }
            }
            var box;
            if (msg) {
                if (previewOverlay.state === 2 && cfg.hz.waitHide) return;
                updateViewportDimensions();
                if (previewOverlay.state < 3 || previewOverlay.LDR_msg) {
                    previewOverlay.LDR_msg = null;
                    win.addEventListener("wheel", previewOverlay.wheeler, { capture: true, passive: false });
                }
                if (msg === true) {
                    previewOverlay.BOX = previewOverlay.DIV;
                    previewOverlay.LDR.style.display = "none";
                    if (cfg.hz.LDRanimate) previewOverlay.LDR.style.opacity = "0";
                    previewOverlay.CNT.style.display = "block";
                    (previewOverlay.CNT === previewOverlay.IMG ? previewOverlay.VID : previewOverlay.IMG).style.display = "none";
                    if (typeof previewOverlay.DIV.cursor_hide === "function") previewOverlay.DIV.cursor_hide();
                } else if (previewOverlay.state < 4) {
                    if (previewOverlay.anim.left || previewOverlay.anim.top) {
                        previewOverlay.DIV.style.left = previewOverlay.x + "px";
                        previewOverlay.DIV.style.top = previewOverlay.y + "px";
                    }
                    if (previewOverlay.anim.width || previewOverlay.anim.height) previewOverlay.DIV.style.width = previewOverlay.DIV.style.height = "0";
                }
                box = previewOverlay.BOX.style;
                if (
                    (previewOverlay.state < 3 || previewOverlay.BOX === previewOverlay.LDR) &&
                    box.display === "none" &&
                    (((previewOverlay.anim.left || previewOverlay.anim.top) && previewOverlay.BOX === previewOverlay.DIV) || (cfg.hz.LDRanimate && previewOverlay.BOX === previewOverlay.LDR))
                )
                    previewOverlay.show(null);
                box.display = "block";
                if (box.opacity === "0" && ((previewOverlay.BOX === previewOverlay.DIV && previewOverlay.anim.opacity) || (previewOverlay.BOX === previewOverlay.LDR && cfg.hz.LDRanimate)))
                    if (previewOverlay.state === 2) previewOverlay.anim.opacityTransition();
                    else setTimeout(previewOverlay.anim.opacityTransition, 0);
                previewOverlay.state = previewOverlay.BOX === previewOverlay.LDR ? 3 : 4;
            }
            var x = previewOverlay.x;
            var y = previewOverlay.y;
            var rSide = viewportWidth - x;
            var bSide = viewportHeight - y;
            var left, top, rot, w, h, ratio;
            if ((msg === undefined && previewOverlay.state === 4) || msg === true) {
                msg = false;
                if (previewOverlay.TRG.IMGS_SVG) {
                    h = previewOverlay.stack[previewOverlay.IMG.src];
                    w = h[0];
                    h = h[1];
                } else if ((w = previewOverlay.CNT.naturalWidth)) h = previewOverlay.CNT.naturalHeight;
                else msg = true;
            }
            if (previewOverlay.fullZm) {
                if (!previewOverlay.BOX) previewOverlay.BOX = previewOverlay.LDR;
                if (msg === false) {
                    box = previewOverlay.DIV.style;
                    box.visibility = "hidden";
                    previewOverlay.resize(0);
                    previewOverlay.m_move();
                    box.visibility = "visible";
                    previewOverlay.updateCaption();
                } else previewOverlay.m_move();
                return;
            }
            if (msg === false) {
                rot = previewOverlay.DIV.curdeg % 180 !== 0;
                if (rot) {
                    ratio = w;
                    w = h;
                    h = ratio;
                }
                if (cfg.hz.placement === 3) {
                    box = previewOverlay.TBOX;
                    x = box.left;
                    y = box.top;
                    rSide = viewportWidth - box.right;
                    bSide = viewportHeight - box.bottom;
                }
                box = previewOverlay.DBOX;
                ratio = w / h;
                var fs = cfg.hz.fullspace || cfg.hz.placement === 2,
                    cap_size =
                        previewOverlay.CAP &&
                        previewOverlay.CAP.overhead &&
                        !(previewOverlay.DIV.curdeg % 360) &&
                        previewOverlay.CAP.state !== 0 &&
                        (previewOverlay.CAP.state === 2 || (previewOverlay.TRG.IMGS_caption && cfg.hz.capText) || previewOverlay.TRG.IMGS_album || cfg.hz.capWH)
                            ? previewOverlay.CAP.overhead
                            : 0,
                    vH = box["wm"] + (rot ? box["hpb"] : box["wpb"]),
                    hH = box["hm"] + (rot ? box["wpb"] : box["hpb"]) + cap_size,
                    vW = Math.min(w, (fs ? viewportWidth : x < rSide ? rSide : x) - vH),
                    hW = Math.min(w, viewportWidth - vH);
                vH = Math.min(h, viewportHeight - hH);
                hH = Math.min(h, (fs ? viewportHeight : y < bSide ? bSide : y) - hH);
                if ((fs = vW / ratio) > vH) vW = vH * ratio;
                else vH = fs;
                if ((fs = hH * ratio) > hW) hH = hW / ratio;
                else hW = fs;
                if (hW > vW) {
                    w = Math.round(hW);
                    h = Math.round(hH);
                } else {
                    w = Math.round(vW);
                    h = Math.round(vH);
                }
                vW = w + box["wm"] + (rot ? box["hpb"] : box["wpb"]);
                vH = h + box["hm"] + (rot ? box["wpb"] : box["hpb"]) + cap_size;
                hW = previewOverlay.TRG !== previewOverlay.HLP && cfg.hz.minPopupDistance;
                switch (cfg.hz.placement) {
                    case 1:
                        hH = (x < rSide ? rSide : x) < vW;
                        if (hH && cfg.hz.fullspace && (viewportHeight - vH <= viewportWidth - vW || vW <= (x < rSide ? rSide : x))) hH = false;
                        left = x - (hH ? vW / 2 : x < rSide ? 0 : vW);
                        top = y - (hH ? (y < bSide ? 0 : vH) : vH / 2);
                        break;
                    case 2:
                        left = (viewportWidth - vW) / 2;
                        top = (viewportHeight - vH) / 2;
                        hW = false;
                        break;
                    case 3:
                        left = x < rSide || (vW >= previewOverlay.x && viewportWidth - previewOverlay.x >= vW) ? previewOverlay.TBOX.right : x - vW;
                        top = y < bSide || (vH >= previewOverlay.y && viewportHeight - previewOverlay.y >= vH) ? previewOverlay.TBOX.bottom : y - vH;
                        hH =
                            (x < rSide ? rSide : x) < vW ||
                            ((y < bSide ? bSide : y) >= vH && viewportWidth >= vW && (previewOverlay.TBOX.width >= viewportWidth / 2 || Math.abs(previewOverlay.x - left) >= viewportWidth / 3.5));
                        if (!cfg.hz.fullspace || (hH ? vH <= (y < bSide ? bSide : y) : vW <= (x < rSide ? rSide : x))) {
                            fs = previewOverlay.TBOX.width / previewOverlay.TBOX.height;
                            if (hH) {
                                left = (previewOverlay.TBOX.left + previewOverlay.TBOX.right - vW) / 2;
                                if (fs > 10) left = x < rSide ? Math.max(left, previewOverlay.TBOX.left) : Math.min(left, previewOverlay.TBOX.right - vW);
                            } else {
                                top = (previewOverlay.TBOX.top + previewOverlay.TBOX.bottom - vH) / 2;
                                if (fs < 0.1) top = y < bSide ? Math.min(top, previewOverlay.TBOX.top) : Math.min(top, previewOverlay.TBOX.bottom - vH);
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
                    if (hH || (x < rSide ? rSide : x) < vW || viewportHeight < vH) {
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
                left = left < 0 ? 0 : left > viewportWidth - vW ? viewportWidth - vW : left;
                top = top < 0 ? 0 : top > viewportHeight - vH ? viewportHeight - vH : top;
                if (cap_size && !cfg.hz.capPos) top += cap_size;
                if (rot) {
                    rot = w;
                    w = h;
                    h = rot;
                    rot = (vW - vH) / 2;
                    left += rot;
                    top -= rot;
                }
                previewOverlay.DIV.style.width = w + "px";
                previewOverlay.DIV.style.height = h + "px";
                previewOverlay.updateCaption();
            } else {
                if (cfg.hz.placement === 1) {
                    left = cfg.hz.minPopupDistance;
                    top = previewOverlay.LDR.wh[1] / 2;
                } else {
                    left = 13;
                    top = y < bSide ? -13 : previewOverlay.LDR.wh[1] + 13;
                }
                left = x - (x < rSide ? -left : previewOverlay.LDR.wh[0] + left);
                top = y - top;
            }
            if (left !== undefined) {
                previewOverlay.BOX.style.left = left + "px";
                previewOverlay.BOX.style.top = top + "px";
            }
        },
        album: function (idx, manual) {
            var s, i;
            if (!previewOverlay.TRG || !previewOverlay.TRG.IMGS_album) return;
            var album = previewOverlay.stack[previewOverlay.TRG.IMGS_album];
            if (!album || album.length < 2) return;
            if (!previewOverlay.fullZm && previewOverlay.timers.no_anim_in_album) {
                clearInterval(previewOverlay.timers.no_anim_in_album);
                previewOverlay.timers.no_anim_in_album = null;
                previewOverlay.DIV.style.transition = "all 0s";
            }
            switch (typeof idx) {
                case "boolean":
                    idx = idx ? 1 : album.length - 1;
                    break;
                case "number":
                    idx = album[0] + (idx || 0);
                    break;
                default:
                    if (/^[+-]?\d+$/.test(idx)) {
                        i = parseInt(idx, 10);
                        idx = idx[0] === "+" || idx[0] === "-" ? album[0] + i : i || 1;
                    } else {
                        idx = idx.trim();
                        if (!idx) return;
                        idx = RegExp(idx, "i");
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
            if (cfg.hz.pileCycle) {
                s = album.length - 1;
                idx = idx % s || s;
                idx = idx < 0 ? s + idx : idx;
            } else idx = Math.max(1, Math.min(idx, album.length - 1));
            s = album[0];
            if (s === idx && manual && previewOverlay.state > 3) return;
            album[0] = idx;
            previewOverlay.resetNode(previewOverlay.TRG, true);
            previewOverlay.CAP.style.display = "none";
            previewOverlay.CAP.firstChild.textContent = idx + " / " + (album.length - 1);
            if (cfg.hz.capText) previewOverlay.prepareCaption(previewOverlay.TRG, album[idx][1]);
            previewOverlay.set(album[idx][0]);
            s = (s <= idx && !(s === 1 && idx === album.length - 1)) || (s === album.length - 1 && idx === 1) ? 1 : -1;
            i = 0;
            var until = cfg.hz.preload < 3 ? 1 : 3;
            while (i++ <= until) {
                if (!album[idx + i * s] || idx + i * s < 1) return;
                previewOverlay._preload(album[idx + i * s][0]);
            }
        },

        set: function (src) {
            var i, src_left, src_HD;
            if (!src) return;
            if (previewOverlay.iFrame) {
                i = previewOverlay.TRG;
                win.parent.postMessage(
                    {
                        vdfDpshPtdhhd: "from_frame",
                        src: src,
                        thumb: i.IMGS_thumb ? [i.IMGS_thumb, i.IMGS_thumb_ok] : null,
                        album: i.IMGS_album ? { id: i.IMGS_album, list: previewOverlay.stack[i.IMGS_album] } : null,
                        caption: i.IMGS_caption,
                    },
                    "*"
                );
                return;
            }
            clearInterval(previewOverlay.timers.onReady);
            previewOverlay.create();
            if (Array.isArray(src)) {
                if (!src.length) {
                    previewOverlay.show("R_load");
                    return;
                }
                src_left = [];
                src_HD = [];
                for (i = 0; i < src.length; ++i) {
                    if (!src[i]) continue;
                    if (src[i][0] === "#") src_HD.push(previewOverlay.httpPrepend(src[i].slice(1)));
                    else src_left.push(previewOverlay.httpPrepend(src[i]));
                }
                if (!src_left.length) src_left = src_HD;
                else if (src_HD.length) {
                    previewOverlay.TRG.IMGS_HD = cfg.hz.hiRes;
                    i = cfg.hz.hiRes ? src_left : src_HD;
                    previewOverlay.TRG.IMGS_HD_stack = i.length > 1 ? i : i[0];
                    src_left = cfg.hz.hiRes ? src_HD : src_left;
                }
                previewOverlay.TRG.IMGS_c_resolved = src_left;
                src = src_left[0];
            } else if (src[0] === "#") src = src.slice(1);
            if (src[1] === "/") src = previewOverlay.httpPrepend(src);
            if (src.indexOf("&amp;") !== -1) src = src.replace(/&amp;/g, "&");
            if (svgExtensionRegex.test(src)) previewOverlay.TRG.IMGS_SVG = true;
            else delete previewOverlay.TRG.IMGS_SVG;
            if (src === previewOverlay.CNT.src) {
                previewOverlay.checkContentRediness(src);
                return;
            }
            if (/^[^?#]+\.(?:m(?:4[abprv]|p[34])|og[agv]|webm)(?:$|[?#])/.test(src) || /#(mp[34]|og[gv]|webm)$/.test(src)) {
                previewOverlay.CNT = previewOverlay.VID;
                previewOverlay.show("load");
                previewOverlay.VID.naturalWidth = 0;
                previewOverlay.VID.naturalHeight = 0;
                previewOverlay.VID.src = src;
                previewOverlay.VID.load();
                return;
            }
            if (previewOverlay.CNT !== previewOverlay.IMG) {
                previewOverlay.CNT = previewOverlay.IMG;
                previewOverlay.VID.removeAttribute("src");
                previewOverlay.VID.load();
            }
            if (cfg.hz.thumbAsBG) {
                if (previewOverlay.interlacer) previewOverlay.interlacer.style.display = "none";
                previewOverlay.CNT.loaded = previewOverlay.TRG.IMGS_SVG || previewOverlay.stack[src] === 1;
            }
            if (!previewOverlay.TRG.IMGS_SVG && !previewOverlay.stack[src] && cfg.hz.preload === 1) new Image().src = src;
            previewOverlay.CNT.removeAttribute("src");
            if (previewOverlay.TRG.IMGS_SVG && !previewOverlay.stack[src]) {
                var svg = doc.createElement("img");
                svg.style.cssText = ["position: fixed", "visibility: hidden", "max-width: 500px", ""].join(" !important;");
                svg.onerror = previewOverlay.content_onerror;
                svg.src = src;
                svg.counter = 0;
                previewOverlay.timers.onReady = setInterval(function () {
                    if (svg.width || svg.counter++ > 300) {
                        var ratio = svg.width / svg.height;
                        clearInterval(previewOverlay.timers.onReady);
                        doc.body.removeChild(svg);
                        svg = null;
                        if (ratio) {
                            previewOverlay.stack[src] = [win.screen.width, Math.round(win.screen.width / ratio)];
                            previewOverlay.IMG.src = src;
                            previewOverlay.assign_src();
                        } else previewOverlay.show("Rload");
                    }
                }, 100);
                doc.body.appendChild(svg);
                previewOverlay.show("load");
                return;
            }
            previewOverlay.CNT.src = src;
            previewOverlay.checkContentRediness(src, true);
        },
        checkContentRediness: function (src, showLoader) {
            if (previewOverlay.CNT.naturalWidth || (previewOverlay.TRG.IMGS_SVG && previewOverlay.stack[src])) {
                previewOverlay.assign_src();
                return;
            }
            if (showLoader) previewOverlay.show("load");
            previewOverlay.timers.onReady = setInterval(previewOverlay.content_onready, previewOverlay.CNT === previewOverlay.IMG ? 100 : 300);
        },

        content_onready: function () {
            if (!previewOverlay.CNT || !previewOverlay.fireHide) {
                clearInterval(previewOverlay.timers.onReady);
                if (!previewOverlay.fireHide) previewOverlay.reset();
                return;
            }
            if (previewOverlay.CNT === previewOverlay.VID) {
                if (!previewOverlay.VID.duration) {
                    if (previewOverlay.VID.readyState > previewOverlay.VID.HAVE_NOTHING) previewOverlay.content_onerror.call(previewOverlay.VID);
                    return;
                }
                previewOverlay.VID.naturalWidth = previewOverlay.VID.videoWidth || 300;
                previewOverlay.VID.naturalHeight = previewOverlay.VID.videoHeight || 40;
                previewOverlay.VID.audio = !previewOverlay.VID.videoHeight;
                previewOverlay.VID.loop = !previewOverlay.VID.duration || previewOverlay.VID.duration <= 60;
                if (previewOverlay.VID.audio) {
                    previewOverlay.VID._controls = previewOverlay.VID.controls;
                    previewOverlay.VID.controls = true;
                } else previewOverlay.VID.controls = previewOverlay.fullZm ? true : previewOverlay.VID._controls;
                var autoplay = previewOverlay.VID.autoplay;
                if (autoplay && previewOverlay.VID.paused) previewOverlay.VID.play();
            } else if (!previewOverlay.IMG.naturalWidth) return;
            clearInterval(previewOverlay.timers.onReady);
            previewOverlay.assign_src();
        },

        content_onerror: function () {
            clearInterval(previewOverlay.timers.onReady);
            if (!previewOverlay.TRG || this !== previewOverlay.CNT) return;
            var src_left;
            var t = previewOverlay.TRG;
            var src_res_arr = t.IMGS_c_resolved;
            var src = this.src;
            if (!src) return;
            this.removeAttribute("src");
            do src_left = Array.isArray(src_res_arr) ? src_res_arr.shift() : null;
            while (src_left === src);
            if (!src_res_arr || !src_res_arr.length)
                if (src_left) t.IMGS_c_resolved = src_left;
                else delete t.IMGS_c_resolved;
            if (src_left && !src_left.URL) previewOverlay.set(src_left);
            else if (t.IMGS_HD_stack) {
                src_left = t.IMGS_HD_stack;
                delete t.IMGS_HD_stack;
                delete t.IMGS_HD;
                previewOverlay.set(src_left);
            } else if (t.IMGS_fallback_zoom) {
                previewOverlay.set(t.IMGS_fallback_zoom);
                delete t.IMGS_fallback_zoom;
            } else {
                if (previewOverlay.CAP) previewOverlay.CAP.style.display = "none";
                delete t.IMGS_c_resolved;
                previewOverlay.show("R_load");
            }
            console.info(cfg.app?.name + ": [" + (this.audio ? "AUDIO" : this.nodeName) + "] Load error > " + src);
        },

        content_onload: function (e) {
            if (cfg.hz.thumbAsBG) this.loaded = true;
            if (previewOverlay.TRG) delete previewOverlay.TRG.IMGS_c_resolved;
            if (previewOverlay.stack[this.src] && !(previewOverlay.TRG || e).IMGS_SVG) previewOverlay.stack[this.src] = 1;
            if (previewOverlay.interlacer) previewOverlay.interlacer.style.display = "none";
        },

        history: function (manual) {
            var url, i, n;
            if (!previewOverlay.CNT || !previewOverlay.TRG || chrome?.extension?.inIncognitoContext) return;
            if (manual) {
                cfg.hz.history = !cfg.hz.history;
                return;
            }
            manual = manual !== undefined;
            if (!manual && previewOverlay.TRG.IMGS_nohistory) return;
            if (previewOverlay.TRG.IMGS_album) {
                url = previewOverlay.stack[previewOverlay.TRG.IMGS_album];
                if (!manual && (url.in_history || (url.length > 4 && url[0] === 1))) return;
                url.in_history = !url.in_history;
            }
            n = previewOverlay.TRG;
            i = 0;
            do {
                if (n.localName !== "a") continue;
                url = n.href;
                if (url && url.baseVal) url = url.baseVal;
                break;
            } while (++i < 5 && (n = n.parentNode) && n.nodeType === 1);
            if (url) Port.send({ cmd: "history", url: url, manual: manual });
        },

        HD_cursor: function (reset) {
            if (!previewOverlay.TRG || (!reset && (cfg.hz.capWH || previewOverlay.TRG.IMGS_HD === undefined))) return;
            if (reset) {
                if (previewOverlay.DIV) previewOverlay.DIV.style.cursor = "";
                if (previewOverlay.lastTRGStyle.cursor !== null) {
                    previewOverlay.TRG.style.cursor = previewOverlay.lastTRGStyle.cursor;
                    previewOverlay.lastTRGStyle.cursor = null;
                }
            } else {
                if (previewOverlay.lastTRGStyle.cursor === null) previewOverlay.lastTRGStyle.cursor = previewOverlay.TRG.style.cursor;
                previewOverlay.DIV.style.cursor = previewOverlay.TRG.style.cursor = "crosshair";
            }
        },

        isEnlargeable: function (img, oImg, isOverflow) {
            if (previewOverlay.CNT && previewOverlay.CNT !== previewOverlay.IMG) return true;
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
            return (w < topViewportWidth * 0.9 && 100 - (w * 100) / ow >= cfg.hz.zoomresized) || (h < topViewportHeight * 0.9 && 100 - (h * 100) / oh >= cfg.hz.zoomresized);
        },

        not_enlargeable: function () {
            previewOverlay.resetNode(previewOverlay.TRG);
            previewOverlay.TRG.IMGS_c = true;
            previewOverlay.reset();
            if (!cfg.hz.markOnHover) return;
            if (cfg.hz.markOnHover === "cr") {
                previewOverlay.lastTRGStyle.cursor = previewOverlay.TRG.style.cursor;
                previewOverlay.TRG.style.cursor = "not-allowed";
                return;
            }
            if (previewOverlay.lastTRGStyle.outline === null) previewOverlay.lastTRGStyle.outline = previewOverlay.TRG.style.outline;
            previewOverlay.lastScrollTRG = previewOverlay.TRG;
            previewOverlay.TRG.style.outline = "1px solid purple";
        },

        assign_src: function () {
            if (!previewOverlay.TRG || previewOverlay.switchToHiResInFZ()) return;
            if (previewOverlay.TRG.IMGS_album) {
                delete previewOverlay.TRG.IMGS_thumb;
                delete previewOverlay.TRG.IMGS_thumb_ok;
                if (previewOverlay.interlacer) previewOverlay.interlacer.style.display = "none";
            } else if (!previewOverlay.TRG.IMGS_SVG) {
                if (previewOverlay.TRG !== previewOverlay.HLP && previewOverlay.TRG.IMGS_thumb && !previewOverlay.isEnlargeable(previewOverlay.TRG, previewOverlay.IMG)) {
                    if (previewOverlay.TRG.IMGS_HD_stack && !previewOverlay.TRG.IMGS_HD) {
                        previewOverlay.show("load");
                        previewOverlay.key_action({ which: 9 });
                        return;
                    }
                    if (!previewOverlay.TRG.IMGS_fallback_zoom) {
                        previewOverlay.not_enlargeable();
                        return;
                    }
                    previewOverlay.TRG.IMGS_thumb = false;
                }
                if (previewOverlay.CNT === previewOverlay.IMG && !previewOverlay.IMG.loaded && cfg.hz.thumbAsBG && previewOverlay.TRG.IMGS_thumb !== false && !previewOverlay.TRG.IMGS_album) {
                    var inner_thumb, w, h;
                    if (typeof previewOverlay.TRG.IMGS_thumb !== "string") {
                        previewOverlay.TRG.IMGS_thumb = null;
                        if (previewOverlay.TRG.hasAttribute("src")) previewOverlay.TRG.IMGS_thumb = previewOverlay.TRG.src;
                        else if (previewOverlay.TRG.childElementCount) {
                            inner_thumb = previewOverlay.TRG.querySelector("img[src]");
                            if (inner_thumb) previewOverlay.TRG.IMGS_thumb = inner_thumb.src;
                        }
                    }
                    if (previewOverlay.TRG.IMGS_thumb === previewOverlay.IMG.src) {
                        delete previewOverlay.TRG.IMGS_thumb;
                        delete previewOverlay.TRG.IMGS_thumb_ok;
                    } else if (previewOverlay.TRG.IMGS_thumb) {
                        w = true;
                        if (!previewOverlay.TRG.IMGS_thumb_ok) {
                            w = (inner_thumb || previewOverlay.TRG).clientWidth;
                            h = (inner_thumb || previewOverlay.TRG).clientHeight;
                            previewOverlay.TRG.IMGS_thumb_ok = Math.abs(previewOverlay.IMG.naturalWidth / previewOverlay.IMG.naturalHeight - w / h) <= 0.2;
                            w = w < 1024 && h < 1024 && w < previewOverlay.IMG.naturalWidth && h < previewOverlay.IMG.naturalHeight;
                        }
                        if (w && previewOverlay.TRG.IMGS_thumb_ok) {
                            if (previewOverlay.interlacer) w = previewOverlay.interlacer.style;
                            else {
                                previewOverlay.interlacer = doc.createElement("div");
                                h = previewOverlay.interlacer;
                                if (cfg.hz.thumbAsBGOpacity > 0) {
                                    w = parseInt(cfg.hz.thumbAsBGColor.slice(1), 16);
                                    h.appendChild(doc.createElement("div")).style.cssText =
                                        "width: 100%; height: 100%; background-color: rgba(" +
                                        (w >> 16) +
                                        "," +
                                        ((w >> 8) & 255) +
                                        "," +
                                        (w & 255) +
                                        "," +
                                        parseFloat(cfg.hz.thumbAsBGOpacity) +
                                        ")";
                                }
                                w = h.style;
                                w.cssText =
                                    "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-size: 100% 100%; background-repeat: no-repeat";
                                previewOverlay.DIV.insertBefore(h, previewOverlay.IMG);
                            }
                            w.backgroundImage = "url(" + previewOverlay.TRG.IMGS_thumb + ")";
                            w.display = "block";
                        }
                        delete previewOverlay.TRG.IMGS_thumb;
                        delete previewOverlay.TRG.IMGS_thumb_ok;
                    }
                }
            }
            delete previewOverlay.TRG.IMGS_c_resolved;
            previewOverlay.TRG.IMGS_c = previewOverlay.CNT.src;
            if (!previewOverlay.TRG.IMGS_SVG) previewOverlay.stack[previewOverlay.IMG.src] = true;
            previewOverlay.show(true);
            previewOverlay.HD_cursor(previewOverlay.TRG.IMGS_HD !== false);
            if (cfg.hz.history) previewOverlay.history();
            if (!previewOverlay.fullZm && previewOverlay.anim.maxDelay && previewOverlay.TRG.IMGS_album)
                previewOverlay.timers.no_anim_in_album = setTimeout(function () {
                    previewOverlay.DIV.style.transition = previewOverlay.anim.css;
                }, 100);
        },

        hide: function (e) {
            previewOverlay.HD_cursor(true);
            previewOverlay.fireHide = false;
            if (previewOverlay.iFrame) {
                win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", hide: true }, "*");
                return;
            } else win.removeEventListener("mousemove", previewOverlay.m_move, true);
            if (previewOverlay.state < 3 || previewOverlay.LDR_msg || previewOverlay.state === null) {
                if (previewOverlay.state >= 2) previewOverlay.reset();
                return;
            }
            var animDIV = previewOverlay.BOX === previewOverlay.DIV && previewOverlay.anim.maxDelay;
            var animLDR = previewOverlay.BOX === previewOverlay.LDR && cfg.hz.LDRanimate;
            if ((!animDIV && !animLDR) || previewOverlay.fullZm) {
                if (!cfg.hz.waitHide) previewOverlay.hideTime = Date.now();
                previewOverlay.reset();
                return;
            }
            previewOverlay.state = 2;
            if (previewOverlay.CAP) {
                previewOverlay.HLP.textContent = "";
                previewOverlay.CAP.style.display = "none";
            }
            if ((animDIV && previewOverlay.anim.left) || animLDR)
                previewOverlay.BOX.style.left = (cfg.hz.follow ? e.clientX || previewOverlay.x : parseInt(previewOverlay.BOX.style.left, 10) + previewOverlay.BOX.offsetWidth / 2) + "px";
            if ((animDIV && previewOverlay.anim.top) || animLDR)
                previewOverlay.BOX.style.top = (cfg.hz.follow ? e.clientY || previewOverlay.y : parseInt(previewOverlay.BOX.style.top, 10) + previewOverlay.BOX.offsetHeight / 2) + "px";
            if (animDIV) {
                if (previewOverlay.anim.width) previewOverlay.DIV.style.width = "0";
                if (previewOverlay.anim.height) previewOverlay.DIV.style.height = "0";
            }
            if ((animDIV && previewOverlay.anim.opacity) || animLDR) previewOverlay.BOX.style.opacity = "0";
            previewOverlay.timers.anim_end = setTimeout(previewOverlay.reset, previewOverlay.anim.maxDelay);
        },

        reset: function (preventImmediateHover) {
            if (!previewOverlay.DIV) return;
            if (previewOverlay.iFrame) win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", reset: true }, "*");
            if (previewOverlay.state) win.removeEventListener("mousemove", previewOverlay.m_move, true);
            previewOverlay.node = null;
            clearTimeout(previewOverlay.timers.delayed_loader);
            win.removeEventListener("wheel", previewOverlay.wheeler, true);
            previewOverlay.DIV.style.display = previewOverlay.LDR.style.display = "none";
            previewOverlay.DIV.style.width = previewOverlay.DIV.style.height = "0";
            previewOverlay.CNT.removeAttribute("src");
            if (previewOverlay.CNT === previewOverlay.VID) previewOverlay.VID.load();
            if (previewOverlay.anim.left || previewOverlay.anim.top) previewOverlay.DIV.style.left = previewOverlay.DIV.style.top = "auto";
            if (previewOverlay.anim.opacity) previewOverlay.DIV.style.opacity = "0";
            if (cfg.hz.LDRanimate) {
                previewOverlay.LDR.style.left = "auto";
                previewOverlay.LDR.style.top = "auto";
                previewOverlay.LDR.style.opacity = "0";
            }
            if (previewOverlay.CAP) previewOverlay.CAP.firstChild.style.display = previewOverlay.CAP.style.display = "none";
            if (previewOverlay.IMG.scale) {
                delete previewOverlay.IMG.scale;
                previewOverlay.IMG.style.transform = "";
            }
            if (previewOverlay.VID.scale) {
                delete previewOverlay.VID.scale;
                previewOverlay.VID.style.transform = "";
            }
            previewOverlay.DIV.curdeg = 0;
            previewOverlay.DIV.style.transform = "";
            previewOverlay.HD_cursor(true);
            if (previewOverlay.fullZm) {
                previewOverlay.fullZm = false;
                previewOverlay.hideTime = null;
                if (previewOverlay.anim.maxDelay) previewOverlay.DIV.style.transition = previewOverlay.anim.css;
                win.removeEventListener("click", previewOverlay.fzClickAct, true);
                win.addEventListener("mouseover", previewOverlay.handleMouseOver, true);
                doc.addEventListener("wheel", previewOverlay.scroller, { capture: true, passive: true });
                doc.documentElement.addEventListener("mouseleave", previewOverlay.m_leave);
            }
            if (preventImmediateHover) {
                previewOverlay.lastScrollTRG = previewOverlay.TRG;
                previewOverlay.scroller();
            }
            previewOverlay.state = 1;
        },

        onVisibilityChange: function (e) {
            if (previewOverlay.fullZm) return;
            if (doc.hidden) {
                if (previewOverlay.fireHide) previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG });
            } else handleFreezeRelease(e);
        },
        keyup_freeze: function (e) {
            if (!e || shortcut.key(e) === cfg.hz.actTrigger) {
                previewOverlay.freeze = !cfg.hz.deactivate;
                previewOverlay.keyup_freeze_on = false;
                win.removeEventListener("keyup", previewOverlay.keyup_freeze, true);
            }
        },

        key_action: function (e) {
            var pv, key;
            if (!cfg) return;
            if (shortcut.isModifier(e)) {
                if (previewOverlay.keyup_freeze_on || typeof previewOverlay.freeze === "number") return;
                if (e.repeat || shortcut.key(e) !== cfg.hz.actTrigger) return;
                if (previewOverlay.fireHide && previewOverlay.state < 3)
                    if (cfg.hz.deactivate) previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG });
                    else previewOverlay.load(previewOverlay.SRC === null ? previewOverlay.TRG.IMGS_c_resolved : previewOverlay.SRC);
                previewOverlay.freeze = !!cfg.hz.deactivate;
                previewOverlay.keyup_freeze_on = true;
                win.addEventListener("keyup", previewOverlay.keyup_freeze, true);
                return;
            }
            if (!e.repeat)
                if (previewOverlay.keyup_freeze_on) previewOverlay.keyup_freeze();
                else if (previewOverlay.freeze === false && !previewOverlay.fullZm && previewOverlay.lastScrollTRG) previewOverlay.mover({ target: previewOverlay.lastScrollTRG });
            key = shortcut.key(e);
            if (previewOverlay.state < 3 && previewOverlay.fireHide && key === "Esc") previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG });
            pv = e.target;
            if (cfg.hz.scOffInInput && pv && (pv.isContentEditable || ((pv = pv.nodeName.toUpperCase()) && (pv[2] === "X" || pv === "INPUT")))) return;
            if (e.altKey && e.shiftKey) {
                pv = true;
                if (key === cfg.keys.hz_preload) win.top.postMessage({ vdfDpshPtdhhd: "preload" }, "*");
                else if (key === cfg.keys.hz_toggle) {
                    if (win.sessionStorage.IMGS_suspend) delete win.sessionStorage.IMGS_suspend;
                    else win.sessionStorage.IMGS_suspend = "1";
                    win.top.postMessage({ vdfDpshPtdhhd: "toggle" }, "*");
                } else pv = false;
            } else if (!(e.altKey || e.metaKey) && (previewOverlay.state > 2 || previewOverlay.LDR_msg)) {
                pv = !e.ctrlKey;
                if (e.ctrlKey && key === "S" || !e.ctrlKey && !e.shiftKey && key === cfg.keys.hz_save) {
                    if (!e.repeat && previewOverlay.CNT.src) {
                        Port.send({
                            cmd: "download",
                            url: previewOverlay.CNT.src,
                            priorityExt: (previewOverlay.CNT.src.match(/#([\da-z]{3,4})$/) || [])[1],
                            ext: { img: "jpg", video: "mp4", audio: "mp3" }[previewOverlay.CNT.audio ? "audio" : previewOverlay.CNT.localName],
                        });
                    }
                    pv = true;
                } else if (e.ctrlKey) {
                    if (previewOverlay.state === 4)
                        if (key === "C") {
                            if (!e.shiftKey && "oncopy" in doc) {
                                pv = true;
                                if (Date.now() - previewOverlay.timers.copy < 500) key = previewOverlay.TRG.IMGS_caption;
                                else key = previewOverlay.CNT.src;
                                var oncopy = function (ev) {
                                    this.removeEventListener(ev.type, oncopy);
                                    ev.clipboardData.setData("text/plain", key);
                                    ev.preventDefault();
                                };
                                doc.addEventListener("copy", oncopy);
                                doc.execCommand("copy");
                                previewOverlay.timers.copy = Date.now();
                            }
                        } else if (key === cfg.keys.hz_open) {
                            key = {};
                            ((previewOverlay.TRG.IMGS_caption || "").match(/\b((?:www\.[\w-]+(\.\S{2,7}){1,4}|https?:\/\/)\S+)/g) || []).forEach(function (el) {
                                key[el[0] === "w" ? "http://" + el : el] = 1;
                            });
                            key = Object.keys(key);
                            if (key.length) {
                                Port.send({ cmd: "open", url: key, nf: e.shiftKey });
                                if (!e.shiftKey && !previewOverlay.fullZm) previewOverlay.reset();
                                pv = true;
                            }
                        } else if (key === "Left" || key === "Right") {
                            key = key === "Left" ? -5 : 5;
                            previewOverlay.VID.currentTime += key * (e.shiftKey ? 3 : 1);
                        } else if (key === "Up" || key === "Down") {
                            const delta = key === "Down" ? -0.05 : 0.05;
                            previewOverlay.VID.volume = Math.max(0, Math.min(1, previewOverlay.VID.volume + delta));
                        }
                } else if (key === "-" || key === "+" || key === "=") previewOverlay.resize(key === "-" ? "-" : "+");
                else if (key === "Tab") {
                    if (previewOverlay.TRG.IMGS_HD_stack) {
                        if (previewOverlay.CAP) previewOverlay.CAP.style.display = "none";
                        previewOverlay.TRG.IMGS_HD = !previewOverlay.TRG.IMGS_HD;
                        key = previewOverlay.TRG.IMGS_c || previewOverlay.TRG.IMGS_c_resolved;
                        delete previewOverlay.TRG.IMGS_c;
                        previewOverlay.set(previewOverlay.TRG.IMGS_HD_stack);
                        previewOverlay.TRG.IMGS_HD_stack = key;
                    }
                    if (e.shiftKey) cfg.hz.hiRes = !cfg.hz.hiRes;
                } else if (key === "Esc")
                    if (previewOverlay.CNT === previewOverlay.VID && (win.fullScreen || doc.fullscreenElement || (topViewportWidth === win.screen.width && topViewportHeight === win.screen.height)))
                        pv = false;
                    else previewOverlay.reset(true);
                else if (key === cfg.keys.hz_fullZm || key === "Enter")
                    if (previewOverlay.fullZm)
                        if (e.shiftKey) previewOverlay.fullZm = previewOverlay.fullZm === 1 ? 2 : 1;
                        else previewOverlay.reset(true);
                    else {
                        win.removeEventListener("mouseover", previewOverlay.handleMouseOver, true);
                        doc.removeEventListener("wheel", previewOverlay.scroller, true);
                        doc.documentElement.removeEventListener("mouseleave", previewOverlay.m_leave, false);
                        previewOverlay.fullZm = (cfg.hz.fzMode !== 1) !== !e.shiftKey ? 1 : 2;
                        previewOverlay.switchToHiResInFZ();
                        if (previewOverlay.anim.maxDelay)
                            setTimeout(function () {
                                if (previewOverlay.fullZm) previewOverlay.DIV.style.transition = "all 0s";
                            }, previewOverlay.anim.maxDelay);
                        pv = previewOverlay.DIV.style;
                        if (previewOverlay.CNT === previewOverlay.VID) previewOverlay.VID.controls = true;
                        if (previewOverlay.state > 2 && previewOverlay.fullZm !== 2) {
                            pv.visibility = "hidden";
                            previewOverlay.resize(0);
                            previewOverlay.m_move();
                            pv.visibility = "visible";
                        }
                        if (!previewOverlay.iFrame) win.addEventListener("mousemove", previewOverlay.m_move, true);
                        win.addEventListener("click", previewOverlay.fzClickAct, true);
                    }
                else if (e.which > 31 && e.which < 41) {
                    pv = null;
                    if (previewOverlay.CNT === previewOverlay.VID) {
                        pv = true;
                        if (key === "Space")
                            if (e.shiftKey) {
                                if (!previewOverlay.VID.audio) previewOverlay.VID.controls = previewOverlay.VID._controls = !previewOverlay.VID._controls;
                            } else if (previewOverlay.VID.paused) previewOverlay.VID.play();
                            else previewOverlay.VID.pause();
                        else if (key === "Up" || key === "Down")
                            if (e.shiftKey) previewOverlay.VID.playbackRate *= key === "Up" ? 4 / 3 : 0.75;
                            else pv = null;
                        else if (!e.shiftKey && (key === "PgUp" || key === "PgDn"))
                            if (previewOverlay.VID.audio) previewOverlay.VID.currentTime += key === "PgDn" ? 4 : -4;
                            else {
                                previewOverlay.VID.pause();
                                previewOverlay.VID.currentTime = (previewOverlay.VID.currentTime * 25 + (key === "PgDn" ? 1 : -1)) / 25 + 1e-5;
                            }
                        else pv = null;
                    }
                    if (!pv && previewOverlay.TRG.IMGS_album) {
                        switch (key) {
                            case "End":
                                if (e.shiftKey && (pv = prompt("#", previewOverlay.stack[previewOverlay.TRG.IMGS_album].search || "") || null))
                                    previewOverlay.stack[previewOverlay.TRG.IMGS_album].search = pv;
                                else pv = false;
                                break;
                            case "Home":
                                pv = true;
                                break;
                            case "Up":
                            case "Down":
                                pv = null;
                                break;
                            default:
                                pv = ((key === "Space" && !e.shiftKey) || key === "Right" || key === "PgDn" ? 1 : -1) * (e.shiftKey && key !== "Space" ? 5 : 1);
                        }
                        if (pv !== null) {
                            previewOverlay.album(pv, true);
                            pv = true;
                        }
                    }
                } else if (key === cfg.keys.mOrig || key === cfg.keys.mFit || key === cfg.keys.mFitW || key === cfg.keys.mFitH) previewOverlay.resize(key);
                else if (key === cfg.keys.hz_fullSpace) {
                    cfg.hz.fullspace = !cfg.hz.fullspace;
                    previewOverlay.show();
                } else if (key === cfg.keys.flipH) toggleFlipTransform(previewOverlay.CNT, 0);
                else if (key === cfg.keys.flipV) toggleFlipTransform(previewOverlay.CNT, 1);
                else if (key === cfg.keys.rotL || key === cfg.keys.rotR) {
                    previewOverlay.DIV.curdeg += key === cfg.keys.rotR ? 90 : -90;
                    if (previewOverlay.CAP && previewOverlay.CAP.textContent && previewOverlay.CAP.state !== 0) previewOverlay.CAP.style.display = previewOverlay.DIV.curdeg % 360 ? "none" : "block";
                    previewOverlay.DIV.style.transform = previewOverlay.DIV.curdeg ? "rotate(" + previewOverlay.DIV.curdeg + "deg)" : "";
                    if (previewOverlay.fullZm) previewOverlay.m_move();
                    else previewOverlay.show();
                } else if (key === cfg.keys.hz_caption)
                    if (e.shiftKey) {
                        previewOverlay.createCAP();
                        switch (previewOverlay.CAP.state) {
                            case 0:
                                key = cfg.hz.capWH || cfg.hz.capText ? 1 : 2;
                                break;
                            case 2:
                                key = 0;
                                break;
                            default:
                                key = cfg.hz.capWH && cfg.hz.capText ? 0 : 2;
                        }
                        previewOverlay.CAP.state = key;
                        previewOverlay.CAP.style.display = "none";
                        previewOverlay.updateCaption();
                        previewOverlay.show();
                    } else {
                        if (previewOverlay.CAP) previewOverlay.CAP.style.whiteSpace = previewOverlay.CAP.style.whiteSpace === "nowrap" ? "normal" : "nowrap";
                    }
                else if (key === cfg.keys.hz_history) previewOverlay.history(e.shiftKey);
                else if (key === cfg.keys.send) {
                    if (previewOverlay.CNT === previewOverlay.IMG) openImageInHosts({ url: previewOverlay.CNT.src, nf: e.shiftKey });
                } else if (key === cfg.keys.hz_open) {
                    if (previewOverlay.CNT.src) {
                        Port.send({ cmd: "open", url: previewOverlay.CNT.src.replace(hashFragmentRegex, ""), nf: e.shiftKey });
                        if (!e.shiftKey && !previewOverlay.fullZm) previewOverlay.reset();
                    }
                } else if (key === cfg.keys.prefs) {
                    Port.send({ cmd: "open", url: "options/options.html#settings" });
                    if (!previewOverlay.fullZm) previewOverlay.reset();
                } else pv = false;
            } else pv = false;
            if (pv) preventEvent(e);
        },

        switchToHiResInFZ: function () {
            if (!previewOverlay.fullZm || !previewOverlay.TRG || cfg.hz.hiResOnFZ < 1) return false;
            if (previewOverlay.TRG.IMGS_HD !== false) return false;
            if (previewOverlay.IMG.naturalWidth < 800 && previewOverlay.IMG.naturalHeight < 800) return false;
            var ratio = previewOverlay.IMG.naturalWidth / previewOverlay.IMG.naturalHeight;
            if ((ratio < 1 ? 1 / ratio : ratio) < cfg.hz.hiResOnFZ) return false;
            previewOverlay.show("load");
            previewOverlay.key_action({ which: 9 });
            return true;
        },

        fzDragEnd: function () {
            previewOverlay.fullZm = previewOverlay.fullZm > 1 ? 2 : 1;
            win.removeEventListener("mouseup", previewOverlay.fzDragEnd, true);
        },

        fzClickAct: function (e) {
            if (e.button !== 0) return;
            if (mouseDownStarted === false) {
                mouseDownStarted = null;
                preventEvent(e);
                return;
            }
            if (e.target === previewOverlay.CAP || (e.target.parentNode && e.target.parentNode === previewOverlay.CAP)) {
                if (previewOverlay.TRG.IMGS_HD_stack) previewOverlay.key_action({ which: 9 });
            } else if (e.target === previewOverlay.VID)
                if ((e.offsetY || e.layerY || 0) < Math.min(previewOverlay.CNT.clientHeight - 40, (2 * previewOverlay.CNT.clientHeight) / 3)) previewOverlay.reset(true);
                else {
                    if ((e.offsetY || e.layerY || 0) < previewOverlay.CNT.clientHeight - 40 && (e.offsetY || e.layerY || 0) > (2 * previewOverlay.CNT.clientHeight) / 3)
                        if (previewOverlay.VID.paused) previewOverlay.VID.play();
                        else previewOverlay.VID.pause();
                }
            else previewOverlay.reset(true);
            if (e.target.IMGS_) preventEvent(e, false);
        },

        scroller: function (e) {
            if (e) {
                if (previewOverlay.fullZm) return;
                if (!e.target.IMGS_)
                    if (previewOverlay.lastScrollTRG && previewOverlay.lastScrollTRG !== e.target) previewOverlay.lastScrollTRG = false;
                    else if (previewOverlay.lastScrollTRG !== false) previewOverlay.lastScrollTRG = e.target;
            }
            if (previewOverlay.freeze || previewOverlay.keyup_freeze_on) return;
            if (e) {
                if (previewOverlay.fireHide) previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG });
                previewOverlay.x = e.clientX;
                previewOverlay.y = e.clientY;
            }
            previewOverlay.freeze = true;
            win.addEventListener("mousemove", previewOverlay.mover, true);
        },

        mover: function (e) {
            if (previewOverlay.x === e.clientX && previewOverlay.y === e.clientY) return;
            win.removeEventListener("mousemove", previewOverlay.mover, true);
            if (previewOverlay.keyup_freeze_on) {
                previewOverlay.lastScrollTRG = null;
                return;
            }
            if (previewOverlay.freeze === true) previewOverlay.freeze = !cfg.hz.deactivate;
            if (previewOverlay.lastScrollTRG !== e.target) {
                previewOverlay.hideTime -= 1e3;
                previewOverlay.handleMouseOver(e);
            }
            previewOverlay.lastScrollTRG = null;
        },

        wheeler: function (e) {
            if (e.clientX >= viewportWidth || e.clientY >= viewportHeight) return;
            var d = cfg.hz.scrollDelay;
            if (previewOverlay.state > 2 && d >= 20)
                if (e.timeStamp - (previewOverlay.lastScrollTime || 0) < d) d = null;
                else previewOverlay.lastScrollTime = e.timeStamp;
            if (
                previewOverlay.TRG &&
                previewOverlay.TRG.IMGS_album &&
                cfg.hz.pileWheel &&
                (!previewOverlay.fullZm || (e.clientX < 50 && e.clientY < 50) || (previewOverlay.CAP && e.target === previewOverlay.CAP.firstChild))
            ) {
                if (d !== null) {
                    if (cfg.hz.pileWheel === 2) {
                        if (!e.deltaX && !e.wheelDeltaX) return;
                        d = (e.deltaX || -e.wheelDeltaX) > 0;
                    } else d = (e.deltaY || -e.wheelDelta) > 0;
                    previewOverlay.album(d ? 1 : -1, true);
                }
                preventEvent(e);
                return;
            }
            if (previewOverlay.fullZm && previewOverlay.fullZm < 4) {
                if (d !== null)
                    previewOverlay.resize(
                        (e.deltaY || -e.wheelDelta) > 0 ? "-" : "+",
                        previewOverlay.fullZm > 1 ? (e.target === previewOverlay.CNT ? [e.offsetX || e.layerX || 0, e.offsetY || e.layerY || 0] : []) : null
                    );
                preventEvent(e);
                return;
            }
            previewOverlay.lastScrollTRG = previewOverlay.TRG;
            previewOverlay.reset();
        },

        resize: function (x, xy_img) {
            if (previewOverlay.state !== 4 || !previewOverlay.fullZm) return;
            var s = previewOverlay.TRG.IMGS_SVG ? previewOverlay.stack[previewOverlay.IMG.src].slice() : [previewOverlay.CNT.naturalWidth, previewOverlay.CNT.naturalHeight];
            var k = cfg.keys;
            var rot = previewOverlay.DIV.curdeg % 180;
            updateViewportDimensions();
            if (rot) s.reverse();
            if (x === k.mFit)
                if (viewportWidth / viewportHeight < s[0] / s[1]) x = viewportWidth > s[0] ? 0 : k.mFitW;
                else x = viewportHeight > s[1] ? 0 : k.mFitH;
            switch (x) {
                case k.mFitW:
                    viewportWidth -= previewOverlay.DBOX["wpb"];
                    s[1] *= viewportWidth / s[0];
                    s[0] = viewportWidth;
                    if (previewOverlay.fullZm > 1) previewOverlay.y = 0;
                    break;
                case k.mFitH:
                    viewportHeight -= previewOverlay.DBOX["hpb"];
                    s[0] *= viewportHeight / s[1];
                    s[1] = viewportHeight;
                    if (previewOverlay.fullZm > 1) previewOverlay.y = 0;
                    break;
                case "+":
                case "-":
                    k = [parseInt(previewOverlay.DIV.style.width, 10), 0];
                    k[1] = (k[0] * s[rot ? 0 : 1]) / s[rot ? 1 : 0];
                    if (xy_img) {
                        if (xy_img[1] === undefined || rot) {
                            xy_img[0] = k[0] / 2;
                            xy_img[1] = k[1] / 2;
                        } else if (previewOverlay.DIV.curdeg % 360)
                            if (!(previewOverlay.DIV.curdeg % 180)) {
                                xy_img[0] = k[0] - xy_img[0];
                                xy_img[1] = k[1] - xy_img[1];
                            }
                        xy_img[0] /= k[rot ? 1 : 0];
                        xy_img[1] /= k[rot ? 0 : 1];
                    }
                    x = x === "+" ? 4 / 3 : 0.75;
                    s[0] = x * Math.max(16, k[rot ? 1 : 0]);
                    s[1] = x * Math.max(16, k[rot ? 0 : 1]);
                    if (xy_img) {
                        xy_img[0] *= k[rot ? 1 : 0] - s[0];
                        xy_img[1] *= k[rot ? 0 : 1] - s[1];
                    }
            }
            if (!xy_img) xy_img = [true, null];
            xy_img.push(s[rot ? 1 : 0], s[rot ? 0 : 1]);
            previewOverlay.m_move(xy_img);
        },

        m_leave: function (e) {
            if (!previewOverlay.fireHide || e.relatedTarget) return;
            if (previewOverlay.x === e.clientX && previewOverlay.y === e.clientY) return;
            previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG, clientX: e.clientX, clientY: e.clientY });
        },

        handleMouseOver: function (e) {
            var src, trg, cache;
            if (cfg.hz.deactivate && (previewOverlay.freeze || e[cfg._freezeTriggerEventKey])) return;
            if (previewOverlay.fireHide) {
                if (e.target && (e.target.IMGS_ || ((e.relatedTarget || e).IMGS_ && e.target === previewOverlay.TRG))) {
                    if (cfg.hz.capNoSBar) e.preventDefault();
                    return;
                }
                if (previewOverlay.CAP) {
                    previewOverlay.CAP.style.display = "none";
                    previewOverlay.CAP.firstChild.style.display = "none";
                }
                clearTimeout(previewOverlay.timers.preview);
                clearInterval(previewOverlay.timers.onReady);
                if (previewOverlay.timers.resolver) {
                    clearTimeout(previewOverlay.timers.resolver);
                    previewOverlay.timers.resolver = null;
                }
                if (e.relatedTarget) {
                    trg = previewOverlay.lastTRGStyle;
                    if (trg.outline !== null) {
                        e.relatedTarget.style.outline = trg.outline;
                        trg.outline = null;
                    }
                    if (trg.cursor !== null) {
                        e.relatedTarget.style.cursor = trg.cursor;
                        trg.cursor = null;
                    }
                }
                if (previewOverlay.nodeToReset) {
                    previewOverlay.resetNode(previewOverlay.nodeToReset);
                    previewOverlay.nodeToReset = null;
                }
                if (previewOverlay.TRG) {
                    if (previewOverlay.DIV)
                        if (previewOverlay.timers.no_anim_in_album) {
                            previewOverlay.timers.no_anim_in_album = null;
                            previewOverlay.DIV.style.transition = previewOverlay.anim.css;
                        }
                    previewOverlay.TRG = null;
                }
                if (previewOverlay.hideTime === 0 && previewOverlay.state < 3) previewOverlay.hideTime = Date.now();
                if (!e.target) {
                    previewOverlay.hide(e);
                    return;
                }
            }
            if (e.target.IMGS_c === true) {
                if (previewOverlay.fireHide) previewOverlay.hide(e);
                return;
            }
            trg = e.target;
            cache = trg.IMGS_c;
            if (!cache)
                if (trg.IMGS_c_resolved) src = trg.IMGS_c_resolved;
                else previewOverlay.TRG = trg;
            if (cache || src || (src = previewOverlay.find(trg, e.clientX, e.clientY)) || src === null) {
                if (src === 1) src = false;
                if (cfg.hz.capNoSBar) e.preventDefault();
                clearTimeout(previewOverlay.timers.preview);
                if (!cfg.hz.waitHide) clearTimeout(previewOverlay.timers.anim_end);
                if (!previewOverlay.iFrame) win.addEventListener("mousemove", previewOverlay.m_move, true);
                if (!cache && src && !trg.IMGS_c_resolved) {
                    if (cfg.hz.preload === 2 && !previewOverlay.stack[src]) previewOverlay._preload(src);
                    trg.IMGS_c_resolved = src;
                }
                previewOverlay.TRG = trg;
                previewOverlay.SRC = cache || src;
                previewOverlay.x = e.clientX;
                previewOverlay.y = e.clientY;
                var isFrozen = previewOverlay.freeze && !cfg.hz.deactivate && !e[cfg._freezeTriggerEventKey];
                if (
                    !isFrozen &&
                    (!cfg.hz.waitHide || cfg.hz.delay < 15) &&
                    ((previewOverlay.fireHide && previewOverlay.state > 2) || previewOverlay.state === 2 || (previewOverlay.hideTime && Date.now() - previewOverlay.hideTime < 200))
                ) {
                    if (previewOverlay.hideTime) previewOverlay.hideTime = 0;
                    previewOverlay.fireHide = 1;
                    previewOverlay.load(previewOverlay.SRC);
                    return;
                }
                if (previewOverlay.fireHide && previewOverlay.state > 2 && (cfg.hz.waitHide || !cfg.hz.deactivate)) {
                    previewOverlay.hide(e);
                    if (!previewOverlay.anim.maxDelay && !previewOverlay.iFrame) win.addEventListener("mousemove", previewOverlay.m_move, true);
                    if (previewOverlay.hideTime) previewOverlay.hideTime = 0;
                }
                previewOverlay.fireHide = true;
                if (cfg.hz.markOnHover && (isFrozen || cfg.hz.delay >= 25))
                    if (cfg.hz.markOnHover === "cr") {
                        previewOverlay.lastTRGStyle.cursor = trg.style.cursor;
                        trg.style.cursor = "zoom-in";
                    } else {
                        previewOverlay.lastTRGStyle.outline = trg.style.outline;
                        trg.style.outline = "1px " + cfg.hz.markOnHover + " red";
                    }
                if (isFrozen) {
                    clearTimeout(previewOverlay.timers.resolver);
                    return;
                }
                var delay = (previewOverlay.state === 2 || previewOverlay.hideTime) && cfg.hz.waitHide ? previewOverlay.anim.maxDelay : cfg.hz.delay;
                if (delay) previewOverlay.timers.preview = setTimeout(previewOverlay.load, delay);
                else previewOverlay.load(previewOverlay.SRC);
            } else {
                trg.IMGS_c = true;
                previewOverlay.TRG = null;
                if (previewOverlay.fireHide) previewOverlay.hide(e);
            }
        },

        load: function (src) {
            if ((cfg.hz.waitHide || !cfg.hz.deactivate) && previewOverlay.anim.maxDelay && !previewOverlay.iFrame) win.addEventListener("mousemove", previewOverlay.m_move, true);
            if (!previewOverlay.TRG) return;
            if (src === undefined) src = (cfg.hz.delayOnIdle && previewOverlay.TRG.IMGS_c_resolved) || previewOverlay.SRC;
            if (previewOverlay.SRC !== undefined) previewOverlay.SRC = undefined;
            previewOverlay.TBOX = (previewOverlay.TRG.IMGS_overflowParent || previewOverlay.TRG).getBoundingClientRect();
            previewOverlay.TBOX.Left = previewOverlay.TBOX.left + win.pageXOffset;
            previewOverlay.TBOX.Right = previewOverlay.TBOX.Left + previewOverlay.TBOX.width;
            previewOverlay.TBOX.Top = previewOverlay.TBOX.top + win.pageYOffset;
            previewOverlay.TBOX.Bottom = previewOverlay.TBOX.Top + previewOverlay.TBOX.height;
            if (cfg.hz.markOnHover !== "cr") {
                previewOverlay.TRG.style.outline = previewOverlay.lastTRGStyle.outline;
                previewOverlay.lastTRGStyle.outline = null;
            } else if (previewOverlay.lastTRGStyle.cursor !== null) {
                if (previewOverlay.DIV) previewOverlay.DIV.style.cursor = "";
                previewOverlay.TRG.style.cursor = previewOverlay.lastTRGStyle.cursor;
                previewOverlay.lastTRGStyle.cursor = null;
            }
            if (src === null || (src && src.params) || src === false) {
                if (src === false || (src && (src = previewOverlay.resolve(src.URL, src.params, previewOverlay.TRG)) === 1)) {
                    previewOverlay.create();
                    previewOverlay.show("R_js");
                    return;
                }
                if (src === false) {
                    previewOverlay.reset();
                    return;
                }
                if (src === null) {
                    if (previewOverlay.state < 4 || !previewOverlay.TRG.IMGS_c) {
                        if (previewOverlay.state > 3) previewOverlay.IMG.removeAttribute("src");
                        previewOverlay.create();
                        previewOverlay.show("res");
                    }
                    return;
                }
            }
            if (previewOverlay.TRG.IMGS_album) {
                previewOverlay.createCAP();
                previewOverlay.album("" + previewOverlay.stack[previewOverlay.TRG.IMGS_album][0]);
                return;
            }
            previewOverlay.set(src);
        },

        m_move: function (e) {
            if (e && previewOverlay.x === e.clientX && previewOverlay.y === e.clientY) return;
            if (previewOverlay.fullZm) {
                var x = previewOverlay.x,
                    y = previewOverlay.y,
                    w,
                    h;
                if (!e) e = {};
                if (mouseDownStarted === true) mouseDownStarted = false;
                if (e.target) {
                    previewOverlay.x = e.clientX;
                    previewOverlay.y = e.clientY;
                }
                if (previewOverlay.fullZm > 1 && e[0] !== true) {
                    w = previewOverlay.BOX.style;
                    if (previewOverlay.fullZm === 3 && e.target) {
                        x = parseInt(w.left, 10) - x + e.clientX;
                        y = parseInt(w.top, 10) - y + e.clientY;
                    } else if (e[1] !== undefined) {
                        x = parseInt(w.left, 10) + e[0];
                        y = parseInt(w.top, 10) + e[1];
                    } else x = null;
                } else {
                    var rot = previewOverlay.state === 4 && previewOverlay.DIV.curdeg % 180;
                    if (previewOverlay.BOX === previewOverlay.DIV) {
                        if (previewOverlay.TRG.IMGS_SVG) {
                            h = previewOverlay.stack[previewOverlay.IMG.src];
                            h = h[1] / h[0];
                        }
                        w = e[2] || parseInt(previewOverlay.DIV.style.width, 10);
                        h = parseInt(w * (h || previewOverlay.CNT.naturalHeight / previewOverlay.CNT.naturalWidth) + previewOverlay.DBOX["hpb"], 10);
                        w += previewOverlay.DBOX["wpb"];
                    } else {
                        w = previewOverlay.LDR.wh[0];
                        h = previewOverlay.LDR.wh[1];
                    }
                    if (rot) {
                        rot = w;
                        w = h;
                        h = rot;
                        rot = (w - h) / 2;
                    } else rot = 0;
                    x = (w - previewOverlay.DBOX["wpb"] > viewportWidth ? -((previewOverlay.x * (w - viewportWidth + 80)) / viewportWidth) + 40 : (viewportWidth - w) / 2) + rot - previewOverlay.DBOX["ml"];
                    y = (h - previewOverlay.DBOX["hpb"] > viewportHeight ? -((previewOverlay.y * (h - viewportHeight + 80)) / viewportHeight) + 40 : (viewportHeight - h) / 2) - rot - previewOverlay.DBOX["mt"];
                }
                if (e[2] !== undefined) {
                    previewOverlay.BOX.style.width = e[2] + "px";
                    previewOverlay.BOX.style.height = e[3] + "px";
                }
                if (x !== null) {
                    previewOverlay.BOX.style.left = x + "px";
                    previewOverlay.BOX.style.top = y + "px";
                }
                return;
            }
            previewOverlay.x = e.clientX;
            previewOverlay.y = e.clientY;
            if (previewOverlay.freeze && !cfg.hz.deactivate && !e[cfg._freezeTriggerEventKey]) return;
            if (previewOverlay.state < 3) {
                if (cfg.hz.delayOnIdle && previewOverlay.fireHide !== 1 && previewOverlay.state < 2) {
                    if (previewOverlay.timers.resolver) clearTimeout(previewOverlay.timers.resolver);
                    clearTimeout(previewOverlay.timers.preview);
                    previewOverlay.timers.preview = setTimeout(previewOverlay.load, cfg.hz.delay);
                }
            } else if (
                (e.target.IMGS_ && previewOverlay.TBOX && (previewOverlay.TBOX.Left > e.pageX || previewOverlay.TBOX.Right < e.pageX || previewOverlay.TBOX.Top > e.pageY || previewOverlay.TBOX.Bottom < e.pageY)) ||
                (!e.target.IMGS_ && previewOverlay.TRG !== e.target)
            )
                previewOverlay.handleMouseOver({ relatedTarget: previewOverlay.TRG, clientX: e.clientX, clientY: e.clientY });
            else if (cfg.hz.move && previewOverlay.state > 2 && !previewOverlay.timers.m_move && (previewOverlay.state === 3 || cfg.hz.placement < 2 || cfg.hz.placement > 3))
                previewOverlay.timers.m_move = win.requestAnimationFrame(previewOverlay.m_move_show);
        },

        m_move_show: function () {
            if (previewOverlay.state > 2) previewOverlay.show();
            previewOverlay.timers.m_move = null;
        },

        _preload: function (srcs) {
            if (!Array.isArray(srcs)) {
                if (typeof srcs !== "string") return;
                srcs = [srcs];
            }
            for (var i = 0, lastIdx = srcs.length - 1; i <= lastIdx; ++i) {
                var url = srcs[i];
                var isHDUrl = url[0] === "#";
                if (!((cfg.hz.hiRes && isHDUrl) || (!cfg.hz.hiRes && !isHDUrl))) {
                    if (i !== lastIdx) continue;
                    if (i !== 0) {
                        url = srcs[0];
                        isHDUrl = url[0] === "#";
                    }
                }
                if (isHDUrl) url = url.slice(1);
                if (url.indexOf("&amp;") !== -1) url = url.replace(/&amp;/g, "&");
                new Image().src = url[1] === "/" ? previewOverlay.httpPrepend(url) : url;
                return;
            }
        },

        preload: function (e) {
            if (previewOverlay.preloading) {
                if (!e || e.type !== "DOMNodeInserted") {
                    if (e === false) {
                        delete previewOverlay.preloading;
                        doc.body.removeEventListener("DOMNodeInserted", previewOverlay.preload, true);
                    }
                    return;
                }
            } else {
                e = null;
                previewOverlay.preloading = [];
                doc.body.addEventListener("DOMNodeInserted", previewOverlay.preload, true);
            }
            var nodes = (e && e.target) || doc.body;
            if (
                !nodes ||
                nodes.IMGS_ ||
                nodes.nodeType !== 1 ||
                !(nodes = nodes.querySelectorAll('img[src], :not(img)[style*="background-image"], a[href]')) ||
                !nodes.length
            )
                return;
            nodes = [].slice.call(nodes);
            previewOverlay.preloading = previewOverlay.preloading ? previewOverlay.preloading.concat(nodes) : previewOverlay.preloading;
            nodes = function () {
                var node, src;
                var process_amount = 50;
                var onImgError = function () {
                    this.src = this.IMGS_src_arr.shift().replace(/^#/, "");
                    if (!this.IMGS_src_arr.length) this.onerror = null;
                };
                previewOverlay.resolve_delay = 200;
                while ((node = previewOverlay.preloading.shift())) {
                    if (
                        (node.nodeName.toUpperCase() === "A" && node.childElementCount) ||
                        node.IMGS_c_resolved ||
                        node.IMGS_c ||
                        typeof node.IMGS_caption === "string" ||
                        node.IMGS_thumb
                    )
                        continue;
                    if ((src = previewOverlay.find(node))) {
                        node.IMGS_c_resolved = src;
                        if (Array.isArray(src)) {
                            var i,
                                img = new Image();
                            img.IMGS_src_arr = [];
                            for (i = 0; i < src.length; ++i)
                                if (cfg.hz.hiRes && src[i][0] === "#") img.IMGS_src_arr.push(src[i].slice(1));
                                else if (src[i][0] !== "#") img.IMGS_src_arr.push(src[i]);
                            if (!img.IMGS_src_arr.length) return;
                            img.onerror = onImgError;
                            img.onerror();
                        } else if (typeof src === "string" && !svgExtensionRegex.test(src)) new Image().src = src;
                        break;
                    }
                    if (src === null || process_amount-- < 1) break;
                }
                previewOverlay.resolve_delay = 0;
                if (previewOverlay.preloading.length) previewOverlay.timers.preload = setTimeout(nodes, 300);
                else delete previewOverlay.timers.preload;
            };
            if (previewOverlay.timers.preload) {
                clearTimeout(previewOverlay.timers.preload);
                previewOverlay.timers.preload = setTimeout(nodes, 300);
            } else nodes();
        },
        toggle: function (disable) {
            if (previewOverlay.state || disable === true) previewOverlay.init(null, true);
            else if (cfg) previewOverlay.init();
            else Port.send({ cmd: "hello", no_grants: true });
        },

        onWinResize: function () {
            updateViewportDimensions();
            if (previewOverlay.state < 3) return;
            if (!previewOverlay.fullZm) previewOverlay.show();
            else if (previewOverlay.fullZm === 1) previewOverlay.m_move();
        },

        winOnMessage: function (e) {
            var d = e.data;
            var cmd = d && d.vdfDpshPtdhhd;
            if (cmd === "toggle" || cmd === "preload" || cmd === "isFrame") {
                var frms = win.frames;
                if (!frms) return;
                var i = frms.length;
                while (i--) {
                    if (!frms[i] || !frms[i].postMessage) continue;
                    try {
                        if (frms[i].location.href.lastIndexOf("about:", 0) === 0) continue;
                    } catch (ex) {}
                    frms[i].postMessage({ vdfDpshPtdhhd: cmd, parent: doc.body.nodeName.toUpperCase() }, "*");
                }
                if (cmd === "isFrame") {
                    previewOverlay.iFrame = d.parent === "BODY";
                    if (!previewOverlay.iFrame) win.addEventListener("resize", previewOverlay.onWinResize, true);
                } else previewOverlay[cmd](d);
            } else if (cmd === "from_frame") {
                if (previewOverlay.iFrame) {
                    win.parent.postMessage(d, "*");
                    return;
                }
                if (previewOverlay.fullZm) return;
                if (d.reset) {
                    previewOverlay.reset();
                    return;
                }
                previewOverlay.create();
                previewOverlay.fireHide = true;
                previewOverlay.TRG = previewOverlay.HLP;
                previewOverlay.resetNode(previewOverlay.TRG);
                if (d.hide) {
                    previewOverlay.hide({ target: previewOverlay.TRG, clientX: previewOverlay.DIV.offsetWidth / 2 + cfg.hz.margin, clientY: previewOverlay.DIV.offsetHeight / 2 + cfg.hz.margin });
                    return;
                }
                previewOverlay.x = previewOverlay.y = 0;
                if (typeof d.msg === "string") {
                    previewOverlay.show(d.msg);
                    return;
                }
                if (!d.src) return;
                previewOverlay.TRG.IMGS_caption = d.caption;
                if (d.album) {
                    previewOverlay.TRG.IMGS_album = d.album.id;
                    if (!previewOverlay.stack[d.album.id]) previewOverlay.stack[d.album.id] = d.album.list;
                    d.album = "" + previewOverlay.stack[d.album.id][0];
                }
                if (d.thumb && d.thumb[0]) {
                    previewOverlay.TRG.IMGS_thumb = d.thumb[0];
                    previewOverlay.TRG.IMGS_thumb_ok = d.thumb[1];
                }
                if (d.album) previewOverlay.album(d.album);
                else previewOverlay.set(d.src);
            }
        },

        onMessage: function (d) {
            if (!d) return;
            if (d.cmd === "resolved") {
                var trg = previewOverlay.resolving[d.id] || previewOverlay.TRG;
                var rule = cfg.sieve[d.params.rule.id];
                delete previewOverlay.resolving[d.id];
                if (!d.return_url) previewOverlay.create();
                if (!d.cache && (d.m === true || d.params.rule.skip_resolve)) {
                    try {
                        if (rule.res === 1 && typeof d.params.rule.req_res === "string") rule.res = Function("$", d.params.rule.req_res);
                        previewOverlay.node = trg;
                        d.m = rule.res.call(previewOverlay, d.params);
                    } catch (ex) {
                        console.error(cfg.app?.name + ": [rule " + d.params.rule.id + "] " + ex.message);
                        if (!d.return_url && trg === previewOverlay.TRG) previewOverlay.show("R_js");
                        return 1;
                    }
                    if (d.params.url) d.params.url = d.params.url.join("");
                    if (cfg.tls.sieveCacheRes && !d.params.rule.skip_resolve && d.m)
                        Port.send({ cmd: "resolve_cache", url: d.params.url, cache: JSON.stringify(d.m), rule_id: d.params.rule.id });
                }
                if (d.m && !Array.isArray(d.m) && typeof d.m === "object")
                    if (d.m[""]) {
                        if (typeof d.m.idx === "number") d.idx = d.m.idx + 1;
                        d.m = d.m[""];
                    } else if (typeof d.m.loop === "string") {
                        d.loop = true;
                        d.m = d.m.loop;
                    }
                if (Array.isArray(d.m))
                    if (d.m.length) {
                        if (Array.isArray(d.m[0])) {
                            d.m.forEach(function (el) {
                                if (Array.isArray(el[0]) && el[0].length === 1) el[0] = el[0][0];
                            });
                            if (d.m.length > 1) {
                                trg.IMGS_album = d.params.url;
                                if (previewOverlay.stack[d.params.url]) {
                                    d.m = previewOverlay.stack[d.params.url];
                                    d.m = d.m[d.m[0]];
                                } else {
                                    previewOverlay.createCAP();
                                    d.idx = Math.max(1, Math.min(d.idx, d.m.length)) || 1;
                                    d.m.unshift(d.idx);
                                    previewOverlay.stack[d.params.url] = d.m;
                                    d.m = d.m[d.idx];
                                    d.idx += "";
                                }
                            } else d.m = d.m[0];
                        }
                        if (cfg.hz.capText && d.m[0])
                            if (d.m[1]) previewOverlay.prepareCaption(trg, d.m[1]);
                            else if (cfg.hz.capLinkText && trg.IMGS_caption) d.m[1] = trg.IMGS_caption;
                        d.m = d.m[0];
                    } else d.m = null;
                else if (typeof d.m !== "object" && typeof d.m !== "string") d.m = false;
                if (d.m) {
                    if (
                        !d.noloop &&
                        !trg.IMGS_album &&
                        typeof d.m === "string" &&
                        (d.loop || (rule.loop && rule.loop & (d.params.rule.loop_param === "img" ? 2 : 1)))
                    ) {
                        d.m = previewOverlay.find({ href: d.m, IMGS_TRG: trg });
                        if (d.m === null || d.m === 1) return d.m;
                        else if (d.m === false) {
                            if (!d.return_url) previewOverlay.show("R_res");
                            return d.m;
                        }
                    }
                    if (d.return_url) return d.m;
                    if (trg === previewOverlay.TRG)
                        if (trg.IMGS_album) previewOverlay.album(d.idx || "1");
                        else previewOverlay.set(d.m);
                    else {
                        if (cfg.hz.preload > 1 || previewOverlay.preloading) previewOverlay._preload(d.m);
                        trg.IMGS_c_resolved = d.m;
                    }
                } else if (d.return_url) {
                    delete previewOverlay.TRG.IMGS_c_resolved;
                    return d.m;
                } else if (trg === previewOverlay.TRG) {
                    if (trg.IMGS_fallback_zoom) {
                        previewOverlay.set(trg.IMGS_fallback_zoom);
                        delete trg.IMGS_fallback_zoom;
                        return;
                    }
                    if (d.m === false) {
                        previewOverlay.handleMouseOver({ relatedTarget: trg });
                        trg.IMGS_c = true;
                        delete trg.IMGS_c_resolved;
                    } else previewOverlay.show("R_res");
                }
            } else if (d.cmd === "toggle" || d.cmd === "preload") win.top.postMessage({ vdfDpshPtdhhd: d.cmd }, "*");
            else if (d.cmd === "hello") {
                var e = !!previewOverlay.DIV;
                previewOverlay.init(null, true);
                previewOverlay.init(d);
                if (e) previewOverlay.create();
            }
        },

        init: function (e, deinit) {
            if (deinit) {
                previewOverlay.reset();
                previewOverlay.state = 0;
                if (!previewOverlay.iFrame) win.removeEventListener("resize", previewOverlay.onWinResize, true);
                if (previewOverlay.DIV) {
                    doc.documentElement.removeChild(previewOverlay.DIV);
                    doc.documentElement.removeChild(previewOverlay.LDR);
                    previewOverlay.BOX = previewOverlay.DIV = previewOverlay.CNT = previewOverlay.VID = previewOverlay.IMG = previewOverlay.CAP = previewOverlay.TRG = previewOverlay.interlacer = null;
                }
                previewOverlay.lastScrollTRG = null;
            } else {
                if (e !== undefined) {
                    if (!e) {
                        previewOverlay.initOnMouseMoveEnd();
                        return;
                    }
                    cfg = e.prefs;
                    if (cfg && !cfg.hz.deactivate && cfg.hz.actTrigger === "0") cfg = null;
                    if (!cfg) {
                        previewOverlay.init(null, true);
                        return;
                    }
                    previewOverlay.freeze = !cfg.hz.deactivate;
                    cfg._freezeTriggerEventKey = cfg.hz.actTrigger.toLowerCase() + "Key";
                    previewOverlay.convertSieveRegexes();
                    var pageLoaded = function () {
                        doc.removeEventListener("DOMContentLoaded", pageLoaded);
                        if (doc.body) doc.body.IMGS_c = true;
                        if (cfg.hz.preload === 3) previewOverlay.preload();
                    };
                    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", pageLoaded);
                    else pageLoaded();
                } else if (!cfg) {
                    previewOverlay.initOnMouseMoveEnd();
                    return;
                }
                updateViewportDimensions();
                Port.listen(previewOverlay.onMessage);
                catchEvent.onkeydown = previewOverlay.key_action;
                catchEvent.onmessage = previewOverlay.winOnMessage;
            }
            e = (deinit ? "remove" : "add") + "EventListener";
            doc[e]("wheel", previewOverlay.scroller, { capture: true, passive: true });
            doc.documentElement[e]("mouseleave", previewOverlay.m_leave, false);
            doc[e]("visibilitychange", previewOverlay.onVisibilityChange, true);
            win[e]("contextmenu", handleContextMenu, true);
            win[e]("mouseover", previewOverlay.handleMouseOver, true);
            win[e]("mousedown", handleMouseDown, true);
            win[e]("mouseup", handleFreezeRelease, true);
            win[e]("dragend", handleFreezeRelease, true);
            try {
                if (!deinit && win.sessionStorage.IMGS_suspend === "1") previewOverlay.toggle(true);
            } catch (ex) {}
            previewOverlay.initOnMouseMoveEnd(!!previewOverlay.capturedMoveEvent);
            if (!win.MutationObserver) {
                previewOverlay.attrObserver = null;
                return;
            }
            previewOverlay.onAttrChange = null;
            if (previewOverlay.mutObserver) {
                previewOverlay.mutObserver.disconnect();
                previewOverlay.mutObserver = null;
            }
            if (deinit) return;
            previewOverlay.mutObserver = new win.MutationObserver(function (muts) {
                var i = muts.length;
                while (i--) {
                    var m = muts[i];
                    var trg = m.target;
                    var attr = m.attributeName;
                    notTRG: if (trg !== previewOverlay.TRG) {
                        if (previewOverlay.TRG) if (trg.contains(previewOverlay.TRG) || previewOverlay.TRG.contains(trg)) break notTRG;
                        previewOverlay.attrObserver(trg, attr === "style", m.oldValue);
                        continue;
                    }
                    if (attr === "title" || attr === "alt") {
                        if (trg[attr] === "") continue;
                    } else if (attr === "style") {
                        var bgImg = trg.style.backgroundImage;
                        if (!bgImg) continue;
                        if (m.oldValue.indexOf(bgImg) !== -1) continue;
                    }
                    previewOverlay.nodeToReset = trg;
                }
            });
            previewOverlay.mutObserverConf = { attributes: true, attributeOldValue: true, attributeFilter: ["href", "src", "style", "alt", "title"] };
        },

        _: function (varName) {
            var value;
            var evName = Math.random().toString(36).slice(2);
            var callback = function (e) {
                this.removeEventListener(e.type, callback);
                value = e.detail;
            };
            win.addEventListener(evName, callback);
            var script = doc.createElement("script");
            script.textContent = "dispatchEvent(new CustomEvent('" + evName + "', {bubbles: false, detail: window['" + varName + "']}))";
            doc.body.appendChild(script).parentNode.removeChild(script);
            return value;
        },

        capturedMoveEvent: null,
        onInitMouseMove: function (e) {
            if (previewOverlay.capturedMoveEvent) {
                previewOverlay.capturedMoveEvent = e;
                return;
            }
            previewOverlay.capturedMoveEvent = e;
            win.top.postMessage({ vdfDpshPtdhhd: "isFrame" }, "*");
            Port.listen(previewOverlay.init);
            Port.send({ cmd: "hello" });
        },

        initOnMouseMoveEnd: function (triggerMouseover) {
            window.removeEventListener("mousemove", previewOverlay.onInitMouseMove, true);
            if (cfg && triggerMouseover && (!previewOverlay.x || previewOverlay.state !== null)) previewOverlay.handleMouseOver(previewOverlay.capturedMoveEvent);
            delete previewOverlay.onInitMouseMove;
            delete previewOverlay.capturedMoveEvent;
            previewOverlay.initOnMouseMoveEnd = function () {};
        },
    };

    win.previewOverlay = previewOverlay;
    win.PVI = previewOverlay;

    window.addEventListener("mousemove", previewOverlay.onInitMouseMove, true);
    catchEvent.onmessage = previewOverlay.winOnMessage;
})(window, document);























