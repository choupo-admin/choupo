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
                                                         stored labels or -, the
                                                         date, the mode (exact |
                                                         route | replay | run),
                                                         why, the replay file
    bin/curate/suite_reuse.py case-plan <root> --explain how each case is keyed:
                                                         narrow or whole
    bin/curate/suite_reuse.py migrate-keys [root] [--harness-from REV]
                                                         re-key the stored curation
                                                         verdicts to the current
                                                         key format (no run)
    bin/curate/suite_reuse.py verify-reads <case>...     strace the run and hold
                                                         its reads to the key
    bin/curate/suite_reuse.py key <gate>                 print the key and the
                                                         inputs it covers
    bin/curate/suite_reuse.py selftest                   the C432 rules on synthetic
                                                         parts (no build needed)
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
  * THE RESOLVER'S CASCADE -- the engine reads `<dir>/constant/` in the
    directory a case runs in and in every parent up to its deepest walk
    (read from src/ on every key: resolver_depth()).  Each such directory is
    hashed in FULL, tracked or ignored, inside the repository or above it,
    and its ABSENCE is part of the key (review SE-01, an S1: a manifest
    dropped into data/curation/electrolytes/constant/ made a sealed case FAIL
    while it was printed REUSED).
  * THE PLATFORM -- `uname -m`, the Python version and golden_bands' platform
    fingerprint (CPU, C library, compiler; review SE-03).

THE DICTIONARIES OF A CASE ENTER THE KEY AS NORMALISED TEXT (DEV.md 4c C421
(8)).  A landing changed the `schemaVersion` stamp of all 1260 curation cases
and a key over each file's bytes re-ran every fit.  Now the files of a case's
system/ and constant/ (and of the constant/ of each parent the resolver walks)
are hashed after normalise_dictionary(): comments removed where the engine's
tokenizer sees one (at the start of a token, never inside a "string" or in the
middle of a word), blank lines dropped, blank runs collapsed to one space, and
the top-level line `schemaVersion 1;` / `schemaVersion 2;` dropped.  NOT
dropped: `recordType <word>;` (the engine branches on its value), a stamp with
any other value (the engine refuses it), every key, number, word and string.
Hashed whole as before: tables (.csv .tsv .txt .json), the `expected` golden,
archiveExtracts/, experiments/, a dossier, and any record the constant/'s
propertyManifest names (the seal check hashes its parsed content, stamp
included).  A new-format key carries KEY_FORMAT in its material, so it can
never equal an old one; `migrate-keys` recognises a stored verdict by the
OLD-format key of the tree in hand (case_keys(norm=False), used by nothing
else) and rewrites it under the new key, keeping its date and commit and
adding "migrated from key <old>".  Run it with CHOUPO_HOME unset or the tree's
root.  The golden-band mode, which runTests exports, is read from golden_bands.py when
the variable is unset.

NO ABSOLUTE PATH IS IN A CASE KEY (format 3).  The data root enters as the
token DATA_ROOT (the files under it are hashed by content) and the constant/
cascade directories by their path relative to the repository root (`above#N`
for one above it), so two checkouts of one commit at two paths compute one
key; what the engine objects hold is path-free too (no object contains the
tree's path, and an object compiled at another path is byte-identical).  What
still tells two trees apart, rightly: the build (an edit of code), data/local
(ignored, read by the engine: a tree whose data/local differs re-runs the
whole-tree cases, 307 of them), and the harness (below).

THE HARNESS OF A CASE IS bin/runTests SPLIT (format 4).  Formats 1-3 hashed the
whole file, so any edit of it -- a new gate block is the commonest -- re-keyed
every case.  Now the key holds (a) the text of check_case, check_case_body and
every function reachable from them or from a retained top-level line, (b)
every top-level line that is not inside a function and not inside a GATE BLOCK
(so every export, assignment, mode switch and call around the cases), and (c)
the harness files as before.  A gate block, the only thing left out, is the
documented shape -- the comments above `    if gate_exec ...`, the statement to
its `    fi`, and the `    rm -f` lines after it -- and only when it sets
nothing but the tally counters (no export, unset, source, cd, declare, eval,
trap, set, shopt, no other assignment); any other structure is KEPT, so a miss
re-keys and cannot reuse wrongly.  See runtests_split().  Not in the key: the
bodies of functions nothing reaches, a gate block, and this file.

THE VERDICT STORE CAN BE SHARED.  CHOUPO_REUSE_STORE=<directory> moves ONLY the
curation verdicts (the `cases/` files, content-keyed) there, for every tree
that sets it; the stat-signature hash cache and the symbol cache stay per
tree.  bin/runTests writes a verdict to a temp file in that directory and
renames it (atomic: two sweeps on two trees may run at once), and migrate-keys
does the same.  Default unchanged: build/reuse/cases in the tree.

A content hash is cached in build/reuse/hashcache.tsv under the file's full
stat signature -- size, mtime, ctime, inode, device -- so a key costs stat
calls after the first run, and a same-size edit whose mtime was put back
(`touch -r`, `cp -p`) still re-hashes: ctime cannot be set back (review SE-02).

WHAT IS STORED.  Only a PASS (exit 0).  A FAIL, a SKIP (exit 2, cannot run)
or a NO SUBJECT is never stored, so it always runs again.  The verdict lives
under build/reuse/ (ignored, never tracked): a clean checkout has none and
runs everything.  It is printed `REUSED`, with the key's first twelve
characters and the date it was taken, and counted apart from PASS.

THE CURATION FITS ARE KEYED NARROWER THAN THE GATES (C414 (3)).  A
choupoProps fit is keyed on (1) the objects REACHABLE from the choupoProps
entry objects plus the operations its propsDict names (the operation
registry's edges to unnamed operations are the one declared cut; the premise
that makes it sound is machine-checked on every key), hashed by content; (2) for
the `pairs/` and `components/` kinds, the catalogue records of the components
it mentions (data/standards, data/local, data/groupEstimative: the files whose
stem is the name or a pair stem containing it) and both asset trees; for
`transport_c327`, the three catalogue directories it reads (components,
species, assets) of both tiers; every other kind (electrolytes, henry,
batches) keeps the whole data tree; (3) the case's own files and constant/
cascade, its harness and the platform, as before.  What it does NOT contain,
and so what never re-runs a fit: a unit operation, a post processor, the
dynamic driver, another application, a catalogue record of a component the case
does not mention, a record of another pair.  A case whose operations resolve to
no object, that also runs the process binary, or whose build shows the premise
broken, falls back to the whole engine (`case-plan DIR --explain` prints how
each case is keyed).  `verify-reads` holds the data rule against a strace of
the real run.  A REUSED line prints the key, the date AND the commit of the
run it reuses.  Never reused, ever: a FAIL, a SKIP (cannot run), a NO SUBJECT;
anything in CI or a release (CHOUPO_NO_REUSE); and any run under --scope,
--fast, --witnesses or a named case.

A KEY THAT MOVED IS ASKED TWO MORE QUESTIONS BEFORE A FIT RE-RUNS (C432).  The
exact key moves with ANY engine object the fit reaches, and the property kernel
is reached by all 1260 (the sweep of 2026-11-19 re-ran every one, about 10 800 s,
after a kernel edit the route bench had proved identical).  So a stored verdict
whose key differs from the present one is taken in this order, and the plan says
which rung and why on every case line (the section "C432" below holds the code):
(d) THE ROUTE RULE -- only objects listed in property_kernel_objects.tsv moved,
everything else in the key is identical, and the bench's blocks for every record
the fit reads are byte-identical then and now: REUSED, re-stored under the new
key; (a) REPLAY -- bin/runTests runs the case once with the fits held at their
stored parameters (CHOUPO_FIT_REPLAY, no search) and compares everything but the
search's own rows with the golden: REUSED when it matches; otherwise REFIT.  The
parts of each key are kept in <store>/.parts/ so the next plan can compare them.
Run this tool with CHOUPO_HOME unset or the tree's own root (it reads the data
from there: a stale CHOUPO_HOME pointing at another checkout keys THAT data).

WHEN NOTHING IS REUSED.  CHOUPO_NO_REUSE=1 (or `bin/runTests --no-reuse`,
which sets it): the hosted tiers (.github/workflows/ci.yml; sanitize.yml
runs only --fast, which never reuses) and a release (RELEASING.md) set it,
and a clean checkout has no stored verdict anyway.  Reuse is offered ONLY to the full sweep: --scope, --fast,
--witnesses and a named case run what they are given.

