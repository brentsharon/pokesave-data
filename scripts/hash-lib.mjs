// Perceptual hash of a card image, for the app's image-based card
// identification. The EXACT same math is implemented in Swift
// (pokesave/Services/CardImageHash.swift); any change here must change there,
// and scripts/verify-matching.sh in the app repo checks the two stay in
// parity on real images.
//
// Algorithm (difference hash, horizontal + vertical):
//   1. Decode JPEG to RGB.
//   2. Grayscale via ITU-R 601 luma (0.299 R + 0.587 G + 0.114 B).
//   3. Box-average down to a 9x9 grid: cell (i, j) averages pixels
//      x in [floor(i*W/9), floor((i+1)*W/9)), y likewise. Plain averaging,
//      not resampling, so both implementations agree to rounding.
//   4. 144 bits, appended MSB-first into 18 bytes:
//      - horizontal: for row 0..8, col 0..7: g[row][col] > g[row][col+1]
//      - vertical:   for row 0..7, col 0..8: g[row][col] > g[row+1][col]
//
// Scale differences between the source image and a camera crop wash out in
// the box averaging; JPEG decoder differences flip at most a few of the 144
// bits, well inside the matching threshold.

import jpeg from "jpeg-js";

export const HASH_BYTES = 18;
const GRID = 9;

/** 9x9 box-averaged grayscale of an RGBA buffer. */
function grid(data, width, height) {
  const cells = new Float64Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) {
    const y0 = Math.floor((j * height) / GRID);
    const y1 = Math.max(y0 + 1, Math.floor(((j + 1) * height) / GRID));
    for (let i = 0; i < GRID; i++) {
      const x0 = Math.floor((i * width) / GRID);
      const x1 = Math.max(x0 + 1, Math.floor(((i + 1) * width) / GRID));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        let offset = (y * width + x0) * 4;
        for (let x = x0; x < x1; x++) {
          sum += 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
          offset += 4;
        }
      }
      cells[j * GRID + i] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return cells;
}

/** 18-byte difference hash of a decoded RGBA image. */
export function hashPixels(data, width, height) {
  const g = grid(data, width, height);
  const bytes = new Uint8Array(HASH_BYTES);
  let bit = 0;
  const push = (on) => {
    if (on) bytes[bit >> 3] |= 0x80 >> (bit & 7);
    bit += 1;
  };
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID - 1; col++) {
      push(g[row * GRID + col] > g[row * GRID + col + 1]);
    }
  }
  for (let row = 0; row < GRID - 1; row++) {
    for (let col = 0; col < GRID; col++) {
      push(g[row * GRID + col] > g[(row + 1) * GRID + col]);
    }
  }
  return bytes;
}

/** 36-char lowercase hex hash of a JPEG buffer, or null if it cannot decode. */
export function hashJPEG(buffer) {
  let decoded;
  try {
    decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
  } catch {
    return null;
  }
  if (!decoded || decoded.width < GRID || decoded.height < GRID) return null;
  return Buffer.from(hashPixels(decoded.data, decoded.width, decoded.height)).toString("hex");
}
