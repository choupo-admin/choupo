#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a unit and a property operation that select the SAME named variant
of the case's one property dictionary receive the SAME values.
    bin/curate/check_variant_same_values.py

WHY THIS EXISTS (DEV.md 4c C398, RULED, point 7: "A GATE FROM THE FIRST
SLICE: for one state and one variant, the column and a property operation
receive the same values").  A variant is selected by name, `thermo <name>;`,
from a unit (system/flowsheetDict, choupoSolve) and from an operation
(system/propsDict, choupoProps).  The two binaries resolve the name by two
callers of ONE reader (src/thermo/PropertyVariants.H) and merge it by ONE
typed merge (src/thermo/ThermoOverride.H); this gate holds that this stays
true where it matters -- in the numbers -- by RUNNING both modes of the
witness `tutorials/steady/thermo/variants01_ethanol_water_line` (nothing is
read from a stale run output).

  (a) both modes run to exit 0;
  (b) both print the resolved view of variant `vogelLaw` before they compute,
      with the SAME fingerprint (the resolved definition) and the same DATA
      rows; the pipe's CHOICE row for the liquid viscosity names
      `variants.vogelLaw` and the surface tension's names the system;
  (c) THE CLAIM: the liquid viscosity the pipe received (result block,
      propertySources.used, unit `line`) equals operation `muVariant`'s
      `viscosity_liquid` at the same state (300 K, 3 bar, the feed's
      composition) to the precision the engine prints -- %.12g, so a
      relative difference of at most 5e-12.  Liquid viscosity is the one
      property both modes read with no new engine key: the pipe's density
      goes through the package's slice-0 density, for which the props bench
      has no mixture key;
  (d) NOT VACUOUS: `muSystem` (no selection) differs from `muVariant` by
      more than 1e-4 relative -- Andrade against Vogel -- so a selection
      that silently fell back to the system cannot pass (c);
  (e) THE ATOM: `muVariant`'s surface tension equals `muSystem`'s -- the
      variant replaced only the liquid-viscosity property block;
  and four REFUSAL arms on copies of the witness, each through the engine:
  (f) a variant that derives from another (`thermo other;` inside it) is
      refused by name, by both binaries;
  (g) an unknown variant name is refused, listing the declared ones;
  (h) a variant nobody selects is ANNOUNCED by the unread-key audit, not
      refused (a choupoSolve and a choupoProps run read the same constant/,
      so a variant only the check uses is correctly unused by the solve);
  (i) both spellings of one property block (`liquidViscosity {}` beside
      `liquid { viscosity {} }`) are refused, in the system and in a variant.

WHAT THIS GATE DOES NOT COVER, said so its green line cannot imply it.  It
holds ONE property (liquid viscosity) at ONE state on ONE flat case: not a
sector's variants (resolved by the same reader against the sector's file),
not a variant that changes `equilibrium` (a model boundary the energy report
accounts), not agreement below 5e-12 (the precision of the printed numbers).
It does not say which viscosity law is closer to a measurement.

SABOTAGE-VERIFIED by check_gate_selftest (two arms): `thermo vogelLaw;` removed
from the flowsheetDict (the pipe on the system: (c) fails), and from the
propsDict (muVariant on the system: (c) and (d) fail).
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
CASE = ROOT / "tutorials/steady/thermo/variants01_ethanol_water_line"
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"
REL = 5.0e-12
fails = []


def run(binary, case, timeout=600):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(binary), str(case)], capture_output=True, text=True,
                       env=env, timeout=timeout)
    return r.returncode, r.stdout + r.stderr


def result(text):
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", text, re.S)
    return json.loads(m.group(1)) if m else None


def fail(arm, msg):
    fails.append(f"({arm}) {msg}")


def copy_case(tmp, name):
    d = Path(tmp) / name
    shutil.copytree(CASE, d, ignore=shutil.ignore_patterns(
        "converged", "postProcessing", "reports", "log.*", "*.csv"))
    return d


def view(text, title):
    """The [properties] lines of one view block, by its title."""
    lines = [l[len("[properties] "):] for l in text.splitlines() if l.startswith("[properties] ")]
    out, on = [], False
    for l in lines:
        if "RESOLVED PROPERTIES: " + title in l:
            on = True
        elif on and "end of resolved properties: " + title in l:
            break
        elif on:
            out.append(l)
    return out


