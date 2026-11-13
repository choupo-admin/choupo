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

#include "core/Advisory.H"
#include "core/PropertySourceLog.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"
#include "thermo/equationOfState/ReferenceFluid.H"
#include "thermo/pureFluid/PureFluidModel.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <utility>

namespace Choupo {
namespace liquidProperty {

namespace {

//  A reference equation's PureFluidModel, built once per process per
//  (equation, molar mass): the record is parsed and its check values
//  reproduced once (ReferenceFluid::load caches the record itself).
const PureFluidModel& referenceModel(const std::string& equation, scalar mw)
{
    static std::mutex m;
    static std::map<std::pair<std::string, double>, std::unique_ptr<PureFluidModel>> cache;
    std::lock_guard<std::mutex> lk(m);
    auto& slot = cache[{ equation, mw }];
    if (!slot)
    {
        const DictPtr d = Dictionary::fromString(
            "method Helmholtz;\nequation " + equation + ";\n", "<referenceEquation leaf>");
        slot = PureFluidModel::New(d, mw);
    }
    return *slot;
}

std::string fmt(const char* f, double v)
{
    char b[48];
    std::snprintf(b, sizeof b, f, v);
    return b;
}

} // namespace

PureFluidLeaf::PureFluidLeaf(const Binding& b, Kind k)
  : DensityLeaf(b), kind_(k)
{
    if (kind_ == Kind::caseSelection)
    {
        model_ = thermo_->pureFluidModel(i_);
        if (!model_)
            throw std::logic_error("PureFluidLeaf: component '" + comp().name()
                + "' has no pureFluids selection in this case");
    }
    else
    {
        if (b.recordName.empty())
            throw std::logic_error("PureFluidLeaf: a reference-equation leaf names its record");
        equation_ = b.recordName;
        model_    = &referenceModel(equation_, comp().MW());
        const auto& f = helmholtz::ReferenceFluid::load(equation_);
        uncertainty_ = f.uncertainty();
    }
    Tc_ = model_->saturationWindow().second;
}

PureFluidLeaf::~PureFluidLeaf() = default;

std::string PureFluidLeaf::id() const
{
    return kind_ == Kind::caseSelection ? "pureFluid." + model_->type()
                                        : "referenceEquation." + equation_;
}

//  THE KERNEL'S LIQUID BRANCH (PureFluidLeaf.H): one decision of the state,
//  pureFluidPhaseState's, and two answers on the vapour side of its band.
scalar PureFluidLeaf::volumeAt(scalar T, scalar P, bool asSet) const
{
    const std::string c = comp().name();
    if (T >= Tc_)
        throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
            "liquid density: " + c + " at T = " + fmt("%.6g K", T)
            + " is at or above its critical temperature (" + fmt("%.6g K", Tc_)
            + ", " + model_->densityFormulation() + "): there is no liquid to price.",
            "a temperature below the critical one");
    const PureFluidPhaseState st = pureFluidPhaseState(*model_, T, P, true);
    if (st.farAcross)
    {
        const scalar ps = model_->p_sat(T);
        if (asSet)
            throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
                "liquid density of {" + c + "}: at T = " + fmt("%.6g K", T) + " and P = "
                + fmt("%.6g Pa", P) + " pure " + c + " is a VAPOUR -- its saturation"
                " pressure there is p_sat(T) = " + fmt("%.6g Pa", ps) + " ("
                + model_->densityFormulation() + "), and a liquid exists only at or"
                " above it.  Remedy: a pressure at or above p_sat(T) (or a temperature"
                " below the boiling point at P); a unit that holds a vapour asks for the"
                " vapour's density.",
                "a pressure at or above p_sat(T)");
        //  A constituent of a MIXTURE below its own p_sat: the saturated liquid
        //  at T, the hypothetical-liquid convention of the Rackett leaves.
        std::string type, unit;
        const std::string site = PropertySourceLog::instance().current(type, unit)
                               ? type + " " + unit : std::string("no unit");
        const std::string msg = "the liquid density's leaf " + id() + " prices " + c
            + " at its SATURATED liquid at T (" + fmt("%.6g K", T) + "): in this mixture"
            " the pressure (" + fmt("%.6g Pa", P) + ") is below " + c + "'s own"
            " saturation pressure (" + fmt("%.6g Pa", ps) + "), where the pure liquid"
            " does not exist -- the hypothetical-liquid convention the record-volume"
            " leaves follow too";
        if (AdvisoryLog::instance().addAnnouncedOnce(
                "liquidDensityLeafSaturated:" + id() + ":" + site,
                "approximation", "info", "liquid density (" + site + ")", msg))
            std::cout << "  [liquid density] " << msg << "\n";
    }
    const scalar vm = model_->v_molar(T, st.pEval);
    if (!(vm > 0.0) || !std::isfinite(vm))
        throw PropertyDomainError(PropertyDomainError::Kind::invalidState,
            "liquid density: the formulation " + model_->densityFormulation()
            + " gives no finite positive molar volume for '" + c + "' at T = "
            + fmt("%.6g K", T));
    return vm;
}

scalar PureFluidLeaf::molarVolume(scalar T, scalar P) const
{
    return volumeAt(T, P, false);
}

std::string PureFluidLeaf::routeKey() const { return id(); }

int PureFluidLeaf::routeRank() const { return kind_ == Kind::caseSelection ? 1 : 2; }

std::string PureFluidLeaf::routeWords(const std::vector<std::string>&) const
{
    return kind_ == Kind::caseSelection
        ? comp().name() + " by the pure-fluid formulation " + model_->densityFormulation()
          + " (the case's selection), liquid branch at the temperature and pressure"
        : comp().name() + " by the " + model_->densityFormulation()
          + " (a record names the fluid), liquid branch at the temperature and pressure";
}

std::string PureFluidLeaf::origin() const { return "regressed"; }

std::string PureFluidLeaf::evidence() const
{
    return uncertainty_.empty() ? std::string("not quantified") : uncertainty_;
}

DensityAnswer PureFluidLeaf::evaluate(scalar T, scalar P, const sVector&) const
{
    DensityAnswer a;
    a.v = volumeAt(T, P, true);
    a.rho = (comp().MW() / 1000.0) / a.v;                      // kg/m3
    a.methodId = id();
    const bool line = pureFluidPhaseState(*model_, T, P, true).branch
                   != PureFluidPhaseBranch::oneFluid;
    const std::string what = kind_ == Kind::caseSelection
        ? "the pure-fluid formulation " + model_->densityFormulation()
        : "the " + model_->densityFormulation() + " of " + comp().name()
          + " (taken because a record names the fluid)";
    a.label = "property kernel: " + what
            + (line ? ", liquid branch at the temperature and pressure; at or"
                      " below the saturation pressure, the saturated liquid at T"
                    : " at the temperature and pressure (no saturation line"
                      " at this temperature: one fluid)");
    a.leaves.push_back({ comp().name(), id(), 1.0 });
    a.pressureApplied  = true;
    a.quality.origin   = origin();
    a.quality.provenance = kind_ == Kind::caseSelection
        ? "the case's pureFluids selection (" + model_->type() + ")"
        : helmholtz::ReferenceFluid::load(equation_).citation();
    a.quality.domain   = "liquid branch below the critical temperature";
    a.quality.evidence = evidence();
    return a;
}

} // namespace liquidProperty
} // namespace Choupo