THE HONESTY ARM.  A gate is keyed only if every repository path its source
(and its import closure) names lies inside its declared inputs; `key` and
`lookup` refuse to key it otherwise and name the path.  This is the static
reader of bin/curate/gate_scan_roots.py applied to every path literal, not
only to walks: a gate that grows a read outside its key stops being reused
the day it does, instead of being reused wrongly.
"""
import ast
import functools
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "build" / "reuse"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate_scan_roots as gsr   # noqa: E402
import case_records             # noqa: E402  (C413: the pins of a case)

#  THE KEYED GATES.  `trees`: the data the verdict reads (repository paths;
#  git's listing).  `local`: the ignored private tier is read too.  Every
#  gate here also gets the engine half and its harness closure.
KEYED = {
    "check_regressed_pairs": {
        #  tutorials/ whole: the gate sweeps every case root
        #  (curation_roots.case_roots) for case-local NRTL records.
        "trees": ["data/standards", "data/curation", "data/groupEstimative",
                  "tutorials"],
        "local": True,
        #  Every `fittedInCase` the records name must lie in the trees above
        #  (review SE-04): the gate runs ROOT / <value>.
        "case_refs": ("fittedInCase", [
            "data/standards/parameters", "data/standards/components",
            "data/curation",
            ":(glob)tutorials/**/constant/parameters/NRTL/*.dat"]),
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
    """sha256 of a file, cached by its full stat signature.

    REVIEW SE-02 (2026-11-14): the first version trusted (size, mtime_ns),
    and a same-size edit put back under its old mtime (`touch -r`, `cp -p`,
    `rsync -a`, `tar`) was REUSED over a real FAIL.  The signature now adds
    the inode and st_ctime_ns: the kernel sets ctime on every write, chmod
    and utime, and no copy tool can set it back, so any change to the file
    since it was hashed -- including putting its mtime back -- forces a fresh
    hash."""

    def __init__(self):
        self.path = STORE / "hashcache.tsv"
        self.cache, self.dirty = {}, False
        try:
            for line in self.path.read_text().splitlines():
                parts = line.split("\t")
                if len(parts) == 3:                # path, signature, sha256
                    self.cache[parts[0]] = (parts[1], parts[2])
        except OSError:
            self.cache = {}

    @staticmethod
    def signature(st):
        return f"{st.st_size}:{st.st_mtime_ns}:{st.st_ctime_ns}:{st.st_ino}:{st.st_dev}"

    def sha(self, p: Path):
        try:
            st = p.stat()
        except OSError:
            return "MISSING"
        k, sig = str(p), self.signature(st)
        c = self.cache.get(k)
        if c and c[0] == sig:
            return c[1]
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        d = h.hexdigest()
        self.cache[k] = (sig, d)
        self.dirty = True
        return d

    def save(self):
        if not self.dirty:
            return
        STORE.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text("".join(f"{p}\t{sig}\t{h}\n"
                               for p, (sig, h) in sorted(self.cache.items())))
        os.replace(tmp, self.path)


H = Hasher()


# --------------------------------------------------------------------------
#  THE NORMALISED TEXT OF A DICTIONARY (DEV.md 4c C421 (8), measured 2026-11-18)
#
#  A landing changed ONE digit, the `schemaVersion` stamp, in the thermoPhysPropDict
#  of all 1260 curation cases, and a key over each file's bytes re-ran every fit
#  to prove a stamp no fit reads changes no fit.  The key of a case now hashes
#  the NORMALISED text of its dictionary files, and nothing else is looser:
#
#    * comments are removed -- `//` to the end of the line and `/* */` -- where
#      the engine's tokenizer (src/core/Dictionary.cpp skipWhitespaceAndComments)
#      sees one: at the START of a token, never inside a "quoted string" and
#      never in the middle of a word (`/` is a word character, so `a//b` is one
#      word and is kept whole);
#    * blank lines go, and runs of blanks inside a line become one space (a
#      newline is KEPT: a line is a row to a table-like record, and the
#      tokenizer's blank/newline equivalence is not used);
#    * the stamp line `schemaVersion 1;` or `schemaVersion 2;` at the top level
#      of the file goes -- the two values the engine accepts (ThermoAnnounce.H
#      reads 2 with one announcement, 1 silently); any other value stays in the
#      text, because the engine REFUSES it and a refused case must not be
#      reused.  `recordType <word>;` is NOT dropped (see the DEV.md note): the
#      engine reads its value to choose the grammar path
#      (ThermoPackageBuilder.cpp:2082, ChemistrySystem.H:75, ...).
#
#  Applied only to the dictionary text of a case (its system/ and constant/
#  files and its constant/ cascade).  NOT applied to: a table (`.csv`, `.tsv`,
#  `.txt`, `.json`, `.py`, `.md`), the `expected` golden, `archiveExtracts/`,
#  `experiments/` (measured-value tables), a dossier, and a record the
#  propertyManifest of its constant/ names -- that one is hashed by the seal
#  check on its PARSED content, stamp included, so a stamp edit there is a
#  divergence the run can see.  Those are hashed whole, as before.
# --------------------------------------------------------------------------

KEY_FORMATS = {2: "normalised-dictionaries-v2",            # absolute paths in the key
               3: "normalised-dictionaries-v3-pathfree",   # no absolute path
               4: "normalised-dictionaries-v4-splitharness"}  # + bin/runTests keyed by its split text
CURRENT_FORMAT = 4
_STAMP = re.compile(r"^schemaVersion[ ]+[12][ ]*;$")
_WORDCH = re.compile(r"[A-Za-z0-9_.+:/\[\]$=\-]")      # Dictionary.cpp isWordChar
_NOT_DICT_EXT = {".csv", ".tsv", ".txt", ".json", ".py", ".md", ".cho",
                 ".dossier", ".gitignore"}


def normalise_dictionary(text):
    """-> the normalised text (see the header above)."""
    out, i, n = [], 0, len(text)
    boundary = True                      # at the start of a token?
    while i < n:
        c = text[i]
        if c == '"':                     # a string: copied untouched
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            out.append(text[i:j + 1])
            i, boundary = j + 1, True
            continue
        if boundary and c == "/" and text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j        # keep the newline itself
            continue
        if boundary and c == "/" and text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            out.append(" ")              # a comment separates tokens
            boundary = True
            continue
        out.append(c)
        boundary = not (_WORDCH.match(c) or c in "eE")
        i += 1
    text = "".join(out)
    # top-level lines: depth counted outside strings
    lines, depth, instr = [], 0, False
    for ln in text.split("\n"):
        top = depth == 0 and not instr
        t = re.sub(r"[ \t\r\f\v]+", " ", ln).strip()
        for ch in ln:
            if ch == '"':
                instr = not instr
            elif not instr:
                depth += (ch == "{") - (ch == "}")
        if not t or (top and _STAMP.match(t)):
            continue
        lines.append(t)
    return "\n".join(lines) + "\n"


@functools.lru_cache(maxsize=None)
def _manifest_text(cdir):
    try:
        return (Path(cdir) / "propertyManifest").read_text(errors="ignore")
    except OSError:
        return ""


def _claimed_by_manifest(p: Path):
    """True when the propertyManifest beside p's constant/ names p's record."""
    parts = p.parts
    if "constant" not in parts:
        return False
    k = len(parts) - 1 - parts[::-1].index("constant")
    cdir = Path(*parts[:k + 1])
    rel = "/".join(parts[k + 1:])
    if not rel or rel == "propertyManifest":
        return False
    return f'"{rel}"' in _manifest_text(str(cdir))


def is_dictionary_text(p: Path):
    """Is this file one whose NORMALISED text keys it (see the header)?"""
    parts = p.parts
    if "system" not in parts and "constant" not in parts:
        return False
    if p.suffix in _NOT_DICT_EXT or p.name.startswith("expected"):
        return False
    if "archiveExtracts" in parts or "experiments" in parts:
        return False
    return not _claimed_by_manifest(p)


def key_sha(p: Path, norm):
    """The hash a case's key holds for file p: normalised when `norm` and p is
    dictionary text, else the plain content hash (H.sha)."""
    if not (norm and is_dictionary_text(p)):
        return H.sha(p)
    try:
        st = p.stat()
    except OSError:
        return "MISSING"
    k, sig = "N:" + str(p), Hasher.signature(st)
    c = H.cache.get(k)
    if c and c[0] == sig:
        return c[1]
    try:
        d = hashlib.sha256(normalise_dictionary(
            p.read_text(errors="replace")).encode()).hexdigest()
    except OSError:
        return "MISSING"
    H.cache[k] = (sig, d)
    H.dirty = True
    return d


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
        pairs.append(("data/local", local_digest()))
    return digest(pairs), len(pairs)


def walk_files(d: Path, skip=()):
    """Every file under d, symlinked directories FOLLOWED (the engine follows
    them; review SE-05: Path.rglob does not, on Python 3.12), sorted; a
    sub-path named in `skip` (relative to d) is not entered."""
    out = []
    for dirpath, dirs, files in os.walk(d, followlinks=True):
        rel = Path(dirpath).relative_to(d).as_posix()
        dirs[:] = sorted(x for x in dirs
                         if (x if rel == "." else f"{rel}/{x}") not in skip)
        out += [Path(dirpath) / f for f in sorted(files)]
    return out


_DIR_DIGESTS = {}


def dir_digest(d: Path, skip=(), norm=False):
    """The digest of everything under d -- tracked, untracked AND ignored --
    or ABSENT.  Absence is part of a key: a constant/ that appears is a
    change."""
    k = (str(d), tuple(skip), norm)
    if k not in _DIR_DIGESTS:
        if not d.exists():
            _DIR_DIGESTS[k] = "ABSENT"
        elif not d.is_dir():
            _DIR_DIGESTS[k] = "FILE:" + H.sha(d)
        else:
            _DIR_DIGESTS[k] = digest([(f.relative_to(d).as_posix(), key_sha(f, norm))
                                      for f in walk_files(d, skip)])
    return _DIR_DIGESTS[k]


def local_digest():
    """The private tier data/local: ignored, read by the engine when present."""
    return dir_digest(ROOT / "data" / "local")


# --------------------------------------------------------------------------
#  THE RESOLVER'S CASCADE (review SE-01, S1, 2026-11-14)
#
#  The engine resolves a record by walking UP from the case directory and
#  reading `<dir>/constant/...` at every level: src/thermo/RecordResolver.H
#  (`walkUpDepth`, localRecord / nearestManifest / localScanDir: the case and
#  up to walkUpDepth - 1 parents), src/thermo/SealCheck.cpp (the manifest,
#  8 levels), src/thermo/Database.cpp (component overlays, 6 levels),
#  src/thermo/ThermoPackageBuilder.cpp, the reaction library in
#  src/applications/choupoSolve/main.cpp, and others.  The first key covered
#  none of the ancestors: a propertyManifest or a component overlay placed in
#  data/curation/electrolytes/constant/ made a sealed curation case FAIL while
#  the suite printed it REUSED.  So the key now covers, for every directory a
#  run starts in, the FULL contents of `<dir>/constant` at that level and at
#  every parent the engine's deepest walk can reach -- inside the repository
#  or above it, present or absent.  The depth is NOT transcribed: it is read
#  from the engine's sources on every key (the largest `walkUpDepth` and the
#  largest literal bound of every `for (int up = 0; up < N` loop under src/),
#  so an engine that walks deeper changes the rule with it.
# --------------------------------------------------------------------------

_WALK = re.compile(r"for\s*\(\s*int\s+up\s*=\s*0\s*;\s*up\s*<\s*([A-Za-z0-9_:]+)")
_DEPTH = []


def resolver_depth():
    """-> (depth, [the file:line each bound was read at])."""
    if _DEPTH:
        return _DEPTH[0]
    named, best, cites = {}, 0, []
    for f in sorted((ROOT / "src").rglob("*")):
        if f.suffix not in (".H", ".cpp", ".h", ".hpp"):
            continue
        text = f.read_text(errors="ignore")
        for m in re.finditer(r"constexpr\s+int\s+(\w+)\s*=\s*(\d+)", text):
            named[m.group(1)] = int(m.group(2))
    for f in sorted((ROOT / "src").rglob("*")):
        if f.suffix not in (".H", ".cpp", ".h", ".hpp"):
            continue
        for n, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
            m = _WALK.search(line)
            if not m:
                continue
            tok = m.group(1).split("::")[-1]
            v = int(tok) if tok.isdigit() else named.get(tok)
            if v is None:
                v = 64                        # an unreadable bound: be generous
            if v > best:
                best, cites = v, []
            if v == best:
                cites.append(f"{f.relative_to(ROOT).as_posix()}:{n}")
    _DEPTH.append((max(best, 1), cites))
    return _DEPTH[0]


#  Inside a case's own constant/, the fetched archive extracts are re-made by
#  `choupo-curate fetch` before every run and checked against the sha256 the
#  TRACKED declaration names (the review confirmed a tampered extract is
#  overwritten), so they are an output of the declaration, not an input.
CASE_SKIP = ("archiveExtracts",)


def cascade(start: Path, norm=False, pathfree=True):
    """[(<dir>/constant, digest)] for the run directory `start` and every
    parent the engine's walk reaches (dictionary files by their normalised
    text when `norm`)."""
    depth, _ = resolver_depth()
    out, p = [], start.resolve() if start.exists() else start
    root = ROOT.resolve()
    for i in range(depth):
        c = p / "constant"
        if pathfree:
            #  the label of a directory is its path RELATIVE to the repository
            #  root, or `above#<level>` for one above it: two checkouts of one
            #  commit at two paths must compute one key (the digest holds the
            #  content, and absence)
            try:
                label = c.relative_to(root).as_posix()
            except ValueError:
                label = f"above#{i}"
        else:
            label = str(c)
        out.append((label, dir_digest(c, CASE_SKIP, norm)))
        if p.parent == p:
            break
        p = p.parent
    return out


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
        m = gsr._module(p, ROOT, strict=True)
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
        m = gsr._module(p, ROOT, strict=True)
        #  OUTERMOST path expressions only (review SE-04): `ROOT / "data" /
        #  "standards"` names data/standards, not the bare parent `data`,
        #  which used to pass the honesty arm as "a parent of a keyed tree".
        inner = set()
        for node in ast.walk(m.tree):
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
                inner.add(id(node.left))
        for node in ast.walk(m.tree):
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div) \
                    and id(node) not in inner:
                v = m.ev(node)
                for x in v or ():
                    if isinstance(x, gsr._Path) and x.rel and \
                            not _case_relative(x.rel):
                        out.add(x.rel)
        for s in _literals(m.tree):
            s2 = s.strip()
            if "/" in s2 and " " not in s2 and s2.split("/")[0] in tops \
                    and not _case_relative(s2):
                out.add(s2.rstrip("/"))
    return out


def _case_relative(rel):
    """`constant/...`, `system/...`: a name inside a case directory, relative
    to wherever the case runs -- read through the resolver's cascade, which
    the key covers (cascade()), never a repository path.  Review SE-01: the
    first version read `constant/x` as the repository's ./constant whenever
    that directory existed, and stopped keying the gate by accident."""
    return rel.split("/")[0] in ("constant", "system")


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
        bad.append(r)
    return bad


def platform_half():
    """`uname -m`, the Python version and golden_bands' own platform
    fingerprint -- CPU model, C library, compiler (review SE-03): a system
    update that moves libm or libstdc++ moves the key."""
    try:
        import golden_bands
        fp = golden_bands.platform_fingerprint()
    except Exception as e:                     # the key must still be honest
        fp = f"unreadable({type(e).__name__})"
    return (f"{platform.machine()} python{sys.version_info[0]}."
            f"{sys.version_info[1]} {fp}")


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
    refs = spec.get("case_refs")
    if refs:
        out_of = case_refs_outside(refs[0], refs[1], spec["trees"])
        if out_of:
            return None, (f"NOT KEYED: {len(out_of)} `{refs[0]}` value(s) in "
                          f"the records it reads point outside its keyed "
                          f"trees, first {out_of[0]}")
    #  THE CASCADE: every directory a case of this gate runs in -- each case
    #  directory in the keyed trees (in place) and the two scratch homes it
    #  copies cases to (a mkdtemp under the system temporary directory and
    #  under build/, two levels deep) -- with every parent the engine's walk
    #  reaches.
    starts = [ROOT / c for c in case_dirs(spec["trees"])]
    starts += [Path(tempfile.gettempdir()) / "x" / "case", ROOT / "build" / "x" / "case"]
    casc = sorted({pair for st in starts for pair in cascade(st)})
    har = digest([(h.relative_to(ROOT).as_posix(), H.sha(h)) for h in harness])
    key = digest([("engine", eng), ("data", dat), ("harness", har),
                  ("cascade", digest(casc)),
                  ("platform", platform_half()), ("gate", stem)])
    H.save()
    depth, _ = resolver_depth()
    return key, (f"{n_obj} engine objects, {n_dat} data files under "
                 f"{', '.join(spec['trees'])}"
                 + (" + data/local" if spec.get("local") else "")
                 + f", {len(casc)} constant/ directories of the resolver's "
                 f"cascade ({depth} levels), {len(harness)} harness files")


def case_dirs(trees):
    files = git_files(trees) or []
    return sorted({f[:-len("/system/controlDict")] for f in files
                   if f.endswith("/system/controlDict")})


def case_refs_outside(field, where, trees):
    """Values of `field` (fittedInCase) in the records the gate reads (the
    pathspecs `where`) that point outside its keyed trees (review SE-04: the
    gate runs ROOT / <value> unchecked)."""
    p = subprocess.run(["git", "-C", str(ROOT), "grep", "--untracked", "-h",
                        "-o", "-E", field + r"[[:space:]]+[^;]+", "--"] + where,
                       capture_output=True, text=True)
    bad = set()
    for line in p.stdout.splitlines():
        v = line.split(None, 1)[1].strip().strip('"').strip("'") \
            if len(line.split(None, 1)) == 2 else ""
        if v and not any(v.rstrip("/") == t or v.startswith(t + "/")
                         for t in trees):
            bad.add(v)
    return sorted(bad)


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
        print(f"PASS taken {st['date']}; its keyed inputs are unchanged "
              f"(key {key[:12]}: {detail}).  Its claim then: "
              f"{st.get('claim', '')}")
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


# --------------------------------------------------------------------------
#  THE HARNESS OF A CASE, SPLIT (key format 4; the maintainer's rule of
#  2026-11-18).  Formats 1-3 hashed bin/runTests WHOLE, so any edit of it --
#  a new gate block is the commonest -- re-keyed all 1260 cases.  Format 4
#  hashes what a case's verdict can depend on:
#
#    (a) the text of check_case, check_case_body and every shell function
#        reachable from them or from a retained top-level line (found by
#        name among the defined functions);
#    (b) every top-level line of the file that is neither inside a function
#        definition nor inside a GATE BLOCK -- so every export, assignment,
#        mode switch, guard and call that runs before or around the cases;
#    (c) the other harness files (scripts the closure names, golden_bands...),
#        as before, minus this tool itself (its output IS the key).
#
#  A GATE BLOCK, the only thing left out, is exactly the documented shape: the
#  comment and blank lines directly above `    if gate_exec ...`, the
#  statement through its `    fi` (four spaces), the blank lines after it and
#  the `    rm -f ...` lines that follow -- and ONLY when its statements hold no
#  export/unset/source/cd/declare/eval/trap/set/shopt and no assignment but the
#  tally counters (pass, fail, known_broken, expected_fail, reused, skipped,
#  nprob): a block that sets anything else stays hashed.  The bodies of
#  functions not reachable stay out: they never run in a case's path.
#  Structure that does not parse this way is KEPT, never dropped: a miss
#  re-keys, it cannot reuse wrongly.
# --------------------------------------------------------------------------

_TALLY = re.compile(r"^(pass|fail|known_broken|expected_fail|reused|skipped|nprob)=")
_SETS = re.compile(r"^(export|unset|source|\.|cd|declare|typeset|eval|exec|trap|"
                   r"set|shopt|local|read|mapfile)\b")
_ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\[.*\])?\+?=")


def runtests_function_ranges(lines):
    """{name: (first line, last line)} of every top-level function (the same
    rule as runtests_functions)."""
    out, i = {}, 0
    while i < len(lines):
        m = RUNTESTS_FN.match(lines[i])
        if not m:
            i += 1
            continue
        if lines[i].rstrip().endswith("}") and lines[i].count("{") <= \
                lines[i].count("}"):
            out[m.group(1)] = (i, i)
            i += 1
            continue
        j = i + 1
        while j < len(lines) and lines[j].rstrip() != "}":
            j += 1
        out[m.group(1)] = (i, min(j, len(lines) - 1))
        i = j + 1
    return out


def runtests_gate_blocks(lines):
    """[(first, last)] line ranges of the gate blocks of the documented shape."""
    blocks, n = [], len(lines)
    for i, l in enumerate(lines):
        if not l.startswith("    if gate_exec "):
            continue
        j = i + 1
        while j < n and lines[j] != "    fi":
            j += 1
        if j >= n:
            continue
        ok = True
        for x in lines[i:j + 1]:
            t = x.strip()
            if not t or t.startswith("#"):
                continue
            if _SETS.match(t) or (_ASSIGN.match(t) and not _TALLY.match(t)):
                ok = False
                break
        if not ok:
            continue
        a = i
        while a > 0 and (not lines[a - 1].strip() or lines[a - 1].lstrip().startswith("#")):
            a -= 1
        b = j
        while b + 1 < n and (not lines[b + 1].strip() or lines[b + 1].startswith("    rm -f ")):
            b += 1
        blocks.append((a, b))
    return blocks


def runtests_split(text):
    """-> (the harness text of format 4, [the retained top-level lines], the
    reachable function names)."""
    lines = text.split("\n")
    fr = runtests_function_ranges(lines)
    drop = set()
    for a, b in runtests_gate_blocks(lines):
        drop.update(range(a, b + 1))
    infn = set()
    for a, b in fr.values():
        infn.update(range(a, b + 1))
    top = [l for i, l in enumerate(lines) if i not in infn and i not in drop]
    bodies = {n: "\n".join(lines[a:b + 1]) for n, (a, b) in fr.items()}
    seen, todo = set(), ["check_case_body", "check_case"]
    toptext = "\n".join(top)
    for g in bodies:
        if re.search(r"(?<![\w-])" + re.escape(g) + r"(?![\w-])", toptext):
            todo.append(g)
    while todo:
        f = todo.pop()
        if f in seen or f not in bodies:
            continue
        seen.add(f)
        for g in bodies:
            if g not in seen and re.search(r"(?<![\w-])" + re.escape(g)
                                           + r"(?![\w-])", bodies[f]):
                todo.append(g)
    return (toptext + "\n" + "\n".join(bodies[f] for f in sorted(seen)),
            top, sorted(seen))


def golden_mode():
    """The golden-band mode this run compares in, as bin/runTests exports it
    (CHOUPO_REUSE_GOLDEN_MODE = the first two fields of `golden_bands.py
    mode`).  A standalone call (`case-plan`, `migrate-keys`) asks the same
    tool, so its keys equal the sweep's -- before, it read an empty string and
    no key it printed could equal a stored one."""
    v = os.environ.get("CHOUPO_REUSE_GOLDEN_MODE")
    if v is not None:
        return v
    r = subprocess.run([sys.executable, "-I", str(ROOT / "bin" / "curate"
                                                  / "golden_bands.py"), "mode"],
                       capture_output=True, text=True)
    return "\t".join(r.stdout.rstrip("\n").split("\t")[:2]) \
        if r.returncode == 0 else ""


def case_harness(text=None, split=False):
    """-> (digest, n) of what check_case executes.  `text` is the bin/runTests
    to read (default: this tree's); only migrate-keys passes another, the one
    a stored verdict was taken under."""
    override = text is not None
    if text is None:
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
    split_text = None
    if split:
        #  the scripts named are those of check_case's closure only (as in
        #  formats 1-3): the retained top-level text names every gate script
        #  (lists, modes), and keying them all would re-key every case on any
        #  gate edit
        split_text, _top, _reach = runtests_split(text)
    scripts = set()
    for w in re.findall(r"\$ROOT/(bin/[A-Za-z0-9_./-]+)", body):
        if (ROOT / w).is_file():
            scripts.add(ROOT / w)
    for w in re.findall(r"\$ROOT/(bin/curate/golden_bands)\.py", body):
        scripts.add(ROOT / "bin" / "curate" / "golden_bands.tsv")
    scripts.add(ROOT / "bin" / "curate" / "golden_bands.tsv")
    scripts.add(ROOT / "bin" / "curate" / "recording_platform.txt")
    if split:
        scripts.discard(ROOT / "bin" / "curate" / "suite_reuse.py")
    files = harness_closure(sorted(scripts))
    files = sorted(set(files) | {s for s in scripts if s.is_file()})
    if split:
        #  format 4: the file is represented by its split text, and this tool
        #  (whose output is the key) is not a harness file
        files = [f for f in files if f not in (ROOT / "bin" / "runTests",
                                              ROOT / "bin" / "curate" / "suite_reuse.py")]
        pairs = [("runTests-split", hashlib.sha256(split_text.encode()).hexdigest())]
    else:
        pairs = [("fn:" + f, hashlib.sha256(fns[f].encode()).hexdigest())
                 for f in sorted(seen)]
    #  bin/runTests is itself in the closure (a script names it), whole: a
    #  text passed by migrate-keys stands for the file as it was.
    pairs += [(p.relative_to(ROOT).as_posix(),
               hashlib.sha256(text.encode()).hexdigest()
               if override and p == ROOT / "bin" / "runTests" else H.sha(p))
              for p in files]
    mode = golden_mode()
    pairs.append(("golden-mode", mode))
    return digest(pairs), (sorted(seen), files)


# --------------------------------------------------------------------------
#  THE NARROW KEY OF A choupoProps CURATION FIT (DEV.md 4c C414 (3), slice
#  "fit reuse"; the architect's rulings of 2026-11-16: hashes only, never a
#  judgement)
#
#  The first key of a curation case hashed the WHOLE engine (every object of
#  the build) and the whole data/standards tree, so a change to a solids unit
#  or to ANY catalogue record re-ran about 1170 fits whose verdict could not
#  have moved.  A fit reads very little of either, and the narrow key says
#  exactly what, from two measurements and one declared premise:
#
#  ENGINE.  The objects REACHABLE, through the symbols they define and
#  reference (`nm`), from the choupoProps entry objects
#  (src/applications/choupoProps/) plus the objects of the operations the case
#  NAMES in its system/propsDict -- with ONE edge cut, declared here: the
#  operation registry (src/propertyOps/PropertyOperation.o) is entered, hashed
#  and followed for everything EXCEPT its edges to the operation objects, which
#  it holds only to instantiate a type by name from the case.  The premise that
#  makes the cut sound is MACHINE-CHECKED on every key: nothing outside the
#  choupoProps entry objects and the registry itself references
#  `PropertyOperation::New`, so an operation can enter a run only by being named
#  in a propsDict; and every named operation must resolve to at least one
#  object, or the case falls back to the whole engine.  Every other registry
#  (activity models, equations of state, vapour-pressure models, ...) is
#  followed in full: a model the case does not use is still keyed, because the
#  case's dictionaries choose it at run time and the key does not read them.
#  Hashed by the objects' CONTENT (as the whole-engine key was), so an edit
#  that changes no machine code changes no key.  What the cut leaves out of a
#  fit's key is what a fit cannot run: the unit operations (UnitOperation.o is
#  reached only from the registry's unit-acceptance operation), the post
#  processors, the dynamic driver, the other applications.
#  A static initialiser in an unreached object is NOT keyed: the premise is
#  the project rule that nothing registers itself (CLAUDE.md section 5, no
#  auto-registration); `verify-reads` and the sabotage tests of the slice hold
#  what a reach computed this way could miss, by measurement.
#
#  DATA (only the `pairs/` and `components/` kinds, whose reads were traced
#  with strace -f on 2026-11-16 and are re-held by `verify-reads`).  A pair run
#  reads, outside its own directory, ONLY: (a) data/standards/assets and
#  data/local/assets, scanned whole at start-up; (b) the records of its
#  components: data/standards/components/<c>.dat and data/local/components/<c>.dat
#  (looked up; the case-local copy is what is used), plus -- for a
#  `components/` case -- data/standards/mixtures/<c>.dat.  The key takes, for
#  every component NAME the case's own dictionaries or file names mention,
#  every file under data/standards, data/local and data/groupEstimative whose
#  stem is that name or a pair stem <a>-<b> that begins or ends with it, and
#  both asset trees in full.  The record's Psat law is in the record.  A case
#  of any other kind (electrolytes, henry, batches, transport_c327) keeps the
#  whole-tree data half: its reads were not narrowed here, and each reads more
#  (species, chemistry, parameters/<model>/, CATALOGUE.dat) than the rule
#  above covers.
# --------------------------------------------------------------------------

REGISTRY_OBJ = "src/propertyOps/PropertyOperation.o"
REGISTRY_SRC = "src/propertyOps/PropertyOperation.cpp"
NARROW_DATA_KINDS = ("pairs", "components")
#  transport_c327 (92 scans, 22 min): its thermoPhysPropDict lists 40
#  components and the run reads their records, and the species of the ions of
#  NaNO3, from the catalogue -- traced 2026-11-16.  Not nameable by the rule
#  above (an ion's record is not named in the case), so its data half is the
#  three directories it reads, whole.  Named, not generalised: the other
#  batches/ cases were not traced.
DIRS_RULE_CASES = {
    "data/curation/batches/transport_c327":
        ("components", "species", "assets"),
}
_SYM = {}
ENGINE_MAPS = {}      # narrow-engine digest -> {object (or stamp): content sha}  (C432)
PARTS = {}            # case -> the parts of its key, for the route-keyed reuse (C432)


def _sym_cache_file():
    return STORE / "symcache.json"


def sym_graph(b):
    """{object (relative to the build): (sha, defined, strong, undefined)},
    cached by the object's content hash."""
    if _SYM:
        return _SYM["g"]
    try:
        cache = json.loads(_sym_cache_file().read_text())
    except (OSError, ValueError):
        cache = {}
    g, dirty = {}, False
    for o in sorted((b / "src").rglob("*.o")):
        rel = o.relative_to(b).as_posix()
        sha = H.sha(o)
        c = cache.get(rel)
        if c and c[0] == sha:
            g[rel] = tuple(c)
            continue
        d_, s_, u_ = [], [], []
        for line in subprocess.run(["nm", "--defined-only", "-P", str(o)],
                                   capture_output=True, text=True).stdout.splitlines():
            p = line.split()
            if len(p) >= 2 and p[1] in "TDBRVWuiCSG":
                d_.append(p[0])
                if p[1] in "TDBR":
                    s_.append(p[0])
        for line in subprocess.run(["nm", "-u", "-P", str(o)],
                                   capture_output=True, text=True).stdout.splitlines():
            p = line.split()
            if len(p) >= 2 and p[1] == "U":
                u_.append(p[0])
        g[rel] = (sha, d_, s_, u_)
        cache[rel] = [sha, d_, s_, u_]
        dirty = True
    if dirty:
        STORE.mkdir(parents=True, exist_ok=True)
        tmp = _sym_cache_file().with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(cache))
        os.replace(tmp, _sym_cache_file())
    _SYM["g"] = g
    return g


