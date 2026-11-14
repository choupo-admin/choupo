#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""INPUT-KEYED REUSE -- a verdict that depends only on named inputs is taken
again only when one of them changes (DEV.md 4c C394, decision 1).

    bin/curate/suite_reuse.py lookup <gate>              exit 0: reusable (the
                                                         sentence on stdout);
                                                         exit 1: run it (the
                                                         key on stdout, or -);
                                                         exit 2: reuse is off
    bin/curate/suite_reuse.py store <gate> <key> <out>   keep a PASS verdict
    bin/curate/suite_reuse.py case-plan <root>           one line per curation
                                                         case: dir, key, the
                                                         stored labels or -
    bin/curate/suite_reuse.py key <gate>                 print the key and the
                                                         inputs it covers
    bin/curate/suite_reuse.py --list                     what is keyed, what is
                                                         not, and why
    bin/curate/suite_reuse.py tree-key                   the key of this tree
    bin/curate/suite_reuse.py fast-stamp write KEY TALLY a clean --fast pass
    bin/curate/suite_reuse.py fast-stamp check           may the sweep start?

The fast stamp is the other half of the suite's economy (C394 decision 2:
`--fast` runs FIRST on every merged tree, and the sweep starts only when it
passed there); it lives here because it is the same kind of fact -- evidence
taken on a tree, reused while it still describes it.

WHY (Vitor, 2026-11-13: "Esses pares tem de ser corridos na suite?").  The
full sweep of 2026-11-13 spent 36 min of one-core work on the simulation
cases and 259 on the gates; the regressed-pairs gate (about 1800 runs) and
the 1260 curation fits were among the largest items, and with none of their
inputs changed their verdicts cannot change.  This is rule 4's "evidence is
reused while it still describes what enters main", made mechanical.

