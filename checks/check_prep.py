#!/usr/bin/env python3
"""
Independent check of prep.py. Recomputes the hour x class x period table from the raw CSV by a
different route (whole-file load, datetime parsing instead of string slicing, a separate
classification written from the term file) and compares every cell with data/byhour.json.
Also checks specific classifications and the missing-precipitation rule.

    python3 checks/check_prep.py path/to/file.csv
Only practical on a sample or the synthetic file; the full release needs about 3 GB of RAM.
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
csv = Path(sys.argv[1])
terms = json.loads((ROOT / "prep" / "weather_terms.json").read_text())
byhour = json.loads((ROOT / "data" / "byhour.json").read_text())
audit = json.loads((ROOT / "data" / "audit.json").read_text())
log = json.loads((ROOT / "data" / "prep_log.json").read_text())

fails = []


def check(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' : ' + detail) if detail else ''}")
    if not ok:
        fails.append(name)


def cls(v):
    if pd.isna(v) or str(v).strip() == "":
        return None
    s = str(v).strip().lower()
    if s in {x.lower() for x in terms["ambiguous_exact"]}:
        return "ambiguous"
    if s in {x.lower() for x in terms.get("dry_exact", [])}:
        return "dry"
    for x in terms["frozen_substrings"]:
        if x.lower() in s:
            return "frozen"
    for x in terms["wet_substrings"]:
        if x.lower() in s:
            return "wet"
    return "dry"


# 1. Named classifications that matter to the argument
cases = {"Light Rain": "wet", "Light Freezing Rain": "frozen", "Thunder in the Vicinity": "dry",
         "Snow Showers": "frozen", "N/A Precipitation": "ambiguous", "Fog": "dry", "Mist": "dry",
         "T-Storm": "wet", "Heavy T-Storm / Windy": "wet", "Duststorm": "dry",
         "Showers in the Vicinity": "dry", "Light Freezing Fog": "frozen", "Rain and Sleet": "frozen", "Wintry Mix": "frozen", "Fair": "dry"}
for v, want in cases.items():
    check(f"classify '{v}' -> {want}", cls(v) == want, f"got {cls(v)}")

# 2. Recompute the table a different way
df = pd.read_csv(csv, usecols=["Start_Time", "Weather_Condition", "Sunrise_Sunset", "Precipitation(in)"])
t = pd.to_datetime(df["Start_Time"], format="mixed", errors="coerce")
df["h"] = t.dt.hour
df["c"] = df["Weather_Condition"].map(cls)
df["p"] = df["Sunrise_Sunset"].where(df["Sunrise_Sunset"].isin(["Day", "Night"]))
ok = df.dropna(subset=["h", "c", "p"])
ref = ok.groupby(["h", "c", "p"]).size()
mism = 0
for c in byhour["classes"]:
    for p in byhour["periods"]:
        for h in range(24):
            a = byhour["counts"][c][p][h]
            b = int(ref.get((float(h), c, p), ref.get((h, c, p), 0)))
            mism += a != b
check("every hour x class x period cell matches the independent recount", mism == 0, f"{mism} cells differ")
check("rows in tables match", byhour["n_in_tables"] == len(ok), f"{byhour['n_in_tables']} vs {len(ok)}")
check("row conservation logged", log["row_conservation"] is True)
check("rows read == file rows", log["rows_read"] == len(df), f"{log['rows_read']} vs {len(df)}")

# 3. Missing precipitation is never zero
wet = df[df["c"] == "wet"]
miss = int(wet["Precipitation(in)"].isna().sum())
check("wet rows with missing precipitation are reported as missing, not zero",
      audit["precipitation_by_class"]["wet"]["missing"] == miss,
      f"{audit['precipitation_by_class']['wet']['missing']} vs {miss}")

# 4. Shares are recomputed from counts
cond = json.loads((ROOT / "data" / "conditions.json").read_text())
n = sum(cond["cells"].values())
check("wet share equals summed wet counts over summed wet+dry counts",
      abs(cond["wet_share"] - (cond["cells"]["wet_day"] + cond["cells"]["wet_night"]) / n) < 1e-12)

print(f"\n{len(fails)} failed" if fails else "\nall checks passed")
sys.exit(1 if fails else 0)
