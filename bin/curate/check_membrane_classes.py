#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a membrane a student chooses by WHAT IT DOES -- the six functional
classes are illustrative records, said so on every run, and their intrinsic
rejections are DERIVED from the observed ones they state.
    bin/curate/check_membrane_classes.py

WHY THIS EXISTS (DEV.md 4c C189 slice 3).  A student designing a sulphate
removal does not yet know which product to buy; he knows what the membrane
must DO.  Six records of `kind membraneClass` in data/standards/assets/
(NF_OPEN, NF_DIVALENT_SELECTIVE, NF_TIGHT, BWRO_HIGH_FLUX,
BWRO_HIGH_REJECTION, SWRO) carry, each, an OBSERVED rejection per salt at
the class's own reference test, a water permeance and the generic element
they are deployed in (by reference).  They are ILLUSTRATIVE teaching
assumptions, not measurements, and must never look like a product.  The
intrinsic rejection `constantRejection` needs is DERIVED by slice 1's
inversion (`fromRatedTest`), never typed.  Every one of those claims is held
here.

WHAT THIS GATE CHECKS.
  (a) THE RECORDS, read by this gate's own parser (never through the
      engine): exactly the six names carry `kind membraneClass`; each
      declares `reviewStatus illustrative;`, a membraneType NF|RO, an
      `element Generic-*`, a description and an application; NO
      `manufacturer`/`model` key and no known manufacturer's name anywhere
      in the file; one `typical` reference test per salt with every
      optional fact declared; a band per rated salt with the stated value
      INSIDE it.
  (b) THE ANNOUNCEMENT.  Each class is run through the engine (a probe
      built from the witness, the class's rated salts declared
      `fromRatedTest`): exit 0, an `[illustrative] module '<class>'` line on
      stdout AND on stderr, an ACCEPTED provenance advisory saying "FUNCTIONAL
      CLASS", and a derived R_int per rated salt above its stated observed
      rejection (the wall is richer than the feed).
  (c) THE ROUND TRIP, per class and per rated salt: an INDEPENDENT fixture
      -- a case-local NON-class membrane record carrying the class's A_w, on
      the class's element (`module Generic-4040; membrane <it>;`), fed the
      reference test exactly as the probe builds it (water + the salt at the
      stated mass fraction, rho 1000, permeateFlow / recovery, the gauge
      pressure + the standard atmosphere), with the derived R_int TYPED --
      must reproduce the class's stated observed rejection to 1e-7.
  (d) THE REFUSALS, built in a temp dir: an unknown class name (the message
      lists the registered names, the six among them); a class under
      `transport SDEM;` and under the default solutionDiffusion (the
      message names `constantRejection`); a number typed for a rated salt;
      a class named as a bare `membrane` beside a generic element; a
      case-local class carrying `manufacturer`; a case-local class with
      `reviewStatus reviewed;`.
  (e) THE WITNESS membrane26_class_sulphate_removal runs, announces its
      class and derives both R_int (its golden pins the numbers).

WHAT THIS GATE DOES **NOT** COVER.  Whether a class's values are GOOD
teaching values (they are a curator's choice at the middle of a screening
window, said so in each record); the engine's permeate at the reference test
against the class's stated permeate (printed in (b), not asserted -- the
same posture as check_membrane_modules (f)); the batch diafilter, which
reads membranes by name and does not refuse a class (an open item); the
shortlist from a class to products (check_membrane_shortlist.py).