def registry_ops():
    """{operation type: class} read from PropertyOperation::registerBuiltins."""
    text = (ROOT / REGISTRY_SRC).read_text(errors="ignore")
    return dict(re.findall(
        r'reg\("(\w+)",\s*\[\]\s*\{\s*return std::make_unique<(\w+)>', text))


def case_ops(case_dir: Path):
    """The registered operation types the case's propsDict names (every word
    of the file that is a registered type, comments included: generous)."""
    p = case_dir / "system" / "propsDict"
    if not p.is_file():
        return None
    words = set(re.findall(r"[A-Za-z0-9_]+", p.read_text(errors="ignore")))
    reg = registry_ops()
    return sorted(w for w in words if w in reg)


_REACH = {}


def reach(ops):
    """-> (frozenset of build-relative object paths, None) or (None, reason)."""
    ops = tuple(ops)
    if ops in _REACH:
        return _REACH[ops]
    _REACH[ops] = _reach(ops)
    return _REACH[ops]


def _reach(ops):
    b = platform_build()
    if b is None:
        return None, "no platform build behind ./choupoProps"
    g = sym_graph(b)
    if REGISTRY_OBJ not in g:
        return None, f"{REGISTRY_OBJ} is not in the build"
    reg = registry_ops()
    if not reg:
        return None, f"no operation registrations read from {REGISTRY_SRC}"
    defs, strong = {}, {}
    for o, (_, d_, s_, _u) in g.items():
        for s in d_:
            defs.setdefault(s, set()).add(o)
        for s in s_:
            strong[(s, o)] = True
    entry = {o for o in g if o.startswith("src/applications/choupoProps/")}
    if not entry:
        return None, "no choupoProps entry objects in the build"

    def objects_of(cls):
        pre, vt = f"_ZN6Choupo{len(cls)}{cls}", f"_ZTVN6Choupo{len(cls)}{cls}E"
        r = set()
        for s, os_ in defs.items():
            if s.startswith(pre) or s.startswith(vt):
                r |= {x for x in os_ if strong.get((s, x))}
        return r
    opobjs = set()
    for cls in reg.values():
        opobjs |= objects_of(cls)
    #  the machine-checked premise: an operation enters a run only through
    #  the registry, by a name in the case
    new_sym = "_ZN6Choupo17PropertyOperation3New"
    for o, (_, _d, _s, u_) in g.items():
        if o in entry or o == REGISTRY_OBJ:
            continue
        if any(s.startswith(new_sym) for s in u_):
            return None, (f"PREMISE BROKEN: {o} references "
                          "PropertyOperation::New, so an operation can enter a "
                          "run without being named in the case")
    roots = set(entry)
    for t in ops:
        cls = reg.get(t)
        objs = objects_of(cls) if cls else set()
        if not objs:
            return None, (f"operation `{t}` resolves to no object "
                          f"(class {cls}): the whole engine is keyed")
        roots |= objs
    seen, todo = set(roots), list(roots)
    while todo:
        o = todo.pop()
        for s in g[o][3]:
            for d in defs.get(s, ()):
                if o == REGISTRY_OBJ and d in opobjs and d not in roots:
                    continue                       # the cut
                if d not in seen:
                    seen.add(d)
                    todo.append(d)
    return frozenset(seen), None


