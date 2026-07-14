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
#include "BatchAdsorber.H"
#include "BatchCrystalliser.H"
#include "BatchReactor.H"
#include "BatchStill.H"
#include "FixedBedAdsorber.H"

#include <algorithm>
#include <iostream>
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

    registerType("batchAdsorber",
        []() -> std::unique_ptr<BatchUnitOperation>
        { return std::make_unique<BatchAdsorber>(); });

    registerType("fixedBedAdsorber",
        []() -> std::unique_ptr<BatchUnitOperation>
        { return std::make_unique<FixedBedAdsorber>(); });
}

// -----------------------------------------------------------------------
//  Default recipe-hook implementations.  Concrete units override what
//  they need to, but for chargeFrom and dischargeAll the bookkeeping
//  is identical across reactor and still --- both vessels just hold
//  mole numbers and a temperature.
// -----------------------------------------------------------------------
scalar BatchUnitOperation::packageEnthalpy_(const BatchState& pkg, bool& ok,
                                            std::string& why) const
{
    ok = true;
    why.clear();
    const scalar nTot = pkg.totalMoles();
    if (nTot <= 0.0) return 0.0;
    if (!thermoPkg_) { ok = false; why = "no thermo package attached"; return 0.0; }
    sVector z(thermoPkg_->n(), 0.0);
    for (std::size_t i = 0; i < thermoPkg_->n() && i < pkg.n.size(); ++i)
    {
        z[i] = pkg.n[i] / nTot;
        if (z[i] > 0.0 && !thermoPkg_->hasEnthalpyDatum(i))
        {
            ok  = false;
            why = "no enthalpy datum for '"
                + thermoPkg_->comp(i).name() + "'";
            return 0.0;
        }
    }
    try
    {
        return thermoPkg_->H_stream_formation(pkg.T,
                   pkg.P > 0.0 ? pkg.P * 1.0e5 : 1.0e5, 0.0, z)
               * nTot;   // J/mol * kmol = kJ
    }
    catch (const std::exception& ex)
    {
        ok  = false;
        why = std::string("enthalpy evaluation failed: ") + ex.what();
        return 0.0;
    }
}

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

    // Enthalpies BEFORE the merge (each package at its own T) -- the mix
    // temperature must satisfy H(n1+n2, T_mix) = H1 + H2 on the elements
    // datum: charging is a material act, never a thermal one (phase (b),
    // forum #98.3-1).
    bool okSelf = true, okSrc = true;
    std::string whySelf, whySrc;
    const scalar Hself = packageEnthalpy_(s,   okSelf, whySelf);
    const scalar Hsrc  = packageEnthalpy_(src, okSrc,  whySrc);

    for (std::size_t i = 0; i < src.n.size(); ++i) s.n[i] += src.n[i];

    if (nThis <= 0.0)
    {
        // Empty receiver inherits the source's state EXACTLY (T carries
        // the package's enthalpy by construction; P/V are geometric).
        if (nSrc > 0.0) s.T = src.T;
        if (src.P > 0.0) s.P = src.P;
        if (src.V > 0.0) s.V = src.V;
        notifyStateChanged();
        return;
    }
    if (nSrc <= 0.0) { notifyStateChanged(); return; }

    // Non-trivial mix.  H-EQUALITY when both sides price; otherwise fall
    // back to the molar-T average, ANNOUNCED and recorded -- the campaign
    // energy balance goes unavailable naming this exact occasion, so the
    // approximation never hides inside a closed balance.
    const scalar Tavg = (nThis * s.T + nSrc * src.T) / nNew;
    bool solved = false;
    if (okSelf && okSrc)
    {
        const scalar Htarget = Hself + Hsrc;
        scalar T = Tavg;                       // warm start
        for (int it = 0; it < 50; ++it)
        {
            BatchState mix;                    // the merged inventory at T
            mix.n = s.n; mix.T = T; mix.P = s.P;
            bool okMix = true; std::string whyMix;
            const scalar H = packageEnthalpy_(mix, okMix, whyMix);
            if (!okMix) { whySelf = whyMix; break; }
            const scalar res = H - Htarget;    // kJ
            // Convergence: enthalpy residual below round-off of the
            // target, or a sub-microkelvin update.
            if (std::abs(res) <= 1.0e-9 * std::max(std::abs(Htarget), 1.0))
            {
                s.T = T; solved = true; break;
            }
            const scalar dT = std::max(1.0e-4, 1.0e-7 * T);
            mix.T = T + dT;
            const scalar Hp = packageEnthalpy_(mix, okMix, whyMix);
            if (!okMix || Hp == H) { whySelf = whyMix.empty()
                ? "flat dH/dT in the mix-T solve" : whyMix; break; }
            const scalar step = -res * dT / (Hp - H);
            T += step;
            if (std::abs(step) < 1.0e-7)
            {
                s.T = T; solved = true; break;
            }
        }
        if (!solved && whySelf.empty() && whySrc.empty())
            whySelf = "mix-T Newton did not converge in 50 iterations";
    }
    if (!solved)
    {
        s.T = Tavg;
        const std::string why = !whySelf.empty() ? whySelf : whySrc;
        const std::string rec = "unit '" + name_ + "': chargeFrom fell"
            " back to the molar-T average (" + why + ")";
        // Announce + record ONCE per (unit, reason): a continuous
        // dischargeTo charges every step and the same missing datum would
        // otherwise print hundreds of identical lines.
        if (std::find(chargeFallbacks_.begin(), chargeFallbacks_.end(), rec)
            == chargeFallbacks_.end())
        {
            std::cout << "  [chargeFrom] '" << name_ << "': H-equality"
                         " unavailable (" << why << ") -- molar-T average"
                         " approximation (announced once; applies to every"
                         " such charge)\n";
            chargeFallbacks_.push_back(rec);
        }
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
