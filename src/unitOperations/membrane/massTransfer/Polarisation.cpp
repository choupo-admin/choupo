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

#include "Polarisation.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Identifiers.H"
#include "core/RegistryRefusal.H"
#include "solver/NewtonND.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/IonTransport.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace Choupo {
namespace membrane {

// ---------------------------------------------------------------------------
//  The vocabulary -- one home, read by the parser and by every refusal.
// ---------------------------------------------------------------------------
const std::vector<std::string>& suctionCorrectionWords()
{
    static const std::vector<std::string> w
        = { "GeraldesAfonso2006", "filmTheory", "none" };
    return w;
}

const std::vector<std::string>& ionCouplingWords()
{
    static const std::vector<std::string> w = { "electroneutral", "none" };
    return w;
}

const std::string& word(SuctionCorrection s)
{
    switch (s)
    {
        case SuctionCorrection::GeraldesAfonso2006: return suctionCorrectionWords()[0];
        case SuctionCorrection::FilmTheory:         return suctionCorrectionWords()[1];
        default:                                    return suctionCorrectionWords()[2];
    }
}

const std::string& word(IonCoupling c)
{
    return c == IonCoupling::Electroneutral ? ionCouplingWords()[0]
                                            : ionCouplingWords()[1];
}

// ---------------------------------------------------------------------------
//  Reading the policy
// ---------------------------------------------------------------------------
PolarisationPolicy readPolarisationPolicy(const DictPtr& operation)
{
    PolarisationPolicy p;

    //  The two words belong to the FILM'S POLICY, declared once whichever
    //  way k arrives.  Inside `massTransfer {}` they would only be
    //  declarable by a case that uses a correlation, and a case with a bare
    //  `k_film` -- the SDEM witnesses, deliberately intrinsic -- could never
    //  switch the coupling on.  So they are refused there, naming the block.
    if (operation->found("massTransfer"))
    {
        auto mt = operation->subDict("massTransfer");
        for (const char* key : { "suctionCorrection", "ionCoupling" })
            if (mt->found(key))
                throw std::runtime_error(
                    std::string("polarisation: `") + key + "` was declared"
                    " inside `massTransfer {}`, where it does not belong."
                    "  The policy of the film is declared ONCE, whichever"
                    " way k_film arrives (a correlation or a bare"
                    " `k_film`), in its own block beside it:\n"
                    "    polarisation { suctionCorrection GeraldesAfonso2006;"
                    " ionCoupling electroneutral; }\n"
                    "Move the word there.");
    }

    if (!operation->found("polarisation")) return p;
    auto d = operation->subDict("polarisation");

    for (const auto& key : d->keys())
        if (key != "suctionCorrection" && key != "ionCoupling")
            throw std::runtime_error(
                "polarisation {}: unknown key `" + key + "`.  Accepted keys:"
                " suctionCorrection (" + suctionCorrectionWords()[0] + " | "
                + suctionCorrectionWords()[1] + " | " + suctionCorrectionWords()[2]
                + "), ionCoupling (" + ionCouplingWords()[0] + " | "
                + ionCouplingWords()[1] + ").");

    if (d->found("suctionCorrection"))
    {
        const std::string w = d->lookupWord("suctionCorrection");
        if      (w == suctionCorrectionWords()[0]) p.suction = SuctionCorrection::GeraldesAfonso2006;
        else if (w == suctionCorrectionWords()[1]) p.suction = SuctionCorrection::FilmTheory;
        else if (w == suctionCorrectionWords()[2]) p.suction = SuctionCorrection::None;
        else
            throw std::runtime_error(registryRefusal::message(
                "polarisation suctionCorrection", w, suctionCorrectionWords(),
                "Accepted"));
        p.suctionDeclared = true;
    }
    if (d->found("ionCoupling"))
    {
        const std::string w = d->lookupWord("ionCoupling");
        if      (w == ionCouplingWords()[0]) p.coupling = IonCoupling::Electroneutral;
        else if (w == ionCouplingWords()[1]) p.coupling = IonCoupling::None;
        else
            throw std::runtime_error(registryRefusal::message(
                "polarisation ionCoupling", w, ionCouplingWords(), "Accepted"));
        p.couplingDeclared = true;
    }
    return p;
}

// ---------------------------------------------------------------------------
//  Xi_i  (Eq. 5 / Eq. 6 / 1)
// ---------------------------------------------------------------------------
scalar suctionFactor(SuctionCorrection s, scalar phi)
{
    if (s == SuctionCorrection::None) return 1.0;
    if (phi == 0.0) return 1.0;
    //  A negative phi is a numerical probe (an outer Newton's finite
    //  difference straddling J_v = 0), never an operating point: the film
    //  form is defined there and used for both corrections.
    if (s == SuctionCorrection::FilmTheory || phi < 0.0)
        return phi + phi / std::expm1(phi);                         // (6)
    //  Geraldes & Afonso, AIChE J. 52 (2006) 3353, valid for phi < 20.
    if (phi >= 20.0)
        AdvisoryLog::instance().add("extrapolation", "warning",
            "polarisation suctionCorrection GeraldesAfonso2006",
            "phi = J_v/k_c reached 20 or more; the correction of Geraldes &"
            " Afonso (2006), Eq. (5), was derived for phi < 20 and is being"
            " extrapolated -- the wall concentration beyond that band is"
            " outside the correlation's evidence");
    return phi + std::pow(1.0 + 0.26 * std::pow(phi, 1.4), -1.7);     // (5)
}

// ---------------------------------------------------------------------------
//  The kernel
// ---------------------------------------------------------------------------
namespace {

bool couplingActive(const PolarisationPolicy& policy, const std::vector<int>& z)
{
    if (policy.coupling != IonCoupling::Electroneutral) return false;
    std::size_t nIons = 0;
    for (int zi : z) if (zi != 0) ++nIons;
    return nIons >= 2;
}

std::string fmt(scalar v)
{
    char b[32];
    std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(v));
    return b;
}

} // namespace

