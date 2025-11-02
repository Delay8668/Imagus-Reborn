// src/utils/KeyUtils.js
"use strict";

export const shortcut = {
    keys1: {
        8: "BS", 27: "Esc", 45: "Ins", 46: "Del", 96: "0", 97: "1", 98: "2",
        99: "3", 100: "4", 101: "5", 102: "6", 103: "7", 104: "8", 105: "9",
        106: "*", 107: "+", 109: "-", 110: ".", 111: "/", 173: "-", 186: ";",
        187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[",
        220: "\\", 221: "]", 222: "'", 112: "F1", 113: "F2", 114: "F3",
        115: "F4", 116: "F5", 117: "F6", 118: "F7", 119: "F8", 120: "F9",
        121: "F10", 122: "F11", 123: "F12",
    },
    keys2: {
        9: "Tab", 13: "Enter", 16: "shift", 17: "ctrl", 18: "alt", 32: "Space",
        33: "PgUp", 34: "PgDn", 35: "End", 36: "Home", 37: "Left", 38: "Up",
        39: "Right", 40: "Down",
    },
    isModifier: function (e) {
        return e.which > 15 && e.which < 19;
    },
    key: function (e, simple) {
        if (e.button !== undefined && [1, 3, 4].includes(e.button)) {
            return "M" + e.button;
        }
        if (simple && e.which < 47 && !this.keys1[e.which]) return;
        return this.keys1[e.which] || (!simple && this.keys2[e.which]) || String.fromCharCode(e.which).toUpperCase();
    },
};