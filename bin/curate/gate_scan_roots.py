#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""WHERE A GATE LOOKS BY PATTERN -- the scan roots of every gate, read from
its source (DEV.md 4c C394 and C398 (a)+(b), 2026-11-14).

    bin/curate/gate_scan_roots.py                 the table, one gate per line
    bin/curate/gate_scan_roots.py --gate NAME     one gate, with line numbers
    bin/curate/gate_scan_roots.py --match FILE..  the gates a file reaches by root
    bin/curate/gate_scan_roots.py --unresolved    the walks no root was read for
    bin/curate/gate_scan_roots.py --generators    the roots of each generator check

WHY THIS EXISTS.  `bin/integrate --plan` listed the gates whose source NAMES a
touched file.  A gate that walks a directory by pattern names no file: the
full sweep of `integ/c398ab` failed four gates its plan had not listed, and
three of the four were of that kind (check_std_includes walks src/,
check_debt_registry globs bin/curate/check_*.py, check_origin_census globs
data/standards/**/*.dat).  "Which gates can a file reach?" therefore has two
halves: the gates that name it, and the gates whose scan roots contain it.
This module is the one home of the second half.

HOW THE ROOTS ARE READ.  Statically, from the gate's syntax tree -- never by
importing it (a gate runs its checks at import time).  A WALK is a call of
`.rglob`, `.glob`, `.iterdir`, `os.walk`, `os.listdir`, `os.scandir`,
`glob.glob` or a `git ls-files` / `git grep` argument list.  Its base is
evaluated as a repository path: `Path(__file__)` chains (`.parent`,
`.parents[k]`, `.resolve()`), `os.path.dirname/abspath/join`, `/` and
`.joinpath`, f-strings, string constants, module names bound to any of those
(every assignment of a name counts, so a name bound twice gives both), and
`for` loops over a list of them.  It is deliberately GENEROUS: a pattern is
matched with fnmatch, whose `*` crosses `/`, and a walk whose filter sits in
the loop body (`os.walk` then `endswith`) is taken as reaching every file
under its root.  A wrongly included gate costs seconds in a plan; a wrongly
excluded one is a failure the sweep finds an hour later.

Helper modules count: a walk inside a `bin/curate` module the gate imports is
the gate's walk too (the import closure is read the same way), and so is a
walk inside a bin/curate script the gate RUNS -- named by a literal or a path
expression ending in bin/curate/<x>.py (review SE-08: check_brain_fresh runs
gen_brain_facts.py in a subprocess and was invisible).

THE NON-CHECK GATES (review SE-09): the `--check` arm of every generator
bin/curate/generated_artefacts.py registers is a gate too; `--generators`
lists the roots of each (the scan roots of the script its check runs, and the
files it owns), and bin/integrate --plan lists the ones a diff reaches.

THE RATCHET (review SE-09): `unresolved_gates()` is the set of gates with a
walk in their own source this reader cannot evaluate and no SCAN_ROOTS; it is
pinned by name in debt_registry.SCAN_ROOTS_UNRESOLVED and held by
check_scan_roots: it may only shrink.

