#!/usr/bin/env python3
"""Element-balance gate (steady): the plant-boundary ELEMENT conservation
report is real physics, not a renamed mass balance.

1. REACTIVE case (conversion01_hda: toluene + H2 -> benzene + CH4): the
   boundary SPECIES change (benzene leaves that never entered) yet C and H
   close at ~100 % -- the diagnostic that distinguishes atom conservation
   from a total-mass tautology.

2. IMPOSSIBLE formula: a case-local overlay gives toluene an unparseable
   formula.  ONLY the elemental claim refuses (status UNAVAILABLE naming
   species + reason); the mass balance stays available and closed.

3. OUTPUT-ONLY element (the gravest error this diagnostic exists to catch):
   an overlay gives methane the formula CH3Cl, so Cl leaves the boundary
   without ever entering.  The Cl row MUST appear (union of in/out
   elements), with in = 0 and a metric unmistakably far from 100 %.

Exit 1 listing failures."""
import csv
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "reactors" / "conversion01_hda"

REPORTS = "\nreports\n{\n    massBalance    { }\n    elementBalance { }\n}\n"


def run_case(tmp, name, overlay=None, overlay_name="toluene.dat"):
    case = Path(tmp) / name
    shutil.copytree(CASE, case,
                    ignore=shutil.ignore_patterns("log.choupo*", "reports",
                                                  "converged"))
    with open(case / "system" / "controlDict", "a") as f:
        f.write(REPORTS)
    if overlay:
        d = case / "constant" / "components"
        d.mkdir(parents=True, exist_ok=True)
        (d / overlay_name).write_text(overlay)
    r = subprocess.run([str(SOLVE), str(case)], capture_output=True,
                       text=True, cwd=ROOT)
    return case, r


