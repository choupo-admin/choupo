#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a DATUM FLIP across a model boundary is refused, by name; a closed
single-package loop is not.
    bin/curate/check_datum_flip_refused.py

THE REAL DEFECT IT WOULD HAVE CAUGHT: an enthalpy on one datum subtracted
from an enthalpy on another, which is a number with no physical meaning.  A
pure-fluid method (`pureFluids { water { method IF97; } }`) returns h and s
on its publication's datum; the generic chain returns them on the elements
(formation) datum.  A stream that leaves a unit on the one and enters a unit
on the other is priced on two gauges; the energy report then carries the
gap between the datums as a first-law residual, and a converged run looks
finished.  Before this gate the model-boundary audit PRINTED "REFUSED" for
the finding but the run exited 0 with that residual in its balance; the rule
was a sentence in src/thermo/pureFluid/PureFluidModel.H (section Datum), held
by nothing (design record docs/design/measured-facts-materials-and-flow-
curves.md, section 7b, contract K1).  The refusal now ends the run, by name:
the stream, its producer and consumer, and both datums
(src/unitOperations/flowsheet/ModelBoundaryAudit.H, isDatumFlip; raised in
Flowsheet::solve right after the audit).

Four probes, built here from shipped cases, each run through choupoSolve:

  (a) SECTORS: tutorials/steady/flowsheets/plant01_two_sectors made water-only;
      sector secA on the plant's elements-datum package, sector secB on a
      sector dictionary that adds `pureFluids { water { method IF97; } }`,
      joined by the stream secA.liquid.  Must exit non-zero with
      "model boundary REFUSED on stream 'secA.liquid'", both ends and both
      datums named.
  (b) THE VARIANT ROUTE: tutorials/steady/power/rankine02_water with the
      pureFluids block moved into a variant `steamTables` that three of the
      four units select (`thermo steamTables;`), the boiler left on the
      elements package.  Must be refused on a stream of the boiler, in both
      directions (the pump -> boiler and the boiler -> turbine boundary are
      both flips; the first the run reaches is named).
  (c) CONTROL, the closed loop: rankine02_water as shipped (one package on
      IF97).  Must exit 0 and print no refusal.
  (d) CONTROL, the closed loop through a variant: rankine02_water with the
      variant selected by ALL four units.  Must exit 0, no refusal; and (a)'s
      plant with secA ALSO on pureFluids must exit 0 -- a refusal that fired
      on any pureFluids case would pass (a) and (b) alone.

  (e) K2, WHO GOVERNS IS PRINTED (contract K2 of the same record): the resolved
      view's row "who governs a pure-fluid component", for rankine02_water
      (choupoSolve) and heavyWater01_isotope_effect (choupoProps: IF97 water
      beside heavy water, in an `equilibrium` block), is compared line by line
      with the text pinned in bin/curate/datum_flip_who_governs.expected.  The
      result JSON carries no view lines, so a golden `expected` row cannot pin
      them; this arm is their pin.  `--record-append` adds a witness the file
      does not hold yet and never rewrites one that it does.  The lines were
      read from the call sites (ThermoPackage::Psat -> saturationPressure for
      the phase boundary; pureFluidRoute for the rest: x >= 0.999 routes,
      x <= 1e-12 skips, between THROWS).  The 'between' refusal itself is
      NOT run by this arm (no shipped case puts a flagged component at
      0 < x < 0.999 on purpose); the row's sentence is read from the source.

WHAT THIS GATE DOES NOT COVER.  The refusal is raised after the sweep (the
audit reads the converged streams), so a flip makes the run compute and then
end; it does not cover choupoBatch / choupoCtrl (the audit is a steady-flowsheet
object); it does not cover a flip between two DIFFERENT pure-fluid methods
(both gauges are pure-fluid datums; not flagged by the audit); and it holds
no sector whose second package carries a reaction (the audit refuses on the
pureFluids selections alone, whatever else the package holds).  The bridge
between the datums (the formation enthalpy of the pure fluid's reference
state) is not built; it is the declared way to lift the refusal.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"
RANKINE = ROOT / "tutorials/steady/power/rankine02_water"
#  Its walk (`(d / '0').rglob('*')` in plant()) reads the gate's OWN scratch copy, never the tree.
SCAN_ROOTS = ()

PLANT = ROOT / "tutorials/steady/flowsheets/plant01_two_sectors"
fails = []

