#!/usr/bin/env python3
# cosmo_lvpp_vs_nrtl.py -- the HELD-OUT test of COSMO-SAC LVPP-HFTZVP-2018:
# predict, with no adjustment, the measured bubble points every catalogue NRTL
# pair was regressed to, and set the prediction beside the fitted NRTL.
#
#     Copyright (C) 2026 Vítor Geraldes
#     SPDX-License-Identifier: GPL-3.0-or-later
#
# WHY THIS IS THE ACCEPTANCE (DEV.md 4c C310; docs/design/cosmo-sac-lvpp-hftzvp-2018.md)
#   Ferrarini 2018 leaves two choices open; the reading the engine uses was
#   SELECTED on Lin & Sandler 2002 Table 2, so that table cannot also judge
#   it.  These data never touched the selection: they are the ThermoML
#   bubble-point series (articles cited in each pair record) that the
#   catalogue's NRTL pairs graded clean or warning were fitted to.  NRTL saw
#   them; COSMO-SAC did not -- which is the point of setting them side by side.
#
# WHAT IT DOES, per pair record data/standards/parameters/NRTL/*.dat with
# `fitGrade clean` or `warning`:
#   1. both components must carry an LVPP-HFTZVP-2018 set in the catalogue,
#      or the pair is listed as NOT PREDICTABLE with the reason;
#   2. the pair's curation case (`fittedInCase`) is COPIED to a scratch
#      directory (data/curation/ is never written) and its measured points are
#      regenerated there by `bin/choupo-curate fetch` from the declared DOIs
#      and sha256 sums (the ThermoML cache under thirdParty/thermoml);
#   3. choupoProps scores, with `fitParameters mode evaluate` over the SAME
#      evidence and residual the fit used: (a) NRTL with the promoted record's
#      own parameters, (b) COSMO-SAC LVPP-HFTZVP-2018 with no parameter at all;
#   4. the per-point residuals are read back from each run's parity CSV and
#      summarised per pair and per chemical-family pairing.
#
# The family of a component is read from its LVPP geometry (RDKit SMARTS),
# never from its name.  RDKit is required (pip install rdkit).
#
#     cosmo_lvpp_vs_nrtl.py [--work DIR] [--json OUT] [--only PAIR ...]
#     cosmo_lvpp_vs_nrtl.py --summarise OUT.json      (the per-family table)
"""Held-out comparison: COSMO-SAC LVPP-HFTZVP-2018 vs the catalogue NRTL pairs."""
import argparse
import csv
import importlib.machinery
import importlib.util
import json
import re
import shutil
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NRTL = ROOT / "data/standards/parameters/NRTL"
COMPONENTS = ROOT / "data/standards/components"
PROPS = ROOT / "choupoProps"
SET = "LVPP-HFTZVP-2018"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import lvpp_sigma_profile as lvpp   # noqa: E402  -- one reader of the .gout files

#  Family by functional group, most specific first.  A pairing is reported as
#  the unordered pair of the two families.
SMARTS = [
    ("water", "[OX2H2]"),
    ("carboxylic acid", "C(=O)[OX2H1]"),
    ("ester/carbonate", "[#6]C(=O)O[#6]"),
    ("nitro", "[N+](=O)[O-]"),
    ("nitrile", "C#N"),
    ("amide", "C(=O)[NX3]"),
    ("amine", "[NX3;!$(N-C=O);!$(N-a)]"),
    ("aromatic amine/N-heterocycle", "[n,$(N-a)]"),
    ("alcohol", "[OX2H][#6]"),
    ("ketone", "[#6][CX3](=O)[#6]"),
    ("aldehyde", "[CX3H1](=O)"),
    ("ether", "[OD2]([#6])[#6]"),
    ("sulfur", "[#16]"),
    ("halogenated", "[F,Cl,Br,I]"),
    ("aromatic hydrocarbon", "c"),
    ("alkene/alkyne", "[CX3]=[CX3,CX2]"),
    ("alkene/alkyne", "C#C"),
    ("alkane/cycloalkane", "[CX4]"),
]


