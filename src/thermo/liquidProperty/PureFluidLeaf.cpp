/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "PureFluidLeaf.H"

#include "thermo/PropertyDomainError.H"
#include "thermo/ThermoPackage.H"
#include "thermo/pureFluid/PureFluidModel.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {
namespace liquidProperty {

PureFluidLeaf::PureFluidLeaf(const Binding& b, Kind k)
  : DensityLeaf(b), kind_(k)
{
    if (kind_ == Kind::caseSelection)
    {
        model_ = thermo_->pureFluidModel(i_);
        if (!model_)
            throw std::logic_error("PureFluidLeaf: component '" + comp().name()
                + "' has no pureFluids selection in this case");
        return;
    }
    throw std::logic_error("PureFluidLeaf: the reference-equation leaf is not built yet");
}

PureFluidLeaf::~PureFluidLeaf() = default;

std::string PureFluidLeaf::id() const
{
    return "pureFluid." + model_->type();
}

//  SLICE-0 BEHAVIOUR, kept by the wrapper of step 1: the state placed by
//  pureFluidPhaseState (the saturated liquid at or below p_sat), as
//  ThermoPackage::density's pure-fluid branch evaluates it.
scalar PureFluidLeaf::volumeAt(scalar T, scalar P, bool) const
{
    const PureFluidPhaseState st = pureFluidPhaseState(*model_, T, P, true);
    const scalar vm = model_->v_molar(T, st.pEval);
    if (!(vm > 0.0) || !std::isfinite(vm))
        throw PropertyDomainError(PropertyDomainError::Kind::invalidState,
            "liquid density: the pure-fluid formulation " + model_->densityFormulation()
            + " gives no finite positive molar volume for '" + comp().name() + "'");
    return vm;
}

scalar PureFluidLeaf::molarVolume(scalar T, scalar P) const
{
    return volumeAt(T, P, false);
}

std::string PureFluidLeaf::routeKey() const { return id(); }

int PureFluidLeaf::routeRank() const { return 1; }

std::string PureFluidLeaf::routeWords(const std::vector<std::string>&) const
{
    return comp().name() + " by the pure-fluid formulation " + model_->densityFormulation()
         + " (the case's selection), liquid branch at the temperature and pressure";
}

std::string PureFluidLeaf::origin() const { return "regressed"; }

std::string PureFluidLeaf::evidence() const { return "not quantified"; }

DensityAnswer PureFluidLeaf::evaluate(scalar T, scalar P, const sVector&) const
{
    DensityAnswer a;
    const PureFluidPhaseState st = pureFluidPhaseState(*model_, T, P, true);
    //  The package's own branch, called through it, so the one-constituent
    //  set equals `ThermoPackage::density` to the last bit (and announces
    //  as it does).
    sVector z(thermo_->n(), 0.0);
    z[i_] = 1.0;
    a.rho = thermo_->density(T, P, z, DensityPhase::Liquid);
    a.v   = (comp().MW() / 1000.0) / a.rho;
    a.methodId = id();
    const bool line = st.branch != PureFluidPhaseBranch::oneFluid;
    a.label = "property kernel: the pure-fluid formulation "
            + model_->densityFormulation()
            + (line ? ", liquid branch at the temperature and pressure; at or"
                      " below the saturation pressure, the saturated liquid at T"
                    : " at the temperature and pressure (no saturation line"
                      " at this temperature: one fluid)");
    a.leaves.push_back({ comp().name(), id(), 1.0 });
    a.pressureApplied  = true;
    a.quality.origin   = origin();
    a.quality.provenance = "the case's pureFluids selection (" + model_->type() + ")";
    a.quality.domain   = "not declared";
    a.quality.evidence = evidence();
    return a;
}

} // namespace liquidProperty
} // namespace Choupo