A DECLARED LIST WINS NOTHING AND LOSES NOTHING: a gate may state
`SCAN_ROOTS = ("dir", "dir/sub", "dir/**/*.dat", ...)` at module level (a
glob is allowed; `SCAN_ROOTS = ()` says, with a comment, that a walk reaches
only the gate's own scratch copy) for a walk this reader
cannot evaluate (a root computed at run time, a list built in a function);
those roots are ADDED to what is read.  Three gates declared one before this
module existed (check_doctrine, check_glossary_bans, check_retired_names) and
are read the same way.

WHAT IT DOES NOT SEE, stated: a walk whose base is a function parameter or a
value computed at run time (a temporary directory, a case copied to /tmp) is
listed by `--unresolved`; most of those are walks over the gate's OWN
scratch copies and reach nothing in the tree.  A gate that reads every file
through a helper this reader cannot follow is invisible until it declares
SCAN_ROOTS.
"""
import ast
import fnmatch
import posixpath
import re
import sys
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CURATE = ROOT / "bin" / "curate"

WALK_ATTRS = {"rglob": "rglob", "glob": "glob", "iterdir": "iterdir"}
OS_WALKS = {("os", "walk"), ("os", "listdir"), ("os", "scandir")}
_UNRES = None          # an expression this reader cannot evaluate


class _Path:
    """A repository-relative path ('' is the repository root)."""
    __slots__ = ("rel",)

    def __init__(self, rel):
        self.rel = rel.strip("/") if rel not in (".", "./") else ""

    def __hash__(self):
        return hash(("P", self.rel))

    def __eq__(self, other):
        return isinstance(other, _Path) and other.rel == self.rel

    def join(self, part):
        part = part.strip()
        if part.startswith("/"):
            return None
        return _Path(posixpath.normpath(posixpath.join(self.rel, part))
                     if self.rel else posixpath.normpath(part))

    def up(self, n=1):
        rel = self.rel
        for _ in range(n):
            if rel == "":
                return None
            rel = posixpath.dirname(rel)
        return _Path(rel)


class _Module:
    """The evaluable bindings of one source file."""

    def __init__(self, path: Path, root: Path = ROOT, strict=False):
        self.strict = strict
        self.path = path
        self.root = root
        self.rel = path.relative_to(root).as_posix()
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", SyntaxWarning)
                self.tree = ast.parse(path.read_text(errors="ignore"))
        except SyntaxError:
            self.tree = ast.Module(body=[], type_ignores=[])
        self.binds = {}
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Assign):
                for t in node.targets:
                    self._bind(t, node.value)
            elif isinstance(node, ast.AnnAssign) and node.value is not None:
                self._bind(node.target, node.value)
            elif isinstance(node, (ast.For, ast.comprehension)):
                it = node.iter
                self._bind(node.target, ast.Starred(value=it))  # "each of"
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                #  a default argument (`def walk(root=ROOT / "src")`)
                args = node.args
                pos = args.posonlyargs + args.args
                for a, d in zip(pos[len(pos) - len(args.defaults):],
                                args.defaults):
                    self.binds.setdefault(a.arg, []).append(d)
                for a, d in zip(args.kwonlyargs, args.kw_defaults):
                    if d is not None:
                        self.binds.setdefault(a.arg, []).append(d)

    def _bind(self, target, value):
        if isinstance(target, ast.Name):
            self.binds.setdefault(target.id, []).append(value)
        elif isinstance(target, (ast.Tuple, ast.List)):
            #  `a, b = X, Y` binds element-wise; anything else binds each
            #  name to "some element of" the value, which over-approximates.
            if isinstance(value, (ast.Tuple, ast.List)) and \
                    len(value.elts) == len(target.elts):
                for t, v in zip(target.elts, value.elts):
                    self._bind(t, v)
            else:
                for t in target.elts:
                    self._bind(t, ast.Starred(value=value))

    # -- evaluation: a set of _Path | str, or None when unknown ----------
    def ev(self, node, depth=0):
        if depth > 12 or node is None:
            return None
        e = lambda n: self.ev(n, depth + 1)          # noqa: E731
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return {node.value}
        if isinstance(node, ast.Name):
            if node.id == "__file__":
                return {_Path(self.rel)}
            vals = self.binds.get(node.id)
            if not vals:
                return None
            out, unknown = set(), False
            for v in vals:
                r = e(v)
                if r is None:
                    unknown = True
                    continue
                out |= r
            #  A name bound once to a path and again to something this reader
            #  cannot evaluate (`ROOT = wt` in a function that re-points the
            #  module at another tree): LENIENT readers (the plan) take the
            #  bindings they can read -- generous, the other binding is
            #  another copy of the same layout; STRICT readers (a reuse key's
            #  honesty arm) refuse the expression.
            if unknown and (self.strict or not out):
                return None
            return out
        if isinstance(node, ast.Starred):                 # an element of
            inner = node.value
            if isinstance(inner, (ast.List, ast.Tuple, ast.Set)):
                out = set()
                for x in inner.elts:
                    r = e(x)
                    if r is None:
                        return None
                    out |= r
                return out
            r = e(inner)
            if r is None:
                return None
            return r
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            out = set()
            for x in node.elts:
                r = e(x)
                if r is None:
                    return None
                out |= r
            return out
        if isinstance(node, ast.Subscript):
            base = node.value
            #  Path.parents[k]
            if isinstance(base, ast.Attribute) and base.attr == "parents":
                r = e(base.value)
                k = node.slice
                if r is None or not (isinstance(k, ast.Constant)
                                     and isinstance(k.value, int)):
                    return None
                return self._up(r, k.value + 1)
            r = e(base)                                    # LIST[i]
            return r
        if isinstance(node, ast.Attribute):
            if node.attr == "parent":
                r = e(node.value)
                return None if r is None else self._up(r, 1)
            return None
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            return self._join(e(node.left), e(node.right))
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left, right = e(node.left), e(node.right)
            if left is None or right is None:
                return None
            out = set()
            for a in left:
                for b in right:
                    c = self._cat(a, b)
                    if c is None:
                        return None
                    out.add(c)
            return out
        if isinstance(node, ast.JoinedStr):
            parts = [set([""])]
            for v in node.values:
                if isinstance(v, ast.Constant):
                    parts.append({v.value})
                elif isinstance(v, ast.FormattedValue):
                    r = e(v.value)
                    if r is None:
                        return None
                    parts.append(r)
            acc = [""]
            for p in parts[1:]:
                nxt = []
                for a in acc:
                    for b in p:
                        nxt.append((a, b))
                acc = [self._cat(a, b) for a, b in nxt]
                if any(x is None for x in acc):
                    return None
            return set(acc)
        if isinstance(node, ast.Call):
            f = node.func
            name = _dotted(f)
            if name in ("Path", "pathlib.Path", "PurePath", "str",
                        "os.fspath", "os.path.abspath", "os.path.realpath",
                        "os.path.normpath") and node.args:
                r = e(node.args[0])
                if r is None:
                    return None
                if name == "str" or name.startswith("os."):
                    return r
                return {x if isinstance(x, _Path) else _Path(x)
                        if not x.startswith("/") else x for x in r}
            if name == "os.path.dirname" and node.args:
                r = e(node.args[0])
                return None if r is None else self._up(r, 1)
            if name == "os.path.join" and node.args:
                acc = e(node.args[0])
                for a in node.args[1:]:
                    acc = self._join(acc, e(a))
                return acc
            if isinstance(f, ast.Attribute):
                if f.attr in ("resolve", "absolute", "expanduser"):
                    return e(f.value)
                if f.attr == "joinpath":
                    acc = e(f.value)
                    for a in node.args:
                        acc = self._join(acc, e(a))
                    return acc
                if f.attr == "relative_to":
                    return None
            return None
        return None

    @staticmethod
    def _cat(a, b):
        if isinstance(a, str) and a == "" and isinstance(b, _Path):
            return b
        if isinstance(a, _Path) and isinstance(b, str):
            return a.join(b.lstrip("/")) if b.startswith("/") else \
                _Path(a.rel + b)
        if isinstance(a, str) and isinstance(b, str):
            return a + b
        return None

    @staticmethod
    def _up(vals, n):
        out = set()
        for v in vals:
            if isinstance(v, str):
                if v.startswith("/"):
                    return None
                v = _Path(v)
            u = v.up(n)
            if u is None:
                return None
            out.add(u)
        return out

    @staticmethod
    def _join(left, right):
        if left is None or right is None:
            return None
        out = set()
        for a in left:
            for b in right:
                if not isinstance(b, str):
                    return None
                if isinstance(a, str):
                    if a.startswith("/"):
                        return None
                    a = _Path(a)
                j = a.join(b)
                if j is None:
                    return None
                out.add(j)
        return out

    # -- the walks -------------------------------------------------------
    def walks(self):
        """-> (resolved, unresolved): resolved = [(root, pattern, line)],
        unresolved = [(line, text)]."""
        res, unres = [], []
        for node in ast.walk(self.tree):
            if not isinstance(node, ast.Call):
                continue
            f = node.func
            kind = base = pat = None
            if isinstance(f, ast.Attribute) and f.attr in WALK_ATTRS and \
                    _dotted(f) not in ("glob.glob",):
                kind, base = f.attr, f.value
                if kind in ("rglob", "glob"):
                    if node.args and isinstance(node.args[0], ast.Constant) \
                            and isinstance(node.args[0].value, str):
                        p = node.args[0].value
                    else:
                        r = self.ev(node.args[0]) if node.args else None
                        p = None if r is None or len(r) != 1 or \
                            not isinstance(next(iter(r)), str) else next(iter(r))
                    pat = "*" if p is None else p
                    if kind == "rglob":
                        pat = "**/" + pat
                else:
                    pat = "*"
            elif _dotted(f) in ("os.walk",):
                kind, base, pat = "walk", node.args[0] if node.args else None, "**"
            elif _dotted(f) in ("os.listdir", "os.scandir"):
                kind, base, pat = "list", node.args[0] if node.args else \
                    ast.Constant(value="."), "*"
            elif _dotted(f) in ("glob.glob", "glob.iglob"):
                kind = "globfn"
                r = self.ev(node.args[0]) if node.args else None
                if r is None:
                    unres.append((node.lineno, ast.unparse(node)[:100]))
                    continue
                for v in r:
                    if isinstance(v, _Path):
                        v = v.rel
                    if v.startswith("/"):
                        continue
                    root, p = _split_glob(v)
                    res.append((root, p, node.lineno))
                continue
            else:
                lst = _git_list(node)
                if lst is not None:
                    for spec in lst or [""]:
                        root, p = _split_glob(spec)
                        res.append((root, p if spec else "**", node.lineno))
                continue
            if kind is None:
                continue
            r = self.ev(base)
            if r is None:
                unres.append((node.lineno, ast.unparse(node)[:100]))
                continue
            for v in r:
                if isinstance(v, str):
                    if v.startswith("/") or v == "":
                        if v == "":
                            v = _Path("")
                        else:
                            continue
                    else:
                        v = _Path(v)
                if v.rel.startswith("build") or v.rel.startswith(".."):
                    continue
                res.append((v.rel, pat, node.lineno))
        #  A declared SCAN_ROOTS (module level) adds its roots.
        for node in self.tree.body:
            if isinstance(node, ast.Assign) and any(
                    isinstance(t, ast.Name) and t.id == "SCAN_ROOTS"
                    for t in node.targets):
                r = self.ev(node.value)
                for v in r or ():
                    rel = v.rel if isinstance(v, _Path) else v
                    if not rel.startswith("/"):
                        root, pat = _split_glob(rel)   # a glob is allowed
                        res.append((root, pat, node.lineno))
        return res, unres

    def imports(self):
        """bin/curate modules this file imports (by module name)."""
        names = set()
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                names |= {a.name.split(".")[0] for a in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module and \
                    not node.level:
                names.add(node.module.split(".")[0])
        cur = self.root / "bin" / "curate"
        return {n for n in names if (cur / (n + ".py")).is_file()}

    def scripts(self):
        """bin/curate scripts this file RUNS (review SE-08): a gate that
        starts a generator in a subprocess (`check_brain_fresh` runs
        `gen_brain_facts.py --check`) reads what that script reads.  Named by
        a string literal or a path expression that ends in bin/curate/<x>.py."""
        cur = self.root / "bin" / "curate"
        out = set()
        for node in ast.walk(self.tree):
            vals = []
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                vals = [node.value]
            elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
                vals = [v.rel for v in (self.ev(node) or ())
                        if isinstance(v, _Path)]
            for v in vals:
                m = re.search(r"(?:^|/)bin/curate/([A-Za-z0-9_]+\.py)$", v.strip())
                if m and (cur / m.group(1)).is_file():
                    out.add(cur / m.group(1))
        return out

    def declares_scan_roots(self):
        return any(isinstance(n, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "SCAN_ROOTS" for t in n.targets)
            for n in self.tree.body)


def _dotted(f):
    parts = []
    while isinstance(f, ast.Attribute):
        parts.append(f.attr)
        f = f.value
    if isinstance(f, ast.Name):
        parts.append(f.id)
        return ".".join(reversed(parts))
    return ""


def _git_list(call):
    """The pathspecs of a `git ls-files` / `git grep` argument list in a
    subprocess call; [] for the whole tree; None when the call is no such."""
    for a in call.args[:1]:
        if isinstance(a, (ast.List, ast.Tuple)):
            words = [x.value if isinstance(x, ast.Constant) and
                     isinstance(x.value, str) else None for x in a.elts]
            if "git" in words and ("ls-files" in words or "grep" in words):
                i = words.index("ls-files") if "ls-files" in words else \
                    words.index("grep")
                tail = words[i + 1:]
                if "grep" in words and "--" not in tail:
                    return []
                if "--" in tail:
                    tail = tail[tail.index("--") + 1:]
                return [w for w in tail if w and not w.startswith("-")]
    return None


def _split_glob(spec):
    spec = spec.strip("/")
    parts = spec.split("/")
    root = []
    for p in parts:
        if any(c in p for c in "*?["):
            break
        root.append(p)
    rest = parts[len(root):]
    if not rest:                     # a plain path: a directory or a file
        return "/".join(root), "**"
    return "/".join(root), "/".join(rest)


_CACHE = {}


def _module(path: Path, root: Path, strict=False):
    k = (path, strict)
    if k not in _CACHE:
        _CACHE[k] = _Module(path, root, strict)
    return _CACHE[k]


def scan_roots(gate: Path, root: Path = ROOT):
    """-> (roots, unresolved) for one gate, its bin/curate imports included.
    roots = sorted {(root, pattern)}; unresolved = [(file, line, text)]."""
    seen, todo = set(), [gate]
    roots, unres = {}, []
    while todo:
        p = todo.pop()
        if p in seen:
            continue
        seen.add(p)
        m = _module(p, root)
        r, u = m.walks()
        for base, pat, line in r:
            roots.setdefault((base, pat), (m.rel, line))
        unres += [(m.rel, ln, t) for ln, t in u]
        todo += [root / "bin" / "curate" / (n + ".py") for n in m.imports()]
        todo += sorted(m.scripts())          # what it runs, it reads
    return roots, unres


def matches(rel_file, root, pat):
    """Does a repository file lie under (root, pattern)?  Generous."""
    if root:
        if rel_file != root and not rel_file.startswith(root + "/"):
            return False
        rest = rel_file[len(root) + 1:] if rel_file != root else \
            posixpath.basename(rel_file)
    else:
        rest = rel_file
    if pat in ("**", "*", "**/*"):
        return True
    if pat.startswith("**/"):
        tail = pat[3:]
        return fnmatch.fnmatch(posixpath.basename(rest), tail) or \
            fnmatch.fnmatch(rest, tail) or fnmatch.fnmatch(rest, "*/" + tail)
    return fnmatch.fnmatch(rest, pat)


def gate_table(root: Path = ROOT):
    """{gate stem: {(root, pattern): (file, line)}} for every gate."""
    out = {}
    for g in sorted((root / "bin" / "curate").glob("check_*.py")):
        out[g.stem] = scan_roots(g, root)[0]
    return out


def reached(files, root: Path = ROOT):
    """{gate stem: [(file, 'root/pattern')]} for the touched files."""
    out = {}
    for stem, rs in gate_table(root).items():
        for f in files:
            for (r, p) in rs:
                if matches(f, r, p):
                    out.setdefault(stem, []).append(
                        (f, (r + "/" if r else "") + p))
                    break
    return out


def generator_table(root: Path = ROOT):
    """THE NON-CHECK GATES (review SE-09): the `--check` arm of every
    generator bin/curate/generated_artefacts.py registers is a gate too
    (bin/runTests runs them), and a generator's inputs are found the same way:
    the scan roots of the script its check runs, plus the files it owns.
    -> {entry name: (check argv text, {(root, pattern)})}."""
    sys.path.insert(0, str(root / "bin" / "curate"))
    try:
        import generated_artefacts as ga
    finally:
        sys.path.pop(0)
    out = {}
    for e in ga.ENTRIES:
        argv = e.get("check")
        if not argv:
            continue
        scripts = [a for a in argv if a.startswith("bin/curate/")
                   and a.endswith(".py")]
        rs = set()
        for sc in scripts:
            if (root / sc).is_file():
                rs |= set(scan_roots(root / sc, root)[0])
        for g in e["paths"]:
            rs.add(_split_glob(g))
        out[e["name"]] = (" ".join(argv), rs)
    return out


def generators_reached(files, root: Path = ROOT):
    """{generator entry: [(file, 'root/pattern')]} for the touched files."""
    out = {}
    for name, (argv, rs) in generator_table(root).items():
        for f in files:
            for (r, p) in rs:
                if matches(f, r, p):
                    out.setdefault(name, (argv, []))[1].append(
                        (f, (r + "/" if r else "") + p))
                    break
    return out


def unresolved_gates(root: Path = ROOT):
    """THE RATCHET'S SUBJECT (review SE-09): gates with a walk in their OWN
    source whose root this reader cannot evaluate and no SCAN_ROOTS
    declaration -- invisible to the plan for that walk.
    -> {gate stem: 'file:line text' of the first such walk}."""
    out = {}
    for g in sorted((root / "bin" / "curate").glob("check_*.py")):
        m = _module(g, root)
        if m.declares_scan_roots():
            continue
        _, u = m.walks()
        if u:
            ln, t = sorted(u)[0]
            out[g.stem] = f"{m.rel}:{ln} {t}"
    return out


def main(argv):
    if argv[:1] == ["--gate"] and len(argv) == 2:
        g = CURATE / (argv[1] if argv[1].endswith(".py") else argv[1] + ".py")
        roots, unres = scan_roots(g)
        for (r, p), (f, ln) in sorted(roots.items()):
            print(f"  {(r + '/' if r else '') + p:<50} {f}:{ln}")
        for f, ln, t in unres:
            print(f"  UNRESOLVED {f}:{ln}  {t}")
        return 0
    if argv[:1] == ["--match"]:
        for stem, hits in sorted(reached(argv[1:]).items()):
            print(f"{stem:<44} <- {hits[0][0]} (root {hits[0][1]})")
        return 0
    if argv[:1] == ["--generators"]:
        for name, (cmd, rs) in sorted(generator_table().items()):
            print(f"{name}: {cmd}\n    " + ", ".join(
                sorted((r + "/" if r else "") + p for r, p in rs)))
        return 0
    if argv[:1] == ["--unresolved"]:
        n = 0
        for g in sorted(CURATE.glob("check_*.py")):
            for f, ln, t in scan_roots(g)[1]:
                if f == g.relative_to(ROOT).as_posix():
                    print(f"{f}:{ln}  {t}")
                    n += 1
        print(f"{n} walk(s) with no root read (most walk the gate's own "
              "scratch copies)")
        return 0
    if argv:
        print(__doc__.split("\n\n")[1])
        return 2
    t = gate_table()
    n = sum(1 for v in t.values() if v)
    for stem, rs in t.items():
        if rs:
            print(f"{stem}: " + ", ".join(sorted((r + "/" if r else "") + p
                                                 for r, p in rs)))
    print(f"{n} of {len(t)} gates walk the tree by pattern (roots read "
          "from their source)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