WallSolution wallConcentrations(const PolarisationPolicy&       policy,
                                scalar                          J_v,
                                const std::vector<scalar>&      k,
                                const std::vector<scalar>&      D,
                                const std::vector<int>&         z,
                                const std::vector<scalar>&      c_b,
                                const std::vector<scalar>&      c_p,
                                scalar                          T_K,
                                const std::vector<std::string>& names)
{
    const std::size_t n = c_b.size();
    if (k.size() != n || D.size() != n || z.size() != n || c_p.size() != n
     || names.size() != n)
        throw std::logic_error("Polarisation kernel: vector sizes disagree");

    WallSolution w;
    w.k = k;
    w.phi.assign(n, 0.0);
    w.Xi.assign(n, 1.0);
    w.c_m.assign(n, 0.0);
    w.Gamma.assign(n, 0.0);

    //  Per solute: k*, the coefficient a_i = k* - J_v of C_{i,m} and the
    //  right-hand side num_i = k* C_b - J_v C_p of the interface balance
    //  (the paper's Eq. 7 with Eqs. 1, 3, 4 substituted, solved for C_m).
    std::vector<scalar> a(n), num(n);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (!(k[i] > 0.0) || !std::isfinite(k[i]))
        {
            w.ok = false;
            w.reason = "solute '" + names[i] + "': film coefficient k = "
                     + fmt(k[i]) + " m/s -- no mass transfer to the wall";
            return w;
        }
        w.phi[i] = J_v / k[i];
        w.Xi[i]  = suctionFactor(policy.suction, w.phi[i]);
        const scalar kstar = k[i] * w.Xi[i];
        a[i]   = kstar - J_v;
        num[i] = kstar * c_b[i] - J_v * c_p[i];
        if (!(a[i] > 0.0))
        {
            //  Only `suctionCorrection none` can reach this: Xi = 1 and
            //  phi >= 1 leave the uncorrected film unable to carry the
            //  solute back against the permeation.
            w.ok = false;
            w.reason = "solute '" + names[i] + "': k* - J_v = " + fmt(a[i])
                     + " m/s is not positive (phi = J_v/k = " + fmt(w.phi[i])
                     + ", suctionCorrection " + word(policy.suction) + ")."
                       "  The uncorrected impermeable-wall coefficient cannot"
                       " carry the solute back at phi >= 1; declare"
                       " `suctionCorrection filmTheory;` or"
                       " `GeraldesAfonso2006;`";
            return w;
        }
    }

    w.coupled = couplingActive(policy, z);
    if (!w.coupled)
    {
        //  Uncoupled: each solute alone, xi = 0.  This IS today's film
        //  arithmetic when the correction is filmTheory; a wall below zero
        //  is computed, not hidden, and the caller's `requireOk` refuses it
        //  on an ACCEPTED answer (a law's trial may pass through one).
        for (std::size_t i = 0; i < n; ++i) w.c_m[i] = num[i] / a[i];
    }
    else
    {
        //  Coupled: g(xi') = sum_i z_i num_i / (a_i + z_i D_i xi') = 0.
        //  Every ion needs num_i > 0 for a positive wall on the interval
        //  where all denominators are positive; a cation bounds it below,
        //  an anion above, and g runs monotonically from +inf to -inf.
        scalar L = -std::numeric_limits<scalar>::infinity();
        scalar U =  std::numeric_limits<scalar>::infinity();
        for (std::size_t i = 0; i < n; ++i)
        {
            if (z[i] == 0) continue;
            if (!(D[i] > 0.0) || !std::isfinite(D[i]))
            {
                w.ok = false;
                w.reason = "ion '" + names[i] + "': no diffusivity for the"
                           " migration term (D = " + fmt(D[i]) + ")";
                return w;
            }
            if (!(num[i] > 0.0))
            {
                w.ok = false;
                w.reason = "ion '" + names[i] + "': J_v C_p = " + fmt(J_v * c_p[i])
                         + " is not below k* C_b = " + fmt(k[i] * w.Xi[i] * c_b[i])
                         + ", so no positive wall concentration satisfies the"
                           " interface balance -- the permeate would carry"
                           " more of the ion than the film can deliver";
                return w;
            }
            const scalar bound = a[i] / (scalar(z[i]) * D[i]);   // sign of z
            if (z[i] > 0) L = std::max(L, -bound);
            else          U = std::min(U, -bound);
        }
        if (!std::isfinite(L) || !std::isfinite(U))
        {
            w.ok = false;
            w.reason = std::string("ionCoupling electroneutral: no ")
                     + (std::isfinite(L) ? "anion" : "cation")
                     + " among the solutes, so electroneutrality at the wall"
                       " cannot be imposed";
            return w;
        }

        auto g = [&](scalar x)
        {
            scalar s = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (z[i] != 0) s += scalar(z[i]) * num[i] / (a[i] + scalar(z[i]) * D[i] * x);
            return s;
        };
        auto dg = [&](scalar x)
        {
            scalar s = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (z[i] != 0)
                {
                    const scalar d = a[i] + scalar(z[i]) * D[i] * x;
                    s -= scalar(z[i] * z[i]) * D[i] * num[i] / (d * d);
                }
            return s;
        };

        //  Bisection on (L, U): g(L+) = +inf, g(U-) = -inf.
        scalar lo = L, hi = U;
        int it = 0;
        for (; it < 400; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            if (!(mid > lo && mid < hi)) break;
            if (g(mid) > 0.0) lo = mid; else hi = mid;
            if (hi - lo <= 1e-15 * (std::abs(lo) + std::abs(hi))) break;
        }
        scalar x = 0.5 * (lo + hi);
        //  Newton polish inside the bracket (a step leaving it is refused).
        for (int p = 0; p < 6; ++p)
        {
            const scalar gx = g(x), dgx = dg(x);
            if (!(dgx < 0.0)) break;
            const scalar xn = x - gx / dgx;
            if (!(xn > lo && xn < hi)) break;
            if (std::abs(xn - x) <= 1e-16 * std::abs(x)) { x = xn; break; }
            x = xn;
        }
        w.iterations = it;
        w.xiPrime = x;
        w.xi      = x * constant::R * T_K / constant::F;
        scalar q = 0.0, qa = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            w.c_m[i] = num[i] / (a[i] + scalar(z[i]) * D[i] * x);
            q  += scalar(z[i]) * w.c_m[i];
            qa += std::abs(scalar(z[i])) * w.c_m[i];
        }
        w.chargeResidual = (qa > 0.0) ? std::abs(q) / qa : 0.0;
    }

    for (std::size_t i = 0; i < n; ++i)
        w.Gamma[i] = (c_b[i] > 0.0) ? (w.c_m[i] - c_b[i]) / c_b[i] : 0.0;
    return w;
}