SABOTAGE-VERIFIED 2026-10-31 (edits BY HAND, rebuilt where C++ moved, run,
restored; the gate never patches a source):
  S1  SpiralWoundModule.cpp: the `[illustrative]` stdout/stderr/advisory
      lines replaced by `(void)msg;`.  CAUGHT, 19 findings: (b) three per
      class ("NF_OPEN: no [illustrative] line on stdout", "... on stderr",
      "... no accepted provenance advisory saying FUNCTIONAL CLASS") and (e)
      "the witness does not announce its class".
  S2  SpiralWoundModule.cpp: the transport-law refusal disabled (`if (false
      && ...)`).  CAUGHT by (d) ONLY, 2 findings: "SDEM: exit 2 but the
      message lacks 'constantRejection'" (the SDEM law then refuses for its
      own reason: "solute 'NaCl' declares no aqueous bridge") and
      "solutionDiffusion: the probe ran to exit 0 -- no refusal" (a class
      carries no B_s, read as perfect rejection, at exit 0).  The first
      draft's must-string 'functional class' was satisfied by the `[spec]`
      line ("functional class on Generic-4040") -- the musts now quote the
      refusal's own clause.
  S3  data/standards/assets/NF_TIGHT.dat: `rejection 0.7;` -> `0.95;`
      (outside its band).  CAUGHT twice over, 16 findings: (a) "NF_TIGHT:
      NaCl rejection 0.95 outside its band [0.5, 0.9]" from this gate's own
      parser, and the ENGINE refuses the record at load ("the NaCl
      reference rejection 0.950000 lies outside its band [0.500000,
      0.900000]"), so every probe in (b)-(e) reports "did not run".
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"
ASSETS = ROOT / "data/standards/assets"
WITNESS = ROOT / "tutorials/steady/membranes/membrane26_class_sulphate_removal"
CLASSES = ("NF_OPEN", "NF_DIVALENT_SELECTIVE", "NF_TIGHT",
           "BWRO_HIGH_FLUX", "BWRO_HIGH_REJECTION", "SWRO")
ATM_BAR = 1.01325
#  Names that must never appear in a class record (a class is not a product).
MAKERS = ("DuPont", "FilmTec", "Dow", "Toray", "Hydranautics", "Nitto",
          "LG Chem", "Suez", "Koch", "Synder", "Lanxess", "Vontron", "Microdyn",
          "Alfa Laval", "Pentair", "Applied Membranes", "Sterlitech", "Trisep",
          "Lewabrane", "Osmonics", "GE ")

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def word(body, key):
    m = re.search(r"^\s*%s\s+(\"[^\"]*\"|[^;\"\n]+?)\s*;" % key, body, re.M)
    return m.group(1).strip('"') if m else None


def mw(comp):
    t = strip_comments((ROOT / "data/standards/components" / (comp + ".dat")).read_text())
    return float(re.search(r"^MW\s+([0-9.eE+-]+)\s*;", t, re.M).group(1))


def parse_class(path):
    raw = path.read_text()
    t = strip_comments(raw)
    rec = {k: word(t, k) for k in ("name", "kind", "membraneType", "reviewStatus",
                                   "description", "application", "element",
                                   "manufacturer", "model", "modelNumber")}
    m = re.search(r"^A_w\s+([0-9.eE+-]+)\s+m/s/bar\s*;", t, re.M)
    rec["A_w"] = m.group(1) if m else None
    tests = []
    lm = re.search(r"ratedTests\s*\((.*?)\n\);", t, re.S)
    if lm:
        for blk in re.findall(r"\{(.*?)\}", lm.group(1), re.S):
            d = {}
            for k in ("id", "solute", "feedMassFraction", "P", "pressureBasis", "T",
                      "recovery", "permeateFlow", "permeateFlowBasis", "rejection",
                      "rejectionValueType", "source"):
                d[k] = word(blk, k)
            tests.append(d)
    rec["tests"] = tests
    bands = {}
    bm = re.search(r"bands\s*\{(.*?)\n\}", t, re.S)
    if bm:
        for s, lo, hi in re.findall(r"(\w+)\s*\{\s*min\s+([0-9.eE+-]+)\s*;\s*max\s+([0-9.eE+-]+)\s*;\s*\}",
                                    bm.group(1)):
            bands[s] = (float(lo), float(hi))
    rec["bands"] = bands
    rec["raw"] = raw
    return rec


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(SOLVE), str(case)], capture_output=True, text=True,
                       timeout=900, env=env, cwd=str(case))
    js = None
    if "<<<Choupo:result-begin>>>" in r.stdout:
        js = json.loads(r.stdout.split("<<<Choupo:result-begin>>>")[1]
                        .split("<<<Choupo:result-end>>>")[0])
    return r.returncode, r.stdout, r.stderr, js


