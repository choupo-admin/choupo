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
#include "unitOperations/crystallisation/CrystallisationSaturation.H"
#include "streams/Composition.H"
#include "thermo/Component.H"
#include "unitOperations/crystallisation/CrystallisationHeat.H"

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

    // ---- Solute / solvent / saturation: THE SHARED RESOLVER --------------
    //
    //  This used to identify the pair itself and read c_sat straight off the
    //  solute's solubility curve.  That is the molecular route and ONLY the
    //  molecular route, while the steady crystalliser resolves saturation
    //  from ION ACTIVITY when the package is an electrolyte one
    //  (Ksp = (gamma_pm * m_sat)^2, with the drowning-out mixed-solvent term).
    //  Two routes for one physical quantity, split across the two time
    //  regimes -- exactly what unifying the heat of crystallisation was meant
    //  to prevent.  The heat was shared; the saturation was not.
    //
    //  Nothing had failed because no batch case declares an electrolyte
    //  package.  The first one would have resolved ions for its activity
    //  coefficients and its heat, then taken supersaturation off a molecular
    //  curve -- silently, both routes returning a plausible number.
    //
    //  The batch charge is a fixed inventory, so `state_.n` plays the role of
    //  z with F = 1: the resolver's `solvent_mass` is then the charge's
    //  solvent mass in kg.
    //
    //  WHICH solvent, though, is the resolver's decision and not this model's.
    //  With an antisolvent present the resolver puts BOTH liquids in the
    //  denominator -- `F*(z[iSolv]*MW_solv + z[iAnti]*MW_anti)` -- because
    //  that is the basis its molality, and therefore its c_sat, is on.  This
    //  model divided by the water alone, so a mixed-solvent charge would have
    //  compared kg salt / kg water against kg salt / kg (water + ethanol) and
    //  called the quotient a supersaturation.  It never showed because no
    //  batch case had an antisolvent; batch14 is that case.
    const SatState sat = crystSaturation(thermo, state_.n, 1.0, T_);
    iSolute_ = sat.iSolute;
    iSolv_   = sat.iSolv;
    iAnti_   = sat.iAnti;
    MW_anti_ = (sat.iAnti < n) ? thermo.comp(sat.iAnti).MW() : 0.0;
    c_sat_   = sat.c_sat;              // kg solute / kg solvent at T (isothermal)
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

    // ---- Heat of crystallisation, resolved ONCE through the SAME shared
    //      resolver the steady crystalliser reads (never a second source).
    //      T is fixed by the isothermal model, so the per-mol value is a
    //      constant of the campaign; the source travels into every duty
    //      record's basis.
    //
    //      AT SATURATION, not at the charge.  This passed the CHARGE molality
    //      where the steady unit passes sat.m_sat, and hardcoded mixedSolvent
    //      false where the steady unit passes sat.mixedSolvent.  Both were
    //      invisible until a batch case declared an electrolyte package: the
    //      first one announced "** EXTRAPOLATED: m_sat 7.600000 > fit window
    //      6.000000 **" quoting the supersaturated charge as though it were
    //      the saturation, and a drowning-out batch would have dropped the
    //      mixed-solvent term without a word.
    //
    //      The crystal leaves a SATURATED solution -- that is what saturation
    //      means -- so L2_bar is evaluated at m_sat, which is also what the
    //      sibling does.  Both values come from the shared resolver above, so
    //      there is nothing left here to disagree with it.
    {
        const scalar dHconst =
            unitDict->found("operation")
                ? unitDict->subDict("operation")
                          ->lookupScalarOrDefault("dHcryst", 0.0)
                : 0.0;
        dHcrystPerMol_ = crystallisationHeatPerMol(
            thermo, iSolute_, sat.useElec, sat.mixedSolvent, sat.m_sat,
            T_, dHconst, dHcrystSource_);
        std::cout << "  [BatchCrystalliser] dH_cryst = " << dHcrystPerMol_
                  << " J/mol  [" << dHcrystSource_ << "]\n";
    }

    //  The gaps the saturation left, in the resolver's words -- the same list
    //  the steady crystalliser prints.  Nothing here decides what is missing;
    //  a batch case reaching a mixed solvent used to reach it in silence.
    for (const std::string& note : sat.notes)
        std::cout << "  [BatchCrystalliser] " << note << "\n";
}

