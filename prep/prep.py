#!/usr/bin/env python3
"""
prep.py: reduce the US Accidents CSV (about 3 GB, 7.7 million rows) to three small
JSON files the visualization reads.

    python3 prep/prep.py                       # uses data/raw/US_Accidents_March23.csv
    python3 prep/prep.py --csv path/to/file.csv
    python3 prep/prep.py --csv sample.csv --allow-mismatch   # for a sample or test file

Outputs (in data/):
    byhour.json      counts by hour of day x weather class x day/night        (Views 1, 5, 6, 7)
    audit.json       coverage by month, Severity, missingness, term mapping  (View 2)
    conditions.json  the four wet/dry x day/night cells and their shares     (Views 5, 6, 7)
    prep_log.json    row conservation, file hash, run time, checks passed

Rules this script enforces (see the report, Section 4.1):
  * A row missing a field is excluded from the tables that need that field and from no
    others. Nothing is imputed. A missing Precipitation is never read as zero.
  * Weather is classified from Weather_Condition with the explicit term list in
    prep/weather_terms.json, not a hidden regular expression.
  * Every percentage is recomputed from summed counts. No percentage is an average of
    percentages, and no median is aggregated.
  * Row conservation: for every chunk, table cells + excluded rows == rows read, exactly.
"""
import argparse
import hashlib
import json
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "data" / "raw" / "US_Accidents_March23.csv"
OUT = ROOT / "data"
TERMS = Path(__file__).resolve().parent / "weather_terms.json"

# The published description of the release this project cites (Moosavi et al., Kaggle).
EXPECTED_ROWS = 7_728_394
EXPECTED_FIRST_MONTHS = {"2016-01", "2016-02"}   # the release opens in early 2016
EXPECTED_LAST_MONTH = "2023-03"

USECOLS = ["ID", "Severity", "Start_Time", "Weather_Condition", "Sunrise_Sunset",
           "Visibility(mi)", "Precipitation(in)", "State"]
CLASSES = ["dry", "wet", "frozen", "ambiguous"]
PERIODS = ["Day", "Night"]


def load_terms(path=TERMS):
    t = json.loads(Path(path).read_text())
    return ([s.lower() for s in t["ambiguous_exact"]],
            [s.lower() for s in t.get("dry_exact", [])],
            [s.lower() for s in t["frozen_substrings"]],
            [s.lower() for s in t["wet_substrings"]])


