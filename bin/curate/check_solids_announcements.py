#!/usr/bin/env python3
"""Gate: the solids units ANNOUNCE the hypotheses they use and REFUSE the
declarations they cannot read.

    bin/curate/check_solids_announcements.py

WHY THIS EXISTS.  Two reviews of 2026-11-12 (docs/reviews/2026-11-12-solids-
classification-and-separation, rows SC-03..SC-07; docs/reviews/2026-11-12-
solid-properties, row SP-07) found the solids units saying things only on the
console, inside a verbosity test, or not at all -- while the end-of-run
caveat block said "none raised".  The project's posture (CLAUDE.md, "THE
PELLET IS A POINT", "THE ENGINE PROMISED TO REFUSE OR ANNOUNCE"): a model
hypothesis that is USED is announced on the advisory log, so it reaches the
caveat block and the result JSON whatever the verbosity; an impossible
declaration is refused by name; silence keeps meaning "nothing was raised".

WHAT THIS GATE CHECKS (every arm runs a SCRATCH COPY of a shipped case, in a
temporary directory, with CHOUPO_HOME set to this tree):

  (a) sedimentingCentrifuge (SC-03).  Both shipped centrifuge cases publish
      `solidsVolumeFraction_feed`, and its value is RECOMPUTED here from the
      run's own published numbers -- (solid mass of the feed / rho_solid) /
      feed_m3_s -- not compared with a remembered constant.  The dilute-
      settling announcement carries that number and reaches the site line,
      the caveat block and the JSON `advisories`.  A probe at 30 vol %
      solids (115.6 kmol/h of CaCO3 into centrifuge02) still runs and
      announces 0.3: no threshold is set, nothing is judged.

  (b) thickener (SC-04).  thickener01 with its feed water doubled (feed
      131 kg/m3 against a test at 250 kg/m3), run at VERBOSITY 0, carries the
      test-concentration advisory in the JSON with both concentrations; the
      shipped thickener01 (feed at its test's concentration) raises none --
      the negative.

  (c) thickener (SC-07).  The printed compression slope names its method and
      its three test points, and those points are recomputed here from the
      case's own `time` list and `compressionTime`: the test point nearest t
      (interior) and its two neighbours.

  (d) screen (SC-05).  screen01 (AUF = 1.08) carries an OVERLOADED advisory
      whose AUF equals the published `areaUtilisationFactor`; the same case
      with its `area` multiplied by 1.5 (AUF < 1) raises none -- the negative.

  (e) cakeFilter (SC-06).  filter01 with `compressibility -0.5` is REFUSED
      (non-zero exit) naming the key and saying it is negative; with `1.5` it
      runs and the advisory says s is above 1 and that a higher pressure drop
      gives LESS filtrate.  That sentence is held to the engine's own
      equation: the same case at twice the pressure drop publishes a
      `Kp_s_m6` larger by 2^(s-1) = 2^0.5 (to 1e-6).  The shipped filter01
      (s = 0.3) raises no compressibility advisory -- the negative.

  (f) mixer (SP-07).  Two SOLIDS-ONLY inlets do NOT print "liquid inlets
      merged"; two LIQUID inlets of the same probe shape DO (the positive
      control that makes the negative mean something).

  (g) pneumaticConveyor.  pneumaticConveyor01 with a single size of 1.0564 mm
      (u_t at Re ~ 1000, where the substitution cycles between the two
      Schiller-Naumann branches) announces that the terminal velocity did
      not meet its stopping rule, in the JSON; the shipped case (Sauter
      169.5 um) raises none -- the negative.

WHAT THIS GATE DOES **NOT** CHECK, so its green line cannot imply it.  It does
not judge any hypothesis: whether a feed is dilute enough, whether an
overloaded screen or a mismatched settling test gives a usable answer,
whether s > 1 describes a real slurry.  It does not check the console lines
of the pneumatic conveyor's OTHER warnings (loading, voidage, saltation,
acceleration length), which are still console-only; nor `particleVelocity`'s
own substitution loop, which has the same structure and no announcement.  It
checks the mixer's emulsion sentence only through its count, not the vapour/
liquid "UNLIKE phases" sentence that shares the same counts.  It runs no case
under an outer driver.

The gate FAILS (never skips) when the native binary is absent.

SABOTAGE-VERIFIED 2026-11-13 by hand, one fix removed at a time, `make all
-j2`, the gate run, the source restored with `git checkout` and rebuilt.
OBSERVED (first line of each failure):

  S1 centrifuge advisory removed      -> (a) no `[sedimentingCentrifuge]` site
                                         line ... (both cases, block + JSON)
  S2 thickener advisory removed       -> (b) thickener01 diluted, verbosity 0:
                                         no test-concentration advisory
  S3 slope line loses "parabola ..."  -> (c) the compression slope line does
                                         not name its parabola
  S4 screen advisory removed          -> (d) screen01 is overloaded (AUF =
                                         1.0820) and no OVERLOADED advisory
  S5 negative-s refusal removed       -> (e) compressibility -0.5 ran to exit 0
  S6 s > 1 advisory removed           -> (e) compressibility 1.5: no advisory
  S7 mixer fluid guard removed        -> (f) two SOLIDS-ONLY inlets printed
                                         'liquid inlets merged'
  S8 u_t non-convergence suppressed   -> (g) d_p = 1.0564 mm: ... no advisory
                                         says so

Each sabotage was caught by its own arm and by no other, so no arm leans on
another to fire.
"""

