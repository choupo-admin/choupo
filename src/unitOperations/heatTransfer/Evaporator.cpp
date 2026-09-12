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

#include "Evaporator.H"
#include "solver/NewtonRaphson.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include "streams/StreamMass.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/ElectrolyteModel.H"
#include "thermo/electrolyte/UnmodelledSolutes.H"
#include "core/Advisory.H"
#include "core/Constants.H"

#include <cmath>
#include <iomanip>
#include <numeric>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include "thermo/vaporPressure/VaporPressureModel.H"

namespace Choupo {

int Evaporator::solve(const DictPtr& dict,
                      const ThermoPackage& thermo,
                      int verbosity)
{
    // -------------------------------------------------------------------
    //  Inputs (two streams: feed [liquid] and heatingSteam [vapour]).
    //  The Flowsheet's buildAugmentedDict writes them under
    //  `inputStreams ( {...feed...} {...heatingSteam...} )` when the
    //  unit declares `inputs (feed heatingSteam );`.
    // -------------------------------------------------------------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("Evaporator: expected exactly 2 input"
            " streams (feed liquid + heating steam); got "
            + std::to_string(ins.size()) + ".  Declare in flowsheetDict"
            " as  inputs (feedName steamName );");
    auto feedDict  = ins[0];
    auto steamDict = ins[1];

    const std::size_t n = thermo.n();

    // ---- Feed: composition + F + T_feed ----
    const scalar F_in_kmols = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_feed     = feedDict->lookupScalar("T", Dims::temperature);

    auto feedComp = feedDict->subDict("composition");
    sVector z(n, 0.0);
    {
        scalar zsum = 0.0;
        for (const auto& key : feedComp->keys())
        {
            std::size_t i = thermo.indexOf(key);
            z[i] = feedComp->lookupScalar(key);
            zsum += z[i];
        }
        if (zsum > 0.0) for (auto& v : z) v /= zsum;
    }

    // ---- Heating steam: T (F is read below, with the duty it sets) ----
    const scalar T_steam = steamDict->lookupScalar("T", Dims::temperature);
    const scalar P_chest = steamDict->lookupScalarOrDefault("P", 0.0);

