#!/usr/bin/env python3
"""check_curator_parity -- a curator is not an author, and the two records agree.

WHY THIS GATE EXISTS
--------------------
`docs/preamble.tex`'s \\manualauthors feeds THREE sentences on every guide's
front matter, and one of them is the COPYRIGHT line.  So a name added there is
a rights claim, whatever the intention was -- and the intention, when a
colleague agrees to review a chapter, is almost never that.  It happened here:
Monica Faria consented to CURATE the batch UF/NF membrane tool and was written
into \\manualauthors, which put her in the copyright of a work she does not
claim.

The remedy is a second, separate channel (\\manualcuratorblock) and a rule
this gate enforces: A CURATOR NAME MUST NEVER APPEAR IN \\manualauthors.

WHAT THIS GATE CHECKS
---------------------
(a) Every curator named in docs/preamble.tex appears in AUTHORS' `Curators`
    section, and every curator in AUTHORS appears in docs/preamble.tex.
(b) NO curator name appears anywhere in the \\manualauthors macro.  This is the
    load-bearing arm: it is the exact defect the slice exists to prevent.
(c) Every guide-author list in \\manualauthors has a matching section in
    AUTHORS carrying the same names.  AUTHORS was ALREADY a second home for
    those lists and nothing held the two together; a name could drift out of
    one and stay in the other with the suite green.
(e) THE TOOL ITSELF.  A curator declared on an EduTool
    (gui/src/ui/methods/registry.ts, the `curator` field, drawn as a badge on
    the tool) must appear in AUTHORS with that tool's id backticked in their
    scope line, and every backticked tool id in AUTHORS must be a tool that
    declares that curator.  Vitor asked for this on 2026-09-24: a credit on
    the guide's front matter is a credit a student never reaches, because a
    student opens the TOOL.  Three homes in three languages, one gate -- the
    check_verdict_parity precedent, and the reasoning is in
    docs/design/how-a-curator-is-credited.md.

(d) Each curator entry states a SCOPE -- what part of which guide they answer
    for.  A curator credited for "the guide" with no scope is a credit nobody
    can check, and the scope is the whole difference between a review and a
    byline.

WHAT THIS GATE DOES NOT CHECK
-----------------------------
Whether consent was actually given.  That is a fact about a conversation
outside the tree; AUTHORS records that it was, and no gate can verify it.
Nor does it check that a scope string is TRUE of the section it names.

SABOTAGES FIRED BY HAND (all caught; see the commit that added this file)
  S1  a curator moved into \\manualauthors            -> arm (b) FAILED
  S2  a curator dropped from AUTHORS                  -> arm (a) FAILED
  S3  a curator added to AUTHORS only                 -> arm (a) FAILED
  S4  a guide author list changed in preamble only    -> arm (c) FAILED
  S5  a curator entry stripped of its scope           -> arm (d) FAILED
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREAMBLE = ROOT / "docs" / "preamble.tex"
AUTHORS = ROOT / "AUTHORS"
REGISTRY = ROOT / "gui" / "src" / "ui" / "methods" / "registry.ts"

# The guide-author lists, keyed by the switch macro each guide declares.  The
# VALUE is the heading AUTHORS uses for that same list -- the join between the
# two homes arm (c) holds together.
GUIDE_SECTIONS = {
    "propertyTheoryAuthors": "Properties Guide and Theory Guide",
    "eduToolsAuthors": "EduTools Guide",
}


def detex(s):
    """Reduce a LaTeX-escaped name to comparable plain text.

    Only the accent forms this tree actually uses are handled, and anything
    unrecognised is left alone -- a silent mangle would make two different
    names compare equal, which is the one failure mode a parity gate must not
    have.
    """
    subs = [
        (r"V\\'\{\\i\}tor", "Vítor"),
        (r"M\\'\{o\}nica", "Mónica"),
        (r"Qu\\'\{\\i\}mica", "Química"),
        (r"T\\'\{e\}cnico", "Técnico"),
    ]
    for pat, rep in subs:
        s = re.sub(pat, rep, s)
    s = s.replace("\\textemdash\\ ", "— ").replace("\\textemdash", "—")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def read_macro(text, name):
    """Return the body of \\newcommand{\\<name>}{...}, brace-balanced."""
    start = text.find("\\newcommand{\\" + name + "}")
    if start < 0:
        return None
    i = text.index("{", start + len("\\newcommand{\\" + name + "}") - 1)
    # step to the opening brace of the BODY (after the name's closing brace)
    i = text.index("}", start) + 1
    while i < len(text) and text[i] not in "{[":
        i += 1
    if i >= len(text) or text[i] != "{":
        return None
    depth, j = 0, i
    while j < len(text):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j]
        j += 1
    return None


def branches(body):
    """Split an \\ifdefined chain into {switch macro -> branch text}.

    The \\else fallback is returned under the key "" -- it is the list a guide
    declaring no switch gets, and arm (c) deliberately does not hold it
    against AUTHORS because it belongs to no named guide.
    """
    out, pos = {}, 0
    pat = re.compile(r"\\ifdefined\\(\w+)")
    marks = [(m.start(), m.group(1)) for m in pat.finditer(body)]
    if not marks:
        return {"": body}
    for k, (start, switch) in enumerate(marks):
        seg_end = marks[k + 1][0] if k + 1 < len(marks) else len(body)
        seg = body[start:seg_end]
        seg = re.sub(r"^\\ifdefined\\\w+", "", seg)
        seg = re.split(r"\\else", seg)[0]
        out[switch] = seg
        pos = seg_end
    tail = body[marks[-1][0]:]
    parts = re.split(r"\\else", tail)
    if len(parts) > 1:
        out[""] = re.split(r"\\fi", parts[-1])[0]
    return out


PERSON = re.compile(r"(?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*\s+){1,3}[A-ZÀ-Ý][\wÀ-ÿ'’.-]*")


def flatten(segment):
    """A LaTeX segment reduced to comparable plain text."""
    s = detex(segment)
    s = re.sub(r"%\s*", "", s)
    s = s.replace("\\\\", " ")
    s = re.sub(r"\\[a-zA-Z]+\s*", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def names_of(segment):
    """People named in an AUTHOR list: a comma/and-separated run of names."""
    out = set()
    for piece in re.split(r",| and ", flatten(segment)):
        piece = piece.strip(" .;")
        if PERSON.fullmatch(piece):
            out.add(piece)
    return out


def curators_of(segment):
    """People named in a CURATOR block.

    The format is one entry per curator, entries separated by `;`, each
    written `Name, Affiliation \\textemdash\\ scope`.  The PERSON is the
    first comma-separated field -- an affiliation is capitalised too, so
    anything looser reads `Instituto Superior Tecnico` as a colleague.
    """
    m = re.search(r"Curators:(.*?)\\\\\[", segment, re.S)
    if m is None:
        return set()
    s = flatten(m.group(1))
    out = set()
    for entry in s.split(";"):
        head = re.split(r"—", entry)[0]
        person = head.split(",")[0].strip(" .;")
        if PERSON.fullmatch(person):
            out.add(person)
    return out


def authors_sections(text):
    """AUTHORS' indented blocks, keyed by their heading line."""
    out, heading, buf = {}, None, []
    for line in text.splitlines():
        if line and not line[0].isspace():
            if heading is not None:
                out[heading] = buf
            heading, buf = line.strip(), []
        elif heading is not None:
            out.setdefault(heading, buf)
            buf.append(line)
    if heading is not None:
        out[heading] = buf
    return out


