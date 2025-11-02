// src/utils/SecurityUtils.js

// Create a helper element once for sanitization
const sanitizer = document.createElement('a');

/**
 * Safely sanitizes a string by stripping all HTML tags.
 * @param {string} caption - The potentially unsafe string.
 * @returns {string} The sanitized, plain-text string.
 */
export function sanitizeHTML(caption) {
    if (!caption || typeof caption !== "string") {
        return "";
    }
    
    // Use browser's built-in parser to strip HTML
    sanitizer.innerHTML = caption.replace(/<[^>]+>/g, "").replace(/</g, "&lt;");
    const sanitized = sanitizer.textContent.trim().replace(/[\n\r]+/g, " ");
    sanitizer.textContent = ""; // Clear memory
    
    return sanitized;
}