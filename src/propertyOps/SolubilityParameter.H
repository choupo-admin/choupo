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
    Choupo::SolubilityParameter

Description
    The Hildebrand solubility parameter, DERIVED and never stored, plus the
    pairwise table that is what anybody actually asks it for.

        delta = sqrt( (dHvap(T) - R T) / V_m )                    [Pa^0.5]

    the square root of the cohesive energy density: how much energy it costs
    to pull the molecules of a liquid apart, per unit volume.  Two liquids
    with similar delta mix; that is "like dissolves like" written as a number.

    WHY IT IS DERIVED.  *The tree never stores a derivative* (the arity
    doctrine).  Every input is already in the component record -- the latent
    heat at Tb, the critical temperature, the liquid molar volume -- so a
    stored delta would be a second home for a fact the record already
    determines, free to drift from it.  This op computes it, every run.

    AND THE DERIVATION IS CHECKED, which is the part worth having.  A record
    may declare `solubilityParameter` as a REFERENCE: a value some compilation
    published independently.  Where it is present the op prints the deviation
    beside the derived number.  That is the Zc-column discipline applied to a
    property: a redundant determination turns a wrong unit or a mis-typed
    exponent from a plausible number into a visible disagreement.  Measured
    over the ChemSep databank before this op existed, the derivation
    reproduces the published parameter to 0.28 % median across 408 substances
    -- so a deviation of several per cent is a finding, not noise.

    THE LATENT HEAT COMES FROM `Component::Hvap_latent`, the Watson
    correlation that already lives there and that the enthalpy legs already
    use.  A second implementation here would be the arity sin inside an op
    whose whole argument is arity.

    WHAT IT REFUSES, each by name: a component with no latent heat, no
    critical temperature, or no liquid molar volume.  None of the three can be
    guessed, and a delta computed from two of them plus an invention is a
    number that looks exactly like a measurement.

    WHAT IT IS NOT.  This is Hildebrand -- ONE number per substance, and it
    cannot express hydrogen bonding.  It will happily tell you that ethanol
    and nitromethane are a good match; a formulator knows they are not.  The
    three-parameter Hansen split (dispersion / polar / hydrogen-bonding) is
    what the coatings industry uses for exactly that reason, and it is NOT
    implemented: its parameters are a separate dataset this repository does
    not have and may not redistribute.  The op says so in its own output
    rather than letting a single number imply more than it carries.

SourceFiles
    SolubilityParameter.cpp

\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class SolubilityParameter : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::string type_ = "solubilityParameter";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
