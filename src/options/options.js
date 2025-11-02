// src/options/options.js
"use strict";

import { Port } from '../infra/PortService.js';
import { shortcut } from '../utils/KeyUtils.js';
import { SieveUI } from './SieveUI.js';
import { ImprtHandler } from './ImprtHandler.js';
import { 
    $, _, processLNG, color_trans, fill_output, 
    color_text_input, color_change, setDefault 
} from './options-utils.js';
import { buildNodes } from '../utils/DOMUtils.js'; // <-- FIX: ADDED IMPORT

let cfg = {}; // Local cache for config
let app = {}; // Local cache for app info
let input_changes = {};

/**
 * * Reads the config from the background script.
 */
async function readCfg() {
    let resp = await Port.send({ cmd: "cfg_get", keys: ["hz", "keys", "tls", "grants", "sieve"] });
    if (resp?.cfg) {
        // cfg = resp.cfg; // <-- OLD
        
        // FIX: Modify object properties instead of reassigning the variable
        // This keeps the reference valid for other modules (like SieveUI).
        Object.keys(cfg).forEach(key => delete cfg[key]);
        Object.assign(cfg, resp.cfg);
    }
}

/**
 * Loads config values into the form fields.
 */
function load() {
    const fields = document.querySelectorAll("input[name*=_], select[name*=_], textarea[name*=_]");
    let i = fields.length;
    let prefs = {};

    while (i--) {
        const fld = fields[i];
        if (fld.disabled || fld.readOnly) continue;
        const pref = fld.name.split("_");

        if (!prefs[pref[0]]) {
     
           try {
                prefs[pref[0]] = (typeof cfg[pref[0]] === 'string') ? JSON.parse(cfg[pref[0]] || "{}") : (cfg[pref[0]] || {});
            } catch (ex) {
         
               prefs[pref[0]] = cfg[pref[0]];
            }
        }

        if (pref[0] === "tls" && pref[1] === "sendToHosts") {
            if (Array.isArray(prefs.tls[pref[1]])) {
  
               let shosts = prefs.tls[pref[1]].map(host => host.join("|"));
                fld.rows = shosts.length || 1;
                fld.value = fld.defValue = shosts.join("\n");
            }
        } else if (pref[0] === "grants") {
      
           let shosts = [];
            const m = prefs.grants;
            if (m && m.length) {
                for (let j = 0; j < m.length; ++j) {
       
                  shosts.push(m[j].op === ";" ? ";" + m[j].txt : m[j].op + (m[j].rules || m[j].opts || "") + ":" + m[j].url);
                }
            }
      
           fld.value = fld.defValue = shosts.join("\n");
        } else if (pref[0] === "keys") {
            const m = pref[1].replace("-", "_");
            if (prefs.keys[m] !== void 0) fld.value = fld.defValue = prefs.keys[m];
        } else if (prefs[pref[0]] && prefs[pref[0]][pref[1]] 
 !== void 0) {
            const fld_type = fld.getAttribute("type") || "text";
            
            if (fld.type === "checkbox") {
                fld.checked = fld.defChecked = !!prefs[pref[0]][pref[1]];
            } else {
  
               fld.value = fld.defValue = prefs[pref[0]][pref[1]];
                if (fld_type === "range") {
                    let m = fld.previousElementSibling;
                    if (m && 
 m.nodeName === "OUTPUT") fill_output(fld);
                    m = m.previousElementSibling;
                    if (m && m.getAttribute("type") === "color") m.style.opacity = fld.value;
                    fld.addEventListener("change", fill_output, false);
                } else if (fld_type === "text" && fld.previousElementSibling && fld.previousElementSibling.getAttribute("type") === "color") {
                   
   fld.addEventListener("input", color_text_input, false);
                    color_text_input(fld);
                    fld.previousElementSibling.addEventListener("change", color_change, false);
                }
            }
        }
    }
}

/**
 * Gathers form data and sends it to the background script to be saved.
 */
