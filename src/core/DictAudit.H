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
Namespace
    Choupo::dictAudit

Description
    A key nobody read is a key that did nothing -- and the author believes it
    did.

    `murphreeEficiency 0.70;` parses cleanly, sits in the operation dict, is
    never consulted, and the column runs with the ideal-tray default.  Exit 0,
    not a word, and the distillate toluene moves from 2.47 to 0.94 kmol/h --
    the student defends a purity they did not compute.  The project's own
    stance ("no silent crutch: the solver ANNOUNCES what it does to converge,
    never disguises it") was being broken one layer below every unit
    operation, by the dictionary itself.

    THE DIAGNOSIS IS PRECISE, NOT A BARE WARNING.  The dict records both the
    keys a lookup consulted and the keys the CODE asked for; the unread key is
    matched against the asked-for-but-absent ones by edit distance.  So the
    engine does not merely say "I ignored murphreeEficiency" -- it says which
    key the author almost certainly meant, because the unit's own code named
    it while looking for it and came away empty.  No static list of legal
    names to maintain, and no way for it to drift from what the code reads.

    WHY IT ANNOUNCES AND DOES NOT REFUSE (measured, not assumed).  A refusal
    would be the doctrine's usual answer, and it is the right end state.  But
    the corpus is the evidence for whether the corpus can take it: this pass
    was built to MEASURE first -- run it over every case, count what it finds,
    and let that decide the default.  Turning a warning into a refusal is one
    line once the number is known; guessing the number and refusing is how a
    teaching tool becomes one that will not run.

    SCOPE.  Only NUMERIC/parameter dicts a unit operation reads -- the place
    where a silent default changes an answer.  Not the whole file: a case
    dict legitimately carries keys for other readers (the GUI's layout, an
    outer driver's block), and a diagnostic that cries about those trains the
    author to ignore it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <string>
#include <vector>

namespace Choupo {
namespace dictAudit {

//- One key that was written and never read.
struct Finding
{
    std::string where;       // "unit 'col' operation{}"
    std::string key;         // the key as the author spelled it
    std::string suggestion;  // the asked-for key it most likely meant ("" = none)
};

//- Levenshtein distance.  Small, published, and testable -- the same bar the
//  project sets before taking on a dependency.
std::size_t editDistance(const std::string& a, const std::string& b);

//- Collect the unread keys of ONE dict, with a suggestion drawn from the keys
//  the code asked for and did not find.  A suggestion is offered only when it
//  is close enough to be a typo rather than a different word: distance <= 2,
//  and never more than a third of the key's length.
std::vector<Finding> audit(const Dictionary& d, const std::string& where);

//- Announce findings on stderr, at verbosity >= 1.  Returns the count.
int report(const std::vector<Finding>& findings, int verbosity);

} // namespace dictAudit
} // namespace Choupo
