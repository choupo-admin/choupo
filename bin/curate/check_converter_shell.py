#!/usr/bin/env python3
"""Gate: one pressure shell around a sector -- `type converterShell` -- sizes what it claims.

    bin/curate/check_converter_shell.py

WHY THIS EXISTS (DEV.md 4c C69, 2026-10-12).  A multibed converter is one
pressure vessel holding its beds and interbed exchangers; the flowsheet still
computes each as its own block.  `tutorials/plant/greenAmmonia03_basicDesign`
groups its three beds and two interbed coolers as the sector CONVERTER, and
its postDict sizes ONE shell for the sector (`converterShell`), which takes
over the beds' own shells (baskets, NOT costed) and carries ONE relief valve.
A golden pins what a run PRINTS; this gate recomputes the shell from its
members and fires the refusals.

WHAT THIS GATE CHECKS, on a copy of the witness run at its design point (the
outerDict removed -- the variables block holds the design point -- so one
pass, not a DesignSpec):

  (a) THE MEMBERS ARE THE SECTOR'S UNITS: nMembers equals the number of
      CONVERTER units in the topology; D equals the widest member's (a bed
      shell's D, a cooler's Kern shellID) and H the sum of their heights (a
      bed's H, a cooler's tubeLength x shells in series), at 1e-10; V =
      pi D^2/4 H.
  (b) THE BASKETS: every bed shell carries no cost and is listed NOT COSTED
      naming CONVERTER/shell; every catalyst charge and both coolers stay
      priced; the shell itself is priced on the vessel set; the capital
      total is the sum of the priced items' totals.
  (c) ONE VALVE: CONVERTER/psv is set at the shell's design pressure and
      relieves the sector's own outlet, CONVERTER.HotEffluent; no bed carries
      a valve.
  (d) THE SHEETS: design/CONVERTER/shell and design/CONVERTER/psv exist at
      the sector's own level -- never design/CONVERTER/CONVERTER/.
  (e) EVERY REFUSAL FIRES BY NAME: a declared D smaller than the widest
      member; a declared H smaller than the stack; the entry declared BEFORE
      its members; a name that is no sector; a shell rated below a member's
      design pressure.

WHAT THIS DOES NOT CHECK, said plainly:
  * whether STACKING is how this converter would be built (a cartridge, an
    annulus, beds at one diameter): the shell is its members' envelope and
    the basis says so;
  * the cost of a tube bundle without its shell (no correlation exists; the
    coolers keep their exchanger cost, an over-estimate the basis states).

SABOTAGES PERFORMED (by hand, 2026-10-12), each against this gate:
  S1  H = the TALLEST member instead of the sum.  Caught by (a) (H and V)
      and by (e)'s H probe, which a 4.50 m stack no longer refuses.
  S2  the enclosed shells left costed (the SizingPass loop that sets
      notCostedBecause skipped).  Caught by (b), six findings.  The total
      arm did NOT fire: the costed baskets enter the printed total and the
      recomputed sum alike, so (b)'s per-item arms are the ones that see it.
  S3  the declared D/H refusal removed (`declaredOr` accepting any value).
      Caught by (e), both the D and the H probe.
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials/plant/greenAmmonia03_basicDesign"
ENTRY = "        { unitName CONVERTER;  type converterShell;  material SS316;\n" \
        "          designRules { pressureDesign  167; } }\n"


def run(case):
    p = subprocess.run([str(SOLVE)], cwd=str(case), capture_output=True,
                       text=True, timeout=1200)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return p.returncode, out, js


def copy(td, post_edit=None):
    dst = Path(td) / "case"
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "designspec_history.csv"))
    (dst / "system/outerDict").unlink()
    if post_edit:
        pd = dst / "system/postDict"
        t = pd.read_text()
        t2 = post_edit(t)
        assert t2 != t, "postDict edit did not apply; update this gate"
        pd.write_text(t2)
    return dst


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


def main() -> int:
    fails, claims = [], []
    if not SOLVE.exists():
        print("check_converter_shell: CANNOT RUN -- no native build at " + str(SOLVE))
        return 1
    if ENTRY not in (CASE / "system/postDict").read_text():
        print("check_converter_shell: FAIL -- the witness postDict no longer"
              " carries the converterShell entry this gate edits")
        return 1

    with tempfile.TemporaryDirectory() as td:
        case = copy(td)
        rc, out, js = run(case)
        if rc != 0 or js is None:
            print("check_converter_shell: FAIL -- the witness did not run (exit %d):\n%s"
                  % (rc, out[-1500:]))
            return 1
        eq = {e["item"]: e for e in js["equipment"]}
        shell = eq.get("CONVERTER/shell")
        if shell is None:
            print("check_converter_shell: FAIL -- no CONVERTER/shell item")
            return 1
        v = shell["values"]
        members = [e for e in eq.values()
                   if e.get("sector") == "CONVERTER" and e["unit"] != "CONVERTER"]
        units = sorted({e["unit"] for e in members})
        geo = []
        for e in members:
            x = e["values"]
            if "D" in x and "H" in x:
                geo.append((x["D"], x["H"]))
            elif "shellID" in x and "tubeLength" in x:
                geo.append((x["shellID"], x.get("shellsInSeries", 1) * x["tubeLength"]))
        D = max(g[0] for g in geo)
        H = sum(g[1] for g in geo)
        if int(v["nMembers"]) != len(units) or len(geo) != len(units):
            fails.append(f"(a) nMembers {v['nMembers']} against {len(units)} CONVERTER"
                         f" units, {len(geo)} with a geometry")
        for key, ref in (("D", D), ("H", H), ("V_R", math.pi * D * D / 4 * H)):
            if rel(v[key], ref) > 1e-10:
                fails.append(f"(a) shell {key} = {v[key]!r}, from its members {ref!r}")
        claims.append(f"(a) shell D {D:.4f} m (widest of {len(units)} members), H {H:.4f} m"
                      f" (their sum), V {v['V_R']:.3f} m3 recomputed")

        beds = [i for i in eq if re.fullmatch(r"CONVERTER\.Bed\d/shell", i)]
        for b in beds:
            if "cost" in eq[b]:
                fails.append(f"(b) {b} is still costed inside the converter shell")
            if not re.search(re.escape(b) + r"\s+--\s+inside the pressure shell CONVERTER/shell", out):
                fails.append(f"(b) {b} is not listed NOT COSTED naming CONVERTER/shell")
        priced = [i for i in eq if re.fullmatch(r"CONVERTER\.Bed\d/catalystCharge", i)] \
            + ["CONVERTER.InterbedCooler1", "CONVERTER.InterbedCooler2", "CONVERTER/shell"]
        for i in priced:
            if "cost" not in eq.get(i, {}):
                fails.append(f"(b) {i} is not priced")
        tot = re.search(r"TOTALS \(EUR\)( -- INCOMPLETE)?\s+[0-9]+\s+[0-9]+\s+([0-9]+)", out)
        s = sum(e["cost"]["totalModule"] for e in eq.values() if "cost" in e)
        if not tot or tot.group(1) or abs(s - float(tot.group(2))) > 0.5 * len(eq):
            fails.append("(b) the capital total is INCOMPLETE or not the sum of the"
                         " priced items' totals")
        claims.append(f"(b) {len(beds)} bed shells are baskets (not costed, naming the"
                      " shell); charges, coolers and the shell priced; the total sums")

        psv = eq.get("CONVERTER/psv")
        if psv is None:
            fails.append("(c) no CONVERTER/psv")
        else:
            pv = psv["values"]
            if pv["P_set_gauge"] != v["pressureDesign"]:
                fails.append("(c) the valve is not set at the shell's design pressure")
            if "blocked_CONVERTER_HotEffluent_A" not in pv:
                fails.append("(c) the valve does not relieve the sector's outlet"
                             " CONVERTER.HotEffluent")
        if any(re.fullmatch(r"CONVERTER\.Bed\d/psv", i) for i in eq):
            fails.append("(c) a bed still carries its own valve")
        claims.append("(c) ONE valve on the shell, set at its design pressure, on the"
                      " sector's outlet")

        for sheet in ("design/CONVERTER/shell", "design/CONVERTER/psv"):
            if not (case / sheet).is_file():
                fails.append(f"(d) no sheet at {sheet}")
        if (case / "design/CONVERTER/CONVERTER").exists():
            fails.append("(d) design/CONVERTER/CONVERTER/ exists -- the sector named twice")
        claims.append("(d) the shell's sheets at the sector's own level")

    probes = [
        ("a D smaller than the widest member",
         lambda t: t.replace(ENTRY, ENTRY.replace("pressureDesign  167;",
                                                  "pressureDesign  167;  D 2.0 m;")),
         "SMALLER than its members"),
        ("an H smaller than the stack",
         lambda t: t.replace(ENTRY, ENTRY.replace("pressureDesign  167;",
                                                  "pressureDesign  167;  H 5 m;")),
         "SMALLER than its members"),
        ("the entry before its members",
         lambda t: t.replace(ENTRY, "").replace(
             "        { unitName CONVERTER.Bed1;", ENTRY + "        { unitName CONVERTER.Bed1;"),
         "AFTER every member's own entry"),
        ("a name that is no sector",
         lambda t: t.replace(ENTRY, ENTRY.replace("unitName CONVERTER;", "unitName REACTOR;")),
         "REACTOR"),
        ("a shell rated below a member",
         lambda t: t.replace(ENTRY, ENTRY.replace("pressureDesign  167;", "pressureDesign  150;")),
         "rated below what it contains"),
    ]
    #  The probes are independent runs: in parallel, so the gate costs one
    #  run's wall clock and not five (the faster-gates rule, never fewer arms).
    def probe(args):
        label, edit, expect = args
        with tempfile.TemporaryDirectory() as td:
            rc, out, js = run(copy(td, edit))
        return label, expect, out, js
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(probe, probes))
    for label, expect, out, js in results:
            #  A sizing refusal is caught per entry and listed; the run goes on.
            if expect not in out:
                fails.append(f"(e) {label}: no refusal naming `{expect}`")
            elif js and any(e["item"] == "CONVERTER/shell" for e in js.get("equipment", [])) \
                    and label != "a name that is no sector":
                fails.append(f"(e) {label}: refused AND sized")
    claims.append(f"(e) {len(probes)} refusals fired by name")

    if fails:
        print("check_converter_shell: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_converter_shell: OK -- " + "; ".join(claims))
    return 0


if __name__ == "__main__":
    sys.exit(main())
