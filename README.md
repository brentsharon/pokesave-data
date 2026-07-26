# pokesave-data

Daily-updated data files for the [pokesave](https://github.com/brentsharon/pokesave) iPhone app. This repo is public so the app can fetch raw files without authentication; it contains only generated pricing data, no app code.

## Files

- `data/sealed-prices.json`: sealed Pokemon TCG products (booster boxes, elite trainer boxes, tins, bundles) with TCGplayer market prices. Rebuilt daily at 21:30 UTC by the GitHub Action from [TCGCSV](https://tcgcsv.com)'s free daily dump of TCGplayer data. Sealed products are identified as TCGplayer products without a collector number; code cards are excluded.
- `data/card-hashes.bin`: a 144-bit perceptual hash of every single's product image (deflateRaw JSON, `{ updatedAt, count, hashes: { productId: hex } }`), for the app's image-based card identification. Maintained incrementally: each product's image is downloaded once from the TCGplayer CDN, and the daily run only fetches images for products new to the index. The hash algorithm lives in `scripts/hash-lib.mjs` and must stay in bit-parity with the app's `CardImageHash.swift`; the app repo's `scripts/verify-matching.sh` checks the parity on real images.

Format:

```json
{
  "updatedAt": "2026-07-25T00:00:00.000Z",
  "count": 12345,
  "products": [
    { "id": 42346, "name": "...", "group": "Base Set", "url": "https://www.tcgplayer.com/product/...", "market": 71.88 }
  ]
}
```

## Credits

Price data originates from TCGplayer via TCGCSV's public mirror. Support TCGCSV if you find this useful.
