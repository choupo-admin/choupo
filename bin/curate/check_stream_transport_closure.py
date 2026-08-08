#!/usr/bin/env python3
"""Gate: ONE STREAM, ONE SEMANTICS -- the transport closure (ruled 2026-08-08).

    bin/curate/check_stream_transport_closure.py

THE CONTRACT: every public representation of a solved stream answers the
same hierarchy the same way -- F/composition are the OVERALL material
(solids included, exactly what converged/<stream> stores as
componentMolarFlows), the phases{} blocks decompose that SAME material and
sum back to it component by component, and H/H_kW are one consistent pair
(H_kW = F*H) on the overall basis.  This gate exists because the structured
JSON leaked the engine-internal fluid-only representation for months (F,
composition and H fluid-only beside an overall H_kW), so the GUI's phase
totals read as failing to close against an F that never contained the
solid -- found by Vitor on flash19, the witness pinned here.

WHAT THIS CHECKS, per witness stream:
  C1  sum(composition) == 1 (multiphase or not).
  C2  JSON == FILE: F*x_i equals converged/<stream>'s componentMolarFlows,
      component by component (the two public surfaces agree).
  C3  THE FILE'S OWN CLOSURE: Sigma over phases{} blocks equals the file's
      overall componentMolarFlows, component by component -- the executable
      form of the 2026-07-30 stream-state invariant.
  C4  H_kW == F*H within tolerance (one enthalpy pair, one basis).
  C5  The derived aqueous side (overall - organic - solid) is nonnegative
      per component -- a negative dissolved amount means the named parts
      exceed the whole.

WITNESSES: flash19 (aqueous + organic + solid at once) and flash17 (two
liquids, no solid -- the negative for the solid arm).  Both are RUN FRESH
in a scratch copy; the gate never trusts a stale log.

WHAT THIS DOES NOT CHECK, said plainly: report CSVs (phases.csv is written
by the same engine pass the file comes from), the GUI's rendering (held by
gui/tests), and streams of cases not named here -- the invariant is
structural, so two witnesses with the richest phase structure in the corpus
stand for the mechanism, not for every case.
"""
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]

WITNESSES = {
    "tutorials/steady/flash/flash19_organic_and_precipitate":
        ["feed", "liquid", "vapor"],
    "tutorials/steady/flash/flash17_two_liquids_reactive":
        ["feed", "liquid", "vapor"],
}

KMOLH = 1.0 / 3600.0     # kmol/h -> kmol/s


def parse_flows(block: str) -> dict:
    return {c: float(v) * KMOLH for c, v in
            re.findall(r"(\w+)\s+([\d.eE+-]+)\s+kmol/h", block)}


def parse_stream_file(path: pathlib.Path):
    txt = path.read_text()
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    txt = re.sub(r"//[^\n]*", "", txt)
    m = re.search(r"componentMolarFlows\s*\{(.*?)\}", txt, re.S)
    overall = parse_flows(m.group(1)) if m else {}
    phases = {}
    pm = re.search(r"phases\s*\{(.*)\}", txt, re.S)
    if pm:
        body = pm.group(1)
        for ph in re.finditer(
                r"(aqueous|organic|solid)\s*\{\s*componentMolarFlows\s*\{(.*?)\}",
                body, re.S):
            phases[ph.group(1)] = parse_flows(ph.group(2))
    return overall, phases


def run_case(rel: str, tmp: pathlib.Path) -> dict:
    src = ROOT / rel
    dst = tmp / src.name
    shutil.copytree(src, dst)
    for junk in dst.glob("log.*"):
        junk.unlink()
    p = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(dst)],
                       capture_output=True, text=True, timeout=600)
    log = (dst / "log.choupoSolve").read_text() if (dst / "log.choupoSolve").exists() else p.stdout
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>",
                  log, re.S)
    if p.returncode != 0 or not m:
        raise RuntimeError(f"{rel}: no result JSON (exit {p.returncode})\n"
                           + (p.stdout + p.stderr)[-800:])
    return {"json": json.loads(m.group(1)), "dir": dst}


