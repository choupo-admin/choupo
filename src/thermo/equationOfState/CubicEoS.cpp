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

#include "CubicEoS.H"

#include "core/Advisory.H"
#include "thermo/ThermoAnnounce.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <memory>
#include <set>
#include <stdexcept>
#include <sstream>
#include <utility>

namespace Choupo {

namespace {
    // Cube root with sign preservation.
    scalar cbrt_signed(scalar x)
    {
        return (x >= 0.0) ? std::cbrt(x) : -std::cbrt(-x);
    }

    scalar sgn(scalar x) { return (x < 0.0) ? -1.0 : 1.0; }
}

CubicEoS::CubicEoS(const std::string& name, const Constants& c,
                   const std::vector<Component>& comps,
                   const std::vector<scalar>& slope,
                   const std::vector<std::vector<scalar>>& kij)
  : name_(name), c_(c), n_(comps.size())
{
    pure_.reserve(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const Component& comp = comps[i];
        const scalar Tc    = comp.Tc();
        const scalar Pc_Pa = comp.Pc() * 1.0e5;       // Pc is stored in bar
        if (Tc <= 0.0 || Pc_Pa <= 0.0)
            throw std::runtime_error(
                name_ + ": component '" + comp.name() + "' is missing Tc or Pc");

        PureParams p;
        p.Tc  = Tc;
        p.a_c = c_.omegaA * constant::R * constant::R * Tc * Tc / Pc_Pa;
        p.b   = c_.omegaB * constant::R * Tc / Pc_Pa;
        p.m   = slope.at(i);
        pure_.push_back(p);
    }

    if (kij.empty())
    {
        kij_.assign(n_, std::vector<scalar>(n_, 0.0));
    }
    else
    {
        if (kij.size() != n_ || kij[0].size() != n_)
            throw std::runtime_error(
                name_ + ": kij matrix size mismatch (expected n×n)");
        kij_ = kij;
        // Enforce symmetry and zero diagonal (defensive).
        for (std::size_t i = 0; i < n_; ++i)
        {
            kij_[i][i] = 0.0;
            for (std::size_t j = i + 1; j < n_; ++j)
                kij_[j][i] = kij_[i][j];
        }
    }
}

void CubicEoS::buildAi(scalar T, std::vector<scalar>& a,
                       std::vector<scalar>& dadT,
                       std::vector<scalar>* s, std::vector<scalar>* dsdT) const
{
    a.assign(n_, 0.0);
    dadT.assign(n_, 0.0);
    if (s)    s->assign(n_, 0.0);
    if (dsdT) dsdT->assign(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const auto& p = pure_[i];
        const scalar sqrt_Tr  = std::sqrt(T / p.Tc);
        const scalar one_plus = 1.0 + p.m * (1.0 - sqrt_Tr);
        const scalar alpha    = one_plus * one_plus;
        a[i] = p.a_c * alpha;

        //   da_i/dT  =  a_c · dα/dT
        //   dα/dT    =  2·(1 + m·(1 − √Tr)) · (−m / (2·√(T·Tc)))
        //            =  −m · (1 + m·(1 − √Tr)) / √(T·Tc)
        dadT[i] = -p.a_c * p.m * one_plus / std::sqrt(T * p.Tc);

        //   the SIGNED root s_i = √a_c·(1 + m(1 − √Tr)), |s_i| = √a_i, and
        //   ds_i/dT = −√a_c · m / (2·√(T·Tc))  -- finite where a_i = 0.
        if (s)    (*s)[i]    = std::sqrt(p.a_c) * one_plus;
        if (dsdT) (*dsdT)[i] = -std::sqrt(p.a_c) * p.m
                               / (2.0 * std::sqrt(T * p.Tc));
    }
}

void CubicEoS::buildMix(scalar T, const sVector& y,
                        scalar& a_mix, scalar& dadT_mix, scalar& b_mix,
                        std::vector<std::vector<scalar>>* aij_out) const
{
    std::vector<scalar> a, dadT, s, dsdT;
    buildAi(T, a, dadT, &s, &dsdT);

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

            // d(|s_i|·|s_j|)/dT = sgn(s_i)·s_i'·|s_j| + |s_i|·sgn(s_j)·s_j'
            // (header: the old ½(√(a_j/a_i)a_i' + ...) form was 0/0 at a_i = 0).
            const scalar daij_dT =
                one_kij * ( sgn(s[i]) * dsdT[i] * sqrt_aj
                          + sqrt_ai * sgn(s[j]) * dsdT[j] );
            dadT_mix += y[i] * y[j] * daij_dT;
        }
    }
    if (aij_out) *aij_out = std::move(aij);
}

