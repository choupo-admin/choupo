#!/usr/bin/env python3
# Generate docs/tutorialsGuide-entries.tex -- the per-tutorial entries of the
# Tutorials Guide, ASSEMBLED from each case's OWN story (controlDict
# description + the author's leading header comment).  The dicts are the
# source of truth; this guide is a generated VIEW (a derivative is never
# hand-maintained -- regenerate with this script after adding cases).
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TUT = ROOT / "tutorials"

def latex_escape(t: str) -> str:
    t = t.replace("\\", "\\textbackslash{}")
    for a, b in [("&","\\&"),("%","\\%"),("$","\\$"),("#","\\#"),("_","\\_"),
                 ("{","\\{"),("}","\\}"),("~","\\textasciitilde{}"),("^","\\textasciicircum{}")]:
        t = t.replace(a, b)
    subs = {"°":"$^\\circ$","µ":"$\\mu$","±":"$\\pm$","→":"$\\to$","->":"$\\to$",
            "<=>":"$\\rightleftharpoons$","²":"$^2$","³":"$^3$","₂":"$_2$","₃":"$_3$",
            "≈":"$\\approx$","≤":"$\\le$","≥":"$\\ge$","×":"$\\times$","·":"$\\cdot$",
            "Δ":"$\\Delta$","δ":"$\\delta$","γ":"$\\gamma$","τ":"$\\tau$","φ":"$\\varphi$",
            "π":"$\\pi$","σ":"$\\sigma$","α":"$\\alpha$","β":"$\\beta$","ν":"$\\nu$",
            "λ":"$\\lambda$","Σ":"$\\Sigma$","∞":"$\\infty$","√":"$\\sqrt{}$","ₓ":"$_x$",
            "θ":"$\\theta$","ψ":"$\\psi$","ε":"$\\varepsilon$","η":"$\\eta$","Ḣ":"H",
            "−":"-","‐":"-","∂":"$\\partial$","ℓ":"$\\ell$","Å":"\\AA{}","⁰":"$^0$","¹":"$^1$",
            "½":"1/2","¼":"1/4","∙":"$\\cdot$","ᵢ":"$_i$","₀":"$_0$","₁":"$_1$","₅":"$_5$","₆":"$_6$",
            "Ȯ":"O","₄":"$_4$","‑":"-","–":"--","—":"---","’":"'","“":"``","”":"''",
            "ø":"o","Ø":"O","*":"$\\ast$"}
    for a, b in subs.items():
        t = t.replace(a, b)
    # box-drawing and any残 non-ASCII: strip to spaces (headers use them as art)
    t = "".join(ch if ord(ch) < 0x2500 or ord(ch) > 0x25FF else " " for ch in t)
    t = "".join(ch if ord(ch) < 128 or ch in "\\{}$^_" else "?" for ch in t)
    return t

def header_story(case: Path) -> str:
    """The author's leading block comment from the primary dict."""
    for f in ["system/propsDict", "system/flowsheetDict", "system/controlDict"]:
        p = case / f
        if not p.exists():
            continue
        s = p.read_text(errors="replace")
        m = re.match(r"\s*/\*-*\\?\**(.*?)\*/", s, re.S) or re.match(r"\s*/\*(.*?)\*/", s, re.S)
        if not m:
            continue
        body = m.group(1)
        lines = []
        for ln in body.splitlines():
            raw = ln
            ln = ln.strip().lstrip("\\*").rstrip("\\")
            if re.match(r"^[-=~_|┌│└├─．.]+$", ln.strip()):   # rules / box art
                lines.append("")                              # rule = paragraph break
                continue
            if re.match(r"^[A-Za-z0-9_]+\s*$", ln) and not any(l.strip() for l in lines):
                continue                                       # the bare case-name line
            lines.append(ln)
        # paragraphs: blank lines separate them; keep bullet-ish lines as items
        paras, cur = [], []
        for ln in lines:
            if not ln.strip():
                if cur: paras.append(" ".join(cur)); cur = []
            else:
                cur.append(ln.strip())
        if cur: paras.append(" ".join(cur))
        paras = [re.sub(r"\s+", " ", p).strip() for p in paras if len(p.strip()) > 2]
        clean = []
        for pp in paras:
            pp = re.sub(r"^flowsheetDict\s*[-=~:]*\s*", "", pp)
            pp = re.sub(r"^" + re.escape(case.name) + r"\s*[.:=-]*\s*", "", pp)
            if "topology (streams + units" in pp or len(pp) < 25:
                continue
            clean.append(pp)
        if clean and sum(len(p) for p in clean) > 60:
            return clean
    return []