// ---------------------------------------------------------------------------
//  The wall with the solution-diffusion closure
// ---------------------------------------------------------------------------
WallSolution wallWithSolutionDiffusion(const PolarisationPolicy&       policy,
                                       scalar                          J_v,
                                       const std::vector<scalar>&      k,
                                       const std::vector<scalar>&      D,
                                       const std::vector<int>&         z,
                                       const std::vector<scalar>&      c_b,
                                       const std::vector<scalar>&      B,
                                       scalar                          T_K,
                                       const std::vector<std::string>& names,
                                       std::vector<scalar>&            c_p)
{
    const std::size_t n = c_b.size();
    c_p.assign(n, 0.0);
    std::vector<scalar> ratio(n, 0.0);            // B_i / (J_v + B_i)
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar phiB = J_v + B[i];
        ratio[i] = (phiB > 0.0) ? B[i] / phiB : 0.0;
    }

    //  THE SEED is the uncoupled closed form with the SAME correction: with
    //  xi = 0, C_m = k* C_b / (k* - J_v + J_v B/(J_v + B)).  Uncoupled, the
    //  residual below is affine in c_p and this seed is already its root
    //  (the check in the loop returns before any Jacobian is formed, which
    //  is how the film model of every existing golden is reproduced to
    //  round-off).  Coupled, it is the natural start of the Newton.
    {
        WallSolution w0 = wallConcentrations(policy, J_v, k, D, z, c_b, c_p, T_K, names);
        if (!w0.ok) return w0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar kstar = k[i] * w0.Xi[i];
            const scalar a     = kstar - J_v;
            const scalar cm    = kstar * c_b[i] / (a + J_v * ratio[i]);
            c_p[i] = ratio[i] * cm;
        }
    }

    scalar cScale = 0.0;
    for (scalar v : c_b) cScale = std::max(cScale, v);
    if (!(cScale > 0.0)) cScale = 1.0;

    auto residual = [&](const std::vector<scalar>& cp, std::vector<scalar>& F,
                        WallSolution& w) -> bool
    {
        w = wallConcentrations(policy, J_v, k, D, z, c_b, cp, T_K, names);
        F.assign(n, 0.0);
        if (!w.ok) return false;
        for (std::size_t i = 0; i < n; ++i)
            F[i] = (cp[i] - ratio[i] * w.c_m[i]) / cScale;
        return true;
    };
    auto normOf = [](const std::vector<scalar>& F)
    {
        scalar m = 0.0;
        for (scalar v : F) m = std::max(m, std::abs(v));
        return m;
    };

    WallSolution w;
    std::vector<scalar> F(n), Fp(n), Ft(n), cpTry(n);
    if (!residual(c_p, F, w)) return w;
    scalar fmax = normOf(F);
    for (int it = 0; it < 60; ++it)
    {
        w.iterations = it;
        if (fmax < 1e-13) return w;

        std::vector<sVector> J(n, sVector(n, 0.0));
        WallSolution wp;
        for (std::size_t c = 0; c < n; ++c)
        {
            const scalar h = 1e-7 * cScale + 1e-6 * std::abs(c_p[c]);
            cpTry = c_p; cpTry[c] += h;
            if (!residual(cpTry, Fp, wp))
            {
                w.ok = false;
                w.reason = wp.reason;
                return w;
            }
            for (std::size_t r = 0; r < n; ++r) J[r][c] = (Fp[r] - F[r]) / h;
        }
        sVector rhs(n);
        for (std::size_t i = 0; i < n; ++i) rhs[i] = -F[i];
        sVector dx;
        try { dx = solver::gaussSolve(J, rhs); }
        catch (const std::exception& e)
        {
            w.ok = false;
            w.reason = std::string("solution-diffusion closure: singular"
                                   " Jacobian (") + e.what() + ")";
            return w;
        }
        scalar lambda = 1.0;
        for (int back = 0; back < 40; ++back)
        {
            bool positive = true;
            for (std::size_t i = 0; i < n; ++i)
                if (c_p[i] + lambda * dx[i] < 0.0) { positive = false; break; }
            if (positive) break;
            lambda *= 0.5;
        }
        bool accepted = false;
        WallSolution wt;
        scalar fTry = fmax;
        for (int back = 0; back < 20; ++back)
        {
            for (std::size_t i = 0; i < n; ++i) cpTry[i] = c_p[i] + lambda * dx[i];
            if (residual(cpTry, Ft, wt))
            {
                fTry = normOf(Ft);
                if (std::isfinite(fTry) && fTry <= (1.0 - 1e-4 * lambda) * fmax)
                { accepted = true; break; }
            }
            lambda *= 0.5;
        }
        if (!accepted)
        {
            w.ok = false;
            w.reason = "solution-diffusion closure: the Newton on the permeate"
                       " composition stalled at residual " + fmt(fmax)
                     + " (iteration " + std::to_string(it) + ")";
            return w;
        }
        c_p = cpTry; F = Ft; fmax = fTry; w = wt;
    }
    w.ok = false;
    w.reason = "solution-diffusion closure: 60 Newton iterations without"
               " convergence (residual " + fmt(fmax) + ")";
    return w;
}

