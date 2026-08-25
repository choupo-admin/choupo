#!/usr/bin/env python3
"""Extract ONE ThermoML dataset into a Choupo experiments file, citation attached.

    bin/curate/thermoml_extract.py <xml> --list
    bin/curate/thermoml_extract.py <xml> --block N -o constant/experiments/<name>

WHAT THIS CLOSES.  The mirror (bin/choupo-import-thermoml) holds the
numerical data; `fitParameters` regresses model parameters against
datasets in the case's constant/experiments/; the Literature workspace and
thermoml_locate find the article.  This tool is the missing connector:
one SELECTED dataset out of one article's XML, written in the corpus
experiment format, with the citation of the ORIGINAL ARTICLE generated
into the header from the XML's own Citation block -- so a parameter fitted
against it carries its provenance from birth.

WHAT IT REFUSES TO BE.  It embeds NO physics: every numeric block is
dumped as columns (variables + property, units parsed from the ThermoML
names themselves) and the CURATOR chooses which dataset feeds which fit.
It converts nothing into data/standards/ -- the output lands in a CASE's
constant/experiments/ (or wherever -o points), which is the case-local,
sample-specific home the three-axiom layout assigns to measured data.

The compounds are named by each RegNum's FIRST sCommonName; mole-fraction
columns become x_<name>.  A block whose structure this tool does not
recognise is listed with the reason and refuses extraction by name --
never a silently empty dataset.
"""
import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def L(tag):
    return tag.rsplit("}", 1)[-1]


def text_of(el, name):
    for x in el.iter():
        if L(x.tag) == name and x.text and x.text.strip():
            return x.text.strip()
    return ""


def parse(xml_path):
    root = ET.parse(xml_path).getroot()
    cit = None
    compounds = {}
    blocks = []
    for el in root:
        t = L(el.tag)
        if t == "Citation":
            cit = {
                "title":   text_of(el, "sTitle"),
                "authors": [x.text.strip() for x in el.iter()
                            if L(x.tag) == "sAuthor" and x.text],
                "journal": text_of(el, "sPubName"),
                "year":    text_of(el, "yrPubYr"),
                "doi":     text_of(el, "sDOI"),
            }
        elif t == "Compound":
            reg = text_of(el, "nOrgNum") or text_of(el, "nRegNum")
            nm = ""
            for x in el.iter():
                if L(x.tag) == "sCommonName" and x.text and x.text.strip():
                    nm = x.text.strip(); break
            if reg:
                compounds[reg] = nm
        elif t == "PureOrMixtureData":
            blocks.append(el)
    return cit, compounds, blocks


def unit_of(name):
    #  ThermoML embeds the unit after the last comma: "Pressure, kPa".
    if "," in name:
        u = name.rsplit(",", 1)[1].strip()
        if u and " " not in u:
            return u
    return "-"


def col_name(kind, name, org, compounds):
    base = name.rsplit(",", 1)[0].strip()
    base = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_")
    if kind == "x" and org:
        comp = re.sub(r"[^A-Za-z0-9]+", "_", compounds.get(org, org))
        return f"x_{comp}"
    return base


