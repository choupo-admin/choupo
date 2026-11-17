#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_refusal_probes -- the refusal probes, as DATA, walked by one runner (DEV.md 4c C420).

    bin/curate/check_refusal_probes.py [--only <group>] [--probes-dir <dir>]

A refusal probe has one shape: copy a shipped case, edit one or two of its
files, run an engine binary, require a non-zero exit and a NAMED message (and,
for a positive control, that the unedited or harmlessly edited case still
runs).  That shape lives in bin/curate/gatekit.py; what differs from probe to
probe is data, kept in bin/curate/refusal_probes/*.probes, one file per GROUP
(a group is a former gate: it keeps its own label and verdict lines).  A new
refusal is a few lines of data, not a script.

A group prints exactly what the former gate printed on success (its OK line)
and a FAILED block naming the probe that failed.  The runner's first line is
its own claim (`check_refusal_probes: OK -- ...`).  After the groups it prints
one `@row <result label> PASS|FAIL <claim>` line per group, which bin/runTests
turns into one PASS/FAIL result row per group.  `--only` runs one group;
`--probes-dir` reads the groups from another directory (the sabotage arms use
it).  Exit 1 if any group fails.

FILE FORMAT (plain text; `#` starts a comment line).  One `key value` per line;
a line whose first non-blank character is `+` continues the previous value
(joined with one space).  A value may be wrapped in double quotes to keep
leading or trailing blanks.

  group     <name>             the group's name (`--only` takes it)
  row       <label>            the PASS/FAIL row label bin/runTests prints
  binary    <name>             engine binary (choupoSolve, choupoCtrl, ...)
  base      <path>             shipped case the probes copy (relative to the repo)
  strip     <rel> [<rel>..]    files of every copy deleted before the run
  timeout   <seconds>          per run (default 600)
  ok_head   "<text>"           what precedes the OK sentence
  fail_head "<text>"           first line of the FAILED block
  bullet    dash | plain       FAILED lines as `  - x` (default) or `  x`
  ok        <text>             the OK sentence, fixed ... OR
  ok_tail   <text>             ... the fragments of the probes joined by "; "
                               followed by ok_tail

  probe     <name>             a refusal probe (expected exit: non-zero)
  control   <name>             a positive control (expected exit: zero)
    base / binary / strip / timeout   (inside a probe) override the group's own
                               for this probe alone: a group may mix bases and
                               binaries (C420 batch 2: the solverDict lint runs
                               four binaries on four cases)
    edit    <file> TAB <old> TAB <new>
                               change a file of the copy; `old` starting with
                               `re:` is a regex (multi-line mode), `\\n` is a
                               newline; an `old` that is absent FAILS the probe.
                               To APPEND to a file use `re:\\Z` as `old`.
    editall <file> TAB <old> TAB <new>
                               the same, but replaces EVERY occurrence (`edit`
                               replaces the first only): a case that states one
                               thing twice (two operations, two pins)
    add     <file> TAB <text>  create a NEW file in the copy (`\\n` = newline,
                               parent directories made); a file that already
                               exists FAILS the probe (it would test something else)
    copy    <dest> TAB <src>   put a file of the repository (`src`, relative to
                               the repo) at `dest` in the copy; a missing `src`
                               FAILS the probe.  Edits, adds and copies apply in
                               the order written.
    match   <regex>            the output must match (all of them; DOTALL)
    nomatch <regex>            the output must NOT match (all of them; DOTALL):
                               a silence claim ("the lint does not cry wolf").
                               Use it on a `control` (exit zero), so that the
                               silence is not merely a crash
    exit    nonzero | zero | <n>   override the expected exit
    ok      <fragment>         this probe's words in a composed OK line

A missing binary or base case fails the group by name (a check that cannot run
must not pass).  Python standard library only.
"""
import contextlib
import io
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gatekit  # noqa: E402

DEFAULT_DIR = HERE / "refusal_probes"


def _unq(v):
    return v[1:-1] if len(v) >= 2 and v[0] == v[-1] == '"' else v


def parse(path):
    """One .probes file -> a group dict."""
    g = {"strip": [], "bullet": "dash", "timeout": 600, "probes": []}
    cur, last = None, None            # last = (dict, key) that a `+` line continues
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        s = raw.strip()
        if s.startswith("+"):
            if last is None:
                raise SystemExit(f"{path}:{n}: `+` continues nothing")
            d, k = last
            d[k] = d[k] + " " + s[1:].strip()
            continue
        parts = s.split(None, 1)
        key, val = parts[0], (parts[1] if len(parts) > 1 else "")
        if key in ("probe", "control"):
            cur = {"kind": key, "name": val, "ops": [], "match": [], "nomatch": [],
                   "exit": None, "ok": None}
            g["probes"].append(cur)
            last = (cur, "name")
        elif key in ("edit", "editall"):
            f = val.split("\t")
            if len(f) == 2:                    # an empty <new>: the trailing TAB was stripped
                f.append("")
            if cur is None or len(f) != 3:
                raise SystemExit(f"{path}:{n}: `edit` needs <file>TAB<old>TAB<new> inside a probe")
            cur["ops"].append((key, f[0].strip(), f[1].replace("\\n", "\n"),
                               f[2].replace("\\n", "\n")))
            last = None
        elif key in ("add", "copy"):
            f = val.split("\t")
            if cur is None or len(f) != 2:
                raise SystemExit(f"{path}:{n}: `{key}` needs <file>TAB<text|src> inside a probe")
            cur["ops"].append((key, f[0].strip(), f[1].replace("\\n", "\n"), None))
            last = None
        elif key in ("base", "binary", "strip", "timeout") and cur is not None:
            cur[key] = (val.split() if key == "strip"
                        else int(val) if key == "timeout" else val)
            last = None
        elif key == "nomatch" and cur is not None:
            cur["nomatch"].append(val)
            last = None
        elif key == "match" and cur is not None:
            cur["match"].append(val)
            last = None
        elif key == "exit" and cur is not None:
            cur["exit"] = val
            last = None
        elif key == "ok" and cur is not None:
            cur["ok"] = _unq(val)
            last = (cur, "ok")
        elif key in ("group", "row", "binary", "base", "ok_head", "fail_head", "bullet",
                     "ok", "ok_tail"):
            g[key] = _unq(val)
            last = (g, key)
        elif key == "strip":
            g["strip"] = val.split()
            last = None
        elif key == "timeout":
            g["timeout"] = int(val)
            last = None
        else:
            raise SystemExit(f"{path}:{n}: unknown key {key!r}")
    for k in ("group", "row", "binary", "base"):
        if k not in g:
            raise SystemExit(f"{path}: missing `{k}`")
    return g


def apply_op(case, op):
    """Apply one edit / add / copy to the probe copy; return a failure text or None."""
    kind, rel, x, y = op
    if kind in ("edit", "editall"):
        regex = x.startswith("re:")
        try:
            gatekit.edit(case / rel, x[3:] if regex else x, y, regex=regex,
                         count=0 if kind == "editall" else 1)
        except gatekit.EditNotApplied as e:
            return f"the edit did not apply ({e}) -- the probe tests nothing"
        except FileNotFoundError:
            return f"{rel} is not in the base case -- the probe is stale"
    elif kind == "add":
        dst = case / rel
        if dst.exists():
            return f"{rel} already exists in the base case -- `add` would test something else"
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(x)
    else:                                              # copy
        src = gatekit.repo / x
        if not src.is_file():
            return f"{x} is not in the repository -- the probe is stale"
        (case / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, case / rel)
    return None


def run_probe(g, p):
    """None when the probe held, else the failure text.  base, binary, strip and
    timeout are the probe's own when it names them, else the group's."""
    try:
        bin_path = gatekit.binary(p.get("binary", g["binary"]))
        with gatekit.probe_copy(p.get("base", g["base"]), p.get("strip", g["strip"])) as case:
            for op in p["ops"]:
                bad = apply_op(case, op)
                if bad:
                    return f"{p['name']}: {bad}"
            rc, out = gatekit.run(bin_path, case, p.get("timeout", g["timeout"]))
    except gatekit.GateRefusal as e:
        return f"{p['name']}: {e}"
    want = p["exit"] or ("zero" if p["kind"] == "control" else "nonzero")
    if want == "nonzero" and rc == 0:
        return f"{p['name']}: the probe RAN (exit 0) -- the refusal is gone"
    if want == "zero" and rc != 0:
        return f"{p['name']}: exited {rc}, expected a run:\n      " + out[-400:]
    if want not in ("zero", "nonzero") and rc != int(want):
        return f"{p['name']}: exited {rc}, expected {want}:\n      " + out[-400:]
    for rx in p["match"]:
        if not re.search(rx, out, re.S):
            return (f"{p['name']}: exit {rc}, but the output does not match /{rx}/:\n      "
                    + out[-500:])
    for rx in p["nomatch"]:
        if re.search(rx, out, re.S):
            return (f"{p['name']}: exit {rc}, but the output matches /{rx}/ -- "
                    "it must stay silent on this")
    return None


def run_group(g):
    """Print the group's verdict lines; return (ok, claim)."""
    fails, frags = [], []
    for p in g["probes"]:
        f = run_probe(g, p)
        if f:
            fails.append(f)
        elif p["ok"]:
            frags.append(p["ok"])
    ok_text = g["ok"] if "ok" in g else "; ".join(frags) + g.get("ok_tail", "")
    head = g.get("ok_head")
    rc = gatekit.verdict(g["row"], fails, ok_text, ok_head=head, fail_head=g.get("fail_head"),
                         fail_bullet="  - " if g["bullet"] == "dash" else "  ")
    claim = (head if head is not None else f"{g['row']}: OK -- ") + ok_text
    return rc == 0, claim if rc == 0 else "FAILED"


def main(argv):
    only, pdir, a = None, DEFAULT_DIR, list(argv)
    while a:
        x = a.pop(0)
        if x == "--only" and a:
            only = a.pop(0)
        elif x == "--probes-dir" and a:
            pdir = Path(a.pop(0))
        else:
            print(__doc__)
            return 2
    groups = [parse(f) for f in sorted(pdir.glob("*.probes"))]
    if only:
        groups = [g for g in groups if g["group"] == only]
        if not groups:
            print(f"check_refusal_probes: FAILED -- no group named {only!r}")
            return 1
    results, bufs = [], []
    for g in groups:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            ok, claim = run_group(g)
        results.append((g, ok, claim))
        bufs.append(buf.getvalue())
    bad = [g["group"] for g, ok, _ in results if not ok]
    if bad:
        print("check_refusal_probes: FAILED -- group(s) " + ", ".join(bad))
    else:
        print(f"check_refusal_probes: OK -- {len(results)} group(s): "
              + ", ".join(g["group"] for g, _, _ in results))
    for b in bufs:
        sys.stdout.write(b)
    for g, ok, claim in results:
        print(f"@row {g['row']} {'PASS' if ok else 'FAIL'} {claim}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
