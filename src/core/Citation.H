/*---------------------------------------------------------------------------*\
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
-------------------------------------------------------------------------------
File
    src/core/Citation.H

Description
    HOW TO CITE A RUN (DEV.md 4c C171 B).  One citation text from three
    sources, each with its own home:

      * CITATION.cff -- reached ONLY through src/core/CitationTemplate.H,
        GENERATED from it by bin/curate/gen_citation.py (never hand-copied:
        check_citation arm (c));
      * the case's primary sources -- `citations ( "..." ... );` in its
        system/controlDict, a DECLARED list read here and nowhere else;
      * the engine version and commit -- CHOUPO_VERSION (Banner.H) and the
        build's generated/gitVersion.H, the same two the banner prints.

    The text rides the result JSON as the `citation` block.  It is TEXT and
    no golden row reads it: it carries the build's commit, which must never
    land in a golden, and the citations it lists are the controlDict's own
    words, whose home is the controlDict.  Deterministic for one build and
    one case: no clock, no path.

    The substitution here is the same handful of literal replacements the
    GUI makes (gui/src/case/citation.ts); gui/tests/citation.test.ts holds
    the two to each other on a native run's own result block.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>
#include <vector>

namespace Choupo {

class Dictionary;

namespace citation {

//  The engine that runs: the version string and the commit (empty when the
//  build recorded none -- a source tarball, or a build with no git).
struct EngineIdentity
{
    std::string version;
    std::string commit;
};

EngineIdentity engineIdentity();

//  The citation text.  `haveCase` false = no case open (no case section, and
//  a footer that names no controlDict); true with an empty list = a case
//  that declares no primary sources (said).
std::string compose(const std::vector<std::string>& citations, bool haveCase,
                    const EngineIdentity& engine);

//  Read the case's `citations` from its controlDict -- the ONE reader --
//  and keep them for the result block.  Absent = an empty list.  A key that
//  is not a list of words, or an empty entry, REFUSES by name (throws).
void readCaseCitations(const Dictionary& controlDict);

const std::vector<std::string>& caseCitations();

//  The text for THIS run: the citations read above (or no case section when
//  no controlDict was read), the engine identity of this build.  The result
//  JSON's `citation` block carries it (result/ResultEmitter.H citationJson).
std::string text();

} // namespace citation
} // namespace Choupo
