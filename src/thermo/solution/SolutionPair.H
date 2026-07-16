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
    Choupo::SolutionPair

Description
    Aqueous- (or other-solvent-) solution thermo of a MOLECULAR solute,
    keyed by the ordered pair (solute, solvent).  The molecular-solute
    sibling of the ionic species/aqueous.dat reference tier.

    A heat of solution is defined as `crystal -> species dissolved IN
    water`: its definition names a second species, so by the data-
    governance Golden Rule (arity-2) it is PAIR/catalogue data and lives
    HERE, never in the component .dat.  The component references it BY NAME.

    The engine reads dHsoln for the dissolved-vs-crystalline enthalpy rung:

        h_aq(T) = Hf_crystal + dHsoln + INT_298^T cp_aq dT'

    so the heat of crystallisation EMERGES as h_solid - h_aq ~ -dHsoln from
    ONE sourced number (no second hand-entered constant).

    File location: `data/standards/solution/<solute>-<solvent>.dat`.

    File format:

        solute      sucrose;
        solvent     water;
        dHsoln      5400 J/mol;     // endothermic; crystal -> aqueous, 298 K
        Cp          630 J/mol/K;    // aqueous (dissolved-solute) heat capacity
        Trange      ( 280  330 );
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>

namespace Choupo {

class SolutionPair
{
public:
    SolutionPair() = default;

    void readFromDict(const DictPtr& d);

    const std::string& solute()  const { return solute_;  }
    const std::string& solvent() const { return solvent_; }

    // Standard enthalpy of solution [J/mol], crystal -> aqueous, infinite
    // dilution, 298.15 K (endothermic => positive).  Engine-side J/mol.
    scalar dHsoln() const { return dHsoln_; }

    // Aqueous (dissolved-solute) molar heat capacity [J/mol/K].  0 if the
    // file declares none (the caller falls back to the component's cp_liq).
    bool   hasCpAq() const { return hasCpAq_; }
    scalar cpAq()    const { return cpAq_; }

    scalar T_min() const { return T_min_; }
    scalar T_max() const { return T_max_; }

    // Primary citation captured from dHsoln_provenance{ method "..."; }.
    const std::string& source() const { return source_; }

private:
    std::string solute_;
    std::string solvent_;
    scalar      dHsoln_ = 0.0;        // J/mol
    bool        hasCpAq_ = false;
    scalar      cpAq_   = 0.0;        // J/mol/K
    scalar      T_min_  = 0.0;
    scalar      T_max_  = 0.0;
    std::string source_;
};

} // namespace Choupo
