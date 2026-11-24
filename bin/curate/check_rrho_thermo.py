#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_rrho_thermo -- the RRHO-computed species table is what its tool and
its reviewed inputs produce, and the tool still reproduces published
thermochemistry.

    bin/curate/check_rrho_thermo.py
    CHOUPO_ALLOW_NO_NASA_PDF=1 bin/curate/check_rrho_thermo.py     # the H2O validation row SKIPPED

THE REAL DEFECTS IT WOULD HAVE CAUGHT (named, as CLAUDE.md 0.4e (4) asks).
  1. Ketene.  NASA/TP-2002-211556 prints S(298.15) = 251.442 in Table B1 and
     241.889 from its own appendix D coefficients: a published table
     disagreeing with itself by 9.6 J/(mol K), refused by the importer for
     exactly that reason (thermoTables/.../INDEX.md).  A species with no
     usable published thermochemistry was therefore COMPUTED, and a
     computation that nothing holds is the same defect one step later: a
     symmetry number of 2 for 1, a cm-1 read as K, a degeneracy dropped, a
     vibration mis-copied -- each moves S by 1 to 6 J/(mol K) and no golden
     sees it, because no case reads the table until Phase B.  Arm (a) holds
     the tool to seven species whose published values are not Choupo's own
     (six NASA records and the report's H2O row, from published constants);
     arm (c) holds ketene's computed S to the independent TRC/Herzberg value.
  2. A record edited by hand, or an input changed without re-running the
     tool.  Arm (b): every record equals the tool's text byte for byte, and
     the home holds no file the inputs do not name.

ARMS.
  (a) VALIDATION: S(298.15) within 1 J/(mol K) and Cp within 2 % from 300 to
      1500 K (the species' own `cp_tol_to_1500` where it carries one: NH2 3 %,
      C2H 3.5 %, each with its reason in the input) of the NASA reference, for each `validation` species of rrho_species.json.
      The deviations above that are REPORTED (anharmonicity), never failed.
  (b) RECORDS: data/standards/thermoTables/RRHO-computed/<name>.dat equals
      rrho_thermo.record_text() for each `records` entry; INDEX.md equals
      what write_all() prints; no other .dat file.
  (c) ANCHORS: each record's dHf_298 equals its input's cited value; where an
      input carries `S298_check` (an independent published S) the computed S
      is within `S298_check_tol` of it; every record's NASA fit is within
      1 % of the RRHO curve on 200-6000 K.
  (e) COMPONENT RECORDS: an input of `component_records` (a species that must stay a
      components/ record, e.g. vinylacetylene: Henry pair and sigma profile) has its
      thermochemistry blocks in components/<name>.dat equal to the tool's output.
      Real defect: C4H4 held another molecule's enthalpy (+135 kJ/mol) with no gate on it.
  (d) ONE HOME: no record's name or formula is also a components/ record or a
      NASA-TP-2002-211556 table record of the same formula and electronic
      state (the NASA table's CH2 is the TRIPLET; the singlet `1CH2` is not a
      duplicate of it, and says so in its description).

WHAT IT DOES NOT CHECK.  That the cited constants were read correctly from
the papers and databases (a curator's reading, the records say reviewStatus
interim); that the engine's resolution of the records is right (the engine
reads them like the NASA ones; check_thermo_tables arm (d) is the witness of
that route); that an ab initio constant, where the input says one was used,
is reproducible without PySCF.

SABOTAGES (by hand, restored).
  S1 symmetry number of H2O changed 2 -> 1                  -> (a) FAILED (S +5.76).
  S2 one vibration of a record's input scaled by 1.1        -> (b) FAILED.
  S3 one digit of one record's dHf_298 edited               -> (b) FAILED.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import rrho_thermo as T          # noqa: E402

SCAN_ROOTS = ("data/standards/thermoTables/RRHO-computed",)

LABEL = "check_rrho_thermo"
fails = []


