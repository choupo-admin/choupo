#!/usr/bin/env python3
"""Gate: an evaporator's chest must ARRIVE as vapour, and a chest that does not REFUSES.

    bin/curate/check_evaporator_chest_phase.py

WHY THIS EXISTS.  `Evaporator::solve` computes its duty as

    Q = F_chest * [h(chest) - h(condensate)]

(since 2026-10-05; until then `Q = F_chest * dHvap(T_steam)`, the Watson
correlation -- see arms (c) and (i)), which ASSERTS a complete condensation.
It read `T` and `F` off the chest stream and nothing else: `vf` appeared
nowhere in the file except on the three outlets.  So a chest carrying LIQUID
water was accepted in silence, the unit delivered the full latent heat to the
process, and the plant boundary -- which prices the same stream on what it
carries -- credited none of it.

MEASURED 2026-09-12.  `H(chest inlet)` and `H(condensate outlet)` came out
EQUAL TO THE LAST PRINTED DIGIT on six shipped cases, so the chest leg
contributed exactly 0.000000 kW where the unit had just spent 487.49 kW of it.
`evaporator06_nacl_pitzer` published a first-law residual of -485.694246 kW --
99.6 % of its own duty -- at exit 0, and four more read nearly the same number
because they read the same stream file.  `evaporator02_triple_effect_sugar`
published -6162.501950 kW.

WHY THE CASES LOOKED RIGHT, and this is the part worth a gate.  A saturated
steam supply sits exactly ON the saturation curve, and that is the one place
where (T, P) cannot say which side of it you are on: the case's own Antoine
returns Psat(401.6288333 K) = 270000.72 Pa against a declared 270000 Pa.  The
state is CORRECT and INCOMPLETE, and the default for the missing word is
LIQUID.  Nothing in the case text is wrong; something is absent.  An absent
declaration is harder to see than a contradictory one, because there is nothing
to compare it with -- which is exactly why the engine has to ask.

A REFUSAL NOBODY FIRES ROTS.  `core/RegistryRefusal.H` carries 41 sentences and
not one of them is fired by a gate or by a corpus case; the shipped cases are
now CORRECT, so no corpus run can ever reach this message again.  This gate
therefore OWNS the offending case: it writes the fixture itself, so the day
somebody fixes a tutorial the gate does not quietly stop testing anything (the
`check_true_ions` shape).

WHAT THIS GATE CHECKS.

  (a) THE REFUSAL FIRES on an evaporator whose chest declares no phase, and
      the message NAMES the stream, the vapour fraction it was read as, the
      remedy WITH THE FILE PATH FILLED IN, and the alternative (this is the
      wrong unit for a sensible-heat medium).  A refusal that states a rule
      without stating the edit teaches only unease (invariant I5).

  (b) THE NEGATIVE: the same fixture with `phase gas;` on the chest RUNS.
      Without this arm the gate is satisfied by a unit that refuses
      everything.

  (c) THE SUPERHEATED ARM, rewritten 2026-10-05 (DEV.md 4d D1, the chest
      half).  A chest 37.8 K above its saturation temperature is
      UNAMBIGUOUSLY vapour.  It used to be REFUSED as liquid, because
      `resolveStreamThermalState` answers "is there a split to price" and on
      a converged single-phase answer keeps the CARRIED vf, whose default is
      0.  The evaporator now reads the vapour fraction the stream MEANS
      (`flashState::resolvedInletVaporFraction`, the reading the flowsheet's
      surface pass and so the report take), single phase included.  Two
      halves, because MEASURING the fix found a second cause:

      (c1) WHERE THE PACKAGE RESOLVES IT, IT RUNS: the fixture with a
           water-only package (`superheatW`) runs, publishes its chest at
           vf = 1, and the evaporator's own energy row closes against the
           report within 1e-4 kW.
      (c2) WHERE IT DOES NOT, IT STILL REFUSES -- AND SAYS WHY.  In the
           donor's water + sucrose package the chest carries ZERO sucrose
           whose K is 0, so `IsothermalFlash`'s dew test sums z/K = 0/0 =
           NaN, never classes the stream as superheated and returns an
           unconverged "two-phase" answer; `equilibriumAt` discards it and
           the carried default stands in the unit AND in the report.  The
           refusal must name that cause ("could not resolve").  THIS IS A
           STALE-PIN ARM: the day the flash's phase test skips z_i = 0 (a
           one-line guard on a path every flash goes through, which needs a
           full regression to take), (c2) fails and asks to become a (c1).

  (d) THE DECLARED-AND-WRONG ARM: a chest pinned `vaporFraction 0.5;` refuses
      too.  A half-condensed chest is not a saturated-vapour supply, and this
      is the arm that shows the rule is about the STATE rather than about the
      presence of a keyword.

  (e) SOURCE, COUNTED: all THREE evaporator outlets stay pinned.  `conc`,
      `vap` and `cond` are declarations this model makes, and an unpinned
      outlet is re-solved by every reader downstream.  COUNTED, not detected:
      a presence test is satisfied by whichever site is still correct (the
      trap `check_internal_states` arm (o) paid for).

  (f) SOURCE: the condensate does not take its pressure from the wrong inlet.
      It used to be written `cond.P = 0.0` and filled in by `Flowsheet.cpp`'s
      `if (s.P <= 0.0) s.P = P_inherit`, where `P_inherit` is the FIRST
      input's pressure -- the PROCESS FEED, not the steam chest.  On
      `evaporator06` that put a 128.48 C condensate at 1 bar, a state whose own
      Psat is 2.7 bar: superheated vapour by a factor of 2.7, labelled vf = 0.

  (g) ARITY: the resolution has ONE home.  `flashState::resolveStreamThermalState`
      is DEFINED exactly once in the tree, and both readers CALL it -- the
      column (which wrote it first) and the evaporator (which needed the same
      sentence four days later).  Comments are stripped before this arm runs:
      prose is not a call (`check_sector_hierarchy` arm (g) paid for that).

  (h) OUTPUT, from the engine's own report, never recomputed here: the chest
      steam of `evaporator06_nacl_pitzer` is priced as VAPOUR (its published
      `vf` is 1), and `phasechange01_partial_condenser` closes its
      plant-boundary first law at or below 1e-6 kW.  The second is the case
      whose omission corrupted the ANSWER rather than only the report.

  (i) THE EVAPORATOR'S OWN BALANCE CLOSES (2026-10-05, Vitor's ruling, DEV.md
      4c C35 item 3): the duty's latent heat is the enthalpy difference the
      energy report prices, h(chest) - h(condensate), not the Watson
      correlation, and the process side is priced on the same surface.  Read
      from the engine's own `energyClosures`: every evaporator row of
      `evaporator06_nacl_pitzer` (one effect, a Pitzer liquor carrying L_phi)
      and `evaporator02_triple_effect_sugar` (three effects, two of them
      heated by a PRODUCED vapour) leaves at most 1e-4 kW unattributed.
      Until that day the single-effect brine cases left +17.6 ... +18.4 kW
      and the triple effect -89.1 / -16.3 / -28.8 kW: the Watson latent heat
      is 3.30 % from the package's own at 401.63 K.  `check_energy_closure`'s
      unit arm holds the same rule corpus-wide; this arm holds it on cases
      this gate already runs, beside the refusal it is about.

WHAT THIS GATE DOES NOT CHECK, said plainly:

  * WHETHER A DECLARED PHASE IS TRUE OF THE STREAM.  `phase gas;` on a state
    that is plainly liquid is accepted -- a declaration is never re-solved
    (R-E2), and the engine has no second opinion to hold it to.

  * THAT EVERY CHEST IN THE CORPUS DECLARES ONE.  The engine refuses at run
    time, so a case that omits it cannot reach exit 0; re-deriving the
    flowsheet topology here to find those streams would be a second home for
    a question the engine already answers.  `evaporator05_counter_current`'s
    tear seeds were found by exactly that runtime refusal, not by a scan.

  * A NO-DATUM EVAPORATOR.  A feed or chest carrying a component with no
    enthalpy datum keeps the Watson balance, ANNOUNCED, and the report is
    UNAVAILABLE for it -- there is no surface to close against, so arm (i)
    has nothing to read there and judges nothing.

  * THE CONDENSATE OF A SUPERHEATED CHEST.  It is published at T_steam, the
    model's existing statement, not at Tsat(P_chest); the vapour chests of a
    multi-effect train are the same shape by their BPE.  Arm (c1) checks the
    chest is READ and the unit CLOSES, not where its condensate should leave.

  * ANY OTHER UNIT.  The `phaseChanger` reads its inlet's `vf` and is not
    covered by arms (a)-(g); only arm (h) touches it, and only through its
    published first law.

SABOTAGE-VERIFIED 2026-10-05, arms (c1), (c2) and (i), by hand: each applied,
read back off disk, the engine rebuilt, the gate run, then the source restored
byte-identical (md5 checked against the pre-sabotage copy) and `make all`.

  W1  restore the Watson duty (`dHcond_at_steam = dHvap_solv(T_steam)` on the
      priced path) -> "(i) evaporator06_nacl_pitzer: evaporator 'evap' leaves
      -16.103840 kW" -- exactly the D2 term of
      docs/design/the-word-that-was-not-there.md -- and effect1/2/3 of
      evaporator02 -152.97 / -62.74 / -46.54 kW, and "(c1) ... leaves
      -262.110372 kW".  check_energy_closure's unit arm, run on the same
      build, named all ten evaporator rows in the corpus (the flagship's
      Evap1 -21.0456, Evap2 -10.3209) and its plant arm re-opened the eight
      removed pins.
  W2  mis-price the condensate (priced 10 K below the T it is published at)
      -> "(i) ... 'evap' leaves +9.437500 kW", effect1/2/3 +103.81 / +69.69
      / +75.59 kW, "(c1) ... leaves +103.812500 kW".
  W3  drop the single-phase reading of the chest (keep only
      `resolveStreamThermalState`) -> "(c1) a chest 37.8 K above its
      saturation temperature ... did not run (exit 2)", AND "(c2) the
      superheated chest refused, but the refusal does not say the package
      COULD NOT RESOLVE its equilibrium" -- the diagnosis lives in the same
      branch, so a refusal that gives the wrong cause is caught too.

SABOTAGE-VERIFIED 2026-09-12.  Each sabotage was applied, READ BACK OFF DISK to
prove it landed, the engine rebuilt, the gate run, then reverted (md5 checked).
Two results did NOT match the prediction and are recorded as measured, because
a sabotage table that reports what the author expected is not evidence.

  S1  delete the whole refusal block from Evaporator.cpp
      -> (a), (c), (d) and (g) all fire.  "an evaporator whose chest declares
         NO phase ran to exit 0"

  S2  keep the refusal, delete the remedy sentence from its message
      -> "(a) the refusal fired but does not name the remedy" AND "(a) the
         refusal does not name WHICH file to edit"

  S3  narrow the rule to the DECLARED field: read `vf` straight off the dict
      and do not resolve.
      -> CAUGHT, but NOT WHERE I EXPECTED, and the difference matters.  Arms
         (a), (c)'s refusal test and (d) ALL STILL PASS: the carried default is
         0 in every fixture this gate can build, so the narrowed rule and the
         real one give the same VERDICT on all three.  What fired was (g) --
         the call is gone, and the name survived only in a comment, which
         `strip_comments` removes -- and (c)'s secondary test, because the
         narrowed rule cannot say the state was "carried ... (single phase)".
         So this gate catches S3 STRUCTURALLY and not behaviourally, and the
         honest reading is that it cannot tell the two rules apart by their
         answers.  It would take a chest that RESOLVES two-phase while
         declaring nothing -- and such a chest is refused by both rules, since
         a half-condensed chest is not a saturated-vapour supply either.  The
         arm that CAN separate them lives on a column, where the resolved
         state and the declared field genuinely disagree:
         `check_feed_thermal_state` arm (d), the stripper shape.

  S4  unpin `cond` only, leaving `conc` and `vap` pinned
      -> "(e) 2 of the evaporator's 3 outlets are pinned".  MEASURED, because
         the alternative was worth knowing rather than asserting: arm (e) was
         temporarily rewritten as a PRESENCE test (`re.search` for any
         `.phasePinned = true`) and S4 re-run against it -- the gate exited 0
         and printed no (e) line at all.  Two correct sites answered for the
         third.  The count is load-bearing.

  S5  restore `cond.P = 0.0;`
      -> "(f) the evaporator's condensate takes no pressure of its own"

  S6  add a SECOND copy of `resolveStreamThermalState` inside Evaporator.cpp
      (a working local copy, and the call switched to it, so the engine builds
      and every behavioural arm passes)
      -> "(g) `resolveStreamThermalState` is defined 2 time(s) in src/".  This
         is the only arm that sees it: a second home that works is invisible
         to every output.

  S7  strip `phase gas;` from evaporator06's shipped chest file
      -> "(h) evaporator06_nacl_pitzer did not run (exit 2)" -- arm (a) firing
         on a corpus case, which is what arm (h) exists to keep honest from the
         other side.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAP = ROOT / "src" / "unitOperations" / "heatTransfer" / "Evaporator.cpp"
COLUMN = ROOT / "src" / "unitOperations" / "distillation" / "DistillationColumn.cpp"
SHARED = ROOT / "src" / "unitOperations" / "flash" / "StreamEquilibrium.H"

#  The fixture's components come from a shipped case's `constant/` tree, read
#  only.  Everything the gate is ABOUT -- the flowsheet and the chest stream --
#  is written here, so the gate owns the case that provokes the refusal.
DONOR = ROOT / "tutorials" / "steady" / "evaporation" / "evaporator02_triple_effect_sugar"
EVAP06 = ROOT / "tutorials" / "steady" / "evaporation" / "evaporator06_nacl_pitzer"
EVAP02 = DONOR
PHASECHANGE = ROOT / "tutorials" / "steady" / "heat" / "phasechange01_partial_condenser"

CONTROL = """\
application   choupoSolve;
description   "check_evaporator_chest_phase fixture";
verbosity     2;
"""

FLOWSHEET = """\
units
(
    {
        name        probeEvap;
        type        evaporator;
        inputs      ( feed  chest );
        outputs     ( conc  vap  cond );
        operation
        {
            area          100.0 m2;
            U            2319.0 W/m2/K;
        }
    }
);
"""

FEED = """\
componentMolarFlows
{
    water      1000 kmol/h;
    sucrose       3 kmol/h;
}