async function save() 
 {
    const fields = document.querySelectorAll("input[name*=_], select[name*=_], textarea[name*=_]");
    let prefs = {};
    const rgxNewLine = /[\r\n]+/;
    const rgxGrant = /^(?:(;.+)|([!~]{1,2}):(.+))/;

    if (SieveUI.loaded) prefs.sieve = JSON.stringify(SieveUI.prepareRules());

    for (let i = 0; i < fields.length; ++i) {
        const fld = fields[i];
        if (fld.readOnly) 
 continue;
        const pref = fld.name.split("_");
        if (!prefs[pref[0]]) prefs[pref[0]] = {};

        if (pref[0] === "tls" && pref[1] === "sendToHosts") {
            const shosts = fld.value.trim().split(rgxNewLine);
            prefs.tls[pref[1]] = [];
            for (let host of shosts) {
        
                 const hostParts = host.split("|");
                if (hostParts.length === 2) prefs.tls[pref[1]].push(hostParts);
            }
        } else if (pref[0] === "grants") {
            prefs.grants = [];
            if (fld.value === "") 
 continue;
            const grnts = fld.value.trim().split(rgxNewLine);
            if (!grnts.length) continue;
            for (let grantLine of grnts) {
                const grant = rgxGrant.exec(grantLine.trim());
                if (grant) {
               
         let host = grant[1]
                        ? { op: ";", txt: grant[1].trim().substr(1) }
            
             : { op: grant[2], url: grant[3].trim() };
                    prefs.grants.push(host);
                }
            }
            fld.value = prefs.grants
    
             .map((el) => el.op === ";" ? ";" + el.txt : el.op + (el.rules || el.opts || "") + ":" + el.url)
                .join("\n");
        } 
 else if (pref[0] === "keys") {
            const m = pref[1].replace("-", "_");
            prefs.keys[m] = fld.value;
        } else if (prefs[pref[0]]) {
            const fldType = fld.getAttribute("type");
            if (fldType === "checkbox") {
 
               prefs[pref[0]][pref[1]] = fld.checked;
            } else if (fldType === "range" || fldType === "number" || fld.classList.contains("number")) {
                prefs[pref[0]][pref[1]] = fld.min ?
 Math.max(fld.min, Math.min(fld.max, parseFloat(fld.value))) : parseFloat(fld.value);
                if (isNaN(prefs[pref[0]][pref[1]])) {
                    prefs[pref[0]][pref[1]] = parseFloat(fld.defaultValue);
                }
                fld.value = prefs[pref[0]][pref[1]];
            } 
 else {
                prefs[pref[0]][pref[1]] = fld.value;
            }
        }
    }
    
    await Port.send({ cmd: "savePrefs", prefs: prefs });
    await readCfg(); // 
}

/**
 * Exports preferences as a JSON file.
 * @param {Event} ev
 */
function exportPrefs(ev) {
    let data = {};
    const pref_keys = ["hz", "keys", "tls", "grants"];
    for (const key of pref_keys) {
        if (key in cfg) data[key] 
 = cfg[key];
    }
    
    // Use the SieveUI's download function
    SieveUI.utils.download(
        JSON.stringify(data, null, ev.shiftKey ? 2 : 0), 
        app.name + "-conf.json", 
     
    ev.ctrlKey
    );
}

/**
 * Handles importing preferences.
 * @param {object} data - Parsed JSON data.
 * @param {object} options - Import options (clear, overwrite).
 */
function importPrefs(data, options) {
    if (typeof data !== "object" || JSON.stringify(data) === "{}") return false;
    
    if ((options 
 || {}).clear) {
        Port.send({ cmd: "cfg_del", keys: Object.keys(data) });
    }
    Port.send({ cmd: "savePrefs", prefs: data });
    location.reload(true);
}

/**
 * Handles navigation clicks.
 */
