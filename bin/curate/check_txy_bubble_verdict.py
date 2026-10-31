#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_txy_bubble_verdict -- an unconverged bubble point is not a point of
the T-x-y diagram (DEV.md 4c C186 item 6).

THE DEFECT.  `bubbleT` (src/thermo/SaturationCurves.cpp) runs a bracketed
Newton on 200..700 K and returned its last iterate without reading the
verdict.  A liquid that boils below 200 K came back as T = 200 K, and
choupoSolve's guard refused the diagram only when EVERY point sat on that
floor -- so a curve wrong at SOME points was published (the review: true
bubble T 191.893 K, sum K x = 1.52575 at 200 K, 20 of 29 points invalid).
Now `bubbleT` hands back the Newton's verdict, `binaryTxy` drops each
composition whose solve did not converge and lists it, and choupoSolve counts
the drops aloud (stderr + the caveat block) and REFUSES the diagram when
fewer than half of the attempted compositions remain (a stated default).

The witnesses are BUILT here, in a temporary directory, from flash01's
layout with propane + ethane on an ideal gamma-phi package (Raoult), fed at
215 K: ethane boils at 184.6 K, so at 1 bar the bubble T of an ethane-rich
liquid is below the 200 K bracket and at 2 bar only the last few are.
PROPANE IS PLOTTED FIRST ON PURPOSE.  With ethane first, the floor points
have y_ethane = K x > 1 and the old out-of-range-y guard threw the WHOLE
diagram away in silence -- a defect of its own, but not the review's.  With
the heavy component first, y stays in range at the floor and the old code
published a curve with a 200 K plateau, which is the review's shape.

  (a) A PARTLY BAD CURVE IS DRAWN WITHOUT ITS BAD POINTS, AND SAYS SO.  At
      2 bar the run must print `[txy] ... did not converge at N of 29`
      (N > 0), publish 29 - N points, none of them at a dropped x, and none
      at the 200 K bracket floor.  On the old code it printed nothing and
      published every point, the dropped ones at exactly 200 K.
  (b) A MOSTLY BAD CURVE IS REFUSED BY NAME.  At 1 bar more than half the
      compositions fail: the run must say `REFUSED` and publish no `txy`
      block.  On the old code it published a curve with a 200 K plateau,
      because not EVERY point was on the floor.
  (c) THE COUNT REACHES THE CAVEAT BLOCK.  The same sentence is in the
      result's `advisories` on both witnesses (an announcement only on
      stderr is gone by the time a reader opens the result).
  (d) A GOOD CURVE IS UNTOUCHED.  flash01 (benzene + toluene, 1 bar) must
      publish all 29 points and print no count.
  (e) THE GUARD READS THE VERDICT.  choupoSolve/main.cpp no longer carries
      the 200 K floor as a constant; it reads `xUnconverged`.
  (f) A NOISY K IS DRAWN, AND SAYS SO (the architect's ruling, 2026-10-31).
      flash20 (ethanol + water on PC-SAFT) has K noise above the Newton's
      1e-8: its points end at |sum K x - 1| ~ 1e-7..1e-6, right to ~1e-4 K.
      They are accepted on the Newton's own final residual against
      kTxyAcceptResidual (1e-5, ONE home in SaturationCurves.H): all 29 must
      be drawn, the run must announce how many were accepted although the
      Newton did not meet its 1e-8, with the worst |f|, on stderr and in the
      advisories -- a second tolerance must never be a silent second verdict.
  (g) THE COLUMN'S BUBBLE POINT KEEPS ITS VERDICT.  `bubbleTWithItsVapour`
      (DistillationColumn.cpp, in an anonymous namespace, so no probe can
      call it) must read the verdict of every bubbleT it calls and fold the
      last one into its `converged` flag.  A SOURCE arm, because no witness
      can tell it apart behaviourally: both of its callers re-test
      |sum K x - 1| <= 1e-8 themselves, and a bubble-T Newton asked for
      1e-12 that fails at the floor fails that re-test too.

WHAT IS NOT CHECKED.  Whether each published point is RIGHT beyond its
residual; the Wang-Henke stage loop's calls of `bubbleT`, which pass no
verdict pointer and are judged by the column's own outer test of sum K x on
every published stage.

Exit 1 naming the arm that failed.
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
BIN = ROOT / "build" / "linux64Gcc" / "choupoSolve"
BASE = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"
MAIN = ROOT / "src" / "applications" / "choupoSolve" / "main.cpp"
COLUMN = ROOT / "src" / "unitOperations" / "distillation" / "DistillationColumn.cpp"
FLASH20 = ROOT / "tutorials" / "steady" / "flash" / "flash20_ethanol_water_pcsaft"
FLOOR = 200.0


def txy_block(stdout):
    m = re.search(r'"txy":\s*(\{.*?\n\s*\})', stdout, re.S)
    if not m:
        return None
    return json.loads(m.group(1))


def advisories(stdout):
    m = re.search(r'"advisories":\s*(\[.*?\n\s*\])', stdout, re.S)
    if not m:
        return []
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return []


def build_witness(tmp, bar):
    w = Path(tmp) / f"txyWitness_{bar}bar"
    shutil.copytree(BASE, w)
    for sub in ("constant/propertyManifest", "constant/components", "expected"):
        p = w / sub
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    tp = w / "constant" / "thermoPhysPropDict"
    tp.write_text(tp.read_text().replace("( benzene toluene )",
                                         "( propane ethane )"))
    fd = w / "system" / "flowsheetDict"
    fd.write_text(fd.read_text().replace("T 370.0 K;  P 1.0 bar;",
                                         f"T 215.0 K;  P {bar} bar;"))
    feed = w / "0" / "feed"
    t = feed.read_text()
    t = t.replace("benzene    40", "ethane     40").replace(
        "toluene    60", "propane    60")
    t = re.sub(r"^T\s+370 K;", "T               215 K;", t, flags=re.M)
    t = re.sub(r"^P\s+100000 Pa;", f"P               {bar * 100000} Pa;",
               t, flags=re.M)
    feed.write_text(t)
    for s in ("liquid", "vapor"):
        f = w / "0" / s
        f.write_text(f.read_text().replace("benzene", "ethane").replace(
            "toluene", "propane"))
    return w


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BIN), str(case)], capture_output=True, text=True,
                       timeout=600, env=env)
    return r.returncode, r.stdout, r.stderr