IGNORE = shutil.ignore_patterns("converged", "postProcessing", "reports",
                                "log.*", "*.csv", "expected")


def run(case, timeout=600):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(SOLVE), str(case)], capture_output=True, text=True,
                       env=env, timeout=timeout)
    return r.returncode, r.stdout + r.stderr


def fail(arm, msg):
    fails.append(f"({arm}) {msg}")


def rankine(tmp, name, select):
    """rankine02_water with its pureFluids block moved into the variant
    `steamTables`, selected by the units in `select`."""
    d = Path(tmp) / name
    case_records.copytree(RANKINE, d, ignore=IGNORE)
    p = d / "constant/thermoPhysPropDict"
    t = p.read_text()
    t2 = re.sub(r"pureFluids\s*\{[^}]*\{[^}]*\}\s*\}",
                "variants\n{\n    steamTables { pureFluids { water { method IF97; } } }\n}\n", t)
    assert t2 != t, "rankine02_water's pureFluids block moved"
    p.write_text(t2)
    f = d / "system/flowsheetDict"
    t = f.read_text()
    for n in select:
        t2 = t.replace(f"name        {n};", f"name        {n};\n        thermo      steamTables;")
        assert t2 != t, f"unit {n} found"
        t = t2
    f.write_text(t)
    return d


def plant(tmp, name, both):
    """plant01_two_sectors made water-only; secB on IF97 (and secA too if `both`)."""
    d = Path(tmp) / name
    case_records.copytree(PLANT, d, ignore=IGNORE)
    case_records.unpin(d)
    p = d / "constant/thermoPhysPropDict"
    t = p.read_text()
    t2 = re.sub(r"components\s*\(\s*benzene\s+toluene\s*\)", "components ( water )", t)
    assert t2 != t
    p.write_text(t2)
    for f in (d / "0").rglob("*"):
        if f.is_file():
            s = f.read_text()
            s = re.sub(r"componentMolarFlows\s*\{[^}]*\}",
                       "componentMolarFlows\n{\n    water 100 kmol/h;\n}", s)
            f.write_text(s)
    (d / "0/MAIN/feed").write_text(
        re.sub(r"^T .*$", "T 365 K;", (d / "0/MAIN/feed").read_text(), flags=re.M))
    fa = d / "secA/fa/system/flowsheetDict"
    fa.write_text(fa.read_text().replace("T 370.0 K;", "T 372.0 K;"))
    sectors = ["secB"] + (["secA"] if both else [])
    for s in sectors:
        (d / s / "constant").mkdir(parents=True, exist_ok=True)
        (d / s / "constant/thermoPhysPropDict").write_text(
            "recordType    thermophysicalPropertySystem;\nschemaVersion 1;\n"
            'inherits "../../constant";\npureFluids { water { method IF97; } }\n')
    return d


def refusal(text):
    m = re.search(r"^ERROR: (model boundary REFUSED on stream .*)$", text, re.M)
    return m.group(1) if m else None


def expect_refused(arm, case, stream, ends):
    rc, out = run(case)
    msg = refusal(out)
    if rc == 0:
        fail(arm, "the run exited 0: the datum flip was NOT refused")
    elif msg is None:
        fail(arm, f"exit {rc} but not by the datum-flip refusal: "
                  f"{next((l for l in out.splitlines() if l.startswith('ERROR')), '(no ERROR line)')[:200]}")
    else:
        for need in (f"'{stream}'", "datum change", "elements (formation) datum",
                     "pure-fluid datum of its publication", "PureFluidModel IF97",
                     "no physical meaning") + tuple(ends):
            if need not in msg:
                fail(arm, f"the refusal does not name {need!r}: {msg[:300]}")
    return msg


def expect_clean(arm, case):
    rc, out = run(case)
    if rc != 0:
        fail(arm, f"a closed one-package run was REFUSED or failed (exit {rc}): "
                  f"{next((l for l in out.splitlines() if l.startswith('ERROR')), '(no ERROR line)')[:200]}")
    if refusal(out) or re.search(r"^\s+\S+\s+\S+ -> \S+\s+REFUSED: datum change", out, re.M):
        fail(arm, "a datum-flip refusal printed on a closed one-package loop")


WITNESSES = (("rankine02_water", SOLVE, RANKINE),
             ("heavyWater01_isotope_effect", ROOT / "choupoProps",
              ROOT / "tutorials/props/thermo/heavyWater01_isotope_effect"))
