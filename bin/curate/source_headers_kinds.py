#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""ONE home for the table behind `check_source_headers.py` and
`add_source_headers.py` (DEV.md 4c C393): WHICH tracked files are code that
carries the copyright line and the licence identifier, in WHAT FORM, and
WHICH tracked files are deliberately not stamped, each with its reason.

    from source_headers_kinds import classify, tracked, ...

    bin/curate/source_headers_kinds.py --census     # per-kind census
    bin/curate/source_headers_kinds.py --excluded   # every excluded file, by rule
    bin/curate/source_headers_kinds.py --unclassified

Two tools read this table and neither keeps a copy of it: the gate (which
refuses a code file without the two lines) and the tool (which writes them).

THE HOLDER LINE is exactly `Copyright (C) 2026 Vítor Geraldes` (UTF-8, with
the accent): the owner's name alone, confirmed by him on 2026-11-13.  No other
name is written by this slice.

THE TWO FORMS.
  banner  the full project banner, copied BYTE FOR BYTE at run time from a
          neighbour of the same language (BANNER_SOURCES); engine C++ and the
          web app's sources and tests.
  short   two comment lines in the file's own syntax: the holder line and
          `SPDX-License-Identifier: GPL-3.0-or-later`.
A file that already has a copyright line but no identifier gets the identifier
beside it and nothing else changes (see add_source_headers.py).

