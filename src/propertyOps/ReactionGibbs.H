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

/*---------------------------------------------------------------------------*\
Class
    Choupo::ReactionGibbs

Description
    THE STANDARD REACTION THERMOCHEMISTRY OF A DECLARED REACTION, priced on
    the catalogue's formation data with EVERY species on a DECLARED standard
    state and every datum's rung NAMED.

        dH°(T) = Σ ν_i h_i(T, phase_i)
        dS°(T) = Σ ν_i s_i(T, phase_i)            (third-law absolute entropies)
        dG°(T) = dH° − T dS°,     ln K = −dG°/(R T)

    WHY THIS OP EXISTS (commission C10, 2026-09-27).  The engine already had
    ONE route to a reaction's Gibbs energy, `Reaction::equilibrium`
    (thermo/reaction/Reaction.cpp), and it prices every species with
    `g_pure_ig(T)` -- the IDEAL-GAS rung, which a record tabulated on the
    solid or liquid standard state REFUSES by name (Component.cpp,
    `requireIdealGasRung`).  That is right for a gas-phase reactor and it is
    why `equilibriumReactor`, `gibbsReactor` and `gibbsMap` cannot take
    glucose (`referenceState pureSolid`) beside gases: measured, the refusal
    is "reading them here would be wrong by a heat of sublimation".  The
    biological nitrogen-fixation routes an EduTool needed to price are
    exactly such reactions -- a solid sugar and liquid water beside gases --
    and no property operation summed a declared reaction over the
    phase-aware `h_formation` / `s_formation` surface the Component already
    carries.  This op does that and nothing else.

    THE ONE SURFACE.  Every species is priced on the elements/formation datum
    at 298.15 K (`dHf_298`, third-law `s_298`), on the standard state the case
    DECLARES for it in `phases { <species> idealGas | pureLiquid | pureSolid; }`.
    Two routes to a species' potential, and the run says which it took:

      * AT THE DATUM TEMPERATURE (|T − 298.15 K| < 1e-6 K) on a rung the
        record DECLARES, the potential is the rung's own pair with no heat
        capacity integrated -- the integral is identically zero there.  This
        is what makes a record that carries a datum but NO heat-capacity
        block priceable at 298.15 K and at no other temperature (glucose.dat
        says of its own Cp: "FLAGGED, NOT FABRICATED").
      * OTHERWISE through `Component::h_formation(T, phase)` and
        `s_formation(T, phase)`, which walk from the record's declared rung to
        the requested phase (a vaporisation crossing for water priced as a
        liquid from its ideal-gas datum) and REFUSE by name where the walk
        needs data the record lacks.  The refusal is the answer then, and
        the op does not soften it.

    A phase that the record cannot answer for is refused; a species in a
    reaction with no `phases` entry is refused (the standard state of a
    species is a DECLARATION -- pricing NH3 as a gas because it usually is
    one would silently decide the reaction quotient's convention).

    Dictionary form:

        {
            name         fixationRoutes;
            type         reactionGibbs;
            reactions    ( heterotrophic phototrophic haberBosch ); // constant/reactions
            phases       { glucose pureSolid; water pureLiquid; N2 idealGas;
                           NH3 idealGas; CO2 idealGas; O2 idealGas; H2 idealGas; }
            temperatures ( 298.15 310.15 );                        // K
            output       { file reactionGibbs.csv; }
        }

    Diagnostics, per reaction and temperature (T printed as an integer K):
        <rxn>_T<K>K_dH_kJ_mol  <rxn>_T<K>K_dS_J_molK  <rxn>_T<K>K_dG_kJ_mol
        <rxn>_T<K>K_lnK
    CSV columns: reaction, T_K, dH_kJ_mol, dS_J_molK, dG_kJ_mol, lnK, and a
    last column naming, species by species, the route each potential took:
    `datum` (its own rung at 298.15 K, nothing integrated), `integrated` (its
    own rung, Cp integrated from 298.15 K) or `crossing` (another phase,
    the transition taken at 298.15 K and announced as an advisory).

    WHAT IT IS NOT.  Not an equilibrium solver (no extents, no composition),
    not a reactor, and it knows nothing about a rate: an exergonic reaction
    is one the equilibrium permits, and this op says nothing about whether
    anything makes it go.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class ReactionGibbs : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "reactionGibbs"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override { return headline_; }

private:
    std::map<std::string, scalar> diag_;
    std::vector<std::string> headline_;
};

} // namespace Choupo