function onHashChange() {
    let args = [];
    const menu = $("nav_menu");
    
    // --- FIX 1: 
    let old = (menu && menu.active && menu.active.hash.slice(1)) || "settings";
    let hash = location.hash.slice(1) || "settings";

    if (hash.indexOf("/") > -1) {
        args = hash.split("/");
        hash = args.shift();
    }
    const section = $(hash + 
 "_sec") || $("settings_sec");
    
    if (section && !section.lng_loaded) {
        if (hash === "sieve") {
            // FIX: Pass readCfg to SieveUI
            SieveUI.load(cfg.sieve, null, cfg, app.name, readCfg);
            $("sieve_search").focus();
        } else if (hash === "grants") {
        
     section.querySelector(".action_buttons").onclick = (e) => {
                if (e.target.dataset.action === "show-details") {
                    $("grants_help").style.display = 
 $("grants_help").style.display === "block" ? "none" : "block";
                }
            };
        } else if (hash === "info") {
            section.querySelector(".action_buttons").onclick = (e) => {
        
         switch (e.target.dataset.action) {
                    case "prefs-import":
                   
      ImprtHandler(_("SC_PREFS"), importPrefs, { overwrite: 1 });
                        break;
                    case "prefs-export":
                        exportPrefs(e);
                        break;
                }
           
   };
            if (args[0]) $(args[0] === "0" ? "app_installed" : "app_updated").style.display = "block";
            section.querySelector("h3:not([data-lng])").textContent = " v" + app.version;
            
            Port.send({ cmd: "getLocaleList" }).then(response => {
                const locales_json = JSON.parse(response);
       
          let locales = [];
                for (let alpha2 in locales_json) {
                 
    if (alpha2 === "_") continue;
                    let td2 = { tag: "td" };
                 
    locales.push({
                        tag: "tr",
                      
   nodes: [
                            {
                   
              tag: "td",
                                attrs: locales_json[alpha2]["%"] ? { 
 title: locales_json[alpha2]["%"] + "%" } : null,
                                text: alpha2 + ", " + locales_json[alpha2].name,
      
                       },
                            
 td2,
                        ],
                    });
      
               if (locales_json[alpha2].translators) {
                        td2.nodes = [];
        
                 locales_json[alpha2].translators.forEach((el, idx) => {
                            el.name = (el.name 
 || el.fullname || "") + (el.fullname && el.name ? " (" + el.fullname + ")" : "") || el.email || el.web;
                            if (idx) td2.nodes.push(", ");
                            td2.nodes.push(el.email || el.web ? { tag: "a", attrs: { href: el.email ? "mailto:" + el.email : el.web }, text: el.name } : el.name);
                        });
                    } 
 else td2.text = "anonymous";
                }
                buildNodes($("locales_table"), locales);
            });
        }
    }

    if (old !== hash && (old = $(old + "_sec"))) old.style.display = "none";
    if (section) {
    
     processLNG([section]);
        section.style.display = "block";
    }
    if (menu.active) menu.active.classList.remove("active");
    if ((menu.active = menu.querySelector('a[href="#' + hash + '"]'))) menu.active.classList.add("active");
}

/**
 * Checks if user scripts are enabled (Firefox).
 */
async function checkUserScripts() {
    if (!chrome.userScripts || typeof chrome.userScripts.getScripts !== "function") {
   
      $("allow_user_scripts_message").style.display = "none";
        $("allow_dev_mode_message").style.display = "none";
        return;
    }

    try {
        const scripts = await chrome.userScripts.getScripts();
        if (scripts?.length > 0) {
            $("allow_dev_mode_message").innerHTML =
   
          $("allow_user_scripts_message").innerHTML = _("APP_READY").replace('"Imagus"', app.name);
            $("allow_dev_mode_message").style.backgroundColor =
            $("allow_user_scripts_message").style.backgroundColor = "#dcfad7";
            return;
        } else {
            Port.send({ cmd: "loadScripts" });
            if ($("allow_dev_mode_message").style.display 
 !== "block") {
                $("allow_user_scripts_message").style.display = "block";
            }
        }
    } catch(e) {
        if (e.message?.includes("API is only available for users in developer mode")) {
            $("allow_dev_mode_message").style.display = "block";
        } else {
            $("allow_user_scripts_message").style.display = "block";
        }
    }
    setTimeout(checkUserScripts, 2000);
}

/**
 * Main initialization on 
 window load.
 */
