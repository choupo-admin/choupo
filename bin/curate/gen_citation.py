#!/usr/bin/env python3
"""Generate the "How to cite" WORDING from CITATION.cff, for the engine and the GUI.
    bin/curate/gen_citation.py                 (writes both files)
    bin/curate/gen_citation.py --check         (exit 1 when either is stale)
    bin/curate/gen_citation.py --cff F --out-dir D
                                               (a PROBE: render another cff
                                                into D; used by check_citation)

WHY (DEV.md 4c C171 B, Vitor 2026-10-26: "tem de haver uma forma adequada de
ele me poder citar!").  CITATION.cff existed and nothing a user meets showed
it: not the GUI, not a downloaded case, not a result.  A citation is built
from THREE sources, each with its own home:

  * CITATION.cff -- who, what, where, under which licence, and whether a DOI
    exists.  ITS ONE HOME.  Nothing in src/ or gui/src may carry a copy of its
    title, authors or URL by hand (check_citation arm (c)); they reach both
    readers only through the two files this script writes.
  * the case's own primary sources -- the `citations ( "..." ... );` list of
    its system/controlDict, a DECLARED field (never prose comments).
  * the engine version and commit of the run -- src/core/Banner.H's
    CHOUPO_VERSION and the build's generated/gitVersion.H (the GUI: the WASM
    build's wasm/version.json stamp, written from the same two).

The last two are known only at run time, so this script does not write the
citation: it writes the TEMPLATE -- every sentence of it, with @PLACEHOLDERS@
-- and the two readers substitute.  The wording therefore has ONE home (this
file's TEXT table), the data ONE home (the cff), and the substitution is a
handful of literal replacements written twice, in C++
(src/core/Citation.cpp) and TypeScript (gui/src/case/citation.ts), held to
each other by gui/tests/citation.test.ts on a native run's own result block.

Outputs (both committed, both GENERATED -- bin/curate/generated_artefacts.py
entry `citation`):
  src/core/CitationTemplate.H            for the engine (result JSON block)
  gui/src/help/citation.generated.ts     for the GUI (Help, About, the zip)

The cff is read field-anchored, like release_inventory.parse_cff (whose
title / year / single-author render this REUSES -- that function's own output
shape is frozen by check_release_identity, so the extra fields are read here
and not added there).  NO DOI IS INVENTED: when the cff carries no `doi:`
the text says so plainly and cites the repository URL with the version and
commit; the day the cff gains one, the text follows.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_inventory as relinv  # noqa: E402  (parse_cff: the shared fields)

CFF = ROOT / "CITATION.cff"
OUT_H = Path("src/core/CitationTemplate.H")
OUT_TS = Path("gui/src/help/citation.generated.ts")


# ---- the cff ---------------------------------------------------------------

def _top_block(text: str, key: str) -> str:
    """The lines of a TOP-LEVEL block `key:` up to the next top-level key."""
    m = re.search(r"^%s:\s*\n((?:[ \t-].*\n?|\s*\n)*)" % re.escape(key), text, re.M)
    return m.group(1) if m else ""


def _scalar(text: str, key: str) -> str:
    m = re.search(r'^%s:\s*"?([^"\n]*?)"?\s*$' % re.escape(key), text, re.M)
    return m.group(1).strip() if m else ""


def _initials(given: str) -> str:
    return " ".join(p[0] + "." for p in given.replace("-", " ").split() if p)


def cff_fields(text: str) -> dict:
    """Everything the citation reads from the cff.  Refuses, by name, a cff
    the citation cannot be built from (no title, no author, no URL)."""
    base = relinv.parse_cff(text)
    authors = []
    for entry in re.split(r"^\s*-\s+", _top_block(text, "authors"), flags=re.M):
        fam = re.search(r"family-names:\s*\"?([^\"\n]+?)\"?\s*$", entry, re.M)
        giv = re.search(r"given-names:\s*\"?([^\"\n]+?)\"?\s*$", entry, re.M)
        if fam:
            authors.append((fam.group(1).strip(), giv.group(1).strip() if giv else ""))
    names = [f + (", " + _initials(g) if g else "") for f, g in authors]
    if len(names) <= 1:
        rendered = "".join(names)
    elif len(names) == 2:
        rendered = names[0] + ", & " + names[1]
    else:
        rendered = ", ".join(names[:-1]) + ", & " + names[-1]
    doi = re.search(r'^\s*doi:\s*"?([^"\s]+)"?\s*$', text, re.M)
    f = {
        "title": base["title"],
        "year": base["year"],
        "release": base["version"],
        "authors": rendered,
        "repository": _scalar(text, "repository-code"),
        "license": _scalar(text, "license"),
        "doi": doi.group(1) if doi else "",
        "parseCffAuthor": base["author"],
    }
    missing = [k for k in ("title", "year", "authors", "repository", "license") if not f[k]]
    if missing:
        raise SystemExit("gen_citation: REFUSED -- CITATION.cff gives no %s, so no "
                         "citation can be built from it.  Add the field(s) to "
                         "CITATION.cff (its one home); nothing here supplies a "
                         "default." % ", ".join(missing))
    return f


# ---- the wording (its ONE home) --------------------------------------------
#  Placeholders the READERS substitute, in this order: in DOCUMENT, @ENGINE@
#  first and @CASE@ last (a citation's own text is never re-scanned); in an
#  ENGINE_* line, @VERSION@ then @COMMIT@; in CITATION_LINE, @N@ then
#  @CITATION@; in CASE_CITATIONS, @CITATIONS@.  @CASE@ takes exactly ONE of
#  CASE_CITATIONS (a case that declares sources), CASE_NO_CITATIONS (a case
#  that declares none) and NO_CASE (no case open) -- each carries its own
#  footer, so the footer never names a controlDict no case supplied.
#  A paragraph is ONE line: the GUI wraps it to its width, a text file to its
#  reader's (hard breaks inside a paragraph broke mid-sentence in a narrow
#  popover).

def wording(f: dict) -> dict:
    software = ("%s (%s). %s (@ENGINE@) [Computer software]. %s"
                % (f["authors"], f["year"], f["title"], f["repository"]))
    if f["doi"]:
        doi_par = ("  DOI: https://doi.org/%s\n"
                   "  Licence: %s.\n" % (f["doi"], f["license"]))
    else:
        doi_par = ("  Choupo has no DOI yet.  Cite the repository URL with the version "
                   "and commit above: together they name the exact engine that ran.  "
                   "Licence: %s.\n" % f["license"])
    document = ("HOW TO CITE\n"
                "\n"
                "Choupo, the software:\n"
                "\n"
                "  " + software + "\n"
                "\n"
                + doi_par +
                "\n"
                "@CASE@")
    footer_case = ("Generated from CITATION.cff, the case's system/controlDict and the "
                   "engine's version stamp -- edit those, never this text.\n")
    footer_no_case = ("Generated from CITATION.cff and the engine's version stamp -- "
                      "edit those, never this text.\n")
    return {
        "DOCUMENT": document,
        "ENGINE_WITH_COMMIT": "version @VERSION@, commit @COMMIT@",
        "ENGINE_NO_COMMIT": "version @VERSION@; this build recorded no commit",
        "ENGINE_UNKNOWN": "version unknown: no engine version stamp was found",
        "CASE_CITATIONS": ("The primary sources this case declares (its system/controlDict, "
                           "`citations`) -- cite them for the work the case reproduces:\n"
                           "\n"
                           "@CITATIONS@\n"
                           "\n" + footer_case),
        "CITATION_LINE": "  [@N@] @CITATION@",
        "CASE_NO_CITATIONS": ("This case declares no primary sources: a `citations ( \"...\" );` "
                              "list in its system/controlDict would name them here.\n"
                              "\n" + footer_case),
        "NO_CASE": footer_no_case,
    }


ORDER = ["DOCUMENT", "ENGINE_WITH_COMMIT", "ENGINE_NO_COMMIT", "ENGINE_UNKNOWN",
         "CASE_CITATIONS", "CITATION_LINE", "CASE_NO_CITATIONS", "NO_CASE"]

BANNER = r"""/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/
"""

NOTE = ("GENERATED by bin/curate/gen_citation.py from CITATION.cff.  DO NOT EDIT:\n"
        "edit CITATION.cff (who, what, where, the DOI) or the wording table in\n"
        "the generator, then regenerate.  The readers substitute the\n"
        "@PLACEHOLDERS@; see the generator's docstring for the order.")


def _c_literal(s: str) -> str:
    out = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return '"' + out + '"'


def _ts_literal(s: str) -> str:
    out = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return '"' + out + '"'


def render_h(w: dict) -> str:
    lines = [BANNER, "//  " + NOTE.replace("\n", "\n//  "), "", "#pragma once", "",
             "namespace Choupo {", "namespace citationTemplate {", ""]
    for k in ORDER:
        lines.append("inline constexpr const char* %s =\n    %s;" % (k, _c_literal(w[k])))
    lines += ["", "} // namespace citationTemplate", "} // namespace Choupo", ""]
    return "\n".join(lines)


def render_ts(w: dict) -> str:
    lines = ["//  " + NOTE.replace("\n", "\n//  "), "",
             "export const CITATION_TEMPLATE = {"]
    for k in ORDER:
        lines.append("  %s:\n    %s," % (k, _ts_literal(w[k])))
    lines += ["} as const;", ""]
    return "\n".join(lines)


def outputs(cff_text: str) -> dict:
    w = wording(cff_fields(cff_text))
    return {OUT_H: render_h(w), OUT_TS: render_ts(w)}


def main(argv) -> int:
    cff = CFF
    out_dir = ROOT
    if "--cff" in argv:
        cff = Path(argv[argv.index("--cff") + 1])
    if "--out-dir" in argv:
        out_dir = Path(argv[argv.index("--out-dir") + 1])
    outs = outputs(cff.read_text(encoding="utf-8"))
    if "--check" in argv:
        stale = [str(p) for p, txt in outs.items()
                 if not (out_dir / p).is_file()
                 or (out_dir / p).read_text(encoding="utf-8") != txt]
        if stale:
            print("gen_citation: STALE against CITATION.cff: %s -- run "
                  "bin/curate/gen_citation.py" % ", ".join(stale))
            return 1
        print("gen_citation: OK -- %s are current against CITATION.cff"
              % " and ".join(str(p) for p in outs))
        return 0
    for p, txt in outs.items():
        dest = out_dir / p
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.is_file() or dest.read_text(encoding="utf-8") != txt:
            dest.write_text(txt, encoding="utf-8")
            print("gen_citation: wrote %s" % p)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