bool CubicEoS::mixingLedger(scalar T, const sVector& y, MixingLedger& out) const
{
    std::vector<scalar> dadT;
    buildAi(T, out.a, dadT);
    out.b.resize(n_);
    for (std::size_t i = 0; i < n_; ++i) out.b[i] = pure_[i].b;
    out.kij = kij_;
    buildMix(T, y, out.a_mix, out.dadT_mix, out.b_mix);
    return true;
}

// ---------------------------------------------------------------------------
//  THE ROOT PICKER (header: "THE ROOT PICKER").
// ---------------------------------------------------------------------------
CubicEoS::Root CubicEoS::pickRoot(scalar A, scalar B, scalar eps, scalar sig,
                                  bool liquid)
{
    // Z³ + c2 Z² + c1 Z + c0 = 0 for the generic (ε, σ) cubic.
    const scalar es = eps * sig;
    const scalar ep = eps + sig;
    const scalar c2 = (ep - 1.0) * B - 1.0;
    const scalar c1 = es * B * B - ep * (B * B + B) + A;
    const scalar c0 = -(es * (B * B * B + B * B) + A * B);

    auto f  = [&](scalar Z) { return ((Z + c2) * Z + c1) * Z + c0; };
    auto fp = [&](scalar Z) { return (3.0 * Z + 2.0 * c2) * Z + c1; };

    //  At most two Newton steps on f(Z), each kept only when |f| falls.
    auto polish = [&](scalar Z)
    {
        for (int k = 0; k < 2; ++k)
        {
            const scalar fz = f(Z);
            const scalar d  = fp(Z);
            if (fz == 0.0 || d == 0.0 || !std::isfinite(d)) break;
            const scalar Zn = Z - fz / d;
            if (!(std::abs(f(Zn)) < std::abs(fz))) break;
            Z = Zn;
        }
        return Z;
    };

    // Depressed cubic via Z = w − c2/3 :  w³ + Q w + R = 0
    const scalar shift = -c2 / 3.0;
    const scalar Qd = c1 - c2 * c2 / 3.0;
    const scalar Rd = (2.0 * c2 * c2 * c2) / 27.0 - c1 * c2 / 3.0 + c0;
    const scalar Delta = (Rd * Rd) / 4.0 + (Qd * Qd * Qd) / 27.0;

    if (Delta <= 0.0)
    {
        // Three real roots -- trigonometric form.
        const scalar r3 = std::sqrt(-(Qd * Qd * Qd) / 27.0);
        scalar arg = (r3 > 0.0) ? -Rd / (2.0 * r3) : 0.0;
        if (arg >  1.0) arg =  1.0;
        if (arg < -1.0) arg = -1.0;
        const scalar ph = std::acos(arg);
        const scalar two_cbrt_r3 = 2.0 * std::cbrt(r3);
        const scalar roots[3] = {
            two_cbrt_r3 * std::cos(ph / 3.0) + shift,
            two_cbrt_r3 * std::cos((ph + 2.0 * M_PI) / 3.0) + shift,
            two_cbrt_r3 * std::cos((ph + 4.0 * M_PI) / 3.0) + shift };

        // vapour: LARGEST physical root; liquid: SMALLEST above the co-volume.
        scalar best = liquid ? 1.0e300 : -1.0e300;
        for (auto r : roots)
            if (r > B + 1.0e-12 && (liquid ? r < best : r > best)) best = r;
        if (liquid && best == 1.0e300) best = -1.0e300;
        if (best == -1.0e300)
            for (auto r : roots)                // every root at/below B: take
                if (r > best) best = r;         // the largest (Z ≈ B limit)
        return { polish(best), false };
    }

    // One real root.
    const scalar sqrt_Delta = std::sqrt(Delta);
    const scalar u = cbrt_signed(-Rd / 2.0 + sqrt_Delta);
    const scalar v = cbrt_signed(-Rd / 2.0 - sqrt_Delta);
    const scalar Z1 = polish(u + v + shift);

    //  WHICH SIDE IS THE ONE ROOT ON?  Not a question about f(Z) at fixed
    //  (A, B): f can be monotone in Z for a deeply subcooled LIQUID (large
    //  A), so "f has no extremum" does not mean "supercritical".  It is a
    //  question about the ISOTHERM P(v) at this T and composition, in the
    //  reduced volume u = v/b = Z/B and the reduced attraction
    //  beta = a/(b R T) = A/B.  dP/dv = 0 is
    //      g(u) = (u+eps)^2 (u+sig)^2 - beta (2u+eps+sig)(u-1)^2 = 0,
    //  i.e. beta = h(u) = (u+eps)^2 (u+sig)^2 / ((2u+eps+sig)(u-1)^2).
    //  h has one minimum on u > 1, at (u_c, beta_c) -- the critical point of
    //  this cubic (SRK: beta_c = 4.934 = Omega_a/Omega_b, u_c = 3.847).
    //    beta <= beta_c : the isotherm is monotone, no spinodal, no sides --
    //                     the one root serves both labels, unflagged.
    //    beta >  beta_c : two spinodals u_L < u_c < u_V.  One root means P is
    //                     outside the loop, so the root is LIQUID-like
    //                     (u < u_L) or VAPOUR-like (u > u_V): u_c tells which.
    const scalar es2 = eps + sig;
    auto h = [&](scalar uu)
    {
        const scalar num = (uu + eps) * (uu + eps) * (uu + sig) * (uu + sig);
        return num / ((2.0 * uu + es2) * (uu - 1.0) * (uu - 1.0));
    };
    scalar lo = 1.0 + 1.0e-9, hi = 50.0;                // golden section on h
    const scalar gr = 0.5 * (std::sqrt(5.0) - 1.0);
    scalar x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo);
    scalar h1 = h(x1), h2 = h(x2);
    for (int it = 0; it < 200 && (hi - lo) > 1.0e-12 * hi; ++it)
    {
        if (h1 < h2) { hi = x2; x2 = x1; h2 = h1; x1 = hi - gr * (hi - lo); h1 = h(x1); }
        else         { lo = x1; x1 = x2; h1 = h2; x2 = lo + gr * (hi - lo); h2 = h(x2); }
    }
    const scalar u_c    = 0.5 * (lo + hi);
    const scalar beta_c = h(u_c);
    const scalar beta   = A / B;
    if (!(beta > beta_c)) return { Z1, false };       // no spinodal: no sides

    const bool liquidLike = (Z1 / B) < u_c;
    if (liquid == liquidLike) return { Z1, false };

    //  The requested phase has no root here: the PSEUDO-ROOT is that phase's
    //  SPINODAL volume, u_L for a liquid and u_V for a vapour (the densest
    //  vapour / the lightest liquid this isotherm can hold), Z = B·u.  At
    //  the spinodal pressure it IS the vanishing root, so Z is continuous
    //  there; past it the density is held at the spinodal's.
    auto g = [&](scalar uu) { return beta - h(uu); };   // < 0 outside the loop
    scalar a0 = liquid ? 1.0 + 1.0e-12 : u_c;
    scalar b0 = liquid ? u_c : 2.0 * u_c;
    if (!liquid)
        while (g(b0) > 0.0 && b0 < 1.0e12) b0 *= 2.0;  // h grows ~ u at large u
    for (int it = 0; it < 200 && (b0 - a0) > 1.0e-14 * b0; ++it)
    {
        const scalar m = 0.5 * (a0 + b0);
        // inside the loop (between u_L and u_V) g > 0
        if ((g(m) > 0.0) == liquid) b0 = m; else a0 = m;
    }
    return { B * 0.5 * (a0 + b0), true };
}