def engine_objects_digest(objs):
    """The engine half over a set of build-relative objects: content hashes,
    the two objects that print the commit keyed on their sources instead, and
    the compiler / flag stamps."""
    return digest(engine_objects_pairs(objs))


def engine_objects_pairs(objs):
    """The (name, sha) pairs the engine digest is made of: one per object (the
    two that print the commit by `<object>< <source>`), one per flag stamp."""
    b = platform_build()
    pairs = []
    for rel in sorted(objs):
        o = b / rel
        d = o.with_suffix(".d")
        deps = []
        if d.is_file():
            t = d.read_text(errors="ignore").replace("\\\n", " ")
            first = t.split("\n", 1)[0]
            deps = first.split(":", 1)[1].split() if ":" in first else []
        if any(x.endswith("generated/gitVersion.H") for x in deps):
            for x in deps:
                if not x.endswith("generated/gitVersion.H"):
                    pairs.append((rel + "<" + x, H.sha(ROOT / x)))
        else:
            pairs.append((rel, H.sha(o)))
    for s in sorted(b.glob(".stamp-*")):
        pairs.append(("stamp", s.name))
    return pairs


def data_root():
    return Path(os.environ.get("CHOUPO_HOME") or ROOT)


_STEMS = {}


def stem_index():
    """({name: [files whose stem is the name, or a pair stem that begins or
    ends with it]}, {component names}) over data/standards, data/local and
    data/groupEstimative, paths relative to the data root."""
    if _STEMS:
        return _STEMS["idx"], _STEMS["names"]
    dr = data_root()
    idx, names, files = {}, set(), []
    for tree in ("data/standards", "data/groupEstimative", "data/local"):
        files += [f.relative_to(dr).as_posix() for f in walk_files(dr / tree)]
    for f in files:
        stem = Path(f).stem
        if f.startswith(("data/standards/components/", "data/local/components/",
                         "data/groupEstimative/")):
            names.add(stem)
        keys = {stem}
        for i, ch in enumerate(stem):
            if ch == "-":
                keys.add(stem[:i])
                keys.add(stem[i + 1:])
        for k in keys:
            idx.setdefault(k, []).append(f)
    _STEMS["idx"], _STEMS["names"] = idx, names
    return idx, names


