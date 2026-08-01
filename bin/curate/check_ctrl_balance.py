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
  6. ENERGY, both ways.  A toy case (compA/compB carry no formation datum
     ON PURPOSE) must still refuse, naming the model reason.  ctrl11, whose
     four real species DO carry the elements datum, must CLAIM: the vessel
     stores H(n,T), the ODE is its exact derivative, and the run reports the
     closure.  The residual there is quadrature, not physics -- so halving
     deltaT must cut it by about four (the trapezoid's own order).  A claim
     that nothing can withdraw, and a refusal nothing can lift, would both
     be decoration.
  (7. Mixed ODE/non-ODE adaptive refusal exists in code; not provable from
     today's corpus -- every ctrl unit type is ODE-form.)

Exit 1 listing failures."""
import hashlib
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
CANON = ROOT / "tutorials" / "ctrl" / "ctrl11_esterification_jacket"


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

        # ---- 6b. the CANONICAL route: the claim exists, and is earned ----
        #  Run ctrl11 twice, at its shipped step and at half of it.  The
        #  claim must appear, close, and the residual must fall like the
        #  trapezoid it comes from.
        canon = {}
        for dt in ("0.5", "0.25"):
            c = Path(tmp) / ("canon" + dt.replace(".", "_"))
            shutil.copytree(CANON, c)
            cd = c / "system" / "controlDict"
            cd.write_text(re.sub(r"^deltaT\s+\S+;", "deltaT %s;" % dt,
                                 cd.read_text(), flags=re.M))
            rr = subprocess.run([str(CTRL)], cwd=str(c), capture_output=True,
                                text=True, timeout=900)
            if rr.returncode != 0:
                bad.append("canonical dt=%s: exited %d -- %s"
                           % (dt, rr.returncode, (rr.stdout + rr.stderr)[-400:]))
                continue
            out = rr.stdout + rr.stderr
            bk = balance_kpis(out)
            if bk is None:
                bad.append("canonical dt=%s: no balance KPIs" % dt)
                continue
            canon[dt] = (bk, out, c)

        if "0.5" in canon:
            bk, out, c = canon["0.5"]
            if bk.get("energy_balance_available") != 1:
                bad.append("canonical: ctrl11's four species all carry the"
                           " elements datum, so the first-law ledger must"
                           " CLAIM -- a refusal here means the canonical"
                           " route did not engage.")
            if bk.get("energy_functional_H") != 1:
                bad.append("canonical: the claimed functional must be named H")
            rel = bk.get("energy_closure_rel")
            if rel is None or rel > 1.0e-5:
                bad.append("canonical: energy closure %s -- the ODE IS the"
                           " derivative of the stored H, so anything above"
                           " quadrature error means the two surfaces have"
                           " drifted apart." % rel)
            if "CANONICAL route" not in out:
                bad.append("canonical: the route taken is not announced."
                           "  Two different energy equations must never be"
                           " chosen in silence.")
            meta = (c / "balanceTrajectory.meta").read_text()
            if "energy_available,1" not in meta:
                bad.append("canonical: the metadata sidecar does not carry"
                           " the claim the KPIs make")
            if "energy_functional,H" not in meta or "elements" not in meta:
                bad.append("canonical: the sidecar claims energy without"
                           " naming the functional and the datum")
            head = (c / "balanceTrajectory.csv").read_text().splitlines()[0]
            for col in ("energy_stored_kJ", "energy_residual_kJ"):
                if col not in head:
                    bad.append("canonical: trajectory column '%s' missing --"
                               " the columns must exist exactly where the"
                               " claim does." % col)

        if len(canon) == 2:
            r1 = canon["0.5"][0].get("energy_closure_rel")
            r2 = canon["0.25"][0].get("energy_closure_rel")
            if r1 and r2 and not (2.5 < r1 / r2 < 6.0):
                bad.append("canonical: halving deltaT changed the energy"
                           " residual by x%.2f, not the ~4 of a second-order"
                           " trapezoid.  The residual is supposed to be"
                           " QUADRATURE; a different order means it is"
                           " something else." % (r1 / r2))

        # ---- 6c. the discriminating fixture: a T-DEPENDENT liquid Cp ------
        #
        #  ctrl11's four species all declare a CONSTANT liquid Cp, and with a
        #  constant Cp the exact inlet term INT(Cp dT) and the linearisation
        #  Cp(T)*(T_in - T) are the same number.  So the shipped case proves
        #  the ledger identity and the T-dependent heat of reaction, and
        #  proves NOTHING about the inlet term -- a fact worth stating rather
        #  than discovering later.
        #
        #  This fixture makes the difference exist: ethanol's liquid Cp gains
        #  a slope, its sealed hash is re-stamped (the case is sealed, and a
        #  gate that leaned on seal divergence being non-fatal would be
        #  leaning on a decision that is still open), and the claim must
        #  still close.  It closes only if the ODE's inlet term really is the
        #  enthalpy difference, because dh_liq/dT IS Cp_liq by construction
        #  (ThermoPackage::speciesPhaseEnthalpy).
        cvar = Path(tmp) / "canonTdep"
        shutil.copytree(CANON, cvar)
        eth = cvar / "constant" / "components" / "ethanol.dat"
        txt = eth.read_text()
        txt = re.sub(r"(liquidHeatCapacity\s*\{[^}]*?coefficients\s*)\([^)]*\)",
                     r"\1(60.0  0.15)", txt, count=1, flags=re.S)
        eth.write_text(txt)
        man = cvar / "constant" / "propertyManifest"
        mtxt = man.read_text()
        newhash = hashlib.sha256(eth.read_bytes()).hexdigest()
        mtxt = re.sub(r'("components/ethanol\.dat"\s*\{[^}]*?sha256\s*)"[0-9a-f]{64}"',
                      r'\1"%s"' % newhash, mtxt, count=1, flags=re.S)
        man.write_text(mtxt)
        rr = subprocess.run([str(CTRL)], cwd=str(cvar), capture_output=True,
                            text=True, timeout=900)
        if rr.returncode != 0:
            bad.append("canonicalTdep: exited %d -- %s"
                       % (rr.returncode, (rr.stdout + rr.stderr)[-400:]))
        else:
            out = rr.stdout + rr.stderr
            if "diverge" in out.lower() or "sha256" in out.lower():
                bad.append("canonicalTdep: the fixture did not re-stamp the"
                           " seal cleanly -- fix the fixture, do not let the"
                           " gate depend on a seal warning.")
            bk = balance_kpis(out)
            if bk is None or bk.get("energy_balance_available") != 1:
                bad.append("canonicalTdep: the claim disappeared when a"
                           " liquid Cp gained a slope")
            elif bk.get("energy_closure_rel", 1.0) > 1.0e-5:
                bad.append("canonicalTdep: energy closure %s with a"
                           " T-dependent Cp.  The inlet term must be the"
                           " enthalpy DIFFERENCE, not Cp(T) times a"
                           " temperature difference."
                           % bk.get("energy_closure_rel"))

        # ---- 6d. the MIXTURE-H route: the electrolyte tank claims --------
        #  ctrl10's salt has no per-species leg (aqueousSaltEnthalpy(m,T) is
        #  mixture-level), so the vessel stores TOTAL H as a state and the
        #  claim must come from THAT route, announced as such, and close.
        c10 = ROOT / "tutorials" / "ctrl" / "ctrl10_brine_concentration"
        rr = subprocess.run([str(CTRL)], cwd=str(c10), capture_output=True,
                            text=True, timeout=900)
        if rr.returncode != 0:
            bad.append("mixtureH: ctrl10 exited %d -- the electrolyte tank"
                       " must RUN now (the refusal was retired 2026-08-01)"
                       % rr.returncode)
        else:
            out = rr.stdout + rr.stderr
            if "MIXTURE-H route" not in out:
                bad.append("mixtureH: ctrl10 did not announce the MIXTURE-H"
                           " route -- two energy equations must never be"
                           " chosen in silence")
            bk = balance_kpis(out)
            if bk is None or bk.get("energy_balance_available") != 1:
                bad.append("mixtureH: ctrl10's first-law ledger must CLAIM"
                           " (functional H stored as a state)")
            elif bk.get("energy_closure_rel", 1.0) > 1.0e-8:
                bad.append("mixtureH: ctrl10 energy closure %s -- the vessel"
                           " integrates dH/dt against the same faces the"
                           " ledger prices; anything above integration noise"
                           " means two surfaces."
                           % bk.get("energy_closure_rel"))

        #  And the negative: a toy case must have no energy columns at all.
        case, r = make_case(tmp, "toyCols", BASE)
        if r.returncode == 0:
            head = (case / "balanceTrajectory.csv").read_text().splitlines()[0]
            if "energy_stored_kJ" in head:
                bad.append("toy: energy columns written for a ledger that"
                           " refuses the energy claim")

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
          " honest (elements withheld on toys, energy refused without a"
          " datum and CLAIMED with one -- residual second-order in deltaT)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
