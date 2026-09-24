// Generates frontend/public/icon-180.png (Apple touch icon) with no deps.
// A dark rounded-ish square with a cream sheet and an orange note glyph.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 180;
const buf = new Uint8Array(S * S * 3);
const set = (x, y, r, g, b) => { const i = (y * S + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; };
const INK = [23, 21, 15];
const PAPER = [244, 239, 228];
const ACCENT = [214, 93, 59];

// Background (dark).
for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) set(x, y, INK[0], INK[1], INK[2]);
// Cream sheet.
for (let y = 34; y < 146; y += 1) for (let x = 50; x < 130; x += 1) set(x, y, PAPER[0], PAPER[1], PAPER[2]);
// Note stem.
for (let y = 44; y < 118; y += 1) for (let x = 96; x < 103; x += 1) set(x, y, ACCENT[0], ACCENT[1], ACCENT[2]);
// Note head (filled disc).
const cx = 84; const cy = 118; const rr = 18;
for (let y = -rr; y <= rr; y += 1) for (let x = -rr; x <= rr; x += 1) {
  if (x * x + y * y <= rr * rr) set(cx + x, cy + y, ACCENT[0], ACCENT[1], ACCENT[2]);
}
// Flag.
for (let y = 44; y < 70; y += 1) { const w = Math.max(0, 18 - (y - 44)); for (let x = 103; x < 103 + w; x += 1) set(x, y, ACCENT[0], ACCENT[1], ACCENT[2]); }

// PNG encode (truecolor).
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
function crc32(b) { let c = ~0; for (let i = 0; i < b.length; i += 1) { c ^= b[i]; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c; }
const raw = Buffer.alloc((S * 3 + 1) * S);
for (let y = 0; y < S; y += 1) { raw[y * (S * 3 + 1)] = 0; Buffer.from(buf.subarray(y * S * 3, (y + 1) * S * 3)).copy(raw, y * (S * 3 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'icon-180.png');
writeFileSync(out, png);
console.log('wrote', out);
