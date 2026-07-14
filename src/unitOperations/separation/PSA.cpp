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

#include "PSA.H"

#include "core/Constants.H"
#include "thermo/adsorbent/Adsorbent.H"
#include "thermo/adsorbent/AdsorbentRegistry.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int PSA::solve(const DictPtr& dict,
               const ThermoPackage& thermo,
               int verbosity)
{
    const std::size_t Ncomp = thermo.n();

    // ---- Inlet stream (deposited by the Flowsheet under feed/composition,
    //      the same pattern as spiralWoundModule / ionExchanger) -----------
    auto feedDict = dict->subDict("feed");
    const scalar F_in = feedDict->lookupScalar("F", Dims::molarFlow);    // kmol/s
    const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);  // K
    const scalar P_in = feedDict->lookupScalar("P", Dims::pressure);     // Pa
    (void) P_in;   // feed P is informational; the swing is set by P_high/P_low
    (void) T_in;   // feed T is informational; the bed runs at operation.T

    auto zDict = dict->subDict("composition");
    sVector z_in(Ncomp, 0.0);
    scalar zSum = 0.0;
    for (const auto& key : zDict->keys())
    {
        const std::size_t i = thermo.indexOf(key);
        z_in[i] = zDict->lookupScalar(key);
        zSum   += z_in[i];
    }
    if (std::abs(zSum - 1.0) > 1.0e-6)
        throw std::runtime_error("psa: feed composition does not sum to 1 "
            "(Sigma z = " + std::to_string(zSum) + ")");

    // ---- operation{} : HARDWARE in, RESULTS out --------------------------
    auto op = dict->subDict("operation");
    for (const auto& k : op->keys())
    {
        // REFUSE result-named keys: recovery / purity / selectivity /
        // productivity are OUTPUTS.  To hit a target, vary the hardware with an
        // outer driver (sweep / optimisation) --- naming an output as an input
        // is exactly the rotating-equipment dishonesty Choupo forbids.
        const bool resultKey =
               k.rfind("recovery", 0)     == 0
            || k.rfind("purity", 0)       == 0
            || k.rfind("selectivity", 0)  == 0
            || k == "productivity"
            || k == "pressureRatio"
            || k == "target";
        if (resultKey)
            throw std::runtime_error("psa operation{}: '" + k + "' is a RESULT, "
                "not a hardware spec.  A PSA takes adsorbent + P_high + P_low + "
                "T + lightKey + purgeRatio + eta + bedCapacity; recovery / purity "
                "/ selectivity / productivity are what it COMPUTES.  To hit a "
                "target, vary the hardware with an outer driver (sweep / "
                "optimisation), do not name the output.");
        if (k != "adsorbent" && k != "P_high" && k != "P_low" && k != "T"
         && k != "lightKey"  && k != "purgeRatio" && k != "eta"
         && k != "bedCapacity" && k != "blowdownLoss")
            throw std::runtime_error("psa operation{}: unknown key '" + k + "'.  "
                "Grammar: adsorbent <name>; P_high <p>; P_low <p>; T <temp>; "
                "lightKey <comp>; purgeRatio <gamma>; eta <0..1>; "
                "bedCapacity <w> (kg adsorbent per mol feed); "
                "[blowdownLoss <fraction>].");
    }

    const std::string adsName = op->lookupWord("adsorbent");
    const scalar P_high = op->lookupScalar("P_high", Dims::pressure);     // Pa
    const scalar P_low  = op->lookupScalar("P_low",  Dims::pressure);     // Pa
    const scalar T_bed  = op->lookupScalar("T",      Dims::temperature);  // K
    const std::string lightKey = op->lookupWord("lightKey");
    const scalar gamma  = op->lookupScalar("purgeRatio");                 // -
    const scalar eta    = op->lookupScalarOrDefault("eta", 0.80);         // -
    const scalar w      = op->lookupScalar("bedCapacity");                // kg/mol feed
    const bool   hasBlowdown = op->found("blowdownLoss");
    const scalar f_bd   = hasBlowdown ? op->lookupScalar("blowdownLoss") : 0.0;

    // ---- Spec sanity (loud, no silent crutch) ----------------------------
    if (P_high <= P_low)
        throw std::runtime_error("psa operation{}: P_high must exceed P_low "
            "(the swing P_high -> P_low is what regenerates the bed).");
    if (gamma < 0.0 || gamma >= 1.0)
        throw std::runtime_error("psa operation{}: purgeRatio (gamma) must be "
            "in [0,1) --- it is the fraction of the light product spent as "
            "countercurrent sweep.");
    if (eta <= 0.0 || eta > 1.0)
        throw std::runtime_error("psa operation{}: eta must be in (0,1] "
            "(equilibrium-utilisation derating; 1 = thermodynamic ceiling).");
    if (w <= 0.0)
        throw std::runtime_error("psa operation{}: bedCapacity (w) must be > 0.");
    if (hasBlowdown && (f_bd < 0.0 || f_bd >= 1.0))
        throw std::runtime_error("psa operation{}: blowdownLoss must be in [0,1).");
    const std::size_t iLK = thermo.indexOf(lightKey);   // loud if absent

    const Adsorbent& ads = AdsorbentRegistry::byName(adsName);

    // ---- Partial pressures [Pa] at each swing level -----------------------
    // Canonical SI at the interface; each equilibrium record declares its own
    // pressure basis (e.g. partialPressureBar) and the IsothermModel converts.
    std::map<std::string, scalar> pHigh, pLow;
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        const std::string nm = thermo.comp(i).name();
        pHigh[nm] = z_in[i] * P_high;
        pLow [nm] = z_in[i] * P_low;
    }

    // ---- Competitive Langmuir loadings + working capacity ----------------
    sVector q_high(Ncomp, 0.0), q_low(Ncomp, 0.0), Dq(Ncomp, 0.0);
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        const std::string nm = thermo.comp(i).name();
        q_high[i] = ads.loading(nm, pHigh, T_bed);
        q_low [i] = ads.loading(nm, pLow,  T_bed);
        // eta applied ONCE, here (the LUB / utilisation derating).  Guard a
        // (numerically) negative swing to 0 --- with fixed composition a higher
        // total pressure never lowers a species' loading, so this only trips on
        // round-off.
        Dq[i] = std::max<scalar>(0.0, eta * (q_high[i] - q_low[i]));
    }

    // ---- Captured-to-tail flow S_i (clamp = full capture, announced) -----
    sVector S(Ncomp, 0.0);
    bool anyClamp = false;
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        const scalar avail   = z_in[i] * F_in;        // kmol/s available
        const scalar capacity = Dq[i] * w * F_in;     // kmol/s the swing could hold
        S[i] = std::min(capacity, avail);
        if (capacity > avail + 1.0e-15 && avail > 0.0)
        {
            anyClamp = true;
            if (verbosity >= 3)
                std::cout << "  [clamp] " << thermo.comp(i).name()
                          << ": swing capacity " << capacity << " kmol/s exceeds "
                             "the feed supply " << avail << " kmol/s -> FULL "
                             "capture (the bed is over-sized for this species)\n";
        }
    }

    scalar S_tot = 0.0;
    for (std::size_t i = 0; i < Ncomp; ++i) S_tot += S[i];
    if (S_tot >= F_in)
        throw std::runtime_error("psa: the bed captures the entire feed "
            "(Sigma S_i >= F).  Reduce bedCapacity --- nothing is left for the "
            "raffinate product.");

    const scalar G = gamma * F_in;                    // kmol/s purge sweep
    if (G >= F_in - S_tot)
        throw std::runtime_error("psa: purge G = gamma*F exceeds the raffinate "
            "produced (F - Sigma S).  Lower purgeRatio.");

    // ---- Raffinate composition: fixed-point sweep ------------------------
    // n_i,R = z_i F - S_i - G x_i,R ; x_i,R = n_i,R / Sum n_R.  Seeded with the
    // no-purge split.  (The total raffinate flow F - S_tot - G is invariant
    // because Sum x_R = 1, so this converges in ~1-2 visible sweeps.)
    sVector x_R(Ncomp, 0.0);
    {
        const scalar denom0 = F_in - S_tot;
        for (std::size_t i = 0; i < Ncomp; ++i)
            x_R[i] = (z_in[i] * F_in - S[i]) / denom0;     // seed (sums to 1)
    }
    clearResiduals();
    const int maxSweep = 50;
    for (int sweep = 0; sweep < maxSweep; ++sweep)
    {
        sVector nR(Ncomp, 0.0);
        scalar nR_tot = 0.0;
        for (std::size_t i = 0; i < Ncomp; ++i)
        {
            nR[i]  = std::max<scalar>(0.0, z_in[i] * F_in - S[i] - G * x_R[i]);
            nR_tot += nR[i];
        }
        scalar resid = 0.0;
        for (std::size_t i = 0; i < Ncomp; ++i)
        {
            const scalar xnew = (nR_tot > 0.0) ? nR[i] / nR_tot : 0.0;
            resid = std::max(resid, std::abs(xnew - x_R[i]));
            x_R[i] = xnew;
        }
        recordResidual(resid);
        if (resid < 1.0e-12) break;
    }

    // ---- Final per-component split (kmol/s) ------------------------------
    sVector nR(Ncomp, 0.0), nT(Ncomp, 0.0);
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        nR[i] = std::max<scalar>(0.0, z_in[i] * F_in - S[i] - G * x_R[i]);
        nT[i] = S[i] + G * x_R[i];
    }

    // ---- Blowdown / pressurisation loss (CORRECTION 3) -------------------
    // Vent f_bd of the light product with the tail; if absent, WARN that the
    // ~10-15 % H2-PSA recovery penalty is unmodelled.
    if (hasBlowdown && f_bd > 0.0)
    {
        const scalar loss = f_bd * nR[iLK];
        nR[iLK] -= loss;
        nT[iLK] += loss;
    }

    scalar nR_tot = 0.0, nT_tot = 0.0;
    for (std::size_t i = 0; i < Ncomp; ++i) { nR_tot += nR[i]; nT_tot += nT[i]; }

    // ---- Build the two product streams -----------------------------------
    out_.clear();
    {
        ProcessStream raf;
        raf.name = "raffinate";
        raf.T = T_bed; raf.P = P_high; raf.vf = 1.0;
        raf.F = nR_tot;
        raf.z.assign(Ncomp, 0.0);
        for (std::size_t i = 0; i < Ncomp; ++i)
            raf.z[i] = (nR_tot > 0.0) ? nR[i] / nR_tot : 0.0;
        out_.push_back(std::move(raf));

        ProcessStream tail;
        tail.name = "tailgas";
        tail.T = T_bed; tail.P = P_low; tail.vf = 1.0;
        tail.F = nT_tot;
        tail.z.assign(Ncomp, 0.0);
        for (std::size_t i = 0; i < Ncomp; ++i)
            tail.z[i] = (nT_tot > 0.0) ? nT[i] / nT_tot : 0.0;
        out_.push_back(std::move(tail));
    }

    // ---- Heaviest (most-adsorbed) species: max Dq, excluding the light key
    std::size_t iHeavy = iLK;
    scalar      DqHeavy = -1.0;
    for (std::size_t i = 0; i < Ncomp; ++i)
        if (i != iLK && Dq[i] > DqHeavy) { DqHeavy = Dq[i]; iHeavy = i; }

    // ---- KPIs ------------------------------------------------------------
    kpis_.clear();
    const scalar feedLK = z_in[iLK] * F_in;
    kpis_["recovery_" + lightKey] = (feedLK > 0.0) ? nR[iLK] / feedLK : 0.0;
    kpis_["purity_"   + lightKey] = (nR_tot > 0.0) ? nR[iLK] / nR_tot : 0.0;
    for (std::size_t i = 0; i < Ncomp; ++i)
        kpis_["Dq_" + thermo.comp(i).name()] = Dq[i];
    kpis_["eta_used"]     = eta;
    kpis_["productivity"] = (w > 0.0) ? nR[iLK] / w : 0.0;   // mol LK / kg basis
    if (Dq[iLK] > 0.0)
        for (std::size_t i = 0; i < Ncomp; ++i)
            if (i != iLK)
                kpis_["selectivity_" + thermo.comp(i).name() + "_" + lightKey]
                    = Dq[i] / Dq[iLK];
    if (iHeavy != iLK && nT_tot > 0.0)
        kpis_["tailgas_purity_" + thermo.comp(iHeavy).name()] = nT[iHeavy] / nT_tot;
    kpis_["pressureRatio"] = P_high / P_low;
    kpis_["purgeRatio"]    = gamma;
    if (hasBlowdown) kpis_["blowdown_recovery_penalty"] = f_bd;

    // ---- Profile (per-component swing table) -----------------------------
    profile_ = UnitProfile{};
    profile_->xAxis = "componentIndex";
    auto& cols = profile_->columns;
    sVector idx(Ncomp), yf(Ncomp), qa(Ncomp), qr(Ncomp), dqv(Ncomp),
            toT(Ncomp), toR(Ncomp);
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        idx[i] = static_cast<scalar>(i);
        yf [i] = z_in[i];
        qa [i] = q_high[i];
        qr [i] = q_low[i];
        dqv[i] = Dq[i];
        toT[i] = nT[i];
        toR[i] = nR[i];
    }
    cols["componentIndex"]    = std::move(idx);
    cols["y_feed"]            = std::move(yf);
    cols["q_ads_molkg"]       = std::move(qa);
    cols["q_reg_molkg"]       = std::move(qr);
    cols["Dq_molkg"]          = std::move(dqv);
    cols["to_tail_kmol_s"]    = std::move(toT);
    cols["to_raffinate_kmol_s"] = std::move(toR);

    // ---- Report ----------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Pressure-swing adsorption  ===\n"
                  << "  Adsorbent:   " << ads.name();
        if (!ads.type().empty()) std::cout << "  (" << ads.type() << ")";
        std::cout << "\n  Swing:       " << std::fixed << std::setprecision(2)
                  << P_high * constant::Pa_to_bar << " -> " << P_low * constant::Pa_to_bar
                  << " bar  (ratio " << std::setprecision(1)
                  << P_high / P_low << ")"
                  << (P_low * constant::Pa_to_bar < 1.0 ? "  [VSA: sub-atmospheric]" : "")
                  << "\n  Bed T:       " << std::setprecision(2) << T_bed
                  << " K  (ISOTHERMAL --- the shortcut's stated assumption)\n"
                  << "  Productivity: " << std::setprecision(4)
                  << kpis_["productivity"] << "  = kmol light-key per second / bedCapacity w"
                     " [kg adsorbent per mol feed] -- a shortcut figure for"
                     " COMPARING beds, not a physical flux\n"
                  << "  Purge:       gamma = " << std::setprecision(3) << gamma
                  << "  -> G = " << std::setprecision(4) << (gamma * F_in)
                  << " kmol/s of light product swept to the tail"
                     " (the DOMINANT recovery loss in a Skarstrom cycle)\n"
                  << "  eta:         " << std::setprecision(3) << eta
                  << (std::abs(eta - 1.0) < 1.0e-9
                        ? "  (== 1: THERMODYNAMIC CEILING, no LUB derating)"
                        : "  (equilibrium-utilisation / LUB derating)")
                  << "\n  Light key:   " << lightKey << "  -> raffinate (product, "
                     "high-P)\n\n"
                  << "  comp     y_feed   q_ads    q_reg     Dq    ->raffinate"
                     "   ->tail   q_ads/q_reg/Dq [mol/kg] . flows [kmol/s]\n";
        for (std::size_t i = 0; i < Ncomp; ++i)
            std::cout << "  " << std::left << std::setw(7) << thermo.comp(i).name()
                      << std::right << std::fixed
                      << std::setw(8) << std::setprecision(4) << z_in[i]
                      << std::setw(9) << std::setprecision(3) << q_high[i]
                      << std::setw(9) << std::setprecision(3) << q_low[i]
                      << std::setw(8) << std::setprecision(3) << Dq[i]
                      << std::setw(13) << std::setprecision(5) << nR[i]
                      << std::setw(11) << std::setprecision(5) << nT[i] << "\n";
        std::cout << std::defaultfloat
                  << "\n  " << lightKey << " recovery:  " << std::fixed
                  << std::setprecision(2) << 100.0 * kpis_["recovery_" + lightKey]
                  << " %    " << lightKey << " purity:  " << std::setprecision(3)
                  << 100.0 * kpis_["purity_" + lightKey] << " %\n";
        if (iHeavy != iLK)
            std::cout << "  tail enriched in " << thermo.comp(iHeavy).name()
                      << " to " << std::setprecision(2)
                      << 100.0 * (nT_tot > 0.0 ? nT[iHeavy] / nT_tot : 0.0)
                      << " % (feed " << 100.0 * z_in[iHeavy] << " %)\n";
        if (anyClamp)
            std::cout << "  [note] at least one species is FULLY captured (bed "
                         "over-sized for it) --- see [clamp] lines above\n";
        if (!hasBlowdown)
            std::cout << "  [caveat] blowdownLoss not set: the ~10-15 % of "
                         "light-product recovery lost to blowdown / "
                         "pressurisation gas is UNMODELLED here\n";

        std::cout <<
            "\n  +-- EQUILIBRIUM PSA SHORTCUT --- what this does NOT model -----------+\n"
            "  | * Breakthrough & cycle time: no breakthrough curve, no kinetics;   |\n"
            "  |   it cannot tell you WHEN to switch valves or how long a cycle is.  |\n"
            "  | * Mass-transfer zone / LUB: finite LDF resistance leaves an unused  |\n"
            "  |   front --- captured here only through the eta derating (eta<1).    |\n"
            "  | * Co-adsorption beyond first order: extended Langmuir is first-     |\n"
            "  |   order competition; energetically heterogeneous surfaces need IAST |\n"
            "  |   (named, not built).                                               |\n"
            "  | * Thermal swing: adsorption is exothermic (CO2 on 5A ~ 35-45        |\n"
            "  |   kJ/mol); the released heat raises T and LOWERS loading.  The      |\n"
            "  |   isothermal assumption over-predicts capacity, worst for CO2.      |\n"
            "  | * Blowdown / pressurisation gas loss (~10-15 % of H2 recovery) is   |\n"
            "  |   captured only if blowdownLoss is set explicitly.                  |\n"
            "  | * No hydraulics: no Ergun dP, velocity, fluidisation, dispersion,   |\n"
            "  |   channelling, ageing or poisoning.                                 |\n"
            "  | * Isotherm validity: Langmuir is a single-site Type-I idealisation; |\n"
            "  |   the shipped 298 K params are order-of-magnitude TEACHING fits ---  |\n"
            "  |   re-fit from the primary isotherm dataset before any design number.|\n"
            "  +--------------------------------------------------------------------+\n"
            "=========================================================\n\n";
    }

    return 0;
}

} // namespace Choupo
