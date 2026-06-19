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

#include "BatchCrystalliser.H"
#include "streams/Composition.H"

#include <cmath>
#include <filesystem>
#include <iostream>
#include <stdexcept>

namespace Choupo {

void BatchCrystalliser::initialise(const DictPtr&       unitDict,
                                   const ThermoPackage& thermo,
                                   const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();

    // ---- Initial charge (same `initial` block as the batch reactor) ----
    auto initDict = unitDict->subDict("initial");
    state_.T = initDict->lookupScalar("T");
    state_.P = initDict->lookupScalar("P");
    state_.V = initDict->lookupScalar("V");
    const scalar nTot = initDict->lookupScalar("totalMoles");
    const sVector x =
        readComposition(initDict, thermo, "BatchCrystalliser '" + name_ + "' init");
    state_.n.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTot * x[i];

    T_ = state_.T;
    V_ = state_.V;
    if (V_ <= 0.0)
        throw std::runtime_error("BatchCrystalliser '" + name_ + "': needs a"
            " positive suspension volume V in the `initial` block.");

    // ---- Identify solute (solubility curve) + solvent (volatile carrier)
    iSolute_ = n; iSolv_ = n;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (state_.n[i] <= 0.0) continue;
        if (thermo.comp(i).hasSolubility())          iSolute_ = i;
        else if (thermo.comp(i).hasVaporPressure())  iSolv_   = i;
    }
    if (iSolute_ == n)
        throw std::runtime_error("BatchCrystalliser '" + name_ + "': no"
            " crystallising solute (need a component with a `solubility {}` block).");
    if (iSolv_ == n)
        throw std::runtime_error("BatchCrystalliser '" + name_ + "': no solvent"
            " in the charge.");

    const Component& sol  = thermo.comp(iSolute_);
    const Component& solv = thermo.comp(iSolv_);
    MW_sol_  = sol.MW();
    MW_solv_ = solv.MW();
    rho_c_   = sol.rho_p();
    k_v_     = sol.k_v();
    if (rho_c_ <= 0.0)
        throw std::runtime_error("BatchCrystalliser '" + name_ + "': solute needs"
            " a `solid { rho_p; k_v; }` block.");

    // ---- Kinetics: self-load constant/crystallisation, resolve the ref --
    if (!unitDict->found("crystallisation"))
        throw std::runtime_error("BatchCrystalliser '" + name_ + "': missing"
            " `crystallisation <name>;` reference.");
    const std::string kinName = unitDict->lookupWord("crystallisation");
    if (!std::filesystem::exists("constant/crystallisation"))
        throw std::runtime_error("BatchCrystalliser '" + name_ + "': no"
            " constant/crystallisation library in the case.");
    auto lib  = Dictionary::fromFile("constant/crystallisation");
    auto kin  = lib->subDict(kinName);
    auto grow = kin->subDict("growth");
    auto nucl = kin->subDict("nucleation");
    k_g_ = grow->lookupScalar("k_g");
    g_   = grow->lookupScalarOrDefault("g", 1.0);
    k_b_ = nucl->lookupScalar("k_b");
    b_   = nucl->lookupScalarOrDefault("b", 1.0);
    j_   = nucl->lookupScalarOrDefault("j", 0.0);

    // ---- Moments start at zero (unseeded); primary nucleation (j=0)
    //      bootstraps the population from the initial supersaturation. -----
    mu0_ = mu1_ = mu2_ = mu3_ = 0.0;

    const scalar S0 = supersaturation_(state_.n[iSolute_]);
    if (S0 <= 1.0)
        throw std::runtime_error("BatchCrystalliser '" + name_ + "': the charge"
            " is not supersaturated at T (S0 <= 1) --- nothing will crystallise.");
    if (j_ > 0.0)
        std::cout << "  [BatchCrystalliser] note: nucleation magma exponent j>0"
                  << " with no seed --- B0 starts at 0 (M_T=0); add a seed for"
                  << " secondary nucleation.\n";
}

scalar BatchCrystalliser::supersaturation_(scalar nSoluteDissolved) const
{
    const scalar solventMass = state_.n[iSolv_] * MW_solv_;     // kg (·1, kmol·kg/kmol)
    if (solventMass <= 0.0) return 1.0;
    const scalar c     = (nSoluteDissolved * MW_sol_) / solventMass;  // kg/kg
    const scalar c_sat = thermo_->comp(iSolute_).c_sat(T_);
    return (c_sat > 0.0) ? c / c_sat : 1.0;
}

// packed = (mu0, mu1, mu2, mu3, n_solute_dissolved)
sVector BatchCrystalliser::derivatives_(const sVector& p) const
{
    sVector d(5, 0.0);
    const scalar S   = supersaturation_(p[4]);
    const scalar sup = std::max(S - 1.0, 0.0);
    if (sup <= 0.0) return d;                       // at/below saturation: frozen

    const scalar G   = k_g_ * std::pow(sup, g_);    // m/s
    const scalar M_T = rho_c_ * k_v_ * p[3];        // kg/m^3
    const scalar B0  = k_b_ * std::pow(sup, b_) * std::pow(M_T, j_);   // #/(m^3 s)

    d[0] = B0;                                       // dmu0/dt
    d[1] = G * p[0];                                 // dmu1/dt
    d[2] = 2.0 * G * p[1];                           // dmu2/dt
    d[3] = 3.0 * G * p[2];                           // dmu3/dt
    // Solute leaving solution = crystal mass formed by growth (V rho_c k_v dmu3).
    d[4] = -(V_ * rho_c_ * k_v_ * d[3]) / MW_sol_;   // kmol/s
    return d;
}

void BatchCrystalliser::step(scalar /*t*/, scalar dt)
{
    sVector y0 = { mu0_, mu1_, mu2_, mu3_, state_.n[iSolute_] };

    auto axpy = [](const sVector& a, scalar s, const sVector& b) {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + s * b[i];
        return r;
    };
    auto k1 = derivatives_(y0);
    auto k2 = derivatives_(axpy(y0, 0.5 * dt, k1));
    auto k3 = derivatives_(axpy(y0, 0.5 * dt, k2));
    auto k4 = derivatives_(axpy(y0,       dt, k3));
    for (std::size_t i = 0; i < y0.size(); ++i)
        y0[i] += dt / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);

    mu0_ = std::max(y0[0], 0.0);
    mu1_ = std::max(y0[1], 0.0);
    mu2_ = std::max(y0[2], 0.0);
    mu3_ = std::max(y0[3], 0.0);
    state_.n[iSolute_] = std::max(y0[4], 0.0);
    state_.T = T_;
}

std::vector<std::pair<std::string, scalar>>
BatchCrystalliser::trajectoryExtras() const
{
    const scalar S     = supersaturation_(state_.n[iSolute_]);
    const scalar M_T   = rho_c_ * k_v_ * mu3_;                 // kg/m^3
    const scalar L10   = (mu0_ > 0.0) ? mu1_ / mu0_ : 0.0;     // number-mean [m]
    const scalar L32   = (mu2_ > 0.0) ? mu3_ / mu2_ : 0.0;     // Sauter mean [m]
    const scalar crys  = M_T * V_;                             // crystal mass in vessel [kg]
    return {
        { "S",              S },
        { "mu0",            mu0_ },
        { "mu3",            mu3_ },
        { "L_meanNumber_um", L10 * 1.0e6 },
        { "L_Sauter_um",     L32 * 1.0e6 },
        { "magmaDensity",    M_T },
        { "crystalMass_kg",  crys },
    };
}

} // namespace Choupo