void requireOk(const WallSolution& w, const std::string& site)
{
    if (!w.ok)
        throw std::runtime_error(site + ": polarisation refused -- " + w.reason);
    for (std::size_t i = 0; i < w.c_m.size(); ++i)
        if (w.c_m[i] < 0.0 || !std::isfinite(w.c_m[i]))
            throw std::runtime_error(site + ": polarisation refused -- the"
                " wall concentration of solute " + std::to_string(i) + " is "
                + fmt(w.c_m[i]) + " (negative): the interface balance"
                  " J_v C_p = k* (C_b - C_m) + J_v C_m has no positive"
                  " solution here -- the permeate carries more of the solute"
                  " than the film can deliver to the wall");
}

// ---------------------------------------------------------------------------
//  Polarisation: the per-unit object
// ---------------------------------------------------------------------------
Polarisation::Polarisation(PolarisationPolicy       policy,
                           std::vector<Solute>      solutes,
                           const MassTransferModel* correlation,
                           scalar                   kConstant,
                           scalar                   T_K)
:
    policy_(policy), solutes_(std::move(solutes)), corr_(correlation),
    kConst_(kConstant), T_(T_K)
{}

std::size_t Polarisation::nIons() const
{
    std::size_t n = 0;
    for (const auto& s : solutes_) if (s.z != 0) ++n;
    return n;
}