def case_names(case_files):
    """Component names a case mentions: the words of its system/ and
    constant/ text files (the archive extracts and the expected files aside)
    and the stems of every file it holds."""
    _, names = stem_index()
    words = set()
    for f in case_files:
        words.add(Path(f).stem)
        parts = f.split("/")
        if "archiveExtracts" in parts or parts[-1].startswith("expected"):
            continue
        if ("system" in parts or "constant" in parts) and not f.endswith(".csv"):
            p = ROOT / f
            try:
                if p.stat().st_size <= (1 << 20):
                    words |= set(re.findall(r"[^\s;{}()\[\]\"',]+",
                                            p.read_text(errors="ignore")))
            except OSError:
                pass
    return sorted(w for w in words if w in names)


def narrow_data(case_files, pathfree=True):
    """-> (digest, (names, files)): the narrow data half of a pair or
    component case."""
    dr = data_root()
    idx, _ = stem_index()
    names = case_names(case_files)
    files = sorted({f for n in names for f in idx.get(n, [])})
    pairs = [("root", "DATA_ROOT" if pathfree else str(dr))]
    pairs += [(f, H.sha(dr / f)) for f in files]
    for a in ("data/standards/assets", "data/local/assets"):
        pairs.append((a, dir_digest(dr / a)))
    #  the existence of a component record in each tier is part of the key (a
    #  record that appears under data/local changes the lookup)
    for n in names:
        for t in ("standards", "local"):
            f = f"data/{t}/components/{n}.dat"
            pairs.append(("has:" + f, "yes" if (dr / f).is_file() else "no"))
    return digest(pairs), (names, files)


def dirs_data(dirs, pathfree=True):
    """The data half of a DIRS_RULE case: the named catalogue directories of
    both tiers, hashed whole."""
    dr = data_root()
    pairs = [("root", "DATA_ROOT" if pathfree else str(dr))]
    for t in ("standards", "local"):
        for d in dirs:
            pairs.append((f"data/{t}/{d}", dir_digest(dr / "data" / t / d)))
    return digest(pairs)


def data_half_for(case_rel, case_files, coarse, pathfree=True):
    """-> (the data part of a narrow case's key, its label)."""
    if case_rel in DIRS_RULE_CASES:
        return ("data-dirs", dirs_data(DIRS_RULE_CASES[case_rel], pathfree)), "data=dirs"
    if case_kind(case_rel) in NARROW_DATA_KINDS:
        return ("data-narrow", narrow_data(case_files, pathfree)[0]), "data=narrow"
    return ("data", coarse), "data=WHOLE-TREE"


def narrow_engine(case_rel):
    """-> (digest, n_objects, ops) or (None, reason, None)."""
    cdir = ROOT / case_rel
    try:
        app = re.search(r"^\s*application\s+(\w+)\s*;",
                        (cdir / "system" / "controlDict").read_text(errors="ignore"),
                        re.M)
    except OSError:
        app = None
    if not app or app.group(1) != "choupoProps":
        return None, "the case does not run choupoProps", None
    if (cdir / "system" / "flowsheetDict").is_file():
        return None, "the case also runs the process binary", None
    ops = case_ops(cdir)
    if not ops:
        return None, "no registered operation read from its propsDict", None
    objs, why = reach(ops)
    if objs is None:
        return None, why, None
    pairs = engine_objects_pairs(objs)
    d = digest(pairs)
    #  kept for the route-keyed reuse (C432): what each object was, by name
    ENGINE_MAPS[d] = {(a if a != "stamp" else "stamp:" + b): (b if a != "stamp" else "")
                      for a, b in pairs}
    return d, len(objs), ops


def case_kind(case_rel):
    parts = case_rel.split("/")
    return parts[2] if len(parts) > 2 and parts[:2] == ["data", "curation"] else "-"


# --------------------------------------------------------------------------
#  verify-reads: the narrow key held against what a run READS
#
#      suite_reuse.py verify-reads <case> [<case> ...]
#      suite_reuse.py verify-reads --kind pairs --every 40
#
#  Runs each case under `strace -f` (the case's own binary, choupoProps),
#  collects every path the process touches outside the case's own directory,
#  and checks that each one is inside what the narrow key covers: the two
#  asset trees, the records the key hashes, the directories a DIRS_RULE case
#  names, the `constant/` cascade of the case's ancestors, and the build.  A
#  path outside is a READ THE KEY DOES NOT SEE -- the case would be reused over
#  an edit of it -- and the command exits 1 naming it.  It needs strace and
#  runs the fits, so it is a tool for the slice that changes the rule and for
#  a periodic audit, never part of a sweep.
# --------------------------------------------------------------------------

def strace_reads(case_rel):
    """The existing paths a run of the case touches outside its own directory
    (relative to the data root), or None if it could not run."""
    dr = data_root()
    cdir = ROOT / case_rel
    if (cdir / "constant" / "archiveDatasets").is_file():
        r = subprocess.run([sys.executable, "-I", str(ROOT / "bin" / "choupo-curate"),
                            "fetch", str(cdir)], capture_output=True, text=True)
        if r.returncode != 0:
            return None
    fd, tf = tempfile.mkstemp(prefix="reads.")
    os.close(fd)
    env = dict(os.environ, CHOUPO_HOME=str(dr))
    subprocess.run(["strace", "-f", "-e",
                    "trace=openat,newfstatat,stat,statx,access,faccessat,faccessat2",
                    "-o", tf, str(ROOT / "choupoProps"), str(cdir)],
                   cwd=str(ROOT), env=env, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)
    out = set()
    pat = re.compile(r'(?:openat|newfstatat|stat|statx|access|faccessat2?)\([^"]*"([^"]+)"')
    caseabs = str(cdir.resolve()) + "/"
    for line in open(tf, errors="ignore"):
        m = pat.search(line)
        if not m or "ENOENT" in line:
            continue
        p = m.group(1)
        if not p.startswith("/"):
            p = os.path.join(str(cdir), p)
        p = os.path.normpath(p)
        if (p + "/").startswith(caseabs) or p.startswith(str(ROOT / "build")):
            continue
        if p == str(ROOT / "choupoProps"):
            continue
        if p.startswith(str(dr) + "/"):
            out.add(p[len(str(dr)) + 1:])
    os.unlink(tf)
    return out


