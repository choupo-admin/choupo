#!/usr/bin/env python3
"""The band of a golden row, chosen by WHAT KIND OF NUMBER the row holds.

    bin/curate/golden_bands.py apply FILE [--result OUTFILE]   # rewrite the tolerance column of FILE
    bin/curate/golden_bands.py rewrite-all [--dry-run]         # every golden of the tree (needs built binaries)
    bin/curate/golden_bands.py classify KIND NAME KEY          # which class a row belongs to

WHY.  The goldens pinned every number at a relative 1e-4.  A second platform
(the CI runner's math library) cannot reproduce that for a count of
evaluations, a condition number, a fitted parameter or the round-off residual
of a closure; the disagreement was measured
(docs/reviews/2026-11-13-ci-platform-rows/REPORT.md).  The classes and their
bands live in ONE table, bin/curate/golden_bands.tsv, and three things read
it: the recorder (`bin/runTests --record` calls `apply` on every file it
writes), the tool that rewrote the existing goldens (`rewrite-all`), and the
gate bin/curate/check_golden_bands.py.

THE ABSOLUTE FORM.  `abs:<v>` in the tolerance column means |actual - expected|
<= v, in the row's own unit.  A closure residual is round-off of a balance;
its meaning is "this residual did not move by more than a small fraction of
what the balance exchanges", which only an absolute band says.  The band is
computed at record time from the TERM the same result block publishes:

  boundary global residual_kW   1e-5 x `residual_denom_kW` of `globalEnergyBoundary`
                                (published only when `residual_pct_available`);
                                with none published: abs:1e-3 kW
  kpi <unit> H_closure_gap_kW   1e-8 x |Q_kW| of the same unit
  kpi <ledger> energy_residual_kJ   1e-9 x the largest pinned energy term of
                                that ledger (campaign: energy_dH_vessels_kJ,
                                energy_Q_ledger_kJ, energy_H_external_kJ;
                                balance: energy_kJ_initial/final/in_cum/out_cum/heat_cum)
Floor: an absolute band is never written below 1e-9 in the row's own unit.
Anchor rows and `exact` rows are never touched.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "bin" / "curate" / "golden_bands.tsv"
FLOOR = 1e-9
BOUNDARY_NO_DENOM_KW = 1e-3

LEDGER_TERMS = ("energy_dH_vessels_kJ", "energy_Q_ledger_kJ", "energy_H_external_kJ",
                "energy_kJ_initial", "energy_kJ_final", "energy_kJ_in_cum",
                "energy_kJ_out_cum", "energy_kJ_heat_cum")


class BandClass:
    def __init__(self, f):
        (self.name, kinds, name_re, key_re, self.rule, self.param, self.reason) = f
        self.kinds = set(kinds.split(","))
        self.name_re = re.compile(name_re)
        self.key_re = re.compile(key_re)
        self.param = float(self.param)


def load_table(path=TABLE):
    out = []
    for line in Path(path).read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        f = line.split("\t")
        if len(f) != 7:
            raise SystemExit(f"golden_bands: malformed table line ({len(f)} fields): {line[:80]}")
        out.append(BandClass(f))
    return out


_TABLE = None


def classes():
    global _TABLE
    if _TABLE is None:
        _TABLE = load_table()
    return _TABLE


def classify(kind, name, key):
    for c in classes():
        if kind in c.kinds and c.name_re.fullmatch(name) and c.key_re.fullmatch(key):
            return c
    return None


def fmt(v):
    return f"{v:.4g}"


def parse_rows(text):
    """[(lineno, tokens-with-spans)] for data rows."""
    rows = []
    for i, line in enumerate(text.split("\n")):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        toks = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"\S+", line)]
        if len(toks) >= 5:
            rows.append((i, toks))
    return rows


def golden_values(text):
    d = {}
    for _, toks in parse_rows(text):
        d[(toks[0][0], toks[1][0], toks[2][0])] = toks[3][0]
    return d


def boundary_denominator(block):
    """residual_denom_kW of globalEnergyBoundary, or None when not published."""
    if not block:
        return None
    for line in block.split("\n"):
        if '"globalEnergyBoundary": {' in line:
            if '"residual_pct_available": true' not in line:
                return None
            m = re.search(r'"residual_denom_kW": *(-?[0-9][0-9.eE+-]*)', line)
            return abs(float(m.group(1))) if m else None
    return None


def block_kpi(block, unit, key):
    """A KPI of a unit from the result block (fallback when the golden lacks the term)."""
    if not block:
        return None
    for line in block.split("\n"):
        if line.lstrip().startswith(f'"{unit}": {{') and f'"{key}":' in line:
            mm = re.search(rf'"{key}": *(-?[0-9][0-9.eE+-]*)', line)
            if mm:
                return float(mm.group(1))
    return None


def term_for(cls, name, key, gv, block):
    """(term, description) or (None, why) for an absolute class."""
    if cls.name == "residual_boundary":
        den = boundary_denominator(block)
        if den is None:
            return None, "no residual_denom_kW published"
        return den, "residual_denom_kW"
    if cls.name == "residual_hx":
        q = gv.get(("kpi", name, "Q_kW"))
        q = abs(float(q)) if q is not None else block_kpi(block, name, "Q_kW")
        if q is None:
            return None, f"no Q_kW of unit {name}"
        return abs(q), "Q_kW"
    if cls.name == "residual_ledger":
        ts = []
        for t in LEDGER_TERMS:
            v = gv.get(("kpi", name, t))
            if v is None:
                v = block_kpi(block, name, t)
            if v is not None:
                ts.append(abs(float(v)))
        if not ts:
            return None, f"no pinned energy term of ledger {name}"
        return max(ts), "largest energy term"
    raise SystemExit(f"golden_bands: no term rule for class {cls.name}")


def prescribed(cls, kind, name, key, gv, block):
    """The tolerance string the class prescribes, or (None, why) when it cannot be computed."""
    if cls.rule == "rel":
        return f"{cls.param:g}", None
    term, why = term_for(cls, name, key, gv, block)
    if term is None:
        if cls.name == "residual_boundary":
            return f"abs:{BOUNDARY_NO_DENOM_KW:g}", None
        return None, why
    return "abs:" + fmt(max(FLOOR, cls.param * term)), None


def apply_text(text, block=None):
    """Rewrite the tolerance column of the rows of TEXT; returns (new text, changed, skipped)."""
    gv = golden_values(text)
    lines = text.split("\n")
    changed = 0
    skipped = []
    for i, toks in parse_rows(text):
        kind, name, key, _, tol = (t[0] for t in toks[:5])
        claim = toks[5][0] if len(toks) > 5 else ""
        if claim == "anchor" or tol == "exact":
            continue
        cls = classify(kind, name, key)
        if cls is None:
            continue
        want, why = prescribed(cls, kind, name, key, gv, block)
        if want is None:
            skipped.append((kind, name, key, why))
            continue
        if want != tol:
            s, e = toks[4][1], toks[4][2]
            lines[i] = lines[i][:s] + want + lines[i][e:]
            changed += 1
    return "\n".join(lines), changed, skipped


def cmd_apply(argv):
    path = Path(argv[0])
    block = None
    if "--result" in argv:
        block = Path(argv[argv.index("--result") + 1]).read_text(errors="replace")
    old = path.read_text()
    new, changed, skipped = apply_text(old, block)
    if new != old:
        path.write_text(new)
    for s in skipped:
        print(f"golden_bands: {path}: {s[0]} {s[1]} {s[2]} left as it was ({s[3]})", file=sys.stderr)
    return 0


def run_boundary_block(case_dir):
    """Run the steady case and return its result text (for residual_denom_kW)."""
    exe = ROOT / "choupoSolve"
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    p = subprocess.run([str(exe), str(case_dir)], capture_output=True, text=True, env=env, timeout=1800)
    return p.stdout


def goldens():
    out = []
    for base in ("tutorials", "data"):
        for p in (ROOT / base).rglob("expected*"):
            if p.is_file() and (p.name == "expected" or p.name.startswith("expected.")):
                out.append(p)
    return sorted(out)


def cmd_rewrite_all(argv):
    dry = "--dry-run" in argv
    per_class = {}
    report = []
    for g in goldens():
        text = g.read_text()
        needs_block = any(c is not None and c.name == "residual_boundary"
                          for _, toks in parse_rows(text)
                          for c in [classify(toks[0][0], toks[1][0], toks[2][0])])
        block = run_boundary_block(g.parent) if needs_block else None
        new, changed, skipped = apply_text(text, block)
        if needs_block:
            for _, toks in parse_rows(text):
                if toks[0][0] == "boundary" and toks[2][0] == "residual_kW":
                    report.append((str(g.relative_to(ROOT)), toks[3][0], boundary_denominator(block)))
        for s in skipped:
            print(f"SKIPPED {g.relative_to(ROOT)}: {s}")
        b = text.split("\n")
        n = new.split("\n")
        for (i, toks) in parse_rows(text):
            if b[i] != n[i]:
                c = classify(toks[0][0], toks[1][0], toks[2][0])
                per_class[c.name] = per_class.get(c.name, 0) + 1
        if new != text and not dry:
            g.write_text(new)
    for k in sorted(per_class):
        print(f"class {k}: {per_class[k]} row(s) rewritten")
    print(f"total {sum(per_class.values())}")
    with open(os.environ.get("GOLDEN_BANDS_BOUNDARY_REPORT", "/dev/null"), "w") as f:
        for r in report:
            f.write("\t".join(str(x) for x in r) + "\n")
    return 0


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "apply":
        return cmd_apply(argv[2:])
    if cmd == "rewrite-all":
        return cmd_rewrite_all(argv[2:])
    if cmd == "classify":
        c = classify(*argv[2:5])
        print(c.name if c else "direct")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
