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

#include "PureSolidPhase.H"

#include "core/Constants.H"
#include "thermo/Component.H"
#include "thermo/ElementComposition.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace pureSolidPhase {

bool isPureSolid(const Component& c)
{
    return c.referenceStateWord() == "pureSolid";
}

scalar gOverRT(const Component& c, scalar T)
{
    return c.g_formation(T, "solid") / (constant::R * T);
}

scalar enthalpy(const Component& c, scalar T)
{
    return c.h_formation(T, "solid");
}

scalar speciesEnthalpy(const Component& c, scalar T)
{
    return isPureSolid(c) ? enthalpy(c, T) : c.h_pure_ig(T);
}

Reaction::Equilibrium reactionEquilibrium(const ThermoPackage& thermo,
                                          const sVector&       nu,
                                          scalar               T)
{
    bool anySolid = false;
    for (std::size_t i = 0; i < nu.size(); ++i)
        if (nu[i] != 0.0 && isPureSolid(thermo.comp(i))) anySolid = true;
    if (!anySolid) return Reaction::equilibrium(thermo, nu, T);

    //  The fluid part is Reaction::equilibrium itself -- ONE home for ln K
    //  of a gas reaction -- and the solid enters only through its standard
    //  potential: at activity one, nu_s mu_s = nu_s g_s.
    sVector nuFluid = nu;
    scalar  solidTerm = 0.0;
    for (std::size_t i = 0; i < nu.size(); ++i)
        if (nu[i] != 0.0 && isPureSolid(thermo.comp(i)))
        {
            solidTerm  += nu[i] * gOverRT(thermo.comp(i), T);
            nuFluid[i]  = 0.0;
        }
    Reaction::Equilibrium eq = Reaction::equilibrium(thermo, nuFluid, T);
    eq.lnKp -= solidTerm;
    const scalar ratio = std::exp(-solidTerm);   // K = K_fluid * exp(-Sum nu_s g_s/RT)
    eq.Kp = std::exp(eq.lnKp);
    eq.Kc = (std::isfinite(eq.Kc) && std::isfinite(ratio)) ? eq.Kc * ratio : eq.Kc;
    return eq;
}

std::string verdict(const std::string& solid,
                    scalar lnActivityWithout,
                    bool   present,
                    scalar n_mol_s,
                    scalar lnActivityAt,
                    const std::string& minimumOf,
                    const std::string& howSolved)
{
    std::ostringstream m;
    m << std::setprecision(6);
    m << "pure solid phase '" << solid << "': activity in the solid-free"
         " equilibrium a = " << std::exp(lnActivityWithout);
    if (present)
        m << " > 1, so the solid-free answer is NOT " << minimumOf << " --"
             " the solid APPEARS: n = " << n_mol_s << " mol/s, and"
             " the fluid is re-equilibrated to a = "
          << std::exp(lnActivityAt) << " (" << howSolved << ").";
    else
        m << " <= 1, so depositing it would RAISE G -- the solid is ABSENT"
             " (n = 0).";
    return m.str();
}

void publishKpis(std::map<std::string, scalar>& kpis, const std::string& solid,
                 scalar n_mol_s, scalar activity, bool haveActivity)
{
    kpis["n_solid_" + solid + "_mol_s"] = n_mol_s;
    if (haveActivity) kpis["activity_" + solid] = activity;
}

void publishSolidFlow(std::map<std::string, scalar>& kpis, scalar F_solid_kmol_s)
{
    kpis["F_solid_kmol_h"] = F_solid_kmol_s * 3600.0;
}

