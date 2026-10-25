#!/usr/bin/env python3
"""Gate: a props case's VIEWS -- the figures and tables every operation publishes
by default, and the ones its propsDict declares in `views ( ... )` -- are all
produced, every number they write is the number its source published, and every
name they cannot resolve is refused by name.

    bin/curate/check_postprocessing.py

WHY THIS EXISTS (2026-10-24, DEV.md 4c C147, C149).  Vitor asked for the
NanoFiltran paper "um caso unico ... com um pos-processamento para gerar os
plots adequados", and then decided where it lives: IN the propsDict, beside
the operations it draws, with every operation publishing its DEFAULT views
with nothing declared (a fit its parity, residuals and parameter table; a
bench its model curves over its data) and a case adding the ones its paper
needs.  The engine (src/postProcessing/views/Views.cpp) writes
postProcessing/<op>/<view>.csv + <view>.json (postProcessing/case/ for a view
across operations), lists them in postProcessing/views.index, and the GUI's
review screen draws them -- computing nothing.  A view is a CLAIM about
published numbers, so this gate holds the claim, on three witnesses:
tutorials/props/membrane/nanofiltran_geraldesAlves2008 (the one case of the
paper; parts A, B, C; declared views and bench defaults) for every arm,
polarisation01_geraldes_afonso_table1 (Geraldes & Afonso 2007; a dataset
op's defaults and declared views on its `rows` table) and
tutorials/props/adsorption/isotherm02_fit_jaschik (four isotherm fits: the
generic fit defaults) for arms (b), (c) and, the fit, (g).

THE ARMS.
  (a) THE REFERENCES ARE THEIR SOURCES'.  The paper case's constant/reference/
      files equal what bin/curate/nanofiltran/export_case.py writes from
      paper.tsv, fig4_profiles.tsv, reference.tsv and the digitised Fig. 3
      CSV (pure Python), and no other file sits there.
  (b) EVERY VIEW IS PRODUCED, AND NOTHING ELSE.  Run in a copy, the result
      JSON's `postProcessing` block lists each operation's defaults (their
      declarations carried on the block, `defaults`) and then the propsDict's
      declared views, a declared view of a default's name in the same folder
      replacing it; each has its CSV and its JSON sidecar in its folder (the
      op it draws, or case/), the sidecar equals the block's entry, the
      index lists exactly those files, and postProcessing/ holds nothing else.
  (c) EVERY CELL IS ITS SOURCE'S.  This gate parses every view ITSELF -- the
      declared ones from the propsDict, the defaults from the declarations
      the block carries -- and recomputes every point of every series and
      every cell of every table from the source it names: an operation's
      diagnostics in the result JSON, its published tables rebuilt from what
      else the run publishes (`points` from those diagnostics and its J_v,
      `pore` from the profile CSV the op writes, `rows` from its dataset and
      its Gamma, `fitPoints` from its dataset), a reference file, a
      difference (a - b, or (a - b)/|b|) -- to the CSV's 12 significant
      figures (half a unit in the 12th: 5e-12 relative).
  (d) THE TABLES MEET THE ANCHORS.  table2_N350's `corrected` row equals part
      C's four anchors (the potential in CODATA volts), codeToCode's NanoFiltran
      rows equal part A's 35 anchors, and every experiment cell of the Fig. 3
      tables gives back part B's anchor c_p = c_b (1 - R_obs): the tables a
      reader quotes are the numbers the golden holds.
  (e) THE REFUSALS FIRE BY NAME.  An unknown operation, diagnostic, table,
      table column, reference, reference column, view type; a unit that
      disagrees with the one published; a key nothing reads; a difference of
      an undeclared series; a reference row whose select keeps no record; two
      views of one name in one folder; a reference outside constant/; a
      non-positive value on a log axis -- each refuses, exit non-zero, naming
      the culprit and what IS there.  Since DEV.md 4c C154 also an empty view
      `note`, and four `studies` declarations: a purpose off the closed list
      (`validated` among them -- a purpose is never a verdict), a study naming
      an operation the propsDict does not declare, one operation in two
      studies, and a key nothing reads; (b) holds every declared note to the
      one the result block publishes.
  (f) A VIEW DOES NOT OUTLIVE ITS DECLARATION.  A stale file the last run's
      index lists is gone after a run, a file the index does not list (the
      author's own) is left alone, a declared view of a default's name
      replaces it and says so, and a copy with its `views` taken out keeps
      only the defaults -- postProcessing/case/ is gone with what declared it.
  (g) A FIT'S DEFAULTS ARE ITS FIT.  On every fit of the isotherm witness,
      the parity's model points, the residuals and the isotherm's model lines
      are one table (`fitPoints`) -- residual = model - measured, point by
      point -- and the root mean square of its residuals is the op's own
      published `rms`: the model column the gate cannot recompute without
      re-implementing the fit is tied to a number the op published by itself.

WHAT THIS GATE DOES NOT CHECK, said plainly: that a view is the RIGHT view for
the paper (the case author's claim, read by a human); the GUI's drawing (its own
tests hold its parser to a real run); any unit but by its spelling (the engine
compares unit words, it does not convert); a fit's model value point by point
(arm (g) ties it to the op's rms, and the fit's own gates hold the fit); the
bubble-point fits' defaults (exercised by the corpus run of every fit case, not
recomputed here); the interior pore profile against NanoFiltran's node by node
(the two grids differ; the faces are check_nanofiltran_paper's arm (c)).

BY-HAND SABOTAGES (2026-10-24, on the views engine), each restored and the
engine rebuilt:
  S1  Views.cpp's difference written b - a  -> FAILED (c) on every difference
      column and row.
  S2  a declared view of a default's name no longer replaces it  -> FAILED (f)
      only: no witness ships such a declaration, so only the probe sees it.
  S3  clearStale's remove dropped  -> FAILED (f).
  S4  FitParameters' fitPoints residual written measured - model  -> FAILED (c)
      and (g); no golden pins a residual, so nothing else could see it.
  S5  the settled home of a view drawing one op dropped (its files land in
      case/)  -> FAILED (b) on polarisation01, whose declared views name their
      op per series.
  S6  the unknown-type refusal disarmed  -> FAILED (e) only.
  An earlier engine (the separate dictionary of the first C147 cut) was held by
  the same arms (a), (c), (d), (e) and its four sabotages are in the design
  record.
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
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import paper_case  # noqa: E402
from props_views import strip_views  # noqa: E402

PROPS = ROOT / "choupoProps"
CASE = paper_case.CASE
POL = ROOT / "tutorials/props/membrane/polarisation01_geraldes_afonso_table1"
ISO = ROOT / "tutorials/props/adsorption/isotherm02_fit_jaschik"
WITNESSES = [CASE, POL, ISO]
TOL = 1e-12
#  a number written to 12 significant figures is its value to half a unit in
#  the 12th figure: 5e-12 relative at most
ROUND = 5e-12
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
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("postProcessing", "pore_*.csv",
                                                            "expected"))
    return Path(dst)


# ---------------------------------------------------------------- a dict parser
#  The views grammar is the dict grammar: words, "strings", { }, ( ), ;.  A
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


def parse_text(text):
    d, _ = parse(tokens(text))
    return d


# ---------------------------------------------------------------- the views
def series_of(v):
    """The series (or series-table columns) of a view, as the engine expands them:
    the shorthand `x; y ( ... )` one per y, then `series`/`columns`, then `overlay`."""
    out = []
    if "y" in v:
        ys = v["y"] if isinstance(v["y"], list) else [v["y"]]
        for y in ys:
            s = {"name": y, "x": v["x"], "y": y}
            if "ops" in v:
                s["ops"] = v["ops"]
            else:
                s["op"], s["table"] = v["op"], v["table"]
                if "select" in v:
                    s["select"] = v["select"]
            out.append(s)
    out += v.get("series", []) + v.get("columns", []) + v.get("overlay", [])
    return out


def home_of(v, default_home=""):
    """The folder of a view: its top-level `op`; else (a default) the op that
    published it; else the one op every series or row draws from, alone."""
    if "op" in v:
        return v["op"]
    if default_home:
        return default_home
    ops, other = set(), False
    for s in (series_of(v) if v.get("type") != "table" or "x" in v else []):
        if "op" in s:
            ops.add(s["op"])
        elif "ops" in s and len(s["ops"]) == 1:
            ops.add(s["ops"][0])
        elif "difference" in s:
            continue
        else:
            other = True
    for r in v.get("rows", []):
        if "op" in r:
            ops.add(r["op"])
        elif "difference" in r:
            continue
        else:
            other = True
    return ops.pop() if len(ops) == 1 and not other else ""


def views_of(case_dir, res):
    """[(home, view dict, origin)] in the engine's order, and the references."""
    props = read_dict(case_dir / "system" / "propsDict")
    declared = [(home_of(v), v, "declared") for v in props.get("views", [])]
    taken = {(h, v["name"]) for h, v, _ in declared}
    defaults = []
    for d in res["postProcessing"].get("defaults", []):
        for v in parse_text("views ( " + d["declaration"] + " );")["views"]:
            h = home_of(v, d["op"])
            if (h, v["name"]) not in taken:
                defaults.append((h, v, "default"))
    return defaults + declared, props.get("references", [])


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