def load_curate():
    p = ROOT / "bin/choupo-curate"
    loader = importlib.machinery.SourceFileLoader("choupo_curate", str(p))
    spec = importlib.util.spec_from_loader("choupo_curate", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def word(text, key):
    m = re.search(rf"^\s*{key}\s+\"?([^\";]+)\"?\s*;", text, re.M)
    return m.group(1).strip() if m else None


def leaf_block(dat):
    """The component's LVPP-HFTZVP-2018 leaf, verbatim, or None."""
    t = dat.read_text()
    m = re.search(r"\n    " + re.escape(SET) + r"\n    \{.*?\n    \}\n", t, re.S)
    return m.group(0)[1:] if m else None


def family(comp, Chem, rdb):
    leaf = leaf_block(COMPONENTS / f"{comp}.dat")
    fm = re.search(r"file ([A-Za-z0-9,()_+\-]+\.gout)", leaf or "")
    if not fm:
        return "unknown"
    mol = lvpp.geometry_mol(lvpp.read_gout(lvpp.GOUT_DIR / fm.group(1))[5], Chem, rdb)
    for name, sm in SMARTS:
        if mol.HasSubstructMatch(Chem.MolFromSmarts(sm)):
            return name
    return "other"


def insert_leaf(dat, leaf):
    t = dat.read_text()
    m = re.search(r"^cosmo\s*\{", t, re.M)
    if not m:
        dat.write_text(t.rstrip("\n") + "\n\ncosmo\n{\n" + leaf + "}\n")
        return
    depth = 0
    for j in range(m.end() - 1, len(t)):
        depth += (t[j] == "{") - (t[j] == "}")
        if depth == 0:
            break
    if SET in t[m.end():j]:
        return
    dat.write_text(t[:j] + leaf + t[j:])


def fit_op_parts(props_text):
    """The first fitParameters op's `evidence (...)` and `residual {...}`."""
    i = props_text.index("type        fitParameters;")
    ev = re.search(r"evidence\s*\((.*?)\n        \);", props_text[i:], re.S)
    rs = re.search(r"residual\s*\{(.*?)\n        \}", props_text[i:], re.S)
    return ev.group(1), rs.group(1)


def eval_props(evidence, residual):
    res = re.sub(r"\n\s*weighting[^;]*;", "", residual)
    return ("operations\n(\n    {\n        name        score;\n        type        fitParameters;\n"
            "        mode        evaluate;\n        evidence\n        (" + evidence +
            "\n        );\n        residual\n        {" + res + "\n        }\n"
            "        output      { parity  parity.csv; }\n    }\n);\n")


def parity(case):
    """(kind, [(measured, model)]) for the converged points."""
    f = case / "parity.csv"
    if not f.exists():
        return []
    rows = list(csv.DictReader(l for l in f.open() if not l.startswith("#")))
    out = []
    for r in rows:
        if r.get("status", "ok") not in ("ok", "converged", ""):
            continue
        meas = next((r[k] for k in r if "_exp" in k), None)
        mod = next((r[k] for k in r if "_model" in k), None)
        try:
            out.append((float(meas), float(mod)))
        except (TypeError, ValueError):
            continue
    return out


def summarise(js, Chem, rdb):
    """The per-family table, as markdown: families recomputed from the
    geometry (so a SMARTS change needs no rerun of the engine)."""
    import collections
    rows = collections.defaultdict(list)
    for x in js["results"]:
        s = x["scores"]
        if "aad" not in s.get("NRTL", {}) or "aad" not in s.get("COSMO", {}):
            continue
        fam = " + ".join(sorted(family(c, Chem, rdb) for c in x["components"]))
        rows[(fam, s["COSMO"]["kind"])].append(x)
    out = ["| families | data | pairs | points | NRTL aad (fitted, in-sample) | "
           "COSMO-SAC aad (predicted, held out) | COSMO-SAC worst pair |",
           "|---|---|---|---|---|---|---|"]
    for (fam, kind), xs in sorted(rows.items()):
        u = "K" if kind == "T_bubble" else "%"
        med = lambda m: statistics.median(x["scores"][m]["aad"] for x in xs)
        worst = max(xs, key=lambda x: x["scores"]["COSMO"]["aad"])
        out.append(f"| {fam} | {kind} | {len(xs)} | "
                   f"{sum(x['scores']['COSMO']['n'] for x in xs)} | {med('NRTL'):.2f} {u} | "
                   f"{med('COSMO'):.2f} {u} | {worst['pair']} {worst['scores']['COSMO']['aad']:.2f} {u} |")
    for kind, u in (("T_bubble", "K"), ("P_bubble", "%")):
        xs = [x for v in rows.values() for x in v if x["scores"]["COSMO"]["kind"] == kind]
        if xs:
            out.append(f"| **all** | {kind} | {len(xs)} | "
                       f"{sum(x['scores']['COSMO']['n'] for x in xs)} | "
                       f"{statistics.median(x['scores']['NRTL']['aad'] for x in xs):.2f} {u} | "
                       f"{statistics.median(x['scores']['COSMO']['aad'] for x in xs):.2f} {u} | |")
    return "\n".join(out)


def run(case):
    p = subprocess.run([str(PROPS), "."], cwd=str(case), capture_output=True,
                       text=True, timeout=1800)
    return p.returncode, p.stdout + p.stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", type=Path,
                    default=Path("/tmp") / "choupo-cosmo-lvpp-vs-nrtl")
    ap.add_argument("--json", type=Path, default=None)
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--summarise", type=Path, default=None,
                    help="print the per-family markdown table of a previous --json")
    args = ap.parse_args()
    Chem, rdb = lvpp.need_rdkit()
    if args.summarise:
        print(summarise(json.loads(args.summarise.read_text()), Chem, rdb))
        return 0
    cur = load_curate()
    pairs, skipped = [], []
    for rec in sorted(NRTL.glob("*.dat")):
        t = rec.read_text()
        grade = word(t, "fitGrade")
        if grade not in ("clean", "warning"):
            continue
        if args.only and rec.stem not in args.only:
            continue
        case_rel = word(t, "fittedInCase")
        comps = re.search(r"^components\s*\(\s*(\S+)\s+(\S+)\s*\)", t, re.M).groups()
        missing = [c for c in comps if not leaf_block(COMPONENTS / f"{c}.dat")]
        if missing:
            skipped.append((rec.stem, "no LVPP-HFTZVP-2018 profile for " + ", ".join(missing)))
            continue
        pairs.append((rec, grade, case_rel, comps))
    results = []
    for rec, grade, case_rel, comps in pairs:
        t = rec.read_text()
        pblock = re.search(r"^parameters\s*\{(.*?)^\}", t, re.S | re.M).group(1)
        par = {k: word(pblock, k) for k in ("i", "j", "a_ij", "b_ij", "a_ji", "b_ji", "alpha")}
        src = ROOT / case_rel
        row = {"pair": rec.stem, "grade": grade, "components": comps,
               "families": sorted(family(c, Chem, rdb) for c in comps)}
        scores = {}
        for model in ("NRTL", "COSMO"):
            case = args.work / rec.stem / model
            if case.exists():
                shutil.rmtree(case)
            shutil.copytree(src, case, ignore=shutil.ignore_patterns(
                "parity*.csv", "fit_history*", "*.proposal.dat", "log.*", "postProcessing"))
            (case / "constant/propertyManifest").unlink(missing_ok=True)
            if cur.fetch(case, quiet=True) != 0:
                row["error"] = "fetch failed (ThermoML cache absent or mismatched)"
                break
            props = (case / "system/propsDict").read_text()
            ev, rs = fit_op_parts(props)
            (case / "system/propsDict").write_text(eval_props(ev, rs))
            tp = case / "constant/thermoPhysPropDict"
            tt = tp.read_text()
            if model == "NRTL":
                for k in ("a_ij", "b_ij", "a_ji", "b_ji", "alpha"):
                    tt = re.sub(rf"(\b{k}\s+)[-0-9.eE+]+;", rf"\g<1>{par[k]};", tt, count=1)
                tt = re.sub(r"\bi\s+\S+;", f"i {par['i']};", tt, count=1)
                tt = re.sub(r"\bj\s+\S+;", f"j {par['j']};", tt, count=1)
            else:
                tt = re.sub(r"activityModel\s*\{.*?\n        \}",
                            "activityModel\n        {\n            model cosmoSAC;\n"
                            f"            source {SET};\n        }}", tt, count=1, flags=re.S)
                for c in comps:
                    insert_leaf(case / f"constant/components/{c}.dat",
                                leaf_block(COMPONENTS / f"{c}.dat"))
            tp.write_text(tt)
            rc, out = run(case)
            pts = parity(case)
            if rc != 0 or not pts:
                scores[model] = {"error": f"rc {rc}, {len(pts)} points",
                                 "tail": out[-600:]}
                continue
            kind = "T_bubble" if "T_bubble" in rs else "P_bubble"
            dev = ([m - e for e, m in pts] if kind == "T_bubble"
                   else [100.0 * (m - e) / e for e, m in pts])
            scores[model] = {"kind": kind, "n": len(pts),
                             "aad": statistics.fmean(abs(d) for d in dev),
                             "bias": statistics.fmean(dev),
                             "max": max(abs(d) for d in dev)}
        row["scores"] = scores
        results.append(row)
        s = scores
        print(f"{rec.stem:45s} {grade:7s} " + "  ".join(
            f"{m}: " + (f"{s[m]['aad']:.2f}{'K' if s[m]['kind'] == 'T_bubble' else '%'}"
                        if "aad" in s.get(m, {}) else "ERR") for m in ("NRTL", "COSMO")),
              flush=True)
    if args.json:
        args.json.write_text(json.dumps({"results": results, "notPredictable": skipped},
                                        indent=1))
    print(f"pairs scored {len(results)}, not predictable {len(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
