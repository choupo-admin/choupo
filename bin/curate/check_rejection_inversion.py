#!/usr/bin/env python3
"""Gate: a data sheet's OBSERVED rejection becomes the INTRINSIC rejection the
`constantRejection` law takes only by inverting it with the module's OWN film
at the sheet's own test -- never by pasting it.
    bin/curate/check_rejection_inversion.py

WHY THIS EXISTS (DEV.md 4c C189, slice 1).  `transport constantRejection;`
takes R_int = 1 - c_p/c_m against the WALL; a data sheet quotes 1 - c_p/c_f
against the FEED.  The wall is richer than the feed (the film polarises it,
the bulk concentrates along the leaf), so the sheet's 0.97 pasted as R_int
passes more salt than the sheet measured.  `rejection { MgSO4 fromRatedTest;
}` asks the engine to derive R_int from the module record's `ratedTest {}`
(src/unitOperations/membrane/RatedTestInversion.{H,cpp}, the one home): the
module itself is run at the rated test and R_int found by a bracketed 1-D
solve so that its predicted observed rejection is the sheet's.

WHAT THIS GATE CHECKS (every case is RUN here):
  (a) THE WITNESS AND THE ROUND TRIP.  membrane25 exits 0; prints the
      `[ratedTest] R_int(MgSO4) = ...` line on stdout AND stderr and the law's
      banner marks the R as derived; publishes R_int_fromRatedTest_MgSO4,
      ratedTest_R_obs_MgSO4 (= 0.97, the sheet's), ratedTest_cm_over_cb_MgSO4,
      ratedTest_recovery and ratedTest_permeateFlow on NFderived and none on
      NFnaive; files a `provenance` advisory naming the module.  Then the
      derived R_int is typed back as a NUMBER (the ordinary path, no
      inversion) into a copy whose NFderived feed is the rated test itself
      (2,000 ppm, 4.8 bar, 25 C, permeateFlow/recovery) and the module's
      R_obs_MgSO4 there must equal the sheet's 0.97 to 1e-7 (the solve stops
      at 1e-10 on R_obs; the slack is the 12 figures the result JSON carries
      and the feed's own rounding).  NFnaive at the same feed is printed:
      its observed rejection is BELOW the sheet's.  And the R the law USED is
      the R the run PUBLISHED: the banner prints the KPI's value, and the
      witness with that number typed back (its own 8 bar feed) gives the same
      NFderived R_obs to 1e-9 -- a KPI says what the unit derived, the
      permeate says what the law did (S1 below is why this arm exists).
  (b) OBSERVED < INTRINSIC, AND WHY.  On the witness R_int > 0.97 and
      c_m/c_b > 1.  With the film SWITCHED OFF (k_film 10 m/s, no
      correlation, filmTheory) c_m/c_b is 1 to 1e-4 and the derived R_int
      falls; the gap that remains is the bulk concentrating along the leaf,
      and it is held to the CLOSED FORM of a constant-R channel with no film
          R_obs = 1 - (1 - (1 - r)^(1 - R)) / r,   r = the probe's recovery,
      to 1e-5 at 800 stations, the gap falling first-order from 200 (the
      march is first order): R_int and R_obs are EQUAL in the limit r -> 0
      with no film, and the closed form is that limit's own correction.
  (c) THE REFUSALS, each built from the witness and each required to exit
      non-zero with its reason: a record with no ratedTest (Generic-4040); a
      solute that is not the rated one (NaCl fromRatedTest on an MgSO4
      sheet); a case declared ION BY ION (Na, Cl beside MgSO4); a rated
      rejection the film cannot reach (a case-local record at 1.0); a unit
      with no module record (inline area/length); a word that is not
      `fromRatedTest`; and the batch diafilter, which holds no module record.
  (d) NO SILENT SPREAD.  No shipped case but the witness declares
      `fromRatedTest` (an existing case is unchanged because the inversion
      runs only where declared; the scoped suite pins their goldens).

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
It does not check that the derived R_int describes the NF270 away from the
rated test (a constant R stays constant; the membrane's real R rises with
flux), nor the record's A_w (the engine's rated permeate is ~1.6x the
sheet's: check_membrane_modules arm (f), a finding, never tuned).  The
SW30HR-380 record's NaCl rated test is not inverted here (no witness).  The
ratedTest-missing-a-field refusal is the record parser's (all or nothing,
MembraneModule.cpp), held by check_membrane_modules, not here.

SABOTAGE-VERIFIED 2026-10-31 (engine edits BY HAND, rebuilt, run, restored;
the gate never patches a source):
  S1  SpiralWoundModule.cpp: setRatedRejection(s, inv.R_int) ->
      setRatedRejection(s, inv.conditions.rejectionSheet) -- the sheet's
      observed 0.97 used directly as intrinsic while the KPI still says
      0.983313.  SURVIVED the first draft of this gate (exit 0, OK): every
      arm read the KPI, none read what the law DID.  Two arms added, and
      both now catch it: "the law's banner prints R_int 0.97, the KPI says
      0.983313" and "the witness's NFderived R_obs 0.9006514271 is not what
      its published R_int 0.9833132950 gives when typed (0.9442593278)".
  S1b RatedTestInversion.cpp: inv.R_int = target (the observed value returned
      as the derived one, no solve).  CAUGHT by (a) ("the derived R_int =
      0.97 re-run at the rated test gives R_obs 0.9462545885, not the
      sheet's 0.97") and by (b) four times (R_int not > 0.97; the film-off
      closed form at 0.96462699; the gap 5.37e-03 not falling with the grid).
  S2  RatedTestInversion.cpp: the ion-by-ion refusal disabled
      (`if (false && ...)`).  CAUGHT by (c) ONLY: "ion-by-ion: the probe ran
      to exit 0 -- no refusal".
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_constant_rejection as ccr      # noqa: E402  (run / copy_case / set_law: one home)

ROOT = Path(__file__).resolve().parents[2]
WITNESS = ROOT / "tutorials/steady/membranes/membrane25_rated_test_inversion_nf270_4040"
M21 = ROOT / "tutorials/steady/membranes/membrane21_two_stage_nf_array"
DIA = ROOT / "tutorials/batch/membrane/diafilter01_nf_desalting"
SHEET_R = 0.97
MW = {"water": 18.015, "MgSO4": 120.37}

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


def run_split(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(ROOT / "choupoSolve"), str(case)], capture_output=True,
                       text=True, timeout=900, env=env, cwd=str(case))
    return r.returncode, r.stdout, r.stderr


def kp(js, unit):
    return js.get("kpis", {}).get(unit, {})


def sub(path, pattern, repl, count=1, flags=0):
    s = path.read_text()
    s2 = re.sub(pattern, repl, s, count=count, flags=flags)
    if s2 == s:
        raise RuntimeError("fixture edit did not apply in %s: %r" % (path, pattern))
    path.write_text(s2)


def derived_block(text):
    """The NFderived unit's text (the first unit)."""
    i = text.index("name        NFderived;")
    j = text.index("name        NFnaive;")
    return i, j