def copy_case(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "propertyManifest"))


def edit(case, pattern, repl, flags=re.M, rel="system/flowsheetDict"):
    p = case / rel
    s = p.read_text()
    s2 = re.sub(pattern, repl, s, count=1, flags=flags)
    if s2 == s:
        raise RuntimeError("fixture edit did not apply in %s: %r" % (p, pattern))
    p.write_text(s2)


def set_rejection(case, body):
    edit(case, r"rejection \{[^}]*\}", "rejection { %s }" % body)


def write_feed(path, comps, P_bar, T_K=298.15):
    lines = "\n".join("    %-6s %.15g kmol/h;" % (c, v) for c, v in comps.items())
    path.write_text("componentMolarFlows\n{\n%s\n}\nT %.6f K;\nP %.10f bar;\n" % (lines, T_K, P_bar))


def rated_feed_flows(test):
    """The reference test's feed as the engine's probe builds it
    (RatedTestInversion.cpp): mass fraction w closed on rho 1000, volumetric
    feed = permeateFlow / recovery."""
    perm = float(test["permeateFlow"].split()[0])          # m3/d
    Q = perm / float(test["recovery"]) / 24.0              # m3/h
    m = Q * 1000.0
    w = float(test["feedMassFraction"])
    s = test["solute"]
    flows = {"water": m * (1.0 - w) / mw("water"), "NaCl": 0.0, "MgSO4": 0.0}
    flows[s] = m * w / mw(s)
    return flows


def refusal(tmp, label, mutate, must):
    d = tmp / ("refuse_" + label)
    copy_case(WITNESS, d)
    mutate(d)
    rc, so, se, _ = run(d)
    out = so + se
    if rc == 0:
        fail("(d) %s: the probe ran to exit 0 -- no refusal" % label)
        return
    for m in must:
        if m not in out:
            fail("(d) %s: exit %d but the message lacks %r:\n%s" % (label, rc, m, out[-600:]))
            return
    print("  (d) %s: refused (exit %d)" % (label, rc))


