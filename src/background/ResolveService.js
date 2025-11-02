// src/background/ResolveService.js
"use strict";

import { withBaseURI } from '../utils/UrlUtils.js';

export class ResolveService {
    #configService;
    #manifest;

    constructor(configService, manifest) {
        this.#configService = configService;
        this.#manifest = manifest;
    }

    /**
     * Handles the "resolve" message from the content script.
     * Fetches the URL and parses the response.
     * @param {object} msg - The incoming message.
     * @param {Function} sendResponse - The function to send a reply.
     */
    async handleResolve(msg, sendResponse) {
        const data = {
            cmd: "resolved",
            id: msg.id,
            m: null,
            params: msg.params,
        };
        const rule = this.#configService.getSieve()[data.params.rule.id];

        if (data.params.rule.req_res) {
            data.params.rule.req_res = this.#configService.getSieveRes(data.params.rule.id);
        }
        if (data.params.rule.skip_resolve) {
            data.params.url = [""];
            sendResponse(data);
            return;
        }

        const urlParts = /([^\s]+)(?: +:(.+)?)?/.exec(msg.url);
        msg.url = urlParts[1];
        const postData = urlParts[2] || null;

        if (rule.res === 1) { // Dynamic function rule
            data.m = true;
            data.params._ = "";
            data.params.url = [urlParts[1], postData];
        }

        try {
            const response = await fetch(msg.url, {
                method: postData ? "POST" : "GET",
                body: postData,
                headers: postData ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
            });

            const contentType = response.headers.get("Content-Type");
            if (/^(image|video|audio)\//i.test(contentType)) {
                data.m = msg.url;
                data.noloop = true;
                console.warn(`${this.#manifest.name}: rule ${data.params.rule.id} matched against an image file`);
                sendResponse(data);
                return;
            }

            const body = await response.text();
            let base = body.slice(0, 4096);
            const baseHrefMatch = /<base\s+href\s*=\s*("[^"]+"|'[^']+')/.exec(base);
            base = baseHrefMatch
                ? withBaseURI(msg.url, baseHrefMatch[1].slice(1, -1).replace(/&amp;/g, "&"), true)
                : msg.url;

            if (rule.res === 1) { // Dynamic function (now we have the body)
                data.params._ = body;
                data.params.base = base.replace(/(\/)[^\/]*(?:[?#].*)*$/, "$1");
                sendResponse(data);
                return;
            }

            let patterns = this.#configService.getSieveRes(data.params.rule.id);
            patterns = Array.isArray(patterns) ? patterns : [patterns];
            
            // Interpolate $1, $2, etc. into the regex
            patterns = patterns.map((pattern) => {
                const source = pattern.source || pattern;
                if (!source.includes("$")) return pattern;
                
                let group = data.params.length;
                group = Array.from({ length: group }, (_, i) => i).join("|");
                group = new RegExp("([^\\\\]?)\\$(" + group + ")", "g");

                const newSource = group.test(source)
                    ? source.replace(group, (match, pre, idx) => {
                        return idx < data.params.length && pre !== "\\"
                            ? pre + (data.params[idx] ? data.params[idx].replace(/[/\\^$-.+*?|(){}[\]]/g, "\\$&") : "")
                            : match;
                    })
                    : source;
                
                return (typeof pattern === "string") ? newSource : new RegExp(newSource, pattern.flags);
            });

            let match = patterns[0].exec(body);
            if (match) {
                const loopParam = data.params.rule.loop_param;
                if (rule.dc && (("link" === loopParam && rule.dc !== 2) || ("img" === loopParam && rule.dc > 1))) {
                    match[1] = decodeURIComponent(decodeURIComponent(match[1]));
                }
                data.m = withBaseURI(base, match[1].replace(/&amp;/g, "&"));
                
                if ((match[2] && (match = match.slice(1))) || (patterns[1] && (match = patterns[1].exec(body)))) {
                    data.m = [data.m, match.filter((val, idx) => idx && val).join(" - ")];
                }
            } else {
                console.info(`${this.#manifest.name}: no match for ${data.params.rule.id}`);
            }
            sendResponse(data);

        } catch (error) {
            console.error(`ResolveService error for rule ${data.params.rule.id}:`, error);
            sendResponse(data); // Send back data with m: null
        }
    }
}