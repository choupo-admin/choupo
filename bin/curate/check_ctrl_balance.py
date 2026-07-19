#!/usr/bin/env python3
"""Ctrl balance-ledger gate: the dynamic material/element ledger integrates
ACCEPTED states in the engine's own time loop, and its claims are honest.

Causal proofs (Codex-ratified), all built as temp variants of ctrl01:
  1. NO-REACTION washout (equal-MW real formulas): inventory change equals
     the boundary integral -- mass closure tight, elements tight.
  2. REACTIVE with dn_total != 0 (A(C2H4O2, MW 60) -> 2 B(CH2O, MW 30)):
     total MOLES change, yet MASS and ATOMS close -- the ledger's law is
     conservation, never a mole count.
  3+4. ADAPTIVE (ctrl03_adaptive_disturbance shape): accumulation happens on
     accepted steps; closure holds and is rtol-insensitive (1e-6 vs 1e-8).
  5. TOY formulas (unmodified ctrl01): the elemental claim is withheld
     naming the species; material stays available.
  6. ENERGY: available = 0 with the named model reason -- always, until the
     dynamicCSTR is reformulated on a canonical functional.
  (7. Mixed ODE/non-ODE adaptive refusal exists in code; not provable from
     today's corpus -- every ctrl unit type is ODE-form.)

Exit 1 listing failures."""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CTRL = ROOT / "build" / "linux64Gcc" / "choupoCtrl"
BASE = ROOT / "tutorials" / "ctrl" / "ctrl01_cstr_temp_control"
ADAPT = ROOT / "tutorials" / "ctrl" / "ctrl03_adaptive_disturbance"


GHOST = ("name ghostCut;\nformula pseudo;\nMW 100.0;\nrole nonvolatile;\n"
         "liquidHeatCapacity\n{\n    model polynomial;\n"
         "    coefficients (150.0);\n    Trange (270 500);\n}\n"
         "elementalComposition\n{\n    basis massFraction;\n"
         "    massFractions { C 0.84; H 0.155; }\n"
         "    unaccountedMassFraction 0.005;\n}\n"
         "provenance\n{\n    elementalComposition\n    {\n"
         "        origin  measured;\n"
         "        method  \"gate fixture ultimate analysis\";\n    }\n}\n")

PARTIAL_B = ("elementalComposition\n{\n    basis massFraction;\n"
             "    massFractions { C 0.48; H 0.081; O 0.437; }\n"
             "    unaccountedMassFraction 0.002;\n}\n"
             "provenance\n{\n    elementalComposition\n    {\n"
             "        origin  measured;\n"
             "        method  \"gate fixture ultimate analysis\";\n"
             "    }\n}\n")


