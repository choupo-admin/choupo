#!/usr/bin/env python3
"""D-R1: a deliberately RESTRICTED speciation network is DECLARED, refused
when dishonest, announced, labelled, and readable by the importer.

Design record: docs/design/restricted-speciation-network.md (approved
2026-08-02 with two conditions: the reduced network passes the same
consistency machinery as the full one -- it is the same loader -- and every
result from a reduced model is clearly labelled).

Probed through the real binary on the converted witness
(pitzer_seawater_verify, networkScope restricted / water-dissociation):

  WITNESS      runs, ANNOUNCES the restriction + quotes the reason, and the
               golden-diag surface carries the label (networkRestricted).
  REFUSAL-1    restricted with no `network ( ... )` list.
  REFUSAL-2    restricted with no `reason`.
  REFUSAL-3    an admitted name matching no loaded chemistry record.
  REFUSAL-4    `networkScope full` alongside a `network ( ... )` list
               (two authorities on one set).
  REFUSAL-5    an admitted record unreachable from the feed (a restriction
               that restricts nothing is a false claim about the model).
  NEGATIVE     an ordinary full-scope speciation case carries NO restriction
               announcement and NO label (the lint must not cry wolf).

Exit 1 listing failures."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
PITZ = ROOT / "tutorials" / "props" / "electrolyte" / "pitzer_seawater_verify"
FULL = ROOT / "tutorials" / "props" / "electrolyte" / "rainwater_air"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def copy(tmp: Path, tag: str, base: Path = PITZ) -> Path:
    case = tmp / tag
    shutil.copytree(base, case,
                    ignore=shutil.ignore_patterns("expected", "*.csv", "log.*"))
    return case


def edit(case: Path, old: str, new: str, count: int = 0):
    f = case / "system" / "propsDict"
    t = f.read_text()
    if old not in t:
        raise RuntimeError(f"probe setup: '{old}' not in {f}")
    f.write_text(t.replace(old, new) if count == 0 else t.replace(old, new, count))


def want_refusal(res, tag: str, needles):
    rc, out = res
    if rc == 0:
        failures.append(f"{tag}: expected nonzero exit, got 0")
        return
    for nd in needles:
        if nd not in out:
            failures.append(f"{tag}: message lacks '{nd}'")


def main() -> int:
    if not PROPS.exists():
        print(f"check_restricted_network: {PROPS} missing -- build first")
        return 1

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- WITNESS: announce + reason + label ----------------------------
        case = copy(tmp, "witness")
        rc, out = run(case)
        if rc != 0:
            failures.append(f"WITNESS: exited {rc}\n" + out[-600:])
        else:
            if "RESTRICTED network (networkScope" not in out:
                failures.append("WITNESS: the restriction is not announced")
            if "NON-pairing major-ion treatment" not in out:
                failures.append("WITNESS: the declared reason is not quoted")
            if "networkRestricted" not in out:
                failures.append("WITNESS: the result label (networkRestricted"
                                " diag) is missing -- Vitor's condition 2")

        # ---- REFUSAL-1: no network list ------------------------------------
        case = copy(tmp, "nolist")
        edit(case, "network      ( water-dissociation );", "")
        want_refusal(run(case), "REFUSAL-1(no network)",
                     ["networkScope restricted", "requires a non-empty"
                      " `network"])

        # ---- REFUSAL-2: no reason ------------------------------------------
        case = copy(tmp, "noreason")
        f = case / "system" / "propsDict"
        f.write_text(re.sub(r'reason\s+"[^"]*";', "", f.read_text()))
        want_refusal(run(case), "REFUSAL-2(no reason)",
                     ["requires a non-empty `reason", "student"])

        # ---- REFUSAL-3: unknown record name --------------------------------
        case = copy(tmp, "unknown")
        edit(case, "network      ( water-dissociation );",
             "network      ( no-such-record );")
        want_refusal(run(case), "REFUSAL-3(unknown record)",
                     ["'no-such-record'", "no loaded chemistry record",
                      "Loaded records:"])

        # ---- REFUSAL-4: full + list (two authorities) ----------------------
        case = copy(tmp, "twoauth")
        edit(case, "networkScope restricted;", "networkScope full;", 1)
        want_refusal(run(case), "REFUSAL-4(two authorities)",
                     ["TWO", "authorities"])

        # ---- REFUSAL-5: admitted but unreachable ---------------------------
        #      Remove H's ride-along: water-dissociation needs the H master,
        #      which every analysis carries implicitly -- so instead admit a
        #      record whose masters the seawater feed lacks.  The seal holds
        #      only water-dissociation, so stage the CaSO4aq record back in
        #      from the catalogue to make it loadable-but-unreachable...
        #      unreachable needs a missing master; this feed HAS Ca and SO4,
        #      so use a bare NaCl-only op (PIN A) admitting CaSO4aq.
        case = copy(tmp, "unreach")
        shutil.copy(ROOT / "data" / "standards" / "chemistry"
                    / "CaSO4aq-formation.dat",
                    case / "constant" / "chemistry" / "CaSO4aq-formation.dat")
        edit(case, "network      ( water-dissociation );",
             "network      ( water-dissociation CaSO4aq-formation );", 1)
        rc, out = run(case)
        if rc == 0:
            failures.append("REFUSAL-5(unreachable): expected nonzero exit,"
                            " got 0")
        elif "unreachable from this feed" not in out:
            failures.append("REFUSAL-5(unreachable): message lacks"
                            " 'unreachable from this feed'\n" + out[-400:])

        # ---- NEGATIVE: a full-scope case stays silent ----------------------
        case = copy(tmp, "negative", FULL)
        rc, out = run(case)
        if rc != 0:
            failures.append(f"NEGATIVE: {FULL.name} exited {rc}")
        else:
            if "RESTRICTED network" in out:
                failures.append("NEGATIVE: a full-scope case announced a"
                                " restriction (crying wolf)")
            if "networkRestricted" in out:
                failures.append("NEGATIVE: a full-scope case carries the"
                                " restricted label")

    if failures:
        print("check_restricted_network: FAIL")
        for x in failures:
            print("  -", x)
        return 1
    print("check_restricted_network: OK -- the declared restricted network"
          " announces itself and quotes its reason, labels its results"
          " (networkRestricted), and refuses the five dishonest shapes"
          " (no list / no reason / unknown record / two authorities /"
          " unreachable admission); a full-scope case stays silent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
