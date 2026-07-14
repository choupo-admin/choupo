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

#include "PR.H"

#include "core/Advisory.H"
#include "thermo/ThermoAnnounce.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {
    // Peng-Robinson universal constants.
    constexpr scalar OMEGA_A = 0.45724;
    constexpr scalar OMEGA_B = 0.07780;

    // Generalised-cubic constants for PR:  ε = 1 − √2,  σ = 1 + √2.
    const scalar SQRT2 = std::sqrt(2.0);
    const scalar EPS   = 1.0 - SQRT2;       // ≈ −0.41421
    const scalar SIG   = 1.0 + SQRT2;       // ≈  2.41421
    const scalar SmE   = SIG - EPS;         // = 2√2

    scalar pr_kappa(scalar omega)
    {
        // Peng-Robinson (1976).  (PR78 high-ω refinement not applied.)
        return 0.37464 + 1.54226 * omega - 0.26992 * omega * omega;
    }

    scalar cbrt_signed(scalar x)
    {
        return (x >= 0.0) ? std::cbrt(x) : -std::cbrt(-x);
    }
}

PR::PR(const std::vector<Component>& comps,
       const std::vector<std::vector<scalar>>& kij)
  : n_(comps.size())
{
    pure_.reserve(n_);
    for (const auto& c : comps)
    {
        const scalar Tc = c.Tc();
        const scalar Pc_Pa = c.Pc() * 1.0e5;       // Pc is stored in bar
        const scalar omega = c.omega();
        if (Tc <= 0.0 || Pc_Pa <= 0.0)
            throw std::runtime_error(
                "PR: component '" + c.name() + "' is missing Tc or Pc");

        PureParams p;
        p.Tc    = Tc;
        p.a_c   = OMEGA_A * constant::R * constant::R * Tc * Tc / Pc_Pa;
        p.b     = OMEGA_B * constant::R * Tc / Pc_Pa;
        p.kappa = pr_kappa(omega);
        pure_.push_back(p);
    }

    if (kij.empty())
    {
        kij_.assign(n_, std::vector<scalar>(n_, 0.0));
    }
    else
    {
        if (kij.size() != n_ || kij[0].size() != n_)
            throw std::runtime_error("PR: kij matrix size mismatch (expected n×n)");
        kij_ = kij;
        for (std::size_t i = 0; i < n_; ++i)
        {
            kij_[i][i] = 0.0;
            for (std::size_t j = i + 1; j < n_; ++j)
                kij_[j][i] = kij_[i][j];
        }
    }
}

void PR::buildAi(scalar T,
                 std::vector<scalar>& a,
                 std::vector<scalar>& dadT) const
{
    a.assign(n_, 0.0);
    dadT.assign(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const auto& p = pure_[i];
        const scalar sqrt_Tr  = std::sqrt(T / p.Tc);
        const scalar one_plus = 1.0 + p.kappa * (1.0 - sqrt_Tr);
        const scalar alpha    = one_plus * one_plus;
        a[i] = p.a_c * alpha;

        //   da_i/dT = a_c · d(α)/dT = −a_c · κ · (1 + κ(1−√Tr)) / √(T·Tc)
        dadT[i] = -p.a_c * p.kappa * one_plus / std::sqrt(T * p.Tc);
    }
}

void PR::buildMix(scalar T, const sVector& y,
                  scalar& a_mix, scalar& dadT_mix, scalar& b_mix,
                  std::vector<scalar>* a_per_comp_out,
                  std::vector<std::vector<scalar>>* aij_out) const
{
    std::vector<scalar> a, dadT;
    buildAi(T, a, dadT);

    if (a_per_comp_out) *a_per_comp_out = a;

    b_mix = 0.0;
    for (std::size_t i = 0; i < n_; ++i) b_mix += y[i] * pure_[i].b;

    a_mix    = 0.0;
    dadT_mix = 0.0;
    std::vector<std::vector<scalar>> aij;
    if (aij_out) aij.assign(n_, std::vector<scalar>(n_, 0.0));

    for (std::size_t i = 0; i < n_; ++i)
    {
        const scalar sqrt_ai = std::sqrt(a[i]);
        for (std::size_t j = 0; j < n_; ++j)
        {
            const scalar sqrt_aj = std::sqrt(a[j]);
            const scalar one_kij = 1.0 - kij_[i][j];
            const scalar aij_val = one_kij * sqrt_ai * sqrt_aj;
            a_mix += y[i] * y[j] * aij_val;
            if (aij_out) aij[i][j] = aij_val;

            const scalar daij_dT =
                one_kij * 0.5 * ( (sqrt_aj / sqrt_ai) * dadT[i]
                                + (sqrt_ai / sqrt_aj) * dadT[j] );
            dadT_mix += y[i] * y[j] * daij_dT;
        }
    }
    if (aij_out) *aij_out = std::move(aij);
}

