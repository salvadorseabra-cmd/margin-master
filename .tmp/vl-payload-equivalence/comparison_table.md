# Payload Equivalence — Production Pass C vs vl-prompt-compare Experiment

Invoice: `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2`

## A. Payload Equivalence

| Field | Production | Experiment | Same? |
|-------|------------|------------|-------|
| OpenAI API | `POST /v1/chat/completions` | `POST /v1/chat/completions` | **Yes** |
| `responses.create` | Not used (grep: 0 matches) | Not used | **Yes** |
| model | `gpt-4.1` | `gpt-4.1` | **Yes** |
| response_format | `{ type: "json_object" }` | `{ type: "json_object" }` | **Yes** |
| system prompt SHA256 | `42097005…3324f231` | `42097005…3324f231` | **Yes** |
| user text | `Extract all invoice line items from this restaurant invoice table image.` | Same (variant A) | **Yes** |
| messages shape | system + user[text, image_url] | system + user[text, image_url] | **Yes** |
| cropTableRegionForLineItems | Attempted → **throws** | Skipped (`recrop: false`) | **No** |
| image sent to GPT | Full 742×938 PNG (fallback) | Crop 742×230 y=218–448 | **No** |
| imageDataUrl length | 1,531,410 | 334,266 | **No** |
| prior API calls | Pass A + Pass B before Pass C | None (isolated) | **No** |

## B. Image Equivalence

| Metric | Production (bytes to GPT) | Experiment (bytes to GPT) | Same? |
|--------|---------------------------|---------------------------|-------|
| Dimensions | 742 × 938 | 742 × 230 | **No** |
| PNG byte length | 1,148,541 | 250,683 | **No** |
| SHA256 | `95d8f88906e00d5a564a508f0b900b0665da89bd37aadd25ea23ddbedb54b354` | `33ce47a9202294e6a5434538df85be622fdfab1be8481ac80ba5ac74d506bbda` | **No** |

*Note: Production never reaches ImageScript encode of 218–448 crop; crop throws before bounds computed.*

## C. Prompt Equivalence

| Component | Same? |
|-----------|-------|
| TABLE_EXTRACTION_SYSTEM_PROMPT text | **Yes** (byte-identical) |
| User message text (variant A) | **Yes** |
| Model + response_format + API endpoint | **Yes** |

## D. First Divergence Point

**PROVEN** — `detectTableBounds` → `rowMeanLuminance` → `image.getPixelAt(0, y)`

ImageScript `getPixelAt` is **1-based** (`x≥1`, `y≥1`). Production loops use `x=0`. This throws:

`RangeError: Tried referencing a pixel outside of the images boundaries: (x=0)<1`

`extractTableItemsFromImage` catch block leaves `croppedDataUrl =` original full-page `imageDataUrl`. GPT receives **938px full invoice**, not **230px table crop**.

Verified: `deno eval` on `stored_invoice.png` with production `invoice-image-crop.ts`.
