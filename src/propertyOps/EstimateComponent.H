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
    Choupo::EstimateComponent

Description
    CREATE a pure-component property set from its molecular GROUPS, by the
    Joback group-contribution method (Joback & Reid, 1987; tabulated in
    Poling, Prausnitz & O'Connell, "The Properties of Gases and Liquids",
    5th ed.).  This is the FIRST stage of the props lifecycle --- making the
    raw materials (components) before curating mixture models or wiring a
    flowsheet.

    The student declares the groups; the method sums each group's tabulated
    contribution and the op prints the build-up (which group adds what) +
    the final estimates, so the estimate is GLASS-BOX, not a black-box
    lookup.  An optional `reference {}` block validates against known values
    (see, then trust --- estimation has error, and you see it).

    Estimated (the fields of a constant/components/<name>.dat):
        MW   Tb   Tc   Pc   Vc   omega   dHf_298(gas)   dGf_298(gas)
        Hvap(Tb)   idealGasHeatCapacity polynomial (a..d)
    omega is NOT a Joback group sum; it is derived from (Tb, Tc, Pc) by the
    Lee-Kesler acentric-factor correlation.

    Dict form:
        { name estimate_acetone;  type estimateComponent;  component acetone;
          groups ( { group CH3; count 2; } { group ketone; count 1; } );
          reference { source "NIST"; Tc 508.1 K; Pc 47.0 bar; Tb 329.2 K;
                      omega 0.307; } }      // reference optional

    PEDAGOGICAL CAVEAT (Joback's known weaknesses, stated in the output):
    poor for Tb of strongly H-bonding species (ethanol Tb off by ~14 K), and
    it gives NO Antoine / vapour-pressure parameters --- those come from a
    fit or a corresponding-states correlation, a separate step.

    SCALAR-input PSEUDO-COMPONENT path (forum Track B):
    when the selected `model` is a SCALAR-input estimator (RiaziDaubert), the
    op reads an `anchors { Tb; SG; }` block instead of `groups ( ... )` and
    produces a PETROLEUM PSEUDO-COMPONENT -- a lumped cut with no single
    molecule.  Its proposal OMITS formula/CAS (no molecule) and standardThermochemistry
    (no stoichiometric reaction); the provenance SCREAMS it is lumped/estimated
    (status ESTIMATE; lumped true; "NOT a real species").
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <string>

namespace Choupo {

class EstimateComponent : public PropertyOperation
{
public:
    EstimateComponent() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::vector<std::string> headline() const override
    { return { "Tb_K", "Tc_K", "Pc_bar", "omega" }; }

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    // The SCALAR-input pseudo-component path (RiaziDaubert): reads `anchors`,
    // produces a lumped petroleum cut .dat (no molecule, no formation chem).
    int runScalar(const DictPtr& dict, const std::string& comp,
                  class ConstantEstimator& estimator, int verbosity);

    // The POLYMER-group path (VanKrevelen): reads the repeat unit's `groups`
    // + `polymer { packing k; }`, produces a polymer{ M0; density; ... } block.
    // Output-only -- never touches critical{}/gasIdeal{}/liquidPure{}.
    int runPolymer(const DictPtr& dict, const std::string& comp,
                   class ConstantEstimator& estimator, int verbosity);

    inline static const std::string type_ = "estimateComponent";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
