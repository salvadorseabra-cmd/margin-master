#!/usr/bin/env python3
"""Read-only VL metadata pass experiment — temp script, not committed."""
from __future__ import annotations

import base64
import io
import json
import os
import re
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path("/Users/salvadorseabra1/margin-master")
SRC = ROOT / ".tmp/vl-date-rc/full.png"
OUT = ROOT / ".tmp/vl-metadata-pass"
OUT.mkdir(parents=True, exist_ok=True)

GT = {
    "supplier": "Aviludo",
    "invoice_date": "19/05/2026",
    "invoice_date_iso": "2026-05-19",
    "invoice_number": "FCL-LS626/004845",
    "total": 330.42,
}

METADATA_SYSTEM_PROMPT = """
You extract invoice HEADER METADATA from restaurant invoice images.

Return ONLY valid JSON with this exact structure:

{
  "supplier": string | null,
  "invoice_date": string | null,
  "invoice_number": string | null,
  "total": number | null
}

CRITICAL RULES:

- supplier: legal supplier / issuer name on the document (company name near logo).
- invoice_date: document ISSUE date only (labels: DATA, Data Emissão, Data Documento, Invoice Date).
- Prefer header issue dates over due dates (Vencimento, Due Date).
- IGNORE footer compliance stamps, TALÃO DE CONTROLO dates, certification dates, transport timestamps.
- invoice_number: document number (e.g. DOC. NÚMERO, Invoice No, Fatura Nº).
- total: document amount to pay (VALOR A PAGAR / Total / Amount Due) — numeric only, no currency symbol.
- NEVER invent values. If not visible, return null.
- Return invoice_date exactly as printed (DD/MM/YYYY preferred) or YYYY-MM-DD.
""".strip()


def load_openai_key() -> str:
    for env_file in (ROOT / ".env.local", ROOT / ".env"):
        if not env_file.exists():
            continue
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == "OPENAI_API_KEY":
                return v.strip().strip('"').strip("'")
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    raise RuntimeError("OPENAI_API_KEY not found in .env.local, .env, or environment")


def crop_top_portion(img: Image.Image, top_fraction: float = 0.83) -> Image.Image:
    h = img.height
    crop_h = max(1, round(h * top_fraction))
    return img.crop((0, 0, img.width, crop_h))


def to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def call_openai_metadata(api_key: str, data_url: str) -> dict:
    body = {
        "model": "gpt-4.1",
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": METADATA_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract supplier, invoice issue date, invoice number, and total "
                            "from this invoice image. Ignore footer compliance dates."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode())
    content = result["choices"][0]["message"]["content"]
    return json.loads(content)


def norm_supplier(s: str | None) -> str | None:
    if not s:
        return None
    return re.sub(r"\s+", " ", s.strip())


def supplier_match(got: str | None) -> bool:
    if not got:
        return False
    g = norm_supplier(got).lower()
    return "aviludo" in g or "avijudo" in g


def norm_date(s: str | None) -> set[str]:
    if not s:
        return set()
    s = s.strip()
    out = {s}
    m = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        d, mo, y = m.groups()
        out.add(f"{int(d):02d}/{int(mo):02d}/{y}")
        out.add(f"{y}-{int(mo):02d}-{int(d):02d}")
    m2 = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m2:
        y, mo, d = m2.groups()
        out.add(f"{int(d):02d}/{int(mo):02d}/{y}")
        out.add(f"{y}-{mo}-{d}")
    return out


def date_match(got: str | None) -> bool:
    if not got:
        return False
    got_set = norm_date(got)
    gt_set = {GT["invoice_date"], GT["invoice_date_iso"]}
    return bool(got_set & gt_set)


def number_match(got: str | None) -> bool:
    if not got:
        return False
    g = re.sub(r"\s+", "", got.upper())
    t = re.sub(r"\s+", "", GT["invoice_number"].upper())
    return g == t or t in g or g in t


def total_match(got) -> bool:
    if got is None:
        return False
    try:
        return abs(float(got) - GT["total"]) < 0.011
    except (TypeError, ValueError):
        return False


def main() -> None:
    api_key = load_openai_key()
    img = Image.open(SRC).convert("RGB")
    cropped = crop_top_portion(img, 0.83)
    crop_path = OUT / "pass_a_83pct_crop.png"
    cropped.save(crop_path)
    data_url = to_data_url(cropped)

    meta = {
        "invoice_id": "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
        "source_image": str(SRC),
        "full_size": list(img.size),
        "crop_size": list(cropped.size),
        "crop_y": f"0-{cropped.height - 1}",
        "top_fraction": 0.83,
        "model": "gpt-4.1",
        "ground_truth": GT,
    }

    runs = []
    for i in range(1, 4):
        t0 = time.time()
        parsed = call_openai_metadata(api_key, data_url)
        elapsed = round(time.time() - t0, 2)
        run = {
            "run": i,
            "elapsed_s": elapsed,
            "raw": parsed,
            "supplier": parsed.get("supplier"),
            "invoice_date": parsed.get("invoice_date") or parsed.get("invoiceDate"),
            "invoice_number": parsed.get("invoice_number") or parsed.get("invoiceNumber"),
            "total": parsed.get("total"),
            "field_ok": {
                "supplier": supplier_match(parsed.get("supplier")),
                "invoice_date": date_match(parsed.get("invoice_date") or parsed.get("invoiceDate")),
                "invoice_number": number_match(
                    parsed.get("invoice_number") or parsed.get("invoiceNumber")
                ),
                "total": total_match(parsed.get("total")),
            },
        }
        runs.append(run)
        print(f"Run {i} ({elapsed}s):", json.dumps(run["raw"], ensure_ascii=False))

    # Summary
    fields = ["supplier", "invoice_date", "invoice_number", "total"]
    summary = {}
    for f in fields:
        oks = [r["field_ok"][f] for r in runs]
        summary[f] = {
            "accuracy": sum(oks) / len(oks),
            "runs_correct": sum(oks),
            "runs_total": len(oks),
            "values": [r[f if f != "invoice_date" else "invoice_date"] for r in runs],
        }

    out = {"meta": meta, "runs": runs, "summary": summary}
    out_path = OUT / "metadata-pass-runs.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
