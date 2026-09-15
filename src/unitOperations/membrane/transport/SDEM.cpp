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

#include "SDEM.H"

#include "core/Advisory.H"
#include "core/Identifiers.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "../osmotic/OsmoticModel.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace Choupo {
namespace membrane {

namespace {

//  The Nernst-Planck system (1)-(2) of the header, integrated from the wall
//  (x = 0, virtual concentrations c0) to the permeate face (x = 1) at FIXED
//  ion fluxes j_i.  Returns c(1) and the potential drop psi(1) - psi(0).
//
//  Electroneutrality of the virtual solution at every x is what makes the
//  field explicit: differentiate sum z_i c_i = 0 along x, substitute (1),
//  and dpsi/dx = -(sum z_i j_i / P_i) / (sum z_i^2 c_i) -- no parameter, one
//  algebraic consequence of the two constraints.  A fixed-step RK4 on the
//  unit interval; the integrand is smooth and the interval is one.
struct Shot
{
    std::vector<scalar> c1;
    scalar              psi;
};

Shot shoot(const std::vector<scalar>& c0, const std::vector<scalar>& j,
           const std::vector<scalar>& P, const std::vector<int>& z, int nSteps)
{
    const std::size_t n = c0.size();
    auto rhs = [&](const std::vector<scalar>& c, std::vector<scalar>& dc) -> scalar
    {
        scalar num = 0.0, den = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            num += z[i] * j[i] / P[i];
            den += scalar(z[i] * z[i]) * c[i];
        }
        const scalar dpsi = (den > 0.0) ? -num / den : 0.0;
        for (std::size_t i = 0; i < n; ++i)
            dc[i] = -j[i] / P[i] - scalar(z[i]) * c[i] * dpsi;
        return dpsi;
    };

    const scalar h = 1.0 / nSteps;
    std::vector<scalar> c = c0, k1(n), k2(n), k3(n), k4(n), tmp(n);
    scalar psi = 0.0;
    for (int s = 0; s < nSteps; ++s)
    {
        const scalar p1 = rhs(c, k1);
        for (std::size_t i = 0; i < n; ++i) tmp[i] = c[i] + 0.5 * h * k1[i];
        const scalar p2 = rhs(tmp, k2);
        for (std::size_t i = 0; i < n; ++i) tmp[i] = c[i] + 0.5 * h * k2[i];
        const scalar p3 = rhs(tmp, k3);
        for (std::size_t i = 0; i < n; ++i) tmp[i] = c[i] + h * k3[i];
        const scalar p4 = rhs(tmp, k4);
        for (std::size_t i = 0; i < n; ++i)
            c[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
        psi += h / 6.0 * (p1 + 2.0 * p2 + 2.0 * p3 + p4);
    }
    return { c, psi };
}

//  Dense Gauss elimination with partial pivoting, for the inner Newton's
//  Jacobian (a handful of ions -- the largest ionic feed in the corpus has
//  seven).  Returns false on a pivot that is numerically zero.
bool solveDense(std::vector<std::vector<scalar>> A, std::vector<scalar> b,
                std::vector<scalar>& x)
{
    const std::size_t n = b.size();
    for (std::size_t k = 0; k < n; ++k)
    {
        std::size_t piv = k;
        for (std::size_t i = k + 1; i < n; ++i)
            if (std::abs(A[i][k]) > std::abs(A[piv][k])) piv = i;
        if (std::abs(A[piv][k]) < 1e-300) return false;
        std::swap(A[k], A[piv]); std::swap(b[k], b[piv]);
        for (std::size_t i = k + 1; i < n; ++i)
        {
            const scalar f = A[i][k] / A[k][k];
            for (std::size_t c = k; c < n; ++c) A[i][c] -= f * A[k][c];
            b[i] -= f * b[k];
        }
    }
    x.assign(n, 0.0);
    for (std::size_t k = n; k-- > 0;)
    {
        scalar s = b[k];
        for (std::size_t c = k + 1; c < n; ++c) s -= A[k][c] * x[c];
        x[k] = s / A[k][k];
    }
    return true;
}

//  The inner problem at ONE station and ONE water flux: the permeate
//  composition c_p such that the shot from the wall lands on it, with the
//  permeate electroneutral.  Unknowns: the n values c_p,i.  Equations: the n-1
//  landing residuals c_i(1) = c_p,i for every ion but `drop`, plus
//  sum z_i c_p,i = 0.  The dropped residual is implied by the others when the
//  wall is electroneutral (the shot conserves charge exactly), so dropping the
//  ion carrying the most charge keeps the system square and well posed.
struct Inner
{
    std::vector<scalar> c_m, c_p;
    scalar              psi;
    bool                converged;
    int                 iterations;
    scalar              residual;
};

Inner solveInner(scalar Jw, const std::vector<scalar>& c_b, scalar k_film,
                 const std::vector<scalar>& P, const std::vector<int>& z,
                 const std::vector<scalar>& seed, int nSteps)
{
    const std::size_t n = c_b.size();
    const scalar E = std::exp(Jw / k_film);           // film factor, per ion

    scalar cScale = 0.0, zScale = 0.0;
    std::size_t drop = 0; scalar dropW = -1.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        cScale = std::max(cScale, c_b[i]);
        zScale += std::abs(scalar(z[i])) * c_b[i];
        const scalar w = std::abs(scalar(z[i])) * c_b[i];
        if (z[i] != 0 && w > dropW) { dropW = w; drop = i; }
    }
    cScale = std::max(cScale, 1e-30);
    zScale = std::max(zScale, 1e-30);

