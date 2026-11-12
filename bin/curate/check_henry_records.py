#!/usr/bin/env python3
"""Gate: the Henry-water records made from Sander (2015) Table 6 reproduce from their rows
(DEV.md 4c C321), and the organic-solvent records regressed from ThermoML reproduce
from their cases (C321 part 2).

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
  7. (C321 part 2) every Henry record REGRESSED by bin/curate/henry_organic.py
     (organic solvents, fittedInCase under data/curation/henry/) equals the
     refit of its case -- see check_organic_records below.
Reads data/ and the ThermoML cache; writes only the gitignored
constant/archiveExtracts/ of the data/curation/henry/ cases (regenerated).
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


# ----------------------------------------------------------------------------
# ARM (organic), DEV.md 4c C321 part 2: the Henry records REGRESSED by
# bin/curate/henry_organic.py from ThermoML measurements (organic solvents).
# For every record naming a `fittedInCase` under data/curation/henry/ (the
# catalogue's, and any case-local copy): the case's series is
# regenerated (`henry_organic.fetch`, local cache else NIST, both sha256 sums
# checked; unreachable = NOT RUN, exit 2, never a pass), the fit is RE-RUN and
# the record must equal it -- H_ref (its 5 printed digits), enthalpy (J/mol),
# Trange, the grade, the cap, the max relative error, the kept and discarded
# counts, the declaration's fingerprint and its evidence (DOI, block, both
# sums); a severe record is accepted in data/standards when its refit is severe
# (C285; Vitor's ruling of 2026-11-12, only above 20 % is refused), and a
# refused fit must have no record anywhere.  Every case's RESULT block must
# agree with its record set.  Five BUILT negatives run every time (a
# coefficient edited, the grade edited down, a refused fit dressed as
# promoted, a single-laboratory record carrying discarded points -- C321 part
# 2 amended: a point is an outlier only against another laboratory -- and a
# > 30 % fit dressed as severe, C336 class B) -- and one built POSITIVE, a
# 25 % fit graded severe, which must be accepted: each
# must be refused, or the arm cannot see what it claims.
# NOT CHECKED: the loader does not VOICE a Henry record's fitGrade or its
# autoPromoted status (src/thermo/henrysLaw/ reads neither; see DEV.md 4c
# C321 part 2) -- the grade is in the record and on the pairLookup card only.
def organic_compare(text, res, case, decl, fp, where_std, name):
    """The errors of one record `text` against the refit `res`."""
    import math
    import henry_organic as ho
    errs = []
    tag = name
    if res["grade"] == "refused" or res.get("p") is None:
        return [f"{tag}: the fit of its case is REFUSED ({res.get('why')}) -- a refused fit has no record"]
    if not where_std:
        errs.append(f"{tag}: a case-local copy -- every accepted grade (clean, warning, severe) is "
                    f"promoted into data/standards (Vitor's ruling of 2026-11-12)")
    Href, dH = ho.coefficients(res)
    m = re.search(r"^H_ref\s+([0-9.]+e[+-]\d+)\s+Pa;", text, re.M)
    if not m or abs(float(m.group(1)) / Href - 1) > 2e-5:
        errs.append(f"{tag}: H_ref {m.group(1) if m else None} != refit {Href:.5e} Pa")
    m = re.search(r"^enthalpy\s+(-?\d+)\s+J/mol;", text, re.M)
    if not m or int(m.group(1)) != dH:
        errs.append(f"{tag}: enthalpy {m.group(1) if m else None} != refit {dH} J/mol")
    m = re.search(r"^Trange\s+\(\s*(\S+)\s+(\S+)\s*\);", text, re.M)
    if not m or (int(m.group(1)), int(m.group(2))) != (math.floor(res["Tmin"]), math.ceil(res["Tmax"])):
        errs.append(f"{tag}: Trange != the kept span {res['Tmin']}-{res['Tmax']} K")
    if field(text, "fitGrade") != res["grade"]:
        errs.append(f"{tag}: fitGrade {field(text, 'fitGrade')} != refit grade {res['grade']}")
    if field(text, "fitGradeBasis") != "inSample":
        errs.append(f"{tag}: no `fitGradeBasis inSample;`")
    m = re.search(r"fitGradeCap\s+\(\s*([^)]*?)\s*\)", text)
    caps = m.group(1).split() if m else []
    if caps != res["caps"]:
        errs.append(f"{tag}: fitGradeCap {caps} != {res['caps']} (C300 rule 2)")
    mx = field(text, "fitGradeMaxRelativeError_pct")
    if mx is None or abs(float(mx) - res["maxRel_pct"]) > 1e-4:
        errs.append(f"{tag}: fitGradeMaxRelativeError_pct {mx} != refit {res['maxRel_pct']:.4f}")
    if ho.grade_of(float(mx or 1e9)) != res["grade_in"]:
        errs.append(f"{tag}: the number {mx} % does not grade to {res['grade_in']}")
    if len(re.findall(r'^\s*doi\s+"', text, re.M)) < 2 and field(text, "pointsDiscarded") not in ("0", None):
        errs.append(f"{tag}: ONE laboratory and pointsDiscarded {field(text, 'pointsDiscarded')} -- with a "
                    f"single series no point is an outlier (C321 part 2 amended)")
    for k, n in (("pointsKept", len(res["kept"])), ("pointsDiscarded", len(res["discarded"]))):
        if field(text, k) != str(n):
            errs.append(f"{tag}: {k} {field(text, k)} != {n}")
    if field(text, "fingerprint") != fp:
        errs.append(f"{tag}: fingerprint {field(text, 'fingerprint')} != the declaration's {fp}")
    for d in decl:
        for k in ("doi", "articleSha256", "sha256"):
            if f'{k:<13} "{d[k]}";' not in text and f'{k} "{d[k]}";' not in text:
                errs.append(f"{tag}: evidence lacks {k} {d[k]}")
    for k, v in (("origin", "fitted"), ("reviewStatus", "autoPromoted"), ("convention", "Sander-Hxp-v1")):
        if field(text, k) != v:
            errs.append(f"{tag}: {k} is {field(text, k)!r}, expected {v}")
    if not re.search(r"review\s*\{\s*by\s+none;\s*\}", text):
        errs.append(f"{tag}: no `review {{ by none; }}`")
    s, v = field(text, "solute"), field(text, "solvent")
    if field(text, "gasSpecies") != s or field(text, "dissolvedSpecies") != s:
        errs.append(f"{tag}: typed identity is not the solute {s}")
    cas = field(text, "CAS")
    facts = ho.comp_facts(s)
    if not facts or facts["CAS"] != cas:
        errs.append(f"{tag}: CAS {cas} is not the CAS of catalogue component {s}")
    if field(text, "fittedInCase") != case.relative_to(ROOT).as_posix():
        errs.append(f"{tag}: fittedInCase is not {case.relative_to(ROOT).as_posix()}")
    return errs


def check_organic_records():
    """(errors, not_run, n_records, n_cases); see the comment above."""
    import henry_organic as ho
    errs, not_run, n = [], [], 0
    n_local = 0
    cases = sorted(p.parent.parent for p in ho.CASES.glob("*/system/controlDict"))
    recs = {}
    for p in sorted(hs.HENRY.glob("*.dat")):
        t = p.read_text()
        m = re.search(r'fittedInCase\s+"(data/curation/henry/[^"]+)"', t)
        if m:
            recs.setdefault(m.group(1), []).append((p, t, True))
    for c in cases:
        for p in sorted((c / "constant" / "parameters" / "Henry").glob("*.dat")):
            recs.setdefault(c.relative_to(ROOT).as_posix(), []).append((p, p.read_text(), False))
    for rel in recs:
        if not (ROOT / rel / "system" / "controlDict").is_file():
            errs.append(f"{rel}: named by a record as fittedInCase, and is not a case")
    probe = None
    for c in cases:
        rel = c.relative_to(ROOT).as_posix()
        code = ho.fetch(c, quiet=True)
        if code == 2:
            not_run.append(rel)
            continue
        if code != 0:
            errs.append(f"{rel}: fetch REFUSED (a sum does not match its declaration)")
            continue
        s, v, decl, series = ho.read_series(c)
        res = ho.fit_points(series)
        fp = ho.fingerprint(c)
        mine = recs.get(rel, [])
        pd = (c / "system" / "propsDict").read_text()
        said = re.search(r"@@RESULT-BEGIN@@\n(.*?)\n  @@RESULT-END@@", pd, re.S)
        said = said.group(1) if said else ""
        if res["grade"] == "refused":
            if mine:
                errs.append(f"{rel}: refit REFUSED ({res['why']}) and a record exists: "
                            + ", ".join(str(p.relative_to(ROOT)) for p, _, _ in mine))
            if "REFUSED" not in said:
                errs.append(f"{rel}: its RESULT block does not say REFUSED")
            continue
        want_std = True             # clean, warning and severe are all promoted
        if len(mine) != 1 or mine[0][2] != want_std:
            errs.append(f"{rel}: grade {res['grade']} expects one record "
                        f"{'in data/standards' if want_std else 'in the case'}, found "
                        f"{[str(p.relative_to(ROOT)) for p, _, _ in mine]}")
            continue
        p, text, std = mine[0]
        n += 1
        n_local += 0 if std else 1
        errs += organic_compare(text, res, c, decl, fp, std, p.name)
        if f"{res['maxRel_pct']:.4f} %" not in said or ("PROMOTED" in said) != want_std:
            errs.append(f"{rel}: its RESULT block does not state this fit (max {res['maxRel_pct']:.4f} %)")
        if probe is None:
            probe = (text, res, c, decl, fp, p.name)
    # BUILT NEGATIVES: each must be refused.
    if probe is not None:
        text, res, c, decl, fp, name = probe
        bad = []
        t1 = re.sub(r"^(H_ref\s+)(\S+)", lambda m: m.group(1) + f"{float(m.group(2)) * 1.01:.5e}", text, flags=re.M)
        if not organic_compare(t1, res, c, decl, fp, True, name):
            bad.append("an H_ref edited by 1 %")
        t2 = re.sub(r"^(\s*fitGrade\s+)\w+;", r"\1clean;", text, flags=re.M)
        t2 = re.sub(r"^\s*fitGradeCap.*\n", "", t2, flags=re.M)
        if t2 == text or not organic_compare(t2, res, c, decl, fp, True, name):
            bad.append("a grade edited down to clean")
        t4 = re.sub(r"^(\s*pointsDiscarded\s+)\d+;", r"\g<1>2;", text, flags=re.M)
        r4 = dict(res, discarded=[("x", 0, 0.0, 0.3)] * 2)
        if t4 == text or not any("ONE laboratory" in e for e in organic_compare(t4, r4, c, decl, fp, True, name)):
            bad.append("a single-laboratory record carrying discarded points")
        t5 = re.sub(r"^(\s*fitGrade\s+)\w+;", r"\1severe;", text, flags=re.M)
        t5 = re.sub(r"^\s*fitGradeCap.*\n", "", t5, flags=re.M)
        r5 = dict(res, grade="refused", grade_in="refused", maxRel_pct=35.0, caps=[],
                  why="max relative error 35.00 % above 30 %")
        if not organic_compare(t5, r5, c, decl, fp, True, name):
            bad.append("a > 30 % fit dressed as severe (C336 class B)")
        #  and the POSITIVE: a 25 % fit is severe under class (B) and is
        #  ACCEPTED in the catalogue (C336; Vitor's ruling of 2026-11-12).
        t6 = re.sub(r"^(\s*fitGradeMaxRelativeError_pct\s+)\S+;", r"\g<1>25.0000;", t5, flags=re.M)
        r6 = dict(res, grade="severe", grade_in="severe", maxRel_pct=25.0, caps=[])
        e6 = organic_compare(t6, r6, c, decl, fp, True, name)
        if e6:
            bad.append("a 25 % fit graded severe was NOT accepted (C336 class B): " + e6[0])
        r3 = dict(res, grade="refused", why="built negative")
        if not organic_compare(text, r3, c, decl, fp, True, name):
            bad.append("a refused fit dressed as promoted")
        for b in bad:
            errs.append(f"built negative NOT refused: {b} -- the arm cannot see what it claims")
    return errs, not_run, n, len(cases), n_local


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
    org_errs, org_not_run, org_n, org_cases, org_local = check_organic_records()
    errs += org_errs
    if errs:
        print(f"FAIL: {len(errs)} problem(s)")
        for e in errs:
            print("  " + e)
        return 1
    if org_not_run:
        print(f"check_henry_records: NOT RUN -- {len(org_not_run)} organic-solvent case(s) cannot "
              f"regenerate their series (no ThermoML cache, NIST unreachable): "
              + ", ".join(org_not_run[:5]) + (" ..." if len(org_not_run) > 5 else ""))
        return 2
    print(f"check_henry_records: OK -- {len(made)} Henry records from Sander 2015 reproduce from rows.tsv "
          f"({sum(len(v) for v in rows.values())} M/L rows, no Q or E row); {org_n} organic-solvent "
          f"Henry records ({org_n - org_local} in the catalogue, {org_local} case-local) refitted "
          f"from their {org_cases} ThermoML cases equal their fit and grade "
          f"(5 built negatives refused, a 25 % severe accepted (C336 class B); one laboratory, no point discarded; NOT CHECKED: the values of the thermo-library records, "
          f"and the voicing of a Henry fitGrade, which no loader does)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
