// Regenerates frontend/public/sample-score.png with no third-party deps.
// Draws two grand-staff systems with barlines and note heads so the in-browser
// projection detector finds staves and measure divisions. Node >= 18.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WIDTH = 1200;
const HEIGHT = 1600;
const buffer = new Uint8Array(WIDTH * HEIGHT * 3).fill(255); // white RGB

const setPixel = (x, y, v = 0) => {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  buffer[i] = buffer[i + 1] = buffer[i + 2] = v;
};
const hLine = (x0, x1, y, thickness = 2) => {
  for (let t = 0; t < thickness; t += 1) for (let x = x0; x <= x1; x += 1) setPixel(x, y + t);
};
const vLine = (x, y0, y1, thickness = 3) => {
  for (let t = 0; t < thickness; t += 1) for (let y = y0; y <= y1; y += 1) setPixel(x + t, y);
};
const disc = (cx, cy, r) => {
  for (let y = -r; y <= r; y += 1) for (let x = -r; x <= r; x += 1) if (x * x + y * y <= r * r) setPixel(cx + x, cy + y);
};

// Two systems, each a grand staff (two 5-line staves).
for (const systemTop of [300, 900]) {
  const staffTops = [systemTop, systemTop + 105];
  for (const staffTop of staffTops) {
    for (let line = 0; line < 5; line += 1) hLine(70, 1130, staffTop + line * 14, 2);
  }
  const top = systemTop;
  const bottom = systemTop + 161;
  const bars = [70, 335, 600, 865, 1130];
  for (const x of bars) vLine(x, top, bottom, x === 70 || x === 1130 ? 4 : 3);
  for (let m = 0; m < bars.length - 1; m += 1) {
    for (const staffTop of staffTops) {
      for (let note = 0; note < 4; note += 1) {
        const x = bars[m] + 42 + note * 52;
        const y = staffTop + 56 - ((m + note) % 6) * 7;
        disc(x, y, 7);
        vLine(x + 7, y - 45, y, 3);
      }
    }
  }
}

// Minimal PNG encoder (truecolor, no filter).
const chunk = (type, data) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBytes, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}
const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  raw[y * (WIDTH * 3 + 1)] = 0; // filter type 0
  Buffer.from(buffer.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3)).copy(raw, y * (WIDTH * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'sample-score.png');
writeFileSync(out, png);
console.log('wrote', out);