CATEGORIES a tracked path falls in, in this order:
  excluded    a rule below with a REASON (generated, third party, cannot hold a
              comment, not a code kind, held for the owner);
  code        a CODE KIND below -- gated;
  scoped-out  outside the code roots (data/, tutorials/, docs/, benchmarks/,
              paper/, thirdParty/, generated/, the repository's root files);
              their licences are per record, per guide or per work and are
              NOT this slice's;
  unclassified  anything else under a code root.  The gate FAILS on it: a new
              kind of file must be given a rule here, in the commit that adds it.
"""
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

HOLDER = "Vítor Geraldes"
COPYRIGHT_LINE = "Copyright (C) 2026 " + HOLDER
SPDX_ID = "GPL-3.0-or-later"
SPDX_LINE = "SPDX-License-Identifier: " + SPDX_ID
WINDOW = 4000

# The neighbours the banner is copied from.  Both are checked to carry it.
BANNER_SOURCES = {
    "cpp": "src/unitOperations/rotating/Pump.cpp",
    "web": "gui/src/adapters/MockAdapter.ts",
}

CODE_ROOTS = ("src/", "gui/", "bin/", "make/", "etc/", ".github/", "site/",
              "test/", ".claude/")
CODE_ROOT_FILES = ("Makefile",)

# kind -> (form, comment syntax, banner source)
#   syntax: 'block' = /* */ ; '//' ; '#' ; 'rem'
KINDS = {
    "engine-cpp":  ("banner", "block", "cpp"),
    "web-src":     ("banner", "block", "web"),
    "web-tests":   ("banner", "block", "web"),
    "web-script":  ("short", "//", None),
    "script-js":   ("short", "//", None),
    "site-js":     ("short", "//", None),
    "tool-cpp":    ("short", "//", None),
    "script-hash": ("short", "#", None),
    "batch":       ("short", "rem", None),
}



# THE RULINGS the exclusion table cites (SH-12): the coordinator's rulings of
# 2026-11-13 (commission C393), quoted beside each entry so the table does not
# point at a location that does not hold them.
RULING_NANOFILTRAN = (
    "the coordinator's rulings of 2026-11-13 (commission C393), ruling 1: "
    "\"NanoFiltran (bin/curate/nanofiltran/**): PERMANENT exclusion, ... third-"
    "party-as-received; never stamped, never rewritten (its Fortran notice is "
    "not valid UTF-8): your tool must not even open those files in text mode.  "
    "Same for the two files with another holder's notice under "
    "bin/curate/enrtl_ref/.\"")
RULING_HELD = (
    "the coordinator's rulings of 2026-11-13 (commission C393), ruling 2: "
    "\"The four re-implementations under bin/curate/enrtl_ref/ that say 'per "
    "... enrtl.py': STAY EXCLUDED as held, not stamped, with the reason "
    "'origin to be ruled by the owner'.\"")
RULING_QUOTED = (
    "the coordinator's rulings of 2026-11-13 (commission C393), ruling 3: "
    "\"bin/curate/lvpp_sigma_profile.py: the project's own script; STAMP it.  "
    "Your conflict rule must tell a file's own notice from a notice it QUOTES "
    "about something else: make that an explicit per-file entry with its "
    "reason, not a looser pattern.\"")
RULING_ACCENT = (
    "the coordinator's rulings of 2026-11-13 (commission C393), ruling 4: "
    "\"THE ACCENT: ... the holder line is `Copyright (C) 2026 Vítor "
    "Geraldes`.  After that commit the gate compares the name EXACTLY, accent "
    "included.\"; and the follow-up: \"The holder line is compared EXACTLY ... "
    "the few existing lines that say more go in an explicit per-file list "
    "with the exact line each carries.\"")
RULING_HEADER_WRAPPER = (
    "the coordinator's rulings of 2026-11-13 (commission C393), ruling 6: "
    "\"ONE TOOL: bin/header a thin wrapper ... the holder read from the ONE "
    "shared table, never from git configuration; if etc/header.txt stays it "
    "is the banner's one home\" (it was retired: the banner's one home is "
    "the engine's own files).")

def _e(name, reason, patterns=(), paths=(), dynamic=None, kind="rule"):
    return {"name": name, "reason": reason, "patterns": list(patterns),
            "paths": list(paths), "dynamic": dynamic}


# ---------------------------------------------------------------------------
# EXCLUSIONS.  Every one carries its reason.  A glob rule must match at least
# one tracked file and an explicit path must be tracked (the gate's two-sided
# check): a rule that outlives its files is a lie about the tree.
# ---------------------------------------------------------------------------
EXCLUSIONS = [
    _e("generated",
       "owned by a generator registered in bin/curate/generated_artefacts.py "
       "(regenerated, never hand-stamped); lock files and minified output",
       patterns=["*/package-lock.json"],
       dynamic="generated"),
    _e("third-party-idaes",
       "copied from the IDAES project: carries its own copyright and licence "
       "text (The Regents of the University of California et al.)",
       paths=["bin/curate/enrtl_ref/enrtl.py",
              "bin/curate/enrtl_ref/enrtl_reference_states.py"]),
    _e("third-party-gui-public",
       "web-app public assets: third-party bundles and notices "
       "(gui/public/THIRD_PARTY_NOTICES names them), images, manifests",
       patterns=["gui/public/icons/*", "gui/public/logo2*.png",
                 "gui/public/THIRD_PARTY_NOTICES",
                 "gui/public/*.LICENSE.txt"]),
    _e("third-party-as-received",
       "NanoFiltran, vendored as received: its Fortran notice names another "
       "holder and is not valid UTF-8, a LAPACK licence text and another "
       "author's SIMPLEX source sit beside it.  Never stamped, never "
       "rewritten, never opened in text mode.  Ruling: " + RULING_NANOFILTRAN,
       patterns=["bin/curate/nanofiltran/*"]),
    _e("held-enrtl-reimplementations",
       "origin to be ruled by the owner: re-implementations written 'per IDAES "
       "enrtl.py' beside the two IDAES copies; whether they are derivative "
       "works is his call.  Not stamped until he rules.  Ruling: " + RULING_HELD,
       paths=["bin/curate/enrtl_ref/enrtl_proto.py",
              "bin/curate/enrtl_ref/enrtl_mixed_solvent.py",
              "bin/curate/enrtl_ref/enrtl_validated.py",
              "bin/curate/enrtl_ref/drowning_out_crystallization.py"]),
    _e("no-comment-data",
       "JSON, images, PDFs, fonts, tables, XML, spreadsheets: cannot hold a "
       "comment (or a comment would change the data)",
       patterns=["*.json", "*.png", "*.tsv", "*.xml", "*.XLS",
                 "*.webmanifest", "*.manifest", "bin/curate/helmholtz/*.txt",
                 "bin/curate/svehla1962/*.txt", "bin/curate/fixtures/*"]),
    _e("not-a-code-kind-prose",
       "prose documentation (README, notes) inside a code root: not a code "
       "kind; the root NOTICE covers it",
       patterns=["*.md"]),
    _e("not-a-code-kind-config",
       "plain lists and configuration inside a code root (dotfiles, host "
       "names, file lists): not a code kind",
       patterns=["*/.gitignore", "gui/src/ui/methods/*.layoutDict", "site/CNAME",
                 "site/analytics.conf", "site/frozenApps.txt",
                 "bin/curate/recording_platform.txt",
                 "bin/curate/suite_lanes.txt",
                 "bin/curate/migrate_thermoPhysProp.skipped.txt",
                 ".claude/settings.json"]),
    _e("not-a-code-kind-markup",
       "HTML pages: markup, not one of the code kinds this slice stamps "
       "(listed for the owner)",
       patterns=["site/*.html", "gui/index.html", "gui/public/*.html"]),
    _e("not-a-code-kind-generated-data",
       "tabular and text data records of the curation tools",
       patterns=["bin/curate/*.tsv", "bin/curate/*/*.tsv"]),
]

# Paths outside the code roots, by rule.  Not examined by the gate; stated so
# the owner can see the boundary.
SCOPED_OUT = [
    ("data/", "data records: licences are per record (LICENSES/README.md)"),
    ("tutorials/", "tutorial cases: out of this slice"),
    ("docs/", "guides and design records: a separate work, CC BY-SA 4.0 for "
              "the guides, one authorship line in docs/preamble.tex"),
    ("benchmarks/", "benchmark cases and their scripts: not stamped here"),
    ("paper/", "papers and their scripts: co-authored works"),
    ("thirdParty/", "third-party notes and licence texts"),
    ("generated/", "generated artefacts"),
    ("metadata/", "data"),
    ("LICENSES/", "the licence map"),
]


# Files whose own notice is the project's but which QUOTE another party's
# notice about something else (a downloaded database's licence in a docstring).
# One explicit entry per file with its reason, never a looser pattern: a
# foreign copyright line in such a file is not a notice about the file.
QUOTED_NOTICES = {
    "bin/curate/lvpp_sigma_profile.py":
        "the project's own script; a comment line states the MIT licence "
        "and holder of the downloaded LVPP database it reads.  Ruling: "
        + RULING_QUOTED,
}

# Existing holder lines that say more than the exact line, per file, with the
# EXACT line each carries (the gate compares the holder line exactly; anything
# not here must be `COPYRIGHT_LINE` and nothing after the name).  Ruling:
# RULING_ACCENT.
ALLOWED_HOLDER_LINES = {
    "gui/tests/layoutUtilityLines.test.ts":
        "Copyright (C) 2026 Vítor Geraldes.  Licence: GPL-3.0-or-later (see AUTHORS).",
    "src/postProcessing/EstimateClass.H":
        "Copyright (C) 2026 Vítor Geraldes and contributors (see AUTHORS)",
}


def authors(root: Path = ROOT):
    """Names listed in AUTHORS above the 'Curators' heading, as authors,
    EXACTLY as written (accent included)."""
    names = []
    txt = (root / "AUTHORS").read_text(encoding="utf-8").split("\n")
    for ln in txt:
        if ln.startswith("Curators"):
            break
        if ln.startswith("  ") and not ln.startswith("   "):
            names.append(ln.strip())
    return names


def is_author_name(name: str, authors_list) -> bool:
    """A commit author's name is EXACTLY a name listed in AUTHORS (no prefix,
    no suffix, accent included)."""
    return name in authors_list


def tracked(root: Path = ROOT):
    r = subprocess.run(["git", "ls-files", "-s"], cwd=str(root),
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("git ls-files failed: " + r.stderr.strip())
    out = []
    for ln in r.stdout.splitlines():
        meta, _, path = ln.partition("\t")
        mode = meta.split()[0]
        out.append((path, mode))
    return out


_gen_mod = None


def _is_generated(path: str) -> bool:
    global _gen_mod
    if _gen_mod is None:
        sys.path.insert(0, str(ROOT / "bin" / "curate"))
        import generated_artefacts as g
        _gen_mod = g
    return _gen_mod.is_generated(path)


def _match(rule, path):
    if path in rule["paths"]:
        return True
    for g in rule["patterns"]:
        if fnmatch.fnmatchcase(path, g):
            return True
    if rule["dynamic"] == "generated" and _is_generated(path):
        return True
    return False


def in_code_root(path: str) -> bool:
    return path.startswith(CODE_ROOTS) or path in CODE_ROOT_FILES


def excluded_by(path: str):
    for r in EXCLUSIONS:
        if _match(r, path):
            return r
    return None


def _ext(path):
    b = path.rsplit("/", 1)[-1]
    return b[b.rfind("."):] if "." in b[1:] else ""


def code_kind(path: str, first_line: str = ""):
    """The code kind of a path under a code root, or None."""
    e = _ext(path)
    if path.startswith("src/") and e in (".H", ".cpp"):
        return "engine-cpp"
    if path.startswith("gui/src/") and e in (".ts", ".tsx", ".css"):
        return "web-src"
    if path.startswith("gui/tests/") and e in (".ts", ".tsx"):
        return "web-tests"
    if path.startswith("gui/") and e in (".ts", ".mts", ".mjs", ".cjs", ".js"):
        return "web-script"
    if path == "site/sw.js":
        return "site-js"
    if path.startswith(("bin/", "test/")) and e == ".mjs":
        return "script-js"
    if path.startswith(("bin/", "test/")) and e in (".cpp", ".c"):
        return "tool-cpp"
    if e == ".bat":
        return "batch"
    if e in (".py", ".sh", ".yml", ".mk"):
        return "script-hash"
    if path in ("Makefile", "etc/bashrc"):
        return "script-hash"
    if e == "" and first_line.startswith("#!"):
        return "script-hash"
    return None


def classify(path: str, mode: str = "100644", first_line: str = ""):
    """(category, detail) -- see the module docstring."""
    if mode == "120000":
        return ("excluded", "symlink")
    if in_code_root(path):
        r = excluded_by(path)
        if r:
            return ("excluded", r["name"])
        k = code_kind(path, first_line)
        if k:
            return ("code", k)
        return ("unclassified", "")
    for pre, _why in SCOPED_OUT:
        if path.startswith(pre):
            return ("scoped-out", pre)
    if "/" not in path:
        k = code_kind(path, first_line)
        if k:
            return ("code", k)
        return ("scoped-out", "root file")
    return ("unclassified", "")


def read_head(path: str, root: Path = ROOT):
    try:
        with open(root / path, "rb") as f:
            raw = f.read()
    except OSError:
        return None
    return raw


def first_line_of(raw: bytes) -> str:
    return raw.split(b"\n", 1)[0].decode("utf-8", "replace").rstrip("\r")


def classify_all(root: Path = ROOT):
    """[(path, category, detail)] for every tracked path."""
    out = []
    for path, mode in tracked(root):
        fl = ""
        if mode != "120000" and (in_code_root(path) or "/" not in path) and _ext(path) == "":
            raw = read_head(path, root)
            fl = first_line_of(raw) if raw is not None else ""
        c, d = classify(path, mode, fl)
        out.append((path, c, d))
    return out


# ---------------------------------------------------------------------------
# Reading a file's notice
# ---------------------------------------------------------------------------
SPDX_RE = re.compile(r"SPDX-License-Identifier:\s*" + re.escape(SPDX_ID))
BOM = b"\xef\xbb\xbf"
# A header must sit in the file's leading comment block AND within its first
# HEADER_LINES lines (the banner is 27 lines; a shebang and a cookie add two).
HEADER_LINES = 40

# A line of a leading comment that STARTS a copyright notice, in the common
# spellings: `Copyright (C) 2019 X`, `Copyright 2019 X`, `(c) 2019 X`,
# `Copyright (C) 2019, X`, the copyright sign, `(C) X 2019`.  Banner art
# ('... U nits   | ') and comment decorations may precede it.
NOTICE_LINE_RE = re.compile(
    r"^(?P<pre>[\s/*#|\\\"'`-]*(?:REM\s+|rem\s+)?(?:[^|\n]*\|\s*)?)"
    r"(?P<n>(?:copyright|©|\(c\))[^\n]{0,60}?\b(?:19|20)\d\d\b[^\n]*)$",
    re.I)
SPDX_LINE_RE = re.compile(
    r"^(?P<pre>[\s/*#|\\\"'`-]*(?:REM\s+|rem\s+)?(?:[^|\n]*\|\s*)?)"
    r"SPDX-License-Identifier:\s*(?P<v>[^\n]*?)\s*(?:\*/)?\s*\|?\s*$")
CODING_RE = re.compile(r"^[ \t\f]*#.*?coding[:=][ \t]*[-\w.]+")


def _strip_tail(n: str) -> str:
    return re.sub(r"[\s|]*(?:\*/)?[\s|]*$", "", n)


def decode(raw: bytes) -> str:
    if raw.startswith(BOM):
        raw = raw[len(BOM):]
    return raw.decode("utf-8", "replace")


def leading_region(kind: str, text: str):
    """[(lineno, line)] of the file's LEADING COMMENT BLOCK: after a shebang,
    a Python encoding cookie or `@echo off`, the consecutive comment lines
    (and blank lines among them) up to the first line that is not a comment.
    A docstring, a string literal or code ends it."""
    syntax = KINDS[kind][1]
    lines = text.split("\n")
    i = 0
    if lines and lines[0].startswith("#!"):
        i = 1
    if kind == "script-hash" and i < 2 and i < len(lines) and CODING_RE.match(lines[i]):
        i += 1
    if kind == "batch" and lines and lines[0].strip().lower() == "@echo off":
        i = 1
    out = []
    in_block = False
    for n in range(i, len(lines)):
        ln = lines[n].rstrip("\r")
        st = ln.strip()
        if in_block:
            out.append((n + 1, ln))
            if "*/" in ln:
                in_block = False
            continue
        if st == "":
            out.append((n + 1, ln))
            continue
        if syntax == "#":
            ok = st.startswith("#")
        elif syntax == "rem":
            # `#` lines are accepted for batch files: three of them carry the
            # project banner as `#` lines (a legacy form, left as it is).
            ok = (st.lower().startswith(("rem ", "rem\t", "::", "@rem", "#"))
                  or st.lower() == "rem")
        else:
            ok = st.startswith("//")
            if st.startswith("/*"):
                ok = True
                if "*/" not in st[2:]:
                    in_block = True
        if not ok:
            break
        out.append((n + 1, ln))
    return out


def scan(path: str, kind: str, raw: bytes):
    """What a file's leading comment block says about its notice:
    dict(ours=[(lineno, n)], foreign=[(lineno, n)], spdx=[(lineno, value)],
    region=[...]).  `ours` = the exact holder line (or the file's entry in
    ALLOWED_HOLDER_LINES); `foreign` = any other copyright line; only lines
    within the first HEADER_LINES lines count."""
    text = decode(raw)
    region = leading_region(kind, text)
    ours, foreign, spdx = [], [], []
    allowed = ALLOWED_HOLDER_LINES.get(path)
    for no, ln in region:
        if no > HEADER_LINES:
            break
        m = NOTICE_LINE_RE.match(ln)
        if m:
            n = _strip_tail(m.group("n"))
            if n == COPYRIGHT_LINE or (allowed is not None and n == allowed):
                ours.append((no, n))
            else:
                foreign.append((no, n))
            continue
        m = SPDX_LINE_RE.match(ln)
        if m:
            spdx.append((no, m.group("v")))
    return {"ours": ours, "foreign": foreign, "spdx": spdx, "region": region}


def findings(path: str, kind: str, raw: bytes):
    """The gate's findings for one code file, as (code, text)."""
    sc = scan(path, kind, raw)
    out = []
    quoted = path in QUOTED_NOTICES
    if not sc["ours"]:
        out.append(("NO-COPYRIGHT", "no line `%s` in the leading comment block (first %d lines)"
                    % (COPYRIGHT_LINE, HEADER_LINES)))
    if len(sc["ours"]) > 1:
        out.append(("DUPLICATE-COPYRIGHT", "%d project copyright lines" % len(sc["ours"])))
    if sc["foreign"] and not quoted:
        out.append(("FOREIGN-COPYRIGHT", "line %d: %r" % (sc["foreign"][0][0], sc["foreign"][0][1][:70])))
    good = [v for _n, v in sc["spdx"] if v == SPDX_ID]
    other = [v for _n, v in sc["spdx"] if v != SPDX_ID]
    if not good:
        out.append(("NO-SPDX", "no line `%s` in the leading comment block" % SPDX_LINE))
    if len(good) > 1:
        out.append(("DUPLICATE-SPDX", "%d identifier lines" % len(good)))
    if other:
        out.append(("OTHER-SPDX", "the file declares %r" % other[0]))
    return out


