#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Variable-volume CSTR gate (DEV.md 4c C205, slice 2): `dynamicCSTR` with
`operation { volumeMode variable; }` -- a reactor with a LEVEL.  Its closed
forms hold, its ledgers close, its two loops work on one unit, the jacket area
follows the liquid, and a vessel that cannot exist is REFUSED.

Arms (every one re-runs the engine; nothing is read from a stored result):

  (a) FILL AND REACT, closed form (unsteady06_reactor_fill_and_react).  The
      declared numbers (feed F, rate constant k = A with Ea = 0, the heel read
      from the run's first row) give, for a first-order isomerisation that
      changes no moles,
          n_A(t) = F/k + (n_A0 - F/k) exp(-k t)
          n_B(t) = n_A0 + n_B0 + F t - n_A(t)
          M(t)   = M0 + MW F t              (both isomers share one MW)
          V(t)   = M(t)/rho_run(t),  h(t) = V(t)/area,  c_A = n_A/V
      recomputed HERE and held to the run's rows (n: 1e-6 relative; V, h:
      1e-6 relative).  Also the energy route is announced CANONICAL and the
      level rises monotonically.
  (b) LEDGERS.  Both witnesses CLAIM mass and energy (functional H) and close:
      mass_closure_rel and energy_closure_rel <= 1e-6.
  (c) THE RATE USES THE CURRENT VOLUME.  A first-order law cannot see the
      volume (r V = k n_A), so arm (a) cannot prove it.  A variant of the
      witness with a SECOND-ORDER law (r V = k n_A^2 / V) is integrated here
      by an independent RK4 in Python on V = M(t)/rho_run(t) and the engine's
      n_A held to it (1e-3 relative); a vessel that kept the heel's volume in
      the rate would be off by a factor of ~10.
  (d) TWO LOOPS, ONE UNIT (ctrl22_reactor_level_and_temperature).  After the
      inflow step the PI level loop returns the level to its setpoint
      (|h - SP| < 2e-3 m at the end) with a peak excursion below the P-only
      offset bound dF/|Kp| (recomputed from the declared gains), the
      temperature loop holds T (|T - SP| < 0.5 K at the end), BOTH
      manipulated variables moved, and the engine's announced starting jacket
      area equals UA A_w(h0)/A_w(H) recomputed from the declared geometry.
  (e) ROUTES.  The same variable-volume vessel on the other two energy routes:
      a MIXTURE-H copy of ctrl10 and the Cp/convective copy of ctrl01 are
      built as temporary variants; the route announced must be the one probed,
      the mass ledger closes on both, the energy ledger CLAIMS and closes on
      the mixture-H route and is WITHHELD (named) on the Cp route.  The
      canonical route is arm (b).
  (f) REFUSALS, by name, at exit != 0: a vessel drained by a larger outflow
      RAN DRY; one filling with no outflow OVERFLOWED; an unknown volumeMode;
      `V` declared beside `level`; `mv F_out` on a constant-volume vessel.
      Each message must carry its word; an exit 0 or another message fails.
  (g) SOURCE.  The variable branch of DynamicCSTR.cpp CALLS the shared home
      (VariableVolumeHoldup: liquidState, level, wettedArea,
      valveVolumetricFlow, refuseDryOrOverflow) and carries NO copy of its
      arithmetic (no gravity constant, no pi D^2/4).

SABOTAGE RECORD (performed by hand 2026-11-03, restored, rebuilt):
  the reaction term of DynamicCSTR::derivatives_ evaluated at the heel's
  volume V_ instead of the current volume (V = V_): arm (a) and the ledgers
  stayed GREEN (a first-order law is blind to the volume -- r V = k n_A), and
  arm (c) FAILED (engine n_A off the independent second-order integration by
  7.3e-01 relative).  The arm that matters is therefore (c), and it exists
  because (a) alone cannot see this sabotage.