window.addEventListener("load", async () => {
    let manifest = chrome.runtime.getManifest();
    app.name = manifest.name;
    app.version = manifest.version;

    document.title = `:: ${app.name} ::`;
    $("app_version").textContent = app.name + " v" + app.version;
    
  
   processLNG(document.querySelectorAll('body > *'));

    // Setup range input listeners
    document.querySelectorAll('input[type="color"] + output + input[type="range"]').forEach(el => {
        el.onchange = function () {
            this.parentNode.firstElementChild.style.opacity = this.value;
  
       };
    });
    // Setup textarea auto-row
    document.querySelectorAll('textarea[name="tls_sendToHosts"]').forEach(el => {
        el.oninput = function () {
            this.rows = Math.min((this.value.match(/(?:\n|\r\n?)/g) 
 || []).length + 1, 10);
        };
    });

    // Setup navigation
    $("nav_menu").onclick = (e) => {
        if (e.target.hash) {
          
   e.preventDefault();
            location.hash = e.target.hash;
        }
    };

    // Listen for hash changes to update the view
    window.addEventListener("hashchange", onHashChange, false);

    // Setup form change listener
    const form = document.forms[0];
    form.onchange = (e) => {
        if (e.stopPropagation) e.stopPropagation();
        let defval, t = e.target;
        if (t.form_saved) delete t.form_saved;
        else if (t.parentNode.dataset["form"] 
 || t.parentNode.parentNode.dataset["form"]) defval = "default";
        else if (t.name.indexOf("_") > 0) defval = "def";
        if (!defval) return;

        if ((t.type === "checkbox" && t[defval + "Checked"] !== t.checked) || (t.type !== "checkbox" && t[defval + "Value"] != t.value))
            input_changes[t.name] = true;
 else delete input_changes[t.name];
        $("save_button").style.color = Object.keys(input_changes).length ? "#e03c00" : "";
    };

    // Setup key listeners for shortcut inputs
    function keyHandler(e) {
        if (e.key === "Enter") e.target.form_saved = true;
        
        // --- FIX 2: 'key' is reassigned ---
     
    let key = shortcut.key(e, true);
        if (e.repeat || !e.target.name?.startsWith("keys_") || e.ctrlKey || e.altKey || e.metaKey || !key) return;
        
        e.stopPropagation();
        e.preventDefault();
        color_trans(e.target, null);
        
        const keys = document.body.querySelectorAll('input[name^="keys_"]');
        for (let i = 0; i < keys.length; ++i) {
            
 if (keys[i].value.toUpperCase() === key.toUpperCase() && e.target !== keys[i]) {
                color_trans(e.target, "red");
                color_trans(keys[i], "red");
                return false;
            }
        }
        if (e.code === 'Escape') 
 key = "";
        e.target.value = key;
        form.onchange(e);
    }
    form.addEventListener("keydown", keyHandler, false);
    form.addEventListener("mouseup", keyHandler, false);

    // Setup context menu for form elements
    form.addEventListener("contextmenu", (e) => {
        e.stopPropagation();
        let t = e.target;
 
        if (t.classList.contains("checkbox")) t = t.previousElementSibling;
        if (!t.name || t.name.indexOf("_") === -1) return;

        if (e.ctrlKey) { // Reset to default
           
  e.preventDefault();
            setDefault(t);
            form.onchange({ target: t });
        } else if (e.shiftKey && t.name.indexOf("_") > -1) { // Show default value
  
           e.preventDefault();
            t = t.name.split("_");
            let exp = {};
           
  const defaults = JSON.parse(cfg[t[0]]); // Assumes cfg is loaded
            if (t[1]) {
                exp[t[0]] = {};
         
        exp[t[0]][t[1]] = defaults[t[1]];
            } else exp[t[0]] = defaults;
            alert(JSON.stringify(exp));
        }
    }, 
 false);

    // Setup Reset button
    const reset_button = $("reset_button");
    reset_button.reset = () => {
        delete reset_button.pending;
        reset_button.style.color = "#000";
    };
    reset_button.addEventListener("click", (e) => {
        if (reset_button.pending) {
       
      let color = "green";
            if (e.ctrlKey) {
                e.preventDefault();
            
     let query = ["", "input,", "select,", "textarea"];
                document.querySelectorAll(query.join((location.hash || "#settings") + "_sec ")).forEach(setDefault);
                color = "lime";
 
            }
            clearTimeout(reset_button.pending);
            reset_button.pending = setTimeout(reset_button.reset, 2e3);
            
 reset_button.style.color = color;
            reset_button.nextElementSibling.style.color = "#e03c00";
            input_changes["form_reset"] = true;
            setTimeout(() => {
      
           document.querySelectorAll('output + input[type="range"]').forEach(fill_output);
            }, 15);
            return;
        }
     
    reset_button.style.color = "orange";
        reset_button.pending = setTimeout(reset_button.reset, 2e3);
        e.preventDefault();
    }, false);

    // Setup Save button
    $("save_button").addEventListener("click", (e) => {
        e.preventDefault();
        save().then(() => {
  
           color_trans($("save_button"), "green");
            input_changes = {};
            $("save_button").style.color = "";
        });
   
   }, false);

    // Disable mousedown on action buttons
    document.querySelectorAll(".action_buttons").forEach(el => {
        el.onmousedown = (e) => e.preventDefault();
    });

    // Load config, then load form values
    await readCfg();
    load();
    onHashChange(); // Trigger navigation to the 

    // Setup advanced toggle
    const advanced_prefs = $("tls_advanced");
    advanced_prefs.onchange = function () {
        document.body.classList[this.checked ? "add" : "remove"]("advanced");
    };
    advanced_prefs.onchange();
    document.body.style.display = "block";

    // Setup links for Firefox user scripts
    document.querySelector("#allow_user_scripts_message > a").addEventListener("click", function (event) {
        event.preventDefault();
        chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id + "#:~:text=Allow%20user%20scripts" });
    });
    document.querySelector("#allow_dev_mode_message > a").addEventListener("click", function (event) {
        event.preventDefault();
      
   chrome.tabs.create({ url: "chrome://extensions/#:~:text=Developer%20mode" });
    });
    setTimeout(checkUserScripts, 500);
}, false);

// Ctrl+S to save
document.addEventListener("keydown", (e) => {
    if (e.code === "KeyS" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        $("save_button").click();
  
   }
}, true);