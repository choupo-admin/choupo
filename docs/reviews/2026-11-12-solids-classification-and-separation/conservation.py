#!/usr/bin/env python3
"""Per-unit, per-component and per-size-class mass closure of the eight cases, recomputed
from the STREAMS the engine publishes (not from the units' own closure KPIs, which are
differences by construction).

Run:  python3 conservation.py <work-dir>     (the directory run_all.sh filled)
"""
import json, os, sys

W = sys.argv[1]
TOP = {  # case -> list of (unit, inlets, outlets)
 "screen01_dolomite_karra": [("screen", ["feed"], ["oversize", "undersize"])],
 "hydrocyclone01_quartz_willsTable91": [("cyclone", ["feed"], ["underflow", "overflow"])],
 "circuit01_herbstFuerstenau_closedCircuit": [("feedMixer", ["fresh", "recycle"], ["millFeed"]),
     ("millFirstHalf", ["millFeed"], ["millMid"]), ("millSecondHalf", ["millMid"], ["millDischarge"]),
     ("classifier", ["millDischarge"], ["recycle", "product"]), ("CIRCUIT", ["fresh"], ["product"])],
 "filter01_caco3_rotaryDrum": [("drum", ["slurry"], ["cake", "filtrate"])],
 "filter02_caco3_pressWashing": [("press", ["slurry", "washWater"], ["cake", "filtrate", "spentWash"])],
 "thickener01_settlingTest_talmageFitch": [("thickener", ["feed"], ["underflow", "overflow"])],
 "centrifuge01_tubularBowl_geankoplis": [("bowl", ["feed"], ["sediment", "centrate"])],
 "centrifuge02_discStack_sigmaIdentity": [("stack", ["feed"], ["sediment", "centrate"])],
}


def find_stream(J, name):
    S = J["streams"]
    if isinstance(S, dict):
        for k, v in S.items():
            if k == name or k.split(".")[-1] == name:
                return v
    else:
        for v in S:
            if v.get("name") == name:
                return v
    raise KeyError(name)


def comp_flows(s, MW=None):
    """kmol/s per component.  In the result JSON a stream's F and composition are the
    OVERALL material (fluid and solid together); `solids` holds the solid kg/s."""
    F = s.get("F", 0.0)
    return {c: F * z for c, z in s.get("composition", {}).items()}


def classes(s):
    """kg/s per size class: the solid mass flow x the published class fractions."""
    m = sum(s.get("solids", {}).values())
    w = (s.get("psd") or {}).get("massFrac")
    if m <= 0:
        return None
    return [m * x for x in w] if w else None


rows = []
for case, units in TOP.items():
    path = os.path.join(W, case + ".json")
    J = json.load(open(path))
    for unit, ins, outs in units:
        fin, fout = {}, {}
        for nm in ins:
            for c, v in comp_flows(find_stream(J, nm), None).items():
                fin[c] = fin.get(c, 0.0) + v
        for nm in outs:
            for c, v in comp_flows(find_stream(J, nm), None).items():
                fout[c] = fout.get(c, 0.0) + v
        tot = sum(abs(v) for v in fin.values())
        worst = max(abs(fout.get(c, 0.0) - fin.get(c, 0.0)) for c in set(fin) | set(fout))
        rows.append((case, unit, "component", worst / tot if tot else 0.0))
        cin = [classes(find_stream(J, nm)) for nm in ins]
        cout = [classes(find_stream(J, nm)) for nm in outs]
        cin = [c for c in cin if c]; cout = [c for c in cout if c]
        if cin and cout and not (unit.startswith("mill") or unit == "CIRCUIT"):  # breakage moves class mass
            nk = len(cin[0])
            tin = [sum(c[k] for c in cin) for k in range(nk)]
            tout = [sum(c[k] for c in cout) for k in range(nk)]
            msol = sum(tin)
            rows.append((case, unit, "sizeClass", max(abs(tout[k] - tin[k]) for k in range(nk)) / msol))
print("case\tunit\tbasis\tmax|out-in|/in")
for r in rows:
    print("%s\t%s\t%s\t%.3e" % r)