def main():
    fails = []
    ptex = PREAMBLE.read_text(encoding="utf-8")
    atext = AUTHORS.read_text(encoding="utf-8")

    auth_body = read_macro(ptex, "manualauthors")
    cur_body = read_macro(ptex, "manualcuratorblock")
    if auth_body is None:
        fails.append("docs/preamble.tex: \\manualauthors not found")
    if cur_body is None:
        fails.append("docs/preamble.tex: \\manualcuratorblock not found -- "
                     "the curator channel is the whole point of this gate")
    if fails:
        print("check_curator_parity: FAIL")
        for f in fails:
            print("  " + f)
        return 1

    secs = authors_sections(atext)

    # --- the curator roster, from AUTHORS -------------------------------
    cur_lines = secs.get("Curators")
    if cur_lines is None:
        fails.append("AUTHORS: no `Curators` section")
        authors_curators = {}
    else:
        authors_curators = {}
        current = None
        for line in cur_lines:
            stripped = line.strip()
            if not stripped:
                continue
            indent = len(line) - len(line.lstrip())
            if indent <= 2 and re.match(
                    r"(?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*\s+){1,3}[A-ZÀ-Ý][\wÀ-ÿ'’.-]*", stripped):
                current = stripped.split(",")[0].strip()
                authors_curators[current] = []
            elif current is not None:
                authors_curators[current].append(stripped)

    # --- the curator roster, from preamble.tex --------------------------
    preamble_curators = set()
    for switch, seg in branches(cur_body).items():
        if not switch:
            continue
        preamble_curators |= curators_of(seg)

    # (a) both directions
    for n in sorted(preamble_curators - set(authors_curators)):
        fails.append("(a) curator in docs/preamble.tex but not in AUTHORS' "
                     "`Curators` section: %s" % n)
    for n in sorted(set(authors_curators) - preamble_curators):
        fails.append("(a) curator in AUTHORS but named on no guide's front "
                     "matter in docs/preamble.tex: %s" % n)

    # (b) the load-bearing arm
    auth_branches = branches(auth_body)
    all_author_names = set()
    for switch, seg in auth_branches.items():
        all_author_names |= names_of(seg)
    every_curator = preamble_curators | set(authors_curators)
    for n in sorted(every_curator & all_author_names):
        fails.append("(b) %s is a CURATOR and appears in \\manualauthors, "
                     "which feeds the guide's COPYRIGHT line (preamble.tex "
                     "line ~309).  A curator makes no copyright claim." % n)

    # (c) the guide lists, held against AUTHORS
    for switch, heading in GUIDE_SECTIONS.items():
        seg = auth_branches.get(switch)
        if seg is None:
            fails.append("(c) \\manualauthors has no branch for \\%s, which a "
                         "guide declares" % switch)
            continue
        want = names_of(seg)
        block = secs.get(heading)
        if block is None:
            fails.append("(c) AUTHORS has no `%s` section, but \\manualauthors "
                         "carries that list (%s)"
                         % (heading, ", ".join(sorted(want))))
            continue
        have = set()
        for line in block:
            s = line.strip()
            if re.fullmatch(r"(?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*\s+){1,3}[A-ZÀ-Ý][\wÀ-ÿ'’.-]*", s):
                have.add(s)
        if want != have:
            fails.append("(c) `%s` disagrees: preamble.tex says {%s}, AUTHORS "
                         "says {%s}" % (heading, ", ".join(sorted(want)),
                                        ", ".join(sorted(have))))

    # (e) the tool's own declaration, held against AUTHORS both ways
    if REGISTRY.is_file():
        rtext = REGISTRY.read_text(encoding="utf-8")
        #  `id: "<tool>", ... curator: { name: "<name>", ...` -- the id and the
        #  curator are in ONE entry, so pair them by scanning entries, never by
        #  matching two independent patterns and hoping they line up.
        entries = re.split(r'\n  \{\n', rtext)
        declared = {}
        for e in entries:
            mid = re.search(r'id:\s*"([a-z0-9-]+)"', e)
            mcu = re.search(r'curator:\s*\{\s*name:\s*"([^"]+)"', e)
            if mid and mcu:
                declared[mid.group(1)] = mcu.group(1)

        # AUTHORS' backticked tool ids, per curator
        claimed = {}
        for n, lines in authors_curators.items():
            for tid in re.findall(r"`([a-z0-9-]+)`", " ".join(lines)):
                claimed[tid] = n

        for tid, who in sorted(declared.items()):
            if tid not in claimed:
                fails.append("(e) EduTool `%s` declares curator %s in "
                             "registry.ts, but no AUTHORS curator names that "
                             "tool id in their scope." % (tid, who))
            elif claimed[tid] != who:
                fails.append("(e) EduTool `%s`: registry.ts says %s, AUTHORS "
                             "says %s." % (tid, who, claimed[tid]))
        for tid, who in sorted(claimed.items()):
            if tid not in declared:
                fails.append("(e) AUTHORS gives %s the scope `%s`, but that "
                             "EduTool declares no curator in registry.ts -- so "
                             "the student opening it sees no credit."
                             % (who, tid))
    else:
        fails.append("(e) gui/src/ui/methods/registry.ts is missing -- the "
                     "tool-side half of the roster cannot be checked, and a "
                     "check that cannot run must not pass.")

    # (d) every curator states a scope
    for n, lines in sorted(authors_curators.items()):
        body = " ".join(lines)
        if "—" not in body and "--" not in body:
            fails.append("(d) AUTHORS: curator %s states no scope.  Name the "
                         "guide and the part of it they answer for, after an "
                         "em dash." % n)
    for switch, seg in branches(cur_body).items():
        if not switch:
            continue
        if "\\textemdash" not in seg:
            fails.append("(d) docs/preamble.tex: the \\%s curator block states "
                         "no scope" % switch)

    if fails:
        print("check_curator_parity: FAIL")
        for f in fails:
            print("  " + f)
        return 1

    n_cur = len(authors_curators)
    n_tools = len(re.findall(r'curator:\s*\{', REGISTRY.read_text(encoding="utf-8"))) \
        if REGISTRY.is_file() else 0
    n_guides = len(GUIDE_SECTIONS)
    print("check_curator_parity: OK -- %d curator%s named in BOTH docs/preamble.tex "
          "and AUTHORS, each with a stated scope, and none of them in "
          "\\manualauthors (the macro that feeds every guide's copyright line); "
          "%d EduTool(s) declare a curator on the tool ITSELF and each agrees "
          "with AUTHORS in both directions; "
          "the %d guide author list%s carried by \\manualauthors agree name for "
          "name with AUTHORS' own sections.  NOT CHECKED: whether consent was "
          "given (a fact outside the tree, recorded in AUTHORS and verifiable "
          "by no gate) and whether a scope string is true of the section it "
          "names."
          % (n_cur, "" if n_cur == 1 else "s", n_tools,
             n_guides, "" if n_guides == 1 else "s"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
