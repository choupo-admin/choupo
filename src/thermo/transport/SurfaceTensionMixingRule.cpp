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
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "SurfaceTensionMixingRule.H"
#include "core/Constants.H"
#include "thermo/Component.H"
#include "thermo/DerivedClosures.H"
#include "thermo/ThermoAnnounce.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

// ---- moleFractionAverage ---------------------------------------------------
//  sigma_m = sum_i x_i sigma_i over the components present.  Silent, as it
//  was before it had a name: a case that does not select a rule prints
//  exactly what it printed before C331.
class MoleFractionAverageSigma : public SurfaceTensionMixingRule
{
public:
    explicit MoleFractionAverageSigma(const DictPtr&) {}

    const std::string& ruleName() const override
    { static const std::string s = "moleFractionAverage"; return s; }
    const std::string& citation() const override
    {
        static const std::string s = "the arithmetic mole-fraction average;"
            " Poling, Prausnitz & O'Connell, The Properties of Gases and"
            " Liquids, 5th ed. (2001), sec. 12-5, show it overestimates"
            " sigma_m almost always";
        return s;
    }
    const std::string& validityWindow() const override
    {
        static const std::string s = "near-ideal mixtures of components of"
            " similar surface tension; not aqueous-organic";
        return s;
    }

    scalar mix(scalar, const sVector& x, const sVector& pure,
               const LiquidMixingContext&) const override
    {
        scalar s = 0.0, xsum = 0.0;
        for (std::size_t i = 0; i < x.size(); ++i)
        {
            if (x[i] <= 0.0) continue;
            s    += x[i] * pure[i];
            xsum += x[i];
        }
        if (xsum <= 0.0)
            throw std::runtime_error("ThermoPackage::surfaceTension: empty composition");
        return s / xsum;                                // N/m
    }
};

// ---- Butler ----------------------------------------------------------------
//  Sprow & Prausnitz (1966a), as Poling 5ed eqs. 12-5.16 and 12-5.17 write
//  it: the surface is a PHASE in equilibrium with the bulk liquid, and the
//  partial molar area of i equals its molar area A_i, so for EVERY i
//
//      sigma_m = sigma_i + (R T / A_i) ln( x_i^s gamma_i^s / (x_i gamma_i) ),
//      sum_i x_i^s = 1,
//
//  N + 1 equations in sigma_m and the N surface mole fractions.  gamma_i is
//  the case's activity model at the bulk x, gamma_i^s THE SAME MODEL at the
//  surface composition x^s (Poling's example 12-5 runs this variant with
//  UNIFAC and quotes it beside Suarez's).  A_i [cm2/mol] is eq. 12-5.20,
//
//      A_i = 1.021e8 Vc^(6/15) Vb^(4/15),   Vc, Vb in cm3/mol,
//
//  with Vb the package's own liquid molar volume at the normal boiling point
//  and Vc the Rackett critical volume R Tc Z_RA / Pc (Z_RA by Yamada & Gunn,
//  the same Rackett the liquid density uses) -- the component records carry
//  no Vc, and this substitution is announced.
//
//  THE SOLVE.  For a fixed gamma^s the equations give
//      x_i^s(sigma) = c_i exp(a_i (sigma - sigma_i)),  c_i = x_i gamma_i/gamma_i^s,
//  a_i = A_i/(R T), and sum_i x_i^s(sigma) = 1 is ONE monotone equation in
//  sigma, bracketed and solved by Newton with bisection.  gamma^s is then
//  re-evaluated at the new x^s (successive substitution, damped when the
//  step grows) until x^s stops moving by 1e-12.
class Butler : public SurfaceTensionMixingRule
{
public:
    explicit Butler(const DictPtr&) {}

    const std::string& ruleName() const override
    { static const std::string s = "Butler"; return s; }
    const std::string& citation() const override
    {
        static const std::string s = "Butler, Proc. R. Soc. Lond. A 135"
            " (1932) 348; Sprow & Prausnitz, Trans. Faraday Soc. 62 (1966)"
            " 1105; as written in Poling, Prausnitz & O'Connell, The"
            " Properties of Gases and Liquids, 5th ed. (2001), eqs."
            " 12-5.16, 12-5.17 and (molar areas) 12-5.20";
        return s;
    }
    const std::string& validityWindow() const override
    {
        static const std::string s = "liquid mixtures below their critical"
            " region; as good as the activity model on BOTH the bulk and the"
            " surface composition (Poling 5ed sec. 12-5 reports ~3 % for"
            " binaries with a UNIFAC variant; aqueous systems are the hard"
            " case)";
        return s;
    }