CubicEoS::Root CubicEoS::root(scalar T, scalar P, const sVector& y, bool liquid,
                              scalar* A_out, scalar* B_out,
                              scalar* a_mix_out, scalar* dadT_out,
                              scalar* b_mix_out,
                              std::vector<std::vector<scalar>>* aij_out) const
{
    scalar a_mix, dadT_mix, b_mix;
    buildMix(T, y, a_mix, dadT_mix, b_mix, aij_out);
    const scalar RT = constant::R * T;
    const scalar A = a_mix * P / (RT * RT);
    const scalar B = b_mix * P / RT;
    if (A_out)     *A_out = A;
    if (B_out)     *B_out = B;
    if (a_mix_out) *a_mix_out = a_mix;
    if (dadT_out)  *dadT_out = dadT_mix;
    if (b_mix_out) *b_mix_out = b_mix;
    const Root r = pickRoot(A, B, c_.eps, c_.sig, liquid);
    if (r.pseudo) announcePseudo(liquid);
    return r;
}

void CubicEoS::announcePseudo(bool liquid) const
{
    const std::string key = name_ + (liquid ? " liquid" : " vapour")
                          + " pseudo-root";
    auto& log = AdvisoryLog::instance();
    if (log.passHas(key)) return;               // hot-path early exit
    const std::string msg = name_ + ": the " + (liquid ? "LIQUID" : "VAPOUR")
        + " root was asked for at a state where the cubic has no root of that"
          " kind (past the " + (liquid ? "liquid" : "vapour") + " spinodal);"
          " a PSEUDO-ROOT (that phase's spinodal volume, continuous at the"
          " spinodal) was used instead of the other phase's root.  Any"
          " K or property evaluated there is an extrapolation, not a state of"
          " that phase.";
    if (log.addAnnouncedOnce(key, "thermo", "info", key, msg)
        && thermoAnnounce())
        std::cout << "[eos] " << msg << "\n";
}

