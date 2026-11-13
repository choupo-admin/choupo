#!/usr/bin/env python3
"""Read one ThermoML article file from the local mirror and return its
blocks (components, constraints, variables, every point with its stated
uncertainty).  A finding-aid reader for the density pilot (C378): the
mirror is gitignored; a value enters the batch's data files with its
article's DOI and table and the status `transcribedNotCheckedAgainstArticle`
(thirdParty/thermoml/README.md).

usage: thermoml_blocks.py <DOI>      (prints the citation and a block summary)
"""
import sys, os, xml.etree.ElementTree as ET

MIRROR = os.environ.get("CHOUPO_THERMOML", "/home/vitor/Choupo/thirdParty/thermoml")


def strip(tag):
    return tag.split('}')[-1]


def child(e, name):
    if e is None:
        return None
    for c in e:
        if strip(c.tag) == name:
            return c
    return None


def children(e, name):
    return [c for c in e if strip(c.tag) == name]


def text(e, *path):
    for p in path:
        e = child(e, p)
    return e.text.strip() if e is not None and e.text else None


def load(doi):
    return ET.parse(os.path.join(MIRROR, doi + ".xml")).getroot()


def compounds(root):
    out = {}
    for c in children(root, "Compound"):
        n = text(c, "RegNum", "nOrgNum")
        names = [x.text for x in children(c, "sCommonName")]
        out[n] = dict(name=names[0] if names else "?", formula=text(c, "sFormulaMolec"),
                      inchikey=text(c, "sStandardInChIKey"))
    return out


def var_type(v):
    """(label, component number or None) of a Variable or Constraint."""
    vid = child(v, "VariableID")
    if vid is None:
        vid = child(v, "ConstraintID")
    vt = child(vid, "VariableType")
    if vt is None:
        vt = child(vid, "ConstraintType")
    t = list(vt)[0]
    label = t.text.strip() if t.text and t.text.strip() else strip(t.tag)
    r = vid.find(".//{*}nOrgNum")
    return label, (r.text.strip() if r is not None else None)


def blocks(doi):
    root = load(doi)
    comps = compounds(root)
    res = []
    for b in children(root, "PureOrMixtureData"):
        bn = text(b, "nPureOrMixtureDataNumber")
        cl = [text(c, "RegNum", "nOrgNum") for c in children(b, "Component")]
        props = {}
        for p in children(b, "Property"):
            pn = text(p, "nPropNumber")
            nm = p.find(".//{*}ePropName")
            ph = text(p, "PropPhaseID", "ePropPhase")
            props[pn] = (nm.text.strip() if nm is not None else "?", ph)
        cons = {}
        for c in children(b, "Constraint"):
            cons[var_type(c)] = text(c, "nConstraintValue")
        vars_ = {}
        for v in children(b, "Variable"):
            vars_[text(v, "nVarNumber")] = var_type(v)
        rows = []
        for nv in children(b, "NumValues"):
            row = {}
            for vv in children(nv, "VariableValue"):
                row[vars_[text(vv, "nVarNumber")]] = float(text(vv, "nVarValue"))
            for pv in children(nv, "PropertyValue"):
                pn = text(pv, "nPropNumber")
                u = pv.find(".//{*}nCombExpandUncertValue")
                u2 = pv.find(".//{*}nStdUncertValue")
                rows.append(dict(row, _prop=props[pn][0], _val=float(text(pv, "nPropValue")),
                                 _U=float(u.text) if u is not None else None,
                                 _u=float(u2.text) if u2 is not None else None))
        res.append(dict(block=bn, comps=[comps[c]["name"] for c in cl], compnums=cl,
                        props=props, constraints=cons, rows=rows))
    return root, comps, res


def citation(root):
    c = child(root, "Citation")
    return dict(authors=[x.text for x in children(c, "sAuthor")], title=text(c, "sTitle"),
                journal=text(c, "sPubName"), year=text(c, "yrPubYr"), vol=text(c, "sVol"),
                page=text(c, "sPage"), doi=text(c, "sDOI"))


if __name__ == "__main__":
    root, comps, bl = blocks(sys.argv[1])
    print(citation(root))
    print(comps)
    for b in bl:
        names = sorted({v[0] for v in b["props"].values()})
        print("block", b["block"], b["comps"], names, "n=", len(b["rows"]),
              "cons", b["constraints"])
