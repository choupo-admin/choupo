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
    The body moved VERBATIM (2026-07-11, energy phase (d)) from the static
    crystHeatPerMol in Crystalliser.cpp, so the steady unit's behaviour is
    byte-identical; only the SatState fields it read became parameters.
\*---------------------------------------------------------------------------*/

#include "CrystallisationHeat.H"

#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"

namespace Choupo {

scalar crystallisationHeatPerMol(const ThermoPackage& thermo,
                                 std::size_t          iSolute,
                                 bool                 useElec,
                                 bool                 mixedSolvent,
                                 scalar               m_sat,
                                 scalar               T_op,
                                 scalar               dHcrystConstant,
                                 std::string&         source)
{
    if (useElec
        && thermo.electrolyte().dissolutionEnthalpy() != 0.0)
    {
        const auto& el = thermo.electrolyte();
        // BASE: the m->0, calorimetry-FREE heat of solution (heat of
        // crystallisation = +dH_soln_inf), SINGLE-SOURCED from the electrolyte{}
        // dissolutionEnthalpy -- available for EVERY aqueous salt, fitted or not,
        // aqueous or mixed-solvent.  The salt's solid formation is the IONS minus
        // this dH_soln (Hf_solid = sum nu*hfAq - dH_soln), a DERIVED quantity --
        // never a stored second source (forum 2026-06-29: trees never store
        // derivatives; arity-1 wins).
        const scalar dHsolnInf = thermo.electrolyte().dissolutionEnthalpy();
        scalar dH = dHsolnInf;
        source = "dH_soln_inf (electrolyte dissolutionEnthalpy, ion-derived)";
        // FINITE-CONCENTRATION correction L2_bar(m_sat): ONLY when the Pitzer
        // T-slots are calorimetrically fitted AND the path is aqueous (the
        // mixed-solvent L_phi is its own future fit).
        if (!mixedSolvent && el.calorimetricFit())
        {
            const scalar L2 = el.partialMolarRelativeEnthalpy(m_sat, T_op);
            const scalar mMax = el.lphiValidityMax();
            dH += L2;
            source = "surface (dH_soln_inf + L2_bar(m_sat), calorimetric fit)";
            if (mMax > 0.0 && m_sat > mMax)
                source += "  ** EXTRAPOLATED: m_sat "
                        + std::to_string(m_sat) + " > fit window "
                        + std::to_string(mMax) + " mol/kg **";
        }
        return dH;
    }
    // NON-electrolyte (molecular-solute) path.  When the solute carries an
    // aqueous-solution tier (solution/<solute>-<solvent>.dat), the heat of
    // crystallisation EMERGES as the dissolution endotherm released on
    // crystallising: dH_cryst = +dHsoln (dissolution sign).  This is the SAME
    // sourced number the elements-datum stream balance reads through
    // H_liquid_formation -- so the unit duty Q and the stream dH reconcile
    // from one value, instead of the dHcryst placeholder (the `dHcryst 0.0;`
    // that wrongly asserted athermal crystallisation).
    if (!useElec)
    {
        if (auto dHsoln = thermo.dHsolnForSolute(iSolute))
        {
            // Heat RELEASED on crystallising at T_op = +dHsoln, PLUS the
            // Cp-path correction (cp_aq - cp_solid)*(T_op - 298): the dissolved
            // species reached T_op accumulating cp_aq from 298 K, while the
            // crystal carries only cp_solid from 298 K, so crystallisation also
            // releases that sensible-Cp difference.  This makes the unit duty
            // EXACTLY reconcile with the elements-datum stream balance (which
            // puts the crystal on the solid rung Hf + INT cp_solid and the
            // dissolved solute on the aqueous rung Hf + dHsoln + INT cp_aq).
            const Component& c = thermo.comp(iSolute);
            scalar cpCorr = 0.0;
            if (c.hasCpSolid() && c.hasCpLiquid())
            {
                const scalar cpAq    = c.cpLiquid().Cp(T_op);   // dissolved-solute Cp
                const scalar cpSolid = c.cpSolid().Cp(T_op);
                cpCorr = (cpAq - cpSolid) * (T_op - 298.15);
            }
            source = "solution tier (dH_cryst = +dHsoln + (cp_aq-cp_solid)*(T-298), "
                     "data/standards/solution/)";
            return *dHsoln + cpCorr;
        }
        source = "solubility-curve dHcryst";
        // A DECLARED simplification confesses itself: an asserted/disabled
        // dHcryst (an intentional value, e.g. 0) is NOT measured chemistry --
        // say so, so the zero duty cannot pass as a physical result.
        const std::string& org = thermo.comp(iSolute).dHcrystOrigin();
        if (!org.empty())
            source += " [" + org + ": a DECLARED value, NOT measured -- "
                      "crystallisation duty intentionally omitted]";
        return dHcrystConstant;
    }
    source = "operation dHcryst constant (salt not calorimetrically fitted on this path)";
    return dHcrystConstant;
}

} // namespace Choupo
