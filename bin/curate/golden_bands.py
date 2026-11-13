#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The band of a golden row, chosen by WHAT KIND OF NUMBER the row holds, and
the two claims a golden makes.

    golden_bands.py apply FILE [--result OUTFILE] [--groups residual|platform|all]
    golden_bands.py cross FILE          # the golden passed through the class table, to stdout
    golden_bands.py view FILE           # the golden AS COMPARED in the running mode (what bin/runTests reads)
    golden_bands.py mode [FILE]         # strict | cross, and why (CHOUPO_GOLDEN_MODE overrides)
    golden_bands.py stamp FILE          # write/remove the file's own `# platform` line
    golden_bands.py fingerprint         # the running platform
    golden_bands.py rewrite-all [--dry-run] [--groups ...]   # every golden of the tree
    golden_bands.py classify KIND NAME KEY

A GOLDEN IS TWO CLAIMS (C384, 2026-11-13).  On the platform that RECORDED it:
"this has not moved" -- the band written in the file, tight; locally every
count, condition number and fit statistic reproduces bit for bit, and loosening
them on disk would blind the maintainer's own suite.  On ANOTHER platform:
"this reproduces as well as this kind of number can" -- the file passed through
bin/curate/golden_bands.tsv, in a temporary file, never written to the tree.
The disagreement between platforms was measured
(docs/reviews/2026-11-13-ci-platform-rows/REPORT.md): counts, condition numbers
and optimiser answers are chaotic in the last places; a closure residual is
round-off of a balance.