Exit 1 listing failures."""
import csv
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc"
SEMI = BIN / "choupoSemiContinuous"
CTRL = BIN / "choupoCtrl"
UNS = ROOT / "tutorials" / "unsteady" / "unsteady06_reactor_fill_and_react"
CTL = ROOT / "tutorials" / "ctrl" / "ctrl22_reactor_level_and_temperature"
C01 = ROOT / "tutorials" / "ctrl" / "ctrl01_cstr_temp_control"
C10 = ROOT / "tutorials" / "ctrl" / "ctrl10_brine_concentration"
SRC = ROOT / "src" / "unitOperations" / "dynamic" / "DynamicCSTR.cpp"
PI = math.pi


def make_case(tmp, name, src):
    case = Path(tmp) / name

    def ignore(_d, names):
        out = []
        for nm in names:
            if nm.startswith("log.choupo") or nm in ("reports", "latest", "expected"):
                out.append(nm)
            elif nm.endswith(".csv") or nm.endswith(".meta"):
                out.append(nm)
            elif nm != "0" and nm.replace(".", "", 1).isdigit():
                out.append(nm)
        return out

    shutil.copytree(src, case, ignore=ignore)
    return case


def run(binary, case):
    r = subprocess.run([str(binary), str(case)], capture_output=True, text=True,
                       cwd=ROOT)
    return r, r.stdout + r.stderr


def kpis(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1))["kpis"] if m else None


def trajectory(case):
    with open(case / "trajectory.csv") as f:
        return list(csv.DictReader(f))


def col(rows, name):
    key = next((k for k in rows[0] if k == name or k.endswith("." + name)), None)
    if key is None:
        raise KeyError(f"trajectory.csv has no column '{name}' (columns: {list(rows[0])})")
    return [float(r[key]) for r in rows]


def scalar(text, key):
    m = re.search(rf"(?m)^\s*{key}\s+([-+0-9.eE]+)", text)
    if not m:
        raise KeyError(key)
    return float(m.group(1))


def edit(path, fn):
    t = path.read_text()
    t2 = fn(t)
    assert t2 != t, f"edit changed nothing in {path}"
    path.write_text(t2)


def ledger(tag, out, bad, want_energy=True):
    bk = (kpis(out) or {}).get("balance")
    if bk is None:
        bad.append(f"{tag}: no balance block in the result")
        return None
    if bk.get("material_available") != 1:
        bad.append(f"{tag}: material ledger not claimed")
    mc = bk.get("mass_closure_rel", 1)
    if not mc <= 1e-6:
        bad.append(f"{tag}: mass closure {mc} (> 1e-6)")
    ec = bk.get("energy_closure_rel")
    if want_energy:
        if bk.get("energy_balance_available") != 1 or bk.get("energy_functional_H") != 1:
            bad.append(f"{tag}: the vessel must CLAIM the energy ledger (functional H):"
                       f" energy_balance_available={bk.get('energy_balance_available')}")
        elif not (ec is not None and ec <= 1e-6):
            bad.append(f"{tag}: energy closure {ec} (> 1e-6)")
    else:
        if bk.get("energy_balance_available") == 1:
            bad.append(f"{tag}: the Cp/convective route must WITHHOLD the energy ledger")
    return mc, ec


def interp(xs, ys, x):
    if x <= xs[0]:
        return ys[0]
    for i in range(1, len(xs)):
        if x <= xs[i]:
            f = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
            return ys[i - 1] + f * (ys[i] - ys[i - 1])
    return ys[-1]


def main():
    bad, notes = [], []
    for b in (SEMI, CTRL):
        if not b.exists():
            print(f"check_dynamic_cstr_level: cannot run -- {b} missing (make all)")
            return 1

    with tempfile.TemporaryDirectory(prefix="choupo-cstrlevel-") as tmp:
        # ---- (a)+(b) fill and react, closed form ----------------------------------
        case = make_case(tmp, "fill", UNS)
        r, out = run(SEMI, case)
        if r.returncode != 0:
            bad.append("unsteady06: failed to run:\n" + out[-600:])
        else:
            ledger("unsteady06", out, bad)
            if "CANONICAL" not in out:
                bad.append("unsteady06: the canonical energy route is not announced")
            fl = (case / "system" / "flowsheetDict").read_text()
            rx = (case / "constant" / "reactions").read_text()
            Din = scalar(fl, "diameter")
            area = PI * Din * Din / 4.0
            F = scalar((case / "0" / "feed").read_text(), "2Methyl1Propanol")
            k = scalar(rx, "A")
            if scalar(rx, "Ea") != 0.0:
                bad.append("unsteady06: Ea must be 0 for the closed form to hold")
            rows = trajectory(case)
            t = col(rows, "time") if "time" in rows[0] else col(rows, "t")
            nA = col(rows, "n_2Methyl1Propanol")
            nB = col(rows, "n_2Butanol")
            rho = col(rows, "density")
            vol = col(rows, "volume")
            lev = col(rows, "level")
            MW = 74.1216   # both isomers: C4H10O (checked below against the run)
            M0 = (nA[0] + nB[0]) * MW
            worst_n = worst_v = worst_h = 0.0
            for i in range(len(t)):
                nA_cf = F / k + (nA[0] - F / k) * math.exp(-k * t[i])
                nB_cf = nA[0] + nB[0] + F * t[i] - nA_cf
                V_cf = (M0 + MW * F * t[i]) / rho[i]
                worst_n = max(worst_n, abs(nA[i] - nA_cf) / max(nA_cf, 1e-30),
                              abs(nB[i] - nB_cf) / max(abs(nB_cf), 1e-3))
                worst_v = max(worst_v, abs(vol[i] - V_cf) / V_cf)
                worst_h = max(worst_h, abs(lev[i] - V_cf / area) / (V_cf / area))
            for nm, w in (("n_A/n_B", worst_n), ("volume", worst_v), ("level", worst_h)):
                if w > 1e-6:
                    bad.append(f"unsteady06: {nm} departs from its closed form by {w:.2e} (> 1e-6)")
            if any(b < a - 1e-12 for a, b in zip(lev, lev[1:])):
                bad.append("unsteady06: the filling level is not monotone")
            notes.append(f"fill: n err {worst_n:.1e}, V err {worst_v:.1e}, h {lev[0]:.3f}->{lev[-1]:.3f} m,"
                         f" n_A {nA[-1]:.4f} (closed {F / k + (nA[0] - F / k) * math.exp(-k * t[-1]):.4f})")

            # ---- (c) the rate uses the CURRENT volume -----------------------------
            case2 = make_case(tmp, "second", UNS)
            k2 = 3.7e-5   # m3/(kmol s): k2 c_A0 (~10.8 kmol/m3) = 4e-4 1/s at the heel
            edit(case2 / "constant" / "reactions",
                 lambda s: re.sub(r"order 1;", "order 2;", re.sub(r"(?m)^(\s*A\s+)[^;]+;", rf"\g<1>{k2};", s)))
            edit(case2 / "system" / "controlDict",
                 lambda s: re.sub(r"writeInterval\s+[^;]+;", "writeInterval   10;", s))
            r2, out2 = run(SEMI, case2)
            if r2.returncode != 0:
                bad.append("unsteady06 second-order variant: failed to run:\n" + out2[-600:])
            else:
                rows2 = trajectory(case2)
                t2 = col(rows2, "time") if "time" in rows2[0] else col(rows2, "t")
                nA2 = col(rows2, "n_2Methyl1Propanol")
                rho2 = col(rows2, "density")
                M02 = (nA2[0] + col(rows2, "n_2Butanol")[0]) * MW

                def V_of(tt):
                    return (M02 + MW * F * tt) / interp(t2, rho2, tt)

                def f(tt, n):
                    return F - k2 * n * n / V_of(tt)

                n, tt, h = nA2[0], 0.0, 0.5
                worst = 0.0
                j = 1   # row 0 IS the initial state
                while tt < t2[-1] - 1e-9:
                    k1_ = f(tt, n)
                    kk2 = f(tt + h / 2, n + h / 2 * k1_)
                    kk3 = f(tt + h / 2, n + h / 2 * kk2)
                    kk4 = f(tt + h, n + h * kk3)
                    n += h / 6 * (k1_ + 2 * kk2 + 2 * kk3 + kk4)
                    tt += h
                    while j < len(t2) and t2[j] <= tt + 1e-9:
                        worst = max(worst, abs(n - nA2[j]) / n)
                        j += 1
                if worst > 1e-3:
                    bad.append(f"second-order variant: engine n_A departs from the independent"
                               f" integration on the CURRENT volume by {worst:.2e} (> 1e-3) --"
                               " the rate is not using the current volume")
                # what a frozen heel volume would have given (the sabotage's size)
                V0 = (M02) / rho2[0]
                nf, tt = nA2[0], 0.0
                while tt < t2[-1] - 1e-9:
                    g = lambda x: F - k2 * x * x / V0
                    a1 = g(nf); a2 = g(nf + h / 2 * a1); a3 = g(nf + h / 2 * a2); a4 = g(nf + h * a3)
                    nf += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4)
                    tt += h
                gap = abs(nf - nA2[-1]) / nA2[-1]
                if gap < 0.1:
                    bad.append(f"second-order variant is not discriminating (a frozen-volume rate would"
                               f" differ by only {gap:.1e})")
                notes.append(f"2nd order: vs independent RK4 {worst:.1e}; frozen-heel volume would differ {gap:.0%}")

        # ---- (b)+(d) two loops, one unit --------------------------------------------
        case = make_case(tmp, "loops", CTL)
        r, out = run(CTRL, case)
        if r.returncode != 0:
            bad.append("ctrl22: failed to run:\n" + out[-600:])
        else:
            ledger("ctrl22", out, bad)
            fl = (case / "system" / "flowsheetDict").read_text()
            sps = [float(x) for x in re.findall(r"(?m)^\s*setpoint\s+([-+0-9.eE]+)", fl)]
            kps = [float(x) for x in re.findall(r"(?m)^\s*Kp\s+([-+0-9.eE]+)", fl)]
            sp_h, sp_T = sps[0], sps[1]
            kp_h = kps[0]
            dF = scalar(fl, "step")
            Din, Hv, UA = scalar(fl, "diameter"), scalar(fl, "height"), scalar(fl, "UA")
            rows = trajectory(case)
            lv, T = col(rows, "level"), col(rows, "T")
            Fo, Tj = col(rows, "F_out"), col(rows, "TC1.MV")
            if abs(lv[-1] - sp_h) > 2e-3:
                bad.append(f"ctrl22: final level {lv[-1]:.5f} m is not at the setpoint {sp_h} m")
            peak = max(abs(v - sp_h) for v in lv)
            if not peak < dF / abs(kp_h):
                bad.append(f"ctrl22: peak level excursion {peak:.4f} m exceeds the P-only"
                           f" offset bound dF/|Kp| = {dF / abs(kp_h):.4f} m")
            if abs(T[-1] - sp_T) > 0.5:
                bad.append(f"ctrl22: final T {T[-1]:.3f} K is not at the setpoint {sp_T} K")
            if (max(Fo) - min(Fo)) < 1e-4 or (max(Tj) - min(Tj)) < 1.0:
                bad.append("ctrl22: both manipulated variables must move (F_out span"
                           f" {max(Fo) - min(Fo):.2e} kmol/s, T_jacket span {max(Tj) - min(Tj):.2f} K)")
            area = PI * Din * Din / 4.0
            Aw = lambda h: PI * Din * h + area
            h0 = lv[0]
            m = re.search(r"now UA = ([-+0-9.eE]+) W/K", out)
            if not m:
                bad.append("ctrl22: the starting jacket area is not announced")
            else:
                want = UA * Aw(h0) / Aw(Hv)
                got = float(m.group(1))
                if abs(got - want) > 1e-4 * want:
                    bad.append(f"ctrl22: announced UA {got:.4f} W/K vs UA A_w(h0)/A_w(H) = {want:.4f}")
            notes.append(f"loops: end h-SP {lv[-1] - sp_h:+.1e} m, peak {peak:.4f} m (bound {dF / abs(kp_h):.4f}),"
                         f" end T-SP {T[-1] - sp_T:+.3f} K")

        # ---- (e) the other two energy routes ----------------------------------------
        # mixture-H route: ctrl10 (Pitzer brine), made variable-volume
        c10 = make_case(tmp, "mixH", C10)
        try:
            fp = c10 / "system" / "flowsheetDict"
            ip = c10 / "0" / "internalStates" / "tank"
            flows = re.search(r"componentMolarFlows\s*\{([^}]*)\}",
                              (c10 / "0" / "feed").read_text(), re.S).group(1)
            Ftot = sum(float(x) for x in re.findall(r"([-+0-9.eE]+)\s*kmol/s", flows))
            vm = ("            volumeMode variable;\n            geometry { shape verticalCylinder;"
                  " diameter 0.5 m; height 1.0 m; }\n"
                  f"            outflow {{ mode flow; F {Ftot!r} kmol/s; }}\n")
            txt = fp.read_text()
            mo = re.search(r"operation\s*\{", txt)
            fp.write_text(txt[:mo.end()] + "\n" + vm + txt[mo.end():])
            ip.write_text(re.sub(r"(?m)^\s*V\s+[^;]+;[^\n]*\n", "", ip.read_text()))
            r, out = run(CTRL, c10)
            if r.returncode == 0 or "cannot price a liquid density" not in out:
                bad.append("mixture-H variant: a salt with no Vliq must REFUSE by name"
                           " (no liquid density assumed): " + out[-300:])
            # the PROBE: give NaCl a molar volume (2.7e-5 m3/mol, the crystal's -- an ARITHMETIC probe,
            # not a claim about brine) and adopt the edited record so the seal does not object
            nacl = c10 / "constant" / "components" / "NaCl.dat"
            edit(nacl, lambda t: re.sub(r"(?m)^(MW\s+[^;]+;)", r"\g<1>\nVliq        2.7e-5;", t, count=1))
            man = c10 / "constant" / "propertyManifest"
            edit(man, lambda t: re.sub(r'("components/NaCl\.dat"\s*\{)[^}]*\}',
                                       r'\g<1> type adopted; adoptedAt "2026-11-03"; }', t))
            r, out = run(CTRL, c10)
            if r.returncode != 0:
                bad.append("mixture-H variant (ctrl10): failed to run:\n" + out[-800:])
            else:
                if "MIXTURE-H" not in out:
                    bad.append("mixture-H variant: the route announced is not MIXTURE-H")
                ledger("mixture-H variant", out, bad)
                notes.append("mixture-H route: ledgers closed")
        except Exception as e:  # a gate that cannot build its probe must say so, not pass
            bad.append(f"mixture-H variant could not be built: {e!r}")

        # Cp/convective route: ctrl01 (toy species)
        c01 = make_case(tmp, "cp", C01)
        try:
            fp = c01 / "system" / "flowsheetDict"
            ip = c01 / "0" / "internalStates" / "reactor"
            Ftot = scalar((c01 / "0" / "feed").read_text(), "compA")
            vm = ("            volumeMode variable;\n            geometry { shape verticalCylinder;"
                  " diameter 0.2 m; height 1.0 m; }\n"
                  f"            outflow {{ mode flow; F {Ftot} kmol/s; }}\n")
            txt = fp.read_text()
            mo = re.search(r"operation\s*\{", txt)
            fp.write_text(txt[:mo.end()] + "\n" + vm + txt[mo.end():])
            it = ip.read_text()
            it = re.sub(r"(?m)^\s*V\s+[^;]+;\n", "", it)
            ip.write_text(it)
            r, out = run(CTRL, c01)
            if r.returncode != 0:
                bad.append("Cp/convective variant (ctrl01): failed to run:\n" + out[-800:])
            else:
                if "Cp/convective" not in out:
                    bad.append("Cp variant: the route announced is not Cp/convective")
                ledger("Cp variant", out, bad, want_energy=False)
                notes.append("Cp route: mass closes, energy withheld")
        except Exception as e:
            bad.append(f"Cp variant could not be built: {e!r}")

        # ---- (f) refusals ----------------------------------------------------------------
        def probe(tag, word, edit_fn, binary=SEMI, src=UNS):
            c = make_case(tmp, tag, src)
            edit_fn(c)
            rr, oo = run(binary, c)
            if rr.returncode == 0:
                bad.append(f"refusal {tag}: ran to exit 0 -- must be refused")
            elif word not in oo:
                bad.append(f"refusal {tag}: refused, but not by name ('{word}' absent): {oo[-300:]}")

        def sub_outflow(F):
            return lambda c: edit(c / "system" / "flowsheetDict",
                                  lambda s: re.sub(r"(mode\s+flow;\s*F\s+)[^;]+;", rf"\g<1>{F} kmol/s;", s))

        probe("dry", "RAN DRY", sub_outflow(0.5))
        probe("overflow", "OVERFLOWED", lambda c: edit(
            c / "system" / "controlDict", lambda s: re.sub(r"endTime\s+[^;]+;", "endTime 4000;", s)))
        probe("badmode", "volumeMode", lambda c: edit(
            c / "system" / "flowsheetDict", lambda s: s.replace("volumeMode  variable;", "volumeMode  elastic;")))
        probe("twice", "TWICE", lambda c: edit(
            c / "0" / "internalStates" / "reactor", lambda s: s.replace("level       0.02;", "level       0.02;\n    V 0.001;")))

        def mv_on_constant(c):
            edit(c / "system" / "flowsheetDict",
                 lambda t: t.replace("mv T_jacket;", "mv F_out;"))

        probe("mvconst", "volumeMode variable", mv_on_constant, binary=CTRL, src=C01)

    # ---- (g) source arm -------------------------------------------------------------------
    src = re.sub(r"//.*", "", SRC.read_text())
    for need in ("VVH::liquidState(", "VVH::level(", "VVH::wettedArea(",
                 "VVH::valveVolumetricFlow(", "VVH::refuseDryOrOverflow("):
        if need not in src:
            bad.append(f"source: DynamicCSTR.cpp does not call {need[:-1]} -- the variable-volume"
                       " arithmetic must be CALLED from VariableVolumeHoldup, not copied")
    for banned in (r"\bgravity\b(?!\w)(?<!VVH::gravity)", r"9\.80665", r"0\.25\s*\*\s*pi", r"M_PI",
                   r"Cv\s*\*\s*opening", r"std::sqrt\(\s*dP"):
        if re.search(banned, src):
            bad.append(f"source: DynamicCSTR.cpp carries a copy of the shared arithmetic ({banned})")

    if bad:
        print("check_dynamic_cstr_level: FAILED")
        for b in bad:
            print("  - " + b)
        return 1
    print("check_dynamic_cstr_level: OK -- variable-volume dynamicCSTR: fill-and-react equals its closed"
          " form (n, V, h), the second-order rate uses the CURRENT volume, both witnesses CLAIM and close"
          " mass AND energy, PI level + PI temperature hold one unit after an inflow step, the jacket area"
          " follows the wetted wall, the mixture-H and Cp routes are announced and ledgered as probed,"
          " dry / overflow / unknown mode / V beside level / mv F_out on a constant vessel are refused by"
          f" name, arithmetic called from the shared home [{'; '.join(notes)}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
