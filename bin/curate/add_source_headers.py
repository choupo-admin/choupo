#!/usr/bin/env python3
"""Put the copyright line and the licence identifier on every tracked code file
that lacks them (DEV.md 4c C393).  Reads the SAME table as the gate
(source_headers_kinds.py); keeps no table of its own.

    bin/curate/add_source_headers.py --check          # list what it would change; exit 1 if any
    bin/curate/add_source_headers.py                  # apply
    bin/curate/add_source_headers.py --kind web-tests # only one kind (one commit per kind)
    bin/curate/add_source_headers.py --files          # with --check: list every file, not a summary
    bin/curate/add_source_headers.py [--check] PATH...  # only these files (also new, untracked ones;
                                                      # this is what bin/header calls)

IDEMPOTENT: a second run changes nothing.  NO BEHAVIOUR CHANGES: the lines are
comments, placed

  * after a shebang line and after a Python encoding cookie in the first two
    lines (so both still work);
  * before a module docstring (comments before it keep it a docstring);
  * in a `.bat`, as REM lines after `@echo off` when that is line 1;
  * in TypeScript/JavaScript/CSS, at the very top (a `/// <reference` directive
    and a `#!` shebang stay valid: only comments may precede them -- the
    shebang is kept first).

FORMS.  `banner`: the project banner copied byte for byte from a neighbour of
the same language (engine C++ and the web app).  `short`: two comment lines,
`Copyright (C) 2026 Vítor Geraldes` and `SPDX-License-Identifier:
GPL-3.0-or-later`, in the file's own comment syntax.

A file that has an author's copyright line but no identifier gets the
identifier beside it (after the line, or after the block comment that holds
it); a file that has the identifier but no copyright line gets the copyright
line before the identifier.  Nothing else changes.

NEVER TOUCHED, and listed instead: a file whose copyright line names someone
who is not in AUTHORS (a notice on a file that is someone else's would be the
one way this slice could harm the record it protects); a file whose notice
cannot be placed without altering code; excluded and scoped-out files.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import source_headers_kinds as K  # noqa: E402

CODING_RE = re.compile(rb"^[ \t\f]*#.*?coding[:=][ \t]*[-\w.]+")
LEAD_RE = re.compile(r"^(\s*)(#|//|rem|REM|::)(\s?)")


def comment_lines(syntax: str, texts):
    if syntax == "#":
        return ["# " + t for t in texts]
    if syntax == "//":
        return ["// " + t for t in texts]
    if syntax == "rem":
        return ["REM " + t for t in texts]
    raise ValueError(syntax)


def newline_of(raw: bytes) -> bytes:
    first = raw.split(b"\n", 1)[0]
    return b"\r\n" if first.endswith(b"\r") else b"\n"


def insertion_index(kind: str, lines):
    """Index (in `lines`, keepends) where a new top header goes."""
    idx = 0
    if lines and lines[0].startswith(b"#!"):
        idx = 1
    if kind == "script-hash" and idx < 2 and idx < len(lines) and \
            CODING_RE.match(lines[idx]):
        idx += 1
    if kind == "batch" and lines and lines[0].strip().lower() == b"@echo off":
        idx = 1
    return idx


def inside_block_comment(text_before: str) -> bool:
    return text_before.rfind("/*") > text_before.rfind("*/")


def plan(kind: str, raw: bytes, authors_norm, path: str = ""):
    """-> (new_bytes | None, note).  None + note 'ok' when nothing to do;
    None + 'CONFLICT: ...' when the file must not be touched."""
    form, syntax, bsrc = K.KINDS[kind]
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None, "CONFLICT: not UTF-8"
    nl = newline_of(raw)
    nls = nl.decode()
    head = text[:K.WINDOW]
    ms = list(K.COPY_RE.finditer(head))
    names = [m.group(3).strip() for m in ms]
    has_spdx = bool(K.SPDX_RE.search(head))
    ours, foreign = K.own_and_foreign(path, names, authors_norm)
    if foreign and not ours:
        return None, "CONFLICT: copyright line names " + repr(foreign[0])
    if ours and has_spdx:
        return None, "ok"
    lines = re.findall(rb"[^\n]*\n|[^\n]+", raw)

    # B: an author's copyright line, no identifier
    if ours and not has_spdx:
        m = [x for x in ms if x.group(3).strip() in ours][0]
        line_start = head.rfind("\n", 0, m.start()) + 1
        line_no = head.count("\n", 0, line_start)
        line = lines[line_no].decode("utf-8")
        if inside_block_comment(head[:m.start()]) and syntax == "block":
            end = head.find("*/", m.start())
            if end < 0:
                return None, "CONFLICT: unterminated block comment"
            eol = head.find("\n", end)
            if eol < 0:
                return None, "CONFLICT: no newline after the banner"
            at = text.count("\n", 0, eol) + 1
            new = "/* " + K.SPDX_LINE + " */" + nls
            lines.insert(at, new.encode("utf-8"))
            return b"".join(lines), "spdx-after-block"
        lm = LEAD_RE.match(line)
        if lm and syntax != "block":
            new = lm.group(1) + lm.group(2) + (lm.group(3) or " ") + K.SPDX_LINE
            lines.insert(line_no + 1, (new + nls).encode("utf-8"))
            return b"".join(lines), "spdx-after-line"
        if lm and syntax == "block":
            new = lm.group(1) + lm.group(2) + (lm.group(3) or " ") + K.SPDX_LINE
            lines.insert(line_no + 1, (new + nls).encode("utf-8"))
            return b"".join(lines), "spdx-after-line"
        return None, "CONFLICT: cannot place the identifier beside the copyright line"

    # C: the identifier is there, the copyright line is not
    if has_spdx and not ours:
        m = K.SPDX_RE.search(head)
        line_start = head.rfind("\n", 0, m.start()) + 1
        line_no = head.count("\n", 0, line_start)
        prefix = head[line_start:m.start()]
        if re.match(r"^\s*(#|//|rem|REM|::)?\s*$", prefix):
            lines.insert(line_no, (prefix + K.COPYRIGHT_LINE + nls).encode("utf-8"))
            return b"".join(lines), "copyright-before-spdx"
        # the identifier shares its line with other text (a comment opener or
        # prose): put the copyright line alone at the top, in its own comment
        idx = insertion_index(kind, lines)
        if idx and not lines[idx - 1].endswith(b"\n"):
            lines[idx - 1] += nl
        one = ("/* " + K.COPYRIGHT_LINE + " */") if syntax == "block" else \
            comment_lines(syntax, [K.COPYRIGHT_LINE])[0]
        lines.insert(idx, (one + nls).encode("utf-8"))
        return b"".join(lines), "copyright-at-top"

    # A: neither
    idx = insertion_index(kind, lines)
    if idx and idx <= len(lines) and not lines[idx - 1].endswith(b"\n"):
        lines[idx - 1] += nl
    if form == "banner":
        block = K.banner_text(bsrc).replace("\n", nls) + nls
        ins = block.encode("utf-8")
    else:
        ins = "".join(l + nls for l in comment_lines(
            syntax, [K.COPYRIGHT_LINE, K.SPDX_LINE])).encode("utf-8")
    lines.insert(idx, ins)
    return b"".join(lines), "full-" + form


def main(argv):
    check = "--check" in argv
    show_files = "--files" in argv
    only = None
    if "--kind" in argv:
        only = argv[argv.index("--kind") + 1]
    an = K.authors()
    todo, conflicts, notes = {}, [], []
    total = 0
    paths = [a for i, a in enumerate(argv) if not a.startswith("--")
             and not (i and argv[i - 1] == "--kind")]
    if paths:
        rows = []
        for a in paths:
            pp = Path(a).resolve()
            try:
                rel = str(pp.relative_to(K.ROOT))
            except ValueError:
                print("add_source_headers: %s is outside the repository" % a)
                return 2
            raw = K.read_head(rel)
            if raw is None:
                print("add_source_headers: no such file %s" % a)
                return 2
            cat, kind = K.classify(rel, "100644", K.first_line_of(raw))
            if cat != "code":
                print("add_source_headers: %s is not a code file this tool stamps (%s: %s)"
                      % (rel, cat, kind or "no kind"))
                return 2
            rows.append((rel, cat, kind))
    else:
        rows = K.classify_all()
    for path, cat, kind in rows:
        if cat != "code" or (only and kind != only):
            continue
        raw = K.read_head(path)
        if raw is None:
            continue
        total += 1
        new, note = plan(kind, raw, an, path)
        if new is None:
            if note.startswith("CONFLICT"):
                conflicts.append((path, kind, note))
            continue
        todo.setdefault(kind, []).append((path, note, new))
        # Vitor-without-accent notes
        if b"Vitor Geraldes" in raw[:K.WINDOW]:
            notes.append(path)
    n = sum(len(v) for v in todo.values())
    if check:
        for kind in sorted(todo):
            by = {}
            for _p, note, _n in todo[kind]:
                by[note] = by.get(note, 0) + 1
            print("%-12s %5d would change  %s" % (kind, len(todo[kind]), by))
            if show_files:
                for p, note, _n in todo[kind]:
                    print("    %s  [%s]" % (p, note))
        for p, k, note in conflicts:
            print("%s  [%s]  %s" % (p, k, note))
        print("add_source_headers: %d code files read, %d to change, %d conflicts"
              % (total, n, len(conflicts)))
        return 1 if (n or conflicts) else 0
    for kind in sorted(todo):
        for p, _note, new in todo[kind]:
            with open(K.ROOT / p, "wb") as f:
                f.write(new)
    for p, k, note in conflicts:
        print("NOT TOUCHED  %s  %s" % (p, note))
    print("add_source_headers: %d files changed (%s)"
          % (n, ", ".join("%s %d" % (k, len(v)) for k, v in sorted(todo.items()))))
    return 1 if conflicts else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
