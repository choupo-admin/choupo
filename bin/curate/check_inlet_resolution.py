#!/usr/bin/env python3
"""Gate: an UNPINNED TP inlet is its own equilibrium; a PIN is priced and said.

    bin/curate/check_inlet_resolution.py

WHY THIS EXISTS.  The ratified semantics of
docs/design/tp-stream-energy-coherence.md (R-E1/R-E2, 2026-08-09) are two
claims a reader cannot check by inspection, so they are pinned here:

  R-E1  REFLASH IDEMPOTENCY.  A flash operating at its feed's OWN (T, P) is
        the identity operation and must cost NOTHING.  Before the slice,
        flash19 charged +13.34 kW to "vaporise" a liquid nobody declared --
        the duty read the struct's `vf = 0.0` default as an undeclared
        `phase liquid;`, which is precisely the decorative pin the
        stream-state constitution bans from files.
  R-E2  A PIN IS A CONSTRAINT WITH A PRICE.  `phase liquid;` on a feed says
        the boundary delivers a constrained (possibly metastable) single
        phase.  That may legitimately cost energy at unchanged (T, P) -- and
        it must be ANNOUNCED, never silently folded into a number.

  R-E5  ONE CONVENTION.  The unit duty and the balance report must obtain H
        the same way, so flash19's unit Q and its report dH agree and the
        closure sits at 100 %.

WHAT THIS CHECKS, all from fresh runs of corpus cases:
  (a) flash19 (reactive + organic + precipitate, feed at the drum's own
      T and P): |Q_kW| < 0.5 -- the identity costs nothing;
  (b) flash19's energy_closure_pct within 100 +- 0.5 -- unit and report
      agree (R-E5), which is the arithmetic half of (a);
  (c) flash09_nh3_water_reactive and flash20_ethanol_water_pcsaft: also
      |Q_kW| < 0.5, so the claim is not a single case's accident;
  (d) THE PIN IS HONOURED AND ANNOUNCED: a COPY of flash19 whose authored
      0/feed gains `phase liquid;` runs, prices the declared phase (its Q
      leaves the near-zero band), and says so in the log;
  (f) THE PHASE PASS IS NOT GATED ON THE CONSUMER, and it does not accuse a
      SUPERCRITICAL vapour.  Two halves, and the second replaced the first
      arm's witness the same day it was written.

      (f1) SOURCE: the pass must not be enclosed in a condition on
           `r.declares`.  It was, and ammonia02 disarms that condition twice
           over -- its converter is ADIABATIC (declares no energy item) and
           its feed-effluent exchanger's closure reads a perfect 100 %
           because its own declared duty was computed FROM the enthalpy in
           question.  22 376 kW went unreported at exit 0.  A source arm is
           weaker than an output arm and is used here because the corpus
           witness this arm HAD turned out to be the defect below.

      (f2) OUTPUT: ammonia02 must NOT accuse `hotEffluent`.  That stream was
           this arm's original witness -- and Vitor read the accusation and
           rejected it: at 839.6 K the highest pure critical temperature
           present is ammonia's 405.5 K, so the mixture is 434 K above any
           dew point and the label VAPOUR is the only one it can hold.  The
           `g(V=1) = -0.46` behind the accusation is built from a Psat
           extrapolated far above Tc, where the saturation curve does not
           exist.  The check was accusing the innocent, which is the thing a
           check must never do, and the run's own [psat] line said so three
           screens earlier.  So this arm now pins the SILENCE, plus the
           run still closing its first law.
  (g) IT DOES NOT ACCUSE A CONVERGED FLASH OUTLET.  `unreactedGas` and
      `recycle` leave ammonia02's separator ON their dew point, g = -2.07e-06,
      and the pass named both the moment it was allowed to run everywhere.
      This arm requires them ABSENT: a check that accuses the innocent
      teaches the reader to ignore it (2026-09-04).
  (h) THE UNIT DISCARDS THE SAME ROOT THE REPORT DISCARDS (2026-09-26).
      `IsothermalFlash`'s duty re-resolves its feed through `solveCore`
      directly (R-E1, with the unit's own phase set) and, until this arm,
      ACCEPTED a two-phase root at a temperature above every present
      component's Tc -- blending a liquid that cannot exist into H_in --
      while the balance report, resolving the SAME feed through
      `flashState::equilibriumAt`, discarded it and said so.  Two readers of
      one state, two answers: ammoniaStaged04_kinetic's separator, fed at
      844.86 K and 200 bar (N2/H2/NH3/Ar, highest Tc present 405.4 K), closed
      at 90.32 % and carried the WHOLE plant residual, -22 274.7 kW (5.918 %).
      Four parts, read from a fresh run of that case:
        (h1) ARITY, source: `flashState::supercriticalSplitDiscarded` is
             DEFINED once, and BOTH `equilibriumAt` and the flash duty CALL
             it (comments stripped -- prose is not a call).
        (h2) SITE: the `[duty]` line says the feed's root was DISCARDED and
             names the Tc it was measured against.
        (h3) ANNOUNCED: the finding reaches the result JSON under the
             `feed '<stream>' of an isothermalFlash` locus EXACTLY ONCE --
             the unit is re-solved on every recycle pass, and the first build
             put 18 copies of it in the caveat block (each with its trial T),
             which is the wall of text the block exists to prevent.
        (h4) OUTPUT: the separator's energy closure, read from the engine's
             own report, is 100 +- 0.5 %, and the report's own discard line
             for `reacted` is STILL there -- the two readers agree by saying
             the same thing, not by one of them falling silent.
  (e) flash13_acetic_ethanol_vacuum_flash keeps a LARGE duty -- the
      negative control.  Its feed is at 1 atm and it operates at 0.65 atm,
      so its 669 kW is genuine pressure-drop work; a gate that drove every
      flash duty to zero would be measuring its own wish.  This arm exists
      because the first blast-radius sweep DID predict flash13 would move
      (it compared temperature and forgot pressure).

SABOTAGE-VERIFIED 2026-09-08 for (f)/(g), by hand, on the engine source.
Three sabotages, and TWO of them survived their arm's first version -- both
because a presence test was satisfied by something other than its subject:

  S1  restore the `if (r.declares)` gate around the phase pass.  Arm (f)
      fails, naming the adiabatic converter.  SURVIVED FIRST: the arm asked
      only whether the string "hotEffluent" appeared in the log, and it
      appears in every stream table; tightened to the `[phase] stream '...'`
      line.
  S2  drop the incipient band back to the old absolute 1e-6.  Arm (g) fails
      on BOTH saturated separator outlets.
  S3  delete the `AdvisoryLog` call, keep the stderr line.  Arm (f)'s JSON
      half fails.  SURVIVED TWICE, for two different reasons, and the second
      is the one worth carrying forward:
        - the report ALREADY announces under the locus `stream '<name>'`
          from `flashState::equilibriumAt`, so keying on the locus alone
          matched an advisory that predates this pass entirely.  The arm now
          requires the locus AND this finding's own words on ONE line.
        - the second attempt "survived" because the sabotage NEVER LANDED:
          it was applied by string replacement against source that had been
          re-indented since the pattern was written, and `str.replace` with
          no match is a silent no-op.  A SABOTAGE THAT DOES NOT LAND PROVES
          THE GATE IS FINE, which is the opposite of what it was run to
          find out.  Assert the edit applied before believing its verdict.

SABOTAGE-VERIFIED 2026-08-09: reverting the R-E1 gate (unpinned feeds no
longer re-flashed -- the pre-slice behaviour) reproduced the original
defect and this gate named every instance: flash19 Q = 13.4913 kW with its
closure collapsing to 0.00 %, flash09 196.1403 kW, flash20 587.4659 and
733.0349 kW.  Restoring returns all four to zero.

WHAT THIS DOES NOT CHECK, said plainly:
  * Whether a non-zero duty is RIGHT.  The identity case is checkable
    because its answer is zero; a real duty's correctness is its own
    case's golden and, where one exists, its published anchor.
  * The multi-condition cases (cavett01, ammonia02, ...).  Their feeds are
    multiphase at their own states, so the correct duty is not zero and
    there is no closed form to assert -- they ride their goldens.  Arms (f)
    and (g) read ammonia02 for its PHASE LABELS only, never for a duty.
  * Whether the incipient band of 1e-3 is the right number.  It is a stated
    choice, not a derived tolerance, and a stream genuinely between 1e-6 and
    1e-3 off saturation is reported by nothing.
  * Any package with NO vapour phase: the test is vapour-liquid and skips
    those by `hasEos()`.  That skip exists because asking anyway segfaulted
    (`ThermoPackage::Kvec` dereferenced a null EoS handle); the refusal that
    replaced the crash is not fired by this gate.
"""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
IDENTITY = [
    "tutorials/steady/flash/flash19_organic_and_precipitate",
    "tutorials/steady/flash/flash09_nh3_water_reactive",
    "tutorials/steady/flash/flash20_ethanol_water_pcsaft",
]
CONTROL = "tutorials/steady/flash/flash13_acetic_ethanol_vacuum_flash"
BAND_KW = 0.5
#  (h) the supercritical-feed witness: the first corpus case to put a stream
#  above every component's Tc through an isothermalFlash on the duty path.
SUPERCRITICAL = "tutorials/plant/ammoniaStaged04_kinetic"
SUPERCRITICAL_UNIT = "separator"
SUPERCRITICAL_FEED = "reacted"
ONE_HOME = ROOT / "src/unitOperations/flash/StreamEquilibrium.H"
FLASH_SRC = ROOT / "src/unitOperations/flash/IsothermalFlash.cpp"


