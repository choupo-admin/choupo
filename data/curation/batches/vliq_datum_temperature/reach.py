#!/usr/bin/env python3
"""The reach of the future correction: every shipped case that names a record whose `Vliq` datum is wrong or
unstated in temperature, and whether the component can be a LIQUID constituent in it.

    python3 data/curation/batches/vliq_datum_temperature/reach.py [--cases COMPONENT]

Reads tutorials/**/constant/thermoPhysPropDict (`components ( ... );`) and the case's `0/` stream files
(`T <number> K;`).  For each (case, component) it prints the case, the lowest stream temperature found in the
case's 0/ files that carry the component, the component's Tc (data/standards/components) and a class:

  LIQUID-CANDIDATE   some stream carrying the component is below its Tc (a saturated-liquid volume exists
                     there, so the anchored Rackett route can be asked for it)
  GAS-ONLY           every stream carrying the component is at or above its Tc: no liquid volume exists
                     (the density route REFUSES the component there, ThermoPackage.cpp:2502), so the
                     stored datum cannot reach a result through that route
  NO-STREAMS         no temperature found (a case with no `0/` falls back to the `T`/`temperature` lines of its
                     system/ dicts; when those give none either): read by hand
  NO-TC              the record states no Tc (hitecSalt, sucrose): every case is a candidate

The class is a SCREEN on stream temperatures, not a run of the case: it says where a liquid volume CAN be asked
for, never that the case asks for one.  README.md names the cases read by hand.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
COMP = ROOT / "data/standards/components"
AFFECTED = ("CH4 CO H2 N2 NO O2 CO2 hitecSalt Ar He O3 ethylene ethane acetylene N2O HCl sucrose "
            "Cl2 H2S SO2 nButane propane").split()


def tc_of(n):
    t = (COMP / (n + ".dat")).read_text(errors="replace")
    m = re.search(r"^\s*Tc\s+([0-9.eE+-]+)\s*;", t, re.M)
    return float(m.group(1)) if m else None


def comps_of(f):
    t = f.read_text(errors="replace")
    m = re.search(r"^\s*components\s*\((.*?)\)\s*;", t, re.S | re.M)
    return re.sub(r"//.*", "", m.group(1)).split() if m else []


def dict_T(case):
    """The lowest `T`/`temperature` written in the case's system/ dicts (cases with no 0/ directory)."""
    ts = []
    for f in (case / "system").glob("*") if (case / "system").is_dir() else []:
        if not f.is_file():
            continue
        for m in re.finditer(r"^\s*(?:T|temperature|T0|Tinit|Tfeed|Tin|T_in|T_feed)\s+([-0-9.eE+]+)\s*(K|C|degC)?\s*;",
                             f.read_text(errors="replace"), re.M):
            ts.append(float(m.group(1)) + (273.15 if m.group(2) in ("C", "degC") else 0.0))
    return min(ts) if ts else None


def stream_T(case, comp):
    ts = []
    z = case / "0"
    if not z.is_dir():
        return dict_T(case)
    for f in z.iterdir():
        if not f.is_file():
            continue
        t = f.read_text(errors="replace")
        if not re.search(r"^\s*" + re.escape(comp) + r"\s", t, re.M):
            continue
        for m in re.finditer(r"^\s*T\s+([-0-9.eE+]+)\s*(K|C)?\s*;", t, re.M):
            v = float(m.group(1)) + (273.15 if m.group(2) == "C" else 0.0)
            ts.append(v)
    return min(ts) if ts else None


def main():
    rows = []
    for f in sorted(ROOT.glob("tutorials/**/constant/thermoPhysPropDict")):
        case = f.parent.parent
        cs = comps_of(f)
        for n in AFFECTED:
            if n not in cs:
                continue
            tc = tc_of(n)
            mt = stream_T(case, n)
            if tc is None:
                cls = "NO-TC"
            elif mt is None:
                cls = "NO-STREAMS"
            elif mt < tc:
                cls = "LIQUID-CANDIDATE"
            else:
                cls = "GAS-ONLY"
            rows.append((n, str(case.relative_to(ROOT)), "" if mt is None else f"{mt:.2f}", "" if tc is None else tc, cls))
    if "--cases" in sys.argv:
        want = sys.argv[sys.argv.index("--cases") + 1]
        rows = [r for r in rows if r[0] == want]
    print("component\tcase\tmin_stream_T_K\tTc_K\tclass")
    for r in rows:
        print("\t".join(str(x) for x in r))


main()
