#!/usr/bin/env python3
"""scan_archive.py ARCHIVE_DIR OUT_JSON

Walk every ThermoML article file under ARCHIVE_DIR (the 10.xxxx/ trees of the
NIST/TRC ThermoML Archive mirror) and write OUT_JSON with the blocks this
review needs: (a) every two-compound block whose property is an activity
coefficient; (b) every three-compound block that carries a liquid mole
fraction.  OUT_JSON holds measured points: it is a SCRATCH file and must
never be committed (no measured series in the tree, DEV.md 4c C282).
Review 2026-11-12-pairs-out-of-sample.  Reads only; writes only OUT_JSON.
"""
import json
import sys
import os
from multiprocessing import Pool
import xml.etree.ElementTree as ET


def loc(t):
    return t.rsplit("}", 1)[-1]


def first(e, name):
    for x in e.iter():
        if loc(x.tag) == name and x.text and x.text.strip():
            return x.text.strip()
    return ""


def orgnum(e):
    for x in e.iter():
        if loc(x.tag) == "RegNum":
            return first(x, "nOrgNum")
    return ""


def kind_name(e, skip):
    """The e* leaf naming a variable / constraint type."""
    for x in e.iter():
        t = loc(x.tag)
        if t.startswith("e") and t not in skip and x.text and x.text.strip():
            return x.text.strip()
    return ""


def scan(path):
    try:
        root = ET.parse(path).getroot()
    except Exception as ex:   # noqa: BLE001
        return {"file": path, "error": str(ex), "blocks": []}
    comps = {}
    for c in root:
        if loc(c.tag) != "Compound":
            continue
        comps[first(c, "nOrgNum")] = {"name": first(c, "sCommonName"),
                                      "inchiKey": first(c, "sStandardInChIKey")}
    cite = {"doi": first(root, "sDOI"), "year": first(root, "yrPubYr"),
            "authors": [(x.text or "").strip() for x in root.iter() if loc(x.tag) == "sAuthor"]}
    out = []
    bi = -1
    for pom in root.iter():
        if loc(pom.tag) != "PureOrMixtureData":
            continue
        bi += 1
        members = [orgnum(c) for c in pom if loc(c.tag) == "Component"]
        if len(members) not in (2, 3):
            continue
        props = []
        for p in pom:
            if loc(p.tag) != "Property":
                continue
            props.append({"num": first(p, "nPropNumber"), "name": first(p, "ePropName"),
                          "phase": first(p, "ePropPhase"), "org": orgnum(p),
                          "presentation": first(p, "ePresentation"),
                          "standardState": first(p, "eStandardState"),
                          "method": first(p, "eMethodName") or first(p, "sMethodName"),
                          "solvent": [first(s, "nOrgNum") for s in p.iter() if loc(s.tag) == "Solvent"]})
        variables = []
        for v in pom:
            if loc(v.tag) != "Variable":
                continue
            variables.append({"num": first(v, "nVarNumber"),
                              "name": kind_name(v, ("eVarPhase",)),
                              "phase": first(v, "eVarPhase"), "org": orgnum(v)})
        cons = []
        for c in pom:
            if loc(c.tag) != "Constraint":
                continue
            cons.append({"name": kind_name(c, ("eConstraintPhase",)),
                         "phase": first(c, "eConstraintPhase"), "org": orgnum(c),
                         "value": first(c, "nConstraintValue")})
        pnames = {p["name"] for p in props}
        is_gamma = len(members) == 2 and any("Activity coefficient" in n for n in pnames)
        has_x = any(v["name"] == "Mole fraction" for v in variables) or \
            any(p["name"] == "Mole fraction" for p in props)
        is_tern = len(members) == 3 and has_x
        if not (is_gamma or is_tern):
            continue
        rows = []
        for nv in pom:
            if loc(nv.tag) != "NumValues":
                continue
            r = {"var": {}, "prop": {}, "U": {}}
            for vv in nv:
                if loc(vv.tag) == "VariableValue":
                    r["var"][first(vv, "nVarNumber")] = first(vv, "nVarValue")
                elif loc(vv.tag) == "PropertyValue":
                    k = first(vv, "nPropNumber")
                    r["prop"][k] = first(vv, "nPropValue")
                    u = first(vv, "nCombExpandUncertValue") or first(vv, "nStdUncertValue")
                    if u:
                        r["U"][k] = u
            rows.append(r)
        out.append({"block": bi, "members": [{"org": m, **comps.get(m, {})} for m in members],
                    "props": props, "variables": variables, "constraints": cons,
                    "rows": rows, "kind": "gamma" if is_gamma else "ternary"})
    return {"file": path, "cite": cite, "blocks": out}


def main():
    arch, out = sys.argv[1], sys.argv[2]
    files = []
    for top in sorted(os.listdir(arch)):
        d = os.path.join(arch, top)
        if os.path.isdir(d) and top.startswith("10."):
            files += [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".xml")]
    with Pool(4) as pool:
        res = pool.map(scan, files, chunksize=50)
    arts = []
    nerr = 0
    for r in res:
        if "error" in r:
            nerr += 1
            continue
        if r["blocks"]:
            r["file"] = os.path.relpath(r["file"], arch)
            arts.append(r)
    json.dump({"archive": os.path.abspath(arch), "nFiles": len(files), "nUnreadable": nerr,
               "articles": arts}, open(out, "w"))
    print(f"scanned {len(files)} files ({nerr} unreadable); {len(arts)} articles with blocks of interest")


if __name__ == "__main__":
    main()
