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
Namespace
    Choupo::edCell

Description
    Implementation.  Every function here is `ElectrodialysisStack.cpp`'s own
    code, moved verbatim the day a second unit needed it -- read EDCell.H for
    what is shared and what is deliberately not.
\*---------------------------------------------------------------------------*/

#include "EDCell.H"
#include "Electrochem.H"

#include "core/Constants.H"
#include "core/Dictionary.H"
#include "thermo/RecordResolver.H"
#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrochem/EDStack.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/electrolyte/IonTransport.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // findAqueousSpecies, ionCharge

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <stdexcept>

namespace Choupo {
namespace edCell {

namespace fs = std::filesystem;

void readIEMPair(const std::string& who, const std::string& name,
                 IEMSpec& cem, IEMSpec& aem)
{
    fs::path file;
    {
        const fs::path cand = records::resolveRecord("assets/" + name + ".dat");
        if (!cand.empty() && fs::exists(cand)) file = cand;
    }
    if (file.empty())
        throw std::runtime_error(who + ": IEM membrane '" + name
            + "' not found in constant/assets/ (case) or data/standards/assets/");

    auto d = Dictionary::fromFile(file.string());
    if (d->lookupWordOrDefault("kind", "") != "IEM")
        throw std::runtime_error(who + ": membrane '" + name
            + "' is not `kind IEM` -- electrodialysis needs an ion-exchange "
              "membrane pair (cem{} + aem{}), not a solution-diffusion membrane");

    auto readLeg = [&](const std::string& leg) -> IEMSpec
    {
        if (!d->found(leg))
            throw std::runtime_error(who + ": IEM '" + name
                + "' has no `" + leg + "` sub-dict (need cem{} and aem{})");
        auto sd = d->subDict(leg);
        IEMSpec s;
        s.name      = sd->lookupWordOrDefault("name", leg);
        s.R_area    = sd->lookupScalar("R_area");      // Ohm.m2 (raw SI)
        s.t_cu      = sd->lookupScalar("t_cu");
        s.thickness = sd->lookupScalar("thickness");   // m
        if (s.t_cu <= 0.5 || s.t_cu > 1.0)
            throw std::runtime_error(who + ": IEM '" + name + "." + leg
                + "' t_cu must be in (0.5, 1] (counter-ion transport number); got "
                + std::to_string(s.t_cu));
        return s;
    };
    cem = readLeg("cem");
    aem = readLeg("aem");
}

// Build the ionic state of a channel from a feed stream (mole fractions),
// freezing the Davies gammas ONCE.  Reuses the electrolyte stack (AqueousActivity
// "davies") -- NO parallel gamma implementation.
ChannelState buildChannel(const std::string& who,
                          const ThermoPackage& thermo, const sVector& z,
                          std::size_t iWater, scalar T,
                          const electrolyte::AqueousActivity& act)
{
    const scalar z_water = z[iWater];
    if (z_water <= 0.0)
        throw std::runtime_error(who + ": a channel feed has no "
            "water -- electrodialysis needs an aqueous carrier (water component)");
    const scalar molesWaterPerKg = 1.0 / MW_WATER_KG;

    ChannelState ch;
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        if (i == iWater) continue;
        if (z[i] <= 0.0) continue;
        // The component -> species crossing goes through the DECLARED bridge
        // (aqueousMapping / dissociatesTo), never by name identity.
        const SpeciesId sp = thermo.aqueousChemistry().singleMaster(
            ComponentId(thermo.comp(i).name()));
        if (!electrolyte::findAqueousSpecies(sp.key))
            throw std::runtime_error(who + ": species '" + sp.key
                + "' has no row in ions.dat -- electrodialysis needs an IONIC "
                  "water analysis (Na, Cl, ... + water)");
        ch.ion.push_back(sp);
        ch.compIdx.push_back(i);
        ch.z.push_back(static_cast<scalar>(electrolyte::ionCharge(sp)));
        ch.m.push_back((z[i] / z_water) * molesWaterPerKg);   // mol/kg water
    }
    if (ch.ion.empty())
        throw std::runtime_error(who + ": a channel carries no "
            "ions -- nothing to transport");

    // ionic strength I = 0.5 sum m_i z_i^2
    scalar I = 0.0;
    for (std::size_t k = 0; k < ch.m.size(); ++k) I += ch.m[k] * ch.z[k] * ch.z[k];
    ch.I = 0.5 * I;

    // Davies gammas, frozen for the pass (the reused electrolyte interface).
    electrolyte::IonState st;
    st.name.clear();
    for (const auto& s : ch.ion) st.name.push_back(s.key);
    st.molality = ch.m; st.charge = ch.z; st.I = ch.I; st.T = T;
    auto res = act.evaluate(st, T);
    ch.gamma.resize(ch.m.size());
    for (std::size_t k = 0; k < ch.m.size(); ++k) ch.gamma[k] = res.gamma(ch.z[k]);