def main():
    bad = []
    with tempfile.TemporaryDirectory(prefix="choupo-elembal-") as tmp:
        # ---- 1. reactive: species change, atoms close -----------------------
        case, r = run_case(tmp, "reactive")
        if r.returncode != 0:
            bad.append("reactive case failed to run")
        else:
            rows = {}
            with open(case / "reports" / "balances" / "elementBalance.csv") as f:
                for row in csv.DictReader(f):
                    rows[row["element"]] = float(row["closure_pct"])
            for e in ("C", "H"):
                if e not in rows or abs(rows[e] - 100.0) > 0.01:
                    bad.append(f"reactive: element {e} closure ="
                               f" {rows.get(e)} (want ~100)")
            meta_full = (case / "reports" / "balances"
                         / "elementBalance.meta").read_text()
            if "status,FULL" not in meta_full:
                bad.append("reactive: sidecar status is not FULL")
            # The boundary SPECIES changed: benzene leaves without entering.
            bz_in = bz_out = None
            with open(case / "reports" / "balances" / "massBalance.csv") as f:
                for row in csv.reader(f):
                    if row and row[0] == "benzene":
                        bz_in, bz_out = float(row[1]), float(row[2])
            if bz_in is None or bz_in > 1e-9 or (bz_out or 0) < 1e-6:
                bad.append(f"reactive: benzene in/out = {bz_in}/{bz_out}"
                           " (want 0 in, >0 out -- a genuinely reacting"
                           " boundary)")

        # ---- 2. impossible formula: refuse ONLY the elemental ---------------
        import re as _re
        std_toluene = (ROOT / "data" / "standards" / "components"
                       / "toluene.dat").read_text()
        overlay = _re.sub(r"(?m)^formula\s+[^;]+;",
                          "formula     aromaticCut;", std_toluene, count=1)
        assert "aromaticCut" in overlay
        case, r = run_case(tmp, "impossible", overlay=overlay)
        if r.returncode != 0:
            bad.append("impossible-formula case failed to run (the refusal"
                       " must be elemental-only, not fatal)")
        else:
            meta_path = case / "reports" / "balances" / "elementBalance.meta"
            meta = meta_path.read_text()
            if "status,UNAVAILABLE" not in meta:
                bad.append("impossible: elementBalance did not refuse")
            if "toluene" not in meta:
                bad.append("impossible: the refusal does not name the species")
            # key,value declared => EVERY meta row has exactly 2 fields.
            with open(meta_path) as f:
                for row in csv.reader(f):
                    if row and len(row) != 2:
                        bad.append(f"impossible: meta row {row} breaks the"
                                   " declared key,value arity")
            # The canonical header survives even in UNAVAILABLE (a regular
            # zero-row table, never a schema-less empty file).
            with open(case / "reports" / "balances"
                      / "elementBalance.csv") as f:
                rd = csv.DictReader(f)
                if rd.fieldnames != ["element", "in_kmol_atom_h",
                                     "out_kmol_atom_h",
                                     "residual_kmol_atom_h", "closure_pct"]:
                    bad.append("impossible: the CSV header is not canonical")
                if list(rd):
                    bad.append("impossible: UNAVAILABLE must have zero data"
                               " rows")
            closure = None
            with open(case / "reports" / "balances" / "massBalance.csv") as f:
                for row in csv.reader(f):
                    if row and row[0] == "closure_pct":
                        closure = float(row[3])
            if closure is None or abs(closure - 100.0) > 0.01:
                bad.append(f"impossible: mass balance closure = {closure}"
                           " (must STAY available and closed)")
        # ---- 3. output-only element: the union must show it -----------------
        overlay3 = _re.sub(r"(?m)^formula\s+[^;]+;",
                           "formula     CH3Cl;",
                           (ROOT / "data" / "standards" / "components"
                            / "CH4.dat").read_text(), count=1)
        assert "CH3Cl" in overlay3
        case, r = run_case(tmp, "outputOnly", overlay=overlay3,
                           overlay_name="CH4.dat")
        if r.returncode != 0:
            bad.append("output-only case failed to run")
        else:
            cl_row = None
            with open(case / "reports" / "balances"
                      / "elementBalance.csv") as f:
                for row in csv.DictReader(f):
                    if row["element"] == "Cl":
                        cl_row = row
            if cl_row is None:
                bad.append("output-only: the Cl row is MISSING -- an element"
                           " created only on the product side must appear")
            else:
                if float(cl_row["in_kmol_atom_h"]) != 0.0:
                    bad.append("output-only: Cl in != 0")
                if float(cl_row["out_kmol_atom_h"]) <= 0.0:
                    bad.append("output-only: Cl out is not positive")
                if abs(float(cl_row["closure_pct"]) - 100.0) < 50.0:
                    bad.append("output-only: Cl closure "
                               f"{cl_row['closure_pct']} does not scream")

        # ---- 4. PARTIAL: declared composition with unaccounted mass -------
        #  toluene loses its formula and declares C/H by mass with 0.5 %
        #  unaccounted: the known elements still close; the verdict is
        #  PARTIAL in the sidecar, never a complete-closure stamp.
        prov = ("provenance\n{\n    elementalComposition\n    {\n"
                "        origin  measured;\n"
                "        method  \"gate fixture ultimate analysis\";\n"
                "    }\n}\n")
        overlay4 = _re.sub(r"(?m)^formula\s+[^;]+;",
                           "formula     aromaticCut;", std_toluene, count=1)
        overlay4 += ("elementalComposition\n{\n    basis massFraction;\n"
                     "    massFractions { C 0.9078; H 0.0872; }\n"
                     "    unaccountedMassFraction 0.005;\n}\n" + prov)
        case, r = run_case(tmp, "partial", overlay=overlay4)
        if r.returncode != 0:
            bad.append("partial: failed to run: "
                       + (r.stdout + r.stderr)[-300:])
        else:
            meta_p = (case / "reports" / "balances"
                      / "elementBalance.meta").read_text()
            if "status,PARTIAL" not in meta_p:
                bad.append("partial: sidecar status is not PARTIAL")
            if "partialSpecies.toluene" not in meta_p:
                bad.append("partial: the partial species is not named")
            rows_p = {}
            with open(case / "reports" / "balances"
                      / "elementBalance.csv") as f:
                for row in csv.DictReader(f):
                    rows_p[row["element"]] = float(row["closure_pct"])
            for e in ("C", "H"):
                if e not in rows_p or abs(rows_p[e] - 100.0) > 1.0:
                    bad.append(f"partial: declared element {e} closure ="
                               f" {rows_p.get(e)} (the known elements must"
                               " still close)")

    if bad:
        print("ELEMENT-BALANCE GATE FAILED (%d):" % len(bad))
        for b in bad:
            print("  " + b)
        return 1
    print("element-balance gate: reactive boundary closes per atom;"
          " an impossible formula refuses ONLY the elemental claim")
    return 0