scalar PR::cardano_root(scalar A, scalar B, bool liquid) const
{
    // PR cubic:  Z³ − (1−B)Z² + (A − 2B − 3B²)Z − (AB − B² − B³) = 0
    const scalar p2 =  B - 1.0;
    const scalar p1 =  A - 2.0 * B - 3.0 * B * B;
    const scalar p0 =  B * B * B + B * B - A * B;

    const scalar shift = -p2 / 3.0;
    const scalar Qd = p1 - p2 * p2 / 3.0;
    const scalar Rd = (2.0 * p2 * p2 * p2) / 27.0
                    -  p1 * p2 / 3.0
                    +  p0;

    const scalar Delta = (Rd * Rd) / 4.0 + (Qd * Qd * Qd) / 27.0;

    auto pickVapourRoot = [&](std::initializer_list<scalar> roots) -> scalar
    {
        // vapour: LARGEST physical root; liquid: SMALLEST (> co-volume B).
        // One real root (supercritical / single-phase): both pick it -- the
        // caller (stability test / flash) owns the trivial-root question.
        scalar best = liquid ? 1.0e300 : -1.0e300;
        for (auto r : roots)
            if (r > B + 1.0e-12 && (liquid ? r < best : r > best)) best = r;
        if (liquid && best == 1.0e300) best = -1.0e300;   // fall through to the guard
        if (best == -1.0e300)
            for (auto r : roots)
                if (r > best) best = r;
        return best;
    };

    if (Delta > 0.0)
    {
        const scalar sqrt_Delta = std::sqrt(Delta);
        const scalar u = cbrt_signed(-Rd / 2.0 + sqrt_Delta);
        const scalar v = cbrt_signed(-Rd / 2.0 - sqrt_Delta);
        return u + v + shift;
    }
    else
    {
        const scalar r3 = std::sqrt(-(Qd * Qd * Qd) / 27.0);
        scalar arg = -Rd / (2.0 * r3);
        if (arg >  1.0) arg =  1.0;
        if (arg < -1.0) arg = -1.0;
        const scalar phi = std::acos(arg);
        const scalar two_cbrt_r3 = 2.0 * std::cbrt(r3);
        const scalar w0 = two_cbrt_r3 * std::cos(phi / 3.0);
        const scalar w1 = two_cbrt_r3 * std::cos((phi + 2.0 * M_PI) / 3.0);
        const scalar w2 = two_cbrt_r3 * std::cos((phi + 4.0 * M_PI) / 3.0);
        return pickVapourRoot({w0 + shift, w1 + shift, w2 + shift});
    }
}

scalar PR::Z(scalar T, scalar P, const sVector& y) const
{
    scalar a_mix, dadT_mix, b_mix;
    buildMix(T, y, a_mix, dadT_mix, b_mix);
    const scalar RT = constant::R * T;
    const scalar A = a_mix * P / (RT * RT);
    const scalar B = b_mix * P / RT;
    return cardano_root(A, B, false);
}

scalar PR::molarVolume(scalar T, scalar P, const sVector& y) const
{
    return Z(T, P, y) * constant::R * T / P;
}

sVector PR::phi(scalar T, scalar P, const sVector& y) const
{
    scalar a_mix, dadT_mix, b_mix;
    std::vector<scalar> a_per;
    std::vector<std::vector<scalar>> aij;
    buildMix(T, y, a_mix, dadT_mix, b_mix, &a_per, &aij);

    const scalar RT = constant::R * T;
    const scalar A = a_mix * P / (RT * RT);
    const scalar B = b_mix * P / RT;
    const scalar Zv = cardano_root(A, B, false);
    const scalar ln_ZmB   = std::log(std::max(Zv - B, 1.0e-30));
    const scalar ln_genB  = std::log((Zv + SIG * B) / (Zv + EPS * B));

    sVector lnphi(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        scalar sumA = 0.0;
        for (std::size_t j = 0; j < n_; ++j)
            sumA += y[j] * aij[i][j];

        const scalar bi_over_b = pure_[i].b / b_mix;

        lnphi[i] = bi_over_b * (Zv - 1.0)
                  - ln_ZmB
                  - (A / (SmE * B)) * (2.0 * sumA / a_mix - bi_over_b) * ln_genB;
    }
    sVector phi(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i) phi[i] = std::exp(lnphi[i]);
    return phi;
}

