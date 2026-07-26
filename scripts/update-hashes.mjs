// Maintains data/card-hashes.bin: a perceptual hash of every single's
// product image, downloaded once per product from the TCGplayer CDN and kept
// incrementally, so the daily run only fetches images for products new to
// the card index. The app matches a rectified camera crop against these to
// identify cards by artwork (see the app's CardImageHash.swift).
//
// Run after build-catalog.mjs (reads data/cards-index.bin for product ids).
// First run backfills everything (~28k downloads); later runs fetch a
// handful. Products whose image fails to download or decode are retried on
// the next run.

import { readFile, writeFile } from "node:fs/promises";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { hashJPEG } from "./hash-lib.mjs";

const INDEX_PATH = "data/cards-index.bin";
const HASHES_PATH = "data/card-hashes.bin";
const CONCURRENCY = 16;

const HEADERS = {
  "User-Agent": "pokesave-data/1.0 (+https://github.com/brentsharon/pokesave-data)",
};

const index = JSON.parse(inflateRawSync(await readFile(INDEX_PATH)).toString());
const wantedIDs = new Set(index.cards.map((card) => card.i));

let existing = {};
try {
  existing = JSON.parse(inflateRawSync(await readFile(HASHES_PATH)).toString()).hashes ?? {};
} catch {
  // First run: no hashes yet.
}

// Keep only hashes for products still in the index, then find the gap.
const hashes = {};
for (const [id, hash] of Object.entries(existing)) {
  if (wantedIDs.has(Number(id))) hashes[id] = hash;
}
const missing = [...wantedIDs].filter((id) => !(id in hashes));
console.log(`${wantedIDs.size} cards, ${Object.keys(hashes).length} hashed, ${missing.length} to fetch`);

let fetched = 0;
let failed = 0;
const queue = [...missing];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      try {
        const res = await fetch(`https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`, {
          headers: HEADERS,
        });
        if (!res.ok) {
          failed += 1;
          continue;
        }
        const hash = hashJPEG(Buffer.from(await res.arrayBuffer()));
        if (hash) {
          hashes[id] = hash;
          fetched += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      if ((fetched + failed) % 1000 === 0) {
        console.log(`  ${fetched + failed}/${missing.length} (${failed} failed)`);
      }
    }
  })
);

const out = {
  updatedAt: new Date().toISOString(),
  count: Object.keys(hashes).length,
  hashes,
};
await writeFile(HASHES_PATH, deflateRawSync(Buffer.from(JSON.stringify(out))));
console.log(`Wrote ${out.count} hashes (${fetched} new, ${failed} failed) to ${HASHES_PATH}`);
