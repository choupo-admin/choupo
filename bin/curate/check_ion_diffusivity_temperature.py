#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: an ion's D0 is a 25 C value, and every membrane reader corrects it
to the unit's temperature by Stokes-Einstein on the package's OWN liquid
viscosity -- or says it did not.
    bin/curate/check_ion_diffusivity_temperature.py

WHY THIS EXISTS.  C145 found that Choupo's DSPM-DE read the species' 25 C
D0 at any temperature while NanoFiltran corrects it (0.38 % on every D at
298 K, +3.0 % on the paper's trace Na+), and the commander ruled (DEV.md 4c
C145): D_i(T) = D_i0 (T/T0)(mu(T0)/mu(T)), T0 = 298.15 K, mu the package's
liquid viscosity, announced, the reference temperature moving no number.
Built in C148, ONE home: thermo/transport/StokesEinstein.H, which the
membrane Polarisation object, the DSPM-DE pore and the electrodialysis
stack (which had the correction first, as a literal) all call.

WHAT THIS GATE CHECKS (every case is RUN here):
  (a) THE ABSENCE IS SAID.  membrane14 (293.15 K, no liquid-viscosity model)
      publishes an `approximation` advisory saying its D0 is NOT
      temperature-corrected and naming the declaration that would.
  (b) THE FACTOR, RECOMPUTED.  A membrane14 twin that declares `transport {
      liquid { viscosity { model Vogel; } } }` prints the factor, and it
      equals (T/298.15) exp(B/(298.15 - C) - B/(T - C)) from the case's own
      water Vogel record, computed here, to 1e-6; and the per-ion film
      coefficient at the inlet moves by exactly that factor to the power
      1 - c (Schock & Miquel Sh ~ Sc^c, c = 0.25, k = Sh D/d_h ~ D^0.75), to
      1e-9 -- the D reaches the film.
  (c) THE REFERENCE TEMPERATURE MOVES NOTHING.  Twins at 298.15 K with and
      without the model publish the same streams, KPIs and profiles BIT FOR
      BIT, and neither carries a D(T) advisory.
  (d) THE PORE.  A twin of the paper case's stiff op N50 (part C, the former
      nanofiltran02; one op, 50 nodes, T = 298 K, no views) with the
      model declared prints the factor this gate recomputes and its permeate
      Na+ moves (|dc/c| > 1e-3: the trace ion amplifies a 0.4 % D); without
      it the op is unchanged from the shipped case's own op.
  (e) THE STACK.  ed04's `stokesEinsteinFactor` KPI equals the factor
      recomputed here from its water Vogel record and T, to 1e-9 -- the
      electrodialysis stack reads the same home.

WHAT THIS GATE DOES **NOT** COVER.  Whether Stokes-Einstein is right for an
ion (it assumes a temperature-independent hydrodynamic radius); a neutral
solute's diffusivity (the unit's own D_solute, priced elsewhere); the
massTransfer block's own `viscosity`, which prices Re and Sc and is NOT
reconciled with the package's (a case can declare two viscosities).  No
membrane case in the corpus declares a liquid-viscosity model, so no shipped
golden exercises the correction.

SABOTAGE-VERIFIED 2026-10-24 (by hand, rebuilt, run, restored):
  S1  StokesEinstein.cpp: muRef evaluated at T instead of 298.15  CAUGHT by
      (b), (d), (e) (factor T/T0 only).
  S2  Polarisation.cpp: `* se.value` dropped                       CAUGHT by
      (b) ONLY (the film ratio is 1; the pore and the stack still correct).
  S3  StokesEinstein.cpp: the not-priced announcement removed     CAUGHT by
      (a) ONLY.