def main() -> int:
    if not BIN.exists():
        print(f"check_txy_bubble_verdict: FAILED\n  no {BIN} -- build the "
              "tree first.  A check that cannot run must not pass.")
        return 1
    fail, ok = [], []
    with tempfile.TemporaryDirectory(prefix="txyverdict_") as tmp:
        # ---- (a) 2 bar: a few points fail ---------------------------------
        rc, out, err = run(build_witness(tmp, 2))
        m = re.search(r"\[txy\].*did not converge at (\d+) of (\d+) "
                      r"compositions \(x_propane = ([^)]*)\)", err)
        t = txy_block(out)
        if rc != 0:
            fail.append(f"(a) the 2 bar witness exited {rc}:\n" + err[-400:])
        elif not m:
            fail.append("(a) the 2 bar witness printed no `[txy] ... did not "
                        "converge at N of M` count on stderr -- an "
                        "unconverged bubble point was dropped (or drawn) in "
                        "silence")
        elif t is None:
            fail.append("(a) the 2 bar witness published no txy block, but "
                        "most of its points converge -- the diagram should "
                        "be drawn without the dropped ones")
        else:
            nDrop, nAtt = int(m.group(1)), int(m.group(2))
            dropped = [float(v) for v in m.group(3).split(",")]
            atFloor = [T for T in t["Tbubble"] if T <= FLOOR + 1e-9]
            clash = [x for x in t["xBubble"]
                     if any(abs(x - d) < 1e-3 for d in dropped)]
            if nDrop == 0:
                fail.append("(a) the 2 bar witness dropped 0 points -- the "
                            "witness no longer reaches the bracket floor")
            elif len(t["xBubble"]) != nAtt - nDrop:
                fail.append(f"(a) {len(t['xBubble'])} points published, "
                            f"expected {nAtt} - {nDrop}")
            elif atFloor or clash:
                fail.append(f"(a) the published curve still carries points "
                            f"at the 200 K floor ({atFloor[:3]}) or at a "
                            f"dropped x ({clash[:3]})")
            else:
                ok.append(f"at 2 bar {nDrop} of {nAtt} unconverged "
                          f"compositions are dropped and counted, "
                          f"{nAtt - nDrop} drawn, none at the 200 K floor")
        adv = [a for a in advisories(out)
               if "T-x-y diagram" in a.get("locus", "")
               and "did not converge" in a.get("message", "")]
        if not adv:
            fail.append("(c) the 2 bar witness's count is not in the result's "
                        "advisories -- the caveat block does not carry it")

        # ---- (b) 1 bar: most points fail ----------------------------------
        rc, out, err = run(build_witness(tmp, 1))
        m = re.search(r"\[txy\].*did not converge at (\d+) of (\d+)", err)
        if rc != 0:
            fail.append(f"(b) the 1 bar witness exited {rc}:\n" + err[-400:])
        elif not m or "REFUSED" not in err:
            fail.append("(b) the 1 bar witness did not refuse its diagram by "
                        "name on stderr:\n" + err[-400:])
        elif txy_block(out) is not None:
            fail.append("(b) the 1 bar witness said REFUSED and published a "
                        "txy block anyway")
        else:
            ok.append(f"at 1 bar {m.group(1)} of {m.group(2)} fail and the "
                      "diagram is refused by name")
        if not any("REFUSED" in a.get("message", "")
                   for a in advisories(out)):
            fail.append("(c) the 1 bar refusal is not in the result's "
                        "advisories")

    # ---- (d) a good curve is untouched -----------------------------------
    rc, out, err = run(BASE)
    t = txy_block(out)
    if rc != 0 or t is None or len(t["xBubble"]) != 29 or "[txy] T-x-y" in err:
        fail.append(f"(d) flash01 (benzene + toluene) did not publish its "
                    f"29-point diagram cleanly (exit {rc}, "
                    f"{0 if t is None else len(t['xBubble'])} points)")
    else:
        ok.append("flash01's 29-point diagram is drawn with no count")

    # ---- (f) a noisy K: drawn, and said ---------------------------------
    rc, out, err = run(FLASH20)
    t = txy_block(out)
    m = re.search(r"\[txy\].*?(\d+) of (\d+) points accepted at \|sum K x - 1\|"
                  r" <= (\S+) although the bubble-T Newton did not meet its "
                  r"1e-8; worst \|f\| = ([0-9.eE+-]*[0-9])", err)
    advF = [a for a in advisories(out) if "points accepted at" in a.get("message", "")]
    if rc != 0 or t is None:
        fail.append(f"(f) flash20 published no T-x-y diagram (exit {rc}) -- "
                    "a curve right to ~1e-4 K was refused")
    elif len(t["xBubble"]) != 29:
        fail.append(f"(f) flash20 drew {len(t['xBubble'])} points, expected 29")
    elif not m:
        fail.append("(f) flash20 drew its curve but did not announce the "
                    "points accepted short of the Newton's 1e-8 -- a second "
                    "tolerance has become a silent second verdict:\n"
                    + err[-400:])
    elif not advF:
        fail.append("(f) flash20's accepted-not-converged count is not in the "
                    "result's advisories")
    elif not (0 < float(m.group(4)) <= 1e-5):
        fail.append(f"(f) flash20's worst accepted |f| = {m.group(4)} is not "
                    "inside (0, 1e-5]")
    else:
        ok.append(f"flash20 (PC-SAFT) draws all 29 points, {m.group(1)} of "
                  f"them accepted at |f| <= 1e-5 short of the Newton's 1e-8 "
                  f"and announced (worst |f| = {m.group(4)})")

    # ---- (g) the column's bubble point keeps its verdict ----------------
    col = re.sub(r"//[^\n]*", "", COLUMN.read_text())
    m = re.search(r"scalar bubbleTWithItsVapour\(.*?\n\}\n", col, re.S)
    body = m.group(0) if m else ""
    calls = re.findall(r"bubbleT\(([^;]*)\);", body)
    if not body:
        fail.append("(g) bubbleTWithItsVapour not found in "
                    "DistillationColumn.cpp")
    elif not calls or any("&tOk" not in c for c in calls):
        fail.append(f"(g) bubbleTWithItsVapour calls bubbleT {len(calls)} "
                    "time(s) and not every call reads the Newton's verdict -- "
                    "the verdict is dropped again")
    elif "ok && tOk" not in body or "*converged = tOk" not in body:
        fail.append("(g) bubbleTWithItsVapour reads the verdict but does not "
                    "fold it into its `converged` flag on both paths")
    else:
        ok.append(f"the column's bubbleTWithItsVapour reads the verdict of "
                  f"all {len(calls)} bubbleT calls and folds it into its flag")

    # ---- (e) the guard reads the verdict, not the floor -----------------
    src = MAIN.read_text()
    code = re.sub(r"//[^\n]*", "", src)
    if "xUnconverged" not in code or re.search(r"Tfloor|200\.0", code):
        fail.append("(e) choupoSolve/main.cpp does not read xUnconverged, or "
                    "still carries the 200 K floor as a constant -- the guard "
                    "reads a symptom")
    else:
        ok.append("the guard reads xUnconverged and no 200 K constant")

    if fail:
        print("check_txy_bubble_verdict: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_txy_bubble_verdict: OK -- " + "; ".join(ok) + "; the count "
          "reaches the caveat block on both witnesses.  NOT checked: whether "
          "a point is RIGHT beyond its residual, and the Wang-Henke stage "
          "loop's bubbleT calls (judged by the column's stage test)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
