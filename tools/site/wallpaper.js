import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';

const assets = path.resolve(import.meta.dirname, '../../website/src/assets');
const SIZE = 64, COLS = 7, ROWS = 14, WIDTH = COLS * SIZE, HEIGHT = ROWS * SIZE / 2;
const sprites = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(n => sharp(path.join(assets, `artist/ball-${n}-inactive.png`)).ensureAlpha().raw().toBuffer()));

let seed = 20261120;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const grid = Array.from({length: ROWS}, () => Array(COLS).fill(-1));
const at = (row, col) => grid[(row + ROWS) % ROWS][(col + COLS) % COLS];
for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
  const side = row % 2 ? col + 1 : col - 1;
  const near = new Set([at(row, col - 1), at(row, col + 1), at(row - 1, col), at(row - 1, side), at(row + 1, col), at(row + 1, side)]);
  const free = [0, 1, 2, 3, 4, 5, 6].filter(ball => !near.has(ball));
  grid[row][col] = free[Math.floor(random() * free.length)];
}
assert.equal(new Set(grid.flat()).size, 7);

const tile = Buffer.alloc(WIDTH * HEIGHT * 4);
for (const parity of [1, 0]) for (let row = parity; row < ROWS; row += 2) for (let col = 0; col < COLS; col++) {
  const sprite = sprites[grid[row][col]], left = col * SIZE + parity * SIZE / 2, top = row * SIZE / 2;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const from = (y * SIZE + x) * 4, alpha = sprite[from + 3] / 255;
    if (!alpha) continue;
    const to = (((top + y) % HEIGHT) * WIDTH + (left + x) % WIDTH) * 4, under = tile[to + 3] / 255, out = alpha + under * (1 - alpha);
    for (let c = 0; c < 3; c++) tile[to + c] = Math.round((sprite[from + c] * alpha + tile[to + c] * under * (1 - alpha)) / out);
    tile[to + 3] = Math.round(out * 255);
  }
}
const file = path.join(assets, 'wallpaper-balls.png');
await sharp(tile, {raw: {width: WIDTH, height: HEIGHT, channels: 4}}).png({palette: true, compressionLevel: 9}).toFile(file);
console.log(`${file}: ${WIDTH}x${HEIGHT}`);
