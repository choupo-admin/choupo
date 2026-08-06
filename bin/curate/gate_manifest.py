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
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "generated" / "gateManifest.json"
TIMEOUT = 600


def gates():
    return sorted(p for p in HERE.glob("check_*.py"))


def claim_of(path):
    """Run the gate; return (exit, first line of its output)."""
    try:
        r = subprocess.run([sys.executable, str(path)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        return None, "TIMED OUT after %d s -- no claim captured" % TIMEOUT
    line = (r.stdout or r.stderr).strip().splitlines()
    return r.returncode, line[0].strip() if line else ""


def main() -> int:
    names = [p.stem for p in gates()]

    if "--check" in sys.argv:
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
    silent = []
    for p in gates():
        rc, claim = claim_of(p)
        out["gates"][p.stem] = {"exit": rc, "claim": claim}
        print(f"  {p.stem:<38} exit={rc}  {claim[:70]}")
        if rc == 0 and len(claim) < 20:
            silent.append(p.stem)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, sort_keys=False) + "\n")
    print(f"\nwrote {OUT.relative_to(ROOT)} ({len(out['gates'])} gates)")
    if silent:
        print("\nGATES THAT PASS WITHOUT STATING A CLAIM (nothing to record "
              "about what they checked):\n  " + "\n  ".join(silent)
              + "\n  A gate whose success says nothing cannot be audited "
                "without reading its source, which is the situation this "
                "manifest exists to end.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