    //  c_m from the film model at this c_p: J_w (c_m - c_p) = k (c_m - c_b)
    //  => c_m = c_p + (c_b - c_p) E.  The wall follows the permeate guess.
    auto wallOf = [&](const std::vector<scalar>& cp, std::vector<scalar>& cm)
    {
        for (std::size_t i = 0; i < n; ++i)
            cm[i] = cp[i] + (c_b[i] - cp[i]) * E;
    };
    std::vector<scalar> j(n), cm(n);
    auto residual = [&](const std::vector<scalar>& cp, std::vector<scalar>& F,
                        scalar& psiOut)
    {
        wallOf(cp, cm);
        for (std::size_t i = 0; i < n; ++i) j[i] = Jw * cp[i];
        const Shot sh = shoot(cm, j, P, z, nSteps);
        F.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
            F[i] = (i == drop) ? 0.0 : (sh.c1[i] - cp[i]) / cScale;
        scalar q = 0.0;
        for (std::size_t i = 0; i < n; ++i) q += scalar(z[i]) * cp[i];
        F[drop] = q / zScale;
        psiOut = sh.psi;
    };

    Inner out;
    out.c_p = seed;
    out.c_m.assign(n, 0.0);
    out.psi = 0.0; out.converged = false; out.iterations = 0; out.residual = 0.0;

    std::vector<scalar> F(n), Fp(n), dx(n), cpTry(n);
    std::vector<std::vector<scalar>> J(n, std::vector<scalar>(n, 0.0));
    scalar psi = 0.0;
    residual(out.c_p, F, psi);
    for (int it = 0; it < 60; ++it)
    {
        scalar fmax = 0.0;
        for (scalar v : F) fmax = std::max(fmax, std::abs(v));
        out.residual = fmax; out.iterations = it; out.psi = psi;
        if (fmax < 1e-11) { out.converged = true; break; }

        //  Forward-difference Jacobian, one shot per ion.
        for (std::size_t k = 0; k < n; ++k)
        {
            const scalar h = 1e-7 * cScale + 1e-5 * std::abs(out.c_p[k]);
            cpTry = out.c_p; cpTry[k] += h;
            scalar psiTry;
            residual(cpTry, Fp, psiTry);
            for (std::size_t i = 0; i < n; ++i) J[i][k] = (Fp[i] - F[i]) / h;
        }
        std::vector<scalar> rhs(n);
        for (std::size_t i = 0; i < n; ++i) rhs[i] = -F[i];
        if (!solveDense(J, rhs, dx)) break;

        //  Damped update: a permeate concentration is never negative.
        scalar lambda = 1.0;
        for (int back = 0; back < 30; ++back)
        {
            bool ok = true;
            for (std::size_t i = 0; i < n; ++i)
            {
                cpTry[i] = out.c_p[i] + lambda * dx[i];
                if (cpTry[i] < 0.0) { ok = false; break; }
            }
            if (ok) break;
            lambda *= 0.5;
        }
        for (std::size_t i = 0; i < n; ++i)
            out.c_p[i] = std::max(out.c_p[i] + lambda * dx[i], 0.0);
        residual(out.c_p, F, psi);
    }
    wallOf(out.c_p, out.c_m);
    return out;
}

} // namespace