scalar Polarisation::kFilmForD(const MassTransferContext& hyd, scalar D) const
{
    if (!corr_) return kConst_;
    MassTransferContext c = hyd;
    c.D = D;
    return corr_->kFilm(c);
}

scalar Polarisation::kFilm(const MassTransferContext& hyd, std::size_t s) const
{
    if (!corr_) return kConst_;
    const scalar D = solutes_.at(s).D;
    if (!(D > 0.0) || !std::isfinite(D))
        throw std::logic_error("Polarisation: solute '" + solutes_[s].name
            + "' reached the correlation with no diffusivity -- the builder"
              " should have resolved or refused it");
    return kFilmForD(hyd, D);
}

bool Polarisation::perSoluteK() const
{
    if (!corr_) return false;
    for (std::size_t i = 1; i < solutes_.size(); ++i)
        if (solutes_[i].D != solutes_[0].D) return true;
    return false;
}

std::vector<scalar> Polarisation::kVector(const MassTransferContext& hyd) const
{
    std::vector<scalar> k(solutes_.size());
    for (std::size_t s = 0; s < solutes_.size(); ++s) k[s] = kFilm(hyd, s);
    return k;
}

std::vector<scalar> Polarisation::DVector() const
{
    std::vector<scalar> D;
    for (const auto& s : solutes_) D.push_back(s.D);
    return D;
}

