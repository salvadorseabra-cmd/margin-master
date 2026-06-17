# Live Invoke Result — extract-invoice

**Date:** 2026-06-15  
**Method:** `POST /functions/v1/extract-invoice` with storage PNG (1,578,582-byte data URL)

## HTTP response (200, ~34s)

```json
{
  "supplier": "Mais Lenhas & Carvão, Unipessoal, Lda.",
  "invoice_date": "2026-05-23",
  "total": 75,
  "items": []
}
```

## Invoice DB state

- `total`: 0 (header not updated — client aborted before persist)
- `file_url`: `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781560191470-Screenshot_2026-06-07_at_21.04.49.png`

## Not in HTTP response

- Raw GPT Pass D JSON
- `tableCrop` / internal geometry (not exposed to client)
