#!/usr/bin/env python3
"""Read-only OCR reliability experiments — invokes extract-invoice only."""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

SRC = Path("/Users/salvadorseabra1/margin-master/.tmp/vl-date-rc/full.png")
OUT = Path("/Users/salvadorseabra1/margin-master/.tmp/vl-ocr-reliability")
META = Path("/Users/salvadorseabra1/margin-master/.tmp/vl-ocr-rc/layout-meta-v3.json")
SR = os.environ.get(
    "VL_SR",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG5scmdvZGNxb3l6ZGRicGJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY1NjY3NywiZXhwIjoyMDk2MjMyNjc3fQ.rMFKYAZLbMRe9vJkVtpxF8maM4gEWKF_xDiusZ_29Ec",
)
URL = "https://bjhnlrgodcqoyzddbpbd.supabase.co/functions/v1/extract-invoice"
RUNS = 3

GT = {
    "chocolate": {"qty": 2, "unit": "cx", "unit_price": 29.99, "total": 59.98, "keys": ["chocol", "panta", "16796"]},
    "nata": {"qty": 5, "unit": "cx", "unit_price": 18.89, "total": 94.45, "keys": ["nata", "15371"]},
    "gema": {"qty": 6, "unit": "un", "unit_price": 10.49, "total": 62.94, "keys": ["gema", "ovo liqu", "past.gema", "1501"]},
}


@dataclass
class Box:
    x1: int
    y1: int
    x2: int
    y2: int

    def crop(self, img: Image.Image) -> Image.Image:
        return img.crop((self.x1, self.y1, self.x2, self.y2))


def load_layout() -> dict[str, Any]:
    return json.loads(META.read_text())


def norm_unit(u: str | None) -> str | None:
    if u is None:
        return None
    u = u.strip().lower()
    if u in ("uni", "und", "unid"):
        return "un"
    if u in ("caixa", "case"):
        return "cx"
    return u


def match_item(items: list[dict], target: str) -> dict | None:
    keys = GT[target]["keys"]
    for it in items:
        name = (it.get("name") or "").lower()
        if any(k in name for k in keys):
            return it
    return None


def score_item(it: dict | None, target: str) -> dict[str, Any]:
    g = GT[target]
    if not it:
        return {"found": False, "correct": False, "fields": {}}
    got = {
        "quantity": it.get("quantity"),
        "unit": norm_unit(it.get("unit")),
        "unit_price": it.get("unit_price"),
        "total": it.get("total"),
        "name": it.get("name"),
    }
    exp = {"quantity": g["qty"], "unit": g["unit"], "unit_price": g["unit_price"], "total": g["total"]}

    def near(a, b):
        if a is None or b is None:
            return a == b
        return abs(float(a) - float(b)) < 0.011

    field_ok = {
        "quantity": near(got["quantity"], exp["quantity"]),
        "unit": got["unit"] == exp["unit"],
        "unit_price": near(got["unit_price"], exp["unit_price"]),
        "total": near(got["total"], exp["total"]),
    }
    return {
        "found": True,
        "correct": all(field_ok.values()),
        "fields": got,
        "expected": exp,
        "field_ok": field_ok,
    }


def invoke(crop_path: Path) -> dict[str, Any]:
    data = crop_path.read_bytes()
    data_url = f"data:image/png;base64,{base64.b64encode(data).decode()}"
    body = json.dumps({"imageDataUrl": data_url}).encode()
    req = urllib.request.Request(
        URL,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "application/json"},
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        payload = json.loads(resp.read().decode())
    return {"elapsed_s": round(time.time() - t0, 2), **payload}


def build_crops(img: Image.Image, layout: dict) -> dict[str, Box]:
    w, h = img.size
    rows = layout["rows"]
    header = rows["header"]
    table_top = 218
    table_bot = 448
    footer_start = 458
    iva_start = 488

    boxes: dict[str, Box] = {}

    # --- Task 1 scopes ---
    boxes["A_full_page"] = Box(0, 0, w, h)
    boxes["B_table_only"] = Box(0, table_top, w, table_bot)
    boxes["C_header_table"] = Box(0, header[0], w, table_bot)

    for target in ("chocolate", "nata", "gema"):
        y1, y2 = rows[target]
        pad = 3
        boxes[f"D_header_plus_{target}"] = Box(0, header[0], w, y2 + pad)
        boxes[f"E_row_only_{target}"] = Box(0, y1 - pad, w, y2 + pad)

    # --- Task 2 minimum-context candidates ---
    ch_y1, ch_y2 = rows["chocolate"]
    boxes["min_header_through_chocolate"] = Box(0, header[0], w, ch_y2 + 4)
    boxes["min_header_plus_chocolate_row"] = Box(0, header[0], w, ch_y2 + 4)  # same rect; label distinct in analysis
    boxes["min_chocolate_row_expanded"] = Box(0, ch_y1 - 30, w, ch_y2 + 30)
    boxes["min_header_chocolate_neighbour"] = Box(
        0, rows["arroz"][0] - 4, w, rows["acucar"][1] + 4
    )
    boxes["min_price_cols_header_chocolate"] = Box(400, header[0], w, ch_y2 + 4)

    for target in ("nata", "gema"):
        y1, y2 = rows[target]
        boxes[f"min_header_through_{target}"] = Box(0, header[0], w, y2 + 4)

    # --- Task 3 header dependency ---
    boxes["hdr_with_header_table"] = Box(0, header[0], w, table_bot)
    boxes["hdr_rows_only_no_header"] = Box(0, rows["anchovas"][0], w, table_bot)
    boxes["hdr_chocolate_with_header"] = Box(0, header[0], w, ch_y2 + 4)
    boxes["hdr_chocolate_without_header"] = Box(0, ch_y1 - 2, w, ch_y2 + 2)
    boxes["hdr_header_band_only"] = Box(0, header[0], w, header[1] + 2)
    boxes["hdr_table_minus_header_band"] = Box(0, header[1] + 1, w, table_bot)

    # --- Task 4 contamination ---
    boxes["cont_table_no_footer"] = Box(0, header[0], w, footer_start)
    boxes["cont_table_no_iva_footer"] = Box(0, header[0], w, iva_start)
    boxes["cont_full_with_footer"] = Box(0, 0, w, h)
    boxes["cont_footer_only"] = Box(0, footer_start, w, h)
    boxes["cont_iva_totals_band"] = Box(0, iva_start, w, min(h, iva_start + 120))
    boxes["cont_trim_left_margin"] = Box(12, header[0], w, table_bot)
    boxes["cont_trim_right_margin"] = Box(0, header[0], w - 8, table_bot)

    return boxes