    //  ---- THE CHEST MUST ARRIVE AS VAPOUR, AND UNTIL NOW NOBODY ASKED ----
    //
    //  This unit's duty is `Q = F_chest * dHvap(T_steam)` (below).  That single
    //  line ASSERTS a complete condensation, saturated vapour -> saturated
    //  liquid, and the unit read only `T` and `F` off the chest stream: `vf`
    //  appeared nowhere in this file except on the three outlets.  So a chest
    //  stream carrying LIQUID water was accepted in silence, the unit delivered
    //  its full latent heat to the process, and the plant boundary -- which
    //  prices the same stream on what it carries -- credited none of it.
    //
    //  Measured 2026-09-12 on the six evaporator cases whose chest file omits
    //  the word: `H(chest inlet)` and `H(condensate outlet)` came out EQUAL TO
    //  THE LAST PRINTED DIGIT, so the chest leg contributed exactly 0.000000 kW
    //  where the unit had just spent 487.49 kW of it.  `evaporator06` published
    //  a first-law residual of -485.694246 kW -- 99.6 % of its own duty -- at
    //  exit 0, and five more read the same number because they read the same
    //  file.
    //
    //  WHY THE CASES LOOKED RIGHT.  A saturated steam supply sits exactly ON
    //  the saturation curve, and that is the one place where (T, P) cannot say
    //  which side of it you are on: `0/saturatedSteam130C` declares
    //  T = 401.6288333 K and P = 270000 Pa, and the case's own Antoine returns
    //  Psat(401.6288333) = 270000.72 Pa.  The state is correct and incomplete,
    //  and the default for the missing word is LIQUID.
    //
    //  The rule and its posture are `DistillationColumn`'s, from the same week
    //  and the same family (`resolveStreamThermalState`, one home in
    //  `flash/StreamEquilibrium.H`): resolve the stream at its own (T, P, z)
    //  unless the author PINNED it, then refuse a disagreement by name and
    //  name the edit.  The engine may not choose which of the two is true.
    {
        auto steamComp = steamDict->subDict("composition");
        sVector zSteam(n, 0.0);
        scalar  zsSum = 0.0;
        for (const auto& key : steamComp->keys())
        {
            const std::size_t i = thermo.indexOf(key);
            zSteam[i] = steamComp->lookupScalar(key);
            zsSum    += zSteam[i];
        }
        if (zsSum > 0.0) for (auto& v : zSteam) v /= zsSum;

        const std::string sName =
            steamDict->lookupWordOrDefault("streamName", "the heating steam");
        const std::string uName = dict->name();
        const auto chest = flashState::resolveStreamThermalState(
            steamDict, T_steam, P_chest, zSteam, thermo,
            "evaporator '" + uName + "' heating steam '" + sName + "'");

        if (chest.vf < 1.0 - 1.0e-6)
        {
            std::ostringstream os;
            os.setf(std::ios::fixed);
            os << std::setprecision(6);
            os << "Evaporator '" << uName << "': the heating stream '" << sName
               << "' is not vapour -- its thermal state at T = " << T_steam
               << " K, P = " << P_chest << " Pa is vapour fraction "
               << chest.vf << " (" << chest.origin << ").\n"
                  "  This unit's duty is Q = F_chest * dHvap(T_steam), which"
                  " ASSERTS that the chest stream condenses completely from"
                  " saturated vapour to saturated liquid.  A chest that arrives"
                  " as liquid carries none of that heat across the plant"
                  " boundary, so the unit would spend energy the first law"
                  " never sees -- and the engine will not choose between the"
                  " model and the stream.  Pick the one that is TRUE of your"
                  " chest:\n"
                  "    * it IS steam -> add `phase gas;` to the stream's"
                  " state file `0/" << sName << "`.  The word is needed even"
                  " when the state looks unmistakable: a SATURATED supply sits"
                  " exactly ON the saturation curve, the one place where"
                  " (T, P) cannot say which side it is on, and a SUPERHEATED"
                  " one resolves single-phase -- which this engine reports as"
                  " `no split` rather than as `vapour`, so the carried default"
                  " stands.  That default is LIQUID.\n"
                  "    * it is NOT steam -> this unit is the wrong model for"
                  " it; an evaporator heated by a sensible-heat medium needs a"
                  " duty that is not a latent heat.";
            throw std::runtime_error(os.str());
        }
    }

    // ---- Operation: HARDWARE parameters only (Mode 2) ----
    //  Per the credo, the operation block carries only hardware /
    //  geometric / material data:  the heat-exchange surface `area`
    //  and the overall HTC `U`.  The operating pressure of the vessel
    //  is NOT a parameter --- it is a stream property of the vapour
    //  outlet, computed below from the heat balance and the saturation
    //  curve.  Tref is optional, for sensible-enthalpy integrals.
    auto operDict = dict->subDict("operation");
    const scalar A     = operDict->lookupScalar("area", Dims::area);
    const scalar U     = operDict->lookupScalar("U",
                                                Dims::heatTransfer_h);
    const scalar Tref  = operDict->lookupScalarOrDefault("Tref", 298.15);

    // If the thermoPackage declares an electrolyteModel (e.g. Pitzer), the
    // boiling-point elevation comes from its solvent activity a_w -- accurate
    // to saturation -- instead of the ideal ebullioscopic K_b * m (linear,
    // wrong for a concentrated brine).  Selected in the PACKAGE, not here.
    const bool useElectrolyte = thermo.hasElectrolyte();

    // HONEST OMISSION (no silent crutch): the energy balance below uses the
    // IDEAL-mixture liquid enthalpy (sensible + latent, per pure component) and
    // therefore DROPS the heat of dilution.  For a strong electrolyte
    // (NaOH/NaCl/...) that heat is large and concentration-dependent, so the
    // duty is approximate until the salt's apparent molar enthalpy L_phi is
    // calorimetrically fitted.  Announce it (loud + as an advisory the GUI
    // surfaces).  See docs/electrolyte-enthalpy-spec.md.
    const bool lphiFitted = useElectrolyte
        && thermo.electrolyte().calorimetricFit()
        && thermo.electrolyte().hasAqueousReference();
    if (lphiFitted && verbosity >= 1)
        std::cout << "  [electrolyte] heat of dilution INCLUDED: '"
                  << thermo.electrolyte().soluteName()
                  << "' carries a calorimetrically fitted L_phi (Parker-validated)"
                     " -- the duty climbs the measured dilution curve.\n";
    if (useElectrolyte && !thermo.electrolyte().calorimetricFit())
    {
        const std::string salt = thermo.electrolyte().soluteName();
        const std::string msg =
            "solution enthalpy is IDEAL-mixture -- the heat of dilution of '"
            + salt + "' is OMITTED (params not calorimetrically fitted), so the"
            " evaporator duty is approximate.";
        AdvisoryLog::instance().add(
            "electrolyte", "warning",
            "evaporator '" + dict->lookupWordOrDefault("name", "evaporator") + "'",
            msg);
        if (verbosity >= 1)
            std::cout << "  [electrolyte] " << msg << "\n";
    }