def make_case(tmp, name, src, *, real_formulas=False, no_reaction=False,
              a_to_2b=False, rtol=None, add_ghost=False,
              partial_late_B=False):
    case = Path(tmp) / name

    def ignore(_dir, names):
        out = []
        for nm in names:
            if nm.startswith("log.choupo") or nm in ("reports", "latest"):
                out.append(nm)
            elif nm.endswith(".csv") or nm.endswith(".meta"):
                out.append(nm)
            elif nm != "0" and nm.replace(".", "", 1).isdigit():
                out.append(nm)        # transient instants; the authored 0/ stays
        return out

    shutil.copytree(src, case, ignore=ignore)
    if real_formulas:
        a = case / "constant" / "components" / "compA.dat"
        b = case / "constant" / "components" / "compB.dat"
        a.write_text(re.sub(r"(?m)^MW\s+[^;]+;", "MW          60.0;",
                     re.sub(r"(?m)^formula\s+[^;]+;", "formula     C2H4O2;",
                            a.read_text())))
        if a_to_2b:
            b.write_text(re.sub(r"(?m)^MW\s+[^;]+;", "MW          30.0;",
                         re.sub(r"(?m)^formula\s+[^;]+;", "formula     CH2O;",
                                b.read_text())))
        else:
            b.write_text(re.sub(r"(?m)^MW\s+[^;]+;", "MW          60.0;",
                         re.sub(r"(?m)^formula\s+[^;]+;",
                                "formula     C2H4O2;", b.read_text())))
    if no_reaction:
        fs = case / "system" / "flowsheetDict"
        fs.write_text(re.sub(r"(?m)^\s*reaction\s+\w+;\n", "",
                             fs.read_text()))
    if a_to_2b:
        rx = case / "constant" / "reactions"
        rx.write_text(rx.read_text().replace(
            "{ component compB;  nu  1;  order 0; }",
            "{ component compB;  nu  2;  order 0; }"))
    if rtol is not None:
        cd = case / "system" / "controlDict"
        cd.write_text(re.sub(r"(?m)^(\s*rtol\s+)[^;]+;",
                             rf"\g<1>{rtol};", cd.read_text()))
    if add_ghost:
        tp = case / "constant" / "thermoPhysPropDict"
        tp.write_text(re.sub(r"components\s*\(([^)]*)\)",
                             lambda m: "components ({} ghostCut )".format(
                                 m.group(1).rstrip()),
                             tp.read_text(), count=1))
        (case / "constant" / "components" / "ghostCut.dat").write_text(GHOST)
    if partial_late_B:
        # compB starts at zero inventory with zero feed and only APPEARS as
        # the reaction produces it: the promotion path.  It loses its toy
        # formula and declares a PARTIAL composition.
        b = case / "constant" / "components" / "compB.dat"
        b.write_text(re.sub(r"(?m)^formula\s+[^;]+;",
                            "formula     pseudoB;", b.read_text())
                     + PARTIAL_B)
    r = subprocess.run([str(CTRL), str(case)], capture_output=True,
                       text=True, cwd=ROOT)
    return case, r


