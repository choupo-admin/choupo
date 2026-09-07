#!/usr/bin/env python3
"""Gate: the end-of-run caveat block is real, named, silent when it should be,
and agrees with the JSON.

    bin/curate/check_caveat_surface.py

WHY THIS EXISTS.  Choupo announces an extrapolated Cp, an unverified record, an
estimate standing in for a measurement -- each at its site, in the middle of a
long log.  A warning a thousand lines above the answer has been DELIVERED and
not RECEIVED, so `core/AdvisorySummary.H` replays them once at the end, grouped.

The surface shipped without a gate, which by this project's own three-part
criterion means it was not consolidated: contract written, engine behaviour
present, *no case firing it*.  This is that third part.

WHAT IS CHECKED, and the shape is deliberate.  It is modelled on
`check_review_status`, which caught a real regression hours earlier precisely
because it does NOT merely assert that an announcement exists:

  (a) A RUN THAT REALLY EXTRAPOLATES lists it under EXTRAPOLATIONS AND
      VALIDITY *and names the component*.  An anonymous caveat -- "polynomial
      Cp declares ..." in a twenty-component flowsheet -- is one the reader
      cannot act on, and the engine printed exactly that until the owner was
      stamped.

  (b) A CLEAN RUN SAYS "none raised", explicitly.  This is the arm that
      matters most.  A block that appears only when there is something to say
      cannot be distinguished from a block that failed to run, and "announced"
      then becomes a louder form of silence.  The same reasoning as *a check
      that cannot run must not pass*.

  (c) THE BLOCK AND THE JSON AGREE.  Every advisory printed in the block must
      appear in the result JSON that the GUI reads.  Two surfaces disagreeing
      about what the run announced would be a second home for one fact -- and
      the JSON is what a student never sees, so it is the one that rots.

  (e) A CASE WITH AN OUTER DRIVER PRINTS IT TOO, and says WHICH PASS.  This
      arm exists because arm (d) is a SOURCE check and could not see that the
      one `printAdvisorySummary` call in choupoSolve sat inside the `else` of
      `if (outerDict)`: the string was present, the gate was green, and 23
      corpus cases printed no block at all.  `gibbs04_wgs_temperature_sweep`
      carried four advisories saying the vapour pressures it returned were not
      vapour pressures, and printed none of them.  So this arm RUNS two cases
      -- a sweep (no representative pass) and a designSpec (one) -- and
      requires the block, the scope line, and the right word for which pass
      each is describing.  It does not check WHICH advisories a swept run
      should report: that is a stated design decision (the last pass, never a
      union), not something a gate can derive.

  (d) ALL FOUR BINARIES emit it.  A caveat surface present in one application
      and absent from three teaches the reader that its absence means "nothing
      to report".  `choupoProps` was in fact MISSED when the block was first
      wired, and the commit that wired the other three claimed all four -- this
      arm exists because that claim was false when it was made.

SABOTAGES PERFORMED BY HAND on 2026-09-07 against arm (e), each restored and
the engine rebuilt.  The lines are what the gate printed:

  S3  the whole outer-driver block deleted from choupoSolve's main (the state
      the engine was in until that day) -> "gibbs04_wgs_temperature_sweep
      ships an outerDict and printed NO caveat-scope line. ..." and the same
      for compressor02_designspec_pout.
  S4  the block kept, but the phrase naming WHICH pass replaced by "what the
      run announced" -> "gibbs04_wgs_temperature_sweep printed the caveat
      block but does not say it describes 'the LAST pass only'. ..." and
      "compressor02_designspec_pout ... 'the REPRESENTATIVE pass'."

S4 is the arm that matters more than S3: a block that runs and does not say
which of many passes it describes invites the reader to take it for all of
them, which is a new way of being wrong rather than the old silence.

WHAT IS NOT CHECKED: whether an advisory is JUSTIFIED -- whether a Cp really
should have been extrapolated, whether a record really is unreviewed.  Those
are curation judgements, and each has its own gate (`check_cp_range_announced`,
`check_review_status`).  This gate checks the SURFACE, not the physics.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"

#  A case that really evaluates a Cp outside its declared window, and one that
#  does not.  Both are ordinary corpus cases -- no fixture, no sabotage.
LOUD = "tutorials/steady/drying/solidDryer01_sugar"
#  A case that genuinely raises NOTHING.  It was `flash01_benzene_toluene`
#  until 2026-08-06, and losing that role is worth recording, because it is
#  this gate's own thesis turned one level up.
#
#  flash01 runs at 370 K.  Benzene's Antoine window ends at 354.07 K.  Every
#  K-value in the flagship first flash a student meets had been computed
#  16 K past the correlation's declared validity -- and the case looked CLEAN,
#  because nothing in the tree had ever compared a temperature against a
#  `Trange`.  Its empty caveat block was indistinguishable from a caveat block
#  whose checks were not wired, and it was the second.
#
#  So the replacement is not chosen for being quiet.  It is chosen for being
#  quiet FOR A CHECKED REASON: ethanol/water at 351 K, both components well
#  inside their declared windows, verified by running it.  If a future check
#  finds something here too, repoint again and write down what it found --
#  that is the gate working, not the gate breaking.
#
#  IT HAPPENED AGAIN, 2026-08-19, and the note above is the reason this is a
#  two-line edit rather than an argument.  `PolynomialCp::H`/`S` integrate the
#  polynomial from the 298.15 K datum to the state and had never once compared
#  that PATH against the declared window -- only `Cp(T)` did, and the integral
#  is the route every enthalpy actually travels.  flash02 flashes at 355 K and
#  ethanol's liquid-Cp fit is declared over (280 351): the case had been
#  integrating 4 K past the fit since it existed.  Its caveat block was empty
#  for the same reason flash01's was in 2026-08: THE CHECK WAS NOT WIRED.
#  Twice now, this gate's silent witness has been an unexamined case rather
#  than a clean one -- which is this gate's own thesis about caveat blocks,
#  landing on the gate itself.
#
#  heatExchanger01_water_water replaces it, and is chosen to EXERCISE the
#  machinery rather than dodge it: a water/water exchanger integrates a liquid
#  Cp on both sides, and water's window (273 373) contains the whole path from
#  the datum to either stream temperature.  Silent because the physics is in
#  range, not because nothing was computed.  Verified by running every case
#  the corpus offers: 12 of the 110 that raise no Cp advisory also print
#  "none raised", and this is one of them.
SILENT = "tutorials/steady/heat/heatExchanger01_water_water"

#  (e) Two outer-driver cases, one of each kind.  SWEPT has no representative
#  pass and raises real advisories (four vapour pressures above Tc); REPRESENT
#  replays at its design point, so the block describes that pass.
SWEPT     = "tutorials/steady/gibbs/gibbs04_wgs_temperature_sweep"
REPRESENT = "tutorials/steady/rotating/compressor02_designspec_pout"
SCOPE     = "[caveats] this run made"

HEADER = "ASSUMPTIONS AND CAVEATS"
NONE_LINE = "ASSUMPTIONS AND CAVEATS: none raised."
BINARIES = ["choupoSolve", "choupoBatch", "choupoCtrl", "choupoProps"]


def run(case):
    p = subprocess.run([str(SOLVE), "."], cwd=str(ROOT / case),
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def block_items(out):
    """The '- locus: message' lines of the caveat block."""
    i = out.find(HEADER)
    if i < 0:
        return None
    tail = out[i:]
    return re.findall(r'^\s{4}- ([^:]+): (.+)$', tail, re.M)


def json_advisories(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1)).get("advisories", [])
    except json.JSONDecodeError:
        return None


def main() -> int:
    fail, checked = [], []
    if not SOLVE.exists():
        print("check_caveat_surface: FAILED\n  choupoSolve is not built -- the "
              "probe cannot run, and a check that cannot run must not pass")
        return 1

    # ---- (a) the loud case names its components ------------------------
    rc, out = run(LOUD)
    if rc != 0:
        fail.append(f"{Path(LOUD).name} does not run (exit {rc})")
    else:
        items = block_items(out)
        if items is None:
            fail.append(f"{Path(LOUD).name} extrapolates and printed NO caveat "
                        "block at all")
        else:
            extrap = [(l, m) for l, m in items if "OUTSIDE its declared" in m]
            if not extrap:
                fail.append(f"{Path(LOUD).name} evaluates a Cp outside its "
                            "window yet the block lists no extrapolation")
            elif any(not l.startswith("component '") for l, _ in extrap):
                anon = [l for l, _ in extrap if not l.startswith("component '")]
                fail.append("an extrapolation caveat does not NAME its "
                            f"component ({anon}).  A reader cannot act on "
                            "'polynomial Cp' in a multi-component flowsheet.")
            else:
                checked.append(f"{len(extrap)} named extrapolation(s) listed "
                               f"({Path(LOUD).name})")

            # ---- (c) the block and the JSON agree ----------------------
            advs = json_advisories(out)
            if advs is None:
                fail.append("the result JSON has no parseable advisories array "
                            "-- the machine-readable half of the surface is "
                            "missing")
            else:
                jmsgs = {(a.get("locus", ""), a.get("message", "")) for a in advs}
                orphan = [i for i in items if tuple(i) not in jmsgs]
                if orphan:
                    fail.append(
                        f"{len(orphan)} caveat(s) printed in the block are NOT "
                        "in the result JSON, e.g. " + repr(orphan[0]) + ".  The "
                        "block must replay the log, never author its own "
                        "entries -- two surfaces disagreeing about what a run "
                        "announced is a second home for one fact.")
                else:
                    checked.append(f"all {len(items)} block item(s) present in "
                                   "the result JSON")

    # ---- (b) the clean case says so, explicitly ------------------------
    rc, out = run(SILENT)
    if rc != 0:
        fail.append(f"{Path(SILENT).name} does not run (exit {rc})")
    elif NONE_LINE not in out:
        fail.append(f"{Path(SILENT).name} raises no advisory and does not say "
                    "so.  A block that appears only when it has something to "
                    "say is indistinguishable from one that failed to run.")
    else:
        checked.append("clean run states 'none raised' explicitly")

    # ---- (e) an outer-driver run prints the block, and names its pass ---
    for case, word in ((SWEPT, "the LAST pass only"),
                       (REPRESENT, "the REPRESENTATIVE pass")):
        rc, out = run(case)
        name = Path(case).name
        if rc != 0:
            fail.append(f"{name} does not run (exit {rc})")
            continue
        if SCOPE not in out:
            fail.append(
                f"{name} ships an outerDict and printed NO caveat-scope line."
                "  The block used to sit inside the `else` of"
                " `if (outerDict)`, so every case with an outer driver printed"
                " neither it nor the divergence banner -- which is exactly the"
                " state AdvisorySummary.H forbids: silence must mean the"
                " engine raised nothing, never that the block did not run.")
        elif word not in out:
            fail.append(
                f"{name} printed the caveat block but does not say it"
                f" describes {word!r}.  An outer driver runs the simulator"
                " many times; a block that does not name the pass it is about"
                " invites the reader to take it for all of them.")
        elif HEADER not in out and NONE_LINE not in out:
            fail.append(f"{name} printed the scope line but no block after it")
        else:
            checked.append(f"outer-driver run {name} prints the block and"
                           f" names its pass ({word})")

    # ---- (d) every binary emits it -------------------------------------
    #  MATCH THE CALL, not the header name.  A first version looked for
    #  "AdvisorySummary" anywhere in the file -- which the call
    #  `printAdvisorySummary(...)` contains as a substring, so deleting the
    #  include alone left this arm green on a binary that would not compile.
    #  A sabotage a gate survives is a gate that was not testing what it said.
    #
    #  THIS ARM IS A SOURCE CHECK, not an observed run, and the OK line says
    #  so.  Driving all four binaries needs a case per application and would
    #  make this the slowest gate in the suite; arms (a)-(c) observe the real
    #  output of the one that can be driven cheaply.  Stating the limit is the
    #  difference between partial coverage and overclaimed coverage.
    missing = [b for b in BINARIES
               if "printAdvisorySummary(" not in
               (ROOT / "src" / "applications" / b / "main.cpp").read_text()]
    if missing:
        fail.append("binaries with no caveat block: " + ", ".join(missing)
                    + ".  A surface present in some applications teaches the "
                      "reader that its absence means 'nothing to report'.")
    else:
        checked.append(f"all {len(BINARIES)} binaries CALL the summary (source check, not an observed run)")

    if fail:
        print("check_caveat_surface: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_caveat_surface: OK -- " + "; ".join(checked)
          + ".  The gate checks the SURFACE (named, silent when empty, "
            "agreeing with the JSON, present in every binary), never whether "
            "an advisory is JUSTIFIED -- that is curation, and "
            "check_cp_range_announced and check_review_status own those "
            "judgements.  DOMAIN: choupoSolve's own output on five corpus "
            "cases plus a source scan of the four binaries' main.cpp.  "
            "LIMITS: arm (d) is a source check and cannot see an enclosing "
            "`if` -- which is how the outerDict silence survived it -- and "
            "arm (e) requires the block to RUN under an outer driver and to "
            "name its pass, never that the pass it names is the right one to "
            "report (that is a stated decision, recorded in main.cpp and in "
            "docs/design/three-silences-at-exit-zero.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
