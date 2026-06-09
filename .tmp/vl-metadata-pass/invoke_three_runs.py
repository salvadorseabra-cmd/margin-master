#!/usr/bin/env python3
"""Invoke temp vl-metadata-pass 3x — read-only experiment."""
import base64
import json
import time
import urllib.request
from pathlib import Path

SRC = Path("/Users/salvadorseabra1/margin-master/.tmp/vl-date-rc/full.png")
OUT = Path("/Users/salvadorseabra1/margin-master/.tmp/vl-metadata-pass")
SR = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG5scmdvZGNxb3l6ZGRicGJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY1NjY3NywiZXhwIjoyMDk2MjMyNjc3fQ.rMFKYAZLbMRe9vJkVtpxF8maM4gEWKF_xDiusZ_29Ec"
URL = "https://bjhnlrgodcqoyzddbpbd.supabase.co/functions/v1/vl-metadata-pass"

GT = {
    "supplier": "Aviludo",
    "invoice_date": "19/05/2026",
    "invoice_number": "FCL-LS626/004845",
    "total": 330.42,
}


def invoke(data_url: str) -> dict:
    body = json.dumps({"imageDataUrl": data_url}).encode()
    req = urllib.request.Request(
        URL,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def score_field(name: str, got) -> bool:
    if name == "supplier":
        return bool(got and ("aviludo" in str(got).lower() or "avijudo" in str(got).lower()))
    if name == "invoice_date":
        if not got:
            return False
        s = str(got).strip()
        return s in ("19/05/2026", "2026-05-19") or "19/05/2026" in s
    if name == "invoice_number":
        if not got:
            return False
        g = str(got).upper().replace(" ", "")
        return "FCL-LS626/004845" in g or g == "FCL-LS626/004845"
    if name == "total":
        try:
            return abs(float(got) - GT["total"]) < 0.011
        except (TypeError, ValueError):
            return False
    return False


def main():
    data_url = "data:image/png;base64," + base64.b64encode(SRC.read_bytes()).decode()
    runs = []
    for i in range(1, 4):
        t0 = time.time()
        payload = invoke(data_url)
        elapsed = round(time.time() - t0, 2)
        if "error" in payload and len(payload) == 1:
            raise RuntimeError(payload["error"])
        run = {
            "run": i,
            "elapsed_s": elapsed,
            "supplier": payload.get("supplier"),
            "invoice_date": payload.get("invoice_date"),
            "invoice_number": payload.get("invoice_number"),
            "total": payload.get("total"),
            "crop": payload.get("crop"),
            "model": payload.get("model"),
        }
        run["field_ok"] = {k: score_field(k, run[k]) for k in GT}
        runs.append(run)
        print(f"Run {i}:", json.dumps(run, ensure_ascii=False))

    summary = {}
    for k in GT:
        oks = [r["field_ok"][k] for r in runs]
        summary[k] = {"correct": sum(oks), "total": 3, "accuracy": sum(oks) / 3, "values": [r[k] for r in runs]}

    out = {
        "experiment": "vl-metadata-pass-83pct",
        "invoice_id": "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
        "ground_truth": GT,
        "crop": "cropTopPortion(0.83) inside vl-metadata-pass function",
        "model": "gpt-4.1",
        "runs": runs,
        "summary": summary,
    }
    path = OUT / "metadata-pass-runs.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\nWrote {path}")


if __name__ == "__main__":
    main()
