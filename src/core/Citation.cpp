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
\*---------------------------------------------------------------------------*/

#include "core/Citation.H"
#include "core/Banner.H"
#include "core/CitationTemplate.H"
#include "core/Dictionary.H"

//  The same stamp the banner reads (Banner.cpp): written by the build with a
//  content-compare, absent in a source tarball -- then the text SAYS the
//  build recorded no commit rather than leaving the field quietly blank.
#if __has_include("generated/gitVersion.H")
#include "generated/gitVersion.H"
#endif

#include <stdexcept>

namespace Choupo {
namespace citation {

namespace {

//  Replace every occurrence of `key` in `s` -- left to right, never
//  re-scanning what was inserted (a citation may contain anything).
std::string replaceAll(std::string s, const std::string& key, const std::string& value)
{
    std::size_t pos = 0;
    while ((pos = s.find(key, pos)) != std::string::npos)
    {
        s.replace(pos, key.size(), value);
        pos += value.size();
    }
    return s;
}

std::vector<std::string>& store()
{
    static std::vector<std::string> cites;
    return cites;
}

bool& haveCaseFlag()
{
    static bool have = false;
    return have;
}

} // namespace

EngineIdentity engineIdentity()
{
    EngineIdentity id;
    id.version = CHOUPO_VERSION;
#ifdef CHOUPO_GIT_HASH
    id.commit = CHOUPO_GIT_HASH;
#endif
    return id;
}

std::string compose(const std::vector<std::string>& citations, bool haveCase,
                    const EngineIdentity& engine)
{
    std::string eng;
    if (engine.version.empty())
        eng = citationTemplate::ENGINE_UNKNOWN;
    else if (engine.commit.empty())
        eng = replaceAll(citationTemplate::ENGINE_NO_COMMIT, "@VERSION@", engine.version);
    else
        eng = replaceAll(replaceAll(citationTemplate::ENGINE_WITH_COMMIT,
                                    "@VERSION@", engine.version),
                         "@COMMIT@", engine.commit);

    //  Exactly one of the three case parts, each with its own footer: with no
    //  case open there is no controlDict to name.
    std::string casePart = citationTemplate::NO_CASE;
    if (haveCase && citations.empty())
        casePart = citationTemplate::CASE_NO_CITATIONS;
    else if (haveCase)
    {
        std::string lines;
        for (std::size_t i = 0; i < citations.size(); ++i)
        {
            if (i) lines += "\n";
            lines += replaceAll(replaceAll(citationTemplate::CITATION_LINE,
                                           "@N@", std::to_string(i + 1)),
                                "@CITATION@", citations[i]);
        }
        casePart = replaceAll(citationTemplate::CASE_CITATIONS, "@CITATIONS@", lines);
    }

    return replaceAll(replaceAll(citationTemplate::DOCUMENT, "@ENGINE@", eng),
                      "@CASE@", casePart);
}

void readCaseCitations(const Dictionary& controlDict)
{
    haveCaseFlag() = true;
    store().clear();
    //  The word a case author reaches for first, refused by name rather than
    //  ignored: controlDict's keys are not audited, so a `references` list
    //  here would vanish from the citation in silence.  One word, one
    //  meaning: in a propsDict `references` means reference DATASETS.
    if (controlDict.found("references"))
        throw std::runtime_error(
            "controlDict: `references` is not a controlDict key -- a case's "
            "primary sources are declared as `citations ( \"...\" );` (in a "
            "propsDict, `references` means reference DATASETS).  Rename the "
            "key to `citations`.");
    if (!controlDict.found("citations")) return;
    std::vector<std::string> cites;
    try
    {
        cites = controlDict.lookupWordList("citations");
    }
    catch (const std::exception&)
    {
        throw std::runtime_error(
            "controlDict: `citations` must be a list of quoted primary "
            "sources, one per entry -- e.g.\n"
            "    citations\n"
            "    (\n"
            "        \"V. Geraldes, A.M. Brites Alves, J. Membr. Sci. 321 (2008) "
            "172-182, doi:10.1016/j.memsci.2008.04.054\"\n"
            "    );\n"
            "  It is what `How to cite` lists for this case (DEV.md 4c C171).  "
            "Write each source as one quoted string, or delete the key.");
    }
    for (std::size_t i = 0; i < cites.size(); ++i)
        if (cites[i].find_first_not_of(" \t\r\n") == std::string::npos)
            throw std::runtime_error(
                "controlDict: `citations` entry " + std::to_string(i + 1)
                + " is empty -- a primary source is a full citation in one "
                  "quoted string; delete the empty entry.");
    store() = std::move(cites);
}

const std::vector<std::string>& caseCitations()
{
    return store();
}

std::string text()
{
    return compose(store(), haveCaseFlag(), engineIdentity());
}

} // namespace citation
} // namespace Choupo