def allowed_read(path, case_rel, files, dirs):
    if path.startswith(("data/standards/assets/", "data/local/assets/")) or \
            path in ("data/standards/assets", "data/local/assets"):
        return True
    if path in files:
        return True
    if any(f.startswith(path + "/") for f in files):
        return True                      # a directory on the way to a record
    if any(path.startswith(d + "/") or path == d for d in dirs):
        return True
    #  the directories above the case and their `constant/` (the cascade)
    if case_rel.startswith(path + "/") or path == case_rel:
        return True
    parts = path.split("/")
    if "constant" in parts and case_rel.startswith("/".join(parts[:parts.index("constant")])):
        return True
    return path in ("data", "data/standards", "data/local",
                    "data/standards/components", "data/local/components")


def verify_reads(argv):
    cases = []
    if argv[:1] == ["--kind"]:
        kind, every = argv[1], int(argv[argv.index("--every") + 1]) if "--every" in argv else 1
        allc = case_dirs(["data/curation/" + kind])
        cases = allc[::every]
    else:
        cases = [c.rstrip("/") for c in argv]
    bad_total = 0
    for c in cases:
        ne, nn, _ops = narrow_engine(c)
        if not ne:
            print(f"SKIP  {c}: not narrow ({nn})")
            continue
        files, dirs = set(), []
        if c in DIRS_RULE_CASES:
            dirs = [f"data/{t}/{d}" for t in ("standards", "local")
                    for d in DIRS_RULE_CASES[c]]
        elif case_kind(c) in NARROW_DATA_KINDS:
            files = set(narrow_data(git_files([c]) or [])[1][1])
        else:
            print(f"SKIP  {c}: whole-tree data half")
            continue
        reads = strace_reads(c)
        if reads is None:
            print(f"SKIP  {c}: could not run (fetch refused)")
            continue
        bad = sorted(p for p in reads if not allowed_read(p, c, files, dirs))
        if bad:
            bad_total += 1
            print(f"FAIL  {c}: {len(bad)} read(s) the key does not see, first {bad[:5]}")
        else:
            print(f"OK    {c}: {len(reads)} paths read, all inside the key")
    H.save()
    return 1 if bad_total else 0


def pinned_key_parts(case_abs: Path):
    """THE KEY OF A CASE THAT REFERENCES THE CATALOGUE (C413).

    A sealed case carries its records, so its own files ARE the key; a pinned
    case does not, and a water edit would change its result and none of its
    files until the re-pin.  So its key holds the CURRENT content hash of every
    catalogue file its manifest pins (an `absent` pin is keyed by whether the
    name exists now) -- an edit of a pinned record moves the key (the case
    runs, and a pin that no longer matches FAILS under CHOUPO_PINS=refuse), an
    edit of a record the case does not pin moves nothing.  None when the
    nearest manifest holds no pins."""
    m = case_records.manifest_of(case_abs)
    if m is None:
        return None
    mf = case_records.read_manifest(m)
    if not mf["has_pins"]:
        return None
    parts = []
    for sub in sorted(mf["pins"]):
        f = ROOT / "data" / "standards" / sub
        if sub.endswith("/"):
            #  a SET line (relevant names that exist in a registry directory): the
            #  names the directory holds are the input -- a file added to it may be
            #  one the case selects (coarser than the engine's own check, which is
            #  the point of a reuse key: it can only rerun a case, never skip one)
            parts.append(("pin:" + sub, digest([(x.name, "") for x in sorted(f.glob("*.dat"))])
                          if f.is_dir() else "ABSENT"))
            continue
        #  a pinned file's CONTENT
        parts.append(("pin:" + sub, H.sha(f) if f.is_file() else "ABSENT"))
    return parts


def case_keys(root_rel, fmt=CURRENT_FORMAT, runtests_text=None):
    """The key of every curation case under root_rel, in the key format `norm`
    selects -> (rows, None) with rows = [(case, key, data label, engine
    label)], or (None, the reason).

    fmt 3 is THE key: dictionary files by their normalised text, no absolute
    path anywhere, and KEY_FORMAT in the material.  fmt 2 (normalised text,
    absolute paths: the data root and the constant/ directories by path) and
    fmt 1 (whole files, absolute paths, no tag) are the formats of
    2026-11-18 and earlier, kept ONLY so `migrate-keys` can recognise a stored
    verdict; nothing else uses them and they may be deleted once every store
    has been migrated."""
    norm, pathfree, split = fmt >= 2, fmt >= 3, fmt >= 4
    eng, n_obj = engine_half()
    if eng is None:
        return None, f"engine half unreadable ({n_obj})"
    dat, n_dat = data_half(["data/standards", "data/groupEstimative",
                            "data/README.md"], True)
    har, _ = case_harness(runtests_text, split)
    plat = platform_half()
    base = digest([("engine", eng), ("data", dat), ("harness", har),
                   ("platform", plat)])
    #  The DATA half of a PINNED case (C413): data/standards reduced to the NAMES
    #  it holds (a new file in a scanned directory is a read the pins do not
    #  cover); the content of what the case pins is in its own key.
    pin_data = []

    def pinned_data():
        if not pin_data:
            dat2, _n = data_half(["data/groupEstimative", "data/README.md"], True)
            names = digest([(f, "") for f in (git_files(["data/standards"]) or [])])
            pin_data.append(digest([("data", dat2), ("standardsNames", names)]))
        return pin_data[0]
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
    rows = []
    for c in cases:
        pairs = [(f, key_sha(ROOT / f, norm)) for f in per[c]]
        #  loose files in the directories above the case (a README beside two
        #  sibling cases) -- generous: never read, but cheap to include
        d = os.path.dirname(c)
        while d and d.startswith(root_rel.rstrip("/")):
            pairs += [(f, key_sha(ROOT / f, norm)) for f in loose.get(d, [])]
            d = os.path.dirname(d)
        #  The resolver's cascade from this case (review SE-01): the case's
        #  own constant/ in full (ignored files too, the fetched extracts
        #  aside) and every parent's constant/, present or absent.
        pairs += cascade(ROOT / c, norm, pathfree)
        #  THE COMPOSED KEY (C414 (3) + C413).  ENGINE: the narrow reach when the
        #  case is a choupoProps fit, else the whole engine.  DATA: the case's
        #  PINS when it has them (exact: the current hash of each pinned file
        #  and the set lines), else the by-name rule of the narrow fit, else the
        #  whole tree.  A sealed case's own files are in `pairs` as before.
        ne, nn, nops = narrow_engine(c)
        pp = pinned_key_parts(ROOT / c)
        engp = ("engine-narrow", ne) if ne else ("engine", eng)
        if pp is not None:
            dpart, dlabel = ("data-pinned", pinned_data()), "data=pins"
        elif ne:
            dpart, dlabel = data_half_for(c, per[c], dat, pathfree)
        else:
            dpart, dlabel = ("data", dat), "data=WHOLE-TREE"
        cbase = digest([engp, dpart, ("harness", har), ("platform", plat)]
                       + ([("keyFormat", KEY_FORMATS[fmt])] if norm else []))
        e = (f"engine=narrow({nn} objects; ops {','.join(nops)})" if ne
             else f"engine=WHOLE ({nn})")
        rows.append((c, digest([("base", cbase)] + sorted(pairs) + (pp or [])),
                     dlabel, e))
        if fmt == CURRENT_FORMAT and runtests_text is None:
            #  THE PARTS OF THE KEY (C432): everything but the engine in one
            #  digest, and the engine by the objects it is made of
            PARTS[c] = {
                "rest": digest([dpart, ("harness", har), ("platform", plat),
                                ("keyFormat", KEY_FORMATS[fmt])]
                               + sorted(pairs) + (pp or [])),
                "narrow": bool(ne), "engine": ne or eng,
                "ops": list(nops) if ne else None,
                "pins": [x[0] for x in pp] if pp is not None else None}
    H.save()
    return rows, None


def case_store():
    """The directory of the curation verdicts: CHOUPO_REUSE_STORE when set (a
    directory several trees may share -- the verdicts are content-keyed, and
    bin/runTests writes them with a temp file and a rename in the same
    directory), else build/reuse/cases in this tree."""
    v = os.environ.get("CHOUPO_REUSE_STORE")
    return Path(v) if v else STORE / "cases"


def _stored_case(c):
    """-> (path, lines) of the verdict stored for case c, lines [] when none."""
    stored = case_store() / (c.replace("/", "__") + ".tsv")
    try:
        return stored, stored.read_text().splitlines()
    except OSError:
        return stored, []


# --------------------------------------------------------------------------
#  C432: ROUTE-KEYED REUSE, THEN REPLAY, THEN REFIT
#
#  The exact key (above) re-runs every curation fit when ANY object its
#  operations reach changed, and the property kernel is reached by all of
#  them: after one kernel edit the sweep of 2026-11-19 re-ran all 1260 fits,
#  about 10 800 s, on a bench that had proved every (record, route) block of
#  the kernel bit for bit (DEV.md 4c C432, Vitor 2026-11-19: "se se prova que
#  funciona num, entao funciona nos restantes!" -- a function is proved once
#  per INPUT ROUTE, not once per case).  Three rungs, in this order, each
#  printed with its reason:
#
#    (d) ROUTE-KEYED REUSE.  The stored verdict's key moved ONLY through engine
#        objects the kernel declares (bin/curate/property_kernel_objects.tsv),
#        every other part of the key is identical (data, the case's files,
#        harness, platform), the set of objects the case reaches is the same,
#        AND the route bench (check_property_route_bench) answers byte for
#        byte the same on every record the fit reads, then and now.  The
#        verdict is REUSED and stored under the new key.
#    (a) REPLAY.  Otherwise a fit made only of fitParameters operations whose
#        stored parameters are in its sealed records is run once WITHOUT a
#        search (CHOUPO_FIT_REPLAY, src/propertyOps/FitParameters.cpp): the
#        objective and the published statistics at the stored parameters must
#        equal the golden to its own tolerances (bin/runTests, check_case).
#    REFIT.  Anything else, and any replay that moved.
#
#  What the first rung does NOT claim: that a kernel edit which leaves the
#  bench identical cannot change a fit -- states off the bench's grid, and
#  everything in a mixed object (ThermoPackage is NOT in the kernel list for
#  that reason) are outside it, and the list says so.
# --------------------------------------------------------------------------

KERNEL_FILE = ROOT / "bin" / "curate" / "property_kernel_objects.tsv"
BENCH_OUT = STORE / "bench" / "bench.tsv"


def kernel_prefixes():
    try:
        return [l.strip() for l in KERNEL_FILE.read_text().splitlines()
                if l.strip() and not l.lstrip().startswith("#")]
    except OSError:
        return []