def main():
    if not SOLVE.exists():
        print("check_membrane_classes: FAILED\n  choupoSolve not built")
        return 1
    tmp = Path(tempfile.mkdtemp(prefix="check_membrane_classes_"))
    recs = {}
    try:
        # ---- (a) the records ------------------------------------------------
        found = set()
        for p in sorted(ASSETS.glob("*.dat")):
            if re.search(r"^kind\s+membraneClass\s*;", strip_comments(p.read_text()), re.M):
                found.add(p.stem)
        if found != set(CLASSES):
            fail("(a) the `kind membraneClass` records are %s, not the six %s" % (sorted(found), CLASSES))
        for c in CLASSES:
            p = ASSETS / (c + ".dat")
            if not p.exists():
                fail("(a) %s: no record" % c)
                continue
            r = parse_class(p)
            recs[c] = r
            if r["name"] != c:
                fail("(a) %s: name %r" % (c, r["name"]))
            if r["reviewStatus"] != "illustrative":
                fail("(a) %s: reviewStatus %r, must be `illustrative`" % (c, r["reviewStatus"]))
            if r["membraneType"] not in ("NF", "RO"):
                fail("(a) %s: membraneType %r" % (c, r["membraneType"]))
            if not (r["element"] or "").startswith("Generic-"):
                fail("(a) %s: element %r is not a generic element" % (c, r["element"]))
            if not r["description"] or not r["application"]:
                fail("(a) %s: no description / application" % c)
            for k in ("manufacturer", "model", "modelNumber"):
                if r[k] is not None:
                    fail("(a) %s: declares `%s` -- a class is not a product" % (c, k))
            for mk in MAKERS:
                if mk in r["raw"]:
                    fail("(a) %s: the record names %r -- a class must never look like a product" % (c, mk.strip()))
            if not r["A_w"]:
                fail("(a) %s: no A_w in m/s/bar" % c)
            if not r["tests"]:
                fail("(a) %s: no reference tests" % c)
            seen = set()
            for t in r["tests"]:
                s = t["solute"]
                if s in seen:
                    fail("(a) %s: two %s tests" % (c, s))
                seen.add(s)
                if t["rejectionValueType"] != "typical" or t["permeateFlowBasis"] != "sameTest" \
                        or t["pressureBasis"] not in ("feedGauge", "feedAbsolute") or not t["source"]:
                    fail("(a) %s: the %s test leaves an optional fact undeclared: %r" % (c, s, t))
                if s not in r["bands"]:
                    fail("(a) %s: no band for %s" % (c, s))
                    continue
                lo, hi = r["bands"][s]
                R = float(t["rejection"])
                if not (lo <= R <= hi):
                    fail("(a) %s: %s rejection %g outside its band [%g, %g]" % (c, s, R, lo, hi))
            if set(r["bands"]) != seen:
                fail("(a) %s: bands for %s, tests for %s" % (c, sorted(r["bands"]), sorted(seen)))
        if recs:
            print("  (a) %d class records: %s" % (len(recs), "; ".join(
                "%s %s %s" % (c, r["membraneType"], ", ".join(
                    "%s %g in [%g, %g]" % (t["solute"], float(t["rejection"]), *r["bands"].get(t["solute"], (0, 0)))
                    for t in r["tests"])) for c, r in recs.items())))

        # ---- (b) + (c) every class, through the engine ---------------------
        for c, r in recs.items():
            pc = tmp / ("class_" + c)
            copy_case(WITNESS, pc)
            edit(pc, r"^(\s*)module\s+NF_DIVALENT_SELECTIVE;", r"\1module %s;" % c)
            salts = [t["solute"] for t in r["tests"]]
            #  a salt the class does not rate keeps a typed, sourced number
            body = " ".join("%s %s;" % (s, "fromRatedTest" if s in salts else "0.5")
                            for s in ("NaCl", "MgSO4"))
            set_rejection(pc, body)
            rc, so, se, js = run(pc)
            if rc != 0 or js is None:
                fail("(b) %s: did not run (exit %d):\n%s" % (c, rc, (so + se)[-700:]))
                continue
            if ("[illustrative] module '%s'" % c) not in so:
                fail("(b) %s: no [illustrative] line on stdout" % c)
            if ("[illustrative] spiralWoundModule 'NF': module '%s'" % c) not in se:
                fail("(b) %s: no [illustrative] line on stderr" % c)
            adv = [a for a in js.get("advisories", [])
                   if a.get("category") == "provenance" and "FUNCTIONAL CLASS" in a.get("message", "")
                   and a.get("status") == "accepted"]
            if not adv:
                fail("(b) %s: no accepted provenance advisory saying FUNCTIONAL CLASS" % c)
            k = js.get("kpis", {}).get("NF", {})
            for t in r["tests"]:
                s = t["solute"]
                Rint = k.get("R_int_fromRatedTest_" + s)
                Robs = float(t["rejection"])
                if Rint is None or not Rint > Robs:
                    fail("(b) %s: R_int(%s) %s not above the stated observed %g" % (c, s, Rint, Robs))
                    continue
                sfx = "" if len(r["tests"]) == 1 else "_" + s
                perm = k.get("ratedTest_permeateFlow" + sfx, float("nan")) * 86400.0
                print("  (b) %s: R_obs(%s) %g stated -> R_int %.6f derived; engine permeate at the "
                      "reference test %.3g m3/d (stated %s)" % (c, s, Robs, Rint, perm, t["permeateFlow"]))
                # ---- (c) the round trip, on an independent fixture --------
                rt = tmp / ("rt_%s_%s" % (c, s))
                copy_case(WITNESS, rt)
                (rt / "constant/assets").mkdir(parents=True, exist_ok=True)
                (rt / "constant/assets/RT_FIXTURE.dat").write_text(
                    "name RT_FIXTURE;\nkind %s;\nA_w %s m/s/bar;\n" % (r["membraneType"], r["A_w"]))
                edit(rt, r"^(\s*)module\s+NF_DIVALENT_SELECTIVE;",
                     r"\1module %s; membrane RT_FIXTURE;" % r["element"])
                edit(rt, r"elements\s+3;", "elements 1;")
                set_rejection(rt, " ".join("%s %.15g;" % (x, Rint if x == s else 0.5)
                                           for x in ("NaCl", "MgSO4")))
                P = float(t["P"].split()[0]) + (ATM_BAR if t["pressureBasis"] == "feedGauge" else 0.0)
                write_feed(rt / "0/feed", rated_feed_flows(t), P, float(t["T"].split()[0]))
                rc2, so2, se2, j2 = run(rt)
                if rc2 != 0 or j2 is None:
                    fail("(c) %s/%s: the round trip did not run (exit %d):\n%s" % (c, s, rc2, (so2 + se2)[-700:]))
                    continue
                ro = j2.get("kpis", {}).get("NF", {}).get("R_obs_" + s, float("nan"))
                if not abs(ro - Robs) <= 1e-7:
                    fail("(c) %s/%s: R_int %.12g typed at the reference test gives R_obs %.10f, not the "
                         "stated %g" % (c, s, Rint, ro, Robs))
                else:
                    print("  (c) %s/%s: R_int typed on an independent fixture reproduces R_obs %.10f "
                          "(stated %g, |diff| %.1e)" % (c, s, ro, Robs, abs(ro - Robs)))

        # ---- (d) the refusals ---------------------------------------------
        refusal(tmp, "unknownClass",
                lambda d: edit(d, r"^(\s*)module\s+NF_DIVALENT_SELECTIVE;", r"\1module NF_NO_SUCH_CLASS;"),
                ["NF_NO_SUCH_CLASS", "NF_DIVALENT_SELECTIVE", "SWRO"])
        refusal(tmp, "SDEM",
                lambda d: edit(d, r"^(\s*)transport\s+constantRejection;", r"\1transport SDEM;"),
                ["is a functional class, and `transport SDEM;`", "needs data a class does not", "`transport constantRejection;`"])
        refusal(tmp, "solutionDiffusion",
                lambda d: edit(d, r"^(\s*)transport\s+constantRejection;", r"\1"),
                ["is a functional class, and `transport solutionDiffusion;`", "needs data a class does not", "`transport constantRejection;`"])
        refusal(tmp, "typedRatedSalt",
                lambda d: set_rejection(d, "NaCl 0.40;  MgSO4 fromRatedTest;"),
                ["types a number for it", "`NaCl fromRatedTest;`", "never typed"])
        refusal(tmp, "classAsMembrane",
                lambda d: edit(d, r"^(\s*)module\s+NF_DIVALENT_SELECTIVE;",
                               r"\1module Generic-4040; membrane NF_DIVALENT_SELECTIVE;"),
                ["functional CLASS", "module NF_DIVALENT_SELECTIVE;"])

        def local_class(d, old, new):
            (d / "constant/assets").mkdir(parents=True, exist_ok=True)
            s = (ASSETS / "NF_DIVALENT_SELECTIVE.dat").read_text()
            s2 = re.sub(old, new, s, count=1, flags=re.M)
            if s2 == s:
                raise RuntimeError("class fixture edit did not apply: %r" % old)
            (d / "constant/assets/NF_DIVALENT_SELECTIVE.dat").write_text(s2)
        refusal(tmp, "manufacturer",
                lambda d: local_class(d, r"^kind\s+membraneClass;",
                                      'kind membraneClass;\nmanufacturer "Acme Membranes";'),
                ["`manufacturer`", "never a product"])
        refusal(tmp, "reviewStatus",
                lambda d: local_class(d, r"^reviewStatus\s+illustrative;", "reviewStatus reviewed;"),
                ["reviewStatus illustrative", "`reviewed`"])

        # ---- (e) the witness ---------------------------------------------
        rc, so, se, js = run(WITNESS)
        if rc != 0 or js is None:
            fail("(e) the witness did not run (exit %d):\n%s" % (rc, (so + se)[-700:]))
        else:
            k = js.get("kpis", {}).get("NF", {})
            if "[illustrative] module 'NF_DIVALENT_SELECTIVE'" not in so:
                fail("(e) the witness does not announce its class")
            for s in ("NaCl", "MgSO4"):
                if "R_int_fromRatedTest_" + s not in k:
                    fail("(e) the witness publishes no R_int_fromRatedTest_%s" % s)
            if not fails:
                print("  (e) witness: R_int NaCl %.6f, MgSO4 %.6f; R_obs at 7 bar NaCl %.4f, MgSO4 %.4f"
                      % (k.get("R_int_fromRatedTest_NaCl", float("nan")),
                         k.get("R_int_fromRatedTest_MgSO4", float("nan")),
                         k.get("R_obs_NaCl", float("nan")), k.get("R_obs_MgSO4", float("nan"))))

        # ---- (f) the SEAL follows a class's element and a module's spacer ----
        #  C189 slice 5: bin/choupo-import could not seal a class case -- the
        #  class names its element by reference (`element Generic-4040;`) and
        #  the closure did not follow it ("unknown membrane module
        #  'Generic-4040'") -- and the feed spacer a module is wound with
        #  (`feedSpacer`) must come along.  Each witness is sealed in a temp
        #  copy with the standards catalogue hidden and must REPRODUCE its
        #  golden; the mirrored records are listed.
        importer = ROOT / "bin" / "choupo-import"
        for label, src, must_mirror in (
                ("class", WITNESS, ("NF_DIVALENT_SELECTIVE.dat", "Generic-4040.dat", "SchockMiquel-FilmTecFT30.dat")),
                ("module+spacer", ROOT / "tutorials/steady/membranes/membrane28_water_permeance_from_sheets",
                 ("NF270-4040.dat", "SW30HR-380.dat", "Spacer-28mil.dat"))):
            sd = tmp / ("seal_" + label.replace("+", "_"))
            shutil.copytree(src, sd, ignore=shutil.ignore_patterns(
                "converged", "log.*", "reports", "design", "propertyManifest"))
            for sub in ("assets", "components", "species"):
                shutil.rmtree(sd / "constant" / sub, ignore_errors=True)
            r = subprocess.run([str(importer), str(sd)], capture_output=True, text=True, timeout=900)
            out = r.stdout + r.stderr
            if r.returncode != 0 or "reproduced its `expected` golden" not in out:
                fail("(f) sealing the %s witness failed (exit %d):\n%s" % (label, r.returncode, out[-700:]))
                continue
            miss = [m for m in must_mirror if not (sd / "constant/assets" / m).exists()]
            if miss:
                fail("(f) sealing the %s witness did not mirror %s" % (label, miss))
            else:
                print("  (f) the %s witness seals with the catalogue hidden and reproduces its golden; mirrored %s"
                      % (label, ", ".join(must_mirror)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_membrane_classes: FAIL -- %d finding(s)" % len(fails))
        return 1
    print("check_membrane_classes: OK -- the six `kind membraneClass` records (%s) are "
          "illustrative, name no manufacturer and keep each stated rejection inside its band; "
          "each run announces it ([illustrative], stdout + stderr + an accepted advisory); every "
          "derived R_int typed on an independent fixture at the class's reference test reproduces "
          "the stated observed rejection to 1e-7; an unknown class, SDEM, solutionDiffusion, a typed "
          "rated salt, a class as a bare membrane, a class naming a manufacturer and one claiming "
          "another review status all refuse by name; the importer seals the class witness (following the class's element) and a spacer-reading module witness with the catalogue hidden, each reproducing its golden.  NOT checked: whether a class's values are good "
          "teaching values, the engine's permeate against the stated one (printed only), the batch "
          "diafilter (does not refuse a class)" % ", ".join(CLASSES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
