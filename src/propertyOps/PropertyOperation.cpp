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
#include "thermo/ResolvedView.H"
#include "thermo/ThermoAnnounce.H"
#include "DataReconciliation.H"
#include "ElementCompositionOp.H"
#include "EnthalpyConcentration.H"
#include "EstimateComponent.H"
#include "Exchange.H"
#include "FitParameters.H"
#include "HeatCapacityFit.H"
#include "RateLawBench.H"
#include "FrictionBench.H"
#include "TransportBench.H"
#include "SolubilityParameter.H"
#include "HansenMixture.H"
#include "HeatTransferBench.H"
#include "BellDelawareBench.H"
#include "PetroleumCuts.H"
#include "Kinetics1D.H"
#include "Exergy.H"
#include "FlashSpec.H"
#include "ExplainProperty.H"
#include "MixingRules.H"
#include "PropertyPoint.H"
#include "PropertyScan1D.H"
#include "PropertyScan2D.H"
#include "PropertyScanTernary.H"
#include "LleTieLines.H"
#include "CatalogueLookup.H"
#include "ExtractionShortcutOp.H"
#include "PropertyScanBinary.H"
#include "PhaseEnvelope.H"
#include "PhaseSplitScan.H"
#include "PurePhaseDiagram.H"
#include "ReactionCurve.H"
#include "PsychrometricChart.H"
#include "HConsistency.H"
#include "IsothermEval.H"
#include "FreezingPoint.H"
#include "PitzerActivity.H"
#include "CompactionFit.H"
#include "PolarisationIndex.H"
#include "MembraneShortlist.H"
#include "PoreTransportBench.H"
#include "ENRTLMixedSolventOp.H"
#include "ENRTLMultiSaltOp.H"
#include "ElectrolyteFit.H"
#include "GibbsMapOp.H"
#include "ReactionGibbs.H"
#include "Ppr78Kij.H"
#include "ElectrolytePackageActivity.H"
#include "MolecularActivity.H"
#include "ScalingScan.H"
#include "Speciate.H"
#include "SteamTables.H"
#include "ReferenceEoSOp.H"
#include "ThielePellet.H"
#include "VaporPressureFit.H"
#include "VleConsistency.H"
#include "thermo/Database.H"
#include "thermo/ThermoOverride.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"

#include <map>
#include <memory>
#include <stdexcept>
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

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

DictPtr PropertyOperation::authoredV2For(const DictPtr& opDict) const
{
    if (!authoredV2_ || !opDict || !opDict->found("thermo"))
        return authoredV2_;
    //  `thermo <name>;` selects a named variant of the case's property
    //  dictionary, `thermo { ... }` is an inline (unnamed) one (C398).
    std::string variantName;
    auto frag = propertyVariants::fragmentOf(authoredV2_, opDict,
        "operation '" + opDict->lookupWordOrDefault("name", "?") + "'", variantName);
    auto merged = mergeThermoOverride(authoredV2_, frag, "op thermo{} override");
    //  The fragment's inline pair (`binaryParameters`) is read by the fit on
    //  its PRIVATE working copy (FitParameters deep-copies this system and
    //  rebuilds it every iteration), so the unread-key audit, which watches
    //  this op dict, never sees the read.  That reader is named here; any
    //  other key of the fragment stays audited.
    if (frag->found("equilibrium"))
    {
        auto e = frag->subDict("equilibrium");
        if (e->found("liquid") && e->subDict("liquid")->found("activityModel"))
            e->subDict("liquid")->subDict("activityModel")
             ->noteForeignBlock("binaryParameters");
    }
    return merged;
}

std::unique_ptr<ThermoPackage>
PropertyOperation::thermoForOp(const DictPtr& opDict) const
{
    if (!opDict->found("thermo") || !database_)
        return nullptr;
    std::string variantName;   // `thermo <name>;` (C398) or the inline block
    auto over = propertyVariants::fragmentOf(authoredV2_, opDict,
        "operation '" + opDict->lookupWordOrDefault("name", "?") + "'", variantName);

    // The override is a typed v2 FRAGMENT applied onto the case's authored
    // system -- the ONE merge (ThermoOverride.H).
    if (!authoredV2_)
        throw std::runtime_error("per-op thermo{} override: this world is"
            " builder-form and no authored v2 grammar is available to merge"
            " into -- the override cannot apply (and silently ignoring it"
            " would be a lie).");
    // The ONE typed merge: the fragment applies
    // onto the case's authored system; the anti-flat gate lives inside.
    auto v2 = mergeThermoOverride(authoredV2_, over, "op thermo{} override");

    // build() owns the v2 dispatch (native formulations assemble via buildV2;
    // the rest translate) -- one entry point, no pre-translation here.
    auto pkg = std::make_unique<ThermoPackage>(ThermoPackageBuilder::build(v2, *database_));
    //  THE VIEW OF AN INLINE `thermo {}` (review row SA-04): a named variant's
    //  view is printed once before the operations run (choupoProps main); an
    //  operation's inline fragment printed none, so its package's choices were
    //  told nowhere.  Once per operation, at verbosity >= 2, stdout only.
    const std::string opName = opDict->lookupWordOrDefault("name", "?");
    if (variantName.empty() && thermoAnnounce(2)
        && announceOnce("resolvedView:inlineOp:" + opName))
    {
        resolvedView::Choice c;
        c.system   = "system (constant/thermoPhysPropDict)";
        c.variant  = "inline thermo{} of operation '" + opName + "'";
        c.fragment = over;
        resolvedView::print(std::cout, "inline thermo{} of operation '" + opName + "'",
                            *pkg, v2, c, { "operation '" + opName + "'" });
    }
    return pkg;
}