from __future__ import annotations

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
BUILD = ROOT / "build" / "linux64Gcc"
SOLVE = BUILD / "choupoSolve"
SOLIDS = ROOT / "tutorials" / "steady" / "solids"
OUTPUTS = ("converged", "reports", "design", "iterations", "economics",
           "internalStates")


def copy_case(name: str, td: Path, tag: str) -> Path:
    dst = td / tag
    shutil.copytree(SOLIDS / name, dst,
                    ignore=shutil.ignore_patterns(*OUTPUTS))
    return dst


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), str(case)], capture_output=True,
                       text=True, timeout=600, env=env)
    return p.returncode, p.stdout + p.stderr


def result(out: str):
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    return json.loads(m.group(1)) if m else None


def advisories(js, needle: str):
    return [a for a in (js or {}).get("advisories", [])
            if needle in a.get("message", "")]


def caveats(out: str) -> str:
    head, sep, tail = out.partition("ASSUMPTIONS AND CAVEATS")
    return tail if sep else ""


def edit(path: Path, pattern: str, repl, count: int = 0) -> bool:
    t = path.read_text()
    t2 = re.sub(pattern, repl, t, count=count)
    path.write_text(t2)
    return t2 != t


def main() -> int:
    if not SOLVE.is_file():
        print("check_solids_announcements: FAILED")
        print(f"  the native binary {SOLVE} is absent -- run `make all`; a "
              "check that cannot run must not pass")
        return 1

    fails: list[str] = []
    claims: list[str] = []

    with tempfile.TemporaryDirectory(prefix="solidsAnnounce.") as tds:
        td = Path(tds)

        # ---- (a) sedimentingCentrifuge ------------------------------------
        DILUTE = "unhindered (dilute) Stokes settling is assumed"
        for name in ("centrifuge01_tubularBowl_geankoplis",
                     "centrifuge02_discStack_sigmaIdentity"):
            c = copy_case(name, td, "a_" + name)
            rc, out = run(c)
            js = result(out) if rc == 0 else None
            if js is None:
                fails.append(f"(a) {name}: did not run (exit {rc})")
                continue
            units = js.get("kpis", {})
            uname, k = next(((u, kk) for u, kk in units.items()
                             if "sigma_m2" in kk), (None, None))
            if k is None or "solidsVolumeFraction_feed" not in k:
                fails.append(f"(a) {name}: no `solidsVolumeFraction_feed` KPI")
                continue
            feed = js["streams"].get("feed") or js["streams"].get("in")
            ms = feed.get("F_solid_mass") if feed else None
            if ms is None:
                fails.append(f"(a) {name}: the feed stream publishes no "
                             "F_solid_mass to recompute the fraction from")
                continue
            phi = (ms / k["rho_solid"]) / k["feed_m3_s"]
            got = k["solidsVolumeFraction_feed"]
            if abs(got - phi) > 1e-9 * max(1.0, phi):
                fails.append(f"(a) {name}: published phi_s = {got}, recomputed "
                             f"(m_s/rho_s)/Q = {phi}")
            line = next((l for l in out.splitlines()
                         if "[sedimentingCentrifuge]" in l and DILUTE in l), "")
            if not line:
                fails.append(f"(a) {name}: no `[sedimentingCentrifuge]` site "
                             "line announcing dilute settling")
            if DILUTE not in caveats(out):
                fails.append(f"(a) {name}: the dilute-settling announcement "
                             "did not reach the caveat block")
            adv = advisories(js, DILUTE)
            if not adv:
                fails.append(f"(a) {name}: no dilute-settling advisory in the "
                             "result JSON")
            else:
                m = re.search(r"volume fraction of ([0-9.eE+-]+):",
                              adv[0]["message"])
                if not m or abs(float(m.group(1)) - phi) > 5e-4 * max(phi, 1e-3):
                    fails.append(f"(a) {name}: the advisory quotes "
                                 f"{m.group(1) if m else 'no number'}, the "
                                 f"fraction is {phi:.6g}")
            if "hindered settling" not in (adv[0]["message"] if adv else "") \
                    or "not judged" not in (adv[0]["message"] if adv else ""):
                fails.append(f"(a) {name}: the advisory must name hindered "
                             "settling as not modelled and say nothing is "
                             "judged")
        c = copy_case("centrifuge02_discStack_sigmaIdentity", td, "a_conc30")
        ok = edit(c / "0" / "feed", r"(CaCO3\s+)[0-9.]+(\s*kmol/h;)",
                  r"\g<1>115.6\g<2>")
        #  a 70 % sediment, so the sediment's liquid fits in the feed's
        ok = ok and edit(c / "system" / "flowsheetDict",
                         r"(sedimentSolids\s+)[0-9.]+;", r"\g<1>0.7;", count=1)
        if not ok:
            fails.append("(a) 30 vol % probe is STALE: centrifuge02's feed "
                         "changed shape")
        else:
            rc, out = run(c)
            js = result(out) if rc == 0 else None
            adv = advisories(js, DILUTE)
            if not adv or "fraction of 0.3" not in adv[0]["message"]:
                fails.append("(a) 30 vol % probe: no announcement quoting 0.3 "
                             f"(exit {rc})")
            else:
                claims.append("centrifuge phi_s recomputed on 2 cases + 30 vol % probe")

        # ---- (b), (c) thickener -------------------------------------------
        TEST = "the settling test was run at C_0 ="
        c = copy_case("thickener01_settlingTest_talmageFitch", td, "b_ship")
        rc, out = run(c)
        js = result(out) if rc == 0 else None
        if js is None:
            fails.append(f"(b) thickener01: did not run (exit {rc})")
        else:
            if TEST in out:
                fails.append("(b) thickener01 (feed at the test's own "
                             "concentration) raised the test-concentration "
                             "note -- the negative fired")
            # (c) the slope's three points, from the case's own lists
            fd = (c / "system" / "flowsheetDict").read_text()
            tm = re.search(r"time\s*\(([^)]*)\)", fd)
            cm = re.search(r"compressionTime\s+([0-9.eE+-]+)\s*(h|s)?\s*;", fd)
            if not tm or not cm:
                fails.append("(c) thickener01's flowsheetDict changed shape: "
                             "no time list / compressionTime")
            else:
                tt = [float(x) for x in tm.group(1).split()]
                tc = float(cm.group(1)) * (3600.0 if cm.group(2) == "h" else 1.0)
                j = min(range(1, len(tt) - 1), key=lambda k: abs(tc - tt[k]))
                want = "t = %g, %g, %g s" % (tt[j - 1], tt[j], tt[j + 1])
                sl = next((l for l in out.splitlines()
                           if "Compression:" in l and "slope v" in l), "")
                if "parabola through the three test points" not in sl \
                        or want not in sl:
                    fails.append("(c) the compression slope line does not "
                                 f"name its parabola and the points {want}: "
                                 f"{sl.strip()[:160]}")
                else:
                    claims.append("thickener slope names " + want)
        c = copy_case("thickener01_settlingTest_talmageFitch", td, "b_dil")
        ok = edit(c / "0" / "feed", r"(water\s+)([0-9.]+)(\s*kmol/h;)",
                  lambda m: f"{m.group(1)}{2.0 * float(m.group(2)):.7f}{m.group(3)}")
        ok = ok and edit(c / "system" / "controlDict",
                         r"(?m)^verbosity\s+\d+;", "verbosity 0;")
        if not ok:
            fails.append("(b) the dilution probe is STALE: thickener01 changed shape")
        else:
            rc, out = run(c)
            js = result(out) if rc == 0 else None
            adv = advisories(js, TEST)
            if not adv:
                fails.append(f"(b) thickener01 diluted, verbosity 0 (exit {rc}): "
                             "no test-concentration advisory in the JSON")
            elif not re.search(r"C_0 = 250 kg/m3 and the feed is at 131\.\d* "
                               r"kg/m3 \(-47\.\d+ %", adv[0]["message"]):
                fails.append("(b) the advisory does not carry both "
                             "concentrations and the deviation: "
                             + adv[0]["message"][:160])
            else:
                claims.append("thickener test-concentration advisory at verbosity 0")

        # ---- (d) screen ----------------------------------------------------
        OVER = "the screen is OVERLOADED"
        c = copy_case("screen01_dolomite_karra", td, "d_ship")
        rc, out = run(c)
        js = result(out) if rc == 0 else None
        if js is None:
            fails.append(f"(d) screen01: did not run (exit {rc})")
        else:
            auf = next((kk["areaUtilisationFactor"] for kk in js["kpis"].values()
                        if "areaUtilisationFactor" in kk), None)
            adv = advisories(js, OVER)
            if auf is None or not auf > 1.0:
                fails.append(f"(d) screen01: AUF = {auf}, the probe needs > 1")
            elif not adv:
                fails.append("(d) screen01 is overloaded (AUF = %.4f) and no "
                             "OVERLOADED advisory reached the JSON" % auf)
            else:
                m = re.search(r"AUF = ([0-9.]+)", adv[0]["message"])
                if not m or abs(float(m.group(1)) - auf) > 1e-4:
                    fails.append("(d) the advisory's AUF is not the published "
                                 f"{auf}")
                elif OVER not in caveats(out):
                    fails.append("(d) the OVERLOADED advisory did not reach "
                                 "the caveat block")
                else:
                    claims.append("screen AUF %.4f announced" % auf)
        c = copy_case("screen01_dolomite_karra", td, "d_big")
        ok = edit(c / "system" / "flowsheetDict",
                  r"(area\s+)([0-9.]+)(\s*m2;)",
                  lambda m: f"{m.group(1)}{1.5 * float(m.group(2)):.6f}{m.group(3)}",
                  count=1)
        if not ok:
            fails.append("(d) the larger-screen probe is STALE")
        else:
            rc, out = run(c)
            if rc != 0:
                fails.append(f"(d) larger screen: did not run (exit {rc})")
            elif OVER in out:
                fails.append("(d) a screen 1.5x larger (AUF < 1) still "
                             "announced OVERLOADED -- the negative fired")

        # ---- (e) cakeFilter ------------------------------------------------
        S_ABOVE = "is above 1"

        def filt(tag, s=None, dp_scale=None):
            c = copy_case("filter01_caco3_rotaryDrum", td, tag)
            fs = c / "system" / "flowsheetDict"
            if s is not None and not edit(fs, r"(compressibility\s+)[-0-9.]+;",
                                          rf"\g<1>{s};", count=1):
                return None, None, None
            if dp_scale is not None and not edit(
                    fs, r"(pressureDrop\s+)([0-9.]+)(\s*kPa;)",
                    lambda m: f"{m.group(1)}{dp_scale * float(m.group(2)):g}{m.group(3)}",
                    count=1):
                return None, None, None
            rc, out = run(c)
            return rc, out, (result(out) if rc == 0 else None)

        rc, out, js = filt("e_neg", "-0.5")
        if rc is None:
            fails.append("(e) filter01 changed shape: no compressibility line")
        elif rc == 0:
            fails.append("(e) compressibility -0.5 ran to exit 0 -- a negative "
                         "s must be refused")
        elif "`compressibility` s = -0.5 is negative" not in out:
            fails.append("(e) the refusal of s = -0.5 does not name the key "
                         "and say it is negative")
        rc, out, js = filt("e_hi", "1.5")
        adv = advisories(js, S_ABOVE)
        if not adv:
            fails.append(f"(e) compressibility 1.5 (exit {rc}): no advisory")
        elif "LESS filtrate" not in adv[0]["message"]:
            fails.append("(e) the s > 1 advisory does not say a higher "
                         "pressure drop gives less filtrate")
        #  The drum DESIGNS its area (cycleTime declared), so K_p itself moves
        #  with A; the advisory's claim is about K_p A^2 = mu alpha0 c_S
        #  dp^(s-1), and its consequence is the area needed at a fixed cycle:
        #  more area at twice the pressure drop (filter01 declares R_m = 0, so
        #  the cake is the whole resistance).
        rc2, out2, js2 = filt("e_hi2", "1.5", 2.0)

        def kpa2(j):
            k = next((kk for kk in (j or {}).get("kpis", {}).values()
                      if "Kp_s_m6" in kk), None)
            return (k["Kp_s_m6"] * k["area_m2"] ** 2, k["area_m2"]) if k else (None, None)
        (k1, a1), (k2, a2) = kpa2(js), kpa2(js2)
        if k1 is None or k2 is None:
            fails.append("(e) Kp_s_m6 / area_m2 missing at one of the two "
                         "pressure drops")
        elif abs(k2 / k1 - math.sqrt(2.0)) > 1e-6:
            fails.append(f"(e) K_p A^2 (2 dp) / K_p A^2 (dp) = {k2 / k1:.8f}; the "
                         "advisory's dp^(s-1) = 2^0.5 = 1.41421356 is not what "
                         "the engine computes")
        elif not a2 > a1:
            fails.append(f"(e) at s = 1.5 the drum needs {a2} m2 at 2 dp against "
                         f"{a1} m2 at dp -- the advisory says a higher dp gives "
                         "LESS filtrate, so it should need MORE area")
        else:
            claims.append("cakeFilter s<0 refused, s>1 announced, K_p ratio 2^0.5")
        rc, out, js = filt("e_ship")
        if js is None:
            fails.append(f"(e) filter01: did not run (exit {rc})")
        elif "compressibility" in json.dumps(js.get("advisories", [])):
            fails.append("(e) filter01 (s = 0.3) raised a compressibility "
                         "advisory -- the negative fired")

        # ---- (f) mixer -----------------------------------------------------
        EMULSION = "liquid inlets merged"
        mill_ctrl = SOLIDS / "mill01_limestone_herbstFuerstenau" / "system" / "controlDict"

        def mixer_probe(tag, a_body, b_body, comps):
            c = td / tag
            (c / "system").mkdir(parents=True)
            (c / "constant").mkdir()
            (c / "0").mkdir()
            shutil.copy(mill_ctrl, c / "system" / "controlDict")
            edit(c / "system" / "controlDict", r"(?m)^verbosity\s+\d+;",
                 "verbosity 3;")
            (c / (tag + ".cho")).write_text("")
            (c / "constant" / "thermoPhysPropDict").write_text(
                "recordType    thermophysicalPropertySystem;\nschemaVersion 2;\n"
                f"components ( {comps} );\nequilibrium\n{{\n"
                "    formulation gammaPhi;\n"
                "    liquid  { activityModel ideal; standardState pureLiquid; }\n"
                "    vapour  { fugacityModel idealGas; }\n}\n")
            (c / "system" / "flowsheetDict").write_text(
                "units\n(\n    { name mix; type mixer; inputs ( A B ); "
                "outputs ( M ); }\n);\n")
            (c / "0" / "A").write_text(a_body)
            (c / "0" / "B").write_text(b_body)
            (c / "0" / "M").write_text(a_body)
            return run(c)

        psd = ("particleSizeDistribution { edges ( 1e-4 2e-4 4e-4 ); diameter "
               "( 1.414e-4 2.828e-4 ); massFrac ( 0.5 0.5 ); }")
        solidA = ("componentMolarFlows { silica 1 kmol/h; CaCO3 0 kmol/h; }\n"
                  "T 300 K; P 101325 Pa;\n"
                  f"phases {{ solid {{ componentMolarFlows {{ silica 1 kmol/h; }} {psd} }} }}\n")
        solidB = ("componentMolarFlows { silica 0 kmol/h; CaCO3 1 kmol/h; }\n"
                  "T 400 K; P 101325 Pa;\n"
                  f"phases {{ solid {{ componentMolarFlows {{ CaCO3 1 kmol/h; }} {psd} }} }}\n")
        rc, out = mixer_probe("f_solids", solidA, solidB, "silica CaCO3")
        if rc != 0:
            fails.append(f"(f) two solids-only inlets: did not run (exit {rc})")
        elif EMULSION in out:
            fails.append("(f) two SOLIDS-ONLY inlets printed '" + EMULSION +
                         "' -- a powder was counted as a liquid inlet")
        liq = ("componentMolarFlows { water 10 kmol/h; }\nT 300 K; "
               "P 101325 Pa;\nphase liquid;\n")
        rc, out = mixer_probe("f_liquids", liq, liq, "water")
        if rc != 0:
            fails.append(f"(f) two liquid inlets (positive control): did not "
                         f"run (exit {rc})")
        elif "2 " + EMULSION not in out:
            fails.append("(f) two LIQUID inlets did not print '2 " + EMULSION +
                         "' -- the positive control is dead, so the negative "
                         "proves nothing")
        else:
            claims.append("mixer emulsion line: powders 0, liquids 2")

        # ---- (g) pneumaticConveyor -----------------------------------------
        UT = "did not meet its stopping rule"
        c = copy_case("pneumaticConveyor01_sand", td, "g_ship")
        rc, out = run(c)
        if rc != 0:
            fails.append(f"(g) pneumaticConveyor01: did not run (exit {rc})")
        elif UT in out:
            fails.append("(g) pneumaticConveyor01 (Re_t far from 1000) "
                         "announced a non-converged u_t -- the negative fired")
        c = copy_case("pneumaticConveyor01_sand", td, "g_re1000")
        ok = edit(c / "0" / "Feed", r"diameter\s*\([^)]*\);",
                  "diameter  ( 0.0010564 );", count=1)
        ok = ok and edit(c / "0" / "Feed", r"massFrac\s*\([^)]*\);",
                         "massFrac  ( 1 );", count=1)
        if not ok:
            fails.append("(g) the Re ~ 1000 probe is STALE: the feed PSD "
                         "changed shape")
        else:
            rc, out = run(c)
            js = result(out) if rc == 0 else None
            adv = advisories(js, UT)
            if not adv:
                fails.append(f"(g) d_p = 1.0564 mm (exit {rc}): the terminal "
                             "velocity's substitution cycles at Re ~ 1000 and "
                             "no advisory says so")
            elif not re.search(r"changed it by [0-9.eE+-]+ \(relative\)",
                               adv[0]["message"]):
                fails.append("(g) the advisory does not quote the last "
                             "pass's relative change")
            else:
                claims.append("pneumatic u_t non-convergence announced at Re ~ 1000")

    if fails:
        print("check_solids_announcements: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_solids_announcements: OK -- " + "; ".join(claims) +
          " (7 arms, scratch copies; no hypothesis judged)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