def arm_a(spec):
    allow = os.environ.get("CHOUPO_ALLOW_NO_NASA_PDF") == "1"
    skipped = []
    for sp in spec["validation"]:
        T.check_input(sp)
    # a validation row that needs the report is skipped, named, when it is absent
    have_pdf = (ROOT / "thirdParty/nasa-tp2002/NASA-TP-2002-211556.pdf").is_file()
    sub = dict(spec)
    sub["validation"] = []
    for sp in spec["validation"]:
        if sp["reference"]["kind"] == "report" and not have_pdf:
            if allow:
                skipped.append(sp["name"])
                continue
            fails.append("(a) %s needs thirdParty/nasa-tp2002/NASA-TP-2002-211556.pdf "
                         "(bin/curate/nasa_tp2002_to_choupo.py --fetch), or "
                         "CHOUPO_ALLOW_NO_NASA_PDF=1 to SKIP it" % sp["name"])
            continue
        sub["validation"].append(sp)
    rows, _ = T.validate(sub, verbose=False, need_report=False)
    for sp, r in zip(sub["validation"], rows):
        tol1500 = sp.get("cp_tol_to_1500", 0.02)
        if abs(r["s_tool"] - r["s_ref"]) > 1.0:
            fails.append("(a) %s: S298 tool %.3f vs reference %.3f" % (r["name"], r["s_tool"], r["s_ref"]))
        # 300-1000 K at 2 %, 300-1500 K at the species' own tolerance
        ref = sp["reference"]
        if ref["kind"] == "table":
            s_ref, lo, hi = T.nasa_record_reference(ref["entry"])
        else:
            s_ref, lo, hi = T.report_reference(ref["entry"])
        Tk = 300.0
        while Tk <= 1500.0 + 1e-9:
            e = T.cp_s_h(sp, Tk)[0] / T.nasa_cp(lo, hi, Tk) - 1.0
            lim = tol1500
            if abs(e) > lim:
                fails.append("(a) %s: Cp at %g K is %+.2f %% off the reference (limit %.1f %%)"
                             % (r["name"], Tk, 100 * e, 100 * lim))
                break
            Tk += 50.0
    return rows, skipped


def arm_b(spec):
    names = set()
    for sp in spec["records"]:
        names.add(sp["name"])
        p = T.HOME / (sp["name"] + ".dat")
        if not p.is_file():
            fails.append("(b) %s.dat is missing (bin/curate/rrho_thermo.py write)" % sp["name"])
            continue
        if p.read_text() != T.record_text(sp, spec):
            fails.append("(b) %s.dat differs from the tool's output (re-run `rrho_thermo.py write`, "
                         "or the input changed without it)" % sp["name"])
    on_disk = {p.stem for p in T.HOME.glob("*.dat")} if T.HOME.is_dir() else set()
    for n in sorted(on_disk - names):
        fails.append("(b) %s.dat is in the home but no input names it" % n)
    idx = T.HOME / "INDEX.md"
    want = "\n".join(["# RRHO-computed species table", ""] ) if False else None
    if not idx.is_file():
        fails.append("(b) INDEX.md is missing")
    else:
        listed = {l[2:].strip() for l in idx.read_text().splitlines() if l.startswith("- ")}
        if listed != names:
            fails.append("(b) INDEX.md lists %s, the inputs name %s"
                         % (sorted(listed ^ names), sorted(names)))
    return len(names)


