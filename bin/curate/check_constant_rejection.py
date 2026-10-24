#!/usr/bin/env python3
"""Gate: the CONSTANT INTRINSIC REJECTION transport law -- c_p,i = (1 - R_i) c_m,i
at the wall, R_i declared -- is what it says, everywhere a law is selectable,
and refuses the one thing it cannot represent.
    bin/curate/check_constant_rejection.py

WHY THIS EXISTS.  Vitor, 2026-10-24 (DEV.md 4c C148): "os modulos enrolados
em espiral podem usar diferentes modelos da membrana! ... Pode-se usar o da
solucao-difusao com B_i ou com rejeicoes intrinsecas constantes R_int,i."
`transport constantRejection;` is the law of Geraldes & Afonso, J. Membr.
Sci. 300 (2007) 20, Eq. (1), with R_i the paper's INPUT.  It shares the
water-flux Newton with solutionDiffusion and the wall with every law (the
Polarisation object, closure c_p = ratio c_m with ratio = 1 - R).  Its one
modelling decision is MULTI-ION: R per SALT is electroneutral by
construction, R per ION is not, and a charged permeate is REFUSED.

WHAT THIS GATE CHECKS (every case is RUN here):
  (a) THE WITNESS.  membrane23_constant_rejection_nf8040 exits 0, prints the
      law's banner with the declared R's and the "electroneutral by
      construction" line (its feed is declared by salts), and publishes an
      OBSERVED rejection below each intrinsic one (R_obs = 1 - c_p/c_feed:
      the wall is richer than the feed and the bulk concentrates along the
      vessel) but above zero.
  (b) THE CLOSURE, against an ANALYTIC INVARIANT.  With no polarisation
      (k_film 10 m/s, Gamma ~ 1e-6) c_p = (1 - R) c_b along the channel, so
      d(Q c)/dQ = (1 - R) c and N_ret/N_feed = (Q/Q0)^(1 - R): the quantity
      ln(N_ret,s/N_feed,s)/(1 - R_s) is the SAME for every solute (ln of the
      volumetric ratio).  A fixture with NaCl R 0.60 and MgSO4 R 0.98 must
      agree on it to 2e-4 relative at 800 stations, and the disagreement
      must fall FIRST-ORDER with the station count (the march's own order:
      200 -> 800 stations shrinks it 3-5x) -- so it is discretisation, not a
      wrong closure.  ratio = R instead of 1 - R gives a disagreement of
      order one.
  (c) THE MULTI-ION REFUSAL, on membrane21's ion-declared feed (Na, Cl, NO3,
      NH4; the Geraldes-Afonso coupled wall).  R's Na 0.55 Cl 0.55 NO3 0.30
      NH4 0.40 REFUSE naming `CHARGED`, both remedies (salts, `transport
      SDEM;`) and the tolerance; equal R's on all four ions run to exit 0
      (the permeate charge is then (1 - R) times the wall's, zero).
  (d) THE FLAT CELL.  membrane17 (SEPA CF, one membrane face) under the law
      with equal R's runs to exit 0 and its permeate is electroneutral to
      1e-9 from the published stream composition.
  (e) THE BATCH DIAFILTER.  diafilter01 under the law (k_film 10 m/s, so the
      wall is the vessel; deltaT 0.001 s) runs to exit 0, publishes
      R_initial/R_final of both salts equal to the declared R's within 1e-5,
      and -- because R is now CONSTANT -- its washout equals the hand law
      c/c0 = exp(-(1 - R) N) that the donor case exists to show failing,
      within 1e-4.  The batch unit integrates the solute flux J_s = J_w c_p
      the law returns, so this is the arm that sees J_s.
  (f) THE REFUSALS, each built from the witness: R = 1.2; R = -0.1; a present
      solute with no R; an R naming no solute; an unknown key in
      transportParameters; no `source`; no `rejection` block.  Each exits
      non-zero with its own reason in the message.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
No R here is a MEASUREMENT against a wall (the witness's are hypothetical
teaching values and say so); nothing checks that a constant R describes any
real membrane over any range (it does not -- an intrinsic rejection moves
with the flux; that is what solution-diffusion and DSPM-DE model).  The
charge refusal is tested at one feed and one bad set.  The single
diffusivity of lumped salts in the film is not checked.

SABOTAGE-VERIFIED 2026-10-24 (engine edits BY HAND, rebuilt, run, restored;
the gate never patches a source):
  S1  ConstantRejection.cpp ratio_ = R instead of 1 - R  CAUGHT by (a) (the
      witness no longer runs), (b) (disagreement 3.2e+01, not shrinking with
      the stations) and (e) (R_initial/R_final = 1 - R).
  S2  the permeate-charge check deleted                   CAUGHT by (c) ONLY
      (the bad set exits 0).
  S3  J_s = 0 instead of J_w c_p                          CAUGHT by (a)
      (R_obs = 1), (b) and (e) (washout 1 against exp(-(1-R)N)).  Predicted
      to reach (e) alone, on the belief that the spiral module reads only c_p
      and J_w; it reads J_s too, which the measurement showed.
  S4  the [0, 1] range check deleted                      CAUGHT by (f) ONLY
      (R = 1.2 and R = -0.1 exit 0).
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
BUILD = ROOT
WITNESS = ROOT / "tutorials/steady/membranes/membrane23_constant_rejection_nf8040"
M21 = ROOT / "tutorials/steady/membranes/membrane21_two_stage_nf_array"
M17 = ROOT / "tutorials/steady/membranes/membrane17_sepa_cf_flat_cell"
DIA = ROOT / "tutorials/batch/membrane/diafilter01_nf_desalting"

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


def run(case, binary="choupoSolve"):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BUILD / binary), str(case)], capture_output=True,
                       text=True, timeout=900, env=env, cwd=str(case))
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                      .split("<<<Choupo:result-end>>>")[0])


def copy_case(src, dst):
    #  A probe is not its donor: the sealed manifest stays behind (the move
    #  check_membrane_modules' builder makes), and so do run outputs.
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "propertyManifest",
        "latest", "solution.log", "trajectory.csv", "[0-9]*.[0-9]*"))
    #  Time directories of a batch donor (1, 5, ... but never 0/).
    for p in Path(dst).iterdir():
        if p.is_dir() and re.fullmatch(r"[0-9.]+", p.name) and p.name != "0":
            shutil.rmtree(p)


def law_block(rset, source='"gate fixture"', extra=""):
    return ("transport        constantRejection;\n"
            "            transportParameters { rejection { " + rset + " } "
            + ("source " + source + "; " if source else "") + extra + "}")


def set_law(case, block):
    p = Path(case) / "system/flowsheetDict"
    s = p.read_text()
    s2 = re.sub(r"transport\s+(SDEM|DSPM-DE|solutionDiffusion|constantRejection)\s*;"
                r"(\s*//[^\n]*)?(\s*transportParameters\s*\{(?:[^{}]|\{[^{}]*\})*\})?",
                lambda m: block, s)
    if s2 == s:
        raise RuntimeError("could not place the law in " + str(p))
    p.write_text(s2)


def kpis(js, unit):
    return js.get("kpis", {}).get(unit, {})


def charge_of(stream, z):
    q = sum(z.get(c, 0) * x for c, x in stream["composition"].items())
    qa = sum(abs(z.get(c, 0)) * x for c, x in stream["composition"].items())
    return abs(q) / qa if qa > 0 else 0.0


def main():
    tmp = Path(tempfile.mkdtemp(prefix="check_constant_rejection_"))
    try:
        # ---- (a) the witness ------------------------------------------------
        rc, out = run(WITNESS)
        js = result_of(out)
        if rc != 0 or js is None:
            fail("(a) the witness did not run (exit %d)" % rc)
        else:
            if "[constantRejection] R_int:  NaCl 0.6  MgSO4 0.98" not in out:
                fail("(a) the banner does not print the declared R's")
            if "electroneutral by construction" not in out:
                fail("(a) the salt-feed banner line is missing")
            k = kpis(js, "NF")
            for s, R in (("NaCl", 0.60), ("MgSO4", 0.98)):
                ro = k.get("R_obs_" + s)
                if ro is None or not (0.0 < ro < R):
                    fail("(a) R_obs_%s = %s is not inside (0, R_int = %g)" % (s, ro, R))
        print("  (a) witness: R_obs NaCl %.4f < 0.60, MgSO4 %.4f < 0.98"
              % (kpis(js, "NF").get("R_obs_NaCl", float("nan")) if js else float("nan"),
                 kpis(js, "NF").get("R_obs_MgSO4", float("nan")) if js else float("nan")))

        # ---- (b) the analytic invariant --------------------------------------
        fixture = (
            "units\n(\n    {\n        name NF;  type spiralWoundModule;  in feed;\n"
            "        outputs ( retentate permeate );\n        operation\n        {\n"
            "            membrane NF270;\n            " +
            law_block("NaCl 0.60;  MgSO4 0.98;") + "\n"
            "            area 60.0;  length 1.0;  P_permeate 1.0 bar;  k_film 10.0;\n"
            "            nNodes NODES;\n"
            "            polarisation { suctionCorrection filmTheory; ionCoupling none; }\n"
            "        }\n    }\n);\n")
        dis = {}
        for n in (200, 800):
            d = tmp / ("inv%d" % n)
            copy_case(WITNESS, d)
            (d / "system/flowsheetDict").write_text(fixture.replace("NODES", str(n)))
            rc, out = run(d)
            jj = result_of(out)
            if rc != 0 or jj is None:
                fail("(b) the invariant fixture at %d stations did not run (exit %d)" % (n, rc))
                continue
            st = jj["streams"]
            def nflow(name, c):
                return st[name]["F"] * st[name]["composition"][c]
            a = math.log(nflow("retentate", "NaCl") / nflow("feed", "NaCl")) / 0.40
            b = math.log(nflow("retentate", "MgSO4") / nflow("feed", "MgSO4")) / 0.02
            dis[n] = abs(a - b) / abs(a)
            print("  (b) %4d stations: ln(N_ret/N_feed)/(1-R) NaCl %.8f  MgSO4 %.8f  rel %.3e"
                  % (n, a, b, dis[n]))
        if 800 in dis and dis[800] > 2e-4:
            fail("(b) the two salts disagree on ln(Q/Q0) by %.3e > 2e-4 at 800 stations"
                 % dis[800])
        if 200 in dis and 800 in dis and dis[800] > 0:
            ratio = dis[200] / dis[800]
            if not (3.0 <= ratio <= 5.0):
                fail("(b) the disagreement does not fall first-order (200 -> 800 shrinks it"
                     " %.2fx, expected 3-5x): not a discretisation error" % ratio)

        # ---- (c) the multi-ion refusal ---------------------------------------
        d = tmp / "ionBad"
        copy_case(M21, d)
        set_law(d, law_block("Na 0.55; Cl 0.55; NO3 0.30; NH4 0.40;"))
        rc, out = run(d)
        if rc == 0:
            fail("(c) mismatched per-ion R's ran to exit 0 (a charged permeate published)")
        else:
            for w in ("CHARGED", "SALTS", "transport SDEM;", "1e-06"):
                if w not in out:
                    fail("(c) the refusal does not name `%s`" % w)
            m = re.search(r"\(relative ([0-9.e+-]+) > 1e-06\)", out)
            print("  (c) mismatched per-ion R's refused: relative permeate charge %s"
                  % (m.group(1) if m else "?"))
        d = tmp / "ionEqual"
        copy_case(M21, d)
        set_law(d, law_block("Na 0.55; Cl 0.55; NO3 0.55; NH4 0.55;"))
        rc, out = run(d)
        if rc != 0:
            fail("(c) equal per-ion R's did not run (exit %d)" % rc)
        else:
            print("  (c) equal per-ion R's on the coupled wall: exit 0")

        # ---- (d) the flat cell ------------------------------------------------
        d = tmp / "flat"
        copy_case(M17, d)
        set_law(d, law_block("Na 0.5; Cl 0.5; NO3 0.5; NH4 0.5;"))
        rc, out = run(d)
        jj = result_of(out)
        if rc != 0 or jj is None:
            fail("(d) the flat cell under the law did not run (exit %d)" % rc)
        else:
            q = charge_of(jj["streams"]["permeate"], {"Na": 1, "Cl": -1, "NO3": -1, "NH4": 1})
            if q > 1e-9:
                fail("(d) the flat cell's permeate carries relative charge %.3e" % q)
            print("  (d) flat cell (SEPA CF): exit 0, permeate relative charge %.1e" % q)

        # ---- (e) the batch diafilter -----------------------------------------
        d = tmp / "dia"
        copy_case(DIA, d)
        p = d / "system/flowsheetDict"
        s = p.read_text()
        s = re.sub(r"transport\s+solutionDiffusion;[^\n]*", law_block(
            "NaCl 0.60;  MgSO4 0.98;"), s)
        s = re.sub(r"k_film\s+[^;]*;", "k_film       10 m/s;", s)
        p.write_text(s)
        #  The batch driver's step: MEASURED first-order in deltaT on this
        #  probe (the washout gap is 2.5e-2 at the donor's deltaT 1 s, 2.5e-4
        #  at 0.01 s, 2.6e-5 at 0.001 s), so the arm takes 0.001 s and holds
        #  the gap to 1e-4.  The donor's own lesson (R rising, a 1 % gap) is
        #  NOT numerical: its gap moves by 0.1 % between 1 s and 0.001 s.
        c = d / "system/controlDict"
        c.write_text(re.sub(r"deltaT\s+[^;]*;", "deltaT 0.001;", c.read_text()))
        rc, out = run(d, "choupoBatch")
        jj = result_of(out)
        if rc != 0 or jj is None:
            fail("(e) the diafilter under the law did not run (exit %d)" % rc)
        else:
            kk = kpis(jj, "retentate")
            for sname, R in (("NaCl", 0.60), ("MgSO4", 0.98)):
                for when in ("initial", "final"):
                    ro = kk.get("R_%s_%s" % (when, sname))
                    if ro is None or abs(ro - R) > 1e-5:
                        fail("(e) diafilter R_%s_%s = %s, declared R_int %g (|diff| > 1e-5)"
                             % (when, sname, ro, R))
                wa, wi = kk.get("washoutActual_" + sname), kk.get("washoutIdeal_" + sname)
                if wa is None or wi is None or abs(wa - wi) > 1e-4 * wi:
                    fail("(e) diafilter washout of %s: actual %s against the hand law"
                         " exp(-(1-R)N) %s -- with R constant the two must agree" % (sname, wa, wi))
            print("  (e) batch diafilter: R_final NaCl %s, MgSO4 %s; washout NaCl actual %s,"
                  " exp(-(1-R)N) %s" % (kk.get("R_final_NaCl"), kk.get("R_final_MgSO4"),
                                        kk.get("washoutActual_NaCl"), kk.get("washoutIdeal_NaCl")))

        # ---- (f) the refusals ------------------------------------------------
        probes = [
            ("R above 1", law_block("NaCl 1.2;  MgSO4 0.98;"), "must lie in [0, 1]"),
            ("R below 0", law_block("NaCl -0.1;  MgSO4 0.98;"), "must lie in [0, 1]"),
            ("a solute with no R", law_block("NaCl 0.6;"), "has no intrinsic rejection"),
            ("an R naming no solute", law_block("NaCl 0.6;  MgSO4 0.98;  KCl 0.5;"),
             "names no solute of this feed"),
            ("an unknown key", law_block("NaCl 0.6;  MgSO4 0.98;", extra="tolerance 1; "),
             "which this law does not read"),
            ("no source", law_block("NaCl 0.6;  MgSO4 0.98;", source=None),
             "declares no `source"),
            ("no rejection block",
             "transport        constantRejection;\n"
             "            transportParameters { source \"x\"; }", "declares no `rejection"),
        ]
        for i, (what, block, needle) in enumerate(probes):
            d = tmp / ("refuse%d" % i)
            copy_case(WITNESS, d)
            set_law(d, block)
            rc, out = run(d)
            if rc == 0:
                fail("(f) %s ran to exit 0" % what)
            elif needle not in out:
                fail("(f) %s refused without saying `%s`" % (what, needle))
        print("  (f) %d refusals fired" % len(probes))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_constant_rejection: FAIL -- %d finding(s)" % len(fails))
        return 1
    print("check_constant_rejection: OK -- transport constantRejection (c_p = (1 - R) c_m,"
          " Geraldes & Afonso 2007 Eq. 1): the witness's observed rejections sit below the"
          " declared intrinsic ones; with no film both salts give ONE ln(Q/Q0) to 2e-4,"
          " converging first-order; mismatched per-ION R's on membrane21's feed are REFUSED"
          " as a charged permeate while equal ones run; the flat cell and the batch"
          " diafilter take the law (the diafilter's R = R_int to 1e-5 and its washout ="
          " exp(-(1 - R) N) to 1e-4); 7 refusals"
          " fire.  NOT checked: that any constant R describes a real membrane (none here is"
          " measured against a wall).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