void PropertyOperation::registerBuiltins()
{
    auto reg = [](const std::string& n, Factory f)
    {
        registerType(n, std::move(f));
    };

    reg("propertyPoint",  []{ return std::make_unique<PropertyPoint>();  });
    reg("explainProperty", []{ return std::make_unique<ExplainProperty>(); });
    reg("mixingRules",     []{ return std::make_unique<MixingRules>();     });
    reg("exergy",          []{ return std::make_unique<Exergy>();          });
    reg("flashSpec",       []{ return std::make_unique<FlashSpec>();       });
    reg("propertyScan1D", []{ return std::make_unique<PropertyScan1D>(); });
    reg("propertyScan2D", []{ return std::make_unique<PropertyScan2D>(); });
    reg("propertyScanTernary", []{ return std::make_unique<PropertyScanTernary>(); });
    reg("lleTieLines", []{ return std::make_unique<LleTieLines>(); });
    //  ONE TOOL CALL, ONE EVIDENCE CARD (DEV.md 4c C227): the catalogue asked
    //  about a pair / a compound, answered in a fixed byte budget.
    reg("pairLookup",      []{ return std::make_unique<PairLookup>();      });
    reg("componentLookup", []{ return std::make_unique<ComponentLookup>(); });
    reg("extractionShortcut", []{ return std::make_unique<ExtractionShortcutOp>(); });
    reg("propertyScanBinary",  []{ return std::make_unique<PropertyScanBinary>(); });
    //  THE ENTHALPY-CONCENTRATION LOCUS -- the first surface in the engine
    //  that publishes SATURATED-PHASE ENTHALPY against composition, with the
    //  equilibrium tie between the two curves carried explicitly on every
    //  row.  It is the data an enthalpy-concentration (Ponchon-Savarit)
    //  construction is drawn on; the construction itself is a drawing tool's.
    reg("enthalpyConcentration",
        []{ return std::make_unique<EnthalpyConcentration>(); });
    reg("purePhaseDiagram", []{ return std::make_unique<PurePhaseDiagram>(); });
    reg("phaseEnvelope",  []{ return std::make_unique<PhaseEnvelope>();  });
    reg("phaseSplitScan", []{ return std::make_unique<PhaseSplitScan>(); });
    reg("psychrometricChart", []{ return std::make_unique<PsychrometricChart>(); });
    reg("pitzerActivity", []{ return std::make_unique<PitzerActivity>(); });
    //  The ice witness: the freezing-point curve solved THROUGH SolidPhase,
    //  making the crystallising phase case-reachable for the first time.
    reg("freezingPoint", []{ return std::make_unique<FreezingPoint>(); });
    // The PHYSICAL gate of the one-enthalpy-surface contract (#106):
    // state identities (dh/dT == Cp_phase, the 298 K anchor, Kirchhoff),
    // not just loci.
    reg("hConsistency", []{ return std::make_unique<HConsistency>(); });
    reg("enrtlMixedSolvent", []{ return std::make_unique<ENRTLMixedSolventOp>(); });
    reg("enrtlMultiSalt", []{ return std::make_unique<ENRTLMultiSaltOp>(); });
    // The salt-by-salt regression of Pitzer / eNRTL parameters against
    // gamma_pm and phi (DEV.md 4c C311).
    reg("electrolyteFit", []{ return std::make_unique<ElectrolyteFit>(); });
    reg("gibbsMap", []{ return std::make_unique<GibbsMapOp>(); });
    reg("reactionGibbs", []{ return std::make_unique<ReactionGibbs>(); });
    reg("ppr78Kij",      []{ return std::make_unique<Ppr78Kij>();      });
    reg("electrolyteActivity", []{ return std::make_unique<ElectrolytePackageActivity>(); });
    reg("activityCoefficients", []{ return std::make_unique<MolecularActivity>(); });
    reg("speciate",       []{ return std::make_unique<Speciate>();       });
    reg("exchange",       []{ return std::make_unique<Exchange>();       });
    reg("steamTables",    []{ return std::make_unique<SteamTables>();    });
    reg("referenceEoS",   []{ return std::make_unique<ReferenceEoSOp>(); });
    reg("scalingScan",    []{ return std::make_unique<ScalingScan>();    });
    reg("fitParameters",  []{ return std::make_unique<FitParameters>();  });
    // A1b adsorption: evaluate a curated isotherm record on a (T,p) grid and
    // run the contract gates (Henry limit / saturation / anchor pin / unit
    // invariance).  The matching regression is fitParameters kind=isotherm.
    reg("isothermEval",   []{ return std::make_unique<IsothermEval>();   });
    reg("kinetics1D",     []{ return std::make_unique<Kinetics1D>();     });
    //  The SINGLE CATALYST PELLET: the intraparticle concentration field, the
    //  effectiveness factor and the Thiele modulus, each checked against the
    //  first-order isothermal closed form.  The physics lives in
    //  unitOperations/reactor/pellet/ -- this op is a bench over it, and the
    //  four reactors that assume eta = 1 are the intended second caller.
    reg("thielePellet",   []{ return std::make_unique<ThielePellet>();   });
    reg("reactionCurve",  []{ return std::make_unique<ReactionCurve>();  });
    reg("vleConsistency", []{ return std::make_unique<VleConsistency>(); });
    reg("vaporPressureFit", []{ return std::make_unique<VaporPressureFit>(); });
    reg("heatCapacityFit", []{ return std::make_unique<HeatCapacityFit>(); });
    reg("heatTransferBench", []{ return std::make_unique<HeatTransferBench>(); });
    reg("bellDelawareBench", []{ return std::make_unique<BellDelawareBench>(); });
    reg("frictionBench", []{ return std::make_unique<FrictionBench>(); });
    //  A TBP CURVE CUT INTO PSEUDO-COMPONENTS (DEV.md 4c C228): Tb per cut, SG by
    //  constant Watson K, then the RiaziDaubert estimator per cut; one ESTIMATE
    //  record per cut, written into the CASE.
    reg("petroleumCuts", []{ return std::make_unique<PetroleumCuts>(); });
    //  A RATE LAW WRITTEN IN THE CASE, ON THE BENCH (`type expression;` in
    //  constant/reactions; DEV.md 4c C67).  It replaced the ammonia-only
    //  bench the day the Dyson-Simon law left the engine for the case; the
    //  law's anchors are held by a gate (check_ammonia_rate), not here.
    reg("rateLawBench",     []{ return std::make_unique<RateLawBench>(); });
    reg("transportBench", []{ return std::make_unique<TransportBench>(); });
    reg("solubilityParameter", []{ return std::make_unique<SolubilityParameter>(); });
    //  WHICH SOLVENT, OR WHICH MIXTURE, for a declared target (DEV.md 4c
    //  C128): the Hansen distance along a composition sweep, with the
    //  pair's phase checked by the case's own activity model.
    reg("hansenMixture",   []{ return std::make_unique<HansenMixture>();   });
    reg("estimateComponent", []{ return std::make_unique<EstimateComponent>(); });
    reg("elementalComposition", []{ return std::make_unique<ElementCompositionOp>(); });
    reg("polarisationIndex", []{ return std::make_unique<PolarisationIndex>(); });
    //  FROM A FUNCTIONAL CLASS TO THE COMMERCIAL ELEMENTS THAT DO IT (DEV.md 4c
    //  C189 slice 5): hard filters, each survivor re-rated at the student's
    //  conditions, every criterion side by side, no score.
    reg("membraneShortlist", []{ return std::make_unique<MembraneShortlist>(); });
    //  THE DSPM-DE LAW AT IMPOSED PERMEATE FLUXES (DEV.md 4c C138 slice 2):
    //  the transport law the membrane units march, handed J_v the way
    //  NanoFiltran takes it, ion by ion.
    reg("poreTransport", []{ return std::make_unique<PoreTransportBench>(); });
    //  PLANT FLOW MEASUREMENTS RECONCILED UNDER THE NODE BALANCES, with the
    //  global and measurement tests and the posterior covariance (DEV.md 4c
    //  C121).  The weighted least squares itself is the one in
    //  streams/AnalysisReconciler; this op assembles and tests around it.
    //  THE COMPACTION BENCH (DEV.md 4c C195): Heckel, Kawakita and
    //  Ryshkewitch-Duckworth fitted to a declared dataset, the linear
    //  region declared by the case.
    reg("compactionFit", []{ return std::make_unique<CompactionFit>(); });
    reg("dataReconciliation", []{ return std::make_unique<DataReconciliation>(); });
}

} // namespace Choupo
