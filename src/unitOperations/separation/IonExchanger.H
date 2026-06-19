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
    Choupo::IonExchanger

Description
    A cation-exchange SOFTENER as a FLOWSHEET unit operation: one inlet
    (an ionic water analysis -- master ions + water), one `softened`
    outlet.  The inlet water is FULLY equilibrated with a fixed-capacity
    cation resin (Gaines-Thomas mass action), so Ca/Mg drop onto the
    resin and Na rises eq-for-eq.  The effluent is electroneutral by
    construction and is a valid speciation input for a downstream unit
    (e.g. the spiralWoundModule scaling audit -- membrane08).

    This is the FLOWSHEET twin of the `exchange` choupoProps beaker op:
    it builds the SAME SpeciationInput exchange spec (propertyOps::
    readExchange) and calls the SAME thermo/electrolyte/SpeciationSolver
    -- the physics is NOT duplicated here.

    HARDWARE in, RESULTS out (rotating-equipment honesty):

        operation
        {
            resin     SAC_Na;      // resolved by name in constant/electrolyte/resins/
            CEC       2.0 eq/L;     // capacity, overrides the resin .dat default
            bedVolume 1.5 m3;       // resin in service (optional)
            pH        solve;        // or a number (given)
        }

    A target-hardness / removal / fraction key is REFUSED -- naming an
    OUTPUT as an input is an outer-driver (sweep / optimisation) job, not
    a hardware spec.

    The softened effluent ProcessStream is the one product (vf = 0).
    KPIs: hardness_in/out_mgL_CaCO3, hardness_removal_pct, Ca/Mg_leakage,
    Na_added (mg/L + meq/L), resin loadings beta_Ca/_Mg/_Na,
    CEC_utilised_pct.  Heat of exchange dH is reported (KPI) but T is HELD
    (thermal-neutral v1) and the hold is announced (model-boundary credo).

    THIS IS NOT A BED IN SERVICE -- a non-suppressible honesty banner (the
    same fresh-resin/breakthrough text the props op prints) says so on
    every run.  Resin loading is internal KPI state, never a hidden stream
    (information follows the streams).
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <vector>

namespace Choupo {

class IonExchanger : public UnitOperation
{
public:
    IonExchanger() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return out_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "ionExchanger";

    std::vector<ProcessStream>    out_;
    std::map<std::string, scalar> kpis_;
};

} // namespace Choupo