def description(case: Path) -> str:
    p = case / "system/controlDict"
    if not p.exists():
        return ""
    m = re.search(r'^description\s+"(.*?)"\s*;', p.read_text(errors="replace"), re.M | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""

def readme_paras(case: Path):
    p = case / "README.md"
    if not p.exists():
        return []
    txt = p.read_text(errors="replace")
    txt = re.sub(r"^#.*$", "", txt, flags=re.M)          # headings out
    txt = re.sub(r"\|.*\|", "", txt)                     # tables out (golden table comes from expected)
    txt = re.sub(r"```.*?```", "", txt, flags=re.S)
    txt = txt.replace("**", "").replace("`", "")
    paras = [re.sub(r"\s+", " ", p).strip() for p in txt.split("\n\n")]
    return [p for p in paras if len(p) > 60][:6]

def expected_rows(case: Path):
    p = case / "expected"
    if not p.exists():
        return []
    rows = []
    for ln in p.read_text(errors="replace").splitlines():
        if ln.startswith("#") or not ln.strip():
            continue
        parts = ln.split()
        if len(parts) >= 4:
            rows.append((parts[0], parts[1], parts[2], parts[3]))
    return rows

STREAM_KEYS_IN  = ["in", "inputs", "charge", "feed", "hotIn", "coldIn", "gasIn", "liquidIn"]
STREAM_KEYS_OUT = ["out", "outputs", "outlet", "vapour", "liquid", "hotOut", "coldOut",
                   "gasOut", "liquidOut", "distillate", "bottoms", "permeate", "retentate",
                   "solids", "overflow", "underflow", "condensate"]

def parse_units(case: Path):
    """[(name, type, [in streams], [out streams])] from flowsheetDict (best effort)."""
    p = case / "system/flowsheetDict"
    if not p.exists():
        return []
    txt = re.sub(r"//.*", "", p.read_text(errors="replace"))
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    m = re.search(r"^units\s*\(", txt, re.M)
    if not m:
        return []
    # walk the balanced ( ... ) of the units list
    i = m.end() - 1
    depth = 0
    for j in range(i, len(txt)):
        if txt[j] == "(":
            depth += 1
        elif txt[j] == ")":
            depth -= 1
            if depth == 0:
                break
    block = txt[i+1:j]
    units = []
    # split top-level { ... } groups
    k = 0
    while True:
        a = block.find("{", k)
        if a < 0:
            break
        d = 0
        for b in range(a, len(block)):
            if block[b] == "{":
                d += 1
            elif block[b] == "}":
                d -= 1
                if d == 0:
                    break
        body = block[a+1:b]
        k = b + 1
        nm = re.search(r"\bname\s+(\S+?)\s*;", body)
        tp = re.search(r"\btype\s+(\S+?)\s*;", body)
        if not nm or not tp:
            continue
        ins, outs = [], []
        for key in STREAM_KEYS_IN:
            for mm in re.finditer(r"\b" + key + r"\s+(\S+?)\s*;", body):
                ins.append(mm.group(1))
            mm = re.search(r"\b" + key + r"\s*\(([^)]*)\)", body)
            if mm:
                ins += mm.group(1).split()
        for key in STREAM_KEYS_OUT:
            for mm in re.finditer(r"\b" + key + r"\s+(\S+?)\s*;", body):
                outs.append(mm.group(1))
            mm = re.search(r"\b" + key + r"\s*\(([^)]*)\)", body)
            if mm:
                outs += mm.group(1).split()
        units.append((nm.group(1), tp.group(1), list(dict.fromkeys(ins)), list(dict.fromkeys(outs))))
    return units

def tikz_flowsheet(units):
    """Block diagram: columns by topological depth from the feeds; forward
    edges labelled with the stream; recycles dashed underneath."""
    if not units:
        return ""
    producer = {}
    for nm, tp, ins, outs in units:
        for st in outs:
            producer[st] = nm
    # depth by longest-path BFS from units with only feed inputs
    depth = {nm: 0 for nm, *_ in units}
    for _ in range(len(units) + 1):
        for nm, tp, ins, outs in units:
            d = 0
            for st in ins:
                if st in producer and producer[st] != nm:
                    d = max(d, depth[producer[st]] + 1)
            depth[nm] = max(depth[nm], d)
    cols = {}
    for nm, *_ in units:
        cols.setdefault(depth[nm], []).append(nm)
    pos = {}
    for c, names in cols.items():
        for r, nm in enumerate(names):
            pos[nm] = (2.9 * c, -1.7 * r)
    tex = ["\\begin{tikzpicture}[>={Stealth[length=2mm]}, every node/.style={font=\\scriptsize}]"]
    for nm, tp, ins, outs in units:
        x, y = pos[nm]
        safe = nm.replace("_", "\\_")
        tex.append(f"  \\node[draw, rounded corners=2pt, align=center, minimum width=1.9cm,"
                   f" minimum height=0.85cm, fill=black!4] ({nm.replace('_','')}) at ({x:.1f},{y:.1f})"
                   f" {{\\textbf{{{safe}}}\\\\[-1pt]{{\\tiny {tp}}}}};")
    consumed = set()
    for nm, tp, ins, outs in units:
        node = nm.replace("_", "")
        ext_ins = [st for st in ins if st not in producer or producer[st] == nm]
        for st in ins:
            sts = st.replace("_", "\\_")
            if st in producer and producer[st] != nm:
                src = producer[st].replace("_", "")
                back = depth[producer[st]] >= depth[nm]
                consumed.add((producer[st], st))
                if back:
                    tex.append(f"  \\draw[->, dashed] ({src}.south) .. controls +(0,-1.0) and +(0,-1.0)"
                               f" .. ({node}.south) node[midway, below, font=\\tiny] {{{sts}}};")
                else:
                    tex.append(f"  \\draw[->] ({src}) -- ({node}) node[midway, above, font=\\tiny] {{{sts}}};")
            else:
                k = ext_ins.index(st); ni = len(ext_ins)
                dy = (k - (ni - 1) / 2.0) * 0.34
                tex.append(f"  \\draw[->] ($({node}.west)+(-1.05,{dy:.2f})$) -- ($({node}.west)+(0,{dy:.2f})$)"
                           f" node[at start, {'above' if dy >= 0 else 'below'}, font=\\tiny, anchor={'south' if dy >= 0 else 'north'} west] {{{sts}}};")
    for nm, tp, ins, outs in units:
        node = nm.replace("_", "")
        free = [st for st in outs if (nm, st) not in consumed]
        for k, st in enumerate(free):
            sts = st.replace("_", "\\_")
            dy = (k - (len(free) - 1) / 2.0) * 0.34
            tex.append(f"  \\draw[->] ($({node}.east)+(0,{dy:.2f})$) -- ($({node}.east)+(1.05,{dy:.2f})$)"
                       f" node[at end, {'above' if dy >= 0 else 'below'}, font=\\tiny, anchor={'south' if dy >= 0 else 'north'} east] {{{sts}}};")
    tex.append("\\end{tikzpicture}")
    return "\n".join(tex)

def props_ops(case: Path):
    p = case / "system/propsDict"
    if not p.exists():
        return []
    txt = re.sub(r"//.*", "", p.read_text(errors="replace"))
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    return re.findall(r"\bname\s+(\S+?)\s*;\s*type\s+(\S+?)\s*;", txt)

def tikz_props(ops):
    if not ops:
        return ""
    tex = ["\\begin{tikzpicture}[>={Stealth[length=2mm]}, every node/.style={font=\\scriptsize}]"]
    per_row = 3
    for i, (nm, tp) in enumerate(ops[:12]):
        x, y = 3.6 * (i % per_row), -1.3 * (i // per_row)
        safe = nm.replace("_", "\\_")
        tex.append(f"  \\node[draw, rounded corners=2pt, align=center, minimum width=3.1cm,"
                   f" minimum height=0.8cm, fill=black!4] at ({x:.1f},{y:.1f})"
                   f" {{\\textbf{{{safe}}}\\\\[-1pt]{{\\tiny {tp}}}}};")
    tex.append("\\end{tikzpicture}")
    return "\n".join(tex)

def application(case: Path) -> str:
    p = case / "system/controlDict"
    if not p.exists():
        return "?"
    m = re.search(r'^application\s+(\w+)\s*;', p.read_text(errors="replace"), re.M)
    return m.group(1) if m else "?"

CATS = ["steady", "props", "batch", "ctrl", "electrochem", "plant"]
CATTITLE = {
    "steady": "Steady-state flowsheets (choupoSolve)",
    "props":  "The property bench (choupoProps)",
    "batch":  "Batch and time-dependent (choupoBatch)",
    "ctrl":   "Dynamics and control (choupoCtrl)",
    "electrochem": "Electrochemical systems",
    "plant":  "Multi-sector plant showcases",
}

total = 0
for cat in CATS:
    d = TUT / cat
    if not d.is_dir():
        continue
    out = ["% GENERATED by bin/curate/gen_tutorials_guide.py -- DO NOT EDIT BY HAND.",
           "% Assembled from each case's controlDict description + header comment.", ""]
    groups = sorted(p for p in d.iterdir() if p.is_dir())
    for g in groups:
        cases = sorted(c for c in g.iterdir() if c.is_dir() and any(c.glob("*.cho")) or (c / "system").is_dir())
        cases = [c for c in cases if (c / "system").is_dir()]
        if not cases:
            if (g / "system").is_dir():
                cases = [g]
            else:
                continue
        if cases != [g]:
            out.append(f"\\subsection{{{latex_escape(g.name)}}}")
            out.append(f"\\grouptheory{{{g.name}}}")
        for c in cases:
            desc = description(c)
            paras = header_story(c)
            rel = c.relative_to(ROOT)
            out.append("\\clearpage")
            out.append(f"\\tutentry{{{latex_escape(c.name)}}}{{{latex_escape(str(rel))}}}")
            units = parse_units(c)
            fig = tikz_flowsheet(units) if units else tikz_props(props_ops(c)) and tikz_props(props_ops(c))
            if fig:
                out.append("\\begin{tutscheme}")
                out.append(fig)
                out.append("\\end{tutscheme}")
            if desc:
                out.append(f"\\tutwhat{{{latex_escape(desc)}}}")
            if paras:
                out.append("\\begin{tutnarrative}")
                for pp in paras:
                    if pp.lower() == desc.lower():
                        continue
                    out.append(latex_escape(pp) + "\n")
                out.append("\\end{tutnarrative}")
            for pp in readme_paras(c):
                out.append("\\tutreadme{" + latex_escape(pp) + "}")
            rows = expected_rows(c)
            if rows:
                out.append("\\begin{tutgolden}")
                shown = rows[:14]
                for kind, name, key, val in shown:
                    out.append(f"\\goldrow{{{latex_escape(kind)}}}{{{latex_escape(name)}}}{{{latex_escape(key)}}}{{{latex_escape(val)}}}")
                if len(rows) > 14:
                    out.append(f"\\goldmore{{{len(rows) - 14}}}")
                out.append("\\end{tutgolden}")
            out.append("")
            total += 1
    (ROOT / f"docs/tutorialsGuide-{cat}.tex").write_text("\n".join(out) + "\n")

print(f"entries: {total} tutorials across {len(CATS)} category files")