T               295 K;
P               200000 Pa;
"""

CHEST = """\
componentMolarFlows
{
    water      495 kmol/h;
}

T               %(T)s K;
P               200000 Pa;
%(phase)s"""

#  Outlet seeds.  The unit rewrites all three; `0/` completeness only needs
#  them present and parseable.
SEED = """\
componentMolarFlows
{
    water      %(w)s kmol/h;
    sucrose    %(s)s kmol/h;
}

T               %(T)s K;
P               200000 Pa;
"""


def build_fixture(root: Path, T_chest: str, phase: str, tag: str) -> Path:
    case = root / ("chestProbe_" + tag)
    if case.exists():
        shutil.rmtree(case)
    (case / "system").mkdir(parents=True)
    (case / "0").mkdir()
    shutil.copytree(DONOR / "constant", case / "constant")
    #  The sealed manifest is the donor's, and this is not the donor.
    (case / "constant" / "propertyManifest").unlink(missing_ok=True)
    (case / "system" / "controlDict").write_text(CONTROL)
    (case / "system" / "flowsheetDict").write_text(FLOWSHEET)
    (case / "0" / "feed").write_text(FEED)
    (case / "0" / "chest").write_text(CHEST % {"T": T_chest, "phase": phase})
    (case / "0" / "conc").write_text(SEED % {"w": "650", "s": "3", "T": "368"})
    (case / "0" / "vap").write_text(SEED % {"w": "350", "s": "0", "T": "368"})
    (case / "0" / "cond").write_text(SEED % {"w": "495", "s": "0", "T": "392"})
    return case


def water_only(case: Path) -> Path:
    """Strip the donor's sucrose from a fixture: a water-only package, whose
    flash CAN class a superheated chest as vapour (arm (c1)).  The feed is then
    pure water -- an evaporator needs exactly one volatile, not a solute."""
    tp = case / "constant" / "thermoPhysPropDict"
    txt = tp.read_text()
    new = re.sub(r"components\s*\(\s*water\s+sucrose\s*\)\s*;",
                 "components       ( water );", txt)
    if new == txt:
        raise SystemExit("check_evaporator_chest_phase: the donor's "
                         "thermoPhysPropDict no longer declares `components "
                         "( water sucrose );` -- arm (c1) cannot build its "
                         "water-only fixture; update water_only().")
    tp.write_text(new)
    for f in ("feed", "conc", "vap", "cond"):
        q = case / "0" / f
        q.write_text(re.sub(r"\n\s*sucrose[^\n]*", "", q.read_text()))
    return case


def unit_rows(out: str, utype: str = "evaporator"):
    """(unit, remaining_kW) for every unit of `utype` in the engine's own
    `energyClosures`, matched to its type through the console header -- the
    same two channels check_energy_closure's unit arm reads."""
    types = dict(re.findall(r">>>  Unit \[\d+\]:\s+(\S+)\s+\(type = (\w+)\)",
                            out))
    at = out.find('"energyClosures": ')
    if at < 0:
        return None
    try:
        rows = json.JSONDecoder().raw_decode(out, at + len('"energyClosures": '))[0]
    except ValueError:
        return None
    return [(r.get("unit"), float(r.get("remaining_kW", 0.0)))
            for r in rows if types.get(r.get("unit")) == utype]