def balance_kpis(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    return json.loads(m.group(1))["kpis"].get("balance", {})


def main():
    bad = []
    with tempfile.TemporaryDirectory(prefix="choupo-ctrlbal-") as tmp:
        # ---- 1. no-reaction washout --------------------------------------
        case, r = make_case(tmp, "washout", BASE, real_formulas=True,
                            no_reaction=True)
        bk = balance_kpis(r.stdout + r.stderr)
        if r.returncode != 0 or bk is None:
            bad.append("washout: failed to run / no balance KPIs")
        else:
            if bk.get("material_available") != 1:
                bad.append("washout: material not available")
            if bk.get("mass_closure_rel", 1) > 1e-3:
                bad.append(f"washout: mass closure"
                           f" {bk.get('mass_closure_rel')} (> 1e-3)")
            if bk.get("element_worst_closure_rel", 1) > 1e-3:
                bad.append(f"washout: element closure"
                           f" {bk.get('element_worst_closure_rel')}")

        # ---- 2. reactive, dn_total != 0, mass + atoms close ---------------
        case, r = make_case(tmp, "a2b", BASE, real_formulas=True,
                            a_to_2b=True)
        bk = balance_kpis(r.stdout + r.stderr)
        if r.returncode != 0 or bk is None:
            bad.append("a2b: failed to run / no balance KPIs")
        else:
            if bk.get("mass_closure_rel", 1) > 1e-3:
                bad.append(f"a2b: mass closure {bk.get('mass_closure_rel')}"
                           " -- A(60) -> 2B(30) conserves mass")
            for e in ("C", "H", "O"):
                if bk.get(f"element_{e}_closure_rel", 1) > 1e-3:
                    bad.append(f"a2b: element {e} closure"
                               f" {bk.get(f'element_{e}_closure_rel')}")
            # dn_total != 0: the reaction genuinely changes total moles
            # (2 product moles per reactant mole) -- read the final state.
            m = re.search(r"<<<Choupo:result-begin>>>(.*?)"
                          r"<<<Choupo:result-end>>>",
                          r.stdout + r.stderr, re.S)
            k = json.loads(m.group(1))["kpis"]
            unit = next(v for kk, v in k.items()
                        if kk not in ("balance",) and "n_compB_final" in v)
            if unit["n_compB_final"] <= 0:
                bad.append("a2b: no compB formed -- the reactive proof is"
                           " vacuous")

        # ---- 3+4. adaptive: per-ACCEPTED-step accumulation, rtol-robust ----
        closures, rows = {}, {}
        for rtol in ("1.0e-6", "1.0e-8"):
            case, r = make_case(tmp, f"adapt{rtol}", ADAPT,
                                real_formulas=True, rtol=rtol)
            bk = balance_kpis(r.stdout + r.stderr)
            if r.returncode != 0 or bk is None:
                bad.append(f"adaptive rtol={rtol}: failed / no KPIs")
                continue
            closures[rtol] = bk.get("mass_closure_rel", 1)
            if closures[rtol] > 1e-3:
                bad.append(f"adaptive rtol={rtol}: mass closure"
                           f" {closures[rtol]}")
            traj = case / "balanceTrajectory.csv"
            rows[rtol] = sum(1 for _ in traj.open()) - 1   # minus header
        # CAUSAL: the ledger rides the ACCEPTED grid -- a tighter rtol takes
        # more accepted steps, so it must produce MORE trajectory rows (a
        # ledger sampling only interval boundaries would emit the same count).
        if len(rows) == 2:
            if not rows["1.0e-8"] > rows["1.0e-6"]:
                bad.append(f"adaptive: rows(1e-8)={rows['1.0e-8']} not >"
                           f" rows(1e-6)={rows['1.0e-6']} -- the ledger is"
                           " not following the accepted-step grid")

        # ---- 5+6. toy formulas: elements withheld; energy honest ----------
        case, r = make_case(tmp, "toy", BASE)
        bk = balance_kpis(r.stdout + r.stderr)
        out = r.stdout + r.stderr
        if bk is None:
            bad.append("toy: no balance KPIs")
        else:
            if bk.get("material_available") != 1:
                bad.append("toy: material must stay available")
            if any(k.startswith("element_") for k in bk):
                bad.append("toy: elemental KPIs fabricated for toy formulas")
            if bk.get("energy_balance_available") != 0:
                bad.append("toy: energy must be honestly unavailable")
            if "not the exact derivative" not in out:
                bad.append("toy: the energy refusal does not name the model"
                           " reason")
            meta = (case / "balanceTrajectory.meta").read_text()
            if "elements_available,0" not in meta or "compA" not in meta:
                bad.append("toy: metadata sidecar does not name the withheld"
                           " elemental claim")

        # ---- 7+8. relevance: an absent PARTIAL component never
        #      contaminates; a late-entering one promotes the state --------
        case, r = make_case(tmp, "ghostAbsent", BASE, real_formulas=True,
                            add_ghost=True)
        if r.returncode != 0:
            bad.append("ghostAbsent: failed to run: "
                       + (r.stdout + r.stderr)[-300:])
        else:
            meta = (case / "balanceTrajectory.meta").read_text()
            if "elements_partial,0" not in meta:
                bad.append("ghostAbsent: an always-absent PARTIAL component"
                           " contaminated the ledger")
            if "elements_available,1" not in meta:
                bad.append("ghostAbsent: elements must stay available")

        case, r = make_case(tmp, "lateEntry", BASE, real_formulas=True,
                            partial_late_B=True)
        if r.returncode != 0:
            bad.append("lateEntry: failed to run: "
                       + (r.stdout + r.stderr)[-300:])
        else:
            meta = (case / "balanceTrajectory.meta").read_text()
            if "elements_partial,1" not in meta:
                bad.append("lateEntry: a component entering at t > 0 must"
                           " promote the PARTIAL state (final meta)")
            if "compB" not in meta:
                bad.append("lateEntry: the promoted species is not named")

    if bad:
        print("CTRL-BALANCE GATE FAILED (%d):" % len(bad))
        for b in bad:
            print("  " + b)
        return 1
    print("ctrl-balance gate: accepted-state ledger closes mass+atoms"
          " (washout, dn!=0 reaction, adaptive rtol-insensitive); claims"
          " honest (elements withheld on toys, energy refused with reason)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