// phi of the LIQUID root -- the other half of the phi-phi K-value.
sVector PR::phiLiquid(scalar T, scalar P, const sVector& y) const
{
    scalar a_mix, dadT_mix, b_mix;
    std::vector<scalar> a_per;
    std::vector<std::vector<scalar>> aij;
    buildMix(T, y, a_mix, dadT_mix, b_mix, &a_per, &aij);

    const scalar RT = constant::R * T;
    const scalar A = a_mix * P / (RT * RT);
    const scalar B = b_mix * P / RT;
    const scalar Zv = cardano_root(A, B, true);
    const scalar ln_ZmB   = std::log(std::max(Zv - B, 1.0e-30));
    const scalar ln_genB  = std::log((Zv + SIG * B) / (Zv + EPS * B));

    sVector lnphi(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        scalar sumA = 0.0;
        for (std::size_t j = 0; j < n_; ++j)
            sumA += y[j] * aij[i][j];

        const scalar bi_over_b = pure_[i].b / b_mix;

        lnphi[i] = bi_over_b * (Zv - 1.0)
                  - ln_ZmB
                  - (A / (SmE * B)) * (2.0 * sumA / a_mix - bi_over_b) * ln_genB;
    }
    sVector phi(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i) phi[i] = std::exp(lnphi[i]);
    return phi;
}

scalar PR::H_residual(scalar T, scalar P, const sVector& y) const
{
    scalar a_mix, dadT_mix, b_mix;
    buildMix(T, y, a_mix, dadT_mix, b_mix);
    const scalar RT = constant::R * T;
    const scalar A = a_mix * P / (RT * RT);
    const scalar B = b_mix * P / RT;
    const scalar Zv = cardano_root(A, B, false);
    const scalar ln_genB = std::log((Zv + SIG * B) / (Zv + EPS * B));

    return RT * (Zv - 1.0)
         + (T * dadT_mix - a_mix) / (SmE * b_mix) * ln_genB;
}

scalar PR::S_residual(scalar T, scalar P, const sVector& y) const
{
    scalar a_mix, dadT_mix, b_mix;
    buildMix(T, y, a_mix, dadT_mix, b_mix);
    const scalar RT = constant::R * T;
    const scalar A = a_mix * P / (RT * RT);
    const scalar B = b_mix * P / RT;
    const scalar Zv = cardano_root(A, B, false);
    const scalar ln_genB = std::log((Zv + SIG * B) / (Zv + EPS * B));

    return constant::R * std::log(std::max(Zv - B, 1.0e-30))
         + (dadT_mix / (SmE * b_mix)) * ln_genB;
}

// --- Factory from dict block --------------------------------------------
std::unique_ptr<EquationOfState>
PR::fromDict(const DictPtr& eosDict, const std::vector<Component>& comps)
{
    const std::size_t n = comps.size();
    std::vector<std::vector<scalar>> kij(n, std::vector<scalar>(n, 0.0));

    if (eosDict->found("binaryInteractions"))
    {
        for (const auto& entry : eosDict->lookupDictList("binaryInteractions"))
        {
            const std::string i_name = entry->lookupWord("i");
            const std::string j_name = entry->lookupWord("j");
            const scalar      k      = entry->lookupScalar("kij");
            std::size_t idx_i = n, idx_j = n;
            for (std::size_t k_idx = 0; k_idx < n; ++k_idx)
            {
                if (comps[k_idx].name() == i_name) idx_i = k_idx;
                if (comps[k_idx].name() == j_name) idx_j = k_idx;
            }
            if (idx_i == n || idx_j == n)
                throw std::runtime_error(
                    "PR: binaryInteractions references unknown component '"
                    + (idx_i == n ? i_name : j_name) + "'");
            kij[idx_i][idx_j] = k;
            kij[idx_j][idx_i] = k;
            // Announce the fitted constant WHERE IT IS CONSUMED, so BOTH entry
            // paths -- a propertyPackage's parameters.kijPairs record (inlined
            // by the builder) AND a legacy inline binaryInteractions list --
            // pass through this one announcement point.  The builder's own
            // line keeps only the citation (which record file).  Deduped via
            // AdvisoryLog (the package constructs the cubic once per phase).
            if (thermoAnnounce()
                && AdvisoryLog::instance().add("thermo", "info",
                       "kij(" + i_name + "," + j_name + ")",
                       "PR kij(" + i_name + "," + j_name + ") = "
                       + std::to_string(k)))
                std::cout << "[eos] kij(" << i_name << "," << j_name
                          << ") = " << k << "\n";
        }
    }

    return std::make_unique<PR>(comps, kij);
}

} // namespace Choupo