def edit_derived(case, pattern, repl, flags=0):
    p = case / "system/flowsheetDict"
    s = p.read_text()
    i, j = derived_block(s)
    head, body, tail = s[:i], s[i:j], s[i + (j - i):]
    body2 = re.sub(pattern, repl, body, count=1, flags=flags)
    if body2 == body:
        raise RuntimeError("NFderived edit did not apply: %r" % pattern)
    p.write_text(head + body2 + tail)


def rated_feed(path):
    """Write the rated test's feed exactly as the engine's probe builds it:
    2,000 ppm MgSO4 at rho 1000 and permeateFlow / recovery, 4.8 bar, 25 C."""
    Q = 9.5 / 0.15 / 24.0                       # m3/h
    m = Q * 1000.0
    s = path.read_text()
    s = re.sub(r"water\s+[0-9.eE+-]+ kmol/h;", "water   %.12g kmol/h;" % (m * 0.998 / MW["water"]), s)
    s = re.sub(r"MgSO4\s+[0-9.eE+-]+ kmol/h;", "MgSO4   %.12g kmol/h;" % (m * 0.002 / MW["MgSO4"]), s)
    s = re.sub(r"P\s+8\.0 bar;", "P               4.8 bar;", s)
    path.write_text(s)


def refusal(tmp, label, mutate, must):
    d = tmp / ("refuse_" + label)
    ccr.copy_case(WITNESS, d)
    mutate(d)
    rc, so, se = run_split(d)
    out = so + se
    if rc == 0:
        fail("(c) %s: the probe ran to exit 0 -- no refusal" % label)
        return
    for m in must:
        if m not in out:
            fail("(c) %s: exit %d but the message lacks %r:\n%s" % (label, rc, m, out[-700:]))
            return
    print("  (c) %s: refused (exit %d)" % (label, rc))