def describe_block(blk, compounds):
    """Columns (ordered var1..varN, prop) + rows, or a named refusal."""
    varcols = {}
    prop = None
    constraints = []
    for k in blk:
        t = L(k.tag)
        if t == "Constraint":
            #  the held quantity of an isobaric/isothermal set -- without it
            #  the dataset silently loses its pressure or temperature.
            cname, cval = "", text_of(k, "nConstraintValue")
            for x in k.iter():
                lt = L(x.tag)
                if lt in ("ePressure", "eTemperature", "eComponentComposition") \
                        and x.text and x.text.strip():
                    cname = x.text.strip()
            if cname and cval:
                constraints.append((col_name("c", cname, "", compounds),
                                    unit_of(cname), cval))
        if t == "Variable":
            num = text_of(k, "nVarNumber")
            org = text_of(k, "nOrgNum")
            kind, name = "", ""
            for x in k.iter():
                lt = L(x.tag)
                if lt in ("eTemperature", "ePressure", "eMoleFraction",
                          "eComponentComposition", "eSolventComposition") \
                        and x.text and x.text.strip():
                    kind = "x" if "Fraction" in lt or "Composition" in lt else lt[1]
                    name = x.text.strip()
            if not num:
                return None, None, "a Variable carries no nVarNumber", []
            if not name:
                return None, None, f"variable {num}: unrecognised eVarType", []
            varcols[num] = (col_name(kind, name, org, compounds), unit_of(name))
        elif t == "Property":
            pname = text_of(k, "ePropName")
            phase = text_of(k, "ePropPhase")
            if not pname:
                return None, None, "a Property carries no ePropName", []
            prop = (col_name("p", pname, "", compounds), unit_of(pname), phase,
                    pname)
    if prop is None:
        return None, None, "no Property block", []
    rows = []
    for k in blk:
        if L(k.tag) != "NumValues":
            continue
        vals = {}
        pv = None
        cur = None
        for x in k.iter():
            lt = L(x.tag)
            if lt == "nVarNumber":
                cur = x.text.strip()
            elif lt == "nVarValue" and cur is not None:
                vals[cur] = x.text.strip(); cur = None
            elif lt == "nPropValue":
                pv = x.text.strip()
        if pv is None or set(vals) != set(varcols):
            return None, None, ("a NumValues row does not carry every "
                                "declared variable plus the property"), []
        rows.append([vals[n] for n in sorted(varcols)] + [pv])
    cols = [varcols[n] for n in sorted(varcols)] + [(prop[0], prop[1])]
    return cols, rows, None, constraints


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xml", help="path (absolute, or relative to "
                               "data/local/thermoml/) to the article XML")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--block", type=int, default=None)
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    p = Path(a.xml)
    if not p.exists():
        p = ROOT / "data" / "local" / "thermoml" / a.xml
    if not p.exists():
        sys.exit(f"thermoml_extract: no such file: {a.xml}")

    cit, compounds, blocks = parse(p)
    if a.list or a.block is None:
        print(f"{p.name}: {len(blocks)} dataset block(s)"
              + (f"  [{cit['journal']} {cit['year']}"
                 + (f" doi:{cit['doi']}" if cit['doi'] else "") + "]"
                 if cit else ""))
        for i, blk in enumerate(blocks):
            cols, rows, why, cons = describe_block(blk, compounds)
            comps = sorted({compounds.get(text_of(k, "nOrgNum"), "")
                            for k in blk if L(k.tag) == "Component"} - {""})
            if why:
                print(f"  [{i}] UNEXTRACTABLE: {why}")
            else:
                print(f"  [{i}] {len(rows):4d} pts  "
                      + "  ".join(f"{c}[{u}]" for c, u in cols)
                      + "".join(f"   @{c}={v}{u}" for c, u, v in cons)
                      + ("   compounds: " + ", ".join(comps) if comps else ""))
        return

    if not (0 <= a.block < len(blocks)):
        sys.exit(f"thermoml_extract: block {a.block} out of range "
                 f"(0..{len(blocks)-1})")
    cols, rows, why, cons = describe_block(blocks[a.block], compounds)
    if why:
        sys.exit(f"thermoml_extract: block {a.block} is unextractable: {why}."
                 "  This tool embeds no physics and will not guess a "
                 "structure; pick another block (--list) or read the XML.")

    au = "; ".join(x.split("[")[0].strip() for x in (cit or {}).get("authors", [])[:6])
    lines = []
    lines.append("/" + "*" * 77 + "\\")
    lines.append("  Experimental dataset EXTRACTED from the ThermoML Archive mirror")
    lines.append(f"  ({p.relative_to(ROOT) if str(p).startswith(str(ROOT)) else p.name}, block {a.block}).")
    lines.append("")
    lines.append("  THE SOURCE TO CITE IS THE ARTICLE, never the archive or this file:")
    if cit:
        lines.append(f"      {au} ({cit['year']}).")
        lines.append(f"      {cit['title']}")
        lines.append(f"      {cit['journal']}"
                     + (f".  doi:{cit['doi']}" if cit['doi'] else ""))
    lines.append("")
    lines.append("  Data compiled by NIST/TRC from the article (doi:10.18434/mds2-2422);")
    lines.append("  values verbatim from the ThermoML file, column order var1..varN, property.")
    lines.append("  This file belongs in a CASE's constant/experiments/ (sample-specific,")
    lines.append("  axiom 4) -- it must never enter data/standards/.")
    lines.append("\\" + "*" * 77 + "/")
    lines.append("")
    for c, u, v in cons:
        lines.append(f"{c}    {v} {u};   // held constant (ThermoML Constraint)")
    if cons:
        lines.append("")
    lines.append("columns")
    lines.append("(")
    for c, u in cols:
        lines.append(f"    {{ name {c};  unit {u}; }}")
    lines.append(");")
    lines.append("")
    lines.append("data")
    lines.append("(")
    for r in rows:
        lines.append("    " + "  ".join(r))
    lines.append(");")
    out = "\n".join(lines) + "\n"
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(out)
        print(f"thermoml_extract: wrote {a.out} ({len(rows)} points, "
              f"{len(cols)} columns), citation attached")
    else:
        sys.stdout.write(out)


if __name__ == "__main__":
    main()
