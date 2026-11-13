#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the membrane SHORTLIST filters hard, re-rates at the student's
conditions, shows every criterion side by side, and has NO score, NO rank and
no reader of who is paid.
    bin/curate/check_membrane_shortlist.py

WHY THIS EXISTS (DEV.md 4c C189 slice 5).  From a functional class a student
asks "which commercial elements do this, at MY pressure, MY feed, MY
recovery?".  The `membraneShortlist` props op (src/propertyOps/
MembraneShortlist.{H,cpp}) answers with a table.  What would make the table
untrustworthy is not a wrong number but a hidden choice: a default score, a
weight nobody declared, a position bought by a manufacturer.  Each of those
is held here.

WHAT THIS GATE CHECKS (a HYPOTHETICAL catalogue is built in a temporary case,
never in data/standards: eight records made from NF270-4040's hardware, each
varied in ONE respect and labelled as a gate fixture):
  (a) THE HARD FILTERS, each by the record's own numbers: a membrane of the
      other type (RO), a rated rejection outside the class band, a record
      with no test of the solute, a feed pressure over P_max -- all
      EXCLUDED with the reason named; a feedFlow_max or dP_max that only the
      re-rated run exceeds is EXCLUDED too, WITH its numbers.
  (b) THE RE-RATING.  Each passing candidate is re-run at the STUDENT's
      conditions (not the sheet's): the printed recovery equals the asked
      one to 1e-8, and an INDEPENDENT choupoSolve run of the same module
      (one element, constantRejection with the printed R_int TYPED, the
      printed feed flow) reproduces the printed permeate flow and observed
      rejection to 1e-6.  The two modules differ in their sheet's rejection,
      so their derived R_int and their permeate concentration differ.
  (c) SIDE BY SIDE, NO RANK.  The CSV carries every criterion for every
      candidate; the rows are in ALPHABETICAL order of the module name; a
      fixture whose best performer is alphabetically last (and another whose
      name is first) shows the position follows the NAME and not any
      criterion.  The op source carries no sort, no score, no weight, no
      rank (comments stripped).
  (d) THE COMMERCIAL RELATION IS NEVER READ.  Adding a `partner { ... }`
      block and `dataVerifiedBy` to every record, or to one only, leaves the
      op's stdout and CSV BYTE-IDENTICAL; a SOURCE arm requires that neither
      word appears in the shortlist's source or in the module reader/registry
      the ranking reads.
  (e) THE REFUSALS, by name: a commercial module named as the class; a class
      that does not rate the solute; a missing conditions key; an unknown
      pressureBasis; an unknown tier word.
  (f) THE TIERS (the data/local decision).  With a temporary data root
      (standards symlinked, one record in data/local/assets): the local
      record is a candidate when the tier is asked for and announced
      `[local] ... UNVERIFIED`; it is absent when `tiers ( standards case )`
      is declared; a local record sharing a standards name is SHADOWED
      (announced) and the standards record's numbers are used.
  (g) THE WITNESS tutorials/props/membrane/shortlist01_class_to_modules
      runs: NF270-4040 passes, SW30HR-380 is excluded as RO, and the
      Generic-* elements as carrying no rated test.

WHAT THIS GATE DOES **NOT** COVER.  Whether the transport law's reading of a
data sheet at another pressure is right (it is the constantRejection law with
an intrinsic rejection fixed at the sheet's one test -- a model, said so);
whether any record is true of its product; multi-solute or multi-element
comparisons (one solute, one element).

SABOTAGE-VERIFIED: see the record docs/design/a-shortlist-has-no-score.md
section "Sabotages" (edits BY HAND, rebuilt where C++ moved, run, restored; the
gate never patches a source).
"""
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"
WITNESS = ROOT / "tutorials/props/membrane/shortlist01_class_to_modules"
M25 = ROOT / "tutorials/steady/membranes/membrane25_rated_test_inversion_nf270_4040"
SRC_OP = [ROOT / "src/propertyOps/MembraneShortlist.cpp", ROOT / "src/propertyOps/MembraneShortlist.H"]
SRC_READ = [ROOT / "src/thermo/membrane/MembraneModule.cpp", ROOT / "src/thermo/membrane/MembraneModule.H",
            ROOT / "src/thermo/membrane/MembraneModuleRegistry.cpp",
            ROOT / "src/thermo/membrane/MembraneModuleRegistry.H",
            ROOT / "src/unitOperations/membrane/RatedTestInversion.cpp",
            ROOT / "src/unitOperations/membrane/RatedTestInversion.H"]

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


def strip_cpp(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def copy_case(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "propertyManifest",
        "postProcessing", "shortlist.csv"))


def run_props(case, home=None):
    env = dict(os.environ, CHOUPO_HOME=str(home or ROOT))
    r = subprocess.run([str(PROPS), str(case)], capture_output=True, text=True,
                       timeout=900, env=env, cwd=str(case))
    return r.returncode, r.stdout, r.stderr


def read_csv(case):
    p = case / "shortlist.csv"
    if not p.exists():
        return None
    with p.open() as f:
        return list(csv.DictReader(f))


def num(x):
    return float(x) if x not in ("", None) else None


# ----------------------------------------------------------------------------
#  The hypothetical catalogue: NF270-4040's hardware, varied in ONE respect.
# ----------------------------------------------------------------------------
BASE = (ROOT / "data/standards/assets/NF270-4040.dat").read_text()
RATED = re.compile(r"\nratedTest\s*\{[^}]*\}")
LIMITS = re.compile(r"\nlimits\s*\{[^}]*\}")


def record(name, rejection=0.97, solute="MgSO4", membrane="NF270",
           limits=None, partner=False):
    s = BASE
    s = re.sub(r"\nname\s+NF270-4040;", "\nname           %s;" % name, s, count=1)
    s = re.sub(r"\nmembrane\s+NF270;", "\nmembrane       %s;" % membrane, s, count=1)
    s = re.sub(r"\nmanufacturer\s+\"[^\"]*\";", "\nmanufacturer   \"GATE FIXTURE\";", s, count=1)
    rated = ("\nratedTest\n{\n    solute %s;\n    feedMassFraction 2.0e-3;\n    P 4.8 bar;\n"
             "    pressureBasis feedGauge;\n    T 298.15 K;\n    recovery 0.15;\n"
             "    permeateFlow 9.5 m3/d;\n    rejection %g;\n}" % (solute, rejection))
    s = RATED.sub(rated, s, count=1)
    if limits is not None:
        s = LIMITS.sub("\nlimits\n{\n%s}" % "".join("    %s;\n" % l for l in limits), s, count=1)
    if partner:
        s += ("\npartner { name \"Gate Fixture Sponsor\"; sponsored true; logo \"x.svg\"; }\n"
              "dataVerifiedBy \"Gate Fixture Sponsor\";\n")
    return ("// GATE FIXTURE (bin/curate/check_membrane_shortlist.py): a HYPOTHETICAL module\n"
            "// built in a temporary directory -- no manufacturer published it.\n") + s


#  name -> kwargs.  Alphabetical order is deliberate in two places: Hyp-A is
#  the WEAKEST passing candidate (lowest rejection) and sits first; Hyp-Z is
#  the best (highest rejection) and sits last -- position follows the name.
FIX = {
    "Hyp-A": dict(rejection=0.92),                                   # passes
    "Hyp-B": dict(rejection=0.96),                                   # passes
    "Hyp-C": dict(rejection=0.80),                                   # outside the class band
    "Hyp-D": dict(limits=["P_max 5 bar", "T_max 318.15 K"]),         # 7 bar > P_max
    "Hyp-E": dict(membrane="SW30HR"),                                # an RO membrane
    "Hyp-F": dict(solute="NaCl", rejection=0.97),                    # no MgSO4 test (and NaCl outside its band)
    "Hyp-G": dict(limits=["feedFlow_max 0.5 m3/h"]),                 # only the re-rated run exceeds it
    "Hyp-H": dict(limits=["dP_max 1e-4 bar"]),                       # likewise
    "Hyp-Z": dict(rejection=0.99),                                   # passes, best, alphabetically last
}


def build(tmp, label, fix=None, partner=(), tiers="( standards case )", edits=()):
    d = tmp / label
    copy_case(WITNESS, d)
    (d / "constant/assets").mkdir(parents=True, exist_ok=True)
    for n, kw in (fix if fix is not None else FIX).items():
        (d / "constant/assets" / (n + ".dat")).write_text(record(n, partner=(n in partner), **kw))
    p = d / "system/propsDict"
    t = p.read_text()
    t = re.sub(r"tiers\s+\([^)]*\);", "tiers %s;" % tiers, t, count=1)
    for old, new in edits:
        t2 = t.replace(old, new, 1)
        if t2 == t:
            raise RuntimeError("fixture edit did not apply: %r" % old)
        t = t2
    p.write_text(t)
    return d


def main():
    if not PROPS.exists() or not SOLVE.exists():
        print("check_membrane_shortlist: COULD NOT RUN -- no choupoProps/choupoSolve (make all)")
        return 1
    tmp = Path(tempfile.mkdtemp(prefix="check_membrane_shortlist_"))
    try:
        # ---- (a) the hard filters ------------------------------------------
        base = build(tmp, "base")
        rc, so, se = run_props(base)
        rows = read_csv(base)
        if rc != 0 or rows is None:
            fail("(a) the fixture catalogue did not run (exit %d):\n%s" % (rc, (so + se)[-900:]))
            return finish(tmp)
        by = {r["module"]: r for r in rows}
        want_pass = {"Hyp-A", "Hyp-B", "Hyp-Z", "NF270-4040"}
        got_pass = {n for n, r in by.items() if r["status"] == "pass"}
        if got_pass != want_pass:
            fail("(a) passing set is %s, expected %s" % (sorted(got_pass), sorted(want_pass)))
        must = {
            "Hyp-C": ["MgSO4 rated 80 %", "outside the class band"],
            "Hyp-D": ["P_max"],
            "Hyp-E": ["is RO", "the class is NF"],
            "Hyp-F": ["no rated test of MgSO4"],
            "Hyp-G": ["feedFlow_max"],
            "Hyp-H": ["dP_max"],
            "SW30HR-380": ["is RO", "no rated test of MgSO4"],
            "Generic-4040": ["no rated test of MgSO4"],
        }
        for n, subs in must.items():
            r = by.get(n)
            if r is None:
                fail("(a) %s is not listed at all" % n)
                continue
            if r["status"] != "excluded":
                fail("(a) %s is %s, expected excluded" % (n, r["status"]))
                continue
            for sub in subs:
                if sub not in r["reason"]:
                    fail("(a) %s: reason lacks %r: %r" % (n, sub, r["reason"]))
        for n in ("Hyp-G", "Hyp-H"):
            if n in by and num(by[n]["permeateFlow_m3d"]) is None:
                fail("(a) %s is excluded by a limit only the re-rated run exceeds, "
                     "and must still show its numbers" % n)
        for n in ("Hyp-C", "Hyp-D", "Hyp-E", "Hyp-F"):
            if n in by and num(by[n]["permeateFlow_m3d"]) is not None:
                fail("(a) %s is excluded on its record alone and must not be re-rated" % n)
        print("  (a) %d candidates: pass %s; excluded %s" % (
            len(rows), sorted(got_pass), sorted(set(by) - got_pass)))

        # ---- (b) the re-rating, against an independent run ------------------
        P_bar, rec_target, w = 7.0, 0.15, 2.0e-3
        for n in sorted(want_pass):
            r = by.get(n)
            if r is None:
                continue
            if abs(num(r["recovery"]) - rec_target) > 1e-8:
                fail("(b) %s: recovery %s is not the asked %g" % (n, r["recovery"], rec_target))
            if abs(num(r["R_obs"]) - (1.0 - num(r["permeateConc_ppm"]) * 1e-6 / w)) > 1e-9:
                fail("(b) %s: permeate concentration is not (1 - R_obs) x feed" % n)
        distinct = {round(num(by[n]["R_int"]), 6) for n in ("Hyp-A", "Hyp-B", "Hyp-Z") if n in by}
        if len(distinct) != 3:
            fail("(b) the three fixtures' derived R_int should differ: %s" % sorted(distinct))
        for n in ("Hyp-B", "NF270-4040"):
            r = by.get(n)
            if r is None:
                continue
            ok = independent(tmp, n, r, P_bar, w)
            if ok:
                print("  (b) %s: recovery %.4f; independent run reproduces permeate %.6g m3/d, "
                      "R_obs %.6f" % (n, num(r["recovery"]), num(r["permeateFlow_m3d"]), num(r["R_obs"])))

        # ---- (c) side by side, no rank --------------------------------------
        names = [r["module"] for r in rows]
        if names != sorted(names):
            fail("(c) rows are not in alphabetical order of the module name: %s" % names)
        passing = [r for r in rows if r["status"] == "pass"]
        by_perm = sorted(passing, key=lambda r: -num(r["permeateFlow_m3d"]))
        by_rej = sorted(passing, key=lambda r: -num(r["R_obs"]))
        if [r["module"] for r in passing] in ([r["module"] for r in by_perm], [r["module"] for r in by_rej]):
            fail("(c) the fixture does not discriminate: the name order equals a criterion order")
        if passing[-1]["module"] != "Hyp-Z" and by_rej[0]["module"] != "Hyp-Z":
            fail("(c) fixture sanity: Hyp-Z should be the best-rejecting candidate")
        cols = ("R_int", "A_w_LMH_per_bar", "R_obs", "recovery", "permeateFlow_m3d", "feedFlow_m3h", "flux_LMH",
                "permeateConc_ppm", "dP_bar", "specificPressure_bar_per_LMH",
                "specificEnergy_kWh_m3", "margin_P", "margin_T", "margin_dP", "margin_feedFlow", "margin_pH")
        for r in passing:
            for c in cols[:11]:
                if num(r.get(c)) is None:
                    fail("(c) %s: the criterion %s is missing from the side-by-side table" % (r["module"], c))
        #  comments AND string literals stripped: the op PRINTS "no score, no
        #  weight, no rank", and the words are only a ranking device in code
        stripped = "\n".join(re.sub(r'"(?:\\.|[^"\\])*"', '""', strip_cpp(p.read_text())) for p in SRC_OP)
        for bad in (r"\bstd::sort\b", r"\bstable_sort\b", r"\bmax_element\b", r"\bmin_element\b",
                    r"\bscore\b", r"\bweight(s|ed)?\b", r"\brank(ing|ed)?\b", r"\bpriority\b"):
            m = re.search(bad, stripped, re.I)
            if m:
                fail("(c) the shortlist source (comments stripped) contains %r -- a ranking device" % m.group(0))
        print("  (c) rows alphabetical (%s ... %s); name order differs from the permeate order (%s) and "
              "the rejection order (%s); source carries no sort/score/weight/rank"
              % (names[0], names[-1], [r["module"] for r in by_perm], [r["module"] for r in by_rej]))

        # ---- (d) the commercial relation is never read -----------------------
        for p in SRC_OP + SRC_READ:
            t = strip_cpp(p.read_text())
            for word in ("partner", "dataVerifiedBy", "sponsor"):
                if re.search(r"\b%s\b" % word, t, re.I):
                    fail("(d) %s mentions %r -- the ranking path must not read who pays" % (p.name, word))
        pa = build(tmp, "partner_all", partner=set(FIX))
        pb = build(tmp, "partner_one", partner={"Hyp-Z"})
        out0 = so
        for lbl, d in (("every record", pa), ("one record", pb)):
            rc2, so2, se2 = run_props(d)
            r2 = read_csv(d)
            if rc2 != 0:
                fail("(d) partner on %s: did not run:\n%s" % (lbl, (so2 + se2)[-500:]))
                continue
            if (d / "shortlist.csv").read_bytes() != (base / "shortlist.csv").read_bytes():
                fail("(d) partner on %s: the CSV is not byte-identical" % lbl)
            if norm(so2, d) != norm(out0, base):
                fail("(d) partner on %s: the printed table differs" % lbl)
        print("  (d) partner/dataVerifiedBy on every record or one: CSV and printed table byte-identical; "
              "source reads neither word")

        # ---- (e) the refusals --------------------------------------------------
        refuse(tmp, "module-as-class", [("class     NF_DIVALENT_SELECTIVE;", "class     NF270-4040;")],
               ["not a functional class"])
        refuse(tmp, "unrated-solute", [("class     NF_DIVALENT_SELECTIVE;", "class     NF_OPEN;")],
               ["does not rate MgSO4"])
        refuse(tmp, "no-recovery", [("            recovery         0.15;           // per element\n", "")],
               ["declares no `recovery`"])
        refuse(tmp, "bad-basis", [("pressureBasis    feedAbsolute;", "pressureBasis    psig;")],
               ["pressureBasis psig"])
        refuse(tmp, "bad-tier", [("tiers ( standards case )", "tiers ( standards cloud )")],
               ["not 'cloud'"], tiers_edit=False)

        # ---- (f) the tiers ------------------------------------------------------
        tiers_arm(tmp, by)

        # ---- (g) the witness ----------------------------------------------------
        wd = tmp / "witness"
        copy_case(WITNESS, wd)
        rc, so, se = run_props(wd)
        wr = read_csv(wd)
        if rc != 0 or wr is None:
            fail("(g) the witness did not run (exit %d):\n%s" % (rc, (so + se)[-700:]))
        else:
            wb = {r["module"]: r for r in wr}
            if wb.get("NF270-4040", {}).get("status") != "pass":
                fail("(g) the witness: NF270-4040 should pass")
            if "is RO" not in wb.get("SW30HR-380", {}).get("reason", ""):
                fail("(g) the witness: SW30HR-380 should be excluded as RO")
            if "no rated test of MgSO4" not in wb.get("Generic-4040", {}).get("reason", ""):
                fail("(g) the witness: Generic-4040 should carry no MgSO4 test")
            print("  (g) witness: %s" % "; ".join("%s %s" % (n, r["status"]) for n, r in wb.items()))
    finally:
        pass
    return finish(tmp)


def finish(tmp):
    shutil.rmtree(tmp, ignore_errors=True)
    if fails:
        print("check_membrane_shortlist: FAILED (%d)" % len(fails))
        return 1
    print("check_membrane_shortlist: OK -- the shortlist applies its hard filters by each record's own numbers "
          "(type, class band, rated solute, P_max, and after the re-rating feedFlow_max and dP_max), re-rates every "
          "survivor at the student's conditions (recovery exact to 1e-8; an independent choupoSolve run of the "
          "printed R_int and feed flow reproduces the permeate and observed rejection to 1e-6), lists every "
          "criterion side by side in alphabetical order of the name with no sort, score, weight or rank, never reads "
          "a record's partner/dataVerifiedBy (CSV and table byte-identical with or without), refuses a "
          "mis-declared request by name, and reads data/local only as the lowest, announced tier.  NOT CHECKED: "
          "the transport law's reading of a sheet away from its test, any record against its product, "
          "several solutes or elements at once.")
    return 0


def norm(out, case):
    return out.replace(str(case), "<case>")


def refuse(tmp, label, edits, must, tiers_edit=True):
    d = build(tmp, "refuse_" + label, edits=edits if tiers_edit else ())
    if not tiers_edit:
        p = d / "system/propsDict"
        t = p.read_text()
        for old, new in edits:
            t = t.replace(old, new) if old in t else re.sub(r"tiers\s+\([^)]*\);", "tiers ( standards cloud );", t, count=1)
        p.write_text(t)
    rc, so, se = run_props(d)
    out = so + se
    if rc == 0:
        fail("(e) %s: ran to exit 0 -- no refusal" % label)
        return
    for m in must:
        if m not in out:
            fail("(e) %s: exit %d but the message lacks %r:\n%s" % (label, rc, m, out[-500:]))
            return
    print("  (e) %s: refused (exit %d)" % (label, rc))


def independent(tmp, name, row, P_bar, w):
    """The printed numbers, reproduced by choupoSolve on the same module with
    the printed R_int TYPED and the printed feed flow: nothing is derived."""
    d = tmp / ("indep_" + name)
    copy_case(M25, d)
    (d / "constant/assets").mkdir(parents=True, exist_ok=True)
    src = (tmp / "base/constant/assets" / (name + ".dat")) if name != "NF270-4040" \
        else (ROOT / "data/standards/assets/NF270-4040.dat")
    rec = re.sub(r"\nmembrane\s+\w+;", "\nmembrane       IND_MEM;", src.read_text(), count=1)
    (d / "constant/assets" / (name + ".dat")).write_text(rec)
    #  the water permeance the shortlist DERIVED, typed on a plain membrane record
    (d / "constant/assets/IND_MEM.dat").write_text(
        "name IND_MEM;\nkind NF;\nA_w %.15g m/s/bar;\n" % (num(row["A_w_LMH_per_bar"]) / 3.6e6))
    p = d / "system/flowsheetDict"
    t = p.read_text()
    t = t.replace("module           NF270-4040;     // data/standards/assets/, its ratedTest {} is inverted",
                  "module           %s;" % name, 1)
    t = re.sub(r"rejection \{ MgSO4 fromRatedTest; \}", "rejection { MgSO4 %.15g; }" % num(row["R_int"]), t, count=1)
    t = re.sub(r"source    \"DERIVED[^\"]*\";", "source    \"gate: the shortlist's printed R_int, typed\";", t, count=1)
    p.write_text(t)
    Q = num(row["feedFlow_m3h"])                      # m3/h
    mw = {"water": 18.01528, "MgSO4": 120.3676}
    def mwof(c):
        tx = (ROOT / "data/standards/components" / (c + ".dat")).read_text()
        return float(re.search(r"^\s*MW\s+([0-9.eE+-]+)\s*;", tx, re.M).group(1))
    mW, mS = mwof("water"), mwof("MgSO4")
    kg = Q * 1000.0
    (d / "0/feedDerived").write_text(
        "componentMolarFlows\n{\n    water   %.15g kmol/h;\n    MgSO4   %.15g kmol/h;\n}\n"
        "T 298.15 K;\nP %.10g bar;\n" % (kg * (1 - w) / mW, kg * w / mS, P_bar))
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(SOLVE), str(d)], capture_output=True, text=True, timeout=900, env=env, cwd=str(d))
    if r.returncode != 0 or "<<<Choupo:result-begin>>>" not in r.stdout:
        fail("(b) %s: the independent run did not execute (exit %d):\n%s" % (name, r.returncode, (r.stdout + r.stderr)[-600:]))
        return False
    js = json.loads(r.stdout.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0])
    k = js["kpis"]["NFderived"]
    area = 7.6
    perm = k["J_w_avg"] * area * 86400.0
    ok = True
    if abs(perm - num(row["permeateFlow_m3d"])) > 1e-6 * perm:
        fail("(b) %s: independent permeate %.8g m3/d vs shortlist %.8g" % (name, perm, num(row["permeateFlow_m3d"])))
        ok = False
    if abs(k["R_obs_MgSO4"] - num(row["R_obs"])) > 1e-6:
        fail("(b) %s: independent R_obs %.8g vs shortlist %.8g" % (name, k["R_obs_MgSO4"], num(row["R_obs"])))
        ok = False
    return ok


def tiers_arm(tmp, base_by):
    home = tmp / "home"
    (home / "data/local/assets").mkdir(parents=True)
    (home / "data").mkdir(exist_ok=True)
    (home / "data/standards").symlink_to(ROOT / "data/standards")
    rec = record("Hyp-Local", rejection=0.95)
    (home / "data/local/assets/Hyp-Local.dat").write_text(rec)
    #  a local record that shares a STANDARDS name: NF270-4040 with a different rejection
    shadow = record("NF270-4040", rejection=0.93)
    (home / "data/local/assets/NF270-4040.dat").write_text(shadow)
    d = build(tmp, "tiers_all", fix={}, tiers="( standards case local )")
    rc, so, se = run_props(d, home=home)
    if rc != 0:
        fail("(f) the local-tier run did not execute (exit %d):\n%s" % (rc, (so + se)[-700:]))
        return
    rows = {r["module"]: r for r in (read_csv(d) or [])}
    if rows.get("Hyp-Local", {}).get("status") != "pass":
        fail("(f) the data/local record is not a candidate when `local` is among the tiers")
    if "[local] membrane module 'Hyp-Local'" not in se:
        fail("(f) no `[local] ... UNVERIFIED` announcement for the local record")
    if "UNVERIFIED" not in se:
        fail("(f) the announcement does not say UNVERIFIED")
    if "[shadowed] membrane module 'NF270-4040'" not in se:
        fail("(f) no `[shadowed]` announcement for the local record sharing a standards name")
    nf = rows.get("NF270-4040")
    d2 = build(tmp, "tiers_std", fix={}, tiers="( standards case )")
    rc2, so2, se2 = run_props(d2, home=home)
    rows2 = {r["module"]: r for r in (read_csv(d2) or [])}
    if "Hyp-Local" in rows2:
        fail("(f) a data/local record is listed although `tiers ( standards case )`")
    #  the data root WITHOUT any local tier gave NF270-4040 its R_int (the
    #  sheet's 0.97); the shadowing copy says 0.93 -- the standards record's
    #  number must be the one used when a local one shares its name
    if nf is None or nf["R_int"] != base_by["NF270-4040"]["R_int"]:
        fail("(f) the standards NF270-4040 record was not the one used (shadow lost): R_int %s vs %s"
             % (None if nf is None else nf["R_int"], base_by["NF270-4040"]["R_int"]))
    print("  (f) tiers: local record listed and announced [local] UNVERIFIED; absent under "
          "`tiers ( standards case )`; a same-name local record is [shadowed] by the standards one")


if __name__ == "__main__":
    sys.exit(main())