def main():
    tmp = Path(tempfile.mkdtemp(prefix="check_rejection_inversion_"))
    R_int = None
    try:
        # ---- (a) the witness ----------------------------------------------
        rc, so, se = run_split(WITNESS)
        js = ccr.result_of(so)
        if rc != 0 or js is None:
            fail("(a) the witness did not run (exit %d):\n%s" % (rc, (so + se)[-800:]))
        else:
            d, n = kp(js, "NFderived"), kp(js, "NFnaive")
            R_int = d.get("R_int_fromRatedTest_MgSO4")
            if "[ratedTest] R_int(MgSO4) = " not in so:
                fail("(a) no [ratedTest] line on stdout")
            if "[ratedTest] spiralWoundModule 'NFderived': R_int(MgSO4) = " not in se:
                fail("(a) no [ratedTest] line on stderr")
            mb = re.search(r"\[constantRejection\] R_int:\s+MgSO4 ([0-9.]+) \(derived from the rated test\)", so)
            if not mb:
                fail("(a) the constantRejection banner does not mark the R as derived")
            elif R_int is not None and abs(float(mb.group(1)) - R_int) > 1e-6:
                fail("(a) the law's banner prints R_int %s, the KPI says %.6f" % (mb.group(1), R_int))
            for key in ("R_int_fromRatedTest_MgSO4", "ratedTest_R_obs_MgSO4", "ratedTest_cm_over_cb_MgSO4",
                        "ratedTest_recovery", "ratedTest_permeateFlow"):
                if key not in d:
                    fail("(a) NFderived publishes no %s" % key)
                if key in n:
                    fail("(a) NFnaive publishes %s although it declared no inversion" % key)
            if abs(d.get("ratedTest_R_obs_MgSO4", -1) - SHEET_R) > 1e-12:
                fail("(a) ratedTest_R_obs_MgSO4 = %s is not the sheet's %g" % (d.get("ratedTest_R_obs_MgSO4"), SHEET_R))
            adv = [a for a in js.get("advisories", [])
                   if a.get("category") == "provenance" and "DERIVED from the rated test of module 'NF270-4040'" in a.get("message", "")]
            if not adv:
                fail("(a) no provenance advisory names the derivation")
            elif adv[0].get("status") != "accepted":
                fail("(a) the derivation advisory is filed as %r, not accepted" % adv[0].get("status"))

        # ---- (a) the round trip at the rated test -------------------------
        if R_int is not None:
            rt = tmp / "roundtrip"
            ccr.copy_case(WITNESS, rt)
            edit_derived(rt, r"MgSO4 fromRatedTest;", "MgSO4 %.15g;" % R_int)
            rated_feed(rt / "0/feedDerived")
            rated_feed(rt / "0/feedNaive")
            rc, so, se = run_split(rt)
            jr = ccr.result_of(so)
            if rc != 0 or jr is None:
                fail("(a) the round-trip probe did not run (exit %d):\n%s" % (rc, (so + se)[-800:]))
            else:
                ro = kp(jr, "NFderived").get("R_obs_MgSO4", float("nan"))
                rn = kp(jr, "NFnaive").get("R_obs_MgSO4", float("nan"))
                if "[ratedTest]" in so:
                    fail("(a) the round-trip probe declared a number and still inverted")
                if not abs(ro - SHEET_R) <= 1e-7:
                    fail("(a) the derived R_int = %.12g re-run at the rated test gives R_obs %.10f, not the sheet's %g"
                         % (R_int, ro, SHEET_R))
                if not rn < SHEET_R:
                    fail("(a) the naive R_int = 0.97 at the rated test gives R_obs %.6f, not below the sheet's" % rn)
                print("  (a) R_int %.6f re-run at the rated test: R_obs %.10f (sheet %.2f, |diff| %.1e); "
                      "0.97 pasted as intrinsic there: R_obs %.6f" % (R_int, ro, SHEET_R, abs(ro - SHEET_R), rn))

        # ---- (a) the R the law USED is the R the run published -------------
        #  A KPI is what the unit says it derived; the permeate is what the law
        #  did.  The same witness with the published R_int typed back as a
        #  number (its own 8 bar feed) must give the same NFderived permeate.
        if R_int is not None:
            used = tmp / "used"
            ccr.copy_case(WITNESS, used)
            edit_derived(used, r"MgSO4 fromRatedTest;", "MgSO4 %.15g;" % R_int)
            rc, so, se = run_split(used)
            ju = ccr.result_of(so)
            if rc != 0 or ju is None:
                fail("(a) the R-used probe did not run (exit %d):\n%s" % (rc, (so + se)[-800:]))
            else:
                ru = kp(ju, "NFderived").get("R_obs_MgSO4", float("nan"))
                rw = kp(js, "NFderived").get("R_obs_MgSO4", float("nan"))
                if not abs(ru - rw) <= 1e-9:
                    fail("(a) the witness's NFderived R_obs %.10f is not what its published R_int %.10f gives when "
                         "typed (%.10f): the law did not use the R the run published" % (rw, R_int, ru))
                else:
                        print("  (a) R used = R published: NFderived R_obs at 8 bar %.10f, re-run with the number typed %.10f"
                          % (rw, ru))

        # ---- (b) observed < intrinsic, and why ----------------------------
        if R_int is not None:
            cmcb = kp(js, "NFderived").get("ratedTest_cm_over_cb_MgSO4", 0.0)
            if not (R_int > SHEET_R and cmcb > 1.0):
                fail("(b) witness: R_int %.6f, c_m/c_b %.6f -- expected R_int > %.2f with c_m/c_b > 1" % (R_int, cmcb, SHEET_R))
            #  The film switched off, at two station counts: the closed form is
            #  the exact answer of the CONTINUOUS channel and the march is
            #  first order (check_constant_rejection (b)), so the gap must be
            #  small at 800 stations AND fall about 4x from 200 to 800 -- a
            #  wrong inversion does not shrink with the grid.
            got = {}
            for nodes in (200, 800):
                off = tmp / ("filmOff%d" % nodes)
                ccr.copy_case(WITNESS, off)
                edit_derived(off, r"massTransfer\s*\{[^}]*\}\s*pressureDrop\s*\{[^}]*\}", "k_film 10.0;", flags=re.S)
                edit_derived(off, r"suctionCorrection\s+GeraldesAfonso2006;", "suctionCorrection filmTheory;")
                edit_derived(off, r"nNodes\s+50;", "nNodes %d;" % nodes)
                rc, so, se = run_split(off)
                jo = ccr.result_of(so)
                if rc != 0 or jo is None:
                    fail("(b) the film-off probe at %d stations did not run (exit %d):\n%s" % (nodes, rc, (so + se)[-800:]))
                    continue
                k = kp(jo, "NFderived")
                R0, g0, r0 = (k.get("R_int_fromRatedTest_MgSO4"), k.get("ratedTest_cm_over_cb_MgSO4"),
                              k.get("ratedTest_recovery"))
                if None in (R0, g0, r0):
                    fail("(b) the film-off probe at %d stations published no inversion KPIs" % nodes)
                    continue
                cf = 1.0 - (1.0 - (1.0 - r0) ** (1.0 - R0)) / r0
                got[nodes] = (R0, g0, r0, cf)
                if abs(g0 - 1.0) > 1e-4:
                    fail("(b) film off: c_m/c_b = %.8f, not 1" % g0)
                if not (SHEET_R < R0 < R_int):
                    fail("(b) film off: R_int %.8f is not between the sheet's %.2f and the polarised %.8f" % (R0, SHEET_R, R_int))
            if len(got) == 2:
                d200, d800 = abs(got[200][3] - SHEET_R), abs(got[800][3] - SHEET_R)
                if d800 > 1e-5:
                    fail("(b) film off at 800 stations: the closed form at R_int %.8f, r %.6f gives R_obs %.8f, not %.2f"
                         % (got[800][0], got[800][2], got[800][3], SHEET_R))
                if not (3.0 <= d200 / max(d800, 1e-300) <= 5.0):
                    fail("(b) film off: the closed-form gap does not fall first-order with the grid (%.2e at 200, %.2e at 800)"
                         % (d200, d800))
                R0, g0, r0, cf = got[800]
                print("  (b) polarised: R_int %.6f at c_m/c_b %.4f; film off: R_int %.6f at c_m/c_b %.7f, recovery %.4f, "
                      "closed form R_obs %.8f (gap %.1e at 800 stations, %.1e at 200)"
                      % (R_int, cmcb, R0, g0, r0, cf, d800, d200))

        # ---- (c) the refusals ---------------------------------------------
        def generic(d):
            edit_derived(d, r"module\s+NF270-4040;[^\n]*", "module Generic-4040;  membrane NF270;")
        refusal(tmp, "no-ratedTest", generic, ["Generic-4040", "carries no `ratedTest {}`"])

        def wrong(d):
            sub(d / "constant/thermoPhysPropDict", r"components\s*\(\s*water\s+MgSO4\s*\);", "components ( water MgSO4 NaCl );")
            edit_derived(d, r"MgSO4 fromRatedTest;", "MgSO4 0.97;  NaCl fromRatedTest;")
        refusal(tmp, "wrong-solute", wrong, ["rated on MgSO4, not on NaCl"])

        def ions(d):
            sub(d / "constant/thermoPhysPropDict", r"components\s*\(\s*water\s+MgSO4\s*\);", "components ( water MgSO4 Na Cl );")
            for sp in ("components", "species"):
                for nm in ("Na", "Cl"):
                    src = M21 / "constant" / sp / (nm + ".dat")
                    if src.exists():
                        (d / "constant" / sp).mkdir(parents=True, exist_ok=True)
                        shutil.copy(src, d / "constant" / sp / (nm + ".dat"))
            edit_derived(d, r"MgSO4 fromRatedTest;", "MgSO4 fromRatedTest;  Na 0.5;  Cl 0.5;")
        refusal(tmp, "ion-by-ion", ions, ["ION BY ION", "Na (z = 1)", "SDEM"])

        def unreachable(d):
            rec = d / "constant/assets/NF270-4040.dat"
            if not rec.exists():
                rec.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(ROOT / "data/standards/assets/NF270-4040.dat", rec)
            sub(rec, r"rejection\s+0\.97;", "rejection         1.0;")
        refusal(tmp, "unreachable", unreachable, ["not reachable", "STRICTLY between", "R_int = 1 (100 %)"])

        def nomodule(d):
            edit_derived(d, r"module\s+NF270-4040;[^\n]*",
                         "membrane NF270;  area 7.6 m2;  length 0.95 m;")
            edit_derived(d, r"viscosity\s+0\.89e-3;", "viscosity 0.89e-3;  channelHeight 0.7112 mm;  spacerPorosity 0.90;")
            edit_derived(d, r"model\s+SchockMiquel;\s*\}", "model SchockMiquel;  channelHeight 0.7112 mm;  spacerPorosity 0.90; }")
        refusal(tmp, "no-module", nomodule, ["names no module"])

        def word(d):
            edit_derived(d, r"MgSO4 fromRatedTest;", "MgSO4 fromDataSheet;")
        refusal(tmp, "unknown-word", word, ["`fromDataSheet`", "`fromRatedTest`"])

        dd = tmp / "refuse_diafilter"
        ccr.copy_case(DIA, dd)
        ccr.set_law(dd, ccr.law_block("NaCl fromRatedTest;  MgSO4 0.98;"))
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))
        r = subprocess.run([str(ROOT / "choupoBatch"), str(dd)], capture_output=True, text=True,
                           timeout=900, env=env, cwd=str(dd))
        if r.returncode == 0:
            fail("(c) diafilter: `fromRatedTest` on a unit with no module record ran to exit 0")
        elif "holds no module record" not in r.stdout + r.stderr:
            fail("(c) diafilter: exit %d without the reason:\n%s" % (r.returncode, (r.stdout + r.stderr)[-600:]))
        else:
            print("  (c) diafilter: refused (exit %d)" % r.returncode)

        # ---- (d) no silent spread -----------------------------------------
        users = []
        for p in (ROOT / "tutorials").rglob("flowsheetDict"):
            if re.search(r"\bfromRatedTest\s*;", ccr_strip(p.read_text())):
                users.append(p.parent.parent.relative_to(ROOT).as_posix())
        if users != [WITNESS.relative_to(ROOT).as_posix()]:
            fail("(d) the cases declaring `fromRatedTest` are %s, expected the witness alone" % users)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_rejection_inversion: FAILED (%d)" % len(fails))
        return 1
    print("check_rejection_inversion: OK -- membrane25 derives R_int(MgSO4) = %.6f from the NF270-4040 sheet's "
          "OBSERVED 0.97 with the module's own film (announced on stdout, stderr and as an accepted provenance "
          "advisory; five KPIs); typed back as a number and re-run at the rated test it reproduces 0.97 to 1e-7, and at the witness's own feed it reproduces the witness (the R used is the R published); "
          "R_int > R_obs with c_m/c_b > 1, and with the film off the gap is the closed-form bulk term to 1e-5; "
          "7 refusals by name (no ratedTest, wrong solute, ion-by-ion feed, unreachable rejection, no module, "
          "unknown word, batch diafilter); no other shipped case declares fromRatedTest.  NOT CHECKED: R_int away "
          "from the rated test, the record's A_w, the SW30HR-380 sheet." % (R_int or float("nan")))
    return 0


def ccr_strip(text):
    return re.sub(r'("[^"]*")|/\*.*?\*/|//[^\n]*', lambda m: m.group(1) or "", text, flags=re.S)


if __name__ == "__main__":
    sys.exit(main())
