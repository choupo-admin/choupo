#!/usr/bin/env python3
"""Gate: the Henry-water records made from Sander (2015) Table 6 reproduce from their rows
(DEV.md 4c C321).

    bin/curate/check_henry_records.py

A record made by bin/curate/henry_sander.py names its rows file
(`provenance.rowsFile`, data/curation/batches/henry_sander/rows.tsv) and its CAS.  For each:
  1. the attribution is present (Sander 2015, the doi, CC-BY 3.0, a CHANGES note) and
     `origin literature`, `reviewStatus autoPromoted`, `review { by none; }`;
  2. the record names its source rows: rowsUsed, the page(s), and the CAS equals the
     catalogue component's CAS (matched by CAS, never by name);
  3. the numbers reproduce from rows.tsv: row count, median Hcp, spread, H_ref = 55345/Hcp
     (rel 1e-4 of the printed 5 digits), enthalpy = -R * median(d ln Hcp/d(1/T)) (0.5 J/mol);
  4. spread <= 3 and at least 2 temperature-coefficient rows (else it must not be a record);
  5. NO row of type Q or E (nor any type but M, L) in rows.tsv, and every row has a page and a
     reference;
  6. the summary's `new` solutes and the records are the same set.
Reads data/ only; writes nothing.
"""
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import henry_sander as hs  # noqa: E402

ROOT = hs.ROOT
BATCH = hs.BATCH


def field(t, key):
    m = re.search(r"^\s*" + key + r"\s+([^;]+?)\s*;", t, re.M)
    return m.group(1).strip().strip('"') if m else None


def main() -> int:
    errs = []
    rows_file = BATCH / "rows.tsv"
    if not rows_file.exists():
        print("FAIL: data/curation/batches/henry_sander/rows.tsv missing")
        return 1
    rows = hs.load(rows_file)
    for cas, rs in rows.items():
        for r in rs:
            if r["t"] not in ("M", "L"):
                errs.append(f"rows.tsv: {cas} row type {r['t']} (only M and L are admitted; Q/E excluded)")
            if not r["page"] or not r["ref"]:
                errs.append(f"rows.tsv: {cas} row without page or reference")
    cat = hs.catalogue()
    made = set()
    for p in sorted(hs.HENRY.glob("*-water.dat")):
        t = p.read_text()
        if "henry_sander/rows.tsv" not in t:
            continue
        sol = p.stem[:-6]
        made.add(sol)
        tag = f"{p.name}"
        for need in ("Sander, R. (2015)", "doi:10.5194/acp-15-4399-2015", "CC-BY 3.0", "CHANGES"):
            if need not in t:
                errs.append(f"{tag}: attribution text lacks '{need}'")
        for k, v in (("origin", "literature"), ("reviewStatus", "autoPromoted")):
            if field(t, k) != v:
                errs.append(f"{tag}: {k} is {field(t, k)!r}, expected {v}")
        if not re.search(r"review\s*\{\s*by\s+none;\s*\}", t):
            errs.append(f"{tag}: no `review {{ by none; }}`")
        cas = field(t, "CAS")
        if cas not in cat or sol not in cat.get(cas, []):
            errs.append(f"{tag}: CAS {cas} is not the CAS of catalogue component {sol}")
            continue
        s = hs.summarise(rows.get(cas, []))
        if s is None:
            errs.append(f"{tag}: no M/L rows for CAS {cas} in rows.tsv")
            continue
        if int(field(t, "rowsUsed")) != s["n"]:
            errs.append(f"{tag}: rowsUsed {field(t, 'rowsUsed')} != {s['n']} rows of rows.tsv")
        if s["spread"] > hs.SPREAD_LIMIT:
            errs.append(f"{tag}: spread {s['spread']:.2f} > {hs.SPREAD_LIMIT} (must not be a record)")
        if s["nd"] < hs.MIN_DROWS:
            errs.append(f"{tag}: only {s['nd']} temperature-coefficient rows (< {hs.MIN_DROWS})")
            continue
        if abs(float(field(t, "spread")) - s["spread"]) > 0.006 * s["spread"]:
            errs.append(f"{tag}: spread {field(t, 'spread')} != {s['spread']:.3g}")
        if abs(float(field(t, "hcpMedian")) / s["med"] - 1) > 1e-3:
            errs.append(f"{tag}: hcpMedian {field(t, 'hcpMedian')} != {s['med']:.3g}")
        href = float(re.search(r"^H_ref\s+(\S+)\s+Pa;", t, re.M).group(1))
        if abs(href / (hs.CW / s["med"]) - 1) > 1e-4:
            errs.append(f"{tag}: H_ref {href:.4e} != 55345/Hcp = {hs.CW / s['med']:.4e}")
        enth = float(re.search(r"^enthalpy\s+(\S+)\s+J/mol;", t, re.M).group(1))
        if abs(enth - (-hs.R * s["dmed"])) > 0.5:
            errs.append(f"{tag}: enthalpy {enth:.0f} != -R*B = {-hs.R * s['dmed']:.0f}")
        if f"p. {s['pages']}" not in t:
            errs.append(f"{tag}: page(s) {s['pages']} of the source rows not named")
    summary = set()
    sf = BATCH / "summary.tsv"
    for l in sf.read_text().split("\n")[1:]:
        c = l.split("\t")
        if len(c) > 9 and c[9] == "new":
            summary.add(c[1])
    if summary != made:
        errs.append(f"summary 'new' set differs from the records: only in summary "
                    f"{sorted(summary - made)}, only records {sorted(made - summary)}")
    if errs:
        print(f"FAIL: {len(errs)} problem(s)")
        for e in errs:
            print("  " + e)
        return 1
    print(f"check_henry_records: OK -- {len(made)} Henry records from Sander 2015 reproduce from rows.tsv "
          f"({sum(len(v) for v in rows.values())} M/L rows, no Q or E row; NOT CHECKED: the values of the thermo-library records)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