def classify_value(value, terms):
    """Classify one Weather_Condition string. Returns None for a missing value."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    v = str(value).strip().lower()
    if v == "":
        return None
    ambiguous, dry_exact, frozen, wet = terms
    if v in ambiguous:
        return "ambiguous"
    if v in dry_exact:
        return "dry"
    if any(s in v for s in frozen):
        return "frozen"
    if any(s in v for s in wet):
        return "wet"
    return "dry"


def sha256(path, block=1 << 22):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(block), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--chunksize", type=int, default=500_000)
    ap.add_argument("--allow-mismatch", action="store_true",
                    help="do not stop when the row count or date range differs from the cited release")
    ap.add_argument("--no-hash", action="store_true", help="skip the SHA-256 of the input file")
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"Input not found: {args.csv}\nDownload US_Accidents_March23.csv from "
                 "https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents and put it in data/raw/.")

    header = pd.read_csv(args.csv, nrows=0).columns.tolist()
    missing_cols = [c for c in USECOLS if c not in header]
    if missing_cols:
        sys.exit(f"The file is missing expected columns: {missing_cols}")

    terms = load_terms()
    t0 = time.time()

    # Accumulators. All are plain counts; shares are computed once, at the end.
    cell = Counter()                 # (hour, class, period) -> count, rows with all three present
    by_month = Counter()             # "YYYY-MM" -> rows
    severity = Counter()             # 1..4 -> rows
    by_state = Counter()             # state -> rows
    cond_values = Counter()          # raw Weather_Condition string -> rows (for the audit mapping)
    nulls = Counter()                # column -> null rows
    excluded = Counter()             # reason -> rows excluded from `cell`
    precip_by_class = {c: Counter() for c in CLASSES}   # class -> {"zero","positive","missing"}
    vis_by_class = {c: Counter() for c in CLASSES}      # class -> {"lt1","1to5","ge5","missing"}
    rows_read = 0
    dup_ids = 0
    seen_ids_sample = set()
    min_time = None
    max_time = None
    first_rows = []

    reader = pd.read_csv(args.csv, usecols=USECOLS, chunksize=args.chunksize,
                         dtype={"ID": "string", "Weather_Condition": "string",
                                "Sunrise_Sunset": "string", "State": "string",
                                "Start_Time": "string"},
                         keep_default_na=True)

    for i, df in enumerate(reader):
        n = len(df)
        rows_read += n
        if len(first_rows) < 4:
            first_rows += df.head(4 - len(first_rows)).astype(object).where(df.notna(), None).to_dict("records")

        for c in USECOLS:
            nulls[c] += int(df[c].isna().sum())

        # Time: the release mixes "YYYY-MM-DD HH:MM:SS" and the same with nanoseconds.
        # Slicing the fixed-width prefix is exact for both and avoids a slow parser.
        st = df["Start_Time"]
        ok_time = st.notna() & st.str.match(r"^\d{4}-\d{2}-\d{2} \d{2}:")
        month = st.where(ok_time).str.slice(0, 7)
        hour = pd.to_numeric(st.where(ok_time).str.slice(11, 13), errors="coerce")
        by_month.update(month.dropna().tolist())
        mt = st.where(ok_time).dropna()
        if len(mt):
            lo, hi = mt.min(), mt.max()
            min_time = lo if min_time is None or lo < min_time else min_time
            max_time = hi if max_time is None or hi > max_time else max_time

        severity.update(pd.to_numeric(df["Severity"], errors="coerce").dropna().astype(int).tolist())
        by_state.update(df["State"].dropna().tolist())

        wc = df["Weather_Condition"]
        cond_values.update(wc.dropna().tolist())
        # classify each distinct string once, then map
        uniq = {v: classify_value(v, terms) for v in wc.dropna().unique().tolist()}
        cls = wc.astype(object).map(uniq)   # missing values map to NaN, never to a class

        period = df["Sunrise_Sunset"].where(df["Sunrise_Sunset"].isin(PERIODS))

        # Exclusion reasons, assigned in a fixed order so each row gets exactly one.
        has_hour = hour.notna()
        has_cls = cls.notna()
        has_per = period.notna()
        reason = pd.Series("ok", index=df.index)
        reason[~has_hour] = "missing_or_bad_start_time"
        reason[has_hour & ~has_cls] = "missing_weather_condition"
        reason[has_hour & has_cls & ~has_per] = "missing_sunrise_sunset"
        excluded.update(reason[reason != "ok"].tolist())

        keep = reason == "ok"
        grp = pd.DataFrame({"h": hour[keep].astype(int), "c": cls[keep], "p": period[keep]})
        counts = grp.groupby(["h", "c", "p"], dropna=False).size()
        for (h, c, p), k in counts.items():
            cell[(int(h), c, p)] += int(k)

        # Secondary evidence, audited per class. Missing precipitation stays missing.
        pr = pd.to_numeric(df["Precipitation(in)"], errors="coerce")
        vi = pd.to_numeric(df["Visibility(mi)"], errors="coerce")
        for c in CLASSES:
            m = cls == c
            precip_by_class[c]["missing"] += int((m & pr.isna()).sum())
            precip_by_class[c]["zero"] += int((m & (pr == 0)).sum())
            precip_by_class[c]["positive"] += int((m & (pr > 0)).sum())
            vis_by_class[c]["missing"] += int((m & vi.isna()).sum())
            vis_by_class[c]["lt1"] += int((m & (vi < 1)).sum())
            vis_by_class[c]["1to5"] += int((m & (vi >= 1) & (vi < 5)).sum())
            vis_by_class[c]["ge5"] += int((m & (vi >= 5)).sum())

        # Row conservation for this chunk: cells + exclusions == rows read.
        chunk_cells = int(counts.sum())
        chunk_excl = int((reason != "ok").sum())
        if chunk_cells + chunk_excl != n:
            sys.exit(f"Row conservation failed in chunk {i}: {chunk_cells} + {chunk_excl} != {n}")

        if i < 3:  # duplicate-ID spot check on the first chunks only (a full set would cost GBs)
            ids = df["ID"].dropna()
            dup_ids += int(ids.duplicated().sum()) + sum(1 for x in ids if x in seen_ids_sample)
            seen_ids_sample.update(ids.tolist())

        print(f"  chunk {i:>3}: {rows_read:>10,} rows read, {time.time() - t0:6.1f} s", flush=True)

    total_cells = sum(cell.values())
    total_excl = sum(excluded.values())
    assert total_cells + total_excl == rows_read, "row conservation failed overall"

    first_month = min(by_month) if by_month else None
    last_month = max(by_month) if by_month else None
    integrity_ok = (rows_read == EXPECTED_ROWS and first_month in EXPECTED_FIRST_MONTHS
                    and last_month == EXPECTED_LAST_MONTH)
    if not integrity_ok and not args.allow_mismatch:
        sys.exit(f"Data integrity check failed: read {rows_read:,} rows spanning {first_month} to "
                 f"{last_month}; the cited release has {EXPECTED_ROWS:,} rows spanning "
                 f"early 2016 to {EXPECTED_LAST_MONTH}. A different release was "
                 "downloaded. Rerun with --allow-mismatch only if that is intended.")

    # ---------- byhour.json ----------
    byhour = {"hours": list(range(24)), "classes": CLASSES, "periods": PERIODS, "counts": {}}
    for c in CLASSES:
        byhour["counts"][c] = {p: [cell.get((h, c, p), 0) for h in range(24)] for p in PERIODS}
    byhour["n_in_tables"] = total_cells
    byhour["n_excluded"] = dict(excluded)

    # ---------- conditions.json ----------
    def tot(c, p):
        return sum(cell.get((h, c, p), 0) for h in range(24))
    four = {f"{c}_{p.lower()}": tot(c, p) for c in ["dry", "wet"] for p in PERIODS}
    n_wd = sum(four.values())   # rows that are dry or wet with a known period
    conditions = {
        "cells": four,
        "n_wet_dry": n_wd,
        "share_of_wet_dry": {k: v / n_wd for k, v in four.items()} if n_wd else {},
        "wet_share": (four["wet_day"] + four["wet_night"]) / n_wd if n_wd else None,
        "night_share": (four["dry_night"] + four["wet_night"]) / n_wd if n_wd else None,
        "held_out": {"frozen": tot("frozen", "Day") + tot("frozen", "Night"),
                     "ambiguous": tot("ambiguous", "Day") + tot("ambiguous", "Night")},
        "night_share_all_classes": (sum(tot(c, "Night") for c in CLASSES) / total_cells) if total_cells else None,
    }

    # ---------- audit.json ----------
    mapping = sorted(({"value": v, "class": classify_value(v, terms), "rows": k}
                      for v, k in cond_values.items()), key=lambda r: -r["rows"])
    audit = {
        "rows_read": rows_read,
        "by_month": dict(sorted(by_month.items())),
        "severity": {str(k): severity[k] for k in sorted(severity)},
        "null_rows": {c: nulls[c] for c in USECOLS},
        "null_share": {c: nulls[c] / rows_read for c in USECOLS} if rows_read else {},
        "by_state": dict(by_state.most_common()),
        "weather_mapping": mapping,
        "class_totals": {c: sum(r["rows"] for r in mapping if r["class"] == c) for c in CLASSES},
        "precipitation_by_class": {c: dict(precip_by_class[c]) for c in CLASSES},
        "visibility_by_class": {c: dict(vis_by_class[c]) for c in CLASSES},
        "severity_definition": {
            "1": "least impact on traffic (short delay)",
            "4": "most impact on traffic (long delay)",
            "note": "Severity measures traffic delay as defined by the dataset authors, not injury.",
        },
        "sample_records": first_rows,
    }

    log = {
        "input": str(args.csv.name),
        "sha256": None if args.no_hash else sha256(args.csv),
        "rows_read": rows_read,
        "rows_in_tables": total_cells,
        "rows_excluded": dict(excluded),
        "row_conservation": total_cells + total_excl == rows_read,
        "start_time_min": min_time,
        "start_time_max": max_time,
        "first_month": first_month,
        "last_month": last_month,
        "integrity_matches_cited_release": integrity_ok,
        "duplicate_ids_in_first_chunks": dup_ids,
        "seconds": round(time.time() - t0, 1),
        "pandas": pd.__version__,
        "terms_file": json.loads(TERMS.read_text()),
    }

    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in [("byhour", byhour), ("conditions", conditions), ("audit", audit), ("prep_log", log)]:
        (OUT / f"{name}.json").write_text(json.dumps(obj, indent=1, default=str))

    print(f"\nRead {rows_read:,} rows in {log['seconds']} s. In tables: {total_cells:,}. "
          f"Excluded: {dict(excluded)}.")
    print(f"Row conservation: {'PASS' if log['row_conservation'] else 'FAIL'}. "
          f"Integrity vs cited release: {'PASS' if integrity_ok else 'MISMATCH (allowed)'}.")
    print(f"Wet share of wet+dry: {conditions['wet_share']:.4f}. Night share: {conditions['night_share']:.4f}.")
    print(f"Wrote {', '.join(n + '.json' for n in ['byhour', 'conditions', 'audit', 'prep_log'])} to {OUT}")


if __name__ == "__main__":
    main()