def summarize_runs(scope: str, runs: list[dict]) -> dict[str, Any]:
    per_target: dict[str, list] = {t: [] for t in GT}
    for run in runs:
        items = run.get("items") or []
        for t in GT:
            per_target[t].append(score_item(match_item(items, t), t))

    summary = {"scope": scope, "runs": len(runs), "targets": {}}
    for t, scores in per_target.items():
        found = sum(1 for s in scores if s["found"])
        correct = sum(1 for s in scores if s["correct"])
        payloads = [s["fields"] for s in scores if s["found"]]
        unique = {json.dumps(p, sort_keys=True) for p in payloads}
        summary["targets"][t] = {
            "found_rate": found / len(scores),
            "accuracy": correct / len(scores),
            "stability": 1.0 if len(unique) <= 1 else (1 / len(unique) if unique else 0),
            "consistent": len(unique) <= 1,
            "unique_outputs": len(unique),
            "samples": scores,
        }
    # aggregate across targets
    accs = [summary["targets"][t]["accuracy"] for t in GT]
    stabs = [summary["targets"][t]["stability"] for t in GT]
    summary["aggregate"] = {
        "mean_accuracy": sum(accs) / len(accs),
        "mean_stability": sum(stabs) / len(stabs),
        "all_correct_rate": sum(1 for r in runs if all(score_item(match_item(r.get("items") or [], t), t)["correct"] for t in GT)) / len(runs),
    }
    return summary


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    crops_dir = OUT / "crops"
    crops_dir.mkdir(exist_ok=True)

    layout = load_layout()
    img = Image.open(SRC)
    boxes = build_crops(img, layout)

    for name, box in boxes.items():
        box.crop(img).save(crops_dir / f"{name}.png")

    all_runs: list[dict] = []
    summaries: list[dict] = []

    for name, box in boxes.items():
        crop_path = crops_dir / f"{name}.png"
        run_results = []
        for i in range(1, RUNS + 1):
            try:
                result = invoke(crop_path)
                entry = {
                    "scope": name,
                    "run": i,
                    "crop_size": list(box.crop(img).size),
                    "elapsed_s": result.get("elapsed_s"),
                    "item_count": len(result.get("items") or []),
                    "items": result.get("items") or [],
                    "scores": {t: score_item(match_item(result.get("items") or [], t), t) for t in GT},
                }
            except Exception as e:
                entry = {"scope": name, "run": i, "error": str(e)}
            run_results.append(entry)
            all_runs.append(entry)
            print(f"{'OK' if 'error' not in entry else 'ERR'} {name} run{i}")
            time.sleep(0.4)

        ok_runs = [r for r in run_results if "error" not in r]
        if ok_runs:
            summaries.append(summarize_runs(name, ok_runs))

    (OUT / "raw-runs.json").write_text(json.dumps(all_runs, indent=2, ensure_ascii=False))
    (OUT / "scope-summaries.json").write_text(json.dumps(summaries, indent=2, ensure_ascii=False))

    # reliability scoring table
    scoring = []
    for s in summaries:
        scoring.append(
            {
                "method": s["scope"],
                "accuracy_chocolate": s["targets"]["chocolate"]["accuracy"],
                "accuracy_nata": s["targets"]["nata"]["accuracy"],
                "accuracy_gema": s["targets"]["gema"]["accuracy"],
                "mean_accuracy": s["aggregate"]["mean_accuracy"],
                "mean_stability": s["aggregate"]["mean_stability"],
                "all_three_correct_rate": s["aggregate"]["all_correct_rate"],
                "notes": f"found C/N/G: {s['targets']['chocolate']['found_rate']:.0%}/{s['targets']['nata']['found_rate']:.0%}/{s['targets']['gema']['found_rate']:.0%}; unique C/N/G: {s['targets']['chocolate']['unique_outputs']}/{s['targets']['nata']['unique_outputs']}/{s['targets']['gema']['unique_outputs']}",
            }
        )
    scoring.sort(key=lambda x: (-x["mean_accuracy"], -x["mean_stability"]))
    (OUT / "reliability-scoring.json").write_text(json.dumps(scoring, indent=2))

    print(f"Wrote {len(all_runs)} runs, {len(summaries)} scope summaries to {OUT}")


if __name__ == "__main__":
    main()