# Any spelling of the project's notice (with or without the accent), or the
# project's identifier, in a file that must carry none.
PROJECT_NOTICE_RE = re.compile(
    r"copyright\s*\(c\)\s*\d{4}(?:-\d{4})?\s+v\S{1,2}tor\s+geraldes", re.I)
PROJECT_SPDX_RE = re.compile(r"SPDX-License-Identifier:\s*" + re.escape(SPDX_ID))


def carries_project_notice(raw: bytes) -> bool:
    t = raw[:WINDOW * 4].decode("utf-8", "replace")[:WINDOW]
    return bool(PROJECT_NOTICE_RE.search(t) or PROJECT_SPDX_RE.search(t))


def banner_text(kind_src: str, root: Path = ROOT) -> str:
    """The banner, copied from its neighbour: from line 1 through the line
    that closes the block comment, as text with a trailing newline."""
    p = root / BANNER_SOURCES[kind_src]
    lines = p.read_text(encoding="utf-8").split("\n")
    out = []
    for ln in lines:
        out.append(ln)
        if ln.startswith("\\*---") and ln.rstrip().endswith("*/"):
            return "\n".join(out) + "\n"
    raise RuntimeError("banner not found in " + str(p))


def census(root: Path = ROOT):
    """{kind: [total, missing_copyright, missing_spdx]} for code files."""
    res = {}
    for path, c, d in classify_all(root):
        if c != "code":
            continue
        raw = read_head(path, root)
        if raw is None:
            continue
        f = {code for code, _t in findings(path, d, raw)}
        r = res.setdefault(d, [0, 0, 0])
        r[0] += 1
        r[1] += 1 if "NO-COPYRIGHT" in f else 0
        r[2] += 1 if "NO-SPDX" in f else 0
    return res


def main(argv):
    rows = classify_all()
    if "--census" in argv:
        res = census()
        print("%-12s %6s %12s %10s" % ("kind", "files", "no copyright", "no SPDX"))
        t = [0, 0, 0]
        for k in sorted(res):
            print("%-12s %6d %12d %10d" % ((k,) + tuple(res[k])))
            t = [a + b for a, b in zip(t, res[k])]
        print("%-12s %6d %12d %10d" % (("TOTAL",) + tuple(t)))
        return 0
    if "--excluded" in argv:
        by = {}
        for p, c, d in rows:
            if c == "excluded":
                by.setdefault(d, []).append(p)
        for name in sorted(by):
            print("== %s (%d)" % (name, len(by[name])))
            for p in by[name]:
                print("   " + p)
        return 0
    if "--unclassified" in argv:
        n = 0
        for p, c, d in rows:
            if c == "unclassified":
                print(p)
                n += 1
        return 1 if n else 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