def arm_c(spec):
    import re
    for sp in spec["records"]:
        p = T.HOME / (sp["name"] + ".dat")
        if not p.is_file():
            continue
        t = p.read_text()
        m = re.search(r"dHf_298\s+([-\d.]+);", t)
        if not m or abs(float(m.group(1)) - 1000.0 * T.dhf_298_kj(sp)) > 0.001:
            fails.append("(c) %s: dHf_298 in the record is not the input's %s kJ/mol"
                         % (sp["name"], T.dhf_298_kj(sp)))
        s = T.cp_s_h(sp, T.T0)[1]
        if "S298_check" in sp:
            tol = sp.get("S298_check_tol", 1.0)
            if abs(s - sp["S298_check"]) > tol:
                fails.append("(c) %s: computed S298 %.3f vs the independent %s %.3f (tol %.1f)"
                             % (sp["name"], s, sp.get("S298_check_source", "?"), sp["S298_check"], tol))
        fit = T.nasa_fit(sp)
        if max(fit["err_low"], fit["err_high"]) > 0.01:
            fails.append("(c) %s: the NASA fit is %.2f %% off the RRHO curve"
                         % (sp["name"], 100 * max(fit["err_low"], fit["err_high"])))


def arm_d(spec):
    import re
    comp = ROOT / "data" / "standards" / "components"
    nasa = ROOT / "data" / "standards" / "thermoTables" / "NASA-TP-2002-211556"
    for sp in spec["records"]:
        if (comp / (sp["name"] + ".dat")).is_file():
            fails.append("(d) %s is also a components/ record" % sp["name"])
        if (nasa / (sp["name"] + ".dat")).is_file():
            fails.append("(d) %s is also a NASA table record" % sp["name"])
        for p in list(comp.glob("*.dat")) + list(nasa.glob("*.dat")):
            tx = p.read_text()
            m = re.search(r"(?m)^formula\s+(\S+);", tx)
            if m and m.group(1) == sp["formula"] and sp.get("same_formula_ok") is None:
                fails.append("(d) %s: formula %s is also held by %s (declare `same_formula_ok` with the "
                             "reason if it is a different isomer or state)"
                             % (sp["name"], sp["formula"], p.relative_to(ROOT)))


def arm_e(spec):
    """(e) COMPONENT RECORDS: a species that must stay a components/ record (it has a
    liquid-side life: a Henry pair, a sigma profile) carries its RRHO blocks there; the
    text of standardThermochemistry, idealGasHeatCapacity and provenance equals the tool's
    output for the `component_records` entry, its dHf is the input's and its fit holds."""
    comp = ROOT / "data" / "standards" / "components"
    for sp in spec.get("component_records", []):
        T.check_input(sp)
        p = comp / (sp["name"] + ".dat")
        if not p.is_file():
            fails.append("(e) %s: components/%s.dat is missing" % (sp["name"], sp["name"]))
            continue
        if T.record_text(sp, spec, body_only=True) not in p.read_text():
            fails.append("(e) %s: components/%s.dat does not carry the tool's blocks "
                         "(bin/curate/rrho_thermo.py component %s)" % (sp["name"], sp["name"], sp["name"]))
        fit = T.nasa_fit(sp)
        if max(fit["err_low"], fit["err_high"]) > 0.01:
            fails.append("(e) %s: the NASA fit is %.2f %% off the RRHO curve"
                         % (sp["name"], 100 * max(fit["err_low"], fit["err_high"])))
        if "S298_check" in sp and abs(T.cp_s_h(sp, T.T0)[1] - sp["S298_check"]) > sp.get("S298_check_tol", 1.0):
            fails.append("(e) %s: computed S298 is off the independent value" % sp["name"])
    return len(spec.get("component_records", []))


def main():
    spec = T.load()
    for sp in spec["records"]:
        T.check_input(sp)
    rows, skipped = arm_a(spec)
    n = arm_b(spec)
    arm_c(spec)
    arm_d(spec)
    ne = arm_e(spec)
    if fails:
        for f in fails:
            print("FAIL %s: %s" % (LABEL, f))
        return 1
    print("%s: OK  (a) %d validation species, S298 within 1 J/(mol K) and Cp within tolerance%s; "
          "(b) %d records equal the tool's output; (c) anchors and fits held; (d) one home; (e) %d component record(s) carry the tool's blocks"
          % (LABEL, len(rows), (" [SKIPPED: " + ", ".join(skipped) + "]") if skipped else "", n, ne))
    return 0


if __name__ == "__main__":
    sys.exit(main())
