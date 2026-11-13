#!/usr/bin/env python3
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
       "NanoFiltran, vendored as received (DEV.md 4c C393, ruled): its Fortran "
       "notice names another holder and is not valid UTF-8, a LAPACK licence "
       "text and another author's SIMPLEX source sit beside it.  Never "
       "stamped, never rewritten, never opened in text mode",
       patterns=["bin/curate/nanofiltran/*"]),
    _e("held-enrtl-reimplementations",
       "origin to be ruled by the owner: re-implementations written 'per IDAES "
       "enrtl.py' beside the two IDAES copies; whether they are derivative "
       "works is his call.  Not stamped until he rules",
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
                 "etc/header.txt", ".claude/settings.json"]),
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
        "the project's own script; a docstring line states the MIT licence "
        "and holder of the downloaded LVPP database it reads",
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
    """A copyright line's name field begins with a listed author's name,
    compared EXACTLY, accent included (a trailing '.  Licence: ...' or
    'and contributors' is allowed).  Until the accent was corrected in five
    files (DEV.md 4c C393) the comparison ignored accents; it no longer does."""
    for a in authors_list:
        if name.startswith(a) and (len(name) == len(a) or not name[len(a)].isalnum()):
            return True
    return False


def own_and_foreign(path: str, names, authors_list):
    """(ours, foreign) names of the copyright lines of `path`; foreign lines
    of a QUOTED_NOTICES file are not notices about the file."""
    ours = [n for n in names if is_author_name(n, authors_list)]
    foreign = [n for n in names if n not in ours]
    if path in QUOTED_NOTICES:
        foreign = []
    return ours, foreign


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
    if path.startswith(("bin/", "test/")) and e == ".cpp":
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
        if mode != "120000" and in_code_root(path) and _ext(path) == "":
            raw = read_head(path, root)
            fl = first_line_of(raw) if raw is not None else ""
        c, d = classify(path, mode, fl)
        out.append((path, c, d))
    return out


# ---------------------------------------------------------------------------
# Reading a file's notice
# ---------------------------------------------------------------------------
COPY_RE = re.compile(r"Copyright \(C\) (\d{4})(?:-(\d{4}))? ([^|*\n\r]*?)\s*(?:\||\*/|$)",
                     re.M | re.I)
SPDX_RE = re.compile(r"SPDX-License-Identifier:\s*" + re.escape(SPDX_ID))


def head_text(raw: bytes) -> str:
    return raw[:WINDOW * 4].decode("utf-8", "replace")[:WINDOW]


def notice_state(raw: bytes, names=None):
    """(has_copyright, copyright_names, has_spdx) within the first WINDOW chars."""
    t = head_text(raw)
    ms = COPY_RE.findall(t)
    has_c = bool(re.search(r"Copyright", t))
    return has_c, [m[2] for m in ms], bool(SPDX_RE.search(t))


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
        has_c, _n, has_s = notice_state(raw)
        r = res.setdefault(d, [0, 0, 0])
        r[0] += 1
        r[1] += 0 if has_c else 1
        r[2] += 0 if has_s else 1
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