def is_kernel(name):
    """Is a key of the engine map (`src/..../X.o`, `src/....o<source`, or
    `stamp:<name>`) an object of the property kernel?"""
    if name.startswith("stamp:"):
        return False
    return any(name.split("<", 1)[0].startswith(p) for p in kernel_prefixes())


_BENCH = {}


def bench_index():
    """{record: [(route, hash)]} of the bench run NOW on this build, or None
    (bench cannot run).  One run per plan; `choupoProps --property-route-bench`
    is the gate's own call (check_property_route_bench.run_bench)."""
    if "idx" in _BENCH:
        return _BENCH["idx"]
    _BENCH["idx"] = None
    exe = ROOT / "choupoProps"
    manifest = ROOT / "bin" / "curate" / "property_route_bench.manifest"
    if not exe.exists() or not manifest.exists():
        return None
    BENCH_OUT.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C", OMP_NUM_THREADS="1")
    t0 = time.time()
    p = subprocess.run([str(exe), "--property-route-bench", str(manifest),
                        str(BENCH_OUT)], cwd=ROOT, env=env,
                       capture_output=True, text=True, timeout=1800)
    if p.returncode != 0 or not BENCH_OUT.exists():
        print(f"# route bench could not run (exit {p.returncode}): no route-keyed reuse",
              file=sys.stderr)
        return None
    import check_property_route_bench as crb
    got, _order = crb.blocks(BENCH_OUT)
    idx = {}
    for (rec, prop), h in got.items():
        idx.setdefault(rec, []).append((prop, h))
    _BENCH["idx"] = idx
    _BENCH["secs"] = time.time() - t0
    return idx


def case_bench_records(c, pins):
    """The bench records the fit of case `c` reads: its sealed components (the
    bench names a sealed copy by record and the first 12 hex digits of its
    sha256), or the catalogue components it pins.  None when the case reads
    anything the bench does not answer (species, assets, a record it does not
    claim, nothing at all)."""
    const = ROOT / c / "constant"
    for other in ("species", "assets", "chemistry"):
        if (const / other).exists():
            return None
    names = []
    comp = const / "components"
    if comp.is_dir():
        man = const / "propertyManifest"
        text = man.read_text(errors="ignore") if man.is_file() else ""
        for f in sorted(comp.glob("*.dat")):
            if f'"components/{f.name}"' not in text:
                return None
            names.append("sealed:" + f.stem + "@" + H.sha(f)[:12])
    for pin in pins or []:
        m = re.match(r"pin:components/([^/]+)\.dat$", pin)
        if m:
            names.append(m.group(1))
    return sorted(set(names)) or None


def bench_fingerprint(c):
    """Digest of the bench's blocks for every record case `c` reads (and the
    route list), or None."""
    idx = bench_index()
    if idx is None:
        return None
    recs = case_bench_records(c, PARTS[c].get("pins"))
    if recs is None:
        return None
    pairs = []
    for r in ["@routes"] + recs:
        if r not in idx:
            return None
        pairs += [(f"{r}\t{prop}", h) for prop, h in sorted(idx[r])]
    return digest(pairs)


def parts_dir():
    return case_store() / ".parts"


def _atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def write_parts(c, key):
    """Keep what the key was made of, under the key (the next plan reads it
    when this key's verdict is the stored one).  Returns the parts."""
    pd = parts_dir()
    f = pd / f"{key}.json"
    p = dict(PARTS[c])
    p["case"], p["key"] = c, key
    p["bench"] = bench_fingerprint(c)
    if p["narrow"] and p["engine"] in ENGINE_MAPS:
        o = pd / f"objs-{p['engine']}.json"
        if not o.exists():
            _atomic(o, json.dumps(ENGINE_MAPS[p["engine"]]))
    if not f.exists():
        _atomic(f, json.dumps(p))
    return p


def load_parts(key):
    try:
        return json.loads((parts_dir() / f"{key}.json").read_text())
    except (OSError, ValueError):
        return None


def load_objs(eng):
    try:
        return json.loads((parts_dir() / f"objs-{eng}.json").read_text())
    except (OSError, ValueError):
        return None


def route_verdict(old_key, cur):
    """-> (True, reason) when the verdict stored under old_key still describes
    the case whose present parts are `cur`, by the route rule; (False, why
    not) otherwise."""
    old = load_parts(old_key)
    if old is None:
        return False, "no parts kept for the stored key (taken before route-keyed reuse existed)"
    if not (old.get("narrow") and cur["narrow"]):
        return False, "the engine is not keyed by reach for this case"
    if old["rest"] != cur["rest"]:
        return False, "something other than the engine moved (catalogue data, the case's files, the harness or the platform)"
    oo, co = load_objs(old["engine"]), load_objs(cur["engine"])
    if oo is None or co is None:
        return False, "the object lists of the two engines are not kept"
    if set(oo) != set(co):
        return False, "the set of objects the case reaches changed"
    moved = sorted(k for k in co if oo[k] != co[k])
    if not moved:
        return False, "no object moved (the key moved through something not kept)"
    outside = [k for k in moved if not is_kernel(k)]
    if outside:
        return False, (f"{len(outside)} of {len(moved)} moved object(s) lie outside the property kernel, "
                       f"e.g. {outside[0].split('<')[0]}")
    if old.get("bench") is None or cur.get("bench") is None:
        return False, "the route bench has no answer for every record the fit reads"
    if old["bench"] != cur["bench"]:
        return False, "the route bench answers differently for a record the fit reads"
    return True, (f"{len(moved)} property-kernel object(s) moved, everything else in the key identical, "
                  f"route bench fingerprint {cur['bench'][:12]} unchanged on the records it reads")


# ---- replay -------------------------------------------------------------

def _strip_comments(text):
    return re.sub(r'("[^"\n]*")|/\*.*?\*/|//[^\n]*',
                  lambda m: m.group(1) or "", text, flags=re.S)


def _top_blocks(text, start):
    """The top-level {...} blocks of the parenthesised list that opens at
    text[start] == '('."""
    out, depth, i, begin = [], 0, start + 1, None
    while i < len(text):
        ch = text[i]
        if ch == "{":
            if depth == 0:
                begin = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and begin is not None:
                out.append(text[begin:i + 1])
        elif ch == ")" and depth == 0:
            break
        i += 1
    return out


def _record_values(path):
    try:
        t = _strip_comments(path.read_text(errors="ignore"))
    except OSError:
        return None
    m = re.search(r"\bparameters\s*\{([^}]*)\}", t)
    if not m:
        return None
    return {k: float(v) for k, v in
            re.findall(r"(\w+)\s+([-+]?[0-9.]+(?:[eE][-+]?[0-9]+)?)\s*;", m.group(1))}


def replay_spec(c):
    """-> (text of the replay file, number of fit operations) or (None, why).
    Replayable: every operation is a fitParameters fit whose parameters are
    pair parameters found in the case's own sealed record of the model the
    operation fits, an evaluate-mode fitParameters, or a propertyScan1D."""
    cdir = ROOT / c
    try:
        props = _strip_comments((cdir / "system" / "propsDict").read_text(errors="ignore"))
        thermo = _strip_comments((cdir / "constant" / "thermoPhysPropDict").read_text(errors="ignore"))
    except OSError:
        return None, "no propsDict or thermoPhysPropDict"
    m = re.search(r"\boperations\s*\(", props)
    if not m:
        return None, "no operations list"
    case_model = re.search(r"activityModel\s*\{\s*model\s+(\w+)", thermo)
    lines, nfit = [], 0
    for op in _top_blocks(props, m.end() - 1):
        name = re.search(r"\bname\s+([^\s;]+)\s*;", op)
        typ = re.search(r"\btype\s+(\w+)\s*;", op)
        if not name or not typ:
            return None, "an operation without a name or a type"
        if typ.group(1) == "propertyScan1D":
            continue
        if typ.group(1) != "fitParameters":
            return None, f"operation type {typ.group(1)} has no replay"
        if re.search(r"\bmode\s+evaluate\s*;", op):
            continue
        om = re.search(r"activityModel\s*\{\s*model\s+(\w+)", op) or case_model
        if not om:
            return None, f"no activity model for {name.group(1)}"
        paths = re.findall(r"\bpath\s+([^\s;]+)\s*;", op)
        if not paths:
            return None, f"{name.group(1)} declares no parameter path"
        for pth in paths:
            seg = pth.split(".")
            if len(seg) < 3 or "binaryParameters" not in seg:
                return None, f"{name.group(1)}: {pth} is not a pair parameter"
            vals = _record_values(cdir / "constant" / "parameters" / om.group(1) / f"{seg[-2]}.dat")
            if vals is None or seg[-1] not in vals:
                return None, f"{name.group(1)}: no stored {om.group(1)} record value for {pth}"
            lines.append(f"{name.group(1)}\t{pth}\t{vals[seg[-1]]!r}")
        nfit += 1
    if not nfit:
        return None, "no fit operation to replay"
    return "\n".join(lines) + "\n", nfit