// ---- Energy ledger (phase (d)): latent duty as a mu3 state difference -----

void BatchCrystalliser::noteTimeAdvanced(scalar t)
{
    lastTime_ = t;
    if (!timeSeen_)
    {
        timeSeen_    = true;
        segStart_    = t;
        segMu3Start_ = mu3_;
    }
}

void BatchCrystalliser::closeSegment_(scalar t)
{
    if (!timeSeen_) return;
    const scalar dnCryst =
        V_ * rho_c_ * k_v_ * (mu3_ - segMu3Start_) / MW_sol_;   // kmol
    if (dnCryst == 0.0 && t <= segStart_ + 1.0e-12) return;
    if (dnCryst == 0.0) return;               // idled: no duty story

    SimulationResult::EnergyRecord er;
    er.tStart  = segStart_;
    er.tEnd    = t;
    er.unit    = name_;
    er.kind    = "latent";
    er.T_service_K = T_;   // isothermal: the coolant serves at the held T
    // Crystallisation RELEASES the dissolution endotherm: the jacket must
    // remove it to hold T, so the heat ADDED is negative for dH_soln > 0.
    er.E_kJ    = -dHcrystPerMol_ * dnCryst;   // J/mol * kmol = kJ
    er.E_valid = true;
    er.basis   = "isothermal crystallisation: Q = -dH_cryst*dn_cryst,"
                 " n_cryst = V*rho_c*k_v*mu3/MW (state difference);"
                 " dH_cryst from " + dHcrystSource_;
    energyLog_.push_back(std::move(er));
    segStart_    = t;
    segMu3Start_ = mu3_;
}

std::vector<SimulationResult::EnergyRecord>
BatchCrystalliser::energyRecords(scalar tEnd)
{
    closeSegment_(tEnd);
    return energyLog_;
}

scalar BatchCrystalliser::vesselEnthalpy(bool& ok, std::string& why) const
{
    // Dissolved part: the fluid holdup state_.n as liquid at (T, P) --
    // the SAME pricing every fluid vessel gets.
    BatchState diss;
    diss.n = state_.n;
    diss.T = state_.T;
    diss.P = state_.P;
    scalar H = packageEnthalpy_(diss, ok, why);
    if (!ok) return 0.0;

    // Crystal part on the SOLID rung.
    const scalar nCryst =
        (MW_sol_ > 0.0) ? V_ * rho_c_ * k_v_ * mu3_ / MW_sol_ : 0.0;  // kmol
    if (nCryst > 0.0)
    {
        const Component& sol = thermo_->comp(iSolute_);
        if (!sol.hasGibbsData())
        {
            ok  = false;
            why = "no formation datum for crystal '" + sol.name() + "'";
            return 0.0;
        }
        try
        {
            H += nCryst * sol.h_formation(state_.T, "solid");   // kmol*J/mol
        }
        catch (const std::exception& ex)
        {
            ok  = false;
            why = std::string("solid-rung enthalpy failed: ") + ex.what();
            return 0.0;
        }
    }
    return H;
}

scalar BatchCrystalliser::supersaturation_(scalar nSoluteDissolved) const
{
    //  The SAME solvent the resolver measured c_sat_ against: water, plus the
    //  antisolvent when there is one.  Both sides of the ratio on one basis.
    scalar solventMass = state_.n[iSolv_] * MW_solv_;           // kg (·1, kmol·kg/kmol)
    if (iAnti_ < state_.n.size()) solventMass += state_.n[iAnti_] * MW_anti_;
    if (solventMass <= 0.0) return 1.0;
    const scalar c     = (nSoluteDissolved * MW_sol_) / solventMass;  // kg/kg
    //  c_sat_ was resolved ONCE by the shared crystSaturation -- by the ion
    //  route for an electrolyte package, by the solubility curve otherwise.
    //  The model is isothermal, so it is a constant of the campaign.
    return (c_sat_ > 0.0) ? c / c_sat_ : 1.0;
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