scalar CubicEoS::Z(scalar T, scalar P, const sVector& y) const
{
    return root(T, P, y, /*liquid*/false).Z;
}

scalar CubicEoS::molarVolume(scalar T, scalar P, const sVector& y) const
{
    return Z(T, P, y) * constant::R * T / P;
}

// Labelled liquid-root access (the vapour-root family above never swaps root).
scalar CubicEoS::molarVolumeLiquid(scalar T, scalar P, const sVector& y) const
{
    return root(T, P, y, /*liquid*/true).Z * constant::R * T / P;
}

bool CubicEoS::vapourRootIsPseudo(scalar T, scalar P, const sVector& y) const
{
    scalar a_mix, dadT_mix, b_mix;
    buildMix(T, y, a_mix, dadT_mix, b_mix);
    const scalar RT = constant::R * T;
    return pickRoot(a_mix * P / (RT * RT), b_mix * P / RT,
                    c_.eps, c_.sig, false).pseudo;
}

bool CubicEoS::liquidRootIsPseudo(scalar T, scalar P, const sVector& y) const
{
    scalar a_mix, dadT_mix, b_mix;
    buildMix(T, y, a_mix, dadT_mix, b_mix);
    const scalar RT = constant::R * T;
    return pickRoot(a_mix * P / (RT * RT), b_mix * P / RT,
                    c_.eps, c_.sig, true).pseudo;
}

sVector CubicEoS::phiAt(scalar T, scalar P, const sVector& y, bool liquid) const
{
    scalar A, B, a_mix, dadT_mix, b_mix;
    std::vector<std::vector<scalar>> aij;
    const scalar Zr = root(T, P, y, liquid, &A, &B, &a_mix, &dadT_mix, &b_mix,
                           &aij).Z;
    const scalar ln_ZmB = std::log(std::max(Zr - B, 1.0e-30));
    //  I·(σ − ε) = ln[(Z + σB)/(Z + εB)]
    const scalar lnI  = std::log((Zr + c_.sig * B) / (Zr + c_.eps * B));
    const scalar SmE  = c_.sig - c_.eps;

    sVector phi(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        // Σ_j y_j a_ij  --  the inner sum entering ln φ_i.
        scalar sumA = 0.0;
        for (std::size_t j = 0; j < n_; ++j)
            sumA += y[j] * aij[i][j];

        const scalar bi_over_b = pure_[i].b / b_mix;
        const scalar lnphi = bi_over_b * (Zr - 1.0)
                           - ln_ZmB
                           - (A / (SmE * B)) * (2.0 * sumA / a_mix - bi_over_b)
                             * lnI;
        phi[i] = std::exp(lnphi);
    }
    return phi;
}

sVector CubicEoS::phi(scalar T, scalar P, const sVector& y) const
{
    return phiAt(T, P, y, /*liquid*/false);
}

// phi of the LIQUID root -- the other half of the phi-phi K-value.
sVector CubicEoS::phiLiquid(scalar T, scalar P, const sVector& y) const
{
    return phiAt(T, P, y, /*liquid*/true);
}

scalar CubicEoS::H_residual(scalar T, scalar P, const sVector& y) const
{
    scalar B, a_mix, dadT_mix, b_mix;
    const scalar Zv = root(T, P, y, false, nullptr, &B, &a_mix, &dadT_mix,
                           &b_mix).Z;
    // Sandler 4th ed eq. 6.4-30, generalised cubic.
    const scalar lnI = std::log((Zv + c_.sig * B) / (Zv + c_.eps * B));
    return constant::R * T * (Zv - 1.0)
         + (T * dadT_mix - a_mix) / ((c_.sig - c_.eps) * b_mix) * lnI;
}

