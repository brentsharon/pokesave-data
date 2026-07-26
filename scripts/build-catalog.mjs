// Builds the pokesave data files from TCGCSV's free daily TCGplayer dump
// (https://tcgcsv.com, refreshed around 20:00 UTC):
//
//   data/sealed-prices.json  sealed products (no collector number) with market prices
//   data/cards-index.bin     ALL singles: name, set, collector number, rarity,
//                            per-variant market prices. deflateRaw-compressed JSON
//                            so the app can inflate it with Apple's zlib.
//
// The singles index exists because pokemontcg.io regularly returns 500s; search
// and scanning in the app run against this file instead, with images and buy
// links derived from the TCGplayer product id.

import { mkdir, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";

const CATEGORY = 3; // Pokemon
const BASE = `https://tcgcsv.com/tcgplayer/${CATEGORY}`;
const CONCURRENCY = 8;

const HEADERS = {
  "User-Agent": "pokesave-data/1.0 (+https://github.com/brentsharon/pokesave-data)",
};

async function getJSON(url, attempt = 1) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return getJSON(url, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

const { results: groups } = await getJSON(`${BASE}/groups`);
const queue = [...groups];
const sealed = [];
const cards = [];

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const group = queue.shift();
      if (!group) break;
      const [productsResponse, pricesResponse] = await Promise.all([
        getJSON(`${BASE}/${group.groupId}/products`),
        getJSON(`${BASE}/${group.groupId}/prices`),
      ]);
      const pricesByProduct = new Map();
      for (const price of pricesResponse.results) {
        const existing = pricesByProduct.get(price.productId) ?? [];
        existing.push(price);
        pricesByProduct.set(price.productId, existing);
      }
      for (const product of productsResponse.results) {
        const extended = product.extendedData ?? [];
        const number = extended.find((d) => d.name === "Number")?.value;
        const prices = pricesByProduct.get(product.productId) ?? [];
        if (number) {
          const variantPrices = {};
          for (const price of prices) {
            const value = price.marketPrice ?? price.midPrice;
            if (value != null && price.subTypeName) variantPrices[price.subTypeName] = value;
          }
          cards.push({
            i: product.productId,
            n: product.name,
            g: group.name,
            a: group.abbreviation ?? null,
            c: number,
            r: extended.find((d) => d.name === "Rarity")?.value ?? null,
            p: Object.keys(variantPrices).length ? variantPrices : null,
          });
        } else {
          if (/^code card/i.test(product.name)) continue;
          const best =
            prices.find((p) => p.subTypeName === "Normal") ?? prices[0];
          sealed.push({
            id: product.productId,
            name: product.name,
            group: group.name,
            url: product.url ?? null,
            market: best?.marketPrice ?? best?.midPrice ?? null,
          });
        }
      }
    }
  }),
);

sealed.sort((a, b) => a.name.localeCompare(b.name));
cards.sort((a, b) => a.i - b.i);
const now = new Date().toISOString();

await mkdir("data", { recursive: true });
await writeFile(
  "data/sealed-prices.json",
  JSON.stringify({ updatedAt: now, count: sealed.length, products: sealed }),
);
await writeFile(
  "data/cards-index.bin",
  deflateRawSync(JSON.stringify({ updatedAt: now, count: cards.length, cards })),
);
console.log(`groups=${groups.length} sealed=${sealed.length} cards=${cards.length}`);