FluidActivity activityFromFluid(const ThermoPackage&            thermo,
                                const std::vector<std::size_t>& fluid,
                                const sVector&                  n,
                                scalar                          ntot,
                                scalar                          T,
                                scalar                          P,
                                std::size_t                     s)
{
    FluidActivity out;
    const Component& sc = thermo.comp(s);

    //  Atoms from the records' own formulas -- the ONE elemental parser.
    auto atomsOf = [&](const Component& c, std::map<std::string, scalar>& a)
    {
        const ElementalResolution r = elementalCompositionOf(c);
        if (r.completeness != ElementalResolution::Completeness::full)
        {
            out.reason = "the elemental composition of '" + c.name()
                       + "' is not fully resolved (" + r.reason + ")";
            return false;
        }
        a = r.atoms;
        return true;
    };
    std::map<std::string, scalar> aS;
    if (!atomsOf(sc, aS)) return out;

    std::vector<std::size_t>                   used;
    std::vector<std::map<std::string, scalar>> aF;
    std::vector<std::string>                   elems;
    std::vector<scalar>                        mu;
    for (std::size_t i : fluid)
    {
        if (!(n[i] > 0.0)) continue;             // an underflowed trace has no ln y
        std::map<std::string, scalar> a;
        if (!atomsOf(thermo.comp(i), a)) return out;
        scalar g = 0.0;
        try { g = thermo.comp(i).g_pure_ig(T) / (constant::R * T); }
        catch (const std::exception& e)
        {
            out.reason = "'" + thermo.comp(i).name() + "' cannot be priced on"
                         " the ideal-gas rung (" + e.what() + ")";
            return out;
        }
        mu.push_back(g + std::log(n[i] / ntot) + std::log(P / constant::Pref));
        for (const auto& kv : a)
            if (kv.second != 0.0
                && std::find(elems.begin(), elems.end(), kv.first) == elems.end())
                elems.push_back(kv.first);
        used.push_back(i);
        aF.push_back(a);
    }
    for (const auto& kv : aS)
        if (kv.second != 0.0
            && std::find(elems.begin(), elems.end(), kv.first) == elems.end())
        {
            out.reason = "element " + kv.first + " of '" + sc.name()
                       + "' is carried by no equilibrated fluid species";
            return out;
        }

    //  Least squares: (A A^T) pi = A mu, then the fit residual decides
    //  whether the fluid HAS element potentials.
    const std::size_t M = elems.size(), L = used.size();
    auto A = [&](std::size_t k, std::size_t a)
    {
        const auto it = aF[a].find(elems[k]);
        return it == aF[a].end() ? 0.0 : it->second;
    };
    std::vector<sVector> N(M, sVector(M, 0.0));
    sVector rhs(M, 0.0);
    for (std::size_t k = 0; k < M; ++k)
    {
        for (std::size_t a = 0; a < L; ++a) rhs[k] += A(k, a) * mu[a];
        for (std::size_t l = 0; l < M; ++l)
            for (std::size_t a = 0; a < L; ++a) N[k][l] += A(k, a) * A(l, a);
    }
    for (std::size_t k = 0; k < M; ++k)
    {
        std::size_t piv = k;
        for (std::size_t r = k + 1; r < M; ++r)
            if (std::abs(N[r][k]) > std::abs(N[piv][k])) piv = r;
        if (!(std::abs(N[piv][k]) > 1.0e-12))
        {
            out.reason = "the equilibrated fluid species do not fix one"
                         " potential per element (their atom matrix is"
                         " rank-deficient)";
            return out;
        }
        std::swap(N[piv], N[k]); std::swap(rhs[piv], rhs[k]);
        for (std::size_t r = k + 1; r < M; ++r)
        {
            const scalar f = N[r][k] / N[k][k];
            for (std::size_t c = k; c < M; ++c) N[r][c] -= f * N[k][c];
            rhs[r] -= f * rhs[k];
        }
    }
    sVector pi(M, 0.0);
    for (std::size_t k = M; k-- > 0;)
    {
        scalar v = rhs[k];
        for (std::size_t c = k + 1; c < M; ++c) v -= N[k][c] * pi[c];
        pi[k] = v / N[k][k];
    }
    for (std::size_t a = 0; a < L; ++a)
    {
        scalar f = 0.0;
        for (std::size_t k = 0; k < M; ++k) f += pi[k] * A(k, a);
        out.maxResidual = std::max(out.maxResidual, std::abs(f - mu[a]));
    }
    if (!(out.maxResidual <= kElementPotentialFit))
    {
        std::ostringstream r;
        r << std::setprecision(3) << "the fluid is not in complete internal"
             " equilibrium (its chemical potentials miss one potential per"
             " element by up to " << out.maxResidual << " in ln units): a"
             " declared set that leaves a fluid pathway closed has no element"
             " potentials, so the activity of '" << sc.name() << "' depends"
             " on which route would form it";
        out.reason = r.str();
        return out;
    }
    scalar lnA = -gOverRT(sc, T);
    for (std::size_t k = 0; k < M; ++k)
    {
        const auto it = aS.find(elems[k]);
        if (it != aS.end()) lnA += pi[k] * it->second;
    }
    out.defined    = true;
    out.lnActivity = lnA;
    return out;
}

} // namespace pureSolidPhase
} // namespace Choupo