std::vector<int> Polarisation::zVector() const
{
    std::vector<int> z;
    for (const auto& s : solutes_) z.push_back(s.z);
    return z;
}

std::vector<std::string> Polarisation::nameVector() const
{
    std::vector<std::string> nm;
    for (const auto& s : solutes_) nm.push_back(s.name);
    return nm;
}

WallSolution Polarisation::wall(const MassTransferContext& hyd, scalar J_v,
                                const std::vector<scalar>& c_b,
                                const std::vector<scalar>& c_p) const
{
    return wallConcentrations(policy_, J_v, kVector(hyd), DVector(), zVector(),
                              c_b, c_p, T_, nameVector());
}

WallSolution Polarisation::wallWithSolutionDiffusion(const MassTransferContext& hyd,
                                                     scalar J_v,
                                                     const std::vector<scalar>& c_b,
                                                     const std::vector<scalar>& B,
                                                     std::vector<scalar>& c_p) const
{
    return membrane::wallWithSolutionDiffusion(policy_, J_v, kVector(hyd), DVector(),
                                               zVector(), c_b, B, T_, nameVector(), c_p);
}

// ---------------------------------------------------------------------------
//  Building it from a unit's operation block
// ---------------------------------------------------------------------------
Polarisation buildPolarisation(const DictPtr&                  operation,
                               const ThermoPackage&            thermo,
                               const std::vector<std::size_t>& soluteIdx,
                               const MassTransferModel*        correlation,
                               scalar                          kConstant,
                               scalar                          D_neutral,
                               scalar                          T_K,
                               const std::string&              unitLabel,
                               int                             verbosity)
{
    const PolarisationPolicy policy = readPolarisationPolicy(operation);
    const bool coupled = policy.coupling == IonCoupling::Electroneutral;

    std::vector<Polarisation::Solute> solutes;
    std::size_t nIons = 0;
    for (std::size_t idx : soluteIdx)
    {
        Polarisation::Solute s;
        s.name = thermo.comp(idx).name();
        //  THE COMPONENT -> SPECIES CROSSING, through the declared bridge and
        //  never through the name.  A solute with no single-master bridge (no
        //  mapping, or a salt mapping to two ions) is neutral / lumped here:
        //  it polarises as one particle with the unit's diffusivity.
        SpeciesId sp{""};
        bool ion = false;
        try
        {
            sp  = thermo.aqueousChemistry().singleMaster(ComponentId(s.name));
            s.z = electrolyte::ionCharge(sp);
            ion = (s.z != 0);
        }
        catch (const std::exception&) { s.z = 0; }
        if (ion) ++nIons;

        if (ion && (correlation != nullptr || coupled))
        {
            try
            {
                s.D = electrolyte::ionD0(sp);
                s.dOrigin = "species record D0 (" + sp.key + ")";
            }
            catch (const std::exception& e)
            {
                throw std::runtime_error(
                    "polarisation: ion '" + s.name + "' needs its own"
                    " diffusivity -- " + std::string(correlation ? "the mass-"
                    "transfer correlation prices k_c,i per ion on Sc_i = nu/D_i"
                    : "ionCoupling electroneutral carries a migration term"
                    " z_i D_i (F/RT) xi") + " -- and none is curated.  Add to"
                    " the species record (case-local constant/species/" + sp.key
                    + ".dat, or data/standards/species/) a primary-cited\n"
                    "    transport { D0 { value <m2/s>; unit m2/s; } }\n"
                    "block.  [" + e.what() + "]");
            }
        }
        else if (!ion)
        {
            s.D = D_neutral;
            s.dOrigin = "unit diffusivity";
        }
        solutes.push_back(std::move(s));
    }

    if (coupled && nIons < 2)
        throw std::runtime_error(
            "polarisation: `ionCoupling electroneutral;` needs at least two"
            " charged solutes, each a component with a single-species aqueous"
            " bridge; " + std::to_string(nIons) + " found among "
            + std::to_string(soluteIdx.size()) + " solute(s).  Feed the ions"
            " (not the salt), or declare `ionCoupling none;`.");

    //  A DEFAULT THAT IS USED IS ANNOUNCED; a declared value announces
    //  nothing, so silence keeps meaning "nothing was assumed".
    if (!policy.suctionDeclared)
    {
        const std::string msg =
            "[polarisation] suctionCorrection filmTheory ASSUMED (default):"
            " Xi_i = phi_i + phi_i/(exp(phi_i) - 1), the film model; declare"
            " `polarisation { suctionCorrection GeraldesAfonso2006; }` for the"
            " semi-empirical correction of Geraldes & Afonso (AIChE J. 52"
            " (2006) 3353), Eq. (5) of J. Membr. Sci. 300 (2007) 20";
        if (AdvisoryLog::instance().add("model", "info", unitLabel, msg)
         && verbosity >= 2)
            std::cout << "  " << msg << "\n";
    }
    if (nIons >= 2 && !policy.couplingDeclared)
    {
        const std::string msg =
            "[polarisation] ionCoupling none ASSUMED (default): the"
            " polarisation film is computed PER ION and FIELD-FREE -- "
            + std::to_string(nIons) + " charged solutes each polarise as if"
            " alone; declare `polarisation { ionCoupling electroneutral; }` to"
            " couple them by the interface potential of Geraldes & Afonso,"
            " J. Membr. Sci. 300 (2007) 20 (electroneutrality at the wall, no"
            " new parameter)";
        if (AdvisoryLog::instance().add("approximation", "warning", unitLabel, msg)
         && verbosity >= 1)
            std::cout << "  " << msg << "\n";
    }
    if (verbosity >= 2 && (policy.suctionDeclared || policy.couplingDeclared))
    {
        std::cout << "  [polarisation] suctionCorrection " << word(policy.suction)
                  << (policy.suctionDeclared ? "" : " (default)")
                  << ", ionCoupling " << word(policy.coupling)
                  << (policy.couplingDeclared ? "" : " (default)")
                  << (coupled ? " -- Geraldes & Afonso, J. Membr. Sci. 300"
                                " (2007) 20: one interface potential, per-ion"
                                " k_c,i, no film thickness" : "")
                  << "\n";
        for (const auto& s : solutes)
            if (s.z != 0 && !s.dOrigin.empty())
                std::cout << "  [polarisation]   " << s.name << " z="
                          << (s.z > 0 ? "+" : "") << s.z << "  D="
                          << fmt(s.D) << " m2/s  (" << s.dOrigin << ")\n";
    }

    return Polarisation(policy, std::move(solutes), correlation, kConstant, T_K);
}

} // namespace membrane
} // namespace Choupo