def selftest():
    """`suite_reuse.py selftest` -- the C432 rules on synthetic parts, no build
    needed: each rung says yes where it should and no where it must.  Exit 0 or 1."""
    import tempfile
    bad = []

    def check(name, got, want):
        if got != want:
            bad.append(f"{name}: got {got!r}, wanted {want!r}")
    check("kernel: a transport object", is_kernel("src/thermo/transport/Andrade.o"), True)
    check("kernel: a source-keyed object", is_kernel("src/thermo/vaporPressure/Antoine.o<src/x.cpp"), True)
    check("kernel: ThermoPackage is NOT (mixed object)", is_kernel("src/thermo/ThermoPackage.o"), False)
    check("kernel: a flag stamp is NOT", is_kernel("stamp:.stamp-cxx-abc"), False)
    check("kernel: an activity model is NOT", is_kernel("src/thermo/activityCoefficient/NRTL.o"), False)
    with tempfile.TemporaryDirectory() as d:
        os.environ["CHOUPO_REUSE_STORE"] = d
        try:
            kern, other = "src/thermo/vaporPressure/Antoine.o", "src/thermo/activityCoefficient/NRTL.o"
            base = {"src/thermo/transport/Andrade.o": "a", kern: "k1", other: "n1", "stamp:.stamp-x": ""}

            def put(key, eng, objs, rest="R", bench="B", narrow=True):
                _atomic(parts_dir() / f"objs-{eng}.json", json.dumps(objs))
                _atomic(parts_dir() / f"{key}.json", json.dumps(
                    {"rest": rest, "narrow": narrow, "engine": eng, "bench": bench}))
                return {"rest": rest, "narrow": narrow, "engine": eng, "bench": bench}
            put("old", "E1", base)
            cur = put("new", "E2", {**base, kern: "k2"})
            check("route: only a kernel object moved, bench same", route_verdict("old", cur)[0], True)
            cur = put("new", "E2", {**base, kern: "k2"}, bench="B2")
            check("route: bench answers differently", route_verdict("old", cur)[0], False)
            cur = put("new", "E2", {**base, kern: "k2"}, bench=None)
            check("route: bench has no answer", route_verdict("old", cur)[0], False)
            cur = put("new", "E2", {**base, other: "n2"})
            check("route: a non-kernel object moved", route_verdict("old", cur)[0], False)
            cur = put("new", "E2", {**base, kern: "k2", other: "n2"})
            check("route: kernel AND non-kernel moved", route_verdict("old", cur)[0], False)
            cur = put("new", "E2", {**base, kern: "k2"}, rest="R2")
            check("route: the data or case moved", route_verdict("old", cur)[0], False)
            cur = put("new", "E2", {**base, kern: "k2", "src/thermo/vaporPressure/New.o": "z"})
            check("route: the reach changed", route_verdict("old", cur)[0], False)
            cur = put("new", "E2", {**base, "stamp:.stamp-x": "", "stamp:.stamp-y": ""})
            check("route: a flag stamp appeared", route_verdict("old", cur)[0], False)
            check("route: no parts kept for the stored key", route_verdict("missing", cur)[0], False)
        finally:
            os.environ.pop("CHOUPO_REUSE_STORE", None)
    t = _strip_comments('a /* x { */ b // y }\n"u//rl" c')
    check("comments stripped, strings kept", "u//rl" in t and "{" not in t, True)
    blocks = _top_blocks("operations ( { name a; } { name b; sub { x 1; } } );", 11)
    check("top-level blocks", len(blocks), 2)
    for b in bad:
        print("suite_reuse selftest FAIL:", b)
    if not bad:
        print("suite_reuse selftest: OK -- the route rule says yes only when ONLY kernel objects "
              "moved, nothing else in the key did and the bench is identical; every other case says no")
    return 1 if bad else 0


def prune_parts(keep_keys):
    """Drop the parts of keys nothing stores or plans any more, and the object
    lists no remaining parts name."""
    pd = parts_dir()
    if not pd.is_dir():
        return
    engines = set()
    for f in pd.glob("*.json"):
        if f.name.startswith("objs-"):
            continue
        if f.stem not in keep_keys:
            f.unlink(missing_ok=True)
            continue
        try:
            engines.add(json.loads(f.read_text()).get("engine"))
        except (OSError, ValueError):
            pass
    for f in pd.glob("objs-*.json"):
        if f.stem[len("objs-"):] not in engines:
            f.unlink(missing_ok=True)


def case_plan(root_rel, explain=False):
    """One line per case under root_rel:
    <dir> TAB <key> TAB <labels|-> TAB <date> TAB <mode> TAB <reason> TAB <replay file|->
    where mode is `exact` (the stored verdict's key is this key), `route`
    (the verdict stands by the route rule; it has been re-stored under this
    key), `replay` (run once at the stored parameters, the file named in the
    last field) or `run` (refit); with `explain`, <dir> TAB <engine> TAB <data>
    instead: how each case is keyed."""
    if disabled():
        return 2
    rows, why = case_keys(root_rel)
    if rows is None:
        print(f"# not keyed: {why}", file=sys.stderr)
        return 1
    if explain:
        for c, key, dlabel, e in rows:
            print(f"{c}\t{e}\t{dlabel}")
        return 0
    keep, n = set(), dict(exact=0, route=0, replay=0, run=0)
    for c, key, dlabel, e in rows:
        keep.add(key)
        path, lines = _stored_case(c)
        have = len(lines) >= 3
        if have:
            keep.add(lines[0])
        cur = write_parts(c, key) if c in PARTS else None
        mode, reason, rfile, labels, date = "run", "no stored verdict: first run under this key", "-", "-", "-"
        if have and lines[0] == key:
            mode, reason = "exact", "the key is unchanged"
            date, labels = lines[1], "\x1f".join(lines[2:])
        elif have:
            ok, why_not = (route_verdict(lines[0], cur) if cur else (False, "no parts for this case"))
            if ok:
                mode, reason = "route", why_not
                date, labels = lines[1], "\x1f".join(lines[2:])
                lines[1] = (re.sub(r", route-keyed from key [0-9a-f]+", "", lines[1])
                            + f", route-keyed from key {lines[0]}")
                lines[0] = key
                _atomic(path, "\n".join(lines) + "\n")
            else:
                spec, nfit = replay_spec(c)
                if spec is None:
                    mode, reason = "run", f"route rule: {why_not}; replay: {nfit}"
                else:
                    rf = STORE / "replay" / (c.replace("/", "__") + ".tsv")
                    _atomic(rf, spec)
                    mode, rfile = "replay", str(rf)
                    reason = f"route rule: {why_not}; replay of {nfit} fit operation(s) at the stored parameters"
                    date = lines[1]
                    labels = "\x1f".join(lines[2:])
        n[mode] += 1
        print(f"{c}\t{key}\t{labels}\t{date}\t{mode}\t{reason}\t{rfile}")
    prune_parts(keep)
    print(f"# plan: {n['exact']} exact, {n['route']} route-keyed, {n['replay']} to replay, "
          f"{n['run']} to refit", file=sys.stderr)
    return 0


def _runtests_at(rev):
    r = subprocess.run(["git", "-C", str(ROOT), "show", f"{rev}:bin/runTests"],
                       capture_output=True, text=True, errors="ignore")
    return r.stdout if r.returncode == 0 else None


def migrate_keys(argv):
    """migrate-keys [root] [--harness-from REV]...

    Re-key the stored curation verdicts to the current key format (4),
    WITHOUT running anything.  A verdict whose stored key is the format-1 or
    format-2 key of THIS tree describes exactly this tree, so the same verdict
    (labels, date, commit) is written under the format-4 key with a `migrated
    from key <old>` field on its date line (atomically: a temp file in the
    store's directory, then a rename).  A verdict that matches no format is
    left alone (its case runs, correctly).  Idempotent.  Works on the store
    case_store() names (CHOUPO_REUSE_STORE, else this tree's).

    The key holds the text of the bin/runTests functions check_case reaches,
    so a verdict taken before an edit of them was keyed on the OLD text: the
    old-format keys are also computed with bin/runTests as it stood at each
    `--harness-from REV` (default: the merge-base with origin/main, then
    origin/main itself), and the run text is the current one."""
    if disabled():
        return 2
    root_rel, revs, i = "data/curation", [], 0
    while i < len(argv):
        if argv[i] == "--harness-from" and i + 1 < len(argv):
            revs.append(argv[i + 1])
            i += 2
        else:
            root_rel = argv[i].rstrip("/")
            i += 1
    if not revs:
        mb = subprocess.run(["git", "-C", str(ROOT), "merge-base", "HEAD",
                             "origin/main"], capture_output=True, text=True)
        revs = ([mb.stdout.strip()] if mb.returncode == 0 and mb.stdout.strip()
                else []) + ["origin/main"]
    texts = [None] + [t for t in (_runtests_at(r) for r in revs) if t]
    new, why = case_keys(root_rel)
    if new is None:
        print(f"# not keyed: {why}", file=sys.stderr)
        return 1
    old = {c: [] for c, _, _, _ in new}          # c -> [(format, key)]
    for f in (3, 2, 1):
        for t in texts:
            rows, why2 = case_keys(root_rel, f, t)
            if rows is None:
                print(f"# not keyed: {why2}", file=sys.stderr)
                return 1
            for c, k, _, _ in rows:
                old[c].append((f, k))
    n = dict(migrated1=0, migrated2=0, migrated3=0, already=0, nomatch=0, noverdict=0)
    other = []
    for c, key, _, _ in new:
        path, lines = _stored_case(c)
        if len(lines) < 3:
            n["noverdict"] += 1
            continue
        if lines[0] == key:
            n["already"] += 1
            continue
        f = next((f for f, k in old[c] if lines[0] == k), None)
        if f is None:
            n["nomatch"] += 1
            other.append(c)
            continue
        lines[1] = f"{lines[1]}, migrated from key {lines[0]}"
        lines[0] = key
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text("\n".join(lines) + "\n")
        os.replace(tmp, path)
        n[f"migrated{f}"] += 1
    print(f"migrate-keys {root_rel} (store {case_store()}): {len(new)} cases "
          f"keyed; {n['migrated1'] + n['migrated2'] + n['migrated3']} migrated "
          f"({n['migrated1']} from format 1, {n['migrated2']} from format 2, "
          f"{n['migrated3']} from format 3), "
          f"{n['already']} already in format {CURRENT_FORMAT}, {n['nomatch']} stored "
          f"verdict(s) match no format of this tree (will run), "
          f"{n['noverdict']} without a stored verdict (will run)")
    for c in other[:20]:
        print(f"  not migrated: {c}")
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
    pairs = [("head", head), ("diff", hashlib.sha256(diff).hexdigest()),
             ("data/local", local_digest())]     # review SE-10: ignored, read
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
    if argv[:1] == ["selftest"]:
        return selftest()
    if argv[:1] == ["verify-reads"]:
        return verify_reads(argv[1:])
    if argv[:1] == ["migrate-keys"]:
        return migrate_keys(argv[1:])
    if argv[:1] == ["case-plan"] and len(argv) in (2, 3):
        return case_plan(argv[1].rstrip("/"), explain=argv[2:] == ["--explain"])
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
              "the 2026-11-14 sweep.  Keyed on the objects the case's "
              "operations can reach, the records of its own components "
              "(pairs, components; transport_c327: three catalogue "
              "directories), its own files and cascade; see `case-plan DIR "
              "--explain`")
        print("  a fit whose key moved is asked, before it runs again (C432): "
              "(d) did only the property kernel move (property_kernel_objects.tsv) "
              "while the route bench answers the same on its records?  (a) does "
              "the fit held at its stored parameters reproduce the golden?")
        print("NOT KEYED:")
        for g, why in NOT_KEYED.items():
            print(f"  {g}: {why}")
        return 0
    print(__doc__.split("\n\n")[1])
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
