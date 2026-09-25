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
Description
    Stoichiometric conversion reactor (gas-basis; specify per-pass conversion)
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

// A stoichiometric CONVERSION reactor.  You SPECIFY the per-pass conversion of
// the limiting reactant; the outlet follows the reaction stoichiometry.  Unlike
// CSTR/PFR it carries NO kinetics and NO liquid molar volume (Vliq) -- so it is
// honest for a GAS-phase reactor where the per-pass conversion is set by the
// catalyst / residence time, not by equilibrium or a liquid-basis rate.  The
// classic use is a recycle process (e.g. HDA): a finite per-pass conversion is
// exactly what makes the recycle meaningful.
//
// ISOTHERMAL means the OUTLET is at T -- the INLET need not be, and the duty
// has to say so.  `Q_kW` used to carry the heat of reaction ALONE, so a reactor
// fed at 389 K and held at 623 K reported a duty that did not move when its
// feed temperature did.  It is the enthalpy difference the first law asks
// for, published beside its two exact parts:
//
//     Q_kW           = H(outlet state) - H(inlet state)
//     Q_reaction_kW  = H(outlet) - H(feed composition carried to T_out)
//     Q_sensible_kW  = H(feed composition at T_out) - H(inlet)
//
// The split is Hess's law and is EXACT, not an apportionment: the middle state
// cancels.  When the feed already enters at T the sensible term is identically
// zero and `Q_kW` is the reaction term alone.
//
// EVERY H ABOVE IS THE PACKAGE'S OWN (2026-09-25), obtained through the same
// resolve-then-price call the energy report applies to these very streams
// (`flashState::twoPhaseSplit` + `hOfState`, else `H_stream_formation` on the
// state the stream carries).  Both terms used to be sums of `h_pure_ig` --
// IDEAL GAS -- while the stream this unit publishes is priced by the package,
// so under a cubic EoS the unit and the report described the same reactor with
// two different enthalpies.  That is the family CLAUDE.md §6 names, and
// `GibbsReactor` was taken off it on 2026-09-08.
//
// `dHrxn_kJ_per_mol` is a DIFFERENT number and deliberately keeps the
// doctrine's rung: the heat of reaction is `SUM nu_i h_i(T)` on the
// elements/formation datum (CLAUDE.md §5, ONE enthalpy base).  It equals
// `Q_reaction_kW / xi` exactly when the package is an ideal gas and does not
// otherwise -- the difference is the departure function, which belongs to the
// fluid and not to the reaction.
class ConversionReactor : public UnitOperation
{
public:
    ConversionReactor() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    // MULTI-REACTION path (`reactions ( r1 r2 );`): each reaction's extent is
    // SPECIFIED -- by a fractional `conversion` of its limiting reactant (of the
    // FEED amount) or by a direct `extent`.  No solver: the extents are inputs.
    int solveMultiReaction(const DictPtr&       dict,
                           const ThermoPackage& thermo,
                           int                  verbosity,
                           scalar               F_in,
                           scalar               T,
                           scalar               T_feed,
                           scalar               P,
                           scalar               vf_in,
                           const sVector&       z);

    inline static const std::string type_ = "conversionReactor";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
