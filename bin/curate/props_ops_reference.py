#!/usr/bin/env python3
"""Generate the propsGuide's OPERATIONS REFERENCE from the op schemas.

    bin/curate/props_ops_reference.py            # write docs/propsGuide-operations.tex
    bin/curate/props_ops_reference.py --check    # exit 1 if that file is stale

WHY THIS IS GENERATED AND NOT WRITTEN.  The propsGuide explained the
theory and the curation workflow and never said what you can actually ASK
the bench to compute: 20 of the 27 `propsDict` operation types appeared
nowhere in it, including the two most used (`speciate`, `propertyScan1D`).
The obvious repair is to write the reference -- and a hand-written
reference against 27 evolving schemas is the arity sin with a deadline:
it is right on the day it is written and wrong by the next slice.

So the schemas are the single source of truth (they already are, for the
GUI's form builder and for the LLM-facing docs), and this renders them.
A `runTests` gate refuses a stale render, exactly as the release
inventory's does for the corpus tally.

WHICH SCHEMAS ARE PROPS OPS.  The partition is DERIVED, never listed here:
`gui/schemas/operations/` holds both flowsheet unit ops and props ops, and
an op is a UNIT op precisely when the C++ factories register it
(`reg("name")` / `registerType("name")` in the three UnitOperation
registries).  Everything else is a props op.  A list in this file would be
a second home for a fact the code already states, and it would rot the
first time somebody added an operation.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ROOT / "gui" / "schemas" / "operations"
OUT = ROOT / "docs" / "propsGuide-operations.tex"

REGISTRIES = (
    "src/unitOperations/UnitOperation.cpp",
    "src/unitOperations/batch/BatchUnitOperation.cpp",
    "src/unitOperations/dynamic/DynamicUnitOperation.cpp",
)

#  Grouping is EDITORIAL -- it is how a reader looks for an operation, not
#  a fact about the code -- so it lives here.  An op in no group falls into
#  "Other", which is visible rather than silently dropped: a new operation
#  appears in the guide the day its schema does.
GROUPS = [
    ("Evaluating a state", (
        "propertyPoint", "explainProperty", "exergy", "propertyScan1D", "propertyScan2D",
        "propertyScanBinary", "propertyScanTernary", "purePhaseDiagram",
        "psychrometricChart", "steamTables")),
    ("Mixtures and activity", (
        "activityCoefficients", "gibbsMap", "vleConsistency",
        "hConsistency")),
    ("Electrolytes", (
        "speciate", "pitzerActivity", "electrolyteActivity",
        "enrtlMultiSalt", "enrtlMixedSolvent", "scalingScan", "exchange")),
    ("Fitting and estimating", (
        "fitParameters", "vaporPressureFit", "heatCapacityFit",
        "estimateComponent")),
    ("Benches", (
        "kinetics1D", "heatTransferBench", "isothermEval",
        "elementalComposition")),
]


#  The schema descriptions use Unicode math freely (a minus is U+2212 there,
#  not a hyphen), and pdflatex's utf8 inputenc has no text-mode glyph for
#  most of it.  On 2026-08-30 the U+2212 in enthalpyConcentration's
#  description made propsGuide.tex uncompilable -- and buildSite's
#  warn-and-continue then served the last committed PDF, stale behind its
#  own source, for three days with the suite green.  So the renderer owns
#  the mapping: every math character a schema is known to carry becomes its
#  LaTeX form here, applied AFTER the ASCII escaping (the replacements
#  introduce `$` and `\`, which must not be re-escaped).  A character not
#  in this table still breaks the PDF build loudly -- which is the correct
#  failure, now that buildSite refuses instead of warning.
MATH_CHARS = {
    "−": "$-$",       "±": "$\\pm$",    "×": "$\\times$",
    "·": "$\\cdot$",  "Δ": "$\\Delta$", "α": "$\\alpha$",
    "β": "$\\beta$",  "γ": "$\\gamma$", "η": "$\\eta$",
    "θ": "$\\theta$", "μ": "$\\mu$",    "φ": "$\\varphi$",
}


def tex_escape(s: str) -> str:
    """LaTeX-escape prose.  Backticked spans become \\code{...} first, since
    the schema descriptions use markdown backticks throughout."""
    parts = s.split("`")
    out = []
    for i, part in enumerate(parts):
        e = (part.replace("\\", "\\textbackslash{}")
                 .replace("&", "\\&").replace("%", "\\%")
                 .replace("$", "\\$").replace("#", "\\#")
                 .replace("_", "\\_").replace("{", "\\{")
                 .replace("}", "\\}").replace("~", "\\textasciitilde{}")
                 .replace("^", "\\textasciicircum{}"))
        for ch, tex in MATH_CHARS.items():
            e = e.replace(ch, tex)
        out.append("\\code{" + e + "}" if i % 2 else e)
    return "".join(out)


def unit_op_names() -> set:
    names = set()
    for rel in REGISTRIES:
        p = ROOT / rel
        if p.exists():
            names |= set(re.findall(
                r'reg(?:isterType)?\(\s*"([A-Za-z0-9]+)"', p.read_text()))
    return names


def props_ops() -> list:
    units = unit_op_names()
    return sorted(p.stem.replace(".schema", "")
                  for p in SCHEMAS.glob("*.schema.json")
                  if p.stem.replace(".schema", "") not in units)


def uses(op: str) -> list:
    """Tutorial cases whose propsDict declares this op type."""
    hits = []
    for f in sorted(ROOT.glob("tutorials/**/system/propsDict")):
        if re.search(r'^\s*type\s+%s\s*;' % re.escape(op), f.read_text(), re.M):
            hits.append(f.parents[1].relative_to(ROOT).as_posix())
    return hits


def render_params(schema: dict) -> str:
    props = schema.get("properties", {})
    if not props:
        return ""
    required = set(schema.get("required", []))
    rows = []
    for k, p in sorted(props.items()):
        title = p.get("title", "")
        unit = p.get("unit", "")
        if unit:
            title = f"{title} [{unit}]" if title else f"[{unit}]"
        mark = "\\textbf{*}" if k in required else ""
        rows.append("\\code{%s}%s & %s \\\\" %
                    (k.replace("_", "\\_"), mark, tex_escape(title)))
    if not rows:
        return ""
    return ("\\begin{tabular}{@{}p{0.30\\linewidth}p{0.62\\linewidth}@{}}\n"
            "\\hline\n" + "\n".join(rows) + "\n\\hline\n\\end{tabular}\n\n")


def render() -> str:
    ops = props_ops()
    grouped, seen = [], set()
    for title, members in GROUPS:
        here = [o for o in members if o in ops]
        seen |= set(here)
        if here:
            grouped.append((title, here))
    rest = [o for o in ops if o not in seen]
    if rest:
        grouped.append(("Other", rest))

    L = []
    L.append("%% GENERATED by bin/curate/props_ops_reference.py "
             "-- DO NOT EDIT BY HAND.")
    L.append("%% The op schemas in gui/schemas/operations/ are the source of "
             "truth; a runTests gate refuses a stale render.")
    L.append("\\section{Operations reference: what the bench can be "
             "asked}\\label{ch:props-ops}")
    L.append("")
    L.append("Everything \\code{choupoProps} does is one of the operations "
             "below, declared in \\file{system/propsDict}:")
    L.append("")
    L.append("\\begin{lstlisting}[language=dict]")
    L.append("operations")
    L.append("(")
    L.append("    {")
    L.append("        name   myFirstOp;        // yours; names the output")
    L.append("        type   propertyScan1D;   // one of the types below")
    L.append("        ...                      // the type's own keys")
    L.append("    }")
    L.append(");")
    L.append("\\end{lstlisting}")
    L.append("")
    L.append("Operations run in the order written, each independent of the "
             "others.  In the tables, \\textbf{*} marks a key the operation "
             "requires; everything else has a default or is optional.  Each "
             "entry names a runnable case, which is the fastest way to see "
             "the keys in a real dict.")
    L.append("")
    for title, members in grouped:
        L.append("\\subsection{%s}" % tex_escape(title))
        L.append("")
        for op in members:
            f = SCHEMAS / (op + ".schema.json")
            schema = json.loads(f.read_text())
            L.append("\\paragraph{\\code{%s}}" % op.replace("_", "\\_"))
            desc = schema.get("description", "").strip()
            if desc:
                L.append(tex_escape(desc))
            L.append("")
            tab = render_params(schema)
            if tab:
                L.append(tab)
            u = uses(op)
            if u:
                L.append("\\begin{tutoriallink}")
                L.append("\\file{%s}" % tex_escape(u[0]))
                if len(u) > 1:
                    L.append("\\quad (and %d more)" % (len(u) - 1))
                L.append("\\end{tutoriallink}")
            else:
                L.append("\\emph{No tutorial case declares this operation "
                         "yet.}")
            L.append("")
    return "\n".join(L) + "\n"


def main() -> int:
    text = render()
    if "--check" in sys.argv:
        if not OUT.exists():
            print("props_ops_reference: %s missing -- run "
                  "bin/curate/props_ops_reference.py" % OUT.name)
            return 1
        if OUT.read_text() != text:
            print("props_ops_reference: %s is STALE -- run "
                  "bin/curate/props_ops_reference.py" % OUT.name)
            return 1
        n = len(props_ops())
        print("props operations reference up to date (%d operations, "
              "rendered from the schemas)" % n)
        return 0
    OUT.write_text(text)
    print("wrote %s (%d operations)" % (OUT.relative_to(ROOT), len(props_ops())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
