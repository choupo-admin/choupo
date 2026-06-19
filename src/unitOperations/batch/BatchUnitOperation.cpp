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

#include "BatchUnitOperation.H"
#include "BatchAccumulator.H"
#include "BatchCrystalliser.H"
#include "BatchReactor.H"
#include "BatchStill.H"

#include <algorithm>
#include <stdexcept>

namespace Choupo {

std::map<std::string, BatchUnitOperation::Factory>& BatchUnitOperation::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void BatchUnitOperation::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<BatchUnitOperation> BatchUnitOperation::New(const std::string& type)
{
    auto it = registry().find(type);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("BatchUnitOperation::New: unknown type '" + type
            + "'.  Registered:" + (avail.empty() ? " (none yet)" : avail));
    }
    return it->second();
}

std::vector<std::string> BatchUnitOperation::availableTypes()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void BatchUnitOperation::registerBuiltins()
{
    registerType("batchReactor",
        []() -> std::unique_ptr<BatchUnitOperation>
        { return std::make_unique<BatchReactor>(); });

    registerType("batchStill",
        []() -> std::unique_ptr<BatchUnitOperation>
        { return std::make_unique<BatchStill>(); });

    registerType("batchAccumulator",
        []() -> std::unique_ptr<BatchUnitOperation>
        { return std::make_unique<BatchAccumulator>(); });

    registerType("batchCrystalliser",
        []() -> std::unique_ptr<BatchUnitOperation>
        { return std::make_unique<BatchCrystalliser>(); });
}

// -----------------------------------------------------------------------
//  Default recipe-hook implementations.  Concrete units override what
//  they need to, but for chargeFrom and dischargeAll the bookkeeping
//  is identical across reactor and still --- both vessels just hold
//  mole numbers and a temperature.
// -----------------------------------------------------------------------
void BatchUnitOperation::chargeFrom(const BatchState& src)
{
    BatchState& s = mutableState();
    const scalar nThis = s.totalMoles();
    const scalar nSrc  = src.totalMoles();
    const scalar nNew  = nThis + nSrc;

    if (s.n.size() != src.n.size())
    {
        if (s.n.empty()) s.n.assign(src.n.size(), 0.0);
        else throw std::runtime_error(
            "BatchUnitOperation::chargeFrom: component count mismatch ("
            + std::to_string(s.n.size()) + " in receiver vs "
            + std::to_string(src.n.size()) + " in source); both vessels"
            " must share the same thermo package");
    }
    for (std::size_t i = 0; i < src.n.size(); ++i) s.n[i] += src.n[i];

    if (nNew > 0.0)
    {
        // Molar-weighted temperature mix.  Approximation: assumes
        // equal Cp across species.  Adequate for pedagogy ---
        // the typical use case is charging an empty vessel, in which
        // case this reduces to "receiver inherits source's T" exactly.
        s.T = (nThis * s.T + nSrc * src.T) / nNew;
    }
    if (nThis == 0.0)
    {
        // Empty receiver inherits geometric properties from the source.
        if (src.P > 0.0) s.P = src.P;
        if (src.V > 0.0) s.V = src.V;
    }

    notifyStateChanged();
}

BatchState BatchUnitOperation::dischargeAll()
{
    BatchState& s = mutableState();
    BatchState out = s;             // copy n, T, P, V
    std::fill(s.n.begin(), s.n.end(), 0.0);
    notifyStateChanged();
    return out;
}

BatchState BatchUnitOperation::discharge(scalar fraction)
{
    if (fraction >= 1.0) return dischargeAll();
    BatchState& s = mutableState();
    BatchState out = s;             // copy T, P, V; n overwritten below
    if (fraction <= 0.0)
    {
        std::fill(out.n.begin(), out.n.end(), 0.0);
        return out;                 // nothing moved, vessel untouched
    }
    for (std::size_t i = 0; i < s.n.size(); ++i)
    {
        out.n[i] = s.n[i] * fraction;
        s.n[i]  -= out.n[i];        // vessel keeps the rest
    }
    notifyStateChanged();
    return out;
}

void BatchUnitOperation::setOperationParameter(const std::string& key,
                                               scalar /*value*/)
{
    throw std::runtime_error("BatchUnitOperation '" + name_ + "' (type "
        + type() + "): does not accept runtime parameter '" + key + "'");
}

BatchState BatchUnitOperation::takeContinuousDischarge()
{
    // Default: the unit sheds nothing.  Return an empty package shaped to
    // the vessel's component count so chargeFrom() can mix it harmlessly.
    BatchState empty;
    empty.n.assign(mutableState().n.size(), 0.0);
    return empty;
}

} // namespace Choupo
