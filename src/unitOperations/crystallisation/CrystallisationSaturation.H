/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vitor Geraldes
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
Function
    Choupo::crystSaturation

Description
    THE saturation a crystalliser works against -- one resolver, both time
    regimes.

    The heat of crystallisation was unified across steady and batch precisely
    so the two "can never diverge again" (CLAUDE.md).  The SATURATION was left
    behind, and it had already diverged:

        steady   Ksp = (gamma_pm * m_sat)^2 -- ion activity, Pitzer/eNRTL,
                 with the drowning-out mixed-solvent term
        batch    c / c_sat  -- a molecular solubility curve, and nothing else

    Same physical quantity, two routes, two units of one project.  Worse than
    a duplicated formula: this one lived in an ANONYMOUS NAMESPACE inside
    Crystalliser.cpp, so it had internal linkage and the batch crystalliser
    could not have called it even knowing it was there.  Its own comment read
    "the SAME saturation for every model" while being reachable by exactly one.

    The consequence was not visible because no batch case declares an
    electrolyte package.  It would have been the first one: a batch NaCl
    crystalliser would resolve ions for its activity coefficients and its heat
    of crystallisation, and then compute supersaturation off a molecular
    curve -- silently, since both routes return a plausible number.

    Nothing about the physics changes here.  The block moved out of the
    anonymous namespace unaltered, so the molecular path a sugar batch takes
    is the same arithmetic it always was; what changes is that there is now
    ONE saturation in the project instead of one plus a private copy.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

struct SatState
{
    std::size_t iSolute = 0, iSolv = 0, iAnti = 0;
    bool   useElec = false, mixedSolvent = false;
    scalar c_sat = 0.0;          // kg solute / kg solvent at T_op
    scalar m_sat = 0.0;          // mol/kg (electrolyte path) or 0
    scalar solvent_mass = 0.0;   // kg/s
    scalar xAnti = 0.0;
    scalar MW_sol = 0.0, MW_solv = 0.0;

    //- What this saturation LEFT OUT, in the resolver's own words.
    //
    //  The saturation is shared; the statement of its gaps was not.  The
    //  steady unit announced the missing mixed-solvent term and the missing
    //  standard-state transfer term (D3) in prose written at the print site,
    //  and the batch unit -- calling the SAME resolver, reaching the SAME
    //  gaps -- announced neither.  That is the divergence this file was
    //  created to end, one field later: a gap belongs to the number, not to
    //  whoever happens to print it.
    //
    //  Filled by crystSaturation(); every caller prints them verbatim.  Empty
    //  means the resolver has nothing to confess, which is itself a claim.
    std::vector<std::string> notes;
};

//- Identify solute / solvent / (antisolvent) and resolve the saturation at
//  T_op, by the ELECTROLYTE route when the package resolves ions and the
//  target IS its salt, and by the component's own solubility curve otherwise.
//  `soluteOverride` (empty = auto) names which species to crystallise when the
//  feed carries more than one crystallisable salt.
SatState crystSaturation(const ThermoPackage& thermo,
                         const sVector&       z,
                         scalar               F,
                         scalar               T_op,
                         const std::string&   soluteOverride = "");

} // namespace Choupo
