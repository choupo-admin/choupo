#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the aqueous-species records of C320 reproduce from their evidence table and agree with it.

    bin/curate/check_species_records.py

Every species of data/curation/batches/species_c320/species.tsv with status `included` has a record
data/standards/species/<name>.dat, BYTE-IDENTICAL to what bin/curate/species_c320.py renders from the table
(so the number in a record is the number in the table, in J/mol and J/mol/K).  Held to:
  1. the record's name is its file stem, `recordType modelSpecies`, its charge equals the charge written in its formula,
     its elements are all in the engine's atomic-weight table, its MW equals the sum of those weights (0.002);
  2. the TWO READINGS agree: NBS (Wagman et al. 1982, read from the scanned page) against the CRC aqueous table
     (the same NBS data reprinted at 0.1): hf within 0.5 kJ/mol, S and Cp within 1 J/mol/K.  A species outside that is
     `held` (no record file) and its table rows must show the disagreement (or a missing S), or the note must say
     EXISTING HOME (the engine already derives the species from a chemistry/ record);
  3. the CHOSEN value is NBS unless a CODATA key value is tabulated (then CODATA); CODATA is read from two files
     and must differ from NBS by no more than 6 (kJ/mol or J/mol/K) -- an evaluated revision, not a misreading;
  4. the Gibbs identity on the NBS row: dGf = dHf - T (S - sum S(elements) + (z/2) S(H2)) within 0.6 kJ/mol -- three
     numbers read from one scanned row must be consistent with each other (a misread digit breaks it);
  5. no record outside the table carries the batch header; no held species has a record; no transport block (no
     cited radius / D0 source was read for these ions).
Reads data/ only; writes nothing.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import species_c320 as sc  # noqa: E402

T = 298.15
TOL_HF, TOL_S, TOL_REV, TOL_G = 0.5, 1.0, 6.0, 0.6


def elements():
    d = {}
    for ln in (sc.BATCH / "elements.tsv").read_text(encoding="utf-8").splitlines()[1:]:
        c = ln.split("\t")
        if len(c) >= 5:
            d[c[0]] = float(c[3]) / int(c[2])
    return d