PRESSURE = {"Pa": 1.0, "kPa": 1e3, "bar": 1e5, "MPa": 1e6, "atm": 101325.0}


class Sources:
    def __init__(self, case_dir, res, refs):
        self.dir = Path(case_dir)
        self.diag = {o["name"]: o.get("diagnostics", {}) for o in res["operationResults"]}
        self.refs = {r["name"]: r for r in refs}
        props = read_dict(self.dir / "system" / "propsDict")
        self.ops = {o["name"]: o for o in props["operations"]}
        self.items = {(it["op"], it["name"]): it for it in res["postProcessing"]["items"]}

    def ref_rows(self, name):
        return read_csv_rows(self.dir / self.refs[name]["file"])

    def _charge(self, ion):
        txt = (self.dir / "constant" / "species" / (ion + ".dat")).read_text()
        return float(re.search(r"^charge\s+([-+]?\d+);", txt, re.M).group(1))

    def iso_dataset(self, op):
        """The (T [K], p [Pa], q [mol/kg]) points of an isotherm fit, as declared."""
        r = self.ops[op]["residual"]
        if "dataset" in r:
            ds = read_dict(self.dir / r["dataset"])
            cols = ds["columns"]
            names = [c["name"] for c in cols]
            pu = PRESSURE[next(c["unit"] for c in cols if c["name"] == "p")]
            flat = [float(v) for v in ds["data"]]
            pts = []
            for k in range(len(flat) // len(cols)):
                v = dict(zip(names, flat[k * len(cols):(k + 1) * len(cols)]))
                pts.append((v["T"], v["p"] * pu, v["q"]))
            return pts
        flat = [float(v) for v in r["data"]]
        return [tuple(flat[k:k + 3]) for k in range(0, len(flat), 3)]

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
        if table == "fitPoints":
            #  an isotherm fit: the dataset as declared, and the model the op
            #  evaluated -- read from its own parity view and tied by arm (g)
            #  to the rms the op published, never recomputed here
            par = read_csv_rows(self.dir / "postProcessing" / op / "parity.csv")
            rows = []
            for k, (T, p, q) in enumerate(self.iso_dataset(op)):
                m = num(par[k]["y"]) if k < len(par) else None
                rows.append({"point": float(k + 1), "p_Pa": p, "T_K": T, "measured": q,
                             "model": m, "residual": None if m is None else m - q,
                             "sigma": 1.0})
            return rows
        raise KeyError("no rule to rebuild table %s" % table)

    def series(self, s, earlier):
        """[(x, y, err)] of a series as the view declares it."""
        if "ops" in s:
            return [(self.diag[o][s["x"]], self.diag[o][s["y"]], TOL * abs(self.diag[o][s["y"]]))
                    for o in s["ops"]]
        if "op" in s:
            rows = [r for r in self.op_table(s["op"], s["table"]) if matches(s.get("select"), r)]
            #  a column REBUILT here from 12-figure numbers carries their
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
    return abs(a - b) <= ROUND * max(abs(a), abs(b), 1e-300) or abs(a - b) < 1e-300


def within(a, b, err):
    """a (as written, 12 figures) is b to within err plus its own rounding."""
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= err + ROUND * abs(a) + 1e-300


# ---------------------------------------------------------------- (a)
def arm_a():
    r = subprocess.run([sys.executable, str(ROOT / "bin/curate/nanofiltran/export_case.py"),
                        "--check"], capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(a) " + (r.stdout + r.stderr).strip())
    return r.returncode == 0


# ---------------------------------------------------------------- (b), (c), (d), (g)
def folder(home):
    return home or "case"


def arm_bcd(tmp, witness=CASE):
    case = copy_full(tmp / witness.name, witness)
    rc, out, res = run(case)
    if rc != 0 or res is None:
        fails.append("(b) %s did not run (exit %d):\n%s" % (witness.name, rc, out[-1500:]))
        return None
    block = res.get("postProcessing")
    if not block:
        fails.append("(b) %s: the result JSON carries no postProcessing block" % witness.name)
        return None
    views, refs = views_of(case, res)
    want = [(folder(h), v["name"]) for h, v, _ in views]
    listed = [(folder(it["op"]), it["name"]) for it in block["items"]]
    if listed != want:
        fails.append("(b) %s: the block lists %s, the defaults and the propsDict declare %s"
                     % (witness.name, listed, want))
    for (h, v, origin), it in zip(views, block["items"]):
        #  a view's `note` (DEV.md 4c C154) is published as declared, and only
        #  where declared: published implies pinned, so the block must carry
        #  exactly the case's words
        if (v.get("note") or None) != (it.get("note") or None):
            fails.append("(b) %s view %s/%s: the propsDict's note %r is published as %r"
                         % (witness.name, folder(h), v["name"], v.get("note"), it.get("note")))
        if it.get("origin") != origin or it.get("type") != v.get("type"):
            fails.append("(b) %s view %s/%s: the block says %s %s, the declaration %s %s"
                         % (witness.name, folder(h), v["name"], it.get("origin"),
                            it.get("type"), origin, v.get("type")))
    pp = case / "postProcessing"
    files = sorted(str(p.relative_to(case)) for p in pp.rglob("*") if p.is_file())
    wfiles = sorted(["postProcessing/%s/%s.%s" % (f, n, e) for f, n in want for e in ("csv", "json")]
                    + ["postProcessing/views.index"])
    if files != wfiles:
        fails.append("(b) %s: postProcessing/ holds %s, the views are %s"
                     % (witness.name, sorted(set(files) ^ set(wfiles)), len(want)))
    index = [l for l in (pp / "views.index").read_text().splitlines() if l and not l.startswith("#")]
    if sorted(index) != sorted(f for f in wfiles if not f.endswith("views.index")):
        fails.append("(b) %s: views.index does not list exactly the files written" % witness.name)
    for it in block["items"]:
        side = pp / folder(it["op"]) / (it["name"] + ".json")
        if side.is_file() and json.loads(side.read_text()) != it:
            fails.append("(b) %s: %s/%s.json is not the result block's entry"
                         % (witness.name, folder(it["op"]), it["name"]))

    src = Sources(case, res, refs)
    ncells = 0
    tables = {}
    for h, v, origin in views:
        where = "%s view %s/%s" % (witness.name, folder(h), v["name"])
        path = pp / folder(h) / (v["name"] + ".csv")
        if not path.is_file():
            fails.append("(c) %s: no %s written" % (where, path.relative_to(case)))
            continue
        if v["type"] != "table":
            got = {}
            for r in read_csv_rows(path):
                got.setdefault(r["series"], []).append((num(r["x"]), num(r["y"])))
            done = {}
            for s in series_of(v):
                want_pts = src.series(s, done)
                done[s["name"]] = want_pts
                have = got.get(s["name"], [])
                if len(have) != len(want_pts):
                    fails.append("(c) %s series %s: %d points written, %d published"
                                 % (where, s["name"], len(have), len(want_pts)))
                    continue
                for (xa, ya), (xb, yb, eb) in zip(have, want_pts):
                    ncells += 2
                    if not (close(xa, xb) and within(ya, yb, eb)):
                        fails.append("(c) %s series %s: (%r, %r) written, (%r, %r) published"
                                     % (where, s["name"], xa, ya, xb, yb))
                        break
            continue
        rows = read_csv_rows(path)
        tables[v["name"]] = rows
        if "x" in v:                          # a series table
            done = {}
            for s in series_of(v):
                pts = src.series(s, done)
                done[s["name"]] = pts
                for x, y, e in pts:
                    row = next((r for r in rows if close(num(r["x"]), x)), None)
                    ncells += 1
                    if row is None or not within(num(row[s["name"]]), y, e):
                        fails.append("(c) %s column %s at x = %r: %r written, %r published"
                                     % (where, s["name"], x, row and row[s["name"]], y))
                        break
                xs = {round(x, 9) for x, _, _ in pts}
                for r in rows:
                    if round(num(r["x"]), 9) not in xs and r[s["name"]] != "":
                        fails.append("(c) %s column %s has a value at x = %s that its"
                                     " source does not publish" % (where, s["name"], r["x"]))
        else:                                 # a rows table
            vals, errs = {}, {}
            cols = [c["name"] for c in v["columns"]]
            for w in v["rows"]:
                if "difference" in w:
                    a, b = (vals[n] for n in w["difference"])
                    rel = w.get("relative") == "yes"
                    val = {c: (None if a[c] is None or b[c] is None else
                               ((a[c] - b[c]) / abs(b[c]) if rel else a[c] - b[c])) for c in cols}
                    er = {c: (0.0 if val[c] is None else
                              2 * TOL * (abs(a[c]) + abs(b[c])) / (abs(b[c]) if rel else 1.0))
                          for c in cols}
                elif "op" in w:
                    val = {c: (src.diag[w["op"]][w["cells"][c]] if c in w["cells"] else None)
                           for c in cols}
                else:
                    hit = [r for r in src.ref_rows(w["reference"]) if matches(w["select"], r)]
                    val = {c: (num(hit[0][w["cells"][c]]) if c in w["cells"] else None) for c in cols}
                if "difference" not in w:
                    er = {c: (0.0 if val[c] is None else TOL * abs(val[c])) for c in cols}
                vals[w["name"]] = val
                row = next((r for r in rows if r["row"] == w["name"]), None)
                for c in cols:
                    ncells += 1
                    if row is None or not within(num(row[c]), val[c], er[c]):
                        fails.append("(c) %s row %s column %s: %r written, %r published"
                                     % (where, w["name"], c, row and row[c], val[c]))

    if witness == ISO:
        return len(views), ncells, arm_g(src, views)
    if witness != CASE:
        return len(views), ncells, 0

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
    return len(views), ncells, nanch


# ---------------------------------------------------------------- (g)
def arm_g(src, views):
    """Every fit's parity, residuals and isotherm are one table, and its rms is the op's."""
    nfit = 0
    for op, o in src.ops.items():
        if o.get("type") != "fitParameters":
            continue
        have = {v["name"] for h, v, _ in views if h == op}
        need = {"parity", "residuals", "parameters", "isotherm"}
        if not need <= have:
            fails.append("(g) fit %s publishes the default views %s, not %s"
                         % (op, sorted(have), sorted(need)))
            continue
        d = src.dir / "postProcessing" / op
        par = read_csv_rows(d / "parity.csv")
        res = read_csv_rows(d / "residuals.csv")
        iso = read_csv_rows(d / "isotherm.csv")
        if len(par) != len(res):
            fails.append("(g) fit %s: %d parity points, %d residuals" % (op, len(par), len(res)))
            continue
        bad = [k for k in range(len(par))
               if not within(num(res[k]["y"]), num(par[k]["y"]) - num(par[k]["x"]),
                             2 * TOL * (abs(num(par[k]["y"])) + abs(num(par[k]["x"]))))]
        if bad:
            fails.append("(g) fit %s: residual != model - measured at point %d" % (op, bad[0] + 1))
        models = sorted(num(r["y"]) for r in iso if r["series"].startswith("model"))
        if models != sorted(num(r["y"]) for r in par):
            fails.append("(g) fit %s: the isotherm's model lines are not the parity's points" % op)
        rms = math.sqrt(sum(num(r["y"]) ** 2 for r in res) / len(res))
        pub = src.diag[op].get("rms")
        if pub is None or abs(rms - pub) > 1e-9 * abs(pub):
            fails.append("(g) fit %s: the residuals' rms is %r, the op publishes %r" % (op, rms, pub))
        nfit += 1
    return nfit


# ---------------------------------------------------------------- (e)
def views_text(case_dir):
    """The propsDict, and where its `views`/`references` start (a probe edits
    only that part, so no anchor can land on an operation by accident)."""
    text = (case_dir / "system" / "propsDict").read_text()
    i = text.index("\nreferences\n(")
    return text[:i], text[i:]


def arm_e(tmp):
    head, base = views_text(CASE)
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
        ("unknown view type", sub("type    profile;", "type    contour;"),
         ["`type contour;` -- Accepted: series, profile, parity, residuals, table"]),
        ("unit mismatch", sub('yAxis   { label "potential psi (psi_m = 0 at the feed-side wall)"; unit "V";',
                              'yAxis   { label "potential psi (psi_m = 0 at the feed-side wall)"; unit "mV";'),
         ["is published in 'V' and declared in 'mV'"]),
        ("unread key", sub("style lines; }", "style lines; colour red; }"),
         ["keys nothing reads", "`colour`"]),
        ("undeclared difference", sub("difference ( choupoNa daviesNa );", "difference ( choupoNa davidNa );"),
         ["'davidNa' is not a series declared BEFORE it", "Series: paperNa"]),
        ("select keeping nothing", sub("select { stage paper; }", "select { stage papyrus; }"),
         ["keeps 0 record(s) of reference 'nfStiff'"]),
        ("two views one name", sub("name    fig4_potential;", "name    fig4_concentration;"),
         ["a second view named 'fig4_concentration' in postProcessing/case/"]),
        ("reference outside constant", sub('file      "constant/reference/nanofiltran_fig4.csv";',
                                           'file      "../nanofiltran_fig4.csv";'),
         ["a reference lives under the case's constant/"]),
        #  the potential (psi < 0 at the feed face) on a log axis
        ("non-positive on a log axis", sub('unit "V"; scale linear; }', 'unit "V"; scale log; }'),
         ["on a log axis"]),
    ]
    probes += [
        ("empty note", sub('note    "Code-to-code verification:', 'note    ""; //'),
         ["`note \"\";` is empty"]),
    ]
    #  STUDIES (DEV.md 4c C154): edits of the HEAD, where `studies` is declared
    head_probes = [
        ("study purpose unknown", sub("purpose  numericalStudy;", "purpose  validated;"),
         ["study 'C'", "`purpose validated;` -- Accepted: codeToCodeVerification"]),
        ("study names an unknown op", sub("ops      ( N10 N20 N50", "ops      ( N10x N20 N50"),
         ["study 'C'", "operation 'N10x' is not an operation of this case's propsDict"]),
        ("op in two studies", sub("ops      ( example_ideal", "ops      ( N350 example_ideal"),
         ["study 'C'", "operation 'N350' is already in study 'A'"]),
        ("study unread key", sub("purpose  numericalStudy;", "purpose  numericalStudy; verdict validated;"),
         ["keys nothing reads", "`verdict`"]),
    ]
    fired = 0
    for entry in [(t, e, n, False) for t, e, n in probes] + [(t, e, n, True) for t, e, n in head_probes]:
        tag, edit, needles, on_head = entry
        case = copy_full(tmp / ("refuse_" + re.sub(r"\W+", "_", tag)))
        text = edit(head if on_head else base)
        if text == (head if on_head else base):
            fails.append("(e) the probe `%s` could not be built (its anchor text moved)" % tag)
            continue
        (case / "system" / "propsDict").write_text(text + base if on_head else head + text)
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
    case = copy_full(tmp / "stale", POL)
    pp = case / "postProcessing"
    stale = pp / "table1" / "old_view.csv"
    mine = pp / "notes" / "my_own.csv"
    for f in (stale, mine):
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("series,x,y,yError\nold,1,2,\n")
    (pp / "views.index").write_text("# a previous run\npostProcessing/table1/old_view.csv\n")
    rc, out, res = run(case)
    if rc != 0:
        fails.append("(f) the stale-file copy did not run (exit %d)" % rc)
        return
    if stale.exists():
        fails.append("(f) postProcessing/table1/old_view.csv, listed by the last run's index,"
                     " survived the run")
    if not mine.exists():
        fails.append("(f) postProcessing/notes/my_own.csv, which no run wrote, was removed")
    mine.unlink(missing_ok=True)

    #  a declared view of a default's name replaces it, and says so
    pd = case / "system" / "propsDict"
    text = pd.read_text()
    over = ("    {\n        name    gamma;\n        type    series;\n        op      table1;\n"
            "        table   rows;\n        x       C_b_Cl_molm3;\n        y       ( Gamma_Na );\n"
            "    }\n);\n")
    i = text.rindex(");")
    pd.write_text(text[:i] + over[: -len(");\n")] + text[i:])
    rc, out, res = run(case)
    if rc != 0:
        fails.append("(f) the overriding copy did not run (exit %d):\n%s" % (rc, out[-600:]))
    else:
        if "table1/gamma: the propsDict declares a view of this name -- it replaces the default" not in out:
            fails.append("(f) a declared view named like a default replaced it in silence")
        g = [it for it in res["postProcessing"]["items"] if it["name"] == "gamma"]
        if len(g) != 1 or g[0]["origin"] != "declared":
            fails.append("(f) the overriding copy lists %s for gamma" % [x.get("origin") for x in g])

    #  views taken out: the defaults stay, the declared ones go
    pd.write_text(strip_views(text))
    rc, out, res = run(case)
    if rc != 0:
        fails.append("(f) the copy without views did not run (exit %d)" % rc)
        return
    names = sorted(it["name"] for it in res["postProcessing"]["items"])
    if names != ["gamma", "rejection", "rows"]:
        fails.append("(f) without its views the case still lists %s" % names)
    left = sorted(p.name for p in (pp / "table1").iterdir())
    if left != sorted(n + e for n in ("gamma", "rejection", "rows") for e in (".csv", ".json")):
        fails.append("(f) without its views postProcessing/table1 holds %s" % left)


def main():
    if not PROPS.exists():
        print("check_postprocessing: FAILED -- no choupoProps binary (build first)")
        return 1
    arm_a()
    with tempfile.TemporaryDirectory(prefix="postprocessing_") as d:
        tmp = Path(d)
        got = [arm_bcd(tmp, w) for w in WITNESSES]
        fired = arm_e(tmp)
        arm_f(tmp)
    if fails or any(g is None for g in got):
        print("check_postprocessing: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    nviews = sum(g[0] for g in got)
    ncells = sum(g[1] for g in got)
    nanch, nfit = got[0][2], got[2][2]
    print("check_postprocessing: OK -- the paper case's %d reference files are their sources'"
          " export; %d views (each operation's defaults, then the propsDict's) over %d witness"
          " cases are produced (CSV + sidecar = the result block, the index = the files, nothing"
          " else in postProcessing/); %d written numbers recomputed by this gate's own reading"
          " of each view from the run's diagnostics, the ops' published tables (rebuilt from"
          " what else the run publishes), the reference files and the differences, to the CSV's 12 figures; the"
          " paper's tables meet %d anchors of its golden; %d fits' default views are one table"
          " whose rms is the op's own; %d refusals fire by name; a listed stale file goes, an"
          " author's own file stays, a declared view replaces a default aloud, and a case"
          " without views keeps only the defaults.  NOT CHECKED: that a view is the right one"
          " for the paper, the GUI's drawing (its own tests), units beyond their spelling, a"
          " fit's model value point by point, the bubble-point fits' defaults, the interior"
          " pore profile node by node."
          % (6, nviews, len(WITNESSES), ncells, nanch, nfit, fired))
    return 0


if __name__ == "__main__":
    sys.exit(main())