PINNED = Path(__file__).resolve().parent / "datum_flip_who_governs.expected"
ROW = "[properties]   who governs a pure-fluid component"


def who_governs(binary, case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(binary), str(case)], capture_output=True, text=True, env=env, timeout=600)
    lines = (r.stdout + r.stderr).splitlines()
    if ROW not in lines:
        return None
    i = lines.index(ROW)
    out = [ROW]
    for l in lines[i + 1:]:
        if re.match(r"^\[properties\]   \S", l) or not l.startswith("[properties]"):
            break
        out.append(l)
    return out


def read_pinned():
    pinned, cur = {}, None
    if PINNED.exists():
        for l in PINNED.read_text().splitlines():
            if l.startswith("## "):
                cur = l[3:].strip()
                pinned[cur] = []
            elif cur is not None and l.startswith("[properties]"):
                pinned[cur].append(l)
    return pinned


def arm_who_governs(record_append):
    pinned = read_pinned()
    added = []
    for name, binary, case in WITNESSES:
        got = who_governs(binary, case)
        if got is None:
            fail("e who governs", f"{name}: the view prints no row {ROW!r}")
            continue
        if name not in pinned:
            if record_append:
                added.append((name, got))
            else:
                fail("e who governs", f"{name}: no pinned lines (run with --record-append)")
            continue
        if pinned[name] != got:
            fail("e who governs", f"{name}: the row differs from its pin; first difference: "
                 + next((f"pinned {a[:160]!r} / now {b[:160]!r}" for a, b in
                         zip(pinned[name] + [''] * len(got), got + [''] * len(pinned[name])) if a != b), "?"))
        needles = ("phase boundary", "enthalpy, entropy, density", "x >= 0.999",
                   "x <= 1e-12", "0 < x < 0.999: REFUSED", "diffusivity", "datum:")
        for nd in needles:
            if not any(nd in l for l in got):
                fail("e who governs", f"{name}: the row does not say {nd!r}")
    if added:
        with PINNED.open("a") as f:
            for name, got in added:
                f.write(f"## {name}\n" + "\n".join(got) + "\n")
        print("check_datum_flip_refused: --record-append added " + ", ".join(n for n, _ in added))


def main():
    if not SOLVE.exists():
        print("check_datum_flip_refused: CANNOT RUN -- choupoSolve is not built (make all)")
        return 2
    for c in (RANKINE, PLANT):
        if not c.is_dir():
            print(f"check_datum_flip_refused: FAIL -- the witness {c} is gone; the claim has no subject")
            return 1
    with tempfile.TemporaryDirectory(prefix="datumflip.") as tmp:
        expect_refused("a sectors", plant(tmp, "sectors_flip", both=False),
                       "secA.liquid", ("secA.fa", "secB.fb"))
        msg = expect_refused("b variant route",
                             rankine(tmp, "variant_flip", ["feedPump", "steamTurbine", "condenser"]),
                             "feedwater", ("feedPump", "boiler"))
        expect_clean("c shipped closed loop", RANKINE)
        expect_clean("d1 closed loop through a variant",
                     rankine(tmp, "variant_all", ["feedPump", "boiler", "steamTurbine", "condenser"]))
        expect_clean("d2 two sectors both on pureFluids", plant(tmp, "sectors_both", both=True))
    arm_who_governs("--record-append" in sys.argv)
    if fails:
        print("check_datum_flip_refused: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_datum_flip_refused: OK -- a datum flip is refused by name and ends the run: "
          "(a) two sectors, secA on the elements datum and secB on IF97, joined by secA.liquid; "
          "(b) the variant route, three units selecting `thermo steamTables;` and the boiler not "
          "(first refusal: " + (msg.split(':')[0] if msg else '?') + "); "
          "both name the stream, its two ends and both datums; "
          "controls exit 0 with no refusal: rankine02_water as shipped, the same loop with all four "
          "units on the variant, and the two-sector plant with both sectors on pureFluids.  "
          "(e) the resolved view's row 'who governs a pure-fluid component' of rankine02_water and "
          "heavyWater01_isotope_effect equals its pinned text; "
          "NOT CHECKED: choupoBatch/choupoCtrl, a flip between two different pure-fluid methods, "
          "a reacting second package, the bridge between the datums (not built).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
