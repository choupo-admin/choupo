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

#include "PropertyOperation.H"
#include "EstimateComponent.H"
#include "Exchange.H"
#include "FitParameters.H"
#include "HeatCapacityFit.H"
#include "HeatTransferBench.H"
#include "Kinetics1D.H"
#include "PropertyPoint.H"
#include "PropertyScan1D.H"
#include "PropertyScan2D.H"
#include "PropertyScanTernary.H"
#include "PropertyScanBinary.H"
#include "PurePhaseDiagram.H"
#include "PsychrometricChart.H"
#include "HConsistency.H"
#include "IsothermEval.H"
#include "PitzerActivity.H"
#include "ENRTLMixedSolventOp.H"
#include "ENRTLMultiSaltOp.H"
#include "GibbsMapOp.H"
#include "ElectrolytePackageActivity.H"
#include "MolecularActivity.H"
#include "ScalingScan.H"
#include "Speciate.H"
#include "SteamTables.H"
#include "VaporPressureFit.H"
#include "VleConsistency.H"
#include "thermo/Database.H"
#include "thermo/ThermoOverride.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, PropertyOperation::Factory>&
PropertyOperation::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void PropertyOperation::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<PropertyOperation>
PropertyOperation::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string msg = "PropertyOperation: unknown type '" + name
                        + "'.  Available types:";
        for (const auto& kv : registry()) msg += "  " + kv.first;
        throw std::runtime_error(msg);
    }
    return it->second();
}

std::vector<std::string> PropertyOperation::availableTypes()
{
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

std::unique_ptr<ThermoPackage>
PropertyOperation::thermoForOp(const DictPtr& opDict) const
{
    if (!opDict->found("thermo") || !database_)
        return nullptr;
    auto over = opDict->subDict("thermo");

    if (thermoDict_)
    {
        // FLAT world: merge — start from the global thermoPackage; the op's
        // `thermo {}` block REPLACES the model sub-dicts it names
        // (activityModel, equationOfState, vaporPressure, transport, etc.).
        // Components stay global — comparing 2 models for the same
        // components is the whole point.
        auto merged = std::make_shared<Dictionary>("thermoPackage");
        for (const auto& k : thermoDict_->keys())
            merged->insert(k, thermoDict_->entryValue(k));
        for (const auto& k : over->keys())
            merged->insert(k, over->entryValue(k));

        auto tp = std::make_unique<ThermoPackage>();
        tp->readFromDict(merged, *database_);
        return tp;
    }

    // BUILDER world (the translated manifest has propertyMethods; the flat
    // thermoDict_ is never set): a flat key merge would be silently ignored
    // -- the one honest route is the AUTHORED v2 grammar: replace the
    // formulation's own slot in a COPY of the source dict and re-translate
    // (merge in authored form, translate once -- the consolidation
    // principle).  Implemented: phiPhi `equationOfState {}` (the model
    // cross-check use).  Anything else REFUSES loudly -- never an
    // override that silently does nothing.
    if (!authoredV2_)
        throw std::runtime_error("per-op thermo{} override: this world is"
            " builder-form and no authored v2 grammar is available to merge"
            " into -- the override cannot apply (and silently ignoring it"
            " would be a lie).");
    // The ONE typed merge (Codex-ratified 2026-07-18): the fragment applies
    // onto the case's authored system; the anti-flat gate lives inside.
    auto v2 = mergeThermoOverride(authoredV2_, over, "op thermo{} override");

    // build() owns the v2 dispatch (native formulations assemble via buildV2;
    // the rest translate) -- one entry point, no pre-translation here.
    return std::make_unique<ThermoPackage>(
        ThermoPackageBuilder::build(v2, *database_));
}

void PropertyOperation::registerBuiltins()
{
    auto reg = [](const std::string& n, Factory f)
    {
        registerType(n, std::move(f));
    };

    reg("propertyPoint",  []{ return std::make_unique<PropertyPoint>();  });
    reg("propertyScan1D", []{ return std::make_unique<PropertyScan1D>(); });
    reg("propertyScan2D", []{ return std::make_unique<PropertyScan2D>(); });
    reg("propertyScanTernary", []{ return std::make_unique<PropertyScanTernary>(); });
    reg("propertyScanBinary",  []{ return std::make_unique<PropertyScanBinary>(); });
    reg("purePhaseDiagram", []{ return std::make_unique<PurePhaseDiagram>(); });
    reg("psychrometricChart", []{ return std::make_unique<PsychrometricChart>(); });
    reg("pitzerActivity", []{ return std::make_unique<PitzerActivity>(); });
    // The PHYSICAL gate of the one-enthalpy-surface contract (#106):
    // state identities (dh/dT == Cp_phase, the 298 K anchor, Kirchhoff),
    // not just loci.
    reg("hConsistency", []{ return std::make_unique<HConsistency>(); });
    reg("enrtlMixedSolvent", []{ return std::make_unique<ENRTLMixedSolventOp>(); });
    reg("enrtlMultiSalt", []{ return std::make_unique<ENRTLMultiSaltOp>(); });
    reg("gibbsMap", []{ return std::make_unique<GibbsMapOp>(); });
    reg("electrolyteActivity", []{ return std::make_unique<ElectrolytePackageActivity>(); });
    reg("activityCoefficients", []{ return std::make_unique<MolecularActivity>(); });
    reg("speciate",       []{ return std::make_unique<Speciate>();       });
    reg("exchange",       []{ return std::make_unique<Exchange>();       });
    reg("steamTables",    []{ return std::make_unique<SteamTables>();    });
    reg("scalingScan",    []{ return std::make_unique<ScalingScan>();    });
    reg("fitParameters",  []{ return std::make_unique<FitParameters>();  });
    // A1b adsorption: evaluate a curated isotherm record on a (T,p) grid and
    // run the contract gates (Henry limit / saturation / anchor pin / unit
    // invariance).  The matching regression is fitParameters kind=isotherm.
    reg("isothermEval",   []{ return std::make_unique<IsothermEval>();   });
    reg("kinetics1D",     []{ return std::make_unique<Kinetics1D>();     });
    reg("vleConsistency", []{ return std::make_unique<VleConsistency>(); });
    reg("vaporPressureFit", []{ return std::make_unique<VaporPressureFit>(); });
    reg("heatCapacityFit", []{ return std::make_unique<HeatCapacityFit>(); });
    reg("heatTransferBench", []{ return std::make_unique<HeatTransferBench>(); });
    reg("estimateComponent", []{ return std::make_unique<EstimateComponent>(); });
}

} // namespace Choupo
