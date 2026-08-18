#!/usr/bin/env python3
"""Generate the gate manifest by RUNNING each gate and recording what it says.

    bin/curate/gate_manifest.py            regenerate generated/gateManifest.json
    bin/curate/gate_manifest.py --check    names only; fail if the list drifted

WHY THIS EXISTS.  An external review (2026-08-05) observed that the gates are
"beginning to form a shadow architecture" and asked for a machine-readable
declaration per gate, so a maintainer need not reverse-engineer policy from
ninety Python scripts.  The observation is right; there are NINETY `check_*`
scripts, not the fifteen the review estimated.

THE DESIGN DECISION IS WHERE THE DECLARATION COMES FROM, and it is the whole
point of this file.  The obvious route -- transcribe each gate's docstring into
a table -- rebuilds the exact defect this project spent two days removing: a
second home for a derived fact, written once and thereafter remembered rather
than recounted.  Ninety of them, transcribed at speed, is how a declaration
comes to disagree with the gate it describes.  Four hand-compiled counts were
found wrong that way in a single day.

So the manifest is DERIVED FROM WHAT EACH GATE SAYS AT RUNTIME.  Every gate in
this tree prints, on success, a one-line claim of what it checked -- and, by a
convention that held across the whole 2026-08-05 slice, what it deliberately
does NOT claim ("UNCHECKED, not clean", "this gate does not check whether ...").
That line is the gate's own account of itself, emitted by the code that does
the checking. It cannot drift from the gate, because it IS the gate.

WHAT THIS CAN AND CANNOT CAPTURE, stated plainly because the review asked for
seven fields and this delivers two:

  CAPTURED   claim  -- the OK line, verbatim
             scope / known blind spots -- where the gate states them in that
             line, which most now do

  NOT CAPTURED   positiveWitness, negativeWitness, acceptedDebt,
                 retirementCondition

The sabotages a gate was verified against are not visible in its output, and
inferring them would be guessing.  Recording two fields honestly is worth more
than seven fields half of which are invented -- and the waivers, which are the
part that DECAYS, already have their own single home in `debt_registry.py`.

SLOW ON PURPOSE, AND NOT IN THE SUITE.  Several gates build or run the engine.
Regenerating means running all ninety, which takes minutes; the suite already
runs them once and must not run them twice.  `--check` is the cheap arm that
the suite can afford: it compares the NAME LIST only, so a gate added without
regenerating fails and the manifest cannot silently go stale.

A FAILING GATE MAKES NO CLAIM, AND THIS USED TO RECORD ONE ANYWAY.
=================================================================

Until 2026-08-18 the loop below wrote `{"exit": 1, "claim": "check_x: FAILED"}`
and carried on, and the manifest was written regardless.  Two things follow
and both were observed in the committed file:

  * "check_x: FAILED" is not a claim.  A claim is what a gate says when it has
    something to say; a failure is the absence of one.  Recording it as the
    gate's own account of itself answers "what does this project check?"
    wrongly, WITH AUTHORITY -- the precise defect the header above says this
    file exists to prevent.
  * It went unnoticed because nothing compared the two runs.  The manifest
    committed at 10:58 on 2026-08-18 carried DOZENS of such entries, and the
    regeneration that replaced them flipped most back to OK without anyone
    having fixed a thing -- which is what proved the entries were never about
    the gates at all.

THE CAUSE, and it is why a timeout is treated more harshly than a failure.
`check_gate_selftest` deliberately SABOTAGES sources and REBUILDS the engine
to prove that other gates fail when they should.  It cleans up after itself --
if it is allowed to finish.  Killed by the timeout below, it leaves a
SABOTAGED BUILD on disk, and every engine-running gate after it in this
alphabetical walk then fails for a reason that has nothing to do with the gate
being recorded.  That is exactly what happened: seven gates
(check_inlet_resolution, check_solid_service, check_stage_identity,
check_stream_transport_closure, check_tray_chemistry, check_second_liquid,
check_utility_allocation_pinned) recorded FAILED against a poisoned binary,
and one `make all` restored every one of them with no source change.

So: this now REFUSES to write on any failure or timeout, naming the gates, and
says to rebuild when a timeout was involved.  A partial manifest mixing fresh
claims with stale ones would be untraceable -- a reader could not tell which
lines were observed today.  One bad gate blocking the whole regeneration is
the right trade for a file whose only purpose is to be TRUE.

AND THE TIMEOUT IS NOW A BACKSTOP, NOT A TUNING KNOB.  The old 600 s was
shorter than check_gate_selftest legitimately needs, so the harness was
killing a healthy gate and blaming the tree.  Each gate's elapsed time is
recorded in the manifest, so the ceiling can be judged against measurements
instead of remembered -- and a gate that grows slow becomes visible before it
starts timing out.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from destructive_session import assert_tree_undisturbed  # noqa: E402

ROOT = HERE.parents[1]
OUT = ROOT / "generated" / "gateManifest.json"

#  A BACKSTOP, not a tuning knob.  The old value was 600 s, which is shorter
#  than check_gate_selftest legitimately needs -- it sabotages sources and
#  rebuilds the engine several times over -- so the harness was killing a
#  healthy gate and, worse, killing it MID-SABOTAGE.  Every gate's elapsed
#  time is now recorded in the manifest, so this ceiling is judged against
#  measurements rather than remembered; raise it when a gate's recorded
#  `seconds` approaches it, and read the record before deciding that a gate
#  which grew slow is the problem.
TIMEOUT = 3600


def gates():
    return sorted(p for p in HERE.glob("check_*.py"))


def claim_of(path):
    """Run the gate; return (exit, first line of its output, elapsed seconds).

    `exit` is None when the gate was killed by the timeout -- which is not
    the same kind of event as a failure and is handled separately by the
    caller: a killed gate may have left the tree or the build sabotaged.
    """
    t0 = time.monotonic()
    try:
        r = subprocess.run([sys.executable, str(path)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        return None, "", round(time.monotonic() - t0, 1)
    line = (r.stdout or r.stderr).strip().splitlines()
    return (r.returncode, line[0].strip() if line else "",
            round(time.monotonic() - t0, 1))


def main() -> int:
    names = [p.stem for p in gates()]

    if "--check" in sys.argv:
        assert_tree_undisturbed("gate_manifest --check")
        if not OUT.exists():
            print("gate_manifest: FAILED\n  %s does not exist -- run "
                  "bin/curate/gate_manifest.py to generate it"
                  % OUT.relative_to(ROOT))
            return 1
        have = sorted(json.loads(OUT.read_text()).get("gates", {}))
        added = [n for n in names if n not in have]
        gone = [n for n in have if n not in names]
        if added or gone:
            print("gate_manifest: FAILED")
            for a in added:
                print(f"  {a} is a gate with no manifest entry -- regenerate "
                      "with bin/curate/gate_manifest.py.  A manifest that "
                      "silently omits a gate answers 'what does this project "
                      "check?' wrongly, with authority.")
            for g in gone:
                print(f"  {g} is in the manifest but no longer exists -- "
                      "regenerate")
            return 1
        print(f"gate_manifest: OK -- all {len(names)} gate(s) have a manifest "
              "entry.  NAMES ONLY: this arm does not re-run the gates, so it "
              "cannot tell whether a recorded claim is still the one the gate "
              "prints.  Regenerating is what refreshes a claim, and it is slow "
              "by nature (several gates build or run the engine).")
        return 0

    #  Full regeneration.
    out = {"note": "DERIVED by running each gate and capturing the one-line "
                   "claim it prints.  Never transcribed from a docstring -- a "
                   "transcription is a second home and drifts.  Regenerate "
                   "with bin/curate/gate_manifest.py.",
           "captures": ["claim (the gate's own OK line, verbatim)"],
           "doesNotCapture": ["positiveWitness", "negativeWitness",
                              "acceptedDebt", "retirementCondition",
                              "-- a gate's sabotages are not visible in its "
                              "output, and inferring them would be guessing"],
           "gates": {}}
    silent, failed, timed_out = [], [], []
    for p in gates():
        #  Between gates, not merely at the start: a gate that opens a
        #  destructive session and dies leaves the journal standing, and
        #  everything after it in this walk would otherwise be recorded
        #  against a tree nobody can vouch for.  Checking once at the top
        #  would have caught nothing on 2026-08-18 -- the tree was clean when
        #  the run began.
        assert_tree_undisturbed("gate_manifest")

        rc, claim, secs = claim_of(p)
        out["gates"][p.stem] = {"exit": rc, "claim": claim, "seconds": secs}
        print(f"  {p.stem:<38} exit={rc} {secs:>7.1f}s  {claim[:60]}")
        if rc is None:
            timed_out.append(p.stem)
        elif rc != 0:
            failed.append((p.stem, claim))
        elif len(claim) < 20:
            silent.append(p.stem)

    #  REFUSE TO WRITE.  A failing gate has made no claim -- a claim is what a
    #  gate says when it has something to say, and a failure is the absence of
    #  one.  Recording "check_x: FAILED" as check_x's own account of itself
    #  answers "what does this project check?" wrongly, WITH AUTHORITY, which
    #  is the exact defect this file's header says it exists to prevent.  A
    #  partial write mixing today's claims with yesterday's would be worse
    #  still: a reader could not tell which lines were observed.
    if failed or timed_out:
        print("\ngate_manifest: REFUSING TO WRITE -- the manifest would record "
              "failures as claims.")
        for name in timed_out:
            print(f"  {name}: TIMED OUT after {TIMEOUT} s and was KILLED "
                  "(SIGKILL, so its own cleanup did not run).")
        for name, claim in failed:
            print(f"  {name}: exit non-zero -- {claim[:90]}")
        if timed_out:
            print("\n  A KILLED GATE MAY HAVE LEFT THE BUILD SABOTAGED, and a "
                  "clean `git status`\n  does NOT rule that out -- the sources "
                  "can be back while the BINARY still\n  carries the damage.  "
                  "Run `make all` before believing any later failure,\n  and "
                  "check build/destructiveSession.json.")
        print("\n  Fix the tree, then re-run.  Nothing was written, so the "
              "manifest on disk is\n  still the last one that was fully "
              "observed -- stale, and honestly so.")
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, sort_keys=False) + "\n")
    print(f"\nwrote {OUT.relative_to(ROOT)} ({len(out['gates'])} gates, "
          f"every one observed passing)")
    if silent:
        print("\nGATES THAT PASS WITHOUT STATING A CLAIM (nothing to record "
              "about what they checked):\n  " + "\n  ".join(silent)
              + "\n  A gate whose success says nothing cannot be audited "
                "without reading its source, which is the situation this "
                "manifest exists to end.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