def run(case: pathlib.Path):
    for junk in case.glob("log.*"):
        junk.unlink()
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(case)],
                       capture_output=True, text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    log = case / "log.choupoSolve"
    return r.returncode, (log.read_text() if log.is_file() else "") + r.stdout + r.stderr


def duties(log: str):
    return [float(m) for m in re.findall(r'"Q_kW":\s*([-0-9.eE+]+)', log)]


def closure(case: pathlib.Path):
    f = case / "reports" / "balances" / "energyBalance_byUnit.csv"
    if not f.is_file():
        return None
    for line in f.read_text().splitlines()[1:]:
        p = line.split(",")
        if len(p) >= 6:
            try:
                return float(p[5])
            except ValueError:
                return None
    return None


def closure_of(case: pathlib.Path, unit: str):
    f = case / "reports" / "balances" / "energyBalance_byUnit.csv"
    if not f.is_file():
        return None
    for line in f.read_text().splitlines()[1:]:
        p = line.split(",")
        if len(p) >= 6 and p[0] == unit:
            try:
                return float(p[5])
            except ValueError:
                return None
    return None


def strip_comments(text: str) -> str:
    """Drop // and /* */ comments so a symbol named in prose is not a call
    (check_sector_hierarchy arm (g) paid for that)."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def main() -> int:
    fail = []
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)

        # (a) + (c) the identity claim, on three cases
        for rel in IDENTITY:
            case = tmp / pathlib.Path(rel).name
            shutil.copytree(ROOT / rel, case)
            rc, log = run(case)
            if rc != 0:
                fail.append(f"{rel}: run failed (rc={rc})")
                continue
            qs = duties(log)
            if not qs:
                fail.append(f"{rel}: published no Q_kW -- the identity claim "
                            "cannot be read")
            for q in qs:
                if abs(q) > BAND_KW:
                    fail.append(f"{rel}: Q = {q:.4f} kW at the feed's own "
                                "(T, P) -- a flash that changes nothing must "
                                "cost nothing (R-E1)")
            # (b) unit and report agree, on the flagship
            if rel.endswith("flash19_organic_and_precipitate"):
                c = closure(case)
                if c is None:
                    fail.append("flash19: no energy closure row")
                elif abs(c - 100.0) > 0.5:
                    fail.append(f"flash19: energy closure {c:.2f} % -- the "
                                "unit duty and the balance report are not "
                                "obtaining H the same way (R-E5)")

        # (d) the pin is honoured AND announced
        pinned = tmp / "flash19_pinned"
        shutil.copytree(ROOT / "tutorials/steady/flash/flash19_organic_and_precipitate",
                        pinned)
        feed = pinned / "0" / "feed"
        feed.write_text(feed.read_text().rstrip() + "\nphase           liquid;\n")
        man = pinned / "constant" / "propertyManifest"
        if man.exists():
            man.write_text(re.sub(r"sealed\s+true;", "sealed false;",
                                  man.read_text()))
        rc, log = run(pinned)
        if rc != 0:
            fail.append(f"the pinned copy did not run (rc={rc}) -- `phase "
                        "liquid;` is legal grammar and must be honoured")
        else:
            qs = duties(log)
            if qs and all(abs(q) <= BAND_KW for q in qs):
                fail.append("a feed pinned `phase liquid;` priced the SAME as "
                            "an unpinned one -- the declaration was ignored "
                            "(R-E2: absence of a pin is never a pin, and a pin "
                            "is never absence)")
            if "PINNED" not in log:
                fail.append("the pinned feed's duty was not ANNOUNCED -- a "
                            "declared constraint that costs energy may not be "
                            "silent (R-E2)")

        # (f1) SOURCE: the pass is not gated on the consumer.
        src = (ROOT / "src/reporting/EnergyBalanceReport.cpp").read_text()
        m = re.search(r"\n(\s*)\{\n\s*std::string found;", src)
        if not m:
            fail.append("(f1) the phase pass's opening block moved -- "
                        "resynthesize this arm against the new shape")
        else:
            before = src[max(0, m.start() - 400):m.start()]
            if re.search(r"if\s*\([^)]*\br\.declares\b", before):
                fail.append(
                    "(f1) the phase pass is enclosed in a condition on "
                    "`r.declares` again.  A unit that declares no energy item "
                    "-- an ADIABATIC reactor -- can then never be reached, and "
                    "that is precisely how 22 376 kW went unreported on "
                    "ammonia02 at exit 0.")

        # (f2) + (g) the phase pass, on the case that proved it disarmed.
        am = tmp / "ammonia02"
        shutil.copytree(
            ROOT / "tutorials/plant/ammonia02_full_plant", am)
        rc, log = run(am)
        if rc != 0:
            fail.append("ammonia02 did not run -- arms (f)/(g) cannot judge")
        else:
            #  (f) the ADIABATIC unit's outlet is named, and it is ANNOUNCED
            #  (the result JSON), not merely printed.
            #  (f2) THE SILENCE IS THE CLAIM NOW.  `hotEffluent` at 839.6 K
            #  is 434 K above the highest pure Tc present, so no statement
            #  about its dew point is available and the pass must say
            #  nothing about it.
            if re.search(r"\[phase\] stream 'hotEffluent'", log):
                fail.append(
                    "(f2) ammonia02's `hotEffluent` was ACCUSED of an "
                    "impossible phase at 839.6 K, where the highest pure "
                    "critical temperature among the components present is "
                    "ammonia's 405.5 K.  There is no dew point 434 K above "
                    "every Tc, so there is no statement to make: the g(V=1) "
                    "behind the accusation comes from a Psat extrapolated "
                    "above Tc, where the saturation curve does not exist.  A "
                    "check that accuses the innocent teaches the reader to "
                    "ignore it.")
            elif False:
                #  BOTH, on ONE line.  The locus alone is not evidence: the
                #  balance report ALREADY announces under `stream '<name>'`
                #  when it re-resolves a state (`flashState::equilibriumAt`
                #  is handed exactly that locus in BalanceMath.H), so an
                #  arm keyed on the locus is satisfied by an advisory that
                #  predates this pass entirely.  Measured, not supposed:
                #  sabotage S3 -- delete the AdvisoryLog call, keep the
                #  stderr line -- SURVIVED this arm's first version for
                #  precisely that reason.
                fail.append(
                    "(f) `hotEffluent` was PRINTED but its impossible-phase "
                    "finding did not reach the result JSON -- it no longer "
                    "rides AdvisoryLog, so it reaches neither the end-of-run "
                    "caveat block, the JSON, nor the GUI; a line on stderr "
                    "at log line 108 of 1200 is the slightly-louder form of "
                    "silence this project has a caveat block to end")
            #  (g) the separator's own saturated outlets are NOT accused.
            for innocent in ("unreactedGas", "recycle"):
                if re.search(r"\[phase\] stream '" + innocent + r"'", log):
                    fail.append(
                        f"(g) `{innocent}` was accused of an impossible "
                        "phase.  It LEAVES an equilibrium flash, so it sits "
                        "on its dew point by construction (g = -2.07e-06) -- "
                        "the incipient band has collapsed back onto solver "
                        "round-off and the pass is now crying wolf at every "
                        "converged flash outlet in the corpus.")

        # (h1) ARITY, source: one definition, two callers, comments stripped.
        home = strip_comments(ONE_HOME.read_text())
        flash = strip_comments(FLASH_SRC.read_text())
        n_def = len(re.findall(r"\bsupercriticalSplitDiscarded\s*\(", home))
        #  the definition plus the call inside equilibriumAt
        if n_def != 2:
            fail.append(
                f"(h1) `supercriticalSplitDiscarded` appears {n_def} time(s) "
                "in StreamEquilibrium.H outside comments; expected exactly 2 "
                "-- its ONE definition and the call from `equilibriumAt`.  "
                "The discard has a second home, or the report's reader lost "
                "it.")
        if not re.search(r"flashState::supercriticalSplitDiscarded\s*\(", flash):
            fail.append(
                "(h1) IsothermalFlash.cpp does not CALL "
                "`flashState::supercriticalSplitDiscarded` -- the duty is "
                "back to accepting a two-phase root above every Tc that the "
                "balance report discards (ammoniaStaged04: -22 274.7 kW on "
                "one separator).")
        if re.search(r"aboveEveryCriticalT\s*\(", flash):
            fail.append(
                "(h1) IsothermalFlash.cpp calls `aboveEveryCriticalT` "
                "directly -- a second copy of the two-phase test around the "
                "one-home criterion.  Call `supercriticalSplitDiscarded`, "
                "which holds the test AND the sentence.")

        # (h2)-(h4) the supercritical witness, run fresh
        sc = tmp / "ammoniaStaged04"
        shutil.copytree(ROOT / SUPERCRITICAL, sc)
        rc, log = run(sc)
        if rc != 0:
            fail.append("(h) ammoniaStaged04_kinetic did not run -- the "
                        "supercritical-feed arm cannot judge")
        else:
            #  (h2) the site line
            if not re.search(r"\[duty\] the feed at T = [0-9.]+ K resolved "
                             r"TWO-PHASE .*DISCARDED", log):
                fail.append(
                    "(h2) the separator's duty printed no `[duty] ... "
                    "DISCARDED` line for its 844.86 K feed: the two-phase "
                    "root above every Tc was either accepted or discarded in "
                    "silence.  Silence at the site is the crutch.")
            #  (h3) announced, ONCE, under the stream-named locus
            locus = f'"locus": "feed \'{SUPERCRITICAL_FEED}\' of an isothermalFlash"'
            n_adv = len(re.findall(re.escape(locus) + r'.*?TWO-PHASE', log))
            if n_adv != 1:
                fail.append(
                    f"(h3) the discard reached the result JSON {n_adv} "
                    f"time(s) under {locus}; expected exactly 1.  Zero means "
                    "it no longer rides AdvisoryLog (the site line is the "
                    "slightly-louder form of silence); more than one means the "
                    "trial T is back in the message and every recycle pass "
                    "files a new caveat -- 18 on the first build.")
            #  (h4) the unit and the report agree, each saying so
            c = closure_of(sc, SUPERCRITICAL_UNIT)
            if c is None:
                fail.append("(h4) no energy closure row for the separator")
            elif abs(c - 100.0) > 0.5:
                fail.append(
                    f"(h4) ammoniaStaged04's separator closes at {c:.2f} % -- "
                    "its duty and the balance report are pricing the 844.86 K "
                    "feed on different phase sets (R-E5).  Before 2026-09-26 "
                    "this read 90.32 %, and it was the whole plant residual.")
            if not re.search(r"stream '" + SUPERCRITICAL_FEED
                             + r"': resolved TWO-PHASE at T = [0-9.]+ K.*DISCARDED",
                             log):
                fail.append(
                    "(h4) the balance report no longer says it discarded "
                    f"`{SUPERCRITICAL_FEED}`'s supercritical root -- the two "
                    "readers must agree by both saying so, not by one going "
                    "silent.")

        # (e) the negative control: a real pressure-drop duty survives
        ctrl = tmp / "flash13"
        shutil.copytree(ROOT / CONTROL, ctrl)
        rc, log = run(ctrl)
        qs = duties(log)
        if rc != 0 or not qs:
            fail.append("flash13 (the negative control) did not run")
        elif max(abs(q) for q in qs) < 100.0:
            fail.append(f"flash13's duty collapsed to {qs} kW -- its feed is "
                        "at 1 atm and it operates at 0.65 atm, so a LARGE "
                        "duty is the right answer; a gate that drove every "
                        "flash to zero would be measuring its own wish")

    if fail:
        print("check_inlet_resolution: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_inlet_resolution: OK -- a flash at its feed's own (T, P) "
          f"costs nothing on {len(IDENTITY)} case(s) (|Q| < {BAND_KW} kW, "
          "R-E1), flash19's unit duty and balance report agree at 100 +- 0.5 % "
          "(R-E5), a feed pinned `phase liquid;` is priced as declared AND "
          "announced (R-E2), and the vacuum-flash control keeps its genuine "
          "pressure-drop duty.  THE PHASE PASS IS NOT GATED ON THE CONSUMER "
          "(source) and DOES NOT ACCUSE a supercritical vapour: ammonia02's "
          "converter outlet at 839.6 K -- 434 K above the highest pure Tc "
          "present -- draws no accusation, and neither do the two saturated "
          "separator outlets.  THE FLASH DUTY DISCARDS THE "
          "SAME SUPERCRITICAL ROOT THE REPORT DISCARDS, through ONE home "
          "(`flashState::supercriticalSplitDiscarded`, source-checked): "
          "ammoniaStaged04's separator, fed at 844.86 K, announces the "
          "discard at its site and ONCE on AdvisoryLog and closes at 100 +- "
          "0.5 % beside the report's own discard line.  NOT "
          "CHECKED: whether a NON-zero duty is right (only the identity has a "
          "closed form); the multi-condition cases' duties, which ride their "
          "goldens; whether the 1e-3 incipient band is the right number (it "
          "is a stated choice); and any vapourless package, which the test "
          "skips by hasEos().")
    return 0


if __name__ == "__main__":
    sys.exit(main())