    if (A <= 0.0)
        throw std::runtime_error("Evaporator: `area` must be > 0");
    if (U <= 0.0)
        throw std::runtime_error("Evaporator: `U` must be > 0");
    if (T_steam <= 0.0)
        throw std::runtime_error("Evaporator: heating-steam T must be > 0");

    // -------------------------------------------------------------------
    //  Identify the solvent (volatile or solute component); the rest
    //  are non-volatile solutes whose mass stays in the concentrated
    //  liquid.  Exactly one volatile species expected.
    // -------------------------------------------------------------------
    std::size_t iSolvent = thermo.n();
    for (std::size_t i = 0; i < n; ++i)
    {
        if (z[i] <= 0.0) continue;   // only species ACTUALLY in this feed --- a
                                     // global thermoPackage (e.g. a plant's) may
                                     // carry components this sector does not use
        const std::string& r = thermo.comp(i).role();
        if (r == "volatile" || r == "solute")
        {
            if (iSolvent != thermo.n())
                throw std::runtime_error("Evaporator: multiple volatile"
                    " components in feed --- this single-effect model"
                    " supports exactly one (the solvent)");
            iSolvent = i;
        }
    }
    if (iSolvent == thermo.n())
        throw std::runtime_error("Evaporator: feed has no volatile species"
            " --- a solvent is required for evaporation");
    const Component& solv = thermo.comp(iSolvent);
    const scalar MW_solv  = solv.MW();
    const scalar K_b      = solv.K_b();          // 0 if not declared