# ---------------------------------------------------------------------------
#  BATCH relevance (Codex post-commit blocker): a PARTIAL-declared component
#  that is ABSENT from the whole campaign (zero moles everywhere) must NOT
#  withdraw the elemental seal; present, it must.
# ---------------------------------------------------------------------------
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
BATCH_CASE = ROOT / "tutorials" / "batch" / "reactor" / "batch01_first_order"

GHOST = ("name ghostCut;\nformula pseudo;\nMW 100.0;\nrole nonvolatile;\n"
         "liquidHeatCapacity\n{\n    model polynomial;\n"
         "    coefficients (150.0);\n    Trange (270 500);\n}\n"
         "elementalComposition\n{\n    basis massFraction;\n"
         "    massFractions { C 0.84; H 0.155; }\n"
         "    unaccountedMassFraction 0.005;\n}\n"
         "provenance\n{\n    elementalComposition\n    {\n"
         "        origin  measured;\n"
         "        method  \"gate fixture ultimate analysis\";\n    }\n}\n")


def batch_case(tmp, name, *, present):
    import shutil as _sh
    case = Path(tmp) / name

    def ignore(_d, names):
        return [nm for nm in names
                if nm.startswith("log.choupo") or nm in ("reports",)
                or nm.endswith(".csv")
                or (nm != "0" and nm.replace(".", "", 1).isdigit())]

    _sh.copytree(BATCH_CASE, case, ignore=ignore)
    tp = case / "constant" / "thermoPhysPropDict"
    tp.write_text(tp.read_text().replace(
        "components       ( ethanol  water  aceticAcid  ethylAcetate );",
        "components       ( ethanol  water  aceticAcid  ethylAcetate"
        "  ghostCut );"))
    d = case / "constant" / "components"
    d.mkdir(parents=True, exist_ok=True)
    (d / "ghostCut.dat").write_text(GHOST)
    if present:
        st = case / "0" / "internalState"
        st.write_text(st.read_text().replace(
            "molarComposition  { ethanol 0.5;  aceticAcid 0.5;"
            "  ethylAcetate 0.0;  water 0.0; }",
            "molarComposition  { ethanol 0.45;  aceticAcid 0.45;"
            "  ethylAcetate 0.0;  water 0.0;  ghostCut 0.1; }"))
    r = subprocess.run([str(BATCH), str(case)], capture_output=True,
                       text=True, cwd=ROOT)
    return r


def batch_relevance_gate(bad):
    import json as _json
    with tempfile.TemporaryDirectory(prefix="choupo-batchrel-") as tmp:
        for name, present, wantPartial in (("ghost-absent", False, False),
                                           ("ghost-present", True, True)):
            r = batch_case(tmp, name, present=present)
            out = r.stdout + r.stderr
            if r.returncode != 0:
                bad.append(f"{name}: failed to run: {out[-300:]}")
                continue
            m = _re_result.search(out)
            if not m:
                bad.append(f"{name}: no result block")
                continue
            ck = _json.loads(m.group(1))["kpis"].get("campaign", {})
            gotPartial = ck.get("element_balance_partial") == 1
            if gotPartial != wantPartial:
                bad.append(f"{name}: element_balance_partial ="
                           f" {gotPartial} (want {wantPartial}) -- an"
                           " absent component must never contaminate the"
                           " seal; a present one must withdraw it")


import re as _re_mod
_re_result = _re_mod.compile(
    r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", _re_mod.S)

if __name__ == "__main__":
    _bad = []
    batch_relevance_gate(_bad)
    if _bad:
        print("ELEMENT-BALANCE GATE FAILED (batch relevance, %d):"
              % len(_bad))
        for b in _bad:
            print("  " + b)
        sys.exit(1)
    sys.exit(main())