void SDEM::resolveOnce(const TransportContext& ctx) const
{
    if (resolved_) return;
    const ThermoPackage& thermo = ctx.thermo;
    const std::size_t Ns = ctx.soluteIdx.size();
    z_.assign(Ns, 0);

    std::size_t nIons = 0;
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const std::string nm = thermo.comp(ctx.soluteIdx[s]).name();
        //  THE COMPONENT -> SPECIES CROSSING, through the declared bridge and
        //  never through the name (the F2 contract).  A solute with no bridge
        //  has no charge the law can read.
        SpeciesId sp{""};
        try
        {
            sp = thermo.aqueousChemistry().singleMaster(ComponentId(nm));
        }
        catch (const std::exception& e)
        {
            throw std::runtime_error(
                "transport SDEM: solute '" + nm + "' declares no aqueous"
                " bridge, so the law cannot read its charge.  Add to its"
                " component record\n    aqueousMapping ( { species " + nm
                + "; nu 1; } );\n(an ion), or select `transport"
                  " solutionDiffusion;` for a feed of neutral solutes.  ["
                + e.what() + "]");
        }
        z_[s] = electrolyte::ionCharge(sp);
        if (z_[s] != 0) ++nIons;

        if (!(ctx.B_s[s] > 0.0))
            throw std::runtime_error(
                "transport SDEM: the membrane record gives solute '" + nm
                + "' no permeance (B_s absent or zero).  An impermeable ion"
                  " cannot sit in a zero-current balance: declare its B_s in"
                  " the membrane's permeabilities {} block, or select"
                  " `transport solutionDiffusion;`.");
    }
    if (nIons < 2)
        throw std::runtime_error(
            "transport SDEM: fewer than two charged solutes (" + std::to_string(nIons)
            + ") -- there is nothing for the electric field to couple."
              "  Select `transport solutionDiffusion;`.");

    //  The banner: the model, its assumptions and what it was handed --
    //  announced once, never silently (the DSPM-DE posture).
    std::cout << "  [SDEM] solution-diffusion-electromigration (Yaroshchuk,"
                 " Bruening & Licon Bernal, J. Membr. Sci. 447 (2013) 463):"
                 " Nernst-Planck on virtual concentrations, virtual-solution"
                 " electroneutrality, ZERO CURRENT -- the ions share one field;"
                 " permeances include partition; no fixed charge; ideal dilute\n"
              << "  [SDEM] per-ion permeances (the record's, unchanged):";
    for (std::size_t s = 0; s < Ns; ++s)
    {
        char b[64];
        std::snprintf(b, sizeof(b), " B=%.3e m/s", static_cast<double>(ctx.B_s[s]));
        std::cout << "  " << thermo.comp(ctx.soluteIdx[s]).name()
                  << " z=" << (z_[s] > 0 ? "+" : "") << z_[s] << b;
    }
    std::cout << "\n  [SDEM] polarisation film computed PER ION with no field"
                 " in the film (the diffusion potential exists there too):"
                 " an approximation of this version, announced\n";
    AdvisoryLog::instance().add("approximation", "warning",
        "spiralWoundModule transport SDEM",
        "polarisation film computed per ion with no electric field in the"
        " film; the zero-current coupling acts across the active layer only");
    resolved_ = true;
}

