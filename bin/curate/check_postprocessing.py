#!/usr/bin/env python3
"""Gate: the post-processing dictionary (`system/postProcessDict`) -- every declared
plot and table is produced, every number it writes is the number its source
published, and every name it cannot resolve is refused by name.

    bin/curate/check_postprocessing.py

WHY THIS EXISTS (2026-10-24, DEV.md 4c C147).  Vitor asked for "um dicionario
onde se pudessem pedir plots ... pertinentes para pos processamento", and for
the NanoFiltran paper "um caso unico ... com um pos-processamento para gerar os
plots adequados".  The engine now reads a case's system/postProcessDict
(src/postProcessing/postProcessDict/PostProcessDict.cpp), writes
postProcessing/postProcessDict/<name>.csv + <name>.json, and the GUI draws them --
computing nothing.  A plot is a CLAIM about published numbers, so this gate
holds the claim, on two witnesses: tutorials/props/membrane/nanofiltran_geraldesAlves2008
(the one case of the NanoFiltran paper; parts A, B, C) for every arm, and
polarisation01_geraldes_afonso_table1 (Geraldes & Afonso 2007; its `rows` table)
for arms (b) and (c).

THE ARMS.
  (a) THE REFERENCES ARE THEIR SOURCES'.  The case's constant/reference/ files
      equal what bin/curate/nanofiltran/export_case.py writes from paper.tsv,
      fig4_profiles.tsv, reference.tsv and the digitised Fig. 3 CSV (pure
      Python), and no other file sits there.
  (b) EVERY DECLARED ITEM IS PRODUCED, AND NOTHING ELSE.  Run in a copy, each
      plot and table the postProcessDict names has its CSV and its JSON sidecar, the
      result JSON's `postProcessing` block lists exactly those items in that
      order, and the sidecar equals the block's entry.
  (c) EVERY CELL IS ITS SOURCE'S.  This gate parses the postProcessDict ITSELF and
      recomputes every point of every series and every cell of every table
      from the source the dict names -- an operation's diagnostics in the
      result JSON, its `points` table from those diagnostics and its propsDict
      J_v, its `pore` table from the profile CSV the op writes, a reference
      file, a difference (a - b, or (a - b)/|b|) -- to 1e-12 relative (the
      CSV carries 12 significant figures).
  (d) THE TABLES MEET THE ANCHORS.  table2_N350's `corrected` row equals part
      C's four anchors (the potential in CODATA volts), codeToCode's NanoFiltran
      rows equal part A's 35 anchors, and every experiment cell of the Fig. 3
      tables gives back part B's anchor c_p = c_b (1 - R_obs): the tables a
      reader quotes are the numbers the golden holds.
  (e) THE REFUSALS FIRE BY NAME.  An unknown operation, diagnostic, table,
      table column, reference, reference column; a unit that disagrees with
      the one published; a key nothing reads; a difference of an undeclared
      series; a reference row whose select keeps no record; two items of one
      name; a reference outside constant/; a non-positive value on a log axis
      -- each refuses, exit non-zero, naming the culprit and what IS there.
  (f) A DERIVATIVE VIEW DOES NOT OUTLIVE ITS DECLARATION.  A stale file
      planted in postProcessing/postProcessDict/ is gone after a run (the view is
      regenerated whole), and the directory is removed when the case declares
      no postProcessDict.

WHAT THIS GATE DOES NOT CHECK, said plainly: that a plot is the RIGHT plot for
the paper (that is the case author's claim, read by a human); the GUI's drawing
(gui/tests/postProcessing.test.ts holds its parser to a real run's output); any
unit but by its spelling (the engine compares unit words, it does not convert);
the agreement of Choupo's interior pore profile with NanoFiltran's node by node
(the two grids differ; the faces are check_nanofiltran_paper's arm (c)).

BY-HAND SABOTAGES (2026-10-24), each restored and the engine rebuilt:
  S1  PostProcessDict.cpp's difference written b - a  -> FAILED (c) on every difference
      column and row (and the golden's post-processing csv rows).
  S2  the unknown-diagnostic refusal disarmed (the lookup then reads past the
      map)  -> FAILED (e) "unknown diagnostic" ACCEPTED, exit 0 -- and ONLY
      (e): the shipped postProcessDict names nothing unpublished, so no arm that
      reads the shipped dict could have seen it.  A refusal needs a probe.
  S3  the remove_all of postProcessing/postProcessDict dropped  -> FAILED (f).
  S4  one cell of constant/reference/nanofiltran_stiff.csv hand-edited
      -> FAILED (a), and (c) did NOT (it recomputes from the file as it
      stands) -- which is why (a) exists.
"""
import csv
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate" / "nanofiltran"))
import paper_case  # noqa: E402
import regenerate_paper as rp  # noqa: E402

