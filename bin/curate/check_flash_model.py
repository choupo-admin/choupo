#!/usr/bin/env python3
"""Flash `model` gate: the machine that solves a flash has a NAME, and a name
that cannot lie.

Four numerical worlds have always lived inside the one flash unit -- K-value
iteration, direct Gibbs minimisation for the liquid split, the multi-start
seeding of the three-phase case, and the reactive joint Newton -- and until
2026-07-28 none of them had a name in the dictionary.  The `model` slot
(`type` -> `model` -> `operation`, the same convention the distillation
column settled) names the first two.

It names them WITHOUT becoming a second home for a decision that already has
one, which is the whole reason this gate exists.  Four refusals, each with a
different reason:

  1. `model rachfordRice` on an LL/VLLE phase set -- a liquid-liquid split is
     NOT reachable by K-value iteration: for a symmetric activity model it
     converges to the trivial K = 1 saddle, two phases of identical
     composition, which satisfies every equality and is not a split.
  2. `model gibbsMinimisation` on a VL phase set -- that machine resolves the
     liquid phases; a vapour-liquid flash runs the K-value iteration.
  3. ANY `model` on a case whose package resolves a REACTIVE electrolyte
     equilibrium.  Which machine runs there is a consequence of the declared
     formulation (the one-knob rule) and the unit implements no chemistry
     (ratified section 6b) -- naming it in the unit would let a case declare
     a machine its package cannot run.
  4. an unknown model name, with the available list.

And two positive checks: the corpus exercises the DECLARED branch (not only
the implied default), and the reactive cases announce nothing (they must not
sprout a model line they do not own).

Exit 1 listing failures."""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"

TYPE  = re.compile(r"(type\s+\w*[Ff]lash\w*;)")
MODEL = re.compile(r"model\s+\w+;")

#  (case, model to inject, a phrase the refusal MUST contain)
REFUSALS = [
    ("tutorials/steady/flash/vlle03_audit_artificial", "rachfordRice",
     "trivial"),
    ("tutorials/steady/flash/flash02_ethanol_water", "gibbsMinimisation",
     "VL phase set"),
    ("tutorials/steady/flash/flash16_calcite_precipitation", "rachfordRice",
     "REACTIVE"),
    ("tutorials/steady/flash/flash02_ethanol_water", "newtonRaphson",
     "unknown"),
]

#  cases that already DECLARE a model in the corpus (the positive branch)
DECLARED = [
    ("tutorials/steady/flash/flash01_benzene_toluene", "rachfordRice"),
    ("tutorials/steady/flash/vlle03_audit_artificial", "gibbsMinimisation"),
]

REACTIVE_SILENT = "tutorials/steady/flash/flash16_calcite_precipitation"


def run(case_dir):
    p = subprocess.run([str(SOLVE), str(case_dir)],
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def with_model(tmp, case, model):
    dst = Path(tmp) / Path(case).name
    shutil.copytree(ROOT / case, dst)
    fd = dst / "system" / "flowsheetDict"
    s = fd.read_text()
    #  REPLACE an already-declared model, else inject after `type`.  (A case
    #  that declares one would otherwise keep it and the injected line would
    #  never be read -- the gate then passes on a run it never tested.)
    s2, n = MODEL.subn("model       %s;" % model, s, count=1)
    if n == 0:
        s2, n = TYPE.subn(r"\1\n        model       %s;" % model, s, count=1)
    if n != 1:
        return None
    fd.write_text(s2)
    return dst


def main():
    if not SOLVE.exists():
        print("choupoSolve not built -- run `make` first")
        return 1
    fails = []

    with tempfile.TemporaryDirectory() as tmp:
        for case, model, phrase in REFUSALS:
            d = with_model(tmp, case, model)
            if d is None:
                fails.append(f"{case}: no flash `type` line to inject a model into")
                continue
            rc, out = run(d)
            if rc == 0:
                fails.append(f"{case} + `model {model};`: ACCEPTED (exit 0).  "
                             "This declaration must be refused -- see the "
                             "gate docstring for which of the four it is")
            elif phrase not in out:
                fails.append(f"{case} + `model {model};`: refused, but the "
                             f"message never says '{phrase}' -- a refusal "
                             "without its reason teaches nothing")
            shutil.rmtree(d)

    for case, model in DECLARED:
        rc, out = run(ROOT / case)
        if rc != 0:
            fails.append(f"{case}: declares `model {model};` and no longer runs")
        elif f"[flash] model {model}  (declared)" not in out:
            fails.append(f"{case}: declares `model {model};` but the run does "
                         "not announce it as DECLARED -- the corpus would then "
                         "exercise only the implied default")

    rc, out = run(ROOT / REACTIVE_SILENT)
    if "[flash] model" in out:
        fails.append(f"{REACTIVE_SILENT}: a REACTIVE case announced a flash "
                     "model.  The machine there belongs to the package, not "
                     "the unit; announcing one in the unit's voice is the "
                     "second home this gate exists to prevent")

    if fails:
        print("flash-model gate FAILED:")
        for f in fails:
            print("  -", f)
        return 1
    print(f"flash model: {len(REFUSALS)} refusal(s) fire with their reasons, "
          f"{len(DECLARED)} case(s) exercise the declared branch, the reactive "
          "path announces no unit-level model")
    return 0


if __name__ == "__main__":
    sys.exit(main())