def main() -> int:
    errs = []
    rows = sc.load_table()
    sp = sc.by_species(rows)
    el = elements()
    w = sc.weights()
    n_inc = n_held = n_codata = 0
    for name, rs in sp.items():
        r0 = rs[0]
        status = r0["status"]
        q = {r["quantity"]: r for r in rs}
        f = r0["formula"]
        rec = sc.SPECIES / f"{name}.dat"
        try:
            at = sc.atoms(f)
        except ValueError as e:
            errs.append(f"{name}: {e}")
            continue
        if sc.charge_of(f) != int(r0["charge"]):
            errs.append(f"{name}: charge {r0['charge']} differs from the formula {f}")
        for e in at:
            if e not in w:
                errs.append(f"{name}: element {e} not in src/thermo/AtomicWeights.cpp")
            if e not in el:
                errs.append(f"{name}: element {e} has no entropy row in elements.tsv")
        for qn, r in q.items():
            if not r["nbs_where"] or "Wagman" not in r["nbs_where"] or "Table" not in r["nbs_where"] \
                    or "p. " not in r["nbs_where"]:
                errs.append(f"{name}.{qn}: NBS reading without table and page")
        # (2) the two readings
        bad = []
        for qn, tol in (("hfAq", TOL_HF), ("sAq", TOL_S), ("cpAq", TOL_S)):
            r = q.get(qn)
            if r and r["second"]:
                if abs(float(r["nbs"]) - float(r["second"])) > tol:
                    bad.append(f"{qn} NBS {r['nbs']} vs CRC {r['second']}")
                if not r["second_where"]:
                    errs.append(f"{name}.{qn}: second reading without a page")
        # (4) the Gibbs identity on the NBS row
        gid = None
        if "gfAq" in q and "hfAq" in q and "sAq" in q:
            se = sum(el[e] * n for e, n in at.items() if e in el)
            gcalc = float(q["hfAq"]["nbs"]) - T * (float(q["sAq"]["nbs"]) - se + int(r0["charge"]) / 2 * el["H"] * 2) / 1000
            gid = float(q["gfAq"]["nbs"]) - gcalc
        if status == "held":
            n_held += 1
            if rec.exists():
                errs.append(f"{name}: held species has a record {rec.name}")
            reason = bool(bad) or "sAq" not in q or (gid is not None and abs(gid) > TOL_G) \
                or "EXISTING HOME" in r0["note"]
            if not reason:
                errs.append(f"{name}: held but its readings agree and its identity holds -- nothing justifies holding it")
            if not r0["note"]:
                errs.append(f"{name}: held without a note naming the reason")
            continue
        n_inc += 1
        if bad:
            errs.append(f"{name}: the two readings disagree beyond tolerance: " + "; ".join(bad))
        if gid is not None and abs(gid) > TOL_G:
            errs.append(f"{name}: Gibbs identity off by {gid:+.2f} kJ/mol (> {TOL_G}): the NBS hf, dGf, S are inconsistent")
        if "gfAq" not in q:
            errs.append(f"{name}: no dGf row for the Gibbs identity")
        # (3) chosen value
        for qn, r in q.items():
            if qn == "gfAq":
                continue
            if r["codata"]:
                if r["chosen_origin"] != "CODATA" or abs(float(r["chosen"]) - float(r["codata"])) > 1e-9:
                    errs.append(f"{name}.{qn}: CODATA is tabulated, so it is the chosen value")
                if abs(float(r["codata"]) - float(r["nbs"])) > TOL_REV:
                    errs.append(f"{name}.{qn}: CODATA {r['codata']} vs NBS {r['nbs']} beyond {TOL_REV}: a misreading")
                if not r["codata_where"]:
                    errs.append(f"{name}.{qn}: CODATA without a page")
                n_codata += 1
            else:
                if r["chosen_origin"] != "NBS" or abs(float(r["chosen"]) - float(r["nbs"])) > 1e-9:
                    errs.append(f"{name}.{qn}: no CODATA value, so NBS is the chosen value")
        # (1) the record
        if not rec.exists():
            errs.append(f"{name}: no record {rec.name}")
            continue
        t = rec.read_text(encoding="utf-8")
        if t != sc.render(name, rs):
            errs.append(f"{name}: record differs from what species_c320.py renders from species.tsv")
        if not re.search(r"^recordType\s+modelSpecies;", t, re.M):
            errs.append(f"{name}: recordType is not modelSpecies")
        m = re.search(r"^name\s+(\S+);", t, re.M)
        if not m or m.group(1) != name:
            errs.append(f"{name}: `name` is not the file stem")
        mm = re.search(r"MW\s*\{\s*value\s+([0-9.]+);\s*unit\s+g/mol;", t)
        if not mm or abs(float(mm.group(1)) - sum(w[e] * n for e, n in at.items() if e in w)) > 0.002:
            errs.append(f"{name}: MW differs from the engine's atomic weights")
        if "transport" in t or "volumetric" in t:
            errs.append(f"{name}: carries a transport/volumetric block with no cited source read")
        hf = re.search(r"hfAq\s*\{\s*value\s+(-?\d+);\s*unit\s+J/mol;", t)
        if not hf or int(hf.group(1)) != sc.fmt_j(q["hfAq"]["chosen"]):
            errs.append(f"{name}: hfAq is not the chosen value in J/mol")
        if "unit J/mol/K" not in t:
            errs.append(f"{name}: entropy unit")
    # (5) orphans
    for p in sorted(sc.SPECIES.glob("*.dat")):
        t = p.read_text(encoding="utf-8")
        if "species_c320.py" in t and p.stem not in sp:
            errs.append(f"{p.name}: carries the C320 header but is not in species.tsv")
    if errs:
        print(f"FAIL: {len(errs)} problem(s)")
        for e in errs:
            print("  " + e)
        return 1
    print(f"check_species_records: OK -- {n_inc} aqueous species reproduce from species.tsv "
          f"(NBS 1982 read against the CRC reprint and the Gibbs identity, {n_codata} CODATA-chosen quantities, "
          f"{n_held} held; NOT CHECKED: any radius or D0 -- none is carried)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