PROPS = ROOT / "choupoProps"
CASE = paper_case.CASE
#  Every case that declares a postProcessDict is a witness of arms (b) and (c);
#  the NanoFiltran paper's case also of (a), (d), (e) and (f).
WITNESSES = [CASE, ROOT / "tutorials/props/membrane/polarisation01_geraldes_afonso_table1"]
TOL = 1e-12
fails = []


def run(case_dir):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(PROPS), str(case_dir)], capture_output=True, text=True,
                       timeout=1800, env=env)
    out = r.stdout + r.stderr
    res = None
    if "<<<Choupo:result-begin>>>" in out:
        res = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                            .split("<<<Choupo:result-end>>>")[0])
    return r.returncode, out, res


def copy_full(dst, src=CASE):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("postProcessing", "pore_*.csv"))
    return Path(dst)


# ---------------------------------------------------------------- a dict parser
#  The postProcessDict grammar is the dict grammar: words, "strings", { }, ( ), ;.  A
#  reader of its own, so this gate does not trust the engine's reading of it.
def tokens(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    out = []
    for line in text.splitlines():
        i, n = 0, len(line)
        while i < n:
            c = line[i]
            if line.startswith("//", i):
                break
            if c.isspace():
                i += 1
            elif c == '"':
                j = line.index('"', i + 1)
                out.append(("s", line[i + 1:j])); i = j + 1
            elif c in "{}();":
                out.append((c, c)); i += 1
            else:
                j = i
                while j < n and not line[j].isspace() and line[j] not in '{}();"':
                    j += 1
                out.append(("w", line[i:j])); i = j
    return out


def parse(toks, i=0, until="}"):
    d = {}
    while i < len(toks) and toks[i][0] != until:
        key = toks[i][1]; i += 1
        if toks[i][0] == "{":
            d[key], i = parse(toks, i + 1)
            i += 1
        elif toks[i][0] == "(":
            i += 1
            if toks[i][0] == "{":
                lst = []
                while toks[i][0] == "{":
                    sub, i = parse(toks, i + 1)
                    lst.append(sub); i += 1
                d[key] = lst
            else:
                lst = []
                while toks[i][0] != ")":
                    lst.append(toks[i][1]); i += 1
                d[key] = lst
            i += 1                      # )
            if i < len(toks) and toks[i][0] == ";":
                i += 1
        else:
            #  a value is its first token; a unit after it (`T 298 K;`) is skipped
            d[key] = toks[i][1]
            while toks[i][0] != ";":
                i += 1
            i += 1
    return d, i


def read_dict(path):
    d, _ = parse(tokens(Path(path).read_text()))
    return d


# ---------------------------------------------------------------- sources
def num(s):
    try:
        v = float(s)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def read_csv_rows(path):
    lines = [l for l in Path(path).read_text().splitlines() if l and not l.startswith("#")]
    return list(csv.DictReader(io.StringIO("\n".join(lines))))


def matches(sel, row):
    for k, v in (sel or {}).items():
        a, b = num(row.get(k)), num(v)
        if b is not None:
            if a is None or abs(a - b) > 1e-12 * max(1.0, abs(b)):
                return False
        elif row.get(k) != v:
            return False
    return True


class Sources:
    def __init__(self, case_dir, res, plotdict):
        self.dir = Path(case_dir)
        self.diag = {o["name"]: o.get("diagnostics", {}) for o in res["operationResults"]}
        self.refs = {r["name"]: r for r in plotdict.get("references", [])}
        props = read_dict(self.dir / "system" / "propsDict")
        self.ops = {o["name"]: o for o in props["operations"]}

    def ref_rows(self, name):
        return read_csv_rows(self.dir / self.refs[name]["file"])

    def _charge(self, ion):
        txt = (self.dir / "constant" / "species" / (ion + ".dat")).read_text()
        return float(re.search(r"^charge\s+([-+]?\d+);", txt, re.M).group(1))

    def op_table(self, op, table):
        """The op's published table, rebuilt from what else the run published."""
        if table == "pore":
            prof = self.ops[op].get("profile")
            if not prof:
                raise KeyError("op %s writes no profile CSV to hold its pore table by" % op)
            return [{k: float(v) for k, v in r.items()} for r in read_csv_rows(self.dir / prof)]
        if table == "points":
            jv = [float(x) for x in self.ops[op]["J_v"]]
            rows = []
            for p, j in enumerate(jv, 1):
                r = {"point": float(p), "Jv_mps": j}
                for k, v in self.diag[op].items():
                    m = re.fullmatch(r"(.+)_p%d" % p, k)
                    if m:
                        base = m.group(1)
                        if base.startswith(("c_bulk_", "c_wall_", "c_perm_")):
                            base += "_molm3"
                        r[base] = v
                rows.append(r)
            return rows
        if table == "rows":
            #  polarisationIndex: the measured rows from the op's own dataset,
            #  the closeBy ion by electroneutrality, the wall from Gamma.
            o = self.ops[op]
            dsp = self.dir / o["dataset"]
            ds = read_dict(dsp if dsp.is_file() else dsp.with_name(dsp.name + ".dat"))
            cols = [c["name"] for c in ds["columns"]]
            flat = [float(v) for v in ds["data"]]
            ions, close_by = o["ions"], o.get("closeBy")
            d = self.diag[op]
            rows = []
            for r in range(len(flat) // len(cols)):
                v = dict(zip(cols, flat[r * len(cols):(r + 1) * len(cols)]))
                cb = {i: v.get("C_b_" + i) for i in ions}
                cp = {i: v.get("C_p_" + i) for i in ions}
                if close_by:
                    z = self._charge(close_by)
                    cb[close_by] = -sum(self._charge(i) * cb[i] for i in ions if i != close_by) / z
                    cp[close_by] = -sum(self._charge(i) * cp[i] for i in ions if i != close_by) / z
                row = {"row": float(r + 1), "J_v_mps": v["J_v"], "xi_Vpm": d["xi_r%d" % (r + 1)]}
                for i in ions:
                    g = d["Gamma_%s_r%d" % (i, r + 1)]
                    cm = cb[i] * (1.0 + g)
                    row.update({"C_b_%s_molm3" % i: cb[i], "C_p_%s_molm3" % i: cp[i],
                                "C_m_%s_molm3" % i: cm, "Gamma_" + i: g,
                                "k_%s_mps" % i: d["k_" + i],
                                "Robs_" + i: 1.0 - cp[i] / cb[i], "Rreal_" + i: 1.0 - cp[i] / cm})
                rows.append(row)
            return rows
        raise KeyError("no rule to rebuild table %s" % table)

    def series(self, s, earlier):
        """[(x, y)] of a series as the dict declares it."""
        if "ops" in s:
            return [(self.diag[o][s["x"]], self.diag[o][s["y"]], TOL * abs(self.diag[o][s["y"]]))
                    for o in s["ops"]]
        if "op" in s:
            rows = [r for r in self.op_table(s["op"], s["table"]) if matches(s.get("select"), r)]
            #  a column REBUILT here from 12-figure diagnostics carries their
            #  rounding: 1e-11 absolute beside the relative bound
            return [(r[s["x"]], r[s["y"]], TOL * abs(r[s["y"]]) + 1e-11) for r in rows]
        if "reference" in s:
            pts = []
            for r in self.ref_rows(s["reference"]):
                if matches(s.get("select"), r):
                    x, y = num(r[s["x"]]), num(r[s["y"]])
                    if x is not None and y is not None:
                        pts.append((x, y, TOL * abs(y)))
            return pts
        a, b = (earlier[n] for n in s["difference"])
        rel = s.get("relative") == "yes"
        out = []
        for xa, ya, _ in a:
            for xb, yb, _ in b:
                if abs(xa - xb) <= 1e-12 * max(1.0, abs(xb)):
                    #  a difference of two 12-figure numbers carries their
                    #  rounding, not its own: the bound is the operands'.
                    e = 2 * TOL * (abs(ya) + abs(yb)) / (abs(yb) if rel else 1.0)
                    out.append((xa, (ya - yb) / abs(yb) if rel else ya - yb, e))
                    break
        return out


def close(a, b):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= TOL * max(abs(a), abs(b), 1e-300) or abs(a - b) < 1e-300


def within(a, b, err):
    """a (as written, 12 figures) is b to within err plus its own rounding."""
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= err + TOL * abs(a) + 1e-300


# ---------------------------------------------------------------- (a)
def arm_a():
    r = subprocess.run([sys.executable, str(ROOT / "bin/curate/nanofiltran/export_case.py"),
                        "--check"], capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(a) " + (r.stdout + r.stderr).strip())
    return r.returncode == 0


# ---------------------------------------------------------------- (b), (c), (d)
def arm_bcd(tmp, witness=CASE):
    case = copy_full(tmp / witness.name, witness)
    rc, out, res = run(case)
    if rc != 0 or res is None:
        fails.append("(b) the case did not run (exit %d):\n%s" % (rc, out[-1500:]))
        return None
    pdict = read_dict(witness / "system" / "postProcessDict")
    declared = [p["name"] for p in pdict.get("plots", [])] + [t["name"] for t in pdict.get("tables", [])]
    block = res.get("postProcessing")
    if not block:
        fails.append("(b) the result JSON carries no postProcessing block")
        return None
    listed = [it["name"] for it in block["items"]]
    if listed != declared:
        fails.append("(b) the block lists %s, the postProcessDict declares %s" % (listed, declared))
    outdir = case / "postProcessing" / "postProcessDict"
    files = sorted(p.name for p in outdir.iterdir())
    want = sorted([n + ".csv" for n in declared] + [n + ".json" for n in declared])
    if files != want:
        fails.append("(b) postProcessing/postProcessDict holds %s, the postProcessDict declares %s" % (files, want))
    for it in block["items"]:
        side = outdir / (it["name"] + ".json")
        if side.is_file() and json.loads(side.read_text()) != it:
            fails.append("(b) %s.json is not the result block's entry" % it["name"])

    src = Sources(case, res, pdict)
    ncells = 0
    for p in pdict.get("plots", []):
        got = {}
        for r in read_csv_rows(outdir / (p["name"] + ".csv")):
            got.setdefault(r["series"], []).append((num(r["x"]), num(r["y"])))
        done = {}
        for s in p["series"]:
            want_pts = src.series(s, done)
            done[s["name"]] = want_pts
            have = got.get(s["name"], [])
            if len(have) != len(want_pts):
                fails.append("(c) plot %s series %s: %d points written, %d published"
                             % (p["name"], s["name"], len(have), len(want_pts)))
                continue
            for (xa, ya), (xb, yb, eb) in zip(have, want_pts):
                ncells += 2
                if not (close(xa, xb) and within(ya, yb, eb)):
                    fails.append("(c) plot %s series %s: (%r, %r) written, (%r, %r) published"
                                 % (p["name"], s["name"], xa, ya, xb, yb))
                    break
    tables = {}
    for t in pdict.get("tables", []):
        rows = read_csv_rows(outdir / (t["name"] + ".csv"))
        tables[t["name"]] = rows
        if "x" in t:                          # a series table
            done = {}
            for s in t["columns"]:
                pts = src.series(s, done)
                done[s["name"]] = pts
                for x, y, e in pts:
                    row = next((r for r in rows if close(num(r["x"]), x)), None)
                    ncells += 1
                    if row is None or not within(num(row[s["name"]]), y, e):
                        fails.append("(c) table %s column %s at x = %r: %r written, %r published"
                                     % (t["name"], s["name"], x, row and row[s["name"]], y))
                        break
                xs = {round(x, 9) for x, _, _ in pts}
                for r in rows:
                    if round(num(r["x"]), 9) not in xs and r[s["name"]] != "":
                        fails.append("(c) table %s column %s has a value at x = %s that its"
                                     " source does not publish" % (t["name"], s["name"], r["x"]))
        else:                                 # a rows table
            vals, errs = {}, {}
            cols = [c["name"] for c in t["columns"]]
            for w in t["rows"]:
                if "difference" in w:
                    a, b = (vals[n] for n in w["difference"])
                    rel = w.get("relative") == "yes"
                    v = {c: (None if a[c] is None or b[c] is None else
                             ((a[c] - b[c]) / abs(b[c]) if rel else a[c] - b[c])) for c in cols}
                    er = {c: (0.0 if v[c] is None else
                              2 * TOL * (abs(a[c]) + abs(b[c])) / (abs(b[c]) if rel else 1.0))
                          for c in cols}
                elif "op" in w:
                    v = {c: (src.diag[w["op"]][w["cells"][c]] if c in w["cells"] else None)
                         for c in cols}
                else:
                    hit = [r for r in src.ref_rows(w["reference"]) if matches(w["select"], r)]
                    v = {c: (num(hit[0][w["cells"][c]]) if c in w["cells"] else None) for c in cols}
                if "difference" not in w:
                    er = {c: (0.0 if v[c] is None else TOL * abs(v[c])) for c in cols}
                vals[w["name"]] = v
                row = next((r for r in rows if r["row"] == w["name"]), None)
                for c in cols:
                    ncells += 1
                    if row is None or not within(num(row[c]), v[c], er[c]):
                        fails.append("(c) table %s row %s column %s: %r written, %r published"
                                     % (t["name"], w["name"], c, row and row[c], v[c]))

    if witness != CASE:
        return len(declared), ncells, 0

    # (d) the tables a reader quotes are the golden's anchors
    anc = {}
    for line in (CASE / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 6 and f[0] == "diag" and f[5] == "anchor":
            anc[(f[1], f[2])] = float(f[3])
    nanch = 0
    t2 = {r["row"]: r for r in tables.get("table2_N350", [])}
    for col, key in (("Na", "c_perm_Na_p1"), ("Mg", "c_perm_Mg_p1"), ("Cl", "c_perm_Cl_p1"),
                     ("dPsiCodata", "dPsi_m_V_p1")):
        nanch += 1
        a = anc.get(("N350", key))
        if a is None or "corrected" not in t2 or abs(float(t2["corrected"][col]) - a) > 1e-11 * abs(a):
            fails.append("(d) table2_N350's corrected %s is not part C's anchor %s" % (col, a))
    cc = {r["row"]: r for r in tables.get("codeToCode", [])}
    for (op, key), a in anc.items():
        m = re.fullmatch(r"c_perm_(\w+?)_p(\d+)", key)
        if paper_case.part_of(op) != "A" or not m:
            continue
        nanch += 1
        r = cc.get("nf_%s_p%s" % (op, m.group(2)))
        if r is None or num(r[m.group(1)]) is None or abs(num(r[m.group(1)]) - a) > 1e-11 * abs(a):
            fails.append("(d) codeToCode's NanoFiltran %s %s is not part A's anchor %r" % (op, key, a))
    for dye in (4, 37):
        for r in tables.get("fig3_dye%d_table" % dye, []):
            cl = float(r["x"])
            op = next((o for o in src.ops if paper_case.part_of(o) == "B" and o.startswith("dye%d_" % dye)
                       and abs(src.diag[o]["c_bulk_Cl_p1"] - cl) < 1e-9), None)
            for ion in ("Na", "Cl"):
                cb = cl + 3.0 * dye if ion == "Na" else cl
                a = anc.get((op, "c_perm_%s_p1" % ion))
                nanch += 1
                if a is None or abs(cb * (1.0 - float(r["exp" + ion])) - a) > 1e-9 * abs(a):
                    fails.append("(d) fig3_dye%d_table's experiment %s at c_Cl %s does not give"
                                 " back part B's anchor %r" % (dye, ion, r["x"], a))
    return len(declared), ncells, nanch


# ---------------------------------------------------------------- (e)
def arm_e(tmp):
    base = (CASE / "system" / "postProcessDict").read_text()
    sub = lambda old, new, count=1: (lambda t: t.replace(old, new, count))   # noqa: E731
    probes = [
        ("unknown operation", sub("ops ( N10 N20", "ops ( N10x N20"),
         ["operation 'N10x' is not an operation of this case's propsDict", "Operations:"]),
        ("unknown diagnostic", sub("y c_perm_Na_p1; style linesMarkers;", "y c_perm_Xx_p1; style linesMarkers;"),
         ["publishes no diagnostic 'c_perm_Xx_p1'", "Its diagnostics:", "c_perm_Na_p1"]),
        ("unknown table", sub("op N350; table pore; x x_um; y psi_V;", "op N350; table pores; x x_um; y psi_V;"),
         ["publishes no table 'pores'", "Its tables: points, pore"]),
        ("unknown table column", sub("op N350; table pore; x x_um; y psi_V;", "op N350; table pore; x x_um; y phi_V;"),
         ["has no column 'phi_V'", "Columns: point, Jv_mps"]),
        ("unknown reference", sub("reference nfFig4; select { variant corrected; }  x x_um; y psi_V;",
                                  "reference nfFig5; select { variant corrected; }  x x_um; y psi_V;"),
         ["reference 'nfFig5' is not declared", "References: nfTable2"]),
        ("unknown reference column", sub("x N; y iterations; style linesMarkers;", "x N; y iters; style linesMarkers;"),
         ["has no column 'iters'", "Columns: N, variant"]),
        ("unit mismatch", sub('yAxis   { label "potential psi (psi_m = 0 at the feed-side wall)"; unit "V";',
                              'yAxis   { label "potential psi (psi_m = 0 at the feed-side wall)"; unit "mV";'),
         ["is published in 'V' and declared in 'mV'"]),
        ("unread key", sub("style lines; }", "style lines; colour red; }"),
         ["keys nothing reads", "`colour`"]),
        ("undeclared difference", sub("difference ( choupoNa daviesNa );", "difference ( choupoNa davidNa );"),
         ["'davidNa' is not a series declared BEFORE it", "Series: paperNa"]),
        ("select keeping nothing", sub("select { stage paper; }", "select { stage papyrus; }"),
         ["keeps 0 record(s) of reference 'nfStiff'"]),
        ("two items one name", sub("name    fig4_potential;", "name    fig4_concentration;"),
         ["the name 'fig4_concentration' is taken by another plot or table"]),
        ("reference outside constant", sub('file      "constant/reference/nanofiltran_fig4.csv";',
                                           'file      "../nanofiltran_fig4.csv";'),
         ["a reference lives under the case's constant/"]),
        ("negative on a log axis", sub('yAxis   { label "concentration in the pore"; unit "mol/m3"; scale log; }',
                                      'yAxis   { label "concentration in the pore"; unit "mol/m3"; scale log; }', 1),
         None),   # placeholder, replaced below
    ]
    #  the log-axis probe: the potential plot (psi < 0 at the feed face) on a log axis
    probes[-1] = ("non-positive on a log axis",
                  sub('unit "V"; scale linear; }', 'unit "V"; scale log; }'),
                  ["on a log axis"])
    fired = 0
    for tag, edit, needles in probes:
        case = copy_full(tmp / ("refuse_" + re.sub(r"\W+", "_", tag)))
        text = edit(base)
        if text == base:
            fails.append("(e) the probe `%s` could not be built (its anchor text moved)" % tag)
            continue
        (case / "system" / "postProcessDict").write_text(text)
        rc, out, _ = run(case)
        if rc == 0:
            fails.append("(e) `%s` was ACCEPTED (exit 0)" % tag)
            continue
        miss = [n for n in needles if n not in out]
        if miss:
            fails.append("(e) `%s` exited %d without naming %s:\n%s" % (tag, rc, miss, out[-600:]))
            continue
        fired += 1
    return fired


# ---------------------------------------------------------------- (f)
def arm_f(tmp):
    case = copy_full(tmp / "stale")
    stale = case / "postProcessing" / "postProcessDict" / "old_plot.csv"
    stale.parent.mkdir(parents=True)
    stale.write_text("series,x,y,yError\nold,1,2,\n")
    rc, out, _ = run(case)
    if rc != 0:
        fails.append("(f) the stale-file copy did not run (exit %d)" % rc)
    elif stale.exists():
        fails.append("(f) a stale postProcessing/postProcessDict/old_plot.csv survived the run")
    (case / "system" / "postProcessDict").unlink()
    rc, out, res = run(case)
    if rc != 0:
        fails.append("(f) the copy without a postProcessDict did not run (exit %d)" % rc)
    elif (case / "postProcessing" / "postProcessDict").exists():
        fails.append("(f) postProcessing/postProcessDict/ outlived the postProcessDict that declared it")
    elif res is not None and "postProcessing" in res:
        fails.append("(f) a run with no postProcessDict still emits a postProcessing block")


def main():
    if not PROPS.exists():
        print("check_postprocessing: FAILED -- no choupoProps binary (build first)")
        return 1
    arm_a()
    with tempfile.TemporaryDirectory(prefix="postprocessing_") as d:
        tmp = Path(d)
        bcd = arm_bcd(tmp)
        other = [arm_bcd(tmp, w) for w in WITNESSES[1:]]
        fired = arm_e(tmp)
        arm_f(tmp)
    if fails:
        print("check_postprocessing: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    nitems, ncells, nanch = bcd
    if any(o is None for o in other):
        print("check_postprocessing: FAILED")
        return 1
    nitems2 = sum(o[0] for o in other)
    ncells += sum(o[1] for o in other)
    print("check_postprocessing: OK -- the paper case's %d reference files are their sources'"
          " export; %d postProcessDict items over %d witness cases are produced (CSV + sidecar ="
          " the result block, nothing else in postProcessing/postProcessDict/); %d written"
          " numbers recomputed by this gate's own reading of each postProcessDict from the"
          " run's diagnostics, the ops' published tables (rebuilt from what else the run"
          " publishes), the reference files and the differences, to %g; the paper's tables"
          " meet %d anchors of its golden; %d refusals fire by name; a stale file and an"
          " undeclared view are removed.  NOT CHECKED: that a plot is the right one for the"
          " paper, the GUI's drawing (its own tests), units beyond their spelling, the"
          " interior pore profile node by node, the op-table columns no witness draws."
          % (6, nitems + nitems2, len(WITNESSES), ncells, TOL, nanch, fired))
    return 0


if __name__ == "__main__":
    sys.exit(main())