scalar CubicEoS::S_residual(scalar T, scalar P, const sVector& y) const
{
    scalar B, a_mix, dadT_mix, b_mix;
    const scalar Zv = root(T, P, y, false, nullptr, &B, &a_mix, &dadT_mix,
                           &b_mix).Z;
    // Sandler 4th ed eq. 6.4-31, generalised cubic.
    const scalar lnI = std::log((Zv + c_.sig * B) / (Zv + c_.eps * B));
    return constant::R * std::log(std::max(Zv - B, 1.0e-30))
         + (dadT_mix / ((c_.sig - c_.eps) * b_mix)) * lnI;
}

// --- the binaryInteractions list, shared by both cubics ---------------------
std::vector<std::vector<scalar>>
CubicEoS::readKij(const std::string& model, const DictPtr& eosDict,
                  const std::vector<Component>& comps)
{
    const std::size_t n = comps.size();
    std::vector<std::vector<scalar>> kij(n, std::vector<scalar>(n, 0.0));

    //  THE ABSENT LIST IS ANNOUNCED, not only the declared entries.  The
    //  per-entry announcement below fires once per DECLARED kij -- so a case
    //  with NO binaryInteractions block ran every pair at kij = 0 in silence,
    //  while the authoring kit promised "kij = 0, announced".  The 2026-08-23
    //  LLM benchmark (case E, natural gas on SRK) read that promise,
    //  found no line in the log, and reported the kit as overselling; the
    //  kit was right about what SHOULD happen.  kij = 0 is a legitimate
    //  predictive default, but predictive-degraded is a fact the reader
    //  needs, with the remedy named.  One line for the whole mixture, never
    //  one per pair -- N(N-1)/2 identical lines teach nothing.
    if (n > 1 && !eosDict->found("binaryInteractions"))
    {
        std::ostringstream msg;
        msg << model << ": no binaryInteractions declared -- all "
            << (n * (n - 1) / 2) << " binary pair(s) run kij = 0"
               " (predictive-degraded; curated pairs, where they exist, live"
               " in parameters/" << model << "/ and are declared via the"
               " case's binaryInteractions block)";
        if (thermoAnnounce()
            && AdvisoryLog::instance().add("thermo", "info",
                   model + " kij", msg.str()))
            std::cout << "[eos] " << msg.str() << "\n";
    }

    if (eosDict->found("binaryInteractions"))
    {
        std::set<std::pair<std::size_t, std::size_t>> declared;
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
                    model + ": binaryInteractions references unknown component '"
                    + (idx_i == n ? i_name : j_name) + "'");
            kij[idx_i][idx_j] = k;
            kij[idx_j][idx_i] = k;
            declared.insert({ std::min(idx_i, idx_j),
                              std::max(idx_i, idx_j) });
            // Announce the fitted constant WHERE IT IS CONSUMED, so BOTH entry
            // paths -- a propertyPackage's parameters.kijPairs record (inlined
            // by the builder) AND a legacy inline binaryInteractions list --
            // pass through this one announcement point.  The builder's own
            // line keeps only the citation (which record file).  Deduped via
            // AdvisoryLog (the package constructs the cubic once per phase).
            if (thermoAnnounce()
                && AdvisoryLog::instance().add("thermo", "info",
                       "kij(" + i_name + "," + j_name + ")",
                       model + " kij(" + i_name + "," + j_name + ") = "
                       + std::to_string(k)))
                std::cout << "[eos] kij(" << i_name << "," << j_name
                          << ") = " << k << "\n";
        }

        //  A PARTIALLY declared block: the absent-block line above cannot
        //  fire, yet the pairs the block does not name run kij = 0 exactly
        //  as silently as the all-absent case did before 2026-08-23.  Same
        //  aggregate posture -- one line for the mixture, never one per pair.
        const std::size_t all = n * (n - 1) / 2;
        if (declared.size() < all)
        {
            std::ostringstream msg;
            msg << model << ": " << (all - declared.size()) << " of " << all
                << " binary pair(s) undeclared -- those pairs run kij = 0"
                   " (predictive-degraded; curated pairs, where they exist,"
                   " live in parameters/" << model << "/)";
            if (thermoAnnounce()
                && AdvisoryLog::instance().add("thermo", "info",
                       model + " kij coverage", msg.str()))
                std::cout << "[eos] " << msg.str() << "\n";
        }
    }
    return kij;
}

} // namespace Choupo