    scalar mix(scalar T, const sVector& x, const sVector& pure,
               const LiquidMixingContext& ctx) const override;

private:
    static scalar linear(const sVector& x, const sVector& pure);
};

scalar Butler::linear(const sVector& x, const sVector& pure)
{
    scalar s = 0.0, xsum = 0.0;
    for (std::size_t i = 0; i < x.size(); ++i)
        if (x[i] > 0.0) { s += x[i] * pure[i]; xsum += x[i]; }
    if (xsum <= 0.0)
        throw std::runtime_error("ThermoPackage::surfaceTension: empty composition");
    return s / xsum;
}

scalar Butler::mix(scalar T, const sVector& x, const sVector& pure,
                   const LiquidMixingContext& ctx) const
{
    const std::size_t N = x.size();
    std::vector<std::size_t> P;
    scalar xsum = 0.0;
    for (std::size_t i = 0; i < N; ++i)
        if (x[i] > 0.0) { P.push_back(i); xsum += x[i]; }
    if (P.empty())
        throw std::runtime_error("ThermoPackage::surfaceTension: empty composition");
    if (P.size() == 1) return pure[P[0]];

    //  NO ACTIVITY MODEL: the surface equilibrium cannot be written.  The
    //  linear rule is used, and SAID, once.
    if (!ctx.gamma)
    {
        if (announceOnce("mixing:sigma:Butler:noActivity"))
            std::cout << "[mixing] surface tension: Butler needs the case's"
                         " activity model and this package has none -- the"
                         " MOLE-FRACTION AVERAGE is used instead (it"
                         " overestimates sigma for most mixtures)\n";
        return linear(x, pure);
    }

    const std::vector<Component>& comps = *ctx.components;
    const scalar RT = constant::R * T;

    //  Molar areas, eq. 12-5.20 (cm2/mol), then SI (m2/mol).
    sVector a(N, 0.0);
    for (std::size_t i : P)
    {
        const Component& c = comps[i];
        const scalar Tc = c.Tc(), Pc_Pa = c.Pc() * 1.0e5, Tb = c.Tb();
        if (!(Tc > 0.0 && Pc_Pa > 0.0 && Tb > 0.0) || !ctx.molarVolume)
            throw std::runtime_error("surface tension (Butler): component '"
                + c.name() + "' needs Tc, Pc and Tb for its molar area"
                " (Poling 5ed eq. 12-5.20); it lacks one.  Select"
                " `mixingRule moleFractionAverage;` to mix without it.");
        const scalar Vc_cm3 = closures::rackettVliq(Tc, Tc, Pc_Pa, c.omega()) * 1.0e6;
        const scalar Vb_cm3 = ctx.molarVolume(i, Tb) * 1.0e6;
        const scalar A_cm2  = 1.021e8 * std::pow(Vc_cm3, 6.0 / 15.0)
                                      * std::pow(Vb_cm3, 4.0 / 15.0);
        a[i] = (A_cm2 * 1.0e-4) / RT;                    // [m/N] = 1/(N/m)
        if (announceOnce("mixing:sigma:Butler:area:" + c.name()))
        {
            char buf[256];
            std::snprintf(buf, sizeof buf, "[mixing] surface tension (Butler):"
                " %s  Vc = %.1f cm3/mol (Rackett R Tc Z_RA/Pc), Vb = %.2f"
                " cm3/mol (liquid at Tb = %.2f K), A = %.4g cm2/mol"
                " (eq. 12-5.20)\n", c.name().c_str(), Vc_cm3, Vb_cm3, Tb,
                A_cm2);
            std::cout << buf;
        }
    }
    if (announceOnce("mixing:sigma:Butler"))
        std::cout << "[mixing] surface tension: Butler -- the surface is a"
                     " phase in equilibrium with the bulk, gamma from the"
                     " case's " << ctx.activityModelName << " at the bulk AND"
                     " at the surface composition (Sprow & Prausnitz 1966;"
                     " Poling 5ed eqs. 12-5.16/17)\n";

    sVector xb(N, 0.0);
    for (std::size_t i : P) xb[i] = x[i] / xsum;
    const sVector gb = ctx.gamma(T, xb);

    sVector xs = xb;
    scalar lambda = 1.0, lastStep = 1.0e300, sigma = 0.0;
    for (int it = 0; it < 2000; ++it)
    {
        const sVector gs = ctx.gamma(T, xs);
        sVector c(N, 0.0);
        for (std::size_t i : P)
        {
            c[i] = xb[i] * gb[i] / gs[i];
            if (!(c[i] > 0.0) || !std::isfinite(c[i]))
                throw std::runtime_error("surface tension (Butler): the"
                    " activity coefficient of '" + comps[i].name() + "' is"
                    " not a finite positive number at T = "
                    + std::to_string(T) + " K");
        }
        //  Bracket sum_i c_i exp(a_i (s - sigma_i)) = 1 (monotone in s).
        scalar lo = 1.0e300, hi = -1.0e300;
        const scalar n = static_cast<scalar>(P.size());
        for (std::size_t i : P)
        {
            hi = std::max(hi, pure[i] - std::log(c[i]) / a[i]);
            lo = std::min(lo, pure[i] - std::log(c[i] * n) / a[i]);
        }
        auto g = [&](scalar s, scalar& dg)
        {
            //  ln sum, evaluated around its largest exponent.
            scalar m = -1.0e300;
            for (std::size_t i : P)
                m = std::max(m, std::log(c[i]) + a[i] * (s - pure[i]));
            scalar sum = 0.0, dsum = 0.0;
            for (std::size_t i : P)
            {
                const scalar e = std::exp(std::log(c[i]) + a[i] * (s - pure[i]) - m);
                sum += e; dsum += a[i] * e;
            }
            dg = dsum / sum;
            return m + std::log(sum);
        };
        scalar s = (sigma > lo && sigma < hi) ? sigma : 0.5 * (lo + hi);
        for (int k = 0; k < 200; ++k)
        {
            scalar dg = 0.0;
            const scalar gv = g(s, dg);
            if (gv > 0.0) hi = s; else lo = s;
            scalar sn = s - gv / dg;
            if (!(sn > lo && sn < hi)) sn = 0.5 * (lo + hi);
            if (std::fabs(sn - s) < 1.0e-15 + 1.0e-13 * std::fabs(s)) { s = sn; break; }
            s = sn;
        }
        sigma = s;

        scalar step = 0.0;
        sVector xn(N, 0.0);
        for (std::size_t i : P)
        {
            xn[i] = c[i] * std::exp(a[i] * (sigma - pure[i]));
            step = std::max(step, std::fabs(xn[i] - xs[i]));
        }
        if (step < 1.0e-12) return sigma;               // N/m
        if (step > lastStep && lambda > 1.0 / 64.0) lambda *= 0.5;
        lastStep = step;
        scalar ssum = 0.0;
        for (std::size_t i : P)
        {
            xs[i] += lambda * (xn[i] - xs[i]);
            ssum  += xs[i];
        }
        for (std::size_t i : P) xs[i] /= ssum;
    }
    throw std::runtime_error("surface tension (Butler): the surface"
        " composition did not converge in 2000 substitutions at T = "
        + std::to_string(T) + " K.  The activity model may predict a"
        " surface phase that splits; select `mixingRule"
        " moleFractionAverage;` to see the linear estimate instead.");
}

} // anonymous namespace

std::map<std::string, SurfaceTensionMixingRule::Factory>&
SurfaceTensionMixingRule::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void SurfaceTensionMixingRule::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<SurfaceTensionMixingRule>
SurfaceTensionMixingRule::New(const DictPtr& dict)
{
    const std::string name = dict->lookupWordOrDefault("mixingRule", "Butler");
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("SurfaceTensionMixingRule: unknown mixingRule '"
            + name + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void SurfaceTensionMixingRule::registerBuiltins()
{
    registerType("moleFractionAverage", [](const DictPtr& d) { return std::make_unique<MoleFractionAverageSigma>(d); });
    registerType("Butler",              [](const DictPtr& d) { return std::make_unique<Butler>(d); });
}

std::vector<std::string> SurfaceTensionMixingRule::availableRules()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

} // namespace Choupo
