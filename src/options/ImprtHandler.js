// src/options/ImprtHandler.js
"use strict";

import { $, _, color_trans, processLNG } from './options-utils.js';

/**
 * Creates and manages the Importer UI dialog.
 * @param {string} caption - The title for the importer.
 * @param {Function} data_handler - Callback function to process the imported data.
 * @param {object} hide_opts - Options to hide checkboxes.
 */
export function ImprtHandler(caption, data_handler, hide_opts) {
    const importer = $("importer");
    processLNG([importer]);

    if (importer.data_handler !== data_handler) {
        importer.data_handler = data_handler;
        importer.lastElementChild.value = "";
        importer.firstElementChild.textContent = caption + " - " + _("IMPR_IMPORT");
        let x = importer.querySelectorAll(".op_buttons div > div > input[id]");
        hide_opts = hide_opts || {};
        x[0].parentNode.style.display = hide_opts.clear ? "none" : "";
        x[1].parentNode.style.display = hide_opts.overwrite ? "none" : "";
        x[0].checked = x[1].checked = false;
    }

    const imprt_file = $("imprt_file");
    if (imprt_file.onchange) {
        importer.visible(true);
        return;
    }

    let check_clear = $("impr_chk_clear");
    let check_overwrite = $("impr_chk_overwrite");

    check_clear.onchange = function () {
        check_overwrite.disabled = this.checked;
        if (this.checked) check_overwrite.checked = false;
        check_overwrite.parentNode.lastElementChild.style.color = this.checked ? "silver" : "";
    };

    importer.visible = (show) => {
        importer.style.display = show === true ? "block" : "none";
    };

    importer.querySelector("b").onclick = importer.visible;

    importer.ondata = (data, button) => {
        const options = { clear: check_clear.checked, overwrite: check_overwrite.checked };
        if (importer.data_handler(data, options) === false) color_trans(button, "red");
        else importer.visible(false);
    };

    importer.readfile = (file) => {
        if (file.size > 5242880) color_trans(imprt_file.parentNode, "red");
        else {
            const reader = new FileReader();
            reader.onerror = () => {
                color_trans(imprt_file.parentNode, "red");
            };
            reader.onload = (e) => {
                let data;
                try {
                    data = JSON.parse(e.target.result);
                } catch (ex) {
                    alert(_("INVALIDFORMAT"));
                    return;
                }
                importer.ondata(data, imprt_file.parentNode);
            };
            reader.readAsText(file);
        }
    };

    imprt_file.onchange = function () {
        importer.readfile(this.files[0]);
    };
    imprt_file.ondragover = (e) => e.preventDefault();
    imprt_file.ondragenter = (e) => {
        e.preventDefault();
        if ([].slice.call(e.dataTransfer.types, 0).indexOf("Files") > -1)
            e.currentTarget.parentNode.style.boxShadow = "0 2px 4px green";
    };
    imprt_file.ondragleave = (e) => {
        e.currentTarget.parentNode.style.boxShadow = "";
    };
    imprt_file.ondrop = (e) => {
        e.currentTarget.parentNode.style.boxShadow = "";
        if (e.dataTransfer.files.length) importer.readfile(e.dataTransfer.files[0]);
        e.preventDefault();
    };

    $("imprt_text").onclick = function (e) {
        const tarea = importer.lastElementChild;
        let dataStr = tarea.value.trim();
        if (dataStr) {
            let data;
            try {
                data = JSON.parse(dataStr);
            } catch (ex) {
                color_trans(this, "red");
                return;
            }
            importer.ondata(data, this);
        } else tarea.focus();
    };

    document.addEventListener("mousedown", (e) => {
        if (!e.target.closest("#importer, [data-action]")) importer.visible(false);
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") importer.visible(false);
    });

    importer.visible(true);
}