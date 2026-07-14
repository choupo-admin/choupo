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

#include "RateLaw.H"

#include "thermo/ThermoPackage.H"
#include "thermo/reaction/Reaction.H"

#include <cmath>
#include <stdexcept>

namespace Choupo
{

RateLaw RateLaw::fromDict(const DictPtr&       rxn,
                          const ThermoPackage& thermo,
                          const std::string&   who)
{
    const std::size_t n = thermo.n();
    RateLaw law;
    law.nu_.assign(n, 0.0);
    law.order_.assign(n, 0.0);
    law.orderRev_.assign(n, 0.0);

    for (const auto& s : rxn->lookupDictList("stoichiometry"))
    {
        const std::size_t i = thermo.indexOf(s->lookupWord("component"));
        law.nu_[i]    = s->lookupScalar("nu");
        law.order_[i] = s->lookupScalarOrDefault("order", 0.0);
        // The reverse leg runs on the products; by default at their stoichiometric
        // order, which is what detailed balance requires.  `orderRev` overrides.
        law.orderRev_[i] = s->lookupScalarOrDefault(
            "orderRev", law.nu_[i] > 0.0 ? law.nu_[i] : 0.0);
    }

    auto kin = rxn->subDict("kinetics");
    law.type_ = kin->lookupWord("type");
    if (law.type_ != "Arrhenius" && law.type_ != "LHHW")
        throw std::runtime_error(who + ": kinetics `type` must be `Arrhenius` or "
            "`LHHW` (got '" + law.type_ + "')");

    const std::string basis = kin->lookupWordOrDefault("basis", "concentration");
    if (basis != "concentration" && basis != "activity")
        throw std::runtime_error(who + ": kinetics `basis` must be `concentration` "
            "or `activity` (got '" + basis + "')");
    law.activity_ = (basis == "activity");

    law.A_  = kin->lookupScalar("A");
    law.Ea_ = kin->lookupScalar("Ea");

    // Reverse leg: an explicitly regressed Arrhenius pair, or detailed balance.
    law.revExplicit_ = kin->found("A_rev");
    if (law.revExplicit_)
    {
        law.Arev_  = kin->lookupScalar("A_rev");
        law.Earev_ = kin->lookupScalar("Ea_rev");
    }
    law.revBalance_ = (rxn->lookupWordOrDefault("reversible", "false") == "true");

    if (law.revExplicit_ && law.revBalance_)
        throw std::runtime_error(who + ": a reaction cannot carry BOTH `reversible true` "
            "(reverse from detailed balance, k_rev = k_fwd / Kc) and an explicit "
            "`A_rev`/`Ea_rev` pair -- pick the one you can defend");
    if (law.revBalance_ && law.activity_)
        throw std::runtime_error(who + ": `reversible true` derives the reverse rate from "
            "Kc, a CONCENTRATION-basis equilibrium constant, which does not fit an "
            "activity-basis rate law -- give the regressed `A_rev`/`Ea_rev` instead");

    // Adsorption: the LHHW denominator.  Absent => plain power law.
    if (kin->found("adsorption"))
    {
        auto ads = kin->subDict("adsorption");
        law.ads_    = true;
        law.adsExp_ = ads->lookupScalarOrDefault("exponent", 1.0);
        law.vacant_ = ads->lookupScalarOrDefault("vacantSite", 1.0);
        for (const auto& sp : ads->lookupDictList("species"))
        {
            Site st;
            st.i  = thermo.indexOf(sp->lookupWord("component"));
            st.K0 = sp->lookupScalar("K0");
            st.B  = sp->lookupScalarOrDefault("B", 0.0);   // van 't Hoff, K
            law.sites_.push_back(st);
        }
        if (law.sites_.empty())
            throw std::runtime_error(who + ": the `adsorption` block declares no `species`");
    }
    if (law.ads_ && law.type_ == "Arrhenius")
        throw std::runtime_error(who + ": an `adsorption` block makes the rate law LHHW, "
            "not Arrhenius -- say `type LHHW;` and mean it");
    if (!law.ads_ && law.type_ == "LHHW")
        throw std::runtime_error(who + ": `type LHHW` needs an `adsorption { ... }` block "
            "-- without a denominator it IS a power law");

    return law;
}


scalar RateLaw::kForward(scalar T) const
{
    return Reaction::arrheniusRate(A_, Ea_, T);
}


scalar RateLaw::netRate(const ThermoPackage& thermo, scalar T,
                        const sVector& conc, const sVector& x) const
{
    const std::size_t n = nu_.size();
    const scalar kf = Reaction::arrheniusRate(A_, Ea_, T);

    // The plain power law, untouched: no activities, no adsorption weights, no
    // division.  Kept as its own path so that every existing case reproduces to
    // the last bit.
    if (!ads_ && !activity_)
    {
        scalar rf = kf;
        for (std::size_t i = 0; i < n; ++i)
            if (order_[i] != 0.0) rf *= std::pow(conc[i], order_[i]);
        scalar rr = 0.0;
        if (revBalance_)
        {
            const scalar Kc = Reaction::equilibriumKc(thermo, nu_, T);
            rr = (Kc > 0.0) ? kf / Kc : 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (nu_[i] > 0.0) rr *= std::pow(conc[i], nu_[i]);
        }
        else if (revExplicit_)
        {
            rr = Reaction::arrheniusRate(Arev_, Earev_, T);
            for (std::size_t i = 0; i < n; ++i)
                if (orderRev_[i] != 0.0) rr *= std::pow(conc[i], orderRev_[i]);
        }
        return rf - rr;
    }

    // theta: what the rate law sees.
    sVector theta(n, 0.0);
    if (activity_)
    {
        const sVector g = thermo.activity().gamma(T, x);
        for (std::size_t i = 0; i < n; ++i) theta[i] = g[i] * x[i];
    }
    else
        theta = conc;

    // abar: the ADSORBED species the surface step actually sees.
    sVector abar = theta;
    for (const auto& st : sites_)
        abar[st.i] = st.K0 * std::exp(st.B / T) * theta[st.i];

    scalar rf = kf;
    for (std::size_t i = 0; i < n; ++i)
        if (order_[i] != 0.0) rf *= std::pow(abar[i], order_[i]);

    scalar rr = 0.0;
    if (revExplicit_)
    {
        rr = Reaction::arrheniusRate(Arev_, Earev_, T);
        for (std::size_t i = 0; i < n; ++i)
            if (orderRev_[i] != 0.0) rr *= std::pow(abar[i], orderRev_[i]);
    }
    else if (revBalance_)
    {
        const scalar Kc = Reaction::equilibriumKc(thermo, nu_, T);
        rr = (Kc > 0.0) ? kf / Kc : 0.0;
        for (std::size_t i = 0; i < n; ++i)
            if (nu_[i] > 0.0) rr *= std::pow(abar[i], nu_[i]);
    }

    if (!ads_) return rf - rr;

    // The vacant-site fraction, raised to the number of sites the
    // rate-determining step occupies.
    scalar denom = vacant_;
    for (const auto& st : sites_) denom += abar[st.i];
    if (denom <= 0.0) return 0.0;                       // a dead surface

    return (rf - rr) / std::pow(denom, adsExp_);
}

} // namespace Choupo