UNIT_TOL_KW = 1.0e-4


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=str(case),
                       env=env, capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def strip_comments(text: str) -> str:
    """Remove // and /* */ so prose cannot satisfy a source arm.

    Paid for by check_sector_hierarchy arm (g), where a symbol named only in a
    BLOCK comment satisfied a "the code calls it" test.  Prose is not a call.
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def result_json(out: str):
    """The run's own result block, or None."""
    i = out.find('{ "version": 1,')
    if i < 0:
        return None
    depth = 0
    for j in range(i, len(out)):
        if out[j] == "{":
            depth += 1
        elif out[j] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(out[i:j + 1])
                except Exception:
                    return None
    return None


#  Tsat(200 kPa) for the donor's own water record, and 37.8 K above it.  The
#  first is the ambiguous state the corpus shipped; the second is the
#  unambiguous one arm (c) needs.
T_SAT = "392.1781136"
T_SUPERHEAT = "430.0"


def main() -> int:
    failures = []
    tmp = Path(tempfile.mkdtemp(prefix="choupo-chestphase-"))
    try:
        # ---- (a) the refusal fires, and names the edit --------------------
        case = build_fixture(tmp, T_SAT, "", "nophase")
        rc, out = run(case)
        if rc == 0:
            failures.append(
                "(a) an evaporator whose chest declares NO phase ran to exit "
                "0.  Its duty is Q = F_chest * dHvap(T_steam), which asserts a "
                "complete condensation; a chest read as liquid carries none of "
                "that heat across the plant boundary.  That is -485.694246 kW "
                "on evaporator06_nacl_pitzer and -6162.501950 kW on "
                "evaporator02_triple_effect_sugar, at exit 0, for as long as "
                "nobody asked.")
        else:
            if "is not vapour" not in out:
                failures.append(
                    "(a) the run failed but not with the chest-phase refusal; "
                    "some other error is being read as this one.  Output "
                    "tail: " + out[-400:])
            if "phase gas;" not in out:
                failures.append(
                    "(a) the refusal fired but does not name the remedy.  A "
                    "reader meeting this cold needs the EDIT, not the rule "
                    "(invariant I5): the message must say `phase gas;` and "
                    "the state file to put it in.")
            if "0/chest" not in out:
                failures.append(
                    "(a) the refusal does not name WHICH file to edit.  An "
                    "evaporator chest is inlet 2 of 2 and the reader cannot "
                    "be left to guess which of its inlets is at fault.")
            if "wrong model" not in out:
                failures.append(
                    "(a) the refusal names only one remedy.  The other is "
                    "real and a reader may need it: a heater fed by a "
                    "sensible-heat medium is not an evaporator chest, and the "
                    "engine must not imply the only fix is to relabel the "
                    "stream as steam.")

        # ---- (b) THE NEGATIVE: the declared case runs ---------------------
        case = build_fixture(tmp, T_SAT, "phase           gas;\n", "gas")
        rc, out = run(case)
        if rc != 0:
            failures.append(
                f"(b) the SAME fixture with `phase gas;` on its chest did not "
                f"run (exit {rc}).  Without this arm the gate is satisfied by "
                f"an evaporator that refuses everything.  Output tail: "
                + out[-400:])

        # ---- (c1) a SUPERHEATED chest the package resolves RUNS ----------
        case = water_only(build_fixture(tmp, T_SUPERHEAT, "", "superheatW"))
        rc, out = run(case)
        if rc != 0:
            failures.append(
                "(c1) a chest 37.8 K above its saturation temperature, "
                "declaring no phase, in a package whose flash resolves it as "
                "single-phase VAPOUR, did not run (exit %d).  It is "
                "unambiguously vapour; the evaporator must read the vapour "
                "fraction the stream MEANS (flashState::"
                "resolvedInletVaporFraction), not the carried default 0 that "
                "`resolveStreamThermalState` keeps on a single-phase answer "
                "(DEV.md 4d D1, the chest half).  Output tail: %s"
                % (rc, out[-400:]))
        else:
            res = result_json(out)
            st = (res or {}).get("streams", {}).get("chest")
            if st is None or float(st.get("vf", 0.0)) < 1.0 - 1.0e-9:
                failures.append(
                    "(c1) the superheated chest ran but is published at vf = "
                    "%s, not 1: the unit priced a vapour the report reads as "
                    "something else." % (None if st is None else st.get("vf")))
            rows = unit_rows(out)
            if not rows:
                failures.append(
                    "(c1) the superheated-chest fixture published no "
                    "evaporator row in `energyClosures` to read.")
            for u, rem in rows or []:
                if abs(rem) > UNIT_TOL_KW:
                    failures.append(
                        "(c1) the superheated-chest evaporator '%s' leaves "
                        "%+.6f kW of its energy balance unattributed in the "
                        "engine's own report.  A chest read as vapour must be "
                        "PRICED as the vapour it is read as." % (u, rem))

        # ---- (c2) STALE-PIN: where the package cannot, it still refuses ---
        case = build_fixture(tmp, T_SUPERHEAT, "", "superheat")
        rc, out = run(case)
        if rc == 0:
            failures.append(
                "(c2) the superheated chest in the donor's water + sucrose "
                "package now RUNS.  Until 2026-10-05 it could not: the chest's "
                "zero sucrose (K = 0) made IsothermalFlash's dew test 0/0 = "
                "NaN, so the flash never classed it as superheated and the "
                "carried default stood.  If that guard has been taken, this is "
                "the GOOD news this arm is waiting for: turn (c2) into a "
                "second (c1) -- require it to run, publish vf = 1 and close -- "
                "and update Evaporator.cpp's comment and DEV.md 4d D1.")
        elif "could not resolve" not in out:
            failures.append(
                "(c2) the superheated chest refused, but the refusal does not "
                "say the package COULD NOT RESOLVE its equilibrium.  A reader "
                "whose chest is plainly superheated must be told the engine "
                "fell back to the carried default, not that it found a liquid "
                "-- or the message reads as a bug in the engine.  Output "
                "tail: " + out[-400:])

        # ---- (d) a DECLARED, two-phase chest refuses too ------------------
        case = build_fixture(tmp, T_SAT, "vaporFraction   0.5;\n", "half")
        rc, out = run(case)
        if rc == 0:
            failures.append(
                "(d) a chest pinned at `vaporFraction 0.5` ran to exit 0.  A "
                "half-condensed chest is not a saturated-vapour supply and "
                "cannot deliver F * dHvap; the rule is about the STATE, not "
                "about whether a keyword is present.")

        # ---- (e) SOURCE, COUNTED: three pinned outlets --------------------
        esrc = strip_comments(EVAP.read_text())
        pins = len(re.findall(r"\b(conc|vap|cond)\.phasePinned\s*=\s*true", esrc))
        if pins != 3:
            failures.append(
                f"(e) {pins} of the evaporator's 3 outlets are pinned.  Each "
                "is a declaration this model makes -- the liquor leaves at its "
                "boiling point, the solvent vapour is vapour, the condensate "
                "is the spent chest -- and an unpinned outlet is re-solved by "
                "every reader downstream.  On evaporator02 that re-solve "
                "returned V/F = 0.500000000 for a pure-component stream at its "
                "own saturation point (K == 1, so Rachford-Rice admits every "
                "V/F and the bisection returns its midpoint): 2796.44 kW "
                "invented on cond1 and 703.80 kW on L3.  COUNTED, not "
                "detected: two correct sites must not answer for a third.")

        # ---- (f) SOURCE: the condensate's own pressure --------------------
        if not re.search(r"cond\.P\s*=\s*\(?\s*P_chest", esrc):
            failures.append(
                "(f) the evaporator's condensate takes no pressure of its own. "
                "Written as 0.0 it is filled in by Flowsheet.cpp's "
                "`if (s.P <= 0.0) s.P = P_inherit`, and P_inherit is the FIRST "
                "input's pressure -- the PROCESS FEED, not the steam chest.  "
                "On evaporator06 that put a 128.48 C condensate at 1 bar, a "
                "state whose own Psat is 2.7 bar.  A pressure taken from the "
                "wrong inlet is the same arity defect as a phase taken from "
                "nowhere.")

        # ---- (g) ARITY: one home, two callers -----------------------------
        defs = len(re.findall(r"\bStreamThermalState\s+resolveStreamThermalState\s*\(",
                              strip_comments(SHARED.read_text())))
        tree_defs = 0
        for p in (ROOT / "src").rglob("*"):
            if p.suffix not in (".H", ".cpp"):
                continue
            tree_defs += len(re.findall(
                r"\bStreamThermalState\s+resolveStreamThermalState\s*\(",
                strip_comments(p.read_text(errors="ignore"))))
        if defs != 1 or tree_defs != 1:
            failures.append(
                f"(g) `resolveStreamThermalState` is defined {tree_defs} "
                "time(s) in src/ (expected 1, in "
                "unitOperations/flash/StreamEquilibrium.H).  It was written "
                "inside DistillationColumn.cpp on 2026-09-12 and a second unit "
                "needed the identical sentence the same week.  Two copies of a "
                "rule about second homes is the joke this project has already "
                "paid for.")
        for src_path, who in ((EVAP, "Evaporator.cpp"), (COLUMN, "DistillationColumn.cpp")):
            if "resolveStreamThermalState" not in strip_comments(src_path.read_text()):
                failures.append(
                    f"(g) {who} does not call "
                    "flashState::resolveStreamThermalState.  Comments are "
                    "stripped before this arm runs: prose is not a call.")

        # ---- (h) OUTPUT: the two corpus witnesses -------------------------
        rc, out = run(EVAP06)
        if rc != 0:
            failures.append(
                f"(h) {EVAP06.name} did not run (exit {rc}).  Its chest file "
                "must declare `phase gas;` -- the engine refuses it otherwise, "
                "which is arm (a) firing on a shipped case.")
        else:
            res = result_json(out)
            st = (res or {}).get("streams", {}).get("saturatedSteam130C")
            if st is None:
                failures.append(
                    "(h) evaporator06 published no `saturatedSteam130C` stream "
                    "to read.")
            elif float(st.get("vf", 0.0)) < 1.0 - 1.0e-9:
                failures.append(
                    "(h) evaporator06's chest steam is published at vf = "
                    f"{st.get('vf')}, not 1.  Its H is then the liquid's, the "
                    "chest leg of the plant boundary contributes exactly 0.00 "
                    "kW, and the first law loses the whole 487.49 kW duty.")

        # ---- (i) every evaporator row closes against the report ----------
        for wcase, expect in ((EVAP06, 1), (EVAP02, 3)):
            if wcase == EVAP06:
                rc6, out6 = rc, out          # the run arm (h) just made
            else:
                rc6, out6 = run(wcase)
            if rc6 != 0:
                failures.append("(i) %s did not run (exit %d)" % (wcase.name, rc6))
                continue
            rows = unit_rows(out6)
            if rows is None or len(rows) != expect:
                failures.append(
                    "(i) %s published %s evaporator row(s) in "
                    "`energyClosures`, expected %d.  An arm that reads nothing "
                    "does not pass." % (wcase.name,
                                        "no" if rows is None else len(rows),
                                        expect))
                continue
            for u, rem in rows:
                if abs(rem) > UNIT_TOL_KW:
                    failures.append(
                        "(i) %s: evaporator '%s' leaves %+.6f kW of its energy "
                        "balance unattributed in the engine's own report.  "
                        "Its heat crosses as its OWN streams (chest in, "
                        "condensate out), so nothing may remain: the duty's "
                        "latent heat must be h(chest) - h(condensate) on the "
                        "package's surface, not the Watson correlation, and "
                        "the process side priced on the same surface "
                        "(flashState::priceState).  Vitor's ruling, DEV.md 4c "
                        "C35 item 3." % (wcase.name, u, rem))

        rc, out = run(PHASECHANGE)
        if rc != 0:
            failures.append(f"(h) {PHASECHANGE.name} did not run (exit {rc})")
        else:
            gb = PHASECHANGE / "reports" / "balances" / "globalEnergyBoundary.csv"
            row = [l for l in gb.read_text().splitlines()
                   if l.startswith("residual,")] if gb.exists() else []
            if not row:
                failures.append("(h) phasechange01 printed no "
                                "globalEnergyBoundary `residual` row to read")
            else:
                res = float(row[0].split(",")[1])
                if abs(res) > 1.0e-6:
                    failures.append(
                        f"(h) phasechange01_partial_condenser closes its "
                        f"plant-boundary first law at {res:.6f} kW.  It was "
                        "-898.639930 kW until 2026-09-12 and 0.000000 kW "
                        "after.  This is the case in this family whose missing "
                        "word corrupted the ANSWER and not only the report: "
                        "phaseChanger READS its inlet's vf, and with the "
                        "stream read as liquid the condenser published "
                        "Q_latent_kW = +370.98 -- a positive latent term on a "
                        "unit whose whole subject is condensation.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        print("check_evaporator_chest_phase: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_evaporator_chest_phase: OK -- an evaporator resolves its "
          "heating stream's thermal state and REFUSES a chest that is not "
          "vapour, naming the stream, the state file, the `phase gas;` edit "
          "and the alternative that this is the wrong unit; the same fixture "
          "with the word present RUNS; a chest 37.8 K superheated RUNS, is "
          "published at vf = 1 and closes where the package resolves it "
          "(water-only), and still REFUSES naming the unresolved flash where "
          "it cannot (water + sucrose, the stale-pin arm); a chest pinned "
          "half-vapour refuses; all three outlets are pinned "
          "declarations and the condensate carries the CHEST's pressure; "
          "`resolveStreamThermalState` is defined once in src/ and called by "
          "both the column and the evaporator; and, read from the engine's own "
          "reports, evaporator06_nacl_pitzer publishes its chest steam at "
          "vf = 1 while phasechange01_partial_condenser closes its "
          "plant-boundary first law at or below 1e-6 kW, and every "
          "evaporator row of evaporator06 (1) and evaporator02 (3) leaves at "
          "most 1e-4 kW unattributed -- the duty's latent heat is the "
          "enthalpy difference the report prices.  SCANNED: five "
          "fixture cases written by this gate, three shipped cases, and "
          "src/unitOperations/{heatTransfer/Evaporator.cpp, "
          "distillation/DistillationColumn.cpp, flash/StreamEquilibrium.H}.  "
          "NOT CHECKED: whether a DECLARED phase is true of its stream (a "
          "declaration is never re-solved, R-E2); that every chest in the "
          "corpus declares one (the engine refuses at run time, so a scan "
          "here would be a second home); a no-datum evaporator, which keeps "
          "the Watson balance, announced, with the report UNAVAILABLE; where "
          "a superheated chest's condensate should leave (it leaves at "
          "T_steam); and any unit other than the "
          "evaporator, except through phasechange01's published first law.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