def data_rows(block):
    """The DATA column and the fingerprint: what was resolved, not who selected it."""
    keep, inData = [], False
    for l in block:
        s = l.strip()
        if s.startswith("fingerprint"):
            keep.append(s)
        elif s.startswith("CHOICE"):
            inData = False
        elif s.startswith("DATA"):
            inData = True
            keep.append(s)
        elif inData and l.startswith("              "):
            keep.append(s)
        else:
            inData = False
    return keep


def choice_of(block, row):
    for i, l in enumerate(block):
        if l.strip().startswith(row) and i + 1 < len(block):
            return block[i + 1].strip()
    return ""


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


def op(res, name):
    for o in (res or {}).get("operationResults", []):
        if o.get("name") == name:
            return o.get("diagnostics", {})
    return {}


def main():
    for b in (PROPS, SOLVE):
        if not b.exists():
            print(f"check_variant_same_values: CANNOT RUN -- {b} is not built (make all)")
            return 1
    if not CASE.is_dir():
        print(f"check_variant_same_values: FAIL -- the witness {CASE} is gone; the claim has no subject")
        return 1
    mu_unit = mu_var = mu_sys = float("nan")
    with tempfile.TemporaryDirectory(prefix="variants-") as tmp:
        d = copy_case(tmp, "witness")
        rcS, outS = run(SOLVE, d)
        rcP, outP = run(PROPS, d)
        # (a)
        if rcS != 0:
            fail("a", f"choupoSolve exit {rcS}: {outS[-600:]}")
        if rcP != 0:
            fail("a", f"choupoProps exit {rcP}: {outP[-600:]}")
        # (b)
        vS, vP = view(outS, "variant 'vogelLaw'"), view(outP, "variant 'vogelLaw'")
        if not vS or not vP:
            fail("b", "a mode printed no resolved view of variant 'vogelLaw' "
                      f"(solve {len(vS)} lines, props {len(vP)} lines)")
        else:
            dS, dP = data_rows(vS), data_rows(vP)
            if dS != dP:
                diff = [f"{a} | {b}" for a, b in zip(dS, dP) if a != b][:3]
                fail("b", f"the two views of variant 'vogelLaw' differ in what they resolved: {diff}")
            c = choice_of(vS, "liquid viscosity (transport.liquid.viscosity)")
            if "variants.vogelLaw" not in c:
                fail("b", f"the pipe's view does not attribute the liquid viscosity to variants.vogelLaw: {c!r}")
            c = choice_of(vS, "surface tension (transport.interface.surfaceTension)")
            if not c.startswith("CHOICE  system"):
                fail("b", f"the surface tension is not attributed to the system: {c!r}")
        resS, resP = result(outS), result(outP)
        used = [u for u in (resS or {}).get("propertySources", {}).get("used", [])
                if u.get("unit") == "line" and u.get("property") == "liquidViscosity"]
        if not used or used[0].get("valueMin") is None:
            fail("c", "the pipe published no liquidViscosity in propertySources.used")
        else:
            u = used[0]
            mu_unit = u["valueMin"]
            if u["valueMax"] != u["valueMin"]:
                fail("c", f"the pipe took several viscosities ({u['valueMin']} .. {u['valueMax']})")
            if abs(u.get("TMin", 0) - 300.0) > 1e-9 or abs(u.get("PMin", 0) - 3.0e5) > 1e-6:
                fail("c", f"the pipe asked at T {u.get('TMin')} K, P {u.get('PMin')} Pa, not the "
                          "operations' state (300 K, 3 bar): the comparison would not be at one state")
        var, sys_ = op(resP, "muVariant"), op(resP, "muSystem")
        mu_var = var.get("viscosity_liquid", float("nan"))
        mu_sys = sys_.get("viscosity_liquid", float("nan"))
        if not (mu_var == mu_var) or not (mu_sys == mu_sys):
            fail("c", "an operation published no viscosity_liquid")
        elif mu_unit == mu_unit:
            if rel(mu_unit, mu_var) > REL:
                fail("c", f"the pipe received mu = {mu_unit!r} Pa s, the operation on the same "
                          f"variant {mu_var!r}: relative {rel(mu_unit, mu_var):.3e} > {REL:g}")
        # (d)
        if mu_var == mu_var and mu_sys == mu_sys and rel(mu_var, mu_sys) < 1e-4:
            fail("d", f"muVariant ({mu_var!r}) and muSystem ({mu_sys!r}) agree to 1e-4: the "
                      "selection did not reach the package, so (c) proves nothing")
        # (e)
        sv, ss = var.get("surface_tension"), sys_.get("surface_tension")
        if sv is None or ss is None or sv != ss:
            fail("e", f"the variant changed a block it does not declare: surface tension "
                      f"{sv!r} on the variant, {ss!r} on the system")

        thermo = "constant/thermoPhysPropDict"
        # (f) a variant deriving from a variant
        f = copy_case(tmp, "derive")
        t = (f / thermo).read_text()
        anchor = "    vogelLaw                            // only what differs from the system above\n    {\n"
        if anchor not in t:
            fail("f", "the witness's variant block moved; the arm cannot place its sabotage")
        else:
            (f / thermo).write_text(t.replace(anchor, anchor + "        thermo other;\n"))
            for b in (SOLVE, PROPS):
                rc, out = run(b, f)
                if rc == 0 or "derives DIRECTLY from this file's own system" not in out:
                    fail("f", f"{b.name} did not refuse a variant naming another (exit {rc})")
        # (g) an unknown variant
        g = copy_case(tmp, "unknown")
        fs = (g / "system/flowsheetDict").read_text()
        (g / "system/flowsheetDict").write_text(fs.replace("thermo      vogelLaw;", "thermo      vogleLaw;"))
        rc, out = run(SOLVE, g)
        if rc == 0 or "names no variant" not in out or "vogelLaw" not in out:
            fail("g", f"an unknown variant name was not refused with the declared list (exit {rc})")
        # (h) an unused variant: announced, not refused
        h = copy_case(tmp, "unused")
        t = (h / thermo).read_text()
        (h / thermo).write_text(t.replace(
            "variants\n{\n",
            "variants\n{\n    spare { transport { interface { surfaceTension { model BrockBird; } } } }\n"))
        rc, out = run(SOLVE, h)
        if rc != 0:
            fail("h", f"an unused variant was refused (exit {rc}); it must be announced, not refused")
        elif not re.search(r"\[dict\]\s+constant/thermoPhysPropDict variants: `spare`", out):
            fail("h", "an unused variant was not announced by the unread-key audit")
        # (i) both spellings of one block, in the system and in a variant
        for where, old, new in (
            ("system", "        viscosity { model Andrade; }",
             "        viscosity { model Andrade; }\n    }\n    liquidViscosity { model Andrade;"),
            ("variant", "                viscosity { model Vogel; }",
             "                viscosity { model Vogel; }\n            }\n            liquidViscosity { model Vogel;"),
        ):
            k = copy_case(tmp, "spelling-" + where)
            t = (k / thermo).read_text()
            if old not in t:
                fail("i", f"the witness's {where} block moved; the arm cannot place its sabotage")
                continue
            (k / thermo).write_text(t.replace(old, new, 1))
            rc, out = run(SOLVE, k)
            if rc == 0 or "flat spelling of a property block" not in out:
                fail("i", f"both spellings of liquid viscosity in the {where} were not refused (exit {rc})")

    if fails:
        print("check_variant_same_values: FAIL")
        for x in fails:
            print("  " + x)
        return 1
    print("check_variant_same_values: OK -- (a) both modes of variants01 run; (b) both print the "
          "resolved view of variant 'vogelLaw' with one fingerprint and the same DATA rows; (c) the "
          f"pipe and operation muVariant receive the same liquid viscosity ({mu_unit:.6g} Pa s at "
          "300 K, 3 bar) to the printed precision (%.12g, relative <= 5e-12); (d) the system's "
          f"is different ({mu_sys:.6g}), so the selection is live; (e) the surface tension, a "
          "block the variant does not declare, is the system's; (f-i) a derived variant, an "
          "unknown name and both spellings of one block are refused, an unused variant is "
          "announced.  ONE property (liquid viscosity) at ONE state on ONE flat case: NOT "
          "sector variants, NOT a variant that changes equilibrium, NOT agreement below 5e-12")
    return 0


if __name__ == "__main__":
    sys.exit(main())
