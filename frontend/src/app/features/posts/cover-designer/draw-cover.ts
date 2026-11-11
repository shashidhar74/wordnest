import { CoverDesign } from '../../../core/models';

/** Social-card size: good for a blog header and for link previews. */
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 630;

const PAD = 80;
const TEXT_FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

/**
 * Draws a post cover from an AI design: gradient background, a pattern in the accent colour,
 * the emoji, the title (wrapped and auto-sized) and the tagline. Returns a PNG Blob.
 * `seed` varies the pattern ("Try another" gives a different arrangement of the same design).
 */
export async function drawCover(design: CoverDesign, title: string, seed: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser');

  // 1. background gradient (top-left → bottom-right)
  const bg = ctx.createLinearGradient(0, 0, COVER_WIDTH, COVER_HEIGHT);
  bg.addColorStop(0, design.background[0]);
  bg.addColorStop(1, design.background[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  // 2. pattern, kept subtle so the title stays readable
  const rand = mulberry32(hash(title) + seed * 7919);
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = design.accent;
  ctx.fillStyle = design.accent;
  drawMotif(ctx, design.motif, rand);
  ctx.restore();

  // 3. a soft shade behind the text area for extra contrast
  const shade = ctx.createLinearGradient(0, 0, COVER_WIDTH * 0.75, 0);
  shade.addColorStop(0, hexToRgba(design.background[0], 0.55));
  shade.addColorStop(1, hexToRgba(design.background[0], 0));
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  // 4. emoji (top right)
  if (design.emoji) {
    ctx.font = `150px ${EMOJI_FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(design.emoji, COVER_WIDTH - PAD + 10, PAD - 20);
  }

  // 5. title: biggest size (64 → 40px) that fits in at most 3 lines
  const maxWidth = COVER_WIDTH - PAD * 2 - (design.emoji ? 140 : 0);
  let size = 64;
  let lines: string[] = [];
  for (; size >= 40; size -= 4) {
    ctx.font = `800 ${size}px ${TEXT_FONT}`;
    lines = wrap(ctx, title, maxWidth);
    if (lines.length <= 3) break;
  }
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
    lines[2] = lines[2].replace(/\s*\S*$/, '') + '…';
  }
  const lineHeight = size * 1.15;
  const taglineSize = 30;
  const blockHeight = lines.length * lineHeight + (design.tagline ? taglineSize * 1.8 : 0);
  let y = (COVER_HEIGHT - blockHeight) / 2 + 10;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = design.text;
  ctx.font = `800 ${size}px ${TEXT_FONT}`;
  for (const line of lines) {
    ctx.fillText(line, PAD, y);
    y += lineHeight;
  }

  // 6. tagline
  if (design.tagline) {
    ctx.globalAlpha = 0.85;
    ctx.font = `500 ${taglineSize}px ${TEXT_FONT}`;
    ctx.fillText(design.tagline, PAD, y + taglineSize * 0.5);
    ctx.globalAlpha = 1;
  }

  // 7. brand (bottom left)
  ctx.font = `700 24px ${TEXT_FONT}`;
  ctx.globalAlpha = 0.7;
  ctx.fillText('WordNest', PAD, COVER_HEIGHT - PAD + 20);
  ctx.globalAlpha = 1;

  // PNG keeps flat colours crisp; if it's over the 2 MB post-image limit, fall back to a JPEG
  const png = await toBlob(canvas, 'image/png');
  return png.size <= 1.9 * 1024 * 1024 ? png : toBlob(canvas, 'image/jpeg', 0.9);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))),
      type,
      quality,
    ),
  );
}

function drawMotif(
  ctx: CanvasRenderingContext2D,
  motif: CoverDesign['motif'],
  rand: () => number,
): void {
  const W = COVER_WIDTH;
  const H = COVER_HEIGHT;
  ctx.lineWidth = 3;
  switch (motif) {
    case 'waves':
      for (let i = 0; i < 9; i++) {
        const baseY = H * 0.15 + i * 60;
        const amp = 18 + rand() * 22;
        const phase = rand() * Math.PI * 2;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const yy = baseY + Math.sin(x / 90 + phase) * amp;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      break;
    case 'dots':
      for (let x = 30; x < W; x += 48) {
        for (let yy = 30; yy < H; yy += 48) {
          ctx.beginPath();
          ctx.arc(x, yy, 3 + rand() * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'rays': {
      const cx = W * (0.75 + rand() * 0.2);
      const cy = H * (0.75 + rand() * 0.3);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * W * 1.5, cy + Math.sin(a) * W * 1.5);
        ctx.stroke();
      }
      break;
    }
    case 'circles':
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(W * (0.55 + rand() * 0.45), H * rand(), 60 + rand() * 220, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'grid':
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= W; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let yy = 0; yy <= H; yy += 60) {
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(W, yy);
        ctx.stroke();
      }
      break;
    case 'diagonal':
      ctx.lineWidth = 14;
      for (let x = -H; x < W; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H, 0);
        ctx.stroke();
      }
      break;
    case 'confetti':
      for (let i = 0; i < 90; i++) {
        ctx.save();
        ctx.translate(rand() * W, rand() * H);
        ctx.rotate(rand() * Math.PI);
        ctx.fillRect(-7, -3, 14, 6);
        ctx.restore();
      }
      break;
    case 'mountains':
      for (let layer = 0; layer < 3; layer++) {
        const base = H * (0.62 + layer * 0.12);
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 120) ctx.lineTo(x, base - rand() * (140 - layer * 30));
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      }
      break;
  }
}

/** Splits text into lines that fit maxWidth (long words are kept whole). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

/** Small seeded random generator: the same seed gives the same pattern. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