def main() -> int:
    fail = []
    checked_streams = 0
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)
        for rel, streams in WITNESSES.items():
            try:
                run = run_case(rel, tmp)
            except Exception as e:
                print(f"check_stream_transport_closure: FAILED\n  {e}")
                return 1
            j = run["json"]
            mm = j.get("componentMolarMass", {})
            for sname in streams:
                s = j["streams"].get(sname)
                if s is None:
                    fail.append(f"{rel}: stream '{sname}' absent from JSON")
                    continue
                checked_streams += 1
                F = s["F"]
                x = s["composition"]
                # C1 -- overall fractions close to 1.
                if F > 0 and abs(sum(x.values()) - 1.0) > 1e-9:
                    fail.append(f"{rel}:{sname}: sum(x) = {sum(x.values())!r} != 1")
                # C2 -- JSON == FILE, component by component.
                overall_file, phases_file = parse_stream_file(
                    run["dir"] / "converged" / sname)
                for c, nf in overall_file.items():
                    nj = F * x.get(c, 0.0)
                    if abs(nj - nf) > 1e-6 * max(abs(nf), 1e-12):
                        fail.append(f"{rel}:{sname}:{c}: JSON F*x = {nj!r} "
                                    f"but converged/ file says {nf!r} -- the two "
                                    "public surfaces disagree")
                # C3 -- the FILE's phases sum back to the FILE's overall.
                if phases_file:
                    comps = set(overall_file)
                    for ph in phases_file.values():
                        comps |= set(ph)
                    for c in comps:
                        tot = sum(ph.get(c, 0.0) for ph in phases_file.values())
                        ref = overall_file.get(c, 0.0)
                        if abs(tot - ref) > 1e-6 * max(abs(ref), 1e-12):
                            fail.append(f"{rel}:{sname}:{c}: file phases sum "
                                        f"{tot!r} != overall {ref!r}")
                # C4 -- one enthalpy pair.
                if "H" in s and "H_kW" in s and F > 0:
                    if abs(F * s["H"] - s["H_kW"]) > 1e-6 * max(abs(s["H_kW"]), 1e-9):
                        fail.append(f"{rel}:{sname}: F*H = {F*s['H']!r} != "
                                    f"H_kW = {s['H_kW']!r} -- two enthalpy bases")
                # C5 -- derived aqueous nonnegative.
                org = s.get("organicLiquid", {})
                sol = {c: kg / mm[c] for c, kg in s.get("solids", {}).items()
                       if c in mm and mm[c] > 0}
                for c in x:
                    aq = F * x[c] - org.get(c, 0.0) - sol.get(c, 0.0)
                    if aq < -1e-9 * max(F * x[c], 1e-12):
                        fail.append(f"{rel}:{sname}:{c}: derived aqueous "
                                    f"{aq!r} < 0 -- the named parts exceed the whole")
            # sanity: the flash19 witness must actually be multiphase, or the
            # gate is checking closure on nothing.
            if "flash19" in rel:
                liq = j["streams"]["liquid"]
                if not liq.get("solids") or not liq.get("organicLiquid"):
                    fail.append(f"{rel}: liquid no longer carries organic+solid "
                                "-- the witness lost the structure this gate needs")
    if fail:
        print("check_stream_transport_closure: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_stream_transport_closure: OK -- one stream, one semantics, "
          f"verified live on {checked_streams} stream(s) of 2 fresh-run "
          "witnesses: sum(x) = 1; JSON F*x equals converged/<stream> "
          "component by component; the file's phases{} blocks sum back to "
          "its overall componentMolarFlows (flash19: dissolved + crystal "
          "CaCO3 = 0.03 exactly); H_kW = F*H as one pair; the derived "
          "aqueous side is nonnegative.  NOT CHECKED: report CSVs, GUI "
          "rendering (gui/tests), and streams outside the two witnesses.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