"""

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate" / "nanofiltran"))
import paper_case  # noqa: E402
import case_records  # noqa: E402
M14 = ROOT / "tutorials/steady/membranes/membrane14_polarisation_multiionic"
#  the NanoFiltran paper's one case (DEV.md 4c C147); its part C is the former
#  nanofiltran02, the stiff case of Table 2
NF02 = ROOT / "tutorials/props/membrane/nanofiltran_geraldesAlves2008"
ED04 = ROOT / "tutorials/steady/electrodialysis/ed04_limiting_current_multiionic"
T0 = 298.15

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


def run(case, binary):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(ROOT / binary), str(case)], capture_output=True, text=True,
                       timeout=900, env=env, cwd=str(case))
    out = r.stdout + r.stderr
    js = None
    if "<<<Choupo:result-begin>>>" in out:
        js = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                        .split("<<<Choupo:result-end>>>")[0])
    return r.returncode, out, js


def copy_case(src, dst):
    #  C413: a case that references the catalogue is materialised first (every pinned record copied in),
    #  then unsealed as before, so the copy reads exactly the records the original read.
    case_records.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "*.csv"))
    (Path(dst) / "constant/propertyManifest").unlink(missing_ok=True)


def declare_viscosity(case):
    p = Path(case) / "constant/thermoPhysPropDict"
    p.write_text(p.read_text() + "\ntransport\n{\n    liquid\n    {\n"
                 "        viscosity { model Vogel; }\n    }\n}\n")


def plain_twin(d, vogel=False, T=None):
    """C402: membrane14 PRICES ITS FILM from a correlation, so it declares a stated liquid viscosity in its
    property dictionary, and a declared viscosity activates the Stokes-Einstein correction of the ion D0 --
    the absence this gate pins (arm (a)) can no longer be reached by that case.  It is reached by this twin:
    the same ions, the same coupling (`ionCoupling electroneutral` reads every ion's D0), a CONSTANT film
    (k_film) that needs no viscosity, and no liquid-viscosity declaration at all."""
    copy_case(M14, d)
    fl = d / "system/flowsheetDict"
    t = fl.read_text()
    t = re.sub(r"massTransfer\s*\{[^}]*\}", "", t)
    t = re.sub(r"pressureDrop\s*\{[^}]*\}", "", t)
    t = t.replace("nNodes           20;", "nNodes           20;\n            k_film           5.0e-5;\n            dP_feed_total    0.5 bar;", 1)
    fl.write_text(t)
    th = d / "constant/thermoPhysPropDict"
    th.write_text(re.sub(r"^transport\s*\{.*?^\}\n", "", th.read_text(), flags=re.S | re.M))
    shutil.rmtree(d / "constant/experiments", ignore_errors=True)
    if vogel:
        declare_viscosity(d)
    if T is not None:
        set_feed_T(d, T)


def set_feed_T(case, T):
    p = Path(case) / "0/feed"
    s, n = re.subn(r"^T\s+[^;]*;", "T               %s K;" % T, p.read_text(), flags=re.M)
    if n != 1:
        raise RuntimeError("no single T line in " + str(p))
    p.write_text(s)


def vogel_of(case):
    t = case_records.record_path(case, "components/water.dat").read_text()
    m = re.search(r"vogel\s*\{\s*A\s+([-0-9.eE+]+);\s*B\s+([-0-9.eE+]+);\s*C\s+([-0-9.eE+]+);", t)
    return tuple(float(x) for x in m.groups())


def factor(case, T):
    A, B, C = vogel_of(case)
    mu = lambda t: math.exp(A + B / (t - C))
    return (T / T0) * (mu(T0) / mu(T))


def printed_factor(out):
    m = re.search(r"\[D\(T\)\][^\n]*= ([0-9.]+), on the package", out)
    return float(m.group(1)) if m else None


def numbers(js):
    def flat(x, pre=""):
        if isinstance(x, dict):
            for k, v in x.items():
                yield from flat(v, pre + "." + k)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                yield from flat(v, pre + "[%d]" % i)
        else:
            yield pre, x
    return dict(p for k in ("streams", "kpis", "profiles") for p in flat(js.get(k), k))


def dt_advisories(js):
    return [a for a in js.get("advisories", []) if "D0" in a.get("message", "")
            and "Stokes-Einstein" in a.get("message", "")]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="check_ion_dT_"))
    try:
        # ---- (a) the absence is said ---------------------------------------
        d = tmp / "m14"
        plain_twin(d)
        rc, out, js = run(d, "choupoSolve")
        if rc != 0 or js is None:
            fail("(a) the membrane14 constant-film twin did not run (exit %d)" % rc)
            base = None
        else:
            base = js
            adv = [a for a in dt_advisories(js) if "NOT temperature-corrected" in a["message"]]
            if not adv or "model Vogel" not in adv[0]["message"]:
                fail("(a) the membrane14 twin at 293.15 K does not announce an uncorrected D0")
            else:
                print("  (a) membrane14's constant-film twin (293.15 K, no viscosity model): uncorrected D0 announced")

        # ---- (b) the factor, recomputed -------------------------------------
        d = tmp / "m14v"
        plain_twin(d, vogel=True)
        rc, out, js = run(d, "choupoSolve")
        f = factor(d, 293.15)
        pf = printed_factor(out)
        if rc != 0 or js is None:
            fail("(b) the membrane14 twin with a viscosity model did not run (exit %d)" % rc)
        elif pf is None or abs(pf - f) > 1e-6:
            fail("(b) printed factor %s, recomputed %.8f" % (pf, f))
        elif base is not None:
            #  the D reached the film: the coupled wall's polarisation index of every ion moves with the D0
            kb, kv = next(iter(base["kpis"].values())), next(iter(js["kpis"].values()))
            #  (a constant film does not read D; the coupled wall's migration term z D F/RT xi does: with every D
            #  scaled by f the interface field xi scales by 1/f)
            moved = [c for c in kb if c.startswith("xi_") and kb[c] and abs(kv[c] / kb[c] - 1.0) > 1e-4]
            if not moved:
                fail("(b) the interface field did not move with the corrected D0: the factor did not reach the wall")
            print("  (b) factor %.6f printed = recomputed; the coupled wall's field moved (%s: x%.4f against 1/f = %.4f)"
                  % (f, ",".join(moved), kv[moved[0]] / kb[moved[0]] if moved else float("nan"), 1.0 / f))
        # (b2) THE CORRELATION PATH, on the shipped case itself: membrane14 declares a stated viscosity, so its
        #  ions' D0 carry the factor, and its inlet k_Na is the spacer correlation on D0 x factor, recomputed here
        #  from the published density, viscosity and channel (the same arithmetic as check_spiral_array (f)).
        d = tmp / "m14s"
        copy_case(M14, d)
        rc, out, js = run(d, "choupoSolve")
        pf = printed_factor(out)
        if rc != 0 or js is None:
            fail("(b2) membrane14 did not run (exit %d)" % rc)
        elif pf is None or abs(pf - f) > 1e-6:
            fail("(b2) membrane14's printed factor %s, recomputed %.8f" % (pf, f))
        else:
            unit = next(iter(js["profiles"]))
            K1, prof = js["kpis"][unit], js["profiles"][unit]["columns"]
            D0 = float(re.search(r"D0\s*\{\s*value\s+([0-9.eE+-]+)", (d / "constant/species/Na.dat").read_text()).group(1))
            h, eps, A, L = 0.7e-3, 0.9, 7.9, 1.016
            dh = 2.0 * h * eps
            u0 = prof["Q_b"][0] / ((A / (2.0 * L)) * h * eps)
            Re = K1["rho_feed"] * u0 * dh / K1["mu_feed"]
            D = D0 * pf
            Sc = K1["mu_feed"] / (K1["rho_feed"] * D)
            k0 = 0.065 * Re ** 0.875 * Sc ** 0.25 * D / dh
            if abs(prof["k_film_Na"][0] / k0 - 1.0) > 1e-5:
                fail("(b2) inlet k_Na %.9e vs the correlation on D0 x factor %.9e" % (prof["k_film_Na"][0], k0))
            else:
                print("  (b2) shipped membrane14: inlet k_Na %.6e = Schock-Miquel on D0 x %.6f (to 1e-5)"
                      % (prof["k_film_Na"][0], pf))

        # ---- (c) the reference temperature moves nothing --------------------
        runs = []
        for tag, visc in (("t0", False), ("t0v", True)):
            d = tmp / tag
            plain_twin(d, vogel=visc, T="298.15")
            rc, out, js = run(d, "choupoSolve")
            if rc != 0 or js is None:
                fail("(c) the 298.15 K twin %s did not run (exit %d)" % (tag, rc))
            else:
                runs.append(js)
                if dt_advisories(js):
                    fail("(c) a D(T) advisory at 298.15 K (%s)" % tag)
        if len(runs) == 2:
            a, b = numbers(runs[0]), numbers(runs[1])
            diff = [k for k in set(a) | set(b) if a.get(k) != b.get(k)]
            if diff:
                fail("(c) at 298.15 K the viscosity model moved %d number(s), e.g. %s"
                     % (len(diff), sorted(diff)[:3]))
            else:
                print("  (c) at 298.15 K: %d numbers bit-identical with and without the model"
                      % len(a))

        # ---- (d) the pore ----------------------------------------------------
        cp = {}
        for tag, visc in (("nf", False), ("nfv", True)):
            d = tmp / tag
            #  one op, copied by the ONE home of how a part of this case is
            #  copied (paper_case.subset_case): it drops the `studies`,
            #  `references` and `views`, which name ops this twin does not
            #  carry.  This arm used to cut the file itself, keeping everything
            #  ABOVE the operations list -- and the day C154 put `studies`
            #  there, the twin was refused for naming `dye4_p1` (2026-10-25).
            paper_case.subset_case(d, ["N50"], src=NF02)
            if visc:
                declare_viscosity(d)
            rc, out, js = run(d, "choupoProps")
            if rc != 0 or js is None:
                fail("(d) the stiff-case twin %s did not run (exit %d)" % (tag, rc))
                continue
            cp[tag] = js["operationResults"][0]["diagnostics"]["c_perm_Na_p1"]
            if visc:
                f = factor(d, 298.0)
                pf = printed_factor(out)
                if pf is None or abs(pf - f) > 1e-6:
                    fail("(d) the pore's printed factor %s, recomputed %.8f" % (pf, f))
        if len(cp) == 2:
            shipped = None
            for l in (NF02 / "expected").read_text().splitlines():
                if re.match(r"diag\s+N50\s+c_perm_Na_p1\s", l):
                    shipped = float(l.split()[3])
            if shipped is None or abs(cp["nf"] / shipped - 1) > 1e-9:
                fail("(d) the undeclared twin's Na+ %s is not the shipped op's %s"
                     % (cp["nf"], shipped))
            rel = abs(cp["nfv"] / cp["nf"] - 1)
            if rel < 1e-3:
                fail("(d) the pore's Na+ moved by %.2e only: D(T) did not reach the pore" % rel)
            print("  (d) pore at 298 K: factor %.6f; permeate Na+ %.7f -> %.7f (%.2e)"
                  % (factor(NF02, 298.0), cp["nf"], cp["nfv"], cp["nfv"] / cp["nf"] - 1))

        # ---- (e) the stack ---------------------------------------------------
        d = tmp / "ed04"
        copy_case(ED04, d)
        rc, out, js = run(d, "choupoSolve")
        if rc != 0 or js is None:
            fail("(e) ed04 did not run (exit %d)" % rc)
        else:
            T = None
            for st in js["streams"].values():
                T = st["T"]
                break
            ks = [(u, k["stokesEinsteinFactor"]) for u, k in js["kpis"].items()
                  if "stokesEinsteinFactor" in k]
            f = factor(d, T)
            for u, v in ks:
                if abs(v - f) > 1e-9:
                    fail("(e) %s stokesEinsteinFactor %.12f, recomputed %.12f" % (u, v, f))
            if not ks:
                fail("(e) ed04 publishes no stokesEinsteinFactor")
            print("  (e) ed04 at %.2f K: stokesEinsteinFactor = recomputed %.9f on %d stack(s)"
                  % (T, f, len(ks)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_ion_diffusivity_temperature: FAIL -- %d finding(s)" % len(fails))
        return 1
    print("check_ion_diffusivity_temperature: OK -- the ion D0 (25 C) is corrected by"
          " Stokes-Einstein on the package's own liquid viscosity in the membrane film"
          " (inlet k moves by exactly f^0.75), the DSPM-DE pore (its trace Na+ moves) and the"
          " ED stack (its KPI = the factor recomputed from the water Vogel record); with no"
          " viscosity model the run announces an uncorrected D0; at 298.15 K the model moves"
          " no number bit for bit.  NOT checked: Stokes-Einstein's validity for an ion, a"
          " neutral solute's D, or the massTransfer block's own viscosity against the"
          " package's.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
