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
Class
    Choupo::ChemistrySystem

Description
    The case's ACTIVE-CHEMISTRY SELECTION -- `constant/chemistryDict`
    (recordType chemistrySystem) -- the ONE home for
    "which chemical equilibria/phases belong to this system".  Separation
    without overlap:

      thermoPhysPropDict      property surfaces + routes per phase;
      chemistryDict           WHICH equilibria/solid phases are in the network;
      constant/chemistry/*.dat  sealed closure RECORDS (facts), never selection;
      constant/reactions      the process-reaction library (unit ops activate
                              by name), untouched;
      propsDict/flowsheetDict the fed analysis, totals, atmosphere, dose, and
                              which OPERATIONS equilibrate/precipitate.

    `equilibria.solidPhases` names the solid phases ADMITTED/AVAILABLE in the
    chemistry network.  It does NOT by itself authorise precipitation, does
    not assert the phase is present, and carries no Ksp/dH -- those facts
    stay in the phase/component records (arity-1); the OPERATION asks for
    SI, equilibrium or crystallisation.

    The grammar is deliberately MINIMAL; it grows only against a concrete
    physical case, never speculatively.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

struct ChemistrySystem
{
    bool                     present = false;
    std::vector<std::string> solidPhases;   // admitted solid phases, by name

    static ChemistrySystem fromDict(const DictPtr& d)
    {
        ChemistrySystem out;
        if (!d) return out;
        if (d->lookupWordOrDefault("recordType", "") != "chemistrySystem")
            throw std::runtime_error("chemistryDict: recordType must be"
                " 'chemistrySystem' (the active-chemistry selection record).");
        if (d->lookupScalarOrDefault("schemaVersion", 0) != 1)
            throw std::runtime_error("chemistryDict: schemaVersion 1 required.");
        for (const auto& k : d->keys())
            if (k != "recordType" && k != "schemaVersion" && k != "equilibria")
                throw std::runtime_error("chemistryDict: unknown key '" + k
                    + "'.  The grammar is `equilibria {"
                      " solidPhases ( ... ); }` -- it grows only against a"
                      " concrete physical case.");
        if (d->found("equilibria"))
        {
            auto eq = d->subDict("equilibria");
            for (const auto& k : eq->keys())
                if (k != "solidPhases")
                    throw std::runtime_error("chemistryDict: equilibria key '"
                        + k + "' -- have: solidPhases ( ... ).  Extend the"
                        " grammar against a concrete physical case, never"
                        " speculatively.");
            if (eq->found("solidPhases"))
                out.solidPhases = eq->lookupWordList("solidPhases");
        }
        out.present = true;
        return out;
    }
};

} // namespace Choupo
