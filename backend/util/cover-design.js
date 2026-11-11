// AI-designed post covers: Gemini picks colours, a pattern, an emoji and a tagline; the BROWSER draws
// the image (canvas → PNG) and uploads it like any other post image. No third-party images, no licences.
// Everything Gemini returns is validated here, so only safe, known values reach the browser.

const ai = require('./ai');

const MOTIFS = ['waves', 'dots', 'rays', 'circles', 'grid', 'diagonal', 'confetti', 'mountains'];
const HEX = /^#[0-9a-f]{6}$/i;

// Hand-picked fallbacks, used when Gemini is busy (chosen by the title, so a post always gets the same one)
const PRESETS = [
    { background: ['#1a56c4', '#0b2a66'], accent: '#7ea4f5', text: '#ffffff' },   // WordNest blue
    { background: ['#0f766e', '#064e3b'], accent: '#5eead4', text: '#ffffff' },   // teal
    { background: ['#9a3412', '#431407'], accent: '#fdba74', text: '#ffffff' },   // ember
    { background: ['#6d28d9', '#2e1065'], accent: '#c4b5fd', text: '#ffffff' },   // violet
    { background: ['#fef3c7', '#fde68a'], accent: '#d97706', text: '#1f2937' },   // sunny
    { background: ['#e0f2fe', '#bae6fd'], accent: '#0284c7', text: '#0f172a' },   // sky
];

function hash(text) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
}

// Relative luminance (WCAG) → pick light or dark text that is readable on the background
function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
}

function fallbackDesign(title) {
    const h = hash(title);
    // >>> (unsigned shift): with >> a large hash turns negative and MOTIFS[negative] is undefined
    return { ...PRESETS[h % PRESETS.length], motif: MOTIFS[(h >>> 3) % MOTIFS.length], emoji: '', tagline: '' };
}

// Keep only valid values; anything odd falls back to a safe default.
function clean(raw, title) {
    const base = fallbackDesign(title);
    const bg = Array.isArray(raw && raw.background) ? raw.background.filter(c => HEX.test(c)).slice(0, 2) : [];
    const design = {
        background: bg.length === 2 ? bg : base.background,
        accent: HEX.test(raw && raw.accent) ? raw.accent : base.accent,
        text: HEX.test(raw && raw.text) ? raw.text : base.text,
        motif: MOTIFS.includes(raw && raw.motif) ? raw.motif : base.motif,
        // one emoji-ish grapheme at most (no letters/markup)
        emoji: typeof (raw && raw.emoji) === 'string' && /^\p{Extended_Pictographic}/u.test(raw.emoji.trim())
            ? [...raw.emoji.trim()].slice(0, 2).join('') : '',
        tagline: typeof (raw && raw.tagline) === 'string'
            ? raw.tagline.replace(/<[^>]*>/g, '').replace(/[<>"“”]/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ').slice(0, 48)
            : ''
    };
    // readability guard: if the AI's text colour is hard to read on the gradient, use white or near-black
    const worst = Math.min(...design.background.map(c => contrast(c, design.text)));
    if (worst < 4.5) {
        const white = Math.min(...design.background.map(c => contrast(c, '#ffffff')));
        const dark = Math.min(...design.background.map(c => contrast(c, '#111827')));
        design.text = white >= dark ? '#ffffff' : '#111827';
    }
    return design;
}

// { design, source: 'gemini' | 'preset' }
exports.designFor = async (title, content) => {
    try {
        const raw = await ai.coverDesign(title, content, MOTIFS);
        return { design: clean(raw, title), source: 'gemini' };
    } catch (err) {
        console.log('Cover design from Gemini failed, using a preset:', err.message);
        return { design: fallbackDesign(title), source: 'preset' };
    }
};

exports.MOTIFS = MOTIFS;
exports._clean = clean;   // exported for tests
