#!/usr/bin/env python3
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
      nanofiltran02; one op, 50 nodes, T = 298 K, no plotDict) with the
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
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "propertyManifest", "*.csv"))


def declare_viscosity(case):
    p = Path(case) / "constant/thermoPhysPropDict"
    p.write_text(p.read_text() + "\ntransport\n{\n    liquid\n    {\n"
                 "        viscosity { model Vogel; }\n    }\n}\n")


def set_feed_T(case, T):
    p = Path(case) / "0/feed"
    s, n = re.subn(r"^T\s+[^;]*;", "T               %s K;" % T, p.read_text(), flags=re.M)
    if n != 1:
        raise RuntimeError("no single T line in " + str(p))
    p.write_text(s)


def vogel_of(case):
    t = (Path(case) / "constant/components/water.dat").read_text()
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
        copy_case(M14, d)
        rc, out, js = run(d, "choupoSolve")
        if rc != 0 or js is None:
            fail("(a) membrane14 did not run (exit %d)" % rc)
            base = None
        else:
            base = js
            adv = [a for a in dt_advisories(js) if "NOT temperature-corrected" in a["message"]]
            if not adv or "model Vogel" not in adv[0]["message"]:
                fail("(a) membrane14 at 293.15 K does not announce an uncorrected D0")
            else:
                print("  (a) membrane14 (293.15 K, no viscosity model): uncorrected D0 announced")

        # ---- (b) the factor, recomputed -------------------------------------
        d = tmp / "m14v"
        copy_case(M14, d)
        declare_viscosity(d)
        rc, out, js = run(d, "choupoSolve")
        f = factor(d, 293.15)
        pf = printed_factor(out)
        if rc != 0 or js is None:
            fail("(b) the membrane14 twin with a viscosity model did not run (exit %d)" % rc)
        elif pf is None or abs(pf - f) > 1e-6:
            fail("(b) printed factor %s, recomputed %.8f" % (pf, f))
        elif base is not None:
            prof = js["profiles"]
            pb = base["profiles"]
            unit = next(iter(prof))
            cols = [c for c in prof[unit]["columns"] if c.startswith("k_film_")]
            if not cols:
                fail("(b) no per-ion k_film column to read")
            for c in cols:
                r = prof[unit]["columns"][c][0] / pb[unit]["columns"][c][0]
                if abs(r - f ** 0.75) > 1e-9:
                    fail("(b) %s moved by %.12f, expected f^0.75 = %.12f" % (c, r, f ** 0.75))
            print("  (b) factor %.6f printed = recomputed; inlet %s moved by f^0.75 = %.6f"
                  % (f, "/".join(c[7:] for c in cols), f ** 0.75))

        # ---- (c) the reference temperature moves nothing --------------------
        runs = []
        for tag, visc in (("t0", False), ("t0v", True)):
            d = tmp / tag
            copy_case(M14, d)
            set_feed_T(d, "298.15")
            if visc:
                declare_viscosity(d)
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
            copy_case(NF02, d)
            #  one op: the case's plotDict names ops this twin does not carry
            (d / "system/plotDict").unlink(missing_ok=True)
            p = d / "system/propsDict"
            s = p.read_text()
            i = s.index("operations")
            op = re.search(r"\{\s*name\s+N50;.*?\n    \}", s, re.S).group(0)
            p.write_text(s[:i] + "operations\n(\n" + op + "\n);\n")
            if visc:
                declare_viscosity(d)
            rc, out, js = run(d, "choupoProps")
            if rc != 0 or js is None:
                fail("(d) the nanofiltran02 twin %s did not run (exit %d)" % (tag, rc))
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
