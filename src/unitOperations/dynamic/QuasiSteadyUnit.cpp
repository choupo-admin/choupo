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

#include "unitOperations/dynamic/QuasiSteadyUnit.H"
#include "unitOperations/flowsheet/UnitInputs.H"
#include "streams/Composition.H"

#include <cmath>
#include <map>
#include <memory>
#include <iostream>
#include <stdexcept>

namespace Choupo {

void QuasiSteadyUnit::initialise(const DictPtr&        unitDict,
                                 const ThermoPackage&  thermo,
                                 const DictPtr&        reactionsDict)
{
    thermo_    = &thermo;
    reactions_ = reactionsDict;
    const std::string ctx = "quasiSteady '" + name_ + "'";

    if (!unitDict->found("unit"))
        throw std::runtime_error(ctx + ": no `unit { type <steadyType>; ... }`"
            " block -- the adapter wraps a steady unit and has none to wrap");
    auto inner = unitDict->subDict("unit");
    if (!inner->found("type"))
        throw std::runtime_error(ctx + ": its `unit {}` block declares no"
            " `type` -- name the steady unit it wraps (e.g. spiralWoundModule)");
    innerType_ = inner->lookupWord("type");
    for (const char* k : { "in", "inputs", "outputs", "name" })
        if (inner->found(k))
            throw std::runtime_error(ctx + ": `" + std::string(k) + "` inside"
                " `unit {}` -- the topology (in/inputs/outputs) and the name"
                " belong to the quasiSteady block itself, where the driver"
                " routes them; the inner block is the steady unit's physics");
    if (innerType_ == "quasiSteady")
        throw std::runtime_error(ctx + ": wraps another quasiSteady unit --"
            " wrap the steady unit directly");
    steady_ = UnitOperation::New(innerType_);

    if (unitDict->found("inputs"))
        inletNames_ = unitDict->lookupWordList("inputs");
    else if (unitDict->found("in"))
        inletNames_ = { unitDict->lookupWord("in") };
    if (inletNames_.empty())
        throw std::runtime_error(ctx + ": declares no inlet (`in <stream>;`"
            " or `inputs ( ... );`)");
    if (!unitDict->found("outputs"))
        throw std::runtime_error(ctx + ": declares no `outputs ( ... );` --"
            " the wrapped unit's produced streams bind to them in order");
    outletNames_ = unitDict->lookupWordList("outputs");

    //  The steady declaration, carrying the adapter's name and topology so
    //  buildAugmentedDict reads it exactly as the steady flowsheet would.
    spec_ = std::make_shared<Dictionary>(name_);
    for (const auto& key : inner->keys())
        spec_->insert(key, inner->entryValue(key));
    spec_->insert("name", EntryValue(name_));
    if (inletNames_.size() == 1)
        spec_->insert("in", EntryValue(inletNames_.front()));
    else
        spec_->insert("inputs", EntryValue(inletNames_));
    spec_->insert("outputs", EntryValue(outletNames_));

    //  The t = 0 inlets, one per declared stream, materialised by the driver
    //  from the stream files `0/<stream>`.  A routed inlet's file is its
    //  starting value only; the router overwrites it from the first solve.
    if (!unitDict->found("inlets"))
        throw std::runtime_error(ctx + ": no inlet states -- every inlet"
            " stream needs its file 0/<stream> ("
            + std::to_string(inletNames_.size()) + " declared)");
    auto faces = unitDict->subDict("inlets");
    inlets_.resize(inletNames_.size());
    for (std::size_t k = 0; k < inletNames_.size(); ++k)
    {
        if (!faces->found(inletNames_[k]))
            throw std::runtime_error(ctx + ": no state for inlet stream '"
                + inletNames_[k] + "' -- every inlet of a quasi-steady unit"
                " needs its file 0/" + inletNames_[k] + " (its t = 0 value"
                " when routed)");
        auto f = faces->subDict(inletNames_[k]);
        ContinuousStream& c = inlets_[k];
        c.F = f->lookupScalar("F");
        c.T = f->lookupScalar("T");
        c.P = f->lookupScalar("P");
        c.z = readComposition(f, thermo, ctx + " inlet '" + inletNames_[k] + "'");
    }

    std::cout << "[quasiSteady] " << name_ << " wraps the steady `"
              << innerType_ << "`: solved to steady state on its inlets at"
                 " every accepted instant.  It holds NO inventory -- nothing"
                 " accumulates in it; the loop's time constant is its"
                 " vessels'.\n";
    refresh();
    for (const auto& kv : kpis_) kpiKeys_.push_back(kv.first);
}

ProcessStream QuasiSteadyUnit::toProcess(const ContinuousStream& c,
                                         const std::string& nm) const
{
    ProcessStream s;
    s.name = nm;
    s.F = c.F;
    s.T = c.T;
    s.P = c.P;
    s.z = c.z;
    s.z.resize(thermo_->n(), 0.0);
    s.s.assign(thermo_->n(), 0.0);
    //  No phase travels on a dynamic face, so none is claimed: vf 0,
    //  UNPINNED -- the same state an undeclared steady stream carries.
    s.vf = 0.0;
    s.phasePinned = false;
    return s;
}

void QuasiSteadyUnit::setInletStreamAt(std::size_t port, const ContinuousStream& s)
{
    if (port >= inlets_.size())
        throw std::runtime_error("quasiSteady '" + name_ + "': inlet port "
            + std::to_string(port) + " does not exist ("
            + std::to_string(inlets_.size()) + " declared)");
    inlets_[port] = s;
}

void QuasiSteadyUnit::refresh()
{
    std::map<std::string, ProcessStream> streams;
    for (std::size_t k = 0; k < inletNames_.size(); ++k)
        streams[inletNames_[k]] = toProcess(inlets_[k], inletNames_[k]);

    auto augmented = buildAugmentedDict(spec_, innerType_, streams, *thermo_,
                                        nullptr, reactions_, nullptr, nullptr);
    //  The unit's own report is printed once, on the first solve; on every
    //  later instant it would be the same page with moved numbers.
    const int verbosity = (nSolves_ == 0) ? 2 : 0;
    const int rc = steady_->solve(augmented, *thermo_, verbosity);
    ++nSolves_;
    if (rc != 0)
        throw std::runtime_error("quasiSteady '" + name_ + "': the wrapped `"
            + innerType_ + "` did not solve (rc " + std::to_string(rc)
            + ") at solve " + std::to_string(nSolves_));

    const auto produced = steady_->producedStreams();
    if (produced.size() < outletNames_.size())
        throw std::runtime_error("quasiSteady '" + name_ + "': `" + innerType_
            + "` produced " + std::to_string(produced.size())
            + " stream(s) but " + std::to_string(outletNames_.size())
            + " outputs are declared");
    outlets_.resize(outletNames_.size());
    for (std::size_t k = 0; k < outletNames_.size(); ++k)
    {
        const ProcessStream& p = produced[k];
        ContinuousStream& c = outlets_[k];
        c.F = p.F;  c.T = p.T;  c.P = p.P;  c.z = p.z;
    }
    kpis_ = steady_->kpis();
}

ContinuousStream QuasiSteadyUnit::outletStreamAt(std::size_t k) const
{
    if (k >= outlets_.size())
        throw std::runtime_error("quasiSteady '" + name_ + "': outlet port "
            + std::to_string(k) + " does not exist ("
            + std::to_string(outlets_.size()) + " declared)");
    return outlets_[k];
}

BalanceSnapshot QuasiSteadyUnit::balanceSnapshot() const
{
    BalanceSnapshot bs;
    const std::size_t N = thermo_->n();
    for (std::size_t i = 0; i < N; ++i)
        bs.componentNames.push_back(thermo_->comp(i).name());
    bs.inventory.assign(N, 0.0);            // the assumption, stated as data
    auto face = [&](const ContinuousStream& c, const std::string& id,
                    BalanceFace::Direction d)
    {
        BalanceFace f;
        f.id = id;
        f.direction = d;
        f.role = BalanceFace::Role::boundary;
        f.molarFlows.assign(N, 0.0);
        for (std::size_t i = 0; i < N && i < c.z.size(); ++i)
            f.molarFlows[i] = c.F * c.z[i];
        bs.faces.push_back(std::move(f));
    };
    for (std::size_t k = 0; k < inlets_.size(); ++k)
        face(inlets_[k], name_ + "." + inletNames_[k], BalanceFace::Direction::in);
    for (std::size_t k = 0; k < outlets_.size(); ++k)
        face(outlets_[k], name_ + "." + outletNames_[k], BalanceFace::Direction::out);
    bs.materialAvailable = true;
    bs.materialReason.clear();
    bs.energyReason = "a quasi-steady `" + innerType_ + "` is priced by its own"
        " steady solve; the adapter claims no stored functional and no face"
        " enthalpy, so the dynamic first law is withheld rather than closed"
        " with a zero";
    return bs;
}

sVector QuasiSteadyUnit::stateVector() const
{
    sVector v;
    for (const auto& c : outlets_) v.push_back(c.F);
    for (const auto& k : kpiKeys_)
    {
        auto it = kpis_.find(k);
        v.push_back(it != kpis_.end() && std::isfinite(it->second) ? it->second : 0.0);
    }
    return v;
}

std::vector<std::string> QuasiSteadyUnit::stateLabels() const
{
    std::vector<std::string> l;
    for (const auto& n : outletNames_) l.push_back("F_" + n);
    for (const auto& k : kpiKeys_) l.push_back("kpi_" + k);
    return l;
}

scalar QuasiSteadyUnit::getCV(const std::string& key) const
{
    auto it = kpis_.find(key);
    if (it == kpis_.end())
        return DynamicUnitOperation::getCV(key);
    return it->second;
}

std::vector<std::string> QuasiSteadyUnit::availableCVs() const
{
    return kpiKeys_;
}

} // namespace Choupo
