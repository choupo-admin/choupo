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

#include "ReactionHeat.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"

#include <algorithm>
#include <cmath>
#include <exception>
#include <iostream>

namespace Choupo {

scalar reactionHeat(const ThermoPackage&            thermo,
                    const std::vector<std::size_t>& comps,
                    const std::vector<scalar>&      nu,
                    scalar                          T,
                    const std::string&              phase,
                    std::optional<scalar>           dictOverride,
                    const std::string&              context,
                    int                             verbosity,
                    std::string&                    sourceOut)
{
    const std::size_t m = comps.size();

    // Does EVERY reacting species (ν ≠ 0) carry the elements/formation datum?
    bool        allFormation = (m > 0);
    std::string missing;
    for (std::size_t s = 0; s < m; ++s)
    {
        if (nu[s] == 0.0) continue;
        if (!thermo.comp(comps[s]).hasGibbsData())
        {
            allFormation = false;
            if (!missing.empty()) missing += ", ";
            missing += thermo.comp(comps[s]).name();
        }
    }

    // -- (a) Formation datum is complete: it is authoritative. --------------
    if (allFormation)
    {
        scalar dH = 0.0;
        bool   ok = true;
        try
        {
            for (std::size_t s = 0; s < m; ++s)
            {
                if (nu[s] == 0.0) continue;
                // THE canonical per-species leg (forum #103/#105): the SAME
                // rung every balance and ledger duty reads, so the announced
                // dH_rxn and the ledger's E/dXi can never diverge again (the
                // 0.9% Watson-vs-Kirchhoff gap of the old h_formation path).
                // This is DeltaH_rxn on the STANDARD phase legs (#103's
                // distinction 1); a segment's real duty is the ledger's
                // extensive state difference (distinction 2), which adds
                // mixing enthalpy only when a calorimetric H^E is active.
                dH += nu[s] * thermo.speciesPhaseEnthalpy(
                    comps[s], T, 1.0e5, phase,
                    ThermoPackage::ReferenceContext::StandardPhase);
            }
        }
        catch (const std::exception& e)
        {
            // standardThermochemistry present but a Cp / Hvap leg is missing for this
            // phase -- announce and fall through to the explicit override.
            ok = false;
            std::cout << "  [reaction heat] " << context
                      << ": formation datum present but incomplete for the "
                      << phase << " phase (" << e.what()
                      << ") -- using the dict override if any.\n";
        }

        if (ok)
        {
            sourceOut = "formation";
            if (verbosity >= 2)
                std::cout << "  [reaction heat] " << context
                          << ": from FORMATION datum (Σ νᵢ·hᵢ(T)) = "
                          << (dH / 1000.0) << " kJ/mol  (T = " << T << " K, "
                          << phase << " basis)\n";

            // Cross-check (never silently override) an explicit dict value.
            if (dictOverride.has_value())
            {
                const scalar d   = *dictOverride;
                const scalar tol = std::max<scalar>(1.0e3, 0.02 * std::abs(dH));
                if (std::abs(d - dH) > tol)
                    std::cout << "  [reaction heat] WARNING " << context
                              << ": dict dH_rxn = " << (d / 1000.0)
                              << " kJ/mol disagrees with the formation datum "
                              << (dH / 1000.0) << " kJ/mol by "
                              << ((d - dH) / 1000.0)
                              << " kJ/mol -- the curated formation value is"
                              << " authoritative (the dict value is IGNORED).\n";
            }
            return dH;
        }
        // else: fall through to the override branch.
    }

    // -- (b) Explicit dict override (announced). ----------------------------
    if (dictOverride.has_value())
    {
        sourceOut = "dict-override";
        std::cout << "  [reaction heat] " << context
                  << ": from dict OVERRIDE dH_rxn = " << (*dictOverride / 1000.0)
                  << " kJ/mol  (no formation datum";
        if (!missing.empty()) std::cout << " for " << missing;
        std::cout << ")\n";
        return *dictOverride;
    }

    // -- (c) Neither: warn aloud, stay thermally neutral (no silent crutch). -
    sourceOut = "none";
    std::cout << "  [reaction heat] WARNING " << context
              << ": no formation datum";
    if (!missing.empty()) std::cout << " (missing for " << missing << ")";
    std::cout << " and no explicit dH_rxn -- the reaction is treated as"
                 " thermally NEUTRAL (heat of reaction = 0). Add standardThermochemistry"
                 " to the species or a dH_rxn override to give it a heat.\n";
    return 0.0;
}

} // namespace Choupo
