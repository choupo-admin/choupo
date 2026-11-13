#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""repoint_lesson_citations -- re-point GUI lessons' `file:line` citations.

WHY THIS EXISTS (DEV.md 4c C196).  An EduTool lesson cites the engine by
`file:line`, and a test holds the cited line to the CONTENT the lesson claims
for it.  So any edit that moves lines in a cited file turns lesson tests red,
and the repair -- find where the claimed text went, edit the number in the
source AND in the test's table -- was done by hand, in four files, with
ad-hoc scripts, in one week.  This is the one tool for it.

WHAT IT DOES.  For every citation it can read it checks that the claim still
holds at the cited line(s).  A stale one is re-pointed to the unique place,
within a window around the old line (default +/-40), where the claim holds,
and the number is edited everywhere the same citation is written (the lesson
source, the test's table key, other lessons citing the same token).  An
ambiguous claim (two places) or a missing one (none) REFUSES BY NAME and is
never guessed.  `--check` only reports (exit 1 if anything is stale or
refused); without it the edits are written (exit 1 only if something refused).

THE SHAPES IT MANAGES (the inventory is in
docs/design/integration-has-a-cost.md; `--inventory` reprints it for the tree):

  R  record     { file: MAIN, line: 521, contains: "text" }      (gui/src)
  C  claims     "Base.cpp:383": "text" | /regex/ | [path, a, b, claim]
                (a key in a test's CLAIMS table; the key repeats the number
                that the lesson source writes as prose `Base.cpp:383`)
  T  anchors    ["path-or-Base.cpp", 1612, "text"]     (a test's ANCHORS)
                no claim in the prose: the prose range that CONTAINS the
                anchor is shifted by the same amount

Prose tokens `X.cpp:N` / `X.cpp:N-M` anywhere in gui/src and gui/tests are
rewritten from one old->new map, so a number is never moved in one place and
left in another.  A token no managed claim covers is NOT touched (it is listed
by `--inventory` as unmanaged: a hand-computed test, e.g. overpressure's
`/PropertyEvaluator\\.cpp:(\\d+)/.exec(...)`, is outside this tool).

LIMITS, STATED: it does not know whether a claim is TRUE of the engine, only
where the text the lesson already claims now sits; a claim that matches two
lines in the window is refused rather than disambiguated; line-count growth in
a cited file beyond the window needs `--window`.
"""
import argparse
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT_DEFAULT = os.path.dirname(os.path.dirname(HERE))

SKIP_DIRS = {"node_modules", "build", ".git", "dist", "_dist", "wasm"}
EXT = (".ts", ".tsx")


# ---------------------------------------------------------------- TS literals
def parse_string(t, i):
    """Parse a JS string literal at t[i]; returns (value, end) or None."""
    q = t[i]
    if q not in "\"'`":
        return None
    j = i + 1
    out = []
    while j < len(t):
        c = t[j]
        if c == "\\":
            n = t[j + 1]
            out.append({"n": "\n", "t": "\t", "r": "\r"}.get(n, n))
            j += 2
            continue
        if q == "`" and c == "$" and t[j + 1:j + 2] == "{":
            return None
        if c == q:
            return "".join(out), j + 1
        if c == "\n" and q != "`":
            return None
        out.append(c)
        j += 1
    return None


def parse_regex(t, i):
    """Parse a JS regex literal at t[i]=='/'; returns (compiled, end)."""
    if t[i] != "/":
        return None
    j = i + 1
    cls = False
    while j < len(t):
        c = t[j]
        if c == "\\":
            j += 2
            continue
        if c == "[":
            cls = True
        elif c == "]":
            cls = False
        elif c == "/" and not cls:
            break
        elif c == "\n":
            return None
        j += 1
    else:
        return None
    body = t[i + 1:j]
    k = j + 1
    fl = 0
    while k < len(t) and t[k] in "gimsuy":
        fl |= {"i": re.I, "m": re.M, "s": re.S}.get(t[k], 0)
        k += 1
    try:
        return re.compile(body, fl), k
    except re.error:
        return None


def skip_ws(t, i):
    while i < len(t) and t[i] in " \t\r\n":
        i += 1
    return i


def parse_claim(t, i):
    """A claim: string (with `+` concatenation) or regex.  (claim, end)|None."""
    i = skip_ws(t, i)
    r = parse_regex(t, i)
    if r:
        return r
    s = parse_string(t, i)
    if not s:
        return None
    val, end = s
    while True:
        k = skip_ws(t, end)
        if t[k:k + 1] == "+":
            k = skip_ws(t, k + 1)
            s2 = parse_string(t, k)
            if not s2:
                return None
            val += s2[0]
            end = s2[1]
        else:
            return val, end


def claim_in(claim, text):
    if isinstance(claim, str):
        return claim in text
    return claim.search(text) is not None


# ------------------------------------------------------------------ the tree
class Tree:
    def __init__(self, root):
        self.root = root
        self.ts_files = []
        self.by_base = defaultdict(list)
        self._lines = {}
        for top in ("src", "bin", "gui/src", "gui/tests"):
            base = os.path.join(root, top)
            for dp, dn, fn in os.walk(base):
                dn[:] = [d for d in dn if d not in SKIP_DIRS]
                for f in fn:
                    rel = os.path.relpath(os.path.join(dp, f), root)
                    self.by_base[f].append(rel)
                    if top.startswith("gui") and f.endswith(EXT):
                        self.ts_files.append(rel)
        self.ts_files.sort()

    def lines(self, rel):
        if rel not in self._lines:
            with open(os.path.join(self.root, rel), encoding="utf-8") as fh:
                self._lines[rel] = fh.read().split("\n")
        return self._lines[rel]

    def resolve(self, name, hint=None):
        """A cited file name (path, or Basename.cpp) -> repo-relative path."""
        if os.path.exists(os.path.join(self.root, name)):
            return name
        base = os.path.basename(name)
        c = [p for p in self.by_base.get(base, []) if p.endswith(name)]
        if hint:
            c = [p for p in c if p.startswith(hint)] or c
        # a citation lives in the engine/tools, not in the GUI's own tree
        c2 = [p for p in c if not p.startswith("gui/")]
        c = c2 or c
        return c[0] if len(c) == 1 else (None if not c else c)

    def span(self, rel, a, b):
        ls = self.lines(rel)
        return "\n".join(ls[a - 1:b])


# ------------------------------------------------------------------- scanning
KEY_RE = re.compile(
    r"""(?P<q>["'])(?P<file>(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+\.(?:cpp|H|py|hpp)):"""
    r"""(?P<a>\d+)(?:-(?P<b>\d+))?(?P=q)\s*:\s*""")
REC_RE = re.compile(
    r"""file:\s*(?P<f>"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*,\s*line:\s*(?P<n>\d+)\s*,\s*contains:\s*""")
ANCH_RE = re.compile(
    r"""\[\s*(?P<q>["'])(?P<f>[^"']+\.(?:cpp|H|py|hpp))(?P=q)\s*,\s*(?P<n>\d+)\s*,\s*""")
TOKEN_RE = re.compile(
    r"""(?<![A-Za-z0-9_.])(?P<f>(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_-]+\.(?:cpp|H|py|hpp)):"""
    r"""(?:["'`]\s*\+\s*["'`])?(?P<a>\d+)(?:-(?P<b>\d+))?(?![\d])""")


class Item:
    def __init__(self, shape, where, target, a, b, claim, nums=None):
        self.shape = shape          # R | C | T
        self.where = where          # (rel file, offset) of the number to edit
        self.target = target        # repo-relative cited file
        self.a, self.b = a, b       # b == a for a single line
        self.claim = claim
        self.nums = nums or []      # [(rel, start, end, text)] numbers to edit
        self.new = None
        self.cands = []
        self.status = "ok"          # ok | moved | ambiguous | missing | unresolved
        self.detail = ""

    def label(self):
        r = "%d" % self.a if self.a == self.b else "%d-%d" % (self.a, self.b)
        return "%s %s:%s" % (self.shape, self.target or "?", r)


def scan(tree):
    items, problems = [], []
    for rel in tree.ts_files:
        with open(os.path.join(tree.root, rel), encoding="utf-8") as fh:
            t = fh.read()
        is_test = rel.startswith("gui/tests/")
        idents = dict(re.findall(r"""const\s+([A-Za-z_]\w*)\s*(?::\s*string\s*)?=\s*"([^"]+)"\s*;""", t))
        # R: records
        for m in REC_RE.finditer(t):
            f = m.group("f")
            fname = f[1:-1] if f.startswith('"') else idents.get(f)
            cl = parse_claim(t, m.end())
            if not fname or not cl:
                problems.append("%s: record not parseable at offset %d (%s)" % (rel, m.start(), f))
                continue
            tgt = tree.resolve(fname)
            n = int(m.group("n"))
            it = Item("R", rel, tgt if isinstance(tgt, str) else None, n, n, cl[0],
                      [(rel, m.start("n"), m.end("n"), m.group("n"))])
            if not isinstance(tgt, str):
                it.status, it.detail = "unresolved", "file %r does not resolve to one path" % fname
            items.append(it)
        if not is_test:
            continue
        # C: CLAIMS keys
        for m in KEY_RE.finditer(t):
            fname = m.group("file")
            a = int(m.group("a"))
            b = int(m.group("b") or a)
            j = skip_ws(t, m.end())
            nums = []
            cl = None
            if t[j] == "[":      # tuple form [path, a, b|undefined, claim]
                k = t.find(",", j)
                m2 = re.compile(r"\s*(\d+)\s*,\s*(\d+|undefined)\s*,\s*").match(t, k + 1)
                if m2:
                    nums = [(rel, m2.start(1), m2.end(1), m2.group(1))]
                    if m2.group(2) != "undefined":
                        nums.append((rel, m2.start(2), m2.end(2), m2.group(2)))
                    cl = parse_claim(t, m2.end())
            else:
                cl = parse_claim(t, j)
            if not cl:
                problems.append("%s: claim for %s not parseable (multi-part value?)" % (rel, m.group("file")))
                continue
            tgt = tree.resolve(fname)
            it = Item("C", rel, tgt if isinstance(tgt, str) else None, a, b, cl[0], nums)
            if not isinstance(tgt, str):
                it.status, it.detail = "unresolved", "%r resolves to %s" % (fname, tgt)
            items.append(it)
        # T: anchors
        for m in ANCH_RE.finditer(t):
            cl = parse_claim(t, m.end())
            if not cl:
                continue
            tgt = tree.resolve(m.group("f"))
            n = int(m.group("n"))
            it = Item("T", rel, tgt if isinstance(tgt, str) else None, n, n, cl[0],
                      [(rel, m.start("n"), m.end("n"), m.group("n"))])
            if not isinstance(tgt, str):
                it.status, it.detail = "unresolved", "%r resolves to %s" % (m.group("f"), tgt)
            items.append(it)
    return items, problems


# -------------------------------------------------------------------- solving
def holds(tree, it, s):
    e = s + (it.b - it.a)
    n = len(tree.lines(it.target))
    if s < 1 or e > n:
        return False
    return claim_in(it.claim, tree.span(it.target, s, e))


def solve(tree, it, window):
    if it.status == "unresolved":
        return
    if holds(tree, it, it.a):
        return
    L = it.b - it.a
    lo, hi = max(1, it.a - window), it.a + window
    valid = [s for s in range(lo, hi + 1) if holds(tree, it, s)]
    if L > 0 and len(valid) > 1:
        def tight(s):
            e = s + L
            return (not claim_in(it.claim, tree.span(it.target, s + 1, e))
                    and not claim_in(it.claim, tree.span(it.target, s, e - 1)))
        tg = [s for s in valid if tight(s)]
        if tg:
            valid = tg
    if not valid:
        it.status = "missing"
        it.detail = "claim found nowhere within +/-%d lines of %d" % (window, it.a)
    elif len(valid) > 1:
        it.status = "ambiguous"
        it.cands = valid
        it.detail = "claim holds at %d places within +/-%d lines: %s" % (
            len(valid), window, ", ".join(str(v) for v in valid[:6]))
    else:
        it.status = "moved"
        it.new = valid[0]


def disambiguate(items):
    """An ambiguous citation takes the shift of its nearest neighbour.

    An edit to a cited file moves its neighbouring lines by the same amount, so
    when a claim holds at several places and exactly ONE of them is the shift
    that the nearest already-decided citation of the same file underwent, that
    one is taken -- and ANNOUNCED as such.  No neighbour, or no candidate (or
    two) at the neighbour's shift: it stays refused."""
    for it in items:
        if it.status != "ambiguous":
            continue
        peers = [p for p in items if p.target == it.target and p is not it
                 and p.status in ("ok", "moved")]
        if not peers:
            continue
        near = min(peers, key=lambda p: abs(p.a - it.a))
        d = (near.new - near.a) if near.status == "moved" else 0
        hit = [c for c in it.cands if c - it.a == d]
        if len(hit) == 1:
            it.status, it.new = "moved", hit[0]
            it.detail = "disambiguated by the shift (%+d) of the nearest citation, %s" % (d, near.label())


def fmt(a, b):
    return "%d" % a if a == b else "%d-%d" % (a, b)


# -------------------------------------------------------------------- editing
def build_maps(tree, items):
    """token map (target, 'a-b') -> 'new', plus anchor shifts; conflicts."""
    tmap, shifts, conflicts = {}, defaultdict(list), []
    for it in items:
        if it.status != "moved":
            continue
        d = it.new - it.a
        if it.shape == "T":
            shifts[it.target].append((it.a, d))
            continue
        old = fmt(it.a, it.b)
        new = fmt(it.new, it.new + (it.b - it.a))
        k = (it.target, old)
        if k in tmap and tmap[k] != new:
            conflicts.append("%s moves to both %s and %s" % (it.label(), tmap[k], new))
        tmap[k] = new
    return tmap, shifts, conflicts


def apply(tree, items, tmap, shifts):
    edits = defaultdict(list)       # rel -> [(start, end, text)]
    # numbers owned by an item (record line, tuple numbers, anchor number)
    owned = set()
    for it in items:
        if it.status != "moved":
            continue
        if it.shape in ("R", "T"):
            rel, s, e, _ = it.nums[0]
            edits[rel].append((s, e, str(it.new)))
            owned.add((rel, s))
        elif it.shape == "C":
            if it.nums:
                L = it.b - it.a
                rel, s, e, _ = it.nums[0]
                edits[rel].append((s, e, str(it.new)))
                if len(it.nums) > 1:
                    rel, s, e, _ = it.nums[1]
                    edits[rel].append((s, e, str(it.new + L)))
    # tokens, everywhere in the GUI
    for rel in tree.ts_files:
        with open(os.path.join(tree.root, rel), encoding="utf-8") as fh:
            t = fh.read()
        for m in TOKEN_RE.finditer(t):
            a = int(m.group("a"))
            b = int(m.group("b") or a)
            tgt = tree.resolve(m.group("f"))
            if not isinstance(tgt, str):
                continue
            new = tmap.get((tgt, fmt(a, b)))
            if new is None and tgt in shifts:
                ds = {d for (n0, d) in shifts[tgt] if a <= n0 <= b}
                if len(ds) == 1:
                    d = ds.pop()
                    new = fmt(a + d, b + d)
            if new is not None and new != fmt(a, b):
                s, e = m.start("a"), m.end("b") if m.group("b") else m.end("a")
                edits[rel].append((s, e, new))
    for rel, es in edits.items():
        p = os.path.join(tree.root, rel)
        with open(p, encoding="utf-8") as fh:
            t = fh.read()
        seen = set()
        for s, e, txt in sorted(es, reverse=True):
            if (s, e) in seen:
                continue
            seen.add((s, e))
            t = t[:s] + txt + t[e:]
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(t)
    return sorted(edits)


def inventory(tree, items, problems):
    print("citation shapes managed (count per file):")
    per = defaultdict(lambda: defaultdict(int))
    for it in items:
        per[it.where][it.shape] += 1
    for rel in sorted(per):
        print("  %-52s %s" % (rel, " ".join("%s=%d" % kv for kv in sorted(per[rel].items()))))
    managed = {(it.target, fmt(it.a, it.b)) for it in items if it.shape == "C"}
    cover = defaultdict(list)
    for it in items:
        if it.shape == "T":
            cover[it.target].append(it.a)
    un = defaultdict(int)
    for rel in tree.ts_files:
        with open(os.path.join(tree.root, rel), encoding="utf-8") as fh:
            t = fh.read()
        for m in TOKEN_RE.finditer(t):
            a = int(m.group("a"))
            b = int(m.group("b") or a)
            tgt = tree.resolve(m.group("f"))
            if not isinstance(tgt, str):
                un[rel] += 1
            elif (tgt, fmt(a, b)) not in managed and not any(a <= n <= b for n in cover[tgt]):
                un[rel] += 1
    print("unmanaged tokens (prose citations no managed claim covers):")
    for rel in sorted(un):
        print("  %-52s %d" % (rel, un[rel]))
    for p in problems:
        print("  unparsed:", p)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=ROOT_DEFAULT)
    ap.add_argument("--window", type=int, default=40)
    ap.add_argument("--check", action="store_true", help="report only; exit 1 if anything is stale")
    ap.add_argument("--inventory", action="store_true")
    a = ap.parse_args(argv)
    tree = Tree(a.root)
    items, problems = scan(tree)
    if a.inventory:
        inventory(tree, items, problems)
        return 0
    for it in items:
        solve(tree, it, a.window)
    disambiguate(items)
    moved = [i for i in items if i.status == "moved"]
    bad = [i for i in items if i.status in ("ambiguous", "missing", "unresolved")]
    tmap, shifts, conflicts = build_maps(tree, items)
    for i in moved:
        print("%s: %s -> %s  (in %s)%s" % ("STALE" if a.check else "re-point", i.label(),
                                         fmt(i.new, i.new + i.b - i.a), i.where,
                                         "  [" + i.detail + "]" if i.detail else ""))
    for i in bad:
        print("REFUSED (%s): %s -- %s  (in %s)" % (i.status, i.label(), i.detail, i.where))
    for c in conflicts:
        print("REFUSED (conflict):", c)
    if not a.check and moved and not conflicts:
        files = apply(tree, items, tmap, shifts)
        print("repoint_lesson_citations: %d citation(s) re-pointed, %d file(s) edited" % (len(moved), len(files)))
    elif not moved and not bad and not conflicts:
        print("repoint_lesson_citations: OK %d managed citation(s) current (shapes R/C/T)" % len(items))
    if a.check:
        return 1 if (moved or bad or conflicts) else 0
    return 1 if (bad or conflicts) else 0


if __name__ == "__main__":
    sys.exit(main())