TWO GROUPS OF CLASSES.
  platform  count, condition, parameter, objective: applied only in CROSS mode
            (`cross`), never on disk, never tighter than the file's own band.
  residual  residual_boundary / _hx / _ledger: ON DISK as `abs:<v>`
            (`apply`, the recorder's wrapper and `rewrite-all`), because a
            residual's meaning is absolute on any platform.  The band is
            computed at record time from the TERM of the same result block:
              boundary global residual_kW   1e-5 x `residual_denom_kW` of
                  `globalEnergyBoundary` (published only when
                  `residual_pct_available`); with none published
                  abs:max(1e-3 kW, 1e-4 x |expected|)
              kpi <unit> H_closure_gap_kW   1e-8 x |Q_kW| of the same unit
              kpi <ledger> energy_residual_kJ   1e-9 x the largest pinned energy
                  term of that ledger
            Floor: an absolute band is never written below 1e-9.

THE PLATFORM.  ONE fingerprint function (platform_fingerprint: CPU, architecture,
C library, compiler, the SIMD features glibc dispatches on, all READ from the
running system), used by the route-bench gate too.  The RECORDING platform is
declared once in bin/curate/recording_platform.txt; a golden may override it
with its own `# platform <fingerprint>` comment line, which the recorder writes
when `--record` runs anywhere but the declared platform, so strictness follows
the file that was recorded there.  `CHOUPO_GOLDEN_MODE=cross` or `strict`
forces a mode (the self-test, or to see locally what the runner sees).

Anchor rows and `exact` rows are never touched.
"""
import os
import platform
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "bin" / "curate" / "golden_bands.tsv"
RECORDING = ROOT / "bin" / "curate" / "recording_platform.txt"
FLOOR = 1e-9
BOUNDARY_NO_DENOM_KW = 1e-3

LEDGER_TERMS = ("energy_dH_vessels_kJ", "energy_Q_ledger_kJ", "energy_H_external_kJ",
                "energy_kJ_initial", "energy_kJ_final", "energy_kJ_in_cum",
                "energy_kJ_out_cum", "energy_kJ_heat_cum")


# ---------------------------------------------------------------- platform
def platform_fingerprint():
    """The platform a bit-for-bit claim is true on, read from the RUNNING system.
    The libm a binary calls picks its variant of exp/log/pow by the CPU's
    instruction set and differs in the last bit between C libraries, so the
    fingerprint is the CPU model, the architecture, the C library, the compiler
    that built the binary and the SIMD features glibc dispatches on."""
    libc = " ".join(platform.libc_ver()).strip() or "unknown"
    try:
        cxx = subprocess.run([os.environ.get("CXX", "g++"), "--version"], capture_output=True,
                             text=True, timeout=30).stdout.splitlines()[0].strip()
    except (OSError, IndexError, subprocess.SubprocessError):
        cxx = "unknown"
    feats = ""
    model = ""
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name") and not model:
                model = " ".join(line.split(":", 1)[1].split())
            if line.startswith("flags"):
                have = set(line.split(":", 1)[1].split())
                feats = ",".join(f for f in ("sse4_1", "avx", "avx2", "fma", "avx512f") if f in have)
                break
    except OSError:
        pass
    return f"cpu={model or 'unknown'}; arch={platform.machine()}; libc={libc}; cxx={cxx}; simd={feats or 'unknown'}"


def declared_platform():
    for line in RECORDING.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            return line.strip()
    raise SystemExit(f"golden_bands: {RECORDING} declares no recording platform")


def file_platform(text):
    for line in text.split("\n"):
        m = re.match(r"#\s*platform\s+(.+)$", line)
        if m:
            return m.group(1).strip()
        if line.strip() and not line.startswith("#"):
            break
    return None


def mode_for(text, running=None):
    """(mode, why) for one golden's text."""
    forced = os.environ.get("CHOUPO_GOLDEN_MODE", "").strip()
    if forced in ("cross", "strict"):
        return forced, f"forced by CHOUPO_GOLDEN_MODE={forced}"
    running = running or platform_fingerprint()
    rec = file_platform(text) or declared_platform()
    if rec == running:
        return "strict", "the running platform recorded this golden"
    return "cross", f"recorded on [{rec}], running on [{running}]"


# ------------------------------------------------------------------- table
class BandClass:
    def __init__(self, f):
        (self.name, kinds, name_re, key_re, self.rule, self.param, self.reason) = f
        self.kinds = set(kinds.split(","))
        self.name_re = re.compile(name_re)
        self.key_re = re.compile(key_re)
        self.param = float(self.param)
        self.group = ("residual" if self.name.startswith("residual_")
                      else "direct" if self.name == "direct" else "platform")


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
        if (kind in c.kinds or "*" in c.kinds) and c.name_re.fullmatch(name) and c.key_re.fullmatch(key):
            return c
    return None


def fmt(v):
    return f"{v:.4g}"


# -------------------------------------------------------------------- rows
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


def prescribed(cls, kind, name, key, gv, block, expected=None):
    """The tolerance string the class prescribes, or (None, why) when it cannot be computed."""
    if cls.rule == "rel":
        return f"{cls.param:g}", None
    term, why = term_for(cls, name, key, gv, block)
    if term is None:
        if cls.name == "residual_boundary":
            #  No denominator is published: the 1e-3 kW floor, never tighter than
            #  the relative 1e-4 the row has always carried (a residual that is
            #  not small is a number like any other).
            try:
                big = 1e-4 * abs(float(expected))
            except (TypeError, ValueError):
                big = 0.0
            return "abs:" + fmt(max(BOUNDARY_NO_DENOM_KW, big)), None
        return None, why
    return "abs:" + fmt(max(FLOOR, cls.param * term)), None


def apply_text(text, block=None, groups=("residual",)):
    """Rewrite the tolerance column of the rows of TEXT that belong to a class of
    GROUPS; returns (new text, changed, skipped).  A relative class never makes
    a row TIGHTER than the band it already has."""
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
        if cls is None or cls.rule == "none" or ("all" not in groups and cls.group not in groups):
            continue
        want, why = prescribed(cls, kind, name, key, gv, block, toks[3][0])
        if want is None:
            skipped.append((kind, name, key, why))
            continue
        if cls.group == "platform":
            try:
                if float(tol) >= float(want):
                    continue
            except ValueError:
                pass
        if want != tol:
            s, e = toks[4][1], toks[4][2]
            lines[i] = lines[i][:s] + want + lines[i][e:]
            changed += 1
    return "\n".join(lines), changed, skipped


def stamp_text(text):
    """Write or remove the file's own `# platform` line so that strictness follows
    the platform that recorded it: a golden recorded anywhere but the declared
    platform carries the line; one recorded on the declared platform carries none."""
    lines = [l for l in text.split("\n") if not re.match(r"#\s*platform\s+", l)]
    here = platform_fingerprint()
    if here != declared_platform():
        lines.insert(0, f"# platform {here}")
    return "\n".join(lines)


# --------------------------------------------------------------------- CLI
def groups_arg(argv):
    if "--groups" in argv:
        g = argv[argv.index("--groups") + 1]
        return ("all",) if g == "all" else (g,)
    return ("residual",)


def cmd_apply(argv):
    path = Path(argv[0])
    block = None
    if "--result" in argv:
        block = Path(argv[argv.index("--result") + 1]).read_text(errors="replace")
    old = path.read_text()
    new, changed, skipped = apply_text(old, block, groups_arg(argv))
    if new != old:
        path.write_text(new)
    for s in skipped:
        print(f"golden_bands: {path}: {s[0]} {s[1]} {s[2]} left as it was ({s[3]})", file=sys.stderr)
    return 0


def cmd_cross(argv):
    new, _, _ = apply_text(Path(argv[0]).read_text(), None, ("platform",))
    sys.stdout.write(new)
    return 0


def cmd_view(argv):
    """The golden as bin/runTests compares it: untouched in strict mode, passed
    through the class table in cross mode (the file is never written).  In cross
    mode the path is appended to $CHOUPO_GB_LOG, so the run can count them."""
    text = Path(argv[0]).read_text()
    m, _ = mode_for(text)
    if m == "cross":
        text, _, _ = apply_text(text, None, ("platform",))
        log = os.environ.get("CHOUPO_GB_LOG")
        if log:
            with open(log, "a") as f:
                f.write(argv[0] + "\n")
    sys.stdout.write(text)
    return 0


def cmd_mode(argv):
    text = Path(argv[0]).read_text() if argv else ""
    m, why = mode_for(text)
    print(f"{m}\t{why}")
    return 0


def cmd_stamp(argv):
    p = Path(argv[0])
    old = p.read_text()
    new = stamp_text(old)
    if new != old:
        p.write_text(new)
    return 0


def run_boundary_block(case_dir):
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
    groups = groups_arg(argv)
    per_class = {}
    for g in goldens():
        text = g.read_text()
        needs_block = any(c is not None and c.name == "residual_boundary" and ("all" in groups or c.group in groups)
                          for _, toks in parse_rows(text)
                          for c in [classify(toks[0][0], toks[1][0], toks[2][0])])
        block = run_boundary_block(g.parent) if needs_block else None
        new, changed, skipped = apply_text(text, block, groups)
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
    return 0


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "apply":
        return cmd_apply(argv[2:])
    if cmd == "cross":
        return cmd_cross(argv[2:])
    if cmd == "view":
        return cmd_view(argv[2:])
    if cmd == "mode":
        return cmd_mode(argv[2:])
    if cmd == "stamp":
        return cmd_stamp(argv[2:])
    if cmd == "fingerprint":
        print(platform_fingerprint())
        return 0
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