TransportSolution SDEM::localFluxes(const TransportContext& ctx) const
{
    resolveOnce(ctx);

    const ThermoPackage&            thermo    = ctx.thermo;
    const std::vector<std::size_t>& soluteIdx = ctx.soluteIdx;
    const std::vector<scalar>&      P         = ctx.B_s;
    const scalar                    A_w       = ctx.A_w;
    const scalar                    k_film    = ctx.k_film;
    const scalar                    T_K       = ctx.T_K;
    const OsmoticModel&             osm       = ctx.osm;
    const std::vector<scalar>&      c_b       = ctx.c_b;
    const std::size_t               Ns        = soluteIdx.size();
    const scalar dP = ctx.P_feed_Pa - ctx.P_perm_Pa;
    constexpr int nSteps = 40;

    TransportSolution sol;
    sol.c_m.assign(Ns, 0.0);
    sol.c_p.assign(Ns, 0.0);
    sol.J_s.assign(Ns, 0.0);
    sol.J_w = 0.0;
    if (dP <= 0.0) return sol;

    //  THE FEED MUST BE ELECTRONEUTRAL -- the law's premise (2) at the wall,
    //  and the FilmTec protocol's before any projection.  A bulk carrying a
    //  net charge is refused with the imbalance and the remedy, never
    //  absorbed into the dropped residual in silence.
    {
        scalar q = 0.0, qa = 0.0;
        for (std::size_t s = 0; s < Ns; ++s)
        {
            q  += scalar(z_[s]) * c_b[s];
            qa += std::abs(scalar(z_[s])) * c_b[s];
        }
        if (qa > 0.0 && std::abs(q) / qa > 1e-6)
        {
            char b[400];
            std::snprintf(b, sizeof(b),
                "transport SDEM: the feed at this station is not electroneutral"
                " (sum z_i c_i = %.3e of sum |z_i| c_i).  The law assumes a"
                " balanced water analysis; reconcile it first (aqueousAnalysis"
                " {} in the inlet stream), or adjust the analysis by hand.",
                static_cast<double>(q / qa));
            throw std::runtime_error(b);
        }
    }

    //  The seed for the inner Newton: the previous station's permeate, else
    //  the uncoupled solution-diffusion answer at the no-osmotic flux.
    auto seedFor = [&](scalar Jw) -> std::vector<scalar>
    {
        if (cpPrev_.size() == Ns)
        {
            bool ok = true;
            for (scalar v : cpPrev_) if (!(v >= 0.0) || !std::isfinite(v)) ok = false;
            if (ok) return cpPrev_;
        }
        std::vector<scalar> cp(Ns);
        const scalar E = std::exp(Jw / k_film);
        for (std::size_t s = 0; s < Ns; ++s)
        {
            const scalar phi = Jw + P[s];
            const scalar cm  = E * c_b[s] / (1.0 + P[s] * (E - 1.0) / phi);
            cp[s] = P[s] / phi * cm;
        }
        return cp;
    };

    //  Given J_w: the inner solve and the osmotic difference across the
    //  membrane (per ion, the module's osmotic model, nu = 1 for an ion).
    auto eval = [&](scalar Jw, Inner& in, scalar& dpi) -> bool
    {
        in = solveInner(Jw, c_b, k_film, P, z_, seedFor(Jw), nSteps);
        dpi = 0.0;
        for (std::size_t s = 0; s < Ns; ++s)
        {
            const scalar nu = thermo.comp(soluteIdx[s]).dissociation();
            dpi += osm.osmoticPressure({in.c_m[s], nu, T_K})
                 - osm.osmoticPressure({in.c_p[s], nu, T_K});
        }
        return in.converged;
    };

    //  Outer Newton-1D in J_w:  F(J_w) = J_w - A_w (dP - dpi(J_w)).
    scalar Jw = A_w * dP;
    Inner in; scalar dpi = 0.0;
    bool outerConverged = false;
    for (int it = 0; it < 60; ++it)
    {
        if (!eval(Jw, in, dpi))
        {
            char b[200];
            std::snprintf(b, sizeof(b),
                "transport SDEM: the permeate composition did not converge"
                " (inner Newton, %d iterations, residual %.3e at J_w = %.4e m/s)",
                in.iterations, static_cast<double>(in.residual),
                static_cast<double>(Jw));
            throw std::runtime_error(b);
        }
        const scalar F0 = Jw - A_w * (dP - dpi);
        if (std::abs(F0) < 1e-12 * std::max(Jw, 1e-12)) { outerConverged = true; break; }
        const scalar h = std::max(1.0e-9, 1.0e-4 * Jw);
        Inner inL, inR; scalar dpiL = 0.0, dpiR = 0.0;
        eval(Jw - h, inL, dpiL);
        eval(Jw + h, inR, dpiR);
        const scalar dF = 1.0 + A_w * (dpiR - dpiL) / (2.0 * h);
        scalar Jw_new = Jw - F0 / dF;
        if (Jw_new <= 0.0)          Jw_new = 0.5 * Jw;
        if (Jw_new > 5.0 * A_w * dP) Jw_new = 5.0 * A_w * dP;
        Jw = Jw_new;
    }
    if (!outerConverged) eval(Jw, in, dpi);

    cpPrev_ = in.c_p;
    sol.J_w = std::max(Jw, 0.0);
    sol.c_m = in.c_m;
    sol.c_p = in.c_p;
    for (std::size_t s = 0; s < Ns; ++s) sol.J_s[s] = sol.J_w * in.c_p[s];
    sol.psi = in.psi;
    sol.hasPsi = true;
    return sol;
}

} // namespace membrane
} // namespace Choupo
