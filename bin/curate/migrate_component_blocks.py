#!/usr/bin/env python3
# Convert a component .dat from the reference-state BLOCK layout to the
# catalogue's flat layout (the ONE component grammar).  Mechanical:
#   identity{k v;}        -> k v;                (top level)
#   critical{...}         -> flat
#   gasIdeal{Cp{...}}     -> idealGasHeatCapacity{...}
#   gasIdeal{Hf_298;S_298}-> standardThermochemistry{phase gas; Hf; S;}
#   liquidPure{Tb;HvapTb;Vliq;Cp{..};Psat{..}}
#                         -> flat + liquidHeatCapacity{} + vaporPressure{}
#   solid{Cp{...}}        -> solidHeatCapacity{}
#   transport{...}        -> flat
#   component{speciesMap{...}} -> dissociatesTo {...}
# Comments inside blocks ride along at top level.
import re, sys
from pathlib import Path

RENAME = {
    ("gasIdeal","Cp"): "idealGasHeatCapacity",
    ("liquidPure","Cp"): "liquidHeatCapacity",
    ("liquidPure","Psat"): "vaporPressure",
    ("solid","Cp"): "solidHeatCapacity",
}
BLOCKS = ("identity","critical","gasIdeal","liquidPure","solid","transport")

def find_block(s, name):
    m = re.search(r'(?m)^(' + name + r')\s*(//[^\n]*)?\n?\{', s)
    if not m: return None
    b = s.index('{', m.start()); depth = 0
    for j in range(b, len(s)):
        if s[j] == '{': depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0: return (m.start(), b, j + 1)
    raise SystemExit("unbalanced block " + name)

def dedent_entries(inner, blockname):
    out_lines = []
    i = 0
    lines = inner.split("\n")
    k = 0
    while k < len(lines):
        ln = lines[k]
        st = ln.strip()
        m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*(\{|\()', st)
        if m and st.split()[0] in ("Cp","Psat") or (m and m.group(1) in ("Cp","Psat")):
            key = m.group(1)
            newkey = RENAME.get((blockname, key), key)
            # collect the sub-block verbatim
            depth = 0; sub = []
            while k < len(lines):
                sub.append(lines[k])
                depth += lines[k].count('{') + lines[k].count('(')
                depth -= lines[k].count('}') + lines[k].count(')')
                k += 1
                if depth == 0 and len(sub) >= 1 and ('{' in "".join(sub) or '(' in "".join(sub)):
                    break
            body = "\n".join(sub)
            body = re.sub(r'^(\s*)' + key + r'\b', newkey, body.strip(), count=1)
            body = re.sub(r'(?m)^    ', '', body)
            out_lines.append(body)
            continue
        if st:
            out_lines.append(re.sub(r'^    ', '', ln))
        else:
            out_lines.append("")
        k += 1
    return "\n".join(out_lines).strip("\n")

def migrate(path):
    s = Path(path).read_text()
    orig = s
    # component{speciesMap{...}} -> dissociatesTo {...}
    m = re.search(r'(?m)^component\s*\n?\{\s*\n\s*speciesMap\s*(\{[^}]*\})\s*\n\}\n?', s)
    if m:
        s = s[:m.start()] + "dissociatesTo  " + " ".join(m.group(1).split()) \
            + "   // ion stoichiometry (formula-like identity)\n" + s[m.end():]
    for b in BLOCKS:
        loc = find_block(s, b)
        if not loc: continue
        start, bopen, end = loc
        header_comment = re.match(r'(?m)^' + b + r'\s*(//[^\n]*)?', s[start:]).group(1) or ""
        inner = s[bopen+1:end-1]
        flat = dedent_entries(inner, b)
        hdr = ("// ---- " + b + " " + header_comment.lstrip("/ ") + " ----\n") if header_comment else ""
        s = s[:start] + hdr + flat + "\n" + s[end:]
    if s != orig:
        Path(path).write_text(s)
        print("migrated:", path)
    else:
        print("unchanged:", path)

for p in sys.argv[1:]:
    migrate(p)