    // Specific conductivity kappa [S/m] from the ION D0 tier via Nernst-Einstein:
    //   lambda_i = z_i^2 F^2 D0_i / (R T)   [S m2/mol]   (equivalent conductance)
    //   kappa    = sum c_i lambda_i,  c_i [mol/m3] ~ m_i * rho_water
    // (dilute approximation rho ~ 1000 kg/m3; the unit ANNOUNCES it).
    const scalar rho_w = 1000.0;                 // kg/m3 (dilute carrier approx)
    scalar kappa = 0.0, c_eq = 0.0;
    for (std::size_t k = 0; k < ch.m.size(); ++k)
    {
        const scalar D0 = electrolyte::ionD0(ch.ion[k]);            // m2/s
        const scalar lam = ch.z[k] * ch.z[k] * electrochem::Faraday
                         * electrochem::Faraday * D0 / (constant::R * T);  // S m2/mol
        const scalar c_i = ch.m[k] * rho_w;                        // mol/m3
        kappa += c_i * lam;
        c_eq  += c_i * std::abs(ch.z[k]);                          // eq/m3
    }
    ch.kappa = kappa;
    ch.c_eq  = 0.5 * c_eq;   // equivalent concentration of the salt (cation eq = anion eq)
    return ch;
}


// ---------------------------------------------------------------------------
//  The geometric mean activity ratio conc/dil over the ions of one sign.
//  Moved from ElectrodialysisStack.cpp's `meanActRatio` lambda.
// ---------------------------------------------------------------------------
scalar meanActivityRatio(const ChannelState& chD, const ChannelState& chC,
                         scalar sign)
{
    scalar lr = 0.0; int n = 0;
    for (std::size_t kc = 0; kc < chC.ion.size(); ++kc)
    {
        if ((chC.z[kc] > 0) != (sign > 0)) continue;
        for (std::size_t kd = 0; kd < chD.ion.size(); ++kd)
            if (chD.ion[kd] == chC.ion[kc])
            {
                const scalar aC = chC.gamma[kc] * chC.m[kc];
                const scalar aD = chD.gamma[kd] * chD.m[kd];
                if (aC > 0 && aD > 0) { lr += std::log(aC / aD); ++n; }
            }
    }
    return (n > 0) ? std::exp(lr / static_cast<scalar>(n)) : 1.0;
}

scalar solutionResistance(const ChannelState& ch, scalar h_ch, scalar area)
{
    if (ch.kappa <= 0.0) return 0.0;
    return h_ch / (ch.kappa * area);
}

// ---------------------------------------------------------------------------
//  The predictive limiting current (GeraldesAfonso2010), moved verbatim from
//  the steady unit's own branch -- the ONE place the paper's Eqs. A13/12/13/
//  15/16 are assembled from a channel state and a stack record.
// ---------------------------------------------------------------------------
LimitingCurrent predictiveLimitingCurrent(const EDStack&      stk,
                                          const ChannelState& chD,
                                          scalar              Q_dil,
                                          scalar              nu,
                                          scalar              seFactor)
{
    LimitingCurrent lc;

    const scalar h_ch = stk.channelHeight_m();
    lc.channelsPerPass = stk.channelsPerPass();
    lc.sectionEmpty    = lc.channelsPerPass * stk.channelWidth_m() * h_ch;
    lc.u_superficial   = Q_dil / lc.sectionEmpty;
    lc.u_interstitial  = lc.u_superficial / stk.spacerPorosity();
    lc.pathLength      = stk.flowPathLength_m();

    for (std::size_t k = 0; k < chD.ion.size(); ++k)
    {
        edLimitingCurrent::Ion io;
        io.name = chD.ion[k].key;
        io.z    = chD.z[k];
        io.C    = chD.m[k] * RHO_CARRIER;              // mol/m3 (dilute carrier)
        io.D    = electrolyte::ionD0(chD.ion[k]) * seFactor;
        lc.ions.push_back(io);
    }
    lc.D_eff = edLimitingCurrent::effectiveDiffusivity(lc.ions);

    const EDSherwood& sh = stk.massTransfer();
    const scalar u_corr = (sh.velocityBasis == "interstitial")
                        ? lc.u_interstitial : lc.u_superficial;
    lc.Re = u_corr * h_ch / nu;
    lc.Sc = nu / lc.D_eff;
    lc.Sh = (sh.model == "powerLaw")
          ? sh.a * std::pow(lc.Re, sh.b) * std::pow(lc.Sc, sh.c)
          : sh.a * std::cbrt(std::max(lc.Re * lc.Sc * h_ch / lc.pathLength, 1.0e-12));
    lc.k_c_eff = lc.Sh * lc.D_eff / h_ch;

    lc.t_cem = edLimitingCurrent::limitingTransportNumbers(lc.ions, true);
    lc.t_aem = edLimitingCurrent::limitingTransportNumbers(lc.ions, false);
    lc.i_lim_cem = edLimitingCurrent::limitingCurrentEq15(lc.ions, lc.t_cem,
                                                          lc.k_c_eff, lc.D_eff);
    lc.i_lim_aem = edLimitingCurrent::limitingCurrentEq15(lc.ions, lc.t_aem,
                                                          lc.k_c_eff, lc.D_eff);
    //  "the limiting current density is the lowest of the absolute values
    //  determined for each membrane" (the paper, after Eq. 15).
    if (std::abs(lc.i_lim_cem) <= std::abs(lc.i_lim_aem))
    { lc.i_lim = std::abs(lc.i_lim_cem); lc.setBy = "cation-exchange membrane"; }
    else
    { lc.i_lim = std::abs(lc.i_lim_aem); lc.setBy = "anion-exchange membrane"; }

    //  A route claimed to reduce to another is SEEN doing it: on a single
    //  salt, Eq. (15) and the classical Eq. (16) are the same number.
    scalar tCu1 = 0.0;
    for (std::size_t k = 0; k < lc.ions.size(); ++k)
        if (lc.ions[k].z > 0.0) tCu1 = lc.t_cem[k];
    lc.haveEq16 = edLimitingCurrent::singleSaltEq16(lc.ions, lc.k_c_eff, tCu1,
                                                    lc.i_lim_eq16);
    return lc;
}

} // namespace edCell
} // namespace Choupo