WHAT A KEY IS.  A sha256 over exactly the inputs the verdict reads:

  * THE ENGINE -- the compiled objects, read from the build the suite already
    proved fresh (check_build_fresh runs before anything).  Every object under
    build/<platform>/src is hashed by its CONTENT, so an edit that changes no
    machine code (a comment, a moved line in a file that uses no __LINE__)
    leaves the key alone, and any edit that changes code changes it.  The two
    objects that include generated/gitVersion.H (the banner and the citation,
    which print the commit hash and nothing else) are keyed on their sources
    instead, minus that one header: otherwise every commit would change every
    key.  The flag stamps (.stamp-cxx-*, .stamp-ld-*) carry the compiler, its
    version and every flag.  Why not a narrower engine half (the fitting
    operation and the activity models it calls): its include closure,
    followed from FitParameters.cpp through header -> source, already reaches
    324 of the 462 translation units (measured 2026-11-14), and a
    header-to-source walk is not a link map -- a key resting on it could
    reuse a verdict an unwalked file had changed.
  * THE DATA -- every tracked or untracked-not-ignored file under the trees
    the spec names (git's own listing, so a case's run outputs, which are
    ignored, never enter), plus the private tier data/local/, which is
    ignored and read by the engine when present (walked on disk).
  * THE HARNESS -- the gate's own file and the closure of what it executes:
    the bin/curate modules it imports, and the bin/ scripts its string
    literals name, recursively.  For the curation cases the harness is the
    text of the bin/runTests functions check_case reaches (not the whole
    file: a new gate elsewhere in it changes no case's verdict), the scripts
    those functions name, and the golden-band mode this run compares in.
  * THE PLATFORM -- `uname -m`, the Python version.

A content hash is cached by (size, mtime_ns) in build/reuse/hashcache.tsv --
the rule make and git use -- so a key costs stat calls after the first run.

WHAT IS STORED.  Only a PASS (exit 0).  A FAIL, a SKIP (exit 2, cannot run)
or a NO SUBJECT is never stored, so it always runs again.  The verdict lives
under build/reuse/ (ignored, never tracked): a clean checkout has none and
runs everything.  It is printed `REUSED`, with the key's first twelve
characters and the date it was taken, and counted apart from PASS.

WHEN NOTHING IS REUSED.  CHOUPO_NO_REUSE=1 (or `bin/runTests --no-reuse`,
which sets it): the hosted tiers (.github/workflows/ci.yml, sanitize.yml)
and a release (RELEASING.md) set it, and a clean checkout has no stored
verdict anyway.  Reuse is offered ONLY to the full sweep: --scope, --fast,
--witnesses and a named case run what they are given.

THE HONESTY ARM.  A gate is keyed only if every repository path its source
(and its import closure) names lies inside its declared inputs; `key` and
`lookup` refuse to key it otherwise and name the path.  This is the static
reader of bin/curate/gate_scan_roots.py applied to every path literal, not
only to walks: a gate that grows a read outside its key stops being reused
the day it does, instead of being reused wrongly.
"""
import ast
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "build" / "reuse"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate_scan_roots as gsr   # noqa: E402

#  THE KEYED GATES.  `trees`: the data the verdict reads (repository paths;
#  git's listing).  `local`: the ignored private tier is read too.  Every
#  gate here also gets the engine half and its harness closure.
KEYED = {
    "check_regressed_pairs": {
        "trees": ["data/standards", "data/curation", "data/groupEstimative",
                  "tutorials/props"],
        "local": True,
        #  Read, and not an input of the verdict, each for a stated reason:
        "pinned": {
            "thirdParty/thermoml": "the local ThermoML cache `choupo-curate "
                "fetch` reads; every article and every extract is checked "
                "against the sha256 its TRACKED case declares and a mismatch "
                "refuses, so only its availability can change the outcome "
                "(exit 2, cannot run, which is never stored)",
        },
        "scratch": {
            "data/held.dat": "a name inside a scratch copy of a case "
                "(bin/choupo-curate, the leave-one-study-out fit), relative "
                "to that copy, never to the repository",
            "data/s": "the same scratch copy's `data/s<n>.dat` names",
        },
        "why": "re-runs about 850 fit cases (1800 runs) to reproduce the "
               "regressed pair and vapour-pressure records; 554 s on the "
               "2026-11-14 sweep",
    },
}

#  GATES LOOKED AT AND NOT KEYED, with the reason (printed by --list).
NOT_KEYED = {
    "check_gate_selftest": "its subject is every gate it sabotages and every "
        "input of those gates; it is pooled instead (C394 decision 3)",
    "check_regressed_electrolytes": "1.8 s on the 2026-11-14 sweep: cheaper "
        "to run than to key",
    "check_transport_records": "1.0 s, and a PAR gate (bin/curate/"
        "suite_lanes.txt) that the segment pool runs before its site is "
        "reached; keying it would mean taking it out of the pool for a second",
    "check_postdict_audit and the case-running gates after the walk": "they "
        "read the walk's own outputs (bin/curate/suite_cache.py), which a "
        "reused case does not produce",
    "check_wasm_dialect": "its input is the emscripten toolchain's verdict on "
        "every source; the toolchain is outside the tree and has no stamp here",
    "check_compile_clean": "reads the compiler's warnings, which depend on "
        "the compiler binary as well as on the sources; it is the build, not "
        "a data check",
    "the case-running gates in general (postprocessing, batch-plan, "
    "design-sheet, ...)": "each reads the cases it runs, the engine and "
        "the catalogue AND, through bin/runTests or bin/runCase, whatever "
        "those scripts read; their path literals were not audited one by one "
        "in this slice, and a gate whose inputs are not enumerated with "
        "confidence is not keyed",
}

#  Trees whose files a case or gate may READ without that being an input of
#  the verdict: scratch and build output.
SCRATCH = ("build", "/tmp", "data/tmp")


def disabled():
    v = os.environ.get("CHOUPO_NO_REUSE", "")
    return v not in ("", "0")


# --------------------------------------------------------------------------
#  hashing
# --------------------------------------------------------------------------

class Hasher:
    """sha256 of a file, cached by (size, mtime_ns)."""

    def __init__(self):
        self.path = STORE / "hashcache.tsv"
        self.cache, self.dirty = {}, False
        try:
            for line in self.path.read_text().splitlines():
                p, s, m, h = line.split("\t")
                self.cache[p] = (int(s), int(m), h)
        except (OSError, ValueError):
            self.cache = {}

    def sha(self, p: Path):
        try:
            st = p.stat()
        except OSError:
            return "MISSING"
        k = str(p)
        c = self.cache.get(k)
        if c and c[0] == st.st_size and c[1] == st.st_mtime_ns:
            return c[2]
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        d = h.hexdigest()
        self.cache[k] = (st.st_size, st.st_mtime_ns, d)
        self.dirty = True
        return d

    def save(self):
        if not self.dirty:
            return
        STORE.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text("".join(f"{p}\t{s}\t{m}\t{h}\n"
                               for p, (s, m, h) in sorted(self.cache.items())))
        os.replace(tmp, self.path)


H = Hasher()


def git_files(paths):
    """Tracked + untracked-not-ignored files under `paths` (repository-relative)."""
    p = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-co",
                        "--exclude-standard", "-z", "--"] + list(paths),
                       capture_output=True, text=True)
    if p.returncode != 0:
        return None
    return sorted({f for f in p.stdout.split("\0") if f})


def digest(pairs):
    h = hashlib.sha256()
    for a, b in pairs:
        h.update(a.encode() + b"\0" + b.encode() + b"\n")
    return h.hexdigest()


def platform_build():
    """The platform build the root symlinks point at (the one runTests runs)."""
    link = ROOT / "choupoProps"
    try:
        target = (ROOT / os.readlink(link)).resolve() if link.is_symlink() \
            else None
    except OSError:
        target = None
    if target is None or not target.exists():
        return None
    return target.parent


def engine_half():
    """-> (digest, n_objects) or (None, reason)."""
    b = platform_build()
    if b is None:
        return None, "no platform build behind ./choupoProps"
    pairs = []
    objs = sorted((b / "src").rglob("*.o"))
    if not objs:
        return None, f"no objects under {b}/src"
    for o in objs:
        rel = o.relative_to(b).as_posix()
        d = o.with_suffix(".d")
        deps = []
        if d.is_file():
            t = d.read_text(errors="ignore").replace("\\\n", " ")
            first = t.split("\n", 1)[0]
            deps = first.split(":", 1)[1].split() if ":" in first else []
        if any(x.endswith("generated/gitVersion.H") for x in deps):
            #  the commit hash only: key the object on its other sources
            for x in deps:
                if not x.endswith("generated/gitVersion.H"):
                    pairs.append((rel + "<" + x, H.sha(ROOT / x)))
        else:
            pairs.append((rel, H.sha(o)))
    for s in sorted(b.glob(".stamp-*")):
        pairs.append(("stamp", s.name))
    return digest(pairs), len(objs)


def data_half(trees, local):
    files = git_files(trees)
    if files is None:
        return None, "git ls-files failed"
    pairs = [(f, H.sha(ROOT / f)) for f in files]
    if local:
        loc = ROOT / "data" / "local"
        if loc.is_dir():
            for p in sorted(loc.rglob("*")):
                if p.is_file():
                    pairs.append((p.relative_to(ROOT).as_posix(), H.sha(p)))
    return digest(pairs), len(pairs)


# --------------------------------------------------------------------------
#  the harness closure
# --------------------------------------------------------------------------

def _bin_names():
    return {p.name for p in (ROOT / "bin").iterdir() if p.is_file()}


def _is_python(p: Path):
    if p.suffix == ".py":
        return True
    try:
        return p.read_bytes()[:64].startswith(b"#!") and \
            b"python" in p.read_bytes()[:64]
    except OSError:
        return False


def _literals(tree):
    """String constants that are not docstrings."""
    doc = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.ClassDef,
                             ast.AsyncFunctionDef)) and node.body and \
                isinstance(node.body[0], ast.Expr) and \
                isinstance(node.body[0].value, ast.Constant):
            doc.add(id(node.body[0].value))
    return [n.value for n in ast.walk(tree)
            if isinstance(n, ast.Constant) and isinstance(n.value, str)
            and id(n) not in doc]


def harness_closure(seeds):
    """The files a set of scripts execute: bin/curate imports and the bin/
    scripts their string literals name, recursively."""
    names = _bin_names()
    seen, todo = set(), [Path(s) for s in seeds]
    while todo:
        p = todo.pop()
        if p in seen or not p.is_file():
            continue
        seen.add(p)
        if not _is_python(p):
            continue
        m = gsr._module(p, ROOT)
        todo += [ROOT / "bin" / "curate" / (n + ".py") for n in m.imports()]
        for s in _literals(m.tree):
            for w in re.findall(r"(?:^|/|\b)bin/([A-Za-z0-9_.-]+)", s):
                if w in names:
                    todo.append(ROOT / "bin" / w)
            if s in names:
                todo.append(ROOT / "bin" / s)
            for w in re.findall(r"bin/curate/([A-Za-z0-9_]+\.py)", s):
                todo.append(ROOT / "bin" / "curate" / w)
            if re.fullmatch(r"[A-Za-z0-9_]+\.py", s) and \
                    (ROOT / "bin" / "curate" / s).is_file():
                todo.append(ROOT / "bin" / "curate" / s)
    return sorted(seen)


def referenced_paths(files):
    """Every repository path the sources name (walk roots and literals)."""
    out = set()
    tops = {p.name for p in ROOT.iterdir() if p.is_dir() and
            not p.name.startswith(".")}
    for p in files:
        if not _is_python(p):
            continue
        m = gsr._module(p, ROOT)
        for node in ast.walk(m.tree):
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
                v = m.ev(node)
                for x in v or ():
                    if isinstance(x, gsr._Path) and x.rel:
                        out.add(x.rel)
        for s in _literals(m.tree):
            s2 = s.strip()
            if "/" in s2 and " " not in s2 and s2.split("/")[0] in tops:
                out.add(s2.rstrip("/"))
    return out


def outside(paths, spec, harness):
    """The referenced paths a key would not cover."""
    trees = spec["trees"]
    exempt = list(spec.get("pinned", {})) + list(spec.get("scratch", {}))
    hrel = {h.relative_to(ROOT).as_posix() for h in harness}
    bad = []
    for r in sorted(paths):
        if r.startswith(SCRATCH) or r.startswith("src/") or r == "src":
            continue                              # scratch, or the engine half
        if r in hrel or any(r == t or r.startswith(t + "/") for t in trees):
            continue
        if any(r == e or r.startswith(e + "/") for e in exempt):
            continue                              # declared, with its reason
        if (ROOT / r).is_dir() and any(h.startswith(r + "/") for h in hrel):
            continue                              # a directory of the harness
                                                  # (sys.path, a script's home)
        if r.startswith("bin/") and (ROOT / r).is_file():
            #  a script named in a literal the closure did not follow
            bad.append(r)
            continue
        if r in ("choupoProps", "choupoSolve", "choupoBatch", "choupoCtrl",
                 "choupoSemiContinuous", "generated/gitVersion.H"):
            continue                              # the engine half
        if any(t.startswith(r + "/") for t in trees + exempt):
            continue                              # a parent of a keyed tree
        bad.append(r)
    return bad


def platform_half():
    return f"{platform.machine()} python{sys.version_info[0]}.{sys.version_info[1]}"


# --------------------------------------------------------------------------
#  gate keys
# --------------------------------------------------------------------------

def gate_key(stem):
    """-> (key, detail) or (None, reason)."""
    spec = KEYED.get(stem)
    if spec is None:
        return None, f"{stem} is not a keyed gate"
    gate = ROOT / "bin" / "curate" / f"{stem}.py"
    harness = harness_closure([gate])
    bad = outside(referenced_paths(harness), spec, harness)
    if bad:
        return None, (f"NOT KEYED: its source names {len(bad)} path(s) outside "
                      f"its declared inputs, first {bad[0]}")
    eng, n_obj = engine_half()
    if eng is None:
        return None, f"NOT KEYED: engine half unreadable ({n_obj})"
    dat, n_dat = data_half(spec["trees"], spec.get("local"))
    if dat is None:
        return None, f"NOT KEYED: {n_dat}"
    har = digest([(h.relative_to(ROOT).as_posix(), H.sha(h)) for h in harness])
    key = digest([("engine", eng), ("data", dat), ("harness", har),
                  ("platform", platform_half()), ("gate", stem)])
    H.save()
    return key, (f"{n_obj} engine objects, {n_dat} data files under "
                 f"{', '.join(spec['trees'])}"
                 + (" + data/local" if spec.get("local") else "")
                 + f", {len(harness)} harness files")


def _store_file(stem):
    return STORE / "gates" / f"{stem}.json"


def lookup(stem):
    if disabled():
        print("reuse is off (CHOUPO_NO_REUSE)")
        return 2
    key, detail = gate_key(stem)
    if key is None:
        print("-")
        print(detail, file=sys.stderr)
        return 1
    try:
        st = json.loads(_store_file(stem).read_text())
    except (OSError, ValueError):
        st = None
    if st and st.get("key") == key:
        print(f"PASS taken {st['date']}, key {key[:12]}; its inputs are "
              f"unchanged ({detail}).  Its claim then: {st.get('claim', '')}")
        return 0
    print(key)
    return 1


def store(stem, key, out_file):
    if disabled() or key in ("", "-"):
        return 0
    claim = ""
    try:
        lines = [l for l in Path(out_file).read_text(errors="ignore")
                 .splitlines() if l.strip()]
        claim = lines[0][:300] if lines else ""
    except OSError:
        pass
    (STORE / "gates").mkdir(parents=True, exist_ok=True)
    tmp = _store_file(stem).with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"key": key, "claim": claim,
                               "date": time.strftime("%Y-%m-%d %H:%M UTC",
                                                     time.gmtime())}) + "\n")
    os.replace(tmp, _store_file(stem))
    return 0


# --------------------------------------------------------------------------
#  the curation cases
# --------------------------------------------------------------------------

RUNTESTS_FN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{", re.M)


def runtests_functions(text):
    """{name: body text} of every top-level function of bin/runTests."""
    out = {}
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        m = RUNTESTS_FN.match(lines[i])
        if not m:
            i += 1
            continue
        name, j = m.group(1), i
        if lines[i].rstrip().endswith("}") and lines[i].count("{") <= \
                lines[i].count("}"):
            out[name] = lines[i]
            i += 1
            continue
        j = i + 1
        while j < len(lines) and lines[j].rstrip() != "}":
            j += 1
        out[name] = "\n".join(lines[i:j + 1])
        i = j + 1
    return out


def case_harness():
    """-> (digest, n) of what check_case executes."""
    text = (ROOT / "bin" / "runTests").read_text(errors="ignore")
    fns = runtests_functions(text)
    seen, todo = set(), ["check_case_body", "check_case"]
    while todo:
        f = todo.pop()
        if f in seen or f not in fns:
            continue
        seen.add(f)
        for g in fns:
            if g not in seen and re.search(r"(?<![\w-])" + re.escape(g)
                                           + r"(?![\w-])", fns[f]):
                todo.append(g)
    body = "\n".join(fns[f] for f in sorted(seen))
    scripts = set()
    for w in re.findall(r"\$ROOT/(bin/[A-Za-z0-9_./-]+)", body):
        if (ROOT / w).is_file():
            scripts.add(ROOT / w)
    for w in re.findall(r"\$ROOT/(bin/curate/golden_bands)\.py", body):
        scripts.add(ROOT / "bin" / "curate" / "golden_bands.tsv")
    scripts.add(ROOT / "bin" / "curate" / "golden_bands.tsv")
    scripts.add(ROOT / "bin" / "curate" / "recording_platform.txt")
    files = harness_closure(sorted(scripts))
    files = sorted(set(files) | {s for s in scripts if s.is_file()})
    pairs = [("fn:" + f, hashlib.sha256(fns[f].encode()).hexdigest())
             for f in sorted(seen)]
    pairs += [(p.relative_to(ROOT).as_posix(), H.sha(p)) for p in files]
    mode = os.environ.get("CHOUPO_REUSE_GOLDEN_MODE", "")
    pairs.append(("golden-mode", mode))
    return digest(pairs), (sorted(seen), files)


def case_plan(root_rel):
    """One line per case under root_rel: <dir>\\t<key>\\t<labels|->\\t<date>."""
    if disabled():
        return 2
    eng, n_obj = engine_half()
    if eng is None:
        print(f"# not keyed: engine half unreadable ({n_obj})", file=sys.stderr)
        return 1
    dat, n_dat = data_half(["data/standards", "data/groupEstimative",
                            "data/README.md"], True)
    har, _ = case_harness()
    base = digest([("engine", eng), ("data", dat), ("harness", har),
                   ("platform", platform_half())])
    files = git_files([root_rel]) or []
    #  the case directories: those holding system/controlDict
    cases = sorted({f[:-len("/system/controlDict")] for f in files
                    if f.endswith("/system/controlDict")})
    caseset = set(cases)
    per = {c: [] for c in cases}
    loose = {}
    for f in files:
        d = os.path.dirname(f)
        owner = None
        while d and d != root_rel.rstrip("/"):
            if d in caseset:
                owner = d
                #  keep climbing: a nested case's files belong to the outer
                #  case too (the walk runs it inside the outer one)
            d = os.path.dirname(d)
        if owner is None:
            loose.setdefault(os.path.dirname(f), []).append(f)
        #  every enclosing case gets the file
        d = os.path.dirname(f)
        while d and d != root_rel.rstrip("/"):
            if d in caseset:
                per[d].append(f)
            d = os.path.dirname(d)
    for c in cases:
        pairs = [(f, H.sha(ROOT / f)) for f in per[c]]
        #  loose files in the directories above the case (a README beside two
        #  sibling cases) -- generous: never read, but cheap to include
        d = os.path.dirname(c)
        while d and d.startswith(root_rel.rstrip("/")):
            pairs += [(f, H.sha(ROOT / f)) for f in loose.get(d, [])]
            d = os.path.dirname(d)
        key = digest([("base", base)] + sorted(pairs))
        stored = STORE / "cases" / (c.replace("/", "__") + ".tsv")
        labels, date = "-", "-"
        try:
            lines = stored.read_text().splitlines()
            if len(lines) >= 3 and lines[0] == key:
                date, labels = lines[1], "\x1f".join(lines[2:])
        except OSError:
            pass
        print(f"{c}\t{key}\t{labels}\t{date}")
    H.save()
    return 0


# --------------------------------------------------------------------------
#  --fast FIRST (C394 decision 2): the stamp of the tree a clean --fast pass
#  was taken on
# --------------------------------------------------------------------------

FAST_STAMP = ROOT / "build" / "fastStamp.json"


def tree_key():
    """HEAD, the working tree's diff against it, and the untracked files --
    what `git` would need to reproduce this tree.  Ignored files (run outputs,
    build/) are not the tree."""
    head = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"],
                          capture_output=True, text=True).stdout.strip()
    diff = subprocess.run(["git", "-C", str(ROOT), "diff", "HEAD", "--binary",
                           "--no-ext-diff", "--no-color"],
                          capture_output=True).stdout
    unt = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-o",
                          "--exclude-standard", "-z"],
                         capture_output=True, text=True).stdout
    pairs = [("head", head), ("diff", hashlib.sha256(diff).hexdigest())]
    pairs += [(f, H.sha(ROOT / f)) for f in sorted(x for x in unt.split("\0")
                                                   if x)]
    H.save()
    dirty = "clean" if not diff and not unt.strip("\0") else "with local changes"
    return digest(pairs), head, dirty


def fast_stamp(argv):
    if argv[:1] == ["write"] and len(argv) == 3:
        key, head, dirty = tree_key()
        if key != argv[1]:
            print("[fast first] NO STAMP WRITTEN: the tree changed while --fast "
                  "ran (HEAD, a tracked edit or an untracked file), so its pass "
                  "describes a tree that is no longer here")
            return 1
        FAST_STAMP.parent.mkdir(parents=True, exist_ok=True)
        tmp = FAST_STAMP.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps({
            "key": key, "head": head, "tree": dirty, "tally": argv[2],
            "date": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())}) + "\n")
        os.replace(tmp, FAST_STAMP)
        print(f"[fast first] stamp written: the sweep may start on this tree "
              f"(HEAD {head[:10]}, {dirty}; build/fastStamp.json)")
        return 0
    if argv[:1] == ["check"]:
        key, head, dirty = tree_key()
        try:
            st = json.loads(FAST_STAMP.read_text())
        except (OSError, ValueError):
            print("[fast first] NO --fast PASS is recorded in this checkout "
                  "(build/fastStamp.json is absent)")
            return 1
        if st.get("key") != key:
            why = (f"HEAD moved ({st.get('head', '?')[:10]} -> {head[:10]})"
                   if st.get("head") != head else
                   "the working tree changed (a tracked edit or an untracked "
                   "file)")
            print(f"[fast first] the last --fast pass ({st.get('date')}) was "
                  f"taken on ANOTHER tree: {why}")
            return 1
        print(f"--fast passed on this tree {st.get('date')} ({st.get('tally')}; "
              f"HEAD {head[:10]}, {dirty})")
        return 0
    if argv[:1] == ["key"]:
        print(tree_key()[0])
        return 0
    return 2


def main(argv):
    if argv[:1] == ["lookup"] and len(argv) == 2:
        return lookup(argv[1])
    if argv[:1] == ["tree-key"]:
        print(tree_key()[0])
        return 0
    if argv[:1] == ["fast-stamp"]:
        return fast_stamp(argv[1:])
    if argv[:1] == ["store"] and len(argv) == 4:
        return store(argv[1], argv[2], argv[3])
    if argv[:1] == ["case-plan"] and len(argv) == 2:
        return case_plan(argv[1].rstrip("/"))
    if argv[:1] == ["key"] and len(argv) == 2:
        t0 = time.monotonic()
        key, detail = gate_key(argv[1])
        print(f"{key or '-'}  {detail}  ({time.monotonic() - t0:.1f} s)")
        return 0 if key else 1
    if argv[:1] == ["--list"]:
        print("KEYED:")
        for g, s in KEYED.items():
            print(f"  {g}: {s['why']}")
            print(f"    inputs: the engine objects, {', '.join(s['trees'])}"
                  + (", data/local" if s.get("local") else "")
                  + ", its harness closure")
            for p, why in {**s.get("pinned", {}), **s.get("scratch", {})}.items():
                print(f"    read, not keyed: {p} -- {why}")
        print("  the curation fits (bin/curate/curation_roots.py), case by "
              "case: about 1260 choupoProps runs, 11534 s of one-core work on "
              "the 2026-11-14 sweep")
        print("NOT KEYED:")
        for g, why in NOT_KEYED.items():
            print(f"  {g}: {why}")
        return 0
    print(__doc__.split("\n\n")[1])
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
