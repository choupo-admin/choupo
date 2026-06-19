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

#include "BatchStill.H"
#include "streams/Composition.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace Choupo {

void BatchStill::initialise(const DictPtr&       unitDict,
                            const ThermoPackage& thermo,
                            const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();

    auto initDict = unitDict->subDict("initial");
    state_.T = initDict->lookupScalar("T");
    state_.P = initDict->lookupScalar("P");
    state_.V = initDict->lookupScalarOrDefault("V", 0.0);
    const scalar nTot = initDict->lookupScalar("totalMoles");

    state_.n.assign(n, 0.0);
    if (nTot > 0.0)
    {
        const sVector x = readComposition(initDict, thermo,
            "BatchStill '" + name_ + "' init");
        for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTot * x[i];
    }
    // else: vessel starts empty --- the recipe layer will charge it
    // later via chargeFrom().  Skip the composition block entirely so
    // case files for empty-receiver vessels do not need a dummy
    // composition.

    auto opDict = unitDict->subDict("operation");
    P_op_   = opDict->lookupScalar("P");
    F_vap_  = opDict->lookupScalarOrDefault("F_vap", 0.0);   // kmol/s
    if (F_vap_ < 0.0)
        throw std::runtime_error("BatchStill: F_vap must be ≥ 0 (got "
            + std::to_string(F_vap_) + " kmol/s).  Use 0 to model a"
            " still that is off until the recipe turns it on.");

    // Seed T_warm_ for the first bubble-T call.  Use the initial-T entry
    // (typical user-supplied estimate near the boiling point) so the
    // Newton starts in basin.
    T_warm_  = state_.T;
    state_.P = P_op_;                                       // sync
}

// -----------------------------------------------------------------------
//  dn_i/dt = -F_vap · y_i*(T, x)
//
//  with x = n / Σn and (T, y*) from a bubble-T call on the current x.
//  If the pot is empty (Σn ≈ 0), all derivatives are zero --- nothing
//  left to vaporise.
// -----------------------------------------------------------------------
sVector BatchStill::derivatives_(const sVector& n_vec)
{
    const std::size_t n = n_vec.size();
    sVector dydt(n, 0.0);

    scalar nTot = 0.0;
    for (auto v : n_vec) nTot += std::max<scalar>(v, 0.0);
    if (nTot < 1.0e-20) return dydt;

    sVector x(n);
    for (std::size_t i = 0; i < n; ++i)
        x[i] = std::max<scalar>(n_vec[i], 0.0) / nTot;

    auto r = BubblePoint::compute(*thermo_, x, P_op_, T_warm_);
    if (!r.converged)
        throw std::runtime_error("BatchStill: bubble-T failed to converge"
            " (T_seed = " + std::to_string(T_warm_) + " K, |f| = "
            + std::to_string(r.residual) + ")");

    T_warm_ = r.T;  // update warm seed for the next call --- T changes
                    // smoothly with composition, so the previous answer
                    // is an excellent guess.

    for (std::size_t i = 0; i < n; ++i)
        dydt[i] = -F_vap_ * r.y[i];

    return dydt;
}

void BatchStill::setOperationParameter(const std::string& key, scalar value)
{
    if (key == "F_vap")
    {
        if (value < 0.0)
            throw std::runtime_error("BatchStill '" + name_ + "': F_vap"
                " must be ≥ 0 (got " + std::to_string(value) + ")");
        F_vap_ = value;
        return;
    }
    if (key == "P")
    {
        if (value <= 0.0)
            throw std::runtime_error("BatchStill '" + name_ + "': P must"
                " be > 0 (got " + std::to_string(value) + ")");
        P_op_   = value;
        state_.P = value;
        return;
    }
    BatchUnitOperation::setOperationParameter(key, value);
}

void BatchStill::notifyStateChanged()
{
    // The warm bubble-T seed is no longer valid after a charge --- the
    // composition has jumped.  Re-seed from the current T (which the
    // base chargeFrom set to the molar-weighted mix).  The first
    // derivatives_ call after this will refine the seed.
    T_warm_ = state_.T;
}

void BatchStill::step(scalar /*t*/, scalar dt)
{
    const std::size_t n = state_.n.size();
    sVector y0 = state_.n;

    auto axpy = [](const sVector& x, scalar a, const sVector& y) {
        sVector r(x.size());
        for (std::size_t i = 0; i < x.size(); ++i) r[i] = x[i] + a * y[i];
        return r;
    };

    auto k1 = derivatives_(y0);
    auto k2 = derivatives_(axpy(y0, 0.5 * dt, k1));
    auto k3 = derivatives_(axpy(y0, 0.5 * dt, k2));
    auto k4 = derivatives_(axpy(y0,       dt, k3));

    for (std::size_t i = 0; i < n; ++i)
        y0[i] += dt / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);

    // Capture the vapour removed this step (n_before - n_after >= 0) into the
    // buffer, so a `dischargeTo` receiver can collect the condensed distillate
    //.  state_.n still holds the pre-step values here.
    if (vapourBuf_.size() != n) vapourBuf_.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar removed = state_.n[i] - std::max<scalar>(y0[i], 0.0);
        if (removed > 0.0) vapourBuf_[i] += removed;
    }

    for (std::size_t i = 0; i < n; ++i)
        state_.n[i] = std::max<scalar>(y0[i], 0.0);

    // Refresh the recorded T (one final bubble-T call --- cheap, makes
    // the trajectory CSV report the current pot temperature).
    scalar nTot = 0.0;
    for (auto v : state_.n) nTot += v;
    if (nTot > 1.0e-20)
    {
        sVector x(n);
        for (std::size_t i = 0; i < n; ++i) x[i] = state_.n[i] / nTot;
        auto r = BubblePoint::compute(*thermo_, x, P_op_, T_warm_);
        if (r.converged) { state_.T = r.T; T_warm_ = r.T; }
    }
}

BatchState BatchStill::takeContinuousDischarge()
{
    const std::size_t n = state_.n.size();
    if (vapourBuf_.size() != n) vapourBuf_.assign(n, 0.0);
    BatchState out;
    out.n = vapourBuf_;          // the condensed distillate accumulated so far
    out.T = state_.T;            // ~ the vapour/pot temperature
    out.P = P_op_;
    std::fill(vapourBuf_.begin(), vapourBuf_.end(), 0.0);   // hand it off
    return out;
}

} // namespace Choupo
