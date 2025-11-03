"use strict";

(function (win, doc) {
    if (!doc || doc instanceof win.HTMLDocument === false) return;

    const imgDoc = doc.images && doc.images.length === 1 && doc.images[0];
    if (imgDoc && imgDoc.parentNode === doc.body && imgDoc.src === win.location.href) return;

    if (win.__imagusContext) return;

    const state = {
        mouseDownStarted: null,
        viewportWidth: undefined,
        viewportHeight: undefined,
        topViewportWidth: undefined,
        topViewportHeight: undefined,
    };

    const helpers = {
        toggleFlipTransform(el, orientation) {
            if (!el.scale) el.scale = { h: 1, v: 1 };
            el.scale[orientation ? "h" : "v"] *= -1;
            let transform = el.scale.h !== 1 || el.scale.v !== 1 ? "scale(" + el.scale.h + "," + el.scale.v + ")" : "";
            if (el.curdeg) transform += " rotate(" + el.curdeg + "deg)";
            el.style.transform = transform;
        },

        preventEvent(event, preventDefault = true, stopPropagation = true) {
            if (!event || !event.preventDefault || !event.stopPropagation) return;
            if (preventDefault) event.preventDefault();
            if (stopPropagation !== false) event.stopImmediatePropagation();
        },

        openImageInHosts(request) {
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
        },

        extractBackgroundImageUrls(value) {
            if (!value) return null;
            const matches = value.match(/\burl\(([^'"\)][^\)]*|"[^"\\]+(?:\\.[^"\\]*)*|'[^'\\]+(?:\\.[^'\\]*)*)(?=['"]?\))/g);
            if (!Array.isArray(matches)) return null;
            let index = matches.length;
            while (index--) {
                matches[index] = matches[index].slice(/'|"/.test(matches[index][4]) ? 5 : 4);
            }
            return matches;
        },

        extractMediaSource(node) {
            const nodeName = node.nodeName.toUpperCase();
            if (nodeName === "IMG" || node.type === "image" || nodeName === "EMBED") return node.src;
            if (nodeName === "CANVAS") return node.toDataURL();
            if (nodeName === "OBJECT" && node.data) return node.data;
            if (nodeName === "AREA") {
                const image = doc.querySelector('img[usemap="#' + node.parentNode.name + '"]');
                return image?.src || null;
            }
            if (nodeName === "VIDEO") {
                const canvas = doc.createElement("canvas");
                canvas.width = node.clientWidth;
                canvas.height = node.clientHeight;
                canvas.getContext("2d").drawImage(node, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL("image/jpeg");
            }
            if (node.poster) return node.poster;
            return null;
        },

        updateViewportDimensions(targetDoc) {
            let root = targetDoc || doc;
            root = (root.compatMode === "BackCompat" && root.body) || root.documentElement;
            const width = root.clientWidth;
            const height = root.clientHeight;

            if (targetDoc) return { width, height };
            if (width === state.viewportWidth && height === state.viewportHeight) return;

            state.viewportWidth = width;
            state.viewportHeight = height;
            state.topViewportWidth = width;
            state.topViewportHeight = height;
        },
    };

    const constants = {
        hashFragmentRegex: /#(?![?!].).*/,
        svgExtensionRegex: /\.svgz?$/i,
    };

    win.__imagusContext = { win, doc, helpers, state, constants };
})(window, document);
