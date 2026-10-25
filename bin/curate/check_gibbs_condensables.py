#!/usr/bin/env python3
"""check_gibbs_condensables -- a Gibbs reactor never publishes a gas that a
condensable it did not condense would leave supersaturated (2026-10-25,
DEV.md 4c C150 R07).

WHY.  The element-potential method condenses ONE pure liquid.  With two
condensables supersaturated in the gas-only answer it returned that answer,
converged and unannounced; after condensing one it never re-tested the
others; and reactiveFlash, which carries a multi-component liquid, decides
its liquid on the gas-only answer only.  Each published, at exit 0, a gas
in which y_i P > Psat_i -- the answer to a different problem from the one
posed (the element-potential EduTool said so in its limits; nothing in the
engine did).  Now each method MARKS such an answer
(`supersaturatedCondensables`, GibbsMethod.cpp, ONE home) and the reactor
REFUSES it by name on its final solve.

FIXTURES, built from tutorials/steady/gibbs/gibbs07_wgs_cooled with methanol
added to its species (C/H/O atoms 1/4/1) and 0.5 kmol/h of it to the feed,
read from the standard catalogue (the seal is dropped for the copy):

  (a) 280 K, elementPotential, gas outlet only: BOTH water and methanol are
      supersaturated in the gas-only answer -> refused, both named, with
      `directMin` as the remedy.  Before the fix: exit 0, "single gas
      phase", y_water P = 14.5 kPa against Psat = 0.99 kPa.
  (b) 300 K, elementPotential: only water is supersaturated in the gas-only
      answer; after condensing it, methanol is (y P 19.75 kPa > Psat
      18.64 kPa) -> refused naming methanol.  Before: exit 0, x_water = 1.
  (c) 300 K, reactiveFlash: the same miss (its active set is decided on the
      gas-only answer) -> refused naming methanol.  Before: exit 0, the same
      water-only liquid as (b).
  (d) 300 K, directMin: runs (exit 0) and its liquid carries BOTH water and
      methanol -- the multi-component answer the refusals point to (the
      comparison asked for; no equality with the old gas answer is sought).
  (e) gibbs07 as shipped (one condensable): runs, two-phase -- the
      one-liquid path is untouched.

NOT COVERED, said plainly: the gibbsMap op COUNTS such cells and announces
them (`n_supersaturated_not_condensed`) instead of refusing, because a map
keeps its other cells -- no witness map reaches one today; an adiabatic
outer Newton's TRIAL temperatures are deliberately not refused (only the
final solve is); and whether directMin's answer is RIGHT is not this gate's
question.

Exit 1 listing failures."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "gibbs" / "gibbs07_wgs_cooled"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def edit(path: Path, old: str, new: str):
    s = path.read_text()
    if s.count(old) != 1:
        raise SystemExit(f"check_gibbs_condensables: fixture text not found"
                         f" once in {path}: {old!r} -- fix the GATE")
    path.write_text(s.replace(old, new))


def fixture(tmp: Path, tag: str, T: str, model: str, gas_only: bool) -> Path:
    case = tmp / tag
    shutil.copytree(CASE, case, ignore=shutil.ignore_patterns(
        "expected", "log.*", "reports", "converged", "newtonLog.csv"))
    (case / "constant" / "propertyManifest").unlink()
    shutil.rmtree(case / "constant" / "components")
    edit(case / "constant" / "thermoPhysPropDict",
         "components       ( CO  water  CO2  H2 );",
         "components       ( CO  water  CO2  H2  methanol );")
    fd = case / "system" / "flowsheetDict"
    edit(fd, "{ name  H2;    atoms  ( 0  2  0 ); }",
         "{ name  H2;    atoms  ( 0  2  0 ); }\n"
         "                { name  methanol; atoms ( 1  4  1 ); }")
    edit(fd, "newtonLog  newtonLog.csv;", "")
    edit(fd, "T          350.0 K;", f"T          {T} K;")
    edit(fd, "model       elementPotential;", f"model       {model};")
    if gas_only:
        edit(fd, "outputs     ( gas  condensate );", "outputs     ( gas );")
        (case / "0" / "condensate").unlink()
    feed = case / "0" / "feed"
    edit(feed, "water    0.75 kmol/h;",
         "water    0.75 kmol/h;\n    methanol 0.50 kmol/h;")
    edit(feed, "350 K", f"{T} K")
    return case


def kpi(out: str, key: str):
    m = re.search(r'"wgs": \{[^{}]*"' + re.escape(key) + r'": ([-+0-9.eE]+)',
                  out)
    return float(m.group(1)) if m else None


def refused(tag, rc, out, names):
    if rc == 0:
        failures.append(f"{tag}: ran to exit 0 -- a supersaturated gas was"
                        " published")
        return
    if "so it is not the equilibrium" not in out:
        failures.append(f"{tag}: exit {rc} but not the supersaturation"
                        " refusal")
    for n in names:
        if not re.search(re.escape(n) + r" \(y P = [0-9.]+ Pa > Psat", out):
            failures.append(f"{tag}: the refusal does not name {n!r} with"
                            " its y P and Psat")
    if "model directMin;" not in out:
        failures.append(f"{tag}: the refusal does not name the remedy"
                        " `model directMin;`")


def main() -> int:
    if not SOLVE.exists():
        print(f"check_gibbs_condensables: {SOLVE} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        rc, out = run(fixture(tmp, "a", "280", "elementPotential", True))
        refused("(a) 280 K elementPotential", rc, out, ["water", "methanol"])
        rc, out = run(fixture(tmp, "b", "300", "elementPotential", False))
        refused("(b) 300 K elementPotential", rc, out, ["methanol"])
        if re.search(r"water \(y P =", out):
            failures.append("(b) the condensed species itself was named as"
                            " supersaturated")
        rc, out = run(fixture(tmp, "c", "300", "reactiveFlash", False))
        refused("(c) 300 K reactiveFlash", rc, out, ["methanol"])
        rc, out = run(fixture(tmp, "d", "300", "directMin", False))
        if rc != 0:
            failures.append(f"(d) directMin: exit {rc}")
        else:
            xm, xw = kpi(out, "x_methanol"), kpi(out, "x_water")
            if xm is None or xw is None or xm < 0.1 or xw < 0.1:
                failures.append(f"(d) directMin's liquid is not a water +"
                                f" methanol liquid (x_methanol {xm},"
                                f" x_water {xw})")
        w = tmp / "e"
        shutil.copytree(CASE, w, ignore=shutil.ignore_patterns(
            "expected", "log.*", "reports", "converged", "newtonLog.csv"))
        rc, out = run(w)
        if rc != 0 or kpi(out, "twoPhase") != 1.0:
            failures.append(f"(e) gibbs07 as shipped: exit {rc}, twoPhase"
                            f" {kpi(out, 'twoPhase')} (expected 0 and 1)")
    if failures:
        for x in failures:
            print("  FAIL " + x)
        print("check_gibbs_condensables: FAIL")
        return 1
    print("check_gibbs_condensables: OK -- with water and methanol both"
          " condensable, elementPotential refuses a gas-only answer that"
          " leaves both supersaturated (280 K) and a one-liquid answer that"
          " leaves methanol supersaturated (300 K), reactiveFlash refuses the"
          " same 300 K miss, each naming y P, Psat and `model directMin;`;"
          " directMin returns a water + methanol liquid; gibbs07's one-liquid"
          " path is unchanged (gibbsMap counts such cells rather than"
          " refusing; adiabatic trial temperatures are not refused)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
