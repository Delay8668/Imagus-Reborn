// src/core/Settings.js
export class Settings {
    #config;

    constructor(config) {
        this.#config = config;
        this.#convertSieveRegexes();
    }

    /**
     * Updates the configuration.
     * @param {object} newConfig
     */
    update(newConfig) {
        this.#config = newConfig;
        this.#convertSieveRegexes();
    }

    /**
     * Gets a configuration value using a dot-notation key.
     * @param {string} key - e.g., "hz.delay"
     * @returns {*} The configuration value.
     */
    get(key) {
        return key.split('.').reduce((o, i) => (o ? o[i] : undefined), this.#config);
    }

    /**
     * Gets the entire configuration object.
     * @returns {object}
     */
    get all() {
        return this.#config;
    }

    /**
     * Converts Sieve rule strings into RegExp objects upon initialization.
     */
    #convertSieveRegexes() {
        const s = this.#config.sieve;
        if (!Array.isArray(s) || !s.length || typeof (s[0].link || s[0].img) !== 'string') return;
        
        let i = s.length;
        while (i--) {
            if (s[i].link) s[i].link = new RegExp(s[i].link, s[i].ci && s[i].ci & 1 ? "i" : "");
            if (s[i].img) s[i].img = new RegExp(s[i].img, s[i].ci && s[i].ci & 2 ? "i" : "");
        }
    }
}