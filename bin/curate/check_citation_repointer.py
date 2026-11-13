#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_citation_repointer -- the tool that re-points lesson citations works.

`bin/curate/repoint_lesson_citations.py` rewrites the `file:line` citations of
the GUI lessons after an engine edit moves lines (DEV.md 4c C196).  A tool that
edits many files on a rule it infers is the kind that is trusted until the day
it is wrong, so this gate builds a SYNTHETIC tree holding one fixture of each
shape it manages and requires, after the cited file is shifted:

  (a) `--check` reports the shifted citations as stale and exits 1;
  (b) the tool re-points every one -- the record `line:`, the CLAIMS key AND
      the prose that repeats it (including a number written across a `" + "`
      string break), the tuple form, the ANCHORS number and the prose range
      that contains it -- to the expected line;
  (c) afterwards `--check` is clean (exit 0): the fixture is consistent again;
  (d) an AMBIGUOUS claim (the text now sits on two lines in the window) and a
      MISSING one are REFUSED by name, exit 1, and the files that cite them are
      left unedited (the others still move);
  (e) a citation that is still current is not touched.

It touches no real file: the fixture lives in a temporary directory.  What it
does NOT check: the real corpus (the GUI tests that cite the engine do), nor
that a claim is true of the engine -- only that the tool moves the number to
where the claim already named text now is.
"""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "repoint_lesson_citations.py")

ENGINE = "\n".join(
    ["// engine fixture"] + ["// filler %d" % i for i in range(1, 40)]
    + ["int alpha = compute_alpha();          // line 41",
       "int beta  = compute_beta();",
       "int gamma = compute_gamma_one(); int delta = compute_delta();",
       "if (flag) {",
       "    run_step_a();",
       "    run_step_b();",
       "}"]
    + ["// filler tail %d" % i for i in range(1, 40)]) + "\n"
# lines: alpha=41 beta=42 gamma/delta=43 if=44 step_a=45 step_b=46 }=47

RECORD = '''const MAIN = "src/lib/Engine.cpp";
export const CITES = {
  alpha: { file: MAIN, line: 41,
    contains: "compute_alpha()" },
  beta: { file: "src/lib/Engine.cpp", line: 42,
    contains: 'compute_beta' },
};
'''

PROSE = '''export const BODY =
  "alpha at Engine.cpp:41, and the block at Engine.cpp:44-47 "
  + "with its first call at Engine.cpp:" + "45; the tuple form Engine.cpp:43.";
'''

CLAIMS_TEST = '''const CLAIMS: Record<string, string | RegExp> = {
  "Engine.cpp:41": "compute_alpha()",
  "Engine.cpp:44-47": /if \\(flag\\) \\{[\\s\\S]*run_step_b\\(\\);/,
  "Engine.cpp:45": "run_step_a();",
};
const TUPLE: Record<string, [string, number, number | undefined, string]> = {
  "Engine.cpp:43": [`${SRC}lib/Engine.cpp`, 43, undefined, "compute_gamma_one"],
};
'''

ANCHOR_TEST = '''const ANCHORS: [string, number, string][] = [
  ["src/lib/Engine.cpp", 46, "run_step_b();"],
];
'''
ANCHOR_PROSE = '''export const NOTE = "the second call, src/lib/Engine.cpp:45-47, ends the block";\n'''


def write(root, rel, text):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(text)


def read(root, rel):
    with open(os.path.join(root, rel), encoding="utf-8") as fh:
        return fh.read()


def build(root, engine=ENGINE):
    write(root, "src/lib/Engine.cpp", engine)
    write(root, "bin/.keep", "")
    write(root, "gui/src/ui/rec.ts", RECORD)
    write(root, "gui/src/ui/prose.ts", PROSE)
    write(root, "gui/tests/prose.test.ts", CLAIMS_TEST)
    write(root, "gui/tests/anchors.test.ts", ANCHOR_TEST)
    write(root, "gui/src/ui/anchorProse.ts", ANCHOR_PROSE)


def run(root, *args):
    r = subprocess.run([sys.executable, TOOL, "--root", root] + list(args),
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def snapshot(root):
    out = {}
    for dp, _, fn in os.walk(root):
        for f in fn:
            p = os.path.join(dp, f)
            out[os.path.relpath(p, root)] = open(p, encoding="utf-8").read()
    return out


def main():
    problems = []
    tmp = tempfile.mkdtemp(prefix="c196-gate-")
    try:
        # ---- fresh: everything current, nothing to do (e)
        root = os.path.join(tmp, "a")
        build(root)
        rc, out = run(root, "--check")
        if rc != 0 or "OK" not in out:
            problems.append("(e) a fresh fixture is not reported current: %r" % out)
        # ---- shift the cited file by three lines at the top
        write(root, "src/lib/Engine.cpp", "// a\n// b\n// c\n" + ENGINE)
        rc, out = run(root, "--check")
        if rc != 1 or "STALE" not in out:
            problems.append("(a) --check did not report the shifted citations (rc=%d): %r" % (rc, out))
        before = snapshot(root)
        rc2, out2 = run(root, "--check")
        if snapshot(root) != before:
            problems.append("(a) --check edited a file")
        rc, out = run(root)
        if rc != 0:
            problems.append("(b) the tool refused a plain shift: %r" % out)
        rec = read(root, "gui/src/ui/rec.ts")
        for want in ("line: 44,", "line: 45,"):
            if want not in rec:
                problems.append("(b) record shape R: %r missing after the shift" % want)
        prose = read(root, "gui/src/ui/prose.ts")
        for want in ("Engine.cpp:44,", "Engine.cpp:47-50", 'Engine.cpp:" + "48;', "Engine.cpp:46."):
            if want not in prose:
                problems.append("(b) prose tokens: %r missing after the shift" % want)
        cl = read(root, "gui/tests/prose.test.ts")
        for want in ('"Engine.cpp:44":', '"Engine.cpp:47-50":', '"Engine.cpp:48":',
                     '"Engine.cpp:46": [`${SRC}lib/Engine.cpp`, 46, undefined'):
            if want not in cl:
                problems.append("(b) shape C: %r missing after the shift" % want)
        an = read(root, "gui/tests/anchors.test.ts")
        if '"src/lib/Engine.cpp", 49,' not in an:
            problems.append("(b) shape T: anchor number not moved to 49")
        if "src/lib/Engine.cpp:48-50" not in read(root, "gui/src/ui/anchorProse.ts"):
            problems.append("(b) shape T: the prose range holding the anchor was not shifted")
        rc, out = run(root, "--check")
        if rc != 0:
            problems.append("(c) the fixture is not consistent after the tool ran: %r" % out)
        # ---- idempotent: a second run changes nothing (e)
        after = snapshot(root)
        run(root)
        if snapshot(root) != after:
            problems.append("(e) a second run edited a current fixture")

        # ---- ambiguous (d): the claimed text now also sits ten lines away
        root2 = os.path.join(tmp, "b")
        build(root2)
        #  the shift is +3 for every neighbour; alpha's own line is edited away and
        #  the text turns up twice elsewhere, at neither neighbour's shift
        amb = ("// a\n// b\n// c\n" + ENGINE).split("\n")
        amb[43] = "// alpha moved out"
        amb[50] = "int alpha = compute_alpha();          // first place"
        amb[55] = "int alpha = compute_alpha();          // a second place"
        write(root2, "src/lib/Engine.cpp", "\n".join(amb))
        before = snapshot(root2)
        rc, out = run(root2)
        if rc != 1 or "ambiguous" not in out.lower():
            problems.append("(d) an ambiguous claim was not refused by name (rc=%d): %r" % (rc, out))
        if "line: 41," not in read(root2, "gui/src/ui/rec.ts"):
            problems.append("(d) the ambiguous record was edited anyway")
        # ---- missing (d): the claimed text is gone
        root3 = os.path.join(tmp, "c")
        build(root3)
        write(root3, "src/lib/Engine.cpp",
              ("// a\n// b\n// c\n" + ENGINE).replace("compute_alpha", "renamed_alpha"))
        rc, out = run(root3)
        if rc != 1 or "missing" not in out.lower():
            problems.append("(d) a missing claim was not refused by name (rc=%d): %r" % (rc, out))
        if "line: 41," not in read(root3, "gui/src/ui/rec.ts"):
            problems.append("(d) the missing record was edited anyway")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if problems:
        print("check_citation_repointer: FAILED")
        for p in problems:
            print("  " + p)
        return 1
    print("check_citation_repointer: OK -- a synthetic tree holding one fixture of each "
          "citation shape the tool manages (R record `{file, line, contains}`, C CLAIMS key "
          "with its prose in string and regex-range form and in the tuple form, a number "
          "written across a `\" + \"` break, T ANCHORS tuple with the prose range that holds "
          "it) was shifted three lines and re-pointed to the expected lines with --check clean "
          "afterwards and a second run a no-op; an ambiguous and a missing claim were each "
          "REFUSED by name with the refused citation left unedited.  NOT CHECKED: the real "
          "corpus (the GUI lesson tests are that check), whether a claim is TRUE of the "
          "engine, and the unmanaged shapes (see `repoint_lesson_citations.py --inventory`).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
