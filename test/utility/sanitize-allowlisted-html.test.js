const {
    sanitizeAllowlistedHtml,
    PRESET_SR_APPROVAL_PENDING_HTML
} = require('../../utility/sanitize-allowlisted-html');

describe('sanitizeAllowlistedHtml', () => {
    it('returns empty string for null, undefined, or non-string', () => {
        expect(sanitizeAllowlistedHtml(null, { allowedTags: [], allowedAttributes: {} })).toBe('');
        expect(sanitizeAllowlistedHtml(undefined, { allowedTags: [], allowedAttributes: {} })).toBe('');
        expect(sanitizeAllowlistedHtml(123, { allowedTags: [], allowedAttributes: {} })).toBe('');
    });

    it('throws when options is missing or not an object', () => {
        expect(() => sanitizeAllowlistedHtml('<p>x</p>')).toThrow(TypeError);
        expect(() => sanitizeAllowlistedHtml('<p>x</p>', null)).toThrow(TypeError);
    });

    it('applies caller-supplied allowlist', () => {
        const out = sanitizeAllowlistedHtml('<p>ok</p><script>no</script>', {
            allowedTags: ['p'],
            allowedAttributes: {}
        });
        expect(out).toContain('<p>');
        expect(out).not.toMatch(/script/i);
    });
});

describe('PRESET_SR_APPROVAL_PENDING_HTML via sanitizeAllowlistedHtml', () => {
    const sanitize = (html) => sanitizeAllowlistedHtml(html, PRESET_SR_APPROVAL_PENDING_HTML);

    it('preserves https anchor text', () => {
        const html = 'See <a href="https://docs.example.com/doc">the document</a> for details.';
        const out = sanitize(html);
        expect(out).toContain('https://docs.example.com/doc');
        expect(out).toContain('the document');
        expect(out).toMatch(/<a\s[^>]*href="https:\/\/docs\.example\.com\/doc"/);
    });

    it('omits href when anchor has no href to avoid href="undefined"', () => {
        const out = sanitize('<a>plain text</a>');
        expect(out).not.toMatch(/href="undefined"/);
        expect(out).not.toMatch(/\bhref=/);
        expect(out).toContain('plain text');
        expect(out).toMatch(/rel="noopener noreferrer"/);
    });

    it('omits href when href is only whitespace', () => {
        const out = sanitize('<a href="   ">label</a>');
        expect(out).not.toMatch(/href="undefined"/);
        expect(out).not.toMatch(/\bhref=/);
        expect(out).toContain('label');
    });

    it('preserves http anchor for legacy links', () => {
        const html = '<a href="http://example.com/x">link</a>';
        const out = sanitize(html);
        expect(out).toContain('http://example.com/x');
    });

    it('preserves mailto links', () => {
        const html = 'Email <a href="mailto:help@nih.gov">help</a>.';
        const out = sanitize(html);
        expect(out).toContain('mailto:help@nih.gov');
    });

    it('strips script tags and content', () => {
        const html = 'Hi <script>alert(1)</script><a href="https://safe.com">ok</a>';
        const out = sanitize(html);
        expect(out).not.toMatch(/script/i);
        expect(out).toContain('safe.com');
    });

    it('strips event handler attributes', () => {
        const html = '<a href="https://x.com" onclick="alert(1)">x</a>';
        const out = sanitize(html);
        expect(out).not.toMatch(/onclick/i);
        expect(out).toContain('https://x.com');
    });

    it('removes javascript: URLs', () => {
        const html = '<a href="javascript:alert(1)">bad</a> and <a href="https://good.com">good</a>';
        const out = sanitize(html);
        expect(out).not.toMatch(/javascript:/i);
        expect(out).toContain('https://good.com');
    });

    it('removes unexpected tags like iframe', () => {
        const html = '<iframe src="https://evil.com"></iframe><p>text</p>';
        const out = sanitize(html);
        expect(out).not.toMatch(/iframe/i);
        expect(out).toContain('text');
    });

    it('allows basic formatting tags', () => {
        const html = '<p>One</p><br><strong>B</strong><em>e</em>';
        const out = sanitize(html);
        expect(out).toContain('<p>');
        expect(out).toContain('<strong>');
        expect(out).toContain('<em>');
    });
});