    // -------------------------------------------------------------------
    //  Helpers
    // -------------------------------------------------------------------
    //  TWO molalities, because there are two questions.
    //
    //  The ebullioscopic constant is COLLIGATIVE: K_b*m needs the molality of
    //  everything dissolved, whatever it is.  The electrolyte model is not
    //  colligative: it was regressed on ONE salt, and handing it the sum of
    //  every nonvolatile in the feed asks it about a solution it has never
    //  seen.  The helper below took the sum and served both callers, so a
    //  liquor carrying a salt AND anything else nonvolatile got its water
    //  activity and its heat of dilution evaluated at a molality that was
    //  partly some other substance -- silently, since the number is plausible.
    //
    //  `which` = n (the package size) means "everything dissolved".
    auto molality_of = [&](scalar VoF, std::size_t which) -> scalar
    {
        const scalar Lf = 1.0 - VoF;
        if (Lf <= 1.0e-12) return 1.0e3;
        scalar x_sol = 0.0, x_all = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (i == iSolvent) continue;
            x_all += z[i] / Lf;
            if (which == n || i == which) x_sol += z[i] / Lf;
        }
        const scalar x_solv = 1.0 - x_all;      // the SOLVENT mass is the basis
        if (x_solv <= 1.0e-9) return 1.0e3;     //   whichever solute is counted
        return x_sol * 1000.0 / (x_solv * MW_solv);
    };
    //- Colligative: every dissolved species.
    auto molality_solute = [&](scalar VoF) { return molality_of(VoF, n); };
    //- The electrolyte model's own basis: its salt alone.
    auto molality_salt = [&](scalar VoF)
    {
        return molality_of(VoF, useElectrolyte ? thermo.electrolyte().soluteIndex() : n);
    };

    auto dHvap_solv = [&](scalar T) -> scalar
    {
        return solv.Hvap_latent(T);
    };

    // Heat of dilution (slice 4, docs/electrolyte-enthalpy-spec.md):
    // concentrating the liquor climbs the MEASURED L_phi curve --
    //   Q_dil = n_salt [ L_phi(m_out, T_boil) - L_phi(m_in, T_feed) ]   [W]
    // Positive for NaOH-class salts (concentrating caustic absorbs extra
    // heat).  Zero unless the salt is calorimetrically fitted (the slice-0
    // announcement covers the omission honestly).
    auto Q_dilution = [&](scalar VoF, scalar T_boil) -> scalar
    {
        if (!lphiFitted) return 0.0;
        const auto& el = thermo.electrolyte();
        const scalar m_in  = molality_salt(0.0);
        const scalar m_out = molality_salt(VoF);
        const scalar n_salt_mol_s = F_in_kmols * 1000.0 * z[el.soluteIndex()];
        return n_salt_mol_s * (el.apparentMolarEnthalpy(m_out, T_boil)
                             - el.apparentMolarEnthalpy(m_in,  T_feed));
    };

    auto Q_required = [&](scalar VoF, scalar T_boil) -> scalar
    {
        // Strict balance for a feed→{L_concentrated, V_solvent} split:
        //
        //   Q = F · Σ_i z_i · [H_liq,i(T_boil) − H_liq,i(T_feed)]
        //       + V · ΔHvap_solv(T_boil)
        //
        // Derivation: assume ideal liquid mixing (no Hmix) and pure-
        // solvent vapour.  Species mass balance gives the L outlet
        // contribution back as F·z_i·H_liq,i(T_boil); the V outlet then
        // adds V·ΔHvap to the V·H_liq,solv(T_boil) already accounted
        // for inside the F·z·H_liq term.  Net result: the SENSIBLE
        // load is on the WHOLE feed (not just the concentrate), and
        // the LATENT load is on V only.  Components without a liquid
        // Cp polynomial contribute zero sensibly (e.g. nonvolatile
        // solutes whose Cp is not yet curated).
        scalar dH_per_mol_feed = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (!thermo.comp(i).hasCpLiquid()) continue;
            dH_per_mol_feed += z[i] * (thermo.comp(i).Hliq_pure(T_boil, Tref)
              - thermo.comp(i).Hliq_pure(T_feed, Tref) );
        }
        const scalar F_mol_s = F_in_kmols * 1000.0;
        const scalar V_mol_s = VoF * F_mol_s;
        return F_mol_s * dH_per_mol_feed + V_mol_s * dHvap_solv(T_boil)
             + Q_dilution(VoF, T_boil);
    };

    // -------------------------------------------------------------------
    //  Mode-2 solve  (credo-pure)
    //
    //  Q is set by chest condensation:    Q = F_chest · ΔHvap(T_steam).
    //  The heat exchanger has fixed hardware (area A, coefficient U),
    //  so the available driving force is uniquely determined:
    //      ΔT = Q / (U · A)        =>     T_boil = T_steam − ΔT.
    //  No V/F coupling here --- T_boil is a function of HARDWARE and
    //  CHEST-SUPPLY only, not of process-side composition.
    //
    //  V/F then follows from the process-side energy balance in
    //  closed form (the equation Q_required(V, T_boil) = Q is linear
    //  in V for fixed T_boil --- mass balance gives x_L, and the
    //  sensible / latent terms are explicit).  Newton-1D is still used
    //  for robustness against tiny non-linearities (HvapTb scaling).
    //
    //  P_op (the operating pressure of the vessel) is then computed
    //  from T_boil via the saturation curve of the pure solvent, with
    //  BPE correction:
    //      T_boil = T_sat,pure(P_op) + K_b · m_solute(x_L)
    //  =>  P_op = P_sat,pure(T_boil − K_b · m_solute).
    //  This is the credo-pure assignment: P_op is a RESULT (a stream
    //  property of vapour & liquid outputs), not a user input.
    // -------------------------------------------------------------------
    const scalar F_steam_kmols   = steamDict->lookupScalar("F", Dims::molarFlow);
    const scalar F_steam_mol_s   = F_steam_kmols * 1000.0;
    const scalar dHvap_at_steam  = dHvap_solv(T_steam);
    const scalar Q_J_s           = F_steam_mol_s * dHvap_at_steam;
    F_steam_kmol_s_              = F_steam_kmols;

    const scalar dT_achieved = Q_J_s / (U * A);
    const scalar T_boil      = T_steam - dT_achieved;

    if (T_boil <= 273.0 || T_boil >= T_steam)
        throw std::runtime_error("Evaporator: heat-balance gave a"
            " non-physical T_boil = " + std::to_string(T_boil)
            + " K (T_steam = " + std::to_string(T_steam) + " K).  "
            "Either the chest steam flow is too large for this U·A,"
            " or U·A is too small for the chest flow.");

    // Newton-1D in V/F on the process-side energy balance, with
    // T_boil fixed.  The residual is monotone in V/F so the bracket
    // [0, 0.999] is safe.  Converges in ~1-2 it. because the problem
    // is essentially linear in V at fixed T_boil.
    auto g = [&](scalar VoF)
    {
        return Q_required(VoF, T_boil) - Q_J_s;
    };
    auto dg = [&](scalar VoF)
    {
        const scalar h = 1.0e-4;
        return (g(VoF + h) - g(VoF - h)) / (2.0 * h);
    };

    solver::NROptions nro;
    nro.tolerance = 1.0;
    nro.maxIter   = 80;
    nro.lower     = 0.0;
    nro.upper     = 0.999;
    nro.bracket   = true;
    nro.monotoneIncreasing = true;
    nro.maxStep   = 0.2;
    nro.onIter = [this, verbosity](const solver::NRTrace& tr) {
        recordResidual(std::abs(tr.f));
        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(6)
                      << std::setw(9) << tr.x
                      << "  " << std::scientific << std::setprecision(4)
                      << std::setw(13) << tr.f << "\n";
        }
    };
    const scalar F_mol_s = F_in_kmols * 1000.0;
    scalar VF0 = Q_J_s / std::max(1.0, F_mol_s * dHvap_solv(T_boil));
    VF0 = std::min(0.95, std::max(0.05, VF0));
    auto r = solver::newton1D(g, dg, VF0, nro);
    const scalar V_over_F = r.x;

    // Compute P_op from T_boil, BPE-corrected:
    //   T_boil = T_sat_pure(P_op) + K_b · m_solute(x_L)
    // => P_op = P_sat_pure(T_boil − BPE ).
    scalar BPE;
    //  The molality a_w is ACTUALLY evaluated at, carried to the report rather
    //  than recomputed there.  A report that recomputes what it claims to
    //  describe can describe something the model never did -- and did: this
    //  line printed the salt molality while a_w had been handed the total, and
    //  no reader (nor gate) could tell.
    scalar awMolality = 0.0;
    if (useElectrolyte)
    {
        // Activity-based BPE: a_w * Psat_pure(T_boil) = Psat_pure(T_boil - BPE).
        // Clausius-Clapeyron -> BPE = -(R T_boil^2 / dHvap) ln a_w  (a_w<1 -> BPE>0).
        awMolality = molality_salt(V_over_F);
        const scalar aw = thermo.electrolyte().waterActivity(awMolality, T_boil);
        BPE = -(constant::R * T_boil * T_boil / dHvap_solv(T_boil)) * std::log(aw);

        //  The BPE is now the SALT's alone.  If the liquor carries other
        //  nonvolatiles they still depress the vapour pressure, and this model
        //  has nothing to price them with -- measured and worded in one place
        //  (thermo/electrolyte/UnmodelledSolutes), stated here.
        if (verbosity >= 1)
        {
            sVector xL(n, 0.0);
            const scalar Lf = std::max(1.0e-12, 1.0 - V_over_F);
            for (std::size_t i = 0; i < n; ++i)
                xL[i] = (i == iSolvent) ? 0.0 : z[i] / Lf;
            xL[iSolvent] = std::max(0.0, 1.0 - std::accumulate(xL.begin(), xL.end(), scalar(0)));
            const auto foreign = unmodelledSolutes(
                thermo, xL, {iSolvent}, thermo.electrolyte().soluteIndex());
            if (foreign.any())
                std::cout << "  " << foreign.note(thermo.electrolyte().soluteName(),
                                                  "The water activity, and so the"
                                                  " boiling-point rise,") << "\n";
        }
    }
    else
        BPE = K_b * molality_solute(V_over_F);     // ideal ebullioscopic fallback
    const scalar T_sat_pure_at_Pop = T_boil - BPE;
    const scalar P_op = solv.vp().Psat_Pa(T_sat_pure_at_Pop);
    const scalar Tsat_pure = T_sat_pure_at_Pop;

    // -------------------------------------------------------------------
    //  Build outlet streams, KPIs, report.
    // -------------------------------------------------------------------
    sVector x_L(n, 0.0);
    {
        const scalar Lf = std::max(1.0e-12, 1.0 - V_over_F);
        scalar sum_sol = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (i == iSolvent) continue;
            x_L[i] = z[i] / Lf;
            sum_sol += x_L[i];
        }
        x_L[iSolvent] = std::max(0.0, 1.0 - sum_sol);
        scalar s = 0.0; for (auto v : x_L) s += v;
        if (s > 0.0) for (auto& v : x_L) v /= s;
    }
    sVector y_V(n, 0.0);
    y_V[iSolvent] = 1.0;

    sVector y_cond(n, 0.0);
    y_cond[iSolvent] = 1.0;

    const scalar molality     = molality_solute(V_over_F);   // colligative: all solutes
    const scalar molalitySalt = molality_salt(V_over_F);      // the electrolyte model's own
    const scalar dT       = dT_achieved;
    const scalar economy  = (F_steam_kmols > 0.0)
                          ? (V_over_F * F_in_kmols) / F_steam_kmols
                        : 0.0;

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Evaporator Result  ====================\n"
                  << "  Heat exchanger:  area = " << A << " m²,  U = " << U
                  << " W/(m²·K)  (HARDWARE)\n"
                  << "  Heating side:    T_steam = " << std::fixed << std::setprecision(2)
                  << T_steam << " K  ("
                  << (T_steam - 273.15) << " °C)\n"
                  << "                   F_steam = "
                  << std::fixed << std::setprecision(2)
                  << (F_steam_kmols * 3600.0 * MW_solv) << " kg/h  (chest input)\n"
                  << "  Duty Q = F_chest · ΔHvap = " << std::scientific << std::setprecision(4)
                  << Q_J_s << " W  (= " << std::fixed << std::setprecision(1)
                  << (Q_J_s / 1000.0) << " kW)\n"
                  << "  ΔT = Q / (U·A) = " << std::fixed << std::setprecision(2)
                  << dT << " K\n"
                  << "  -----  COMPUTED process-side state  -----\n"
                  << "  T_boil = T_steam − ΔT = " << std::setprecision(2)
                  << T_boil << " K  (" << (T_boil - 273.15) << " °C)\n"
                  << (useElectrolyte
                        ? ("  BPE = electrolyte a_w(m=" + std::to_string(awMolality)
                           + ") -> " + std::to_string(BPE) + " K  (electrolyte model)\n")
                        : ("  BPE = K_b · m_solute = " + std::to_string(K_b)
                           + " · " + std::to_string(molality) + " = " + std::to_string(BPE) + " K\n"
                           //  GLASS BOX: say where K_b came from.  It is a
                           //  DERIVATIVE, R·Tb²·M/ΔHvap(Tb), computed from
                           //  the solvent's own record -- and where the
                           //  record also declares one, the declared value
                           //  is an ANCHOR and the agreement is printed.
                           //  A student must be able to see which number is
                           //  the answer and which is the cross-check.
                           + "        K_b = R·Tb²·M/ΔHvap(Tb) "
                           + (solv.K_b_derived() ? "(derived from "
                               : "(NOT derivable -- using the declared value; ")
                           + solv.name() + ".dat)"
                           + (solv.K_b_anchor() > 0.0 && solv.K_b_derived()
                               ? ("; declared anchor " + std::to_string(solv.K_b_anchor())
                                  + ", agrees to "
                                  + std::to_string(100.0 * std::fabs(K_b - solv.K_b_anchor())
                                                   / solv.K_b_anchor()) + " %")
                               : std::string())
                           + "\n"))
                  << "  P_op = P_sat,pure(T_boil − BPE) = " << std::fixed
                  << std::setprecision(3) << (P_op / 1000.0) << " kPa  ("
                  << (P_op / 1.0e5) << " bar)\n"
                  << "  V / F = " << std::fixed << std::setprecision(4)
                  << V_over_F << "\n"
                  << "  Economy  V_evap / F_steam = " << std::setprecision(3)
                  << economy << "\n";
        if (lphiFitted)
            std::cout << "  heat of dilution = "
                      << std::fixed << std::setprecision(2)
                      << (Q_dilution(V_over_F, T_boil) / 1000.0)
                      << " kW   (L_phi: m " << std::setprecision(2)
                      << molality_salt(0.0) << " -> "
                      << molality_salt(V_over_F)
                      << " mol/kg salt, calorimetric fit)\n";
        std::cout << "==================================================================\n\n";
    }

    // EXTRAPOLATION GUARD (no silent crutch): the fitted L_phi is only
    // data-backed inside its molality window; a caustic evaporator easily
    // concentrates past it.  Announce loudly -- log + a GUI advisory.
    if (lphiFitted)
    {
        const scalar mMax = thermo.electrolyte().lphiValidityMax();
        //  The window is the SALT's fit window, so the molality tested against
        //  it must be the salt's too -- otherwise a sugar in the liquor could
        //  trip (or, at the other end, mask) an extrapolation warning about a
        //  curve it has nothing to do with.
        const scalar mOut = molality_salt(V_over_F);
        if (mMax > 0.0 && mOut > mMax)
        {
            const std::string msg =
                "heat of dilution EXTRAPOLATED: concentrate molality "
                + std::to_string(mOut) + " mol/kg exceeds the calorimetric-fit"
                " window (<= " + std::to_string(mMax) + " mol/kg, Parker data)"
                " -- the dilution term is an extrapolation there.";
            AdvisoryLog::instance().add("electrolyte", "warning",
                "evaporator '" + dict->lookupWordOrDefault("name", "evaporator") + "'",
                msg);
            if (verbosity >= 1) std::cout << "  [electrolyte] " << msg << "\n";
        }
    }

    produced_.clear();
    ProcessStream conc;
    conc.name = "concentrated";
    conc.F    = F_in_kmols * (1.0 - V_over_F);
    conc.T    = T_boil;
    conc.P    = P_op;
    conc.z    = x_L;
    conc.vf   = 0.0;
    //  ---- THESE THREE STATES ARE DECLARATIONS, NOT GUESSES ---------------
    //  R-E2: an unpinned (T, P, z) MEANS its own equilibrium, so every reader
    //  downstream -- the balance report, the next unit's own chest check --
    //  re-solves an outlet this unit left unpinned.  For an evaporator that
    //  re-solve is not idempotent and not even well posed: the liquor leaves
    //  AT its boiling point and the vapour and condensate leave ON the
    //  saturation curve, where a pure-component flash has no answer at all
    //  (K == 1 identically, so Rachford-Rice is satisfied for every V/F).
    //
    //  Measured on `evaporator02_triple_effect_sugar`: `cond1` and the chest
    //  steam are the same pure water at the same (392.1781136 K, 200000 Pa),
    //  and the flash returned the bisection midpoint V/F = 0.500000000 for
    //  BOTH -- half a latent heat invented on each, 2796.44 kW apiece, which
    //  cancelled exactly and so showed up as a chest that delivered nothing.
    //  `L3` re-solved to V/F = 0.302676 and double-counted 703.80 kW of
    //  evaporation this unit had already separated into `V3`.
    //
    //  So the unit says what it means.  The liquor is boiling liquid, the
    //  solvent vapour is vapour, the condensate is the spent chest.  Each is a
    //  statement this model makes, and a declaration is never re-solved.
    conc.phasePinned = true;
    produced_.push_back(conc);

    ProcessStream vap;
    vap.name = "solventVapour";
    vap.F    = F_in_kmols * V_over_F;
    vap.T    = T_boil;
    vap.P    = P_op;
    vap.z    = y_V;
    vap.vf   = 1.0;
    vap.phasePinned = true;                 // see `conc.phasePinned` above
    produced_.push_back(vap);

    ProcessStream cond;
    cond.name = "condensate";
    cond.F    = F_steam_kmols;
    cond.T    = T_steam;
    //  THE CONDENSATE LEAVES THE CHEST, SO IT LEAVES AT THE CHEST'S PRESSURE.
    //  It used to be written as 0.0 and filled in by `Flowsheet.cpp`'s
    //  `if (s.P <= 0.0) s.P = P_inherit`, where `P_inherit` is the FIRST
    //  input's pressure -- the PROCESS FEED, not the steam chest.  On
    //  `evaporator06` that put a 128.48 C condensate at 1 bar, a state whose
    //  own Psat is 2.7 bar: superheated vapour by a factor of 2.7, labelled
    //  vf = 0.  Nothing caught it because the electrolyte packages register no
    //  "vapor"-typed phase and never re-solve anything -- a trap waiting for
    //  the day they do.  A pressure taken from the wrong inlet is the same
    //  arity defect as a phase taken from nowhere.
    cond.P    = (P_chest > 0.0) ? P_chest : 0.0;
    cond.z    = y_cond;
    cond.vf   = 0.0;
    cond.phasePinned = true;                // see `conc.phasePinned` above
    // The condensate IS the heating utility's RETURN LEG -- the same physical
    // carrier that entered as the steam utility, leaving spent.  It inherits
    // the utility category so the GUI renders both legs in the utility
    // register (paired, toggleable) instead of disguising the return as a
    // mystery third product (Vitor's credo: the utility always shows, and the
    // physical stream that carries it is DECLARED as its).  Consumption
    // aggregation counts only SUPPLY legs, so this does not double-count.
    cond.category = steamDict->lookupWordOrDefault("category", "");
    produced_.push_back(cond);

    // KPIs --- emitted in BOTH canonical SI (no unit suffix in the
    // name) and the legacy display-unit names.  DesignSpec / SweepDriver
    // targets should prefer the SI names (e.g. `effect2.F_cond` in
    // kg/s) so target values with explicit unit suffixes are converted
    // to the same canonical SI on the value side.
    kpis_.clear();
    kpis_["T_sat_pure"]    = Tsat_pure;
    kpis_["T_boil"]        = T_boil;
    kpis_["T_steam"]       = T_steam;
    kpis_["BPE"]           = BPE;
    kpis_["dT"]            = dT;
    kpis_["molality"]      = molality;      // all dissolved species (colligative)
    //  Published separately, not folded in: with more than one nonvolatile the
    //  two are different numbers and the BPE is computed from THIS one.
    if (useElectrolyte) kpis_["molality_salt"] = molalitySalt;
    kpis_["V_over_F"]      = V_over_F;
    kpis_["A"]             = A;                                          // m^2  SI (user-provided HARDWARE)
    kpis_["U"]             = U;                                          // W/m^2/K  SI (hardware)
    kpis_["duty"]          = Q_J_s;                                      // W  SI
    kpis_["F_steam"]       = F_steam_kmols * MW_solv;                    // kg/s SI
    kpis_["F_cond"]        = cond.F * MW_solv;                           // kg/s SI  (= F_steam, the condensate the chest produced)
    kpis_["F_in"]          = F_in_kmols;                                 // kmol/s SI
    kpis_["F_conc"]        = conc.F;                                     // kmol/s SI
    kpis_["F_vap"]         = vap.F;                                      // kmol/s SI
    kpis_["F_conc_mass"]   = conc.F * MWmix(conc.z, thermo);             // kg/s SI
    kpis_["F_vap_mass"]    = vap.F  * MWmix(vap.z,  thermo);             // kg/s SI
    kpis_["P"]             = P_op;
    kpis_["economy"]       = economy;
    kpis_["converged"]     = r.converged ? 1.0 : 0.0;
    kpis_["iterations"]    = static_cast<scalar>(r.iterations);
    // Legacy aliases (display units in the name) --- kept for
    // back-compat with tutorials and the GUI's KPI table.
    // Deprecated; remove after a release cycle.
    kpis_["A_m2"]          = A;
    kpis_["U_W_m2_K"]      = U;
    kpis_["duty_kW"]       = Q_J_s / 1000.0;
    if (lphiFitted)
        kpis_["Q_dilution_kW"] = Q_dilution(V_over_F, T_boil) / 1000.0;
    kpis_["F_steam_kg_h"]  = F_steam_kmols * 3600.0 * MW_solv;
    kpis_["F_cond_kg_h"]   = cond.F * 3600.0 * MW_solv;
    kpis_["F_in_kmol_h"]   = F_in_kmols * 3600.0;
    kpis_["F_conc_kmol_h"] = conc.F * 3600.0;
    kpis_["F_vap_kmol_h"]  = vap.F  * 3600.0;

    return r.converged ? 0 : 1;
}

} // namespace Choupo
