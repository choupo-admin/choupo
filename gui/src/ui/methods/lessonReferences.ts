/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The bibliographic REFERENCES of each EduTool lesson (DEV.md 4c C259 (a)).

  Vitor, 2026-11-09: "põe as referências bibliográficas que achares adequadas
  e confirma que existem e que não há alucinações".  A reference is therefore
  admitted only WITH ITS VERIFICATION, and the verification is part of the
  record, not a comment beside it:

    * `crossref`  -- the DOI resolved on api.crossref.org and the authors,
                     title, journal, volume, pages and year matched;
    * `pdf`       -- the work was read in the project's literature folder
                     (file and page in `evidence`);
    * `catalogue` -- a library catalogue or publisher catalogue record
                     confirms title, edition, publisher and year;
    * `official`  -- the issuing body's own page or document was fetched
                     (a standards body, a legislature, a government agency).

  `evidence` says what was matched and where; `date` is when.  Neither is
  drawn on the page -- a student needs the citation, a reviewer needs the
  evidence -- and bin/curate/check_lesson_references.py refuses an entry
  without them, a malformed DOI, a duplicate inside one lesson, and a DOI
  that two lessons cite with different bibliographic text.  What that gate
  cannot do, and says so, is re-run the verification: it is network-free.

  WHY THE DATA IS JSON, AND KEYED BY TOOL.  The references of a page are one
  list per tool, read by the page AND by a Python gate.  Held in TypeScript
  the gate would have to parse object literals by pattern; JSON is read by
  both sides with their standard libraries, so there is one home and no
  second reader to drift.  Keyed by tool id rather than by lesson module,
  because several tools draw their chapters inline and have no module, and
  the page -- not the module -- is what a reader opens.

  A PAGE WITH ITS OWN SOURCES LIST keeps it.  Some tools already draw a
  "Sources" table that says how each source was read; for those, the
  references here are the further reading that list does not hold, and
  `pageSources` names the heading of the page's own list so the References
  block can point at it instead of copying it.
\*---------------------------------------------------------------------------*/

import data from "./lessonReferences.json";
import type { MethodToolId } from "./registry.js";

/** How a reference was confirmed to exist and to say what it is cited for. */
export type VerificationMethod = "crossref" | "pdf" | "catalogue" | "official";

export interface ReferenceVerification {
  method: VerificationMethod;
  /** What was matched, and where (a DOI query, a file and page, a URL). */
  evidence: string;
  /** ISO date the verification was made. */
  date: string;
}

export interface LessonReference {
  /** The full bibliographic text, as drawn. */
  text: string;
  /** Drawn as a https://doi.org/ link. */
  doi?: string;
  /** Drawn as a link, where the work is read online (open access, a standard's page). */
  url?: string;
  /** One line: what the reference is for on this page. */
  note?: string;
  /** Kept in the data, never drawn. */
  verified: ReferenceVerification;
}

export interface LessonReferenceBlock {
  /** The heading of the page's own sources list, when it draws one. */
  pageSources?: string;
  references: readonly LessonReference[];
}

const LESSONS = (data as unknown as {
  lessons: Record<string, LessonReferenceBlock>;
}).lessons;

/** The references of one tool's page, or null when it carries none. */
export function lessonReferences(tool: MethodToolId): LessonReferenceBlock | null {
  const b = LESSONS[tool];
  return b && b.references.length > 0 ? b : null;
}
