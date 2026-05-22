const sanitizeHtml = require('sanitize-html');

/**
 * Sanitize an HTML fragment using explicit sanitize-html options (tag/attribute/scheme allowlists).
 * Use shared presets (e.g. {@link PRESET_SR_APPROVAL_PENDING_HTML}) or pass a custom options object.
 *
 * @param {unknown} input - raw HTML string
 * @param {import('sanitize-html').IOptions} options - sanitize-html configuration (required)
 * @returns {string} empty string when input is null, undefined, or not a string
 */
function sanitizeAllowlistedHtml(input, options) {
    if (input == null || typeof input !== 'string') {
        return '';
    }
    if (options == null || typeof options !== 'object') {
        throw new TypeError('sanitizeAllowlistedHtml requires an options object');
    }
    return sanitizeHtml(input, options);
}

/**
 * Preset: SR pending-condition snippets (Handlebars triple-stash / DB+YAML copy).
 * Links and basic block/inline formatting only.
 */
const PRESET_SR_APPROVAL_PENDING_HTML = {
    allowedTags: ['a', 'br', 'p', 'span', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li'],
    allowedAttributes: {
        a: ['href', 'rel']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
        a: ['http', 'https', 'mailto']
    },
    allowProtocolRelative: false,
    transformTags: {
        a: (tagName, attribs) => {
            const nextAttribs = {
                rel: attribs.rel || 'noopener noreferrer'
            };
            const href = attribs.href;
            if (href != null && String(href).trim() !== '') {
                nextAttribs.href = href;
            }
            return { tagName, attribs: nextAttribs };
        }
    }
};

module.exports = {
    sanitizeAllowlistedHtml,
    PRESET_SR_APPROVAL_PENDING_HTML
};
