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

#include "Crystalliser.H"
#include "CrystallisationHeat.H"
#include "core/Advisory.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <limits>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {

// ---- Shared crystalliser feed + saturation (single source of the math) ----
//  Used by ALL three models (equilibrium, MSMPR, FVM) so the multi-feed reading
//  and the electrolyte/solubility-curve saturation are written ONCE.

struct FeedState { scalar F = 0.0, T_feed = 0.0, P = 1.0e5; sVector z, s_in; };

// One input (`in feed;`) OR several (`inputs (a b);`, summed) -- so a crystalliser
// (any model) can take a brine PLUS an antisolvent and combine them internally.
FeedState readCombinedFeed(const DictPtr& dict, const ThermoPackage& thermo)
{
    const std::size_t n = thermo.n();
    FeedState r;  r.P = std::numeric_limits<scalar>::infinity();
    sVector Fz(n, 0.0);  r.s_in.assign(n, 0.0);
    auto addInlet = [&](scalar Fi, scalar Ti, scalar Pi, const DictPtr& cd, const DictPtr& sol)
    {
        sVector zi(n, 0.0);  scalar zs = 0.0;
        for (const auto& k : cd->keys()) { const std::size_t i = thermo.indexOf(k);
                                           zi[i] = cd->lookupScalar(k);  zs += zi[i]; }
        if (zs > 0.0) for (auto& v : zi) v /= zs;
        for (std::size_t i = 0; i < n; ++i) Fz[i] += Fi * zi[i];
        r.F += Fi;
        if (Fi > 0.0 && r.T_feed == 0.0) r.T_feed = Ti;
        r.P = std::min(r.P, Pi);
        if (sol) { auto sf = sol->subDict("solidMolarFlows");
                   for (const auto& k : sf->keys()) r.s_in[thermo.indexOf(k)] += sf->lookupScalar(k); }
    };
    if (dict->found("inputStreams"))
        for (const auto& sd : dict->lookupDictList("inputStreams"))
            addInlet(sd->lookupScalar("F"), sd->lookupScalar("T"), sd->lookupScalar("P"),
                     sd->subDict("composition"), sd->found("solids") ? sd->subDict("solids") : nullptr);
    else
    {
        auto feed = dict->subDict("feed");
        addInlet(feed->lookupScalar("F", Dims::molarFlow),
                 feed->lookupScalar("T", Dims::temperature),
                 feed->lookupScalar("P", Dims::pressure),
                 dict->subDict("composition"), dict->found("solids") ? dict->subDict("solids") : nullptr);
    }
    if (r.P == std::numeric_limits<scalar>::infinity()) r.P = 1.0e5;
    r.z.assign(n, 0.0);
    if (r.F > 0.0) for (std::size_t i = 0; i < n; ++i) r.z[i] = Fz[i] / r.F;
    return r;
}

struct SatState
{
    std::size_t iSolute = 0, iSolv = 0, iAnti = 0;
    bool   useElec = false, mixedSolvent = false;
    scalar c_sat = 0.0;          // kg solute / kg solvent at T_op
    scalar m_sat = 0.0;          // mol/kg (electrolyte path) or 0
    scalar solvent_mass = 0.0;   // kg/s
    scalar xAnti = 0.0;
    scalar MW_sol = 0.0, MW_solv = 0.0;
};

// Identify solute / solvent / (antisolvent) and the saturation c_sat at T_op.
// Electrolyte (eNRTL/Pitzer m_sat(T), with the drowning-out mixed-solvent term)
// OR the per-component solubility curve -- the SAME saturation for every model.
//
// `soluteOverride` (empty = auto) names WHICH species to crystallise when the
// feed carries more than one crystallisable salt (e.g. two crystallisers in
// series, each pulling out a different salt).  The ELECTROLYTE saturation is used
// for that solute only when it IS the package's electrolyte salt; any other named
// solute falls back to its own solubility curve -- so KHT (solubility curve) and
// KCl (eNRTL) coexist in one package, each crystalliser targeting one.
SatState crystSaturation(const ThermoPackage& thermo, const sVector& z, scalar F, scalar T_op,
                         const std::string& soluteOverride = "")
{
    const std::size_t n = thermo.n();
    SatState r;  r.iSolute = n;  r.iSolv = n;  r.iAnti = n;
    const bool pkgHasElec = thermo.hasElectrolyte();

    // ---- Pick the target solute + decide its saturation route --------------
    if (!soluteOverride.empty())
    {
        r.iSolute = thermo.indexOf(soluteOverride);
        if (r.iSolute >= n)
            throw std::runtime_error("Crystalliser: solute '" + soluteOverride
                + "' (operation.solute) is not a component of this package.");
        r.useElec = pkgHasElec && thermo.electrolyte().soluteName() == soluteOverride;
    }
    else if (pkgHasElec)
    {
        r.iSolute = thermo.indexOf(thermo.electrolyte().soluteName());
        r.useElec = true;
    }
    else
    {
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0 && thermo.comp(i).hasSolubility()) { r.iSolute = i; break; }
        r.useElec = false;
    }
    if (r.iSolute == n)
        throw std::runtime_error("Crystalliser: no crystallising solute in the feed"
            " (need a component with a `solubility {}` block, or an `electrolyte {}` block).");
    if (!r.useElec && !thermo.comp(r.iSolute).hasSolubility())
        throw std::runtime_error("Crystalliser: solute '" + thermo.comp(r.iSolute).name()
            + "' has neither the package's electrolyte model nor a `solubility {}` curve.");

    const scalar elecSolubility = r.useElec ? thermo.electrolyte().solubility() : 0.0;

    // ---- Solvent (water) + antisolvent (a volatile carrying relativePermittivity)
    for (std::size_t i = 0; i < n; ++i)
    {
        if (z[i] <= 0.0 || i == r.iSolute || !thermo.comp(i).hasVaporPressure()) continue;
        if (thermo.comp(i).relativePermittivity() > 0.0) { if (r.iAnti == n) r.iAnti = i; }
        else if (r.iSolv == n)                            r.iSolv = i;
    }
    if (r.iSolv == n)
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0 && i != r.iSolute && thermo.comp(i).hasVaporPressure()) { r.iSolv = i; break; }
    if (r.iAnti == r.iSolv) r.iAnti = n;
    if (r.iSolv == n)
        throw std::runtime_error("Crystalliser: no solvent in the feed (a volatile carrier, e.g. water).");

    r.MW_sol  = thermo.comp(r.iSolute).MW();
    r.MW_solv = thermo.comp(r.iSolv).MW();
    r.mixedSolvent = r.useElec && r.iAnti != n;
    r.solvent_mass = F * z[r.iSolv] * r.MW_solv;
    r.m_sat = elecSolubility;

    if (r.useElec)
    {
        scalar MwAnti = 0.0, epsAnti = 0.0, vAnti = 0.0;
        if (r.mixedSolvent)
        {
            const Component& anti = thermo.comp(r.iAnti);
            const scalar nSolv = z[r.iSolv], nAnti = z[r.iAnti];
            r.xAnti = (nSolv + nAnti > 0.0) ? nAnti / (nSolv + nAnti) : 0.0;
            MwAnti = anti.MW();  epsAnti = anti.relativePermittivity();  vAnti = anti.Vliq();
            r.solvent_mass = F * (z[r.iSolv] * r.MW_solv + z[r.iAnti] * MwAnti);
        }
        const scalar Ksp = thermo.electrolyte().saturationKsp(T_op);
        auto prod = [&](scalar m) {
            const scalar g = r.mixedSolvent
                ? thermo.electrolyte().gammaPMMixed(m, r.xAnti, MwAnti, epsAnti, vAnti, T_op)
                : thermo.electrolyte().gammaPM(m, T_op);
            return (g * m) * (g * m) - Ksp;
        };
        scalar lo = 1.0e-9, hi = 1.5 * std::max(elecSolubility, 1.0e-6);
        for (int it = 0; it < 80; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            if (prod(mid) > 0.0) hi = mid; else lo = mid;
        }
        r.m_sat = 0.5 * (lo + hi);
        r.c_sat = r.m_sat * r.MW_sol / 1000.0;
    }
    else
        r.c_sat = thermo.comp(r.iSolute).c_sat(T_op);
    return r;
}

} // anonymous namespace


// Heat RELEASED per mol of crystal leaving a saturated solution [J/mol].
// The body lives in the SHARED crystallisationHeatPerMol resolver
// (CrystallisationHeat.cpp, energy phase (d)) so the steady unit and the
// batch crystalliser speak the same sourced number and can never diverge
// -- the reactionHeat precedent applied to solids.  This wrapper only
// unpacks the SatState fields.
static double crystHeatPerMol(const ThermoPackage& thermo, const SatState& sat,
                              double T_op, double dHcrystConstant,
                              std::string& source)
{
    return crystallisationHeatPerMol(thermo, sat.iSolute, sat.useElec,
                                     sat.mixedSolvent, sat.m_sat,
                                     T_op, dHcrystConstant, source);
}

// Speak the crystallisation-heat provenance aloud (no silent crutch): the
// printed line names which path produced dH_cryst; an out-of-window m_sat
// additionally raises a GUI advisory.
static void announceCrystHeat(double dH_Jmol, const std::string& source,
                              int verbosity)
{
    if (verbosity >= 2)
        std::cout << "  dH_cryst = " << dH_Jmol << " J/mol  [" << source << "]\n";
    if (source.find("EXTRAPOLATED") != std::string::npos)
        AdvisoryLog::instance().add("electrolyte", "warning", "crystalliser",
            "heat of crystallisation " + source);
}

int Crystalliser::solve(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    // `model` selects the sub-model.  Default is the equilibrium-yield
    // cooling crystalliser; MSMPR is the population balance by the method
    // of moments; FVM is the discretised PBE on a size grid (finite-volume
    // --- carries no closure assumption on G(L), so it handles
    // size-dependent growth).
    const std::string model = dict->lookupWordOrDefault("model", "equilibrium");
    if (model == "MSMPR" || model == "msmpr" || model == "populationBalance")
        return solveMSMPR(dict, thermo, verbosity);
    if (model == "FVM" || model == "discretizedPBE" || model == "FVM-PBE")
        return solveDiscretizedPBE(dict, thermo, verbosity);
    return solveEquilibrium(dict, thermo, verbosity);
}

int Crystalliser::solveEquilibrium(const DictPtr& dict,
                                   const ThermoPackage& thermo,
                                   int verbosity)
{
    const std::size_t n = thermo.n();

    // ---- Feed: ONE input (`in feed;`) OR SEVERAL (`inputs (a b);`, summed) --
    //  A crystalliser may receive a brine PLUS an antisolvent (drowning-out) and
    //  combines them internally -- no separate mixer node (shared helper).
    const FeedState fd = readCombinedFeed(dict, thermo);
    const scalar  F = fd.F, T_feed = fd.T_feed, P = fd.P;
    const sVector& z    = fd.z;
    const sVector& s_in = fd.s_in;

    // ---- Operation: the operating temperature (a setpoint) -------------
    auto oper = dict->subDict("operation");
    const scalar T_op = oper->lookupScalar("operatingTemperature", Dims::temperature);
    // `solute <name>;` (optional) picks WHICH salt this unit crystallises when the
    // feed carries more than one (two crystallisers in series, each on its own salt).
    const std::string soluteSel = oper->lookupWordOrDefault("solute", "");

    // ---- Saturation at T_op (shared helper -- single source of the math):
    //  electrolyte m_sat(T) with the drowning-out mixed-solvent term, OR the
    //  per-component solubility curve.  `useElec` is now PER-SOLUTE: true only when
    //  the target solute IS the package's electrolyte salt (so KHT can use its
    //  curve while KCl uses the eNRTL, in one package).
    const SatState sat = crystSaturation(thermo, z, F, T_op, soluteSel);
    const bool   useElec = sat.useElec;
    const scalar elecSolubility = useElec ? thermo.electrolyte().solubility() : 0.0;
    const scalar elecDHcryst    = oper->lookupScalarOrDefault("dHcryst", 0.0);
    const std::size_t iSolute = sat.iSolute, iSolv = sat.iSolv, iAnti = sat.iAnti;
    const bool   mixedSolvent = sat.mixedSolvent;
    const Component& sol  = thermo.comp(iSolute);
    const Component& solv = thermo.comp(iSolv);
    const scalar MW_sol      = sat.MW_sol;
    const scalar c_sat       = sat.c_sat;
    const scalar solvent_mass= sat.solvent_mass;
    const scalar m_sat_eff   = sat.m_sat;
    const scalar xAnti       = sat.xAnti;

    // HONESTY (glass-box): the electrolyte saturation IS now temperature-dependent
    // (gamma_pm(T) via tau(T)/A_DH(T)/Born + Ksp(T) van't Hoff).  Whether cooling
    // actually moves the yield is set by the salt's enthalpy of solution: announce
    // when it is ABSENT, so a student is never misled into reading a cooling effect
    // the data cannot support (NaCl's dHsol is small -> nearly T-independent anyway).
    if (useElec && verbosity >= 1 && std::abs(T_op - 298.15) > 1.0
        && thermo.electrolyte().dissolutionEnthalpy() == 0.0)
        std::cout << "[Crystalliser] NOTE: '" << sol.name() << "' carries no dissolutionEnthalpy, so "
                     "its solubility product Ksp is held flat in T (van't Hoff off); T_op = "
                  << std::fixed << std::setprecision(1) << (T_op - 273.15)
                  << " C changes gamma_pm(T) + the cooling DUTY but not Ksp.  For NaCl this is "
                     "physical (dHsol ~ +3.9 kJ/mol, solubility nearly T-flat); add dissolutionEnthalpy "
                     "to chemistry/salts/<mineral>.dat for a T-sensitive salt (e.g. KNO3).\n";

    // ---- Yield at T_op: mother liquor leaves SATURATED (c_sat from the helper);
    //  all solvent stays liquid (no boil-off).
    const scalar solute_in    = F * z[iSolute] * MW_sol;         // kg/s
    const scalar solute_liq   = std::min(solute_in, c_sat * solvent_mass);  // kg/s stays dissolved
    const scalar crystal_mass = std::max(0.0, solute_in - solute_liq);      // kg/s crystallised
    const scalar crystal_mol  = crystal_mass / MW_sol;          // kmol/s
    const scalar yield        = (solute_in > 0.0) ? crystal_mass / solute_in : 0.0;

    // ---- Products: the saturated mother liquor (fluid z[]) + the crystals
    //      (solid s[]).  The crystalliser does its OWN ideal solid-liquid
    //      split: declare TWO outputs `(crystals  motherLiquor)` and it
    //      discharges them separately (no downstream filter needed); declare
    //      ONE output and it discharges the combined `magma` slurry (the
    //      backward-compatible default, and what the MSMPR/FVM models need so
    //      the crystal-size distribution travels with the slurry).
    sVector nliq(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) nliq[i] = F * z[i];
    nliq[iSolute] -= crystal_mol;                               // remove crystallised solute
    scalar F_liq = 0.0; for (auto v : nliq) F_liq += v;

    const std::size_t nOut = dict->found("outputs")
        ? dict->lookupWordList("outputs").size() : 1;

    // Saturated mother-liquor composition (the liquid that leaves AND the liquor
    // that clings to the crystals).
    sVector zliq(n, 0.0);
    if (F_liq > 0.0) for (std::size_t i = 0; i < n; ++i) zliq[i] = nliq[i] / F_liq;

    // Wet-cake split parameters (used only in the two-product discharge).  A
    // real crystalliser discharges a WET cake -- the crystals carry the mother
    // liquor that clings to them (cakeMoisture, kg liquor / kg dry solid), so
    // the solid is NEVER perfectly pure; perfectly-dry crystals are unphysical.
    //  solidsRecovery < 1 lets fines escape with the drained liquor.
    const scalar recovery     = oper->lookupScalarOrDefault("solidsRecovery", 1.0);
    const scalar cakeMoisture = oper->lookupScalarOrDefault("cakeMoisture", 0.10);
    scalar MW_liq = 0.0; for (std::size_t i = 0; i < n; ++i) MW_liq += zliq[i] * thermo.comp(i).MW();
    const scalar cakeSolidMol  = crystal_mol * recovery;                   // kmol/s solid in cake
    const scalar adheringMass  = cakeMoisture * cakeSolidMol * MW_sol;     // kg/s liquor clinging
    scalar F_cakeLiq = (MW_liq > 0.0) ? adheringMass / MW_liq : 0.0;       // kmol/s
    if (F_cakeLiq > F_liq) F_cakeLiq = F_liq;
    const scalar cakeWetness = (cakeSolidMol * MW_sol + adheringMass > 0.0)
        ? 100.0 * adheringMass / (cakeSolidMol * MW_sol + adheringMass) : 0.0;  // liquid wt% of cake

    produced_.clear();
    if (nOut >= 2)
    {
        // WET crystals: the solid PLUS the clinging mother liquor (so the cake
        // carries dissolved solute + solvent -- the reason cake washing exists).
        ProcessStream crystals;
        crystals.name = "crystals";
        crystals.F = F_cakeLiq;  crystals.T = T_op;  crystals.P = P;  crystals.vf = 0.0;
        crystals.z = zliq;
        crystals.s = s_in;  crystals.s[iSolute] += cakeSolidMol;
        produced_.push_back(crystals);

        // Drained mother liquor (supernatant) + any fines that escaped.
        ProcessStream liquor;
        liquor.name = "motherLiquor";
        liquor.F = F_liq - F_cakeLiq;  liquor.T = T_op;  liquor.P = P;  liquor.vf = 0.0;
        liquor.z = zliq;
        liquor.s.assign(n, 0.0);  liquor.s[iSolute] = crystal_mol * (1.0 - recovery);
        produced_.push_back(liquor);
    }
    else
    {
        // Combined magma (slurry): crystals in s[] + mother liquor in z[].
        ProcessStream magma;
        magma.name = "magma";
        magma.F = F_liq;  magma.T = T_op;  magma.P = P;  magma.vf = 0.0;
        magma.z.assign(n, 0.0);
        if (F_liq > 0.0) for (std::size_t i = 0; i < n; ++i) magma.z[i] = nliq[i] / F_liq;
        magma.s = s_in;  magma.s[iSolute] += crystal_mol;
        produced_.push_back(magma);
    }

    // ---- Cooling duty (RESULT): sensible cooling + heat of crystallisation
    scalar Cp_feed = 0.0;   // J/(mol·K), liquid, present species
    const scalar T_mean = 0.5 * (T_feed + T_op);
    for (std::size_t i = 0; i < n; ++i)
        if (z[i] > 0.0 && thermo.comp(i).hasCpLiquid())
            Cp_feed += z[i] * thermo.comp(i).cpLiquid().Cp(T_mean);
    const scalar Q_sensible = F * 1000.0 * Cp_feed * (T_feed - T_op);   // W (cooling)
    std::string dHsource;
    const scalar dHcrystEff = crystHeatPerMol(thermo, sat, T_op,
                              useElec ? elecDHcryst : sol.dHcryst(), dHsource);
    announceCrystHeat(dHcrystEff, dHsource, verbosity);
    const scalar Q_cryst    = crystal_mol * 1000.0 * dHcrystEff;        // W
    const scalar Q_removed  = Q_sensible + Q_cryst;                     // W to the coolant

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["T_op"]            = T_op;
    kpis_["c_sat"]           = c_sat;             // kg/kg
    kpis_["yield"]           = yield;             // fraction of solute crystallised
    kpis_["crystal_flow"]    = crystal_mass;      // kg/s
    kpis_["crystal_mol"]     = crystal_mol;       // kmol/s
    kpis_["solute_in"]       = solute_in;         // kg/s
    kpis_["solute_dissolved"]= solute_liq;        // kg/s in the liquor
    kpis_["Q_removed"]       = Q_removed;         // W (heat removed to the coolant)
    kpis_["Q_kW"]            = -Q_removed / 1000.0;  // kW, signed: cooling is NEGATIVE
                                                  //   (heat ADDED to the process) -> the GUI's
                                                  //   cold-utility stub (dashed energy wire)
    kpis_["liquorFlow"]      = F_liq;             // kmol/s
    if (useElec)
    {
        kpis_["m_sat"]        = m_sat_eff;                                 // mol/kg (aqueous OR mixed), at T_op
        kpis_["gamma_pm_sat"] = mixedSolvent
            ? thermo.electrolyte().gammaPMMixed(m_sat_eff, xAnti, thermo.comp(iAnti).MW(),
                  thermo.comp(iAnti).relativePermittivity(), thermo.comp(iAnti).Vliq(), T_op)
            : thermo.electrolyte().gammaPM(m_sat_eff, T_op);
        kpis_["Ksp_activity"] = thermo.electrolyte().saturationKsp(T_op);  // ion-activity product at T_op
        if (mixedSolvent) kpis_["antisolvent_xfrac"] = xAnti;             // salt-free x of antisolvent
    }
    if (nOut >= 2)
    {
        kpis_["cakeMoisture"]     = cakeMoisture;        // kg liquor / kg dry solid
        kpis_["cakeWetness_pct"]  = cakeWetness;         // liquid wt% of the wet cake
        kpis_["solidsRecovery"]   = recovery;            // fraction of crystals to the cake
        kpis_["cakeLiquidFlow"]   = F_cakeLiq;           // kmol/s clinging liquor
        // dissolved solute carried out ON the wet cake (the cake-washing target)
        kpis_["soluteInCake_mass"]= F_cakeLiq * zliq[iSolute] * MW_sol;   // kg/s
    }

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Crystalliser Result  ==================\n"
                  << "  Operating T = " << std::fixed << std::setprecision(1) << T_op
                  << " K (" << (T_op - 273.15) << " °C)   feed at "
                  << T_feed << " K\n"
                  << "  Solubility c_sat(T_op) = " << std::setprecision(3) << c_sat
                  << " kg " << sol.name() << " / kg " << solv.name() << "\n";
        if (mixedSolvent)
            std::cout << "  Drowning-out (eNRTL mixed-solvent): x_" << thermo.comp(iAnti).name()
                      << " = " << std::setprecision(3) << xAnti << " (salt-free)  ->  m_sat = "
                      << m_sat_eff << " mol/kg  (aqueous datum " << elecSolubility << ")\n";
        std::cout << "  Solute in = " << std::scientific << std::setprecision(3) << solute_in
                  << " kg/s  ->  crystals = " << crystal_mass << " kg/s,  dissolved = "
                  << solute_liq << " kg/s\n" << std::fixed
                  << "  Yield = " << std::setprecision(1) << (100.0 * yield) << " %\n";
        if (nOut >= 2)
            std::cout << "  Wet cake: " << std::setprecision(1) << (100.0 * recovery)
                      << "% of crystals, clinging liquor " << std::setprecision(2) << cakeMoisture
                      << " kg/kg dry  (" << std::setprecision(1) << cakeWetness
                      << " wt% liquid)  ->  crystals leave WET, not pure\n";
        std::cout << "  Cooling duty Q = " << std::scientific << std::setprecision(3)
                  << Q_removed << " W  (" << std::fixed << std::setprecision(1)
                  << (Q_removed / 1000.0) << " kW)\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

// ---------------------------------------------------------------------------
//  MSMPR (continuous, steady) by the method of moments.
//
//  Population balance, well-mixed, size-independent growth (McCabe ΔL law),
//  no breakage / agglomeration, clear feed:
//
//      G dn/dL + n/τ = 0   →   n(L) = n0 exp(-L/(Gτ)),   n0 = B0/G
//
//  Moments μ_j = ∫ L^j n dL = n0 (Gτ)^{j+1} j!  close with no L-grid.
//  Kinetics:  G  = k_g (S-1)^g                     [m/s]
//             B0 = k_b (S-1)^b M_T^j               [#/(m^3·s)]
//  with S = c/c_sat the supersaturation and M_T = ρ_c k_v μ3 the magma
//  density [kg/m^3].  Combining μ3 = 6 B0 G^3 τ^4 with B0 closes μ3 in S:
//      μ3^{1-j} = 6 G^3 τ^4 k_b (S-1)^b (ρ_c k_v)^j.
//  The steady supersaturation S is the RESULT that balances the kinetic
//  crystal production Q·M_T against the solute removed from the liquor.
// ---------------------------------------------------------------------------
int Crystalliser::solveMSMPR(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    const std::size_t n = thermo.n();

    // ---- Feed (one OR several inlets, summed) + saturation -- shared helpers.
    const FeedState fd = readCombinedFeed(dict, thermo);
    const scalar F = fd.F, T_feed = fd.T_feed, P = fd.P;
    const sVector& z = fd.z;

    auto oper = dict->subDict("operation");
    const scalar T_op = oper->lookupScalar("operatingTemperature", Dims::temperature);
    const scalar V    = oper->lookupScalar("volume", Dims::volume);   // working suspension volume [m^3]

    // Solute / solvent / (antisolvent) + saturation c_sat at T_op.  The SAME
    // helper as the equilibrium model, so the MSMPR runs for an ELECTROLYTE
    // (eNRTL/Pitzer m_sat(T), with the drowning-out mixed-solvent term) as well
    // as a solubility-curve solute -- the population balance then operates on
    // S = c/c_sat regardless of where c_sat came from.
    const std::string soluteSel = oper->lookupWordOrDefault("solute", "");
    const SatState sat = crystSaturation(thermo, z, F, T_op, soluteSel);
    const bool useElec = sat.useElec;
    const std::size_t iSolute = sat.iSolute;
    const Component& sol  = thermo.comp(iSolute);
    const scalar MW_sol   = sat.MW_sol;
    const scalar rho_c    = sol.rho_p();
    const scalar k_v      = sol.k_v();
    if (rho_c <= 0.0)
        throw std::runtime_error("Crystalliser(MSMPR): solute '" + sol.name() + "' needs a `solid {"
            " rho_p; k_v; }` block (crystal density + volume shape factor).");

    // ---- Kinetics (resolved from constant/crystallisation by the flowsheet)
    if (!dict->found("crystallisation"))
        throw std::runtime_error("Crystalliser(MSMPR): missing `crystallisation"
            " <name>;` reference to a constant/crystallisation block.");
    auto kin   = dict->subDict("crystallisation");
    auto grow  = kin->subDict("growth");
    auto nucl  = kin->subDict("nucleation");
    const scalar k_g = grow->lookupScalar("k_g");          // m/s
    const scalar g   = grow->lookupScalarOrDefault("g", 1.0);
    const scalar k_b = nucl->lookupScalar("k_b");          // #/(m^3·s)
    const scalar b   = nucl->lookupScalarOrDefault("b", 1.0);
    const scalar j   = nucl->lookupScalarOrDefault("j", 0.0);   // magma exponent
    if (j >= 1.0)
        throw std::runtime_error("Crystalliser(MSMPR): nucleation magma exponent"
            " j must be < 1 (the moment closure μ3^{1-j} requires it).");

    // ---- Hydraulics: volumetric throughput Q and residence time τ -------
    //  Q = liquid volumetric flow Σ F_i V_liq,i (solvent-dominated).
    scalar Q = 0.0;                                         // m^3/s
    for (std::size_t i = 0; i < n; ++i)
        Q += F * z[i] * 1000.0 * thermo.comp(i).Vliq();    // kmol/s·(mol/kmol)·(m^3/mol)
    if (Q <= 0.0)
        throw std::runtime_error("Crystalliser(MSMPR): zero volumetric flow"
            " (components need a `Vliq` to size the residence time).");
    const scalar tau = V / Q;                              // s

    const scalar c_sat        = sat.c_sat;                 // kg solute / kg solvent (helper)
    const scalar solvent_mass = sat.solvent_mass;          // kg/s (reference OR total solvent)
    const scalar solute_in    = F * z[iSolute] * MW_sol;   // kg/s
    const scalar c_feed       = (solvent_mass > 0.0) ? solute_in / solvent_mass : 0.0;
    const scalar S_feed       = (c_sat > 0.0) ? c_feed / c_sat : 1.0;
    if (S_feed <= 1.0)
        throw std::runtime_error("Crystalliser(MSMPR): feed is not supersaturated"
            " at the operating temperature (S_feed <= 1) --- nothing crystallises.");

    // ---- μ3(S) closure and the steady-state residual --------------------
    auto mu3_of_S = [&](scalar S) -> scalar
    {
        const scalar sup = S - 1.0;
        if (sup <= 0.0) return 0.0;
        const scalar G   = k_g * std::pow(sup, g);
        // μ3^{1-j} = 6 G^3 τ^4 k_b (S-1)^b (ρ_c k_v)^j
        const scalar rhs = 6.0 * std::pow(G, 3.0) * std::pow(tau, 4.0)
                         * k_b * std::pow(sup, b) * std::pow(rho_c * k_v, j);
        return std::pow(rhs, 1.0 / (1.0 - j));
    };
    auto MT_of_S = [&](scalar S) { return rho_c * k_v * mu3_of_S(S); };   // kg/m^3

    //  residual(S) = solute removed from liquor − kinetic crystal production
    //  removed = solute_in − c·solvent_mass = solute_in − S·c_sat·solvent_mass
    auto residual = [&](scalar S) -> scalar
    {
        const scalar removed    = solute_in - S * c_sat * solvent_mass;   // kg/s
        const scalar production = Q * MT_of_S(S);                          // kg/s
        return removed - production;
    };
    auto dres = [&](scalar S)
    {
        const scalar h = 1.0e-6 * std::max(std::abs(S), 1.0);
        return (residual(S + h) - residual(S - h)) / (2.0 * h);
    };

    solver::NROptions nro;
    nro.lower = 1.0 + 1.0e-9;
    nro.upper = S_feed;
    nro.bracket = true;
    nro.tolerance = 1.0e-10;
    nro.maxIter = 100;
    auto sr = solver::newton1D(residual, dres, 0.5 * (1.0 + S_feed), nro);
    const scalar S = sr.x;

    // ---- Population from the converged supersaturation ------------------
    const scalar sup = S - 1.0;
    const scalar G   = k_g * std::pow(sup, g);             // m/s
    const scalar mu3 = mu3_of_S(S);
    const scalar M_T = rho_c * k_v * mu3;                  // kg/m^3
    const scalar B0  = k_b * std::pow(sup, b) * std::pow(M_T, j);   // #/(m^3·s)
    const scalar n0  = (G > 0.0) ? B0 / G : 0.0;           // #/(m^4)
    const scalar Gtau = G * tau;                           // m (characteristic size)
    // Moments μ_k = n0 (Gτ)^{k+1} k!
    const scalar mu0 = n0 * Gtau;                          // #/m^3
    const scalar mu1 = n0 * std::pow(Gtau, 2.0) * 1.0;
    const scalar mu2 = n0 * std::pow(Gtau, 3.0) * 2.0;
    const scalar mu4 = n0 * std::pow(Gtau, 5.0) * 24.0;
    const scalar L10 = (mu0 > 0.0) ? mu1 / mu0 : 0.0;      // number-mean = Gτ
    const scalar L43 = (mu3 > 0.0) ? mu4 / mu3 : 0.0;      // mass-mean = 4Gτ
    const scalar L_dom = 3.0 * Gtau;                       // dominant (mass-mode) size
    const scalar CV  = (mu1 > 0.0)
                     ? std::sqrt(std::max(0.0, mu0 * mu2 / (mu1 * mu1) - 1.0)) : 0.0;

    // ---- Crystal production and the magma stream -----------------------
    const scalar crystal_mass = Q * M_T;                  // kg/s
    const scalar crystal_mol  = crystal_mass / MW_sol;    // kmol/s
    const scalar yield        = (solute_in > 0.0) ? crystal_mass / solute_in : 0.0;

    sVector nliq(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) nliq[i] = F * z[i];
    nliq[iSolute] = std::max(0.0, nliq[iSolute] - crystal_mol);
    scalar F_liq = 0.0; for (auto v : nliq) F_liq += v;

    produced_.clear();
    ProcessStream magma;
    magma.name = "magma";
    magma.F = F_liq;  magma.T = T_op;  magma.P = P;  magma.vf = 0.0;
    magma.z.assign(n, 0.0);
    if (F_liq > 0.0) for (std::size_t i = 0; i < n; ++i) magma.z[i] = nliq[i] / F_liq;
    magma.s.assign(n, 0.0);  magma.s[iSolute] = crystal_mol;

    // ---- Product PSD: bin the mass distribution m(L) ∝ L^3 n(L) --------
    //  (the number↔mass bridge, via k_v ρ_c).  Grid 0..8·Gτ, 32 bins.
    UnitProfile prof;
    prof.xAxis = "L_micron";
    std::vector<scalar> Lcol, ncol, masscol;
    const int    NB = 32;
    const scalar Lmax = 8.0 * Gtau;
    const scalar dL   = (NB > 0 && Lmax > 0.0) ? Lmax / NB : 0.0;
    std::vector<scalar> binDia(NB), binMass(NB, 0.0);
    scalar massSum = 0.0;
    for (int kbin = 0; kbin < NB; ++kbin)
    {
        const scalar Lmid = (kbin + 0.5) * dL;            // m
        const scalar nval = n0 * std::exp(-Lmid / std::max(Gtau, 1.0e-30));
        const scalar mval = nval * std::pow(Lmid, 3.0) * dL;   // ∝ mass in bin
        binDia[kbin]  = Lmid;
        binMass[kbin] = mval;
        massSum += mval;
        Lcol.push_back(Lmid * 1.0e6);                     // µm
        ncol.push_back(nval);
        masscol.push_back(mval);
    }
    if (massSum > 0.0)
    {
        magma.psd.diameter = binDia;
        magma.psd.massFrac.resize(NB);
        for (int kbin = 0; kbin < NB; ++kbin) magma.psd.massFrac[kbin] = binMass[kbin] / massSum;
    }
    prof.columns["number_density"]  = ncol;     // n(L)  [#/m^4]
    prof.columns["mass_density"]    = masscol;  // ∝ m(L)
    profile_ = prof;

    produced_.push_back(magma);

    // ---- Cooling duty (RESULT): sensible + heat of crystallisation -----
    scalar Cp_feed = 0.0;
    const scalar T_mean = 0.5 * (T_feed + T_op);
    for (std::size_t i = 0; i < n; ++i)
        if (z[i] > 0.0 && thermo.comp(i).hasCpLiquid())
            Cp_feed += z[i] * thermo.comp(i).cpLiquid().Cp(T_mean);
    const scalar Q_sensible = F * 1000.0 * Cp_feed * (T_feed - T_op);
    std::string dHsource;
    const scalar dHcryst    = crystHeatPerMol(thermo, sat, T_op,
        useElec ? oper->lookupScalarOrDefault("dHcryst", 0.0) : sol.dHcryst(), dHsource);
    announceCrystHeat(dHcryst, dHsource, verbosity);
    const scalar Q_cryst    = crystal_mol * 1000.0 * dHcryst;
    const scalar Q_removed  = Q_sensible + Q_cryst;

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["T_op"]            = T_op;
    kpis_["Q_removed"]       = Q_removed;        // W (heat removed to the coolant)
    kpis_["Q_kW"]            = -Q_removed / 1000.0;  // kW, cooling NEGATIVE -> cold-utility stub
    kpis_["residenceTime"]   = tau;             // s   (RESULT, V/Q)
    kpis_["throughput"]      = Q;               // m^3/s
    kpis_["c_sat"]           = c_sat;           // kg/kg
    kpis_["supersaturation"] = S;               // c/c_sat (RESULT)
    kpis_["growthRate"]      = G;               // m/s
    kpis_["nucleationRate"]  = B0;              // #/(m^3·s)
    kpis_["n0"]              = n0;              // #/m^4
    kpis_["L_dominant"]      = L_dom;           // m  (= 3 G τ)
    kpis_["L_meanNumber"]    = L10;             // m  (= G τ)
    kpis_["L_meanMass"]      = L43;             // m  (= 4 G τ)
    kpis_["CV"]              = CV;              // -
    kpis_["magmaDensity"]    = M_T;            // kg/m^3
    kpis_["mu0"]             = mu0;
    kpis_["mu3"]             = mu3;
    kpis_["yield"]           = yield;
    kpis_["crystal_flow"]    = crystal_mass;    // kg/s
    kpis_["crystal_mol"]     = crystal_mol;     // kmol/s
    kpis_["solute_in"]       = solute_in;       // kg/s
    kpis_["liquorFlow"]      = F_liq;           // kmol/s
    kpis_["newtonIters"]     = static_cast<scalar>(sr.iterations);

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=====================  Crystalliser (MSMPR) Result  ==============\n"
                  << "  Operating T = " << std::fixed << std::setprecision(1) << T_op
                  << " K (" << (T_op - 273.15) << " °C),  V = " << std::setprecision(3) << V
                  << " m³,  Q = " << std::scientific << std::setprecision(3) << Q
                  << " m³/s  ->  τ = " << std::fixed << std::setprecision(0) << tau << " s\n"
                  << "  Supersaturation S = " << std::setprecision(4) << S
                  << "  (c_sat = " << std::setprecision(3) << c_sat << " kg/kg, feed S_feed = "
                  << std::setprecision(3) << S_feed << ")\n"
                  << "  Growth G = " << std::scientific << std::setprecision(3) << G
                  << " m/s,  nucleation B0 = " << B0 << " #/m³s,  n0 = " << n0 << " #/m⁴\n"
                  << "  Dominant size L_d = 3Gτ = " << std::fixed << std::setprecision(1)
                  << (L_dom * 1.0e6) << " µm,  L43 = " << (L43 * 1.0e6)
                  << " µm,  CV = " << std::setprecision(2) << CV << "\n"
                  << "  Magma density M_T = " << std::setprecision(1) << M_T
                  << " kg/m³  ->  crystals = " << std::scientific << std::setprecision(3)
                  << crystal_mass << " kg/s  (yield " << std::fixed << std::setprecision(1)
                  << (100.0 * yield) << " %)\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

// ---------------------------------------------------------------------------
//  Discretised PBE on a regular size grid.  Steady MSMPR variant.
//
//  Where the method-of-moments closes the moments mu_j in CLOSED FORM
//  (requiring size-independent growth, no breakage, no agglomeration), this
//  method discretises the population density n(L) directly on N evenly-
//  spaced size bins L_k = (k+0.5) dL, k = 0..N-1.  Steady PBE:
//
//      d(G(L) n) / dL  +  n / tau  =  0,        n(0) = B0 / G(0).
//
//  First-order upwind on the cell-centred grid:
//
//      G_k n_k - G_{k-1} n_{k-1}  =  -dL n_k / tau
//      n_k  =  n_{k-1} * G_{k-1} / (G_k + dL / tau).
//
//  For size-INDEPENDENT growth this reduces to a geometric sequence whose
//  continuous limit is exactly the MSMPR exponential n(L) = n0 exp(-L/Gtau)
//  -- the sanity check that ships with the tutorial.  For size-DEPENDENT
//  growth (G_k = G0 * (1 + alpha L_k)), the moments shift relative to MSMPR
//  in the documented direction (more big crystals).
//
//  Closure: same Newton-1D on S as the moment method, but mu_3 is summed
//  over the bins (mu_j = Sum_k L_k^j n_k dL).  Restricted to j=0 in the
//  nucleation magma exponent (primary, unseeded bootstrap); j>0 would
//  need an inner iteration we skip.
// ---------------------------------------------------------------------------
int Crystalliser::solveDiscretizedPBE(const DictPtr& dict,
                                      const ThermoPackage& thermo,
                                      int verbosity)
{
    const std::size_t n = thermo.n();

    // ---- Feed (one OR several inlets, summed) -- shared helper ----------
    const FeedState fd = readCombinedFeed(dict, thermo);
    const scalar F = fd.F, T_feed = fd.T_feed, P = fd.P;
    const sVector& z = fd.z;

    auto oper = dict->subDict("operation");
    const scalar T_op = oper->lookupScalar("operatingTemperature", Dims::temperature);
    const scalar V    = oper->lookupScalar("volume", Dims::volume);
    // Grid hardware: how many bins + what's the largest size we care about.
    // Defaults are conservative -- a Gtau ~ 100 um needs Lmax >~ 8 Gtau,
    // ~800 um, with ~64 bins for a smooth profile.
    const std::size_t Nbins = static_cast<std::size_t>(oper->lookupScalarOrDefault("bins", 64.0));
    const scalar Lmax = oper->lookupScalarOrDefault("Lmax", 1.0e-3, Dims::length);
    if (Nbins < 2 || Lmax <= 0.0)
        throw std::runtime_error("Crystalliser(FVM): need at least 2 bins"
            " and a positive Lmax in `operation`.");

    // ---- Solute / solvent / (antisolvent) + saturation -- shared helper
    //      (electrolyte m_sat(T) OR a solubility curve, same as MSMPR). --------
    const std::string soluteSel = oper->lookupWordOrDefault("solute", "");
    const SatState sat = crystSaturation(thermo, z, F, T_op, soluteSel);
    const bool useElec = sat.useElec;
    const std::size_t iSolute = sat.iSolute;
    const Component& sol  = thermo.comp(iSolute);
    const scalar MW_sol   = sat.MW_sol;
    const scalar rho_c    = sol.rho_p();
    const scalar k_v      = sol.k_v();
    if (rho_c <= 0.0)
        throw std::runtime_error("Crystalliser(FVM): solute '" + sol.name() + "' needs a `solid {"
            " rho_p; k_v; }` block.");

    // ---- Kinetics (resolved by the flowsheet from constant/crystallisation)
    if (!dict->found("crystallisation"))
        throw std::runtime_error("Crystalliser(FVM): missing `crystallisation"
            " <name>;` reference.");
    auto kin   = dict->subDict("crystallisation");
    auto grow  = kin->subDict("growth");
    auto nucl  = kin->subDict("nucleation");
    const scalar k_g = grow->lookupScalar("k_g");
    const scalar g   = grow->lookupScalarOrDefault("g", 1.0);
    // Optional size-dependence:  G(L) = G0 * (1 + sizeFactor * L), with
    // sizeFactor in 1/m.  Default 0 -> size-independent -> reduces to MSMPR.
    const scalar sizeFactor = grow->lookupScalarOrDefault("sizeFactor", 0.0);
    const scalar k_b = nucl->lookupScalar("k_b");
    const scalar b   = nucl->lookupScalarOrDefault("b", 1.0);
    const scalar j   = nucl->lookupScalarOrDefault("j", 0.0);
    if (j != 0.0)
        throw std::runtime_error("Crystalliser(FVM): nucleation magma exponent"
            " j must be 0  (primary nucleation only).  A non-zero j"
            " would need an inner iteration coupling B0 to mu3; deferred.");

    // ---- Hydraulics: Q, tau -------------------------------------------
    scalar Q = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        Q += F * z[i] * 1000.0 * thermo.comp(i).Vliq();
    if (Q <= 0.0)
        throw std::runtime_error("Crystalliser(FVM): zero volumetric flow"
            " (components need a `Vliq`).");
    const scalar tau = V / Q;

    const scalar c_sat        = sat.c_sat;                 // helper (electrolyte OR curve)
    const scalar solvent_mass = sat.solvent_mass;
    const scalar solute_in    = F * z[iSolute] * MW_sol;
    const scalar c_feed       = (solvent_mass > 0.0) ? solute_in / solvent_mass : 0.0;
    const scalar S_feed       = (c_sat > 0.0) ? c_feed / c_sat : 1.0;
    if (S_feed <= 1.0)
        throw std::runtime_error("Crystalliser(FVM): feed is not supersaturated"
            " at the operating temperature (S_feed <= 1).");

    // ---- Bin geometry + the growth law --------------------------------
    const scalar dL = Lmax / static_cast<scalar>(Nbins);
    std::vector<scalar> L_centre(Nbins), G_bin(Nbins), n_pop(Nbins, 0.0);
    for (std::size_t kbin = 0; kbin < Nbins; ++kbin)
        L_centre[kbin] = (static_cast<scalar>(kbin) + 0.5) * dL;

    // ---- The population profile for a given S, written as a small lambda
    //      so the Newton-1D below can call it cheaply.  Returns mu3 (the
    //      number we actually need for the closure) AND populates n_pop +
    //      G_bin so we can extract a full profile after the loop.
    auto buildProfileAndMu3 = [&](scalar S) -> scalar
    {
        const scalar sup = std::max(S - 1.0, 0.0);
        const scalar G0  = k_g * std::pow(sup, g);
        const scalar B0  = k_b * std::pow(sup, b);
        // G_k at each bin centre.  Linear law for now; richer forms can be
        // added without changing the FVM update.
        for (std::size_t kbin = 0; kbin < Nbins; ++kbin)
            G_bin[kbin] = G0 * (1.0 + sizeFactor * L_centre[kbin]);
        // Boundary at L=0: n(0) = B0 / G(0) = B0 / G0.  We seed the first
        // bin centre with this and march forward.
        n_pop[0] = (G0 > 0.0) ? B0 / G0 : 0.0;
        for (std::size_t kbin = 1; kbin < Nbins; ++kbin)
        {
            const scalar G_prev = G_bin[kbin - 1];
            const scalar G_curr = G_bin[kbin];
            // Upwind first-order, derived in the file header:
            //     n_k = n_{k-1} * G_{k-1} / (G_k + dL / tau).
            const scalar denom = G_curr + dL / tau;
            n_pop[kbin] = (denom > 0.0)
                ? n_pop[kbin - 1] * G_prev / denom
              : 0.0;
        }
        // mu3 = Sum_k L_k^3 n_k dL.
        scalar mu3 = 0.0;
        for (std::size_t kbin = 0; kbin < Nbins; ++kbin)
            mu3 += L_centre[kbin] * L_centre[kbin] * L_centre[kbin] * n_pop[kbin];
        mu3 *= dL;
        return mu3;
    };

    // ---- Newton-1D on S, same residual structure as MSMPR --------------
    auto residual = [&](scalar S) -> scalar
    {
        const scalar mu3 = buildProfileAndMu3(S);
        const scalar M_T = rho_c * k_v * mu3;
        const scalar removed    = solute_in - S * c_sat * solvent_mass;
        const scalar production = Q * M_T;
        return removed - production;
    };
    auto dres = [&](scalar S)
    {
        const scalar h = 1.0e-6 * std::max(std::abs(S), 1.0);
        return (residual(S + h) - residual(S - h)) / (2.0 * h);
    };

    solver::NROptions nro;
    nro.lower = 1.0 + 1.0e-9;
    nro.upper = S_feed;
    nro.bracket = true;
    nro.tolerance = 1.0e-10;
    nro.maxIter = 100;
    auto sr = solver::newton1D(residual, dres, 0.5 * (1.0 + S_feed), nro);
    const scalar S = sr.x;

    // Final profile + moments at the converged supersaturation.
    const scalar mu3 = buildProfileAndMu3(S);
    scalar mu0 = 0.0, mu1 = 0.0, mu2 = 0.0, mu4 = 0.0;
    for (std::size_t kbin = 0; kbin < Nbins; ++kbin)
    {
        const scalar L  = L_centre[kbin];
        const scalar nk = n_pop[kbin];
        mu0 += nk;
        mu1 += L * nk;
        mu2 += L * L * nk;
        mu4 += L * L * L * L * nk;
    }
    mu0 *= dL;  mu1 *= dL;  mu2 *= dL;  mu4 *= dL;
    const scalar M_T  = rho_c * k_v * mu3;
    const scalar sup  = std::max(S - 1.0, 0.0);
    const scalar G0   = k_g * std::pow(sup, g);
    const scalar B0   = k_b * std::pow(sup, b);
    const scalar L10  = (mu0 > 0.0) ? mu1 / mu0 : 0.0;
    const scalar L43  = (mu3 > 0.0) ? mu4 / mu3 : 0.0;
    // Dominant size: the L_k where L_k^3 * n_k is maximum (mass mode).
    scalar L_dom = 0.0, peakMass = 0.0;
    for (std::size_t kbin = 0; kbin < Nbins; ++kbin)
    {
        const scalar L = L_centre[kbin];
        const scalar mk = L * L * L * n_pop[kbin];
        if (mk > peakMass) { peakMass = mk; L_dom = L; }
    }
    const scalar CV  = (mu1 > 0.0)
                     ? std::sqrt(std::max(0.0, mu0 * mu2 / (mu1 * mu1) - 1.0)) : 0.0;

    // ---- Crystal production + magma stream (same shape as MSMPR) -------
    const scalar crystal_mass = Q * M_T;
    const scalar crystal_mol  = crystal_mass / MW_sol;
    const scalar yield        = (solute_in > 0.0) ? crystal_mass / solute_in : 0.0;

    sVector nliq(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) nliq[i] = F * z[i];
    nliq[iSolute] = std::max(0.0, nliq[iSolute] - crystal_mol);
    scalar F_liq = 0.0; for (auto v : nliq) F_liq += v;

    produced_.clear();
    ProcessStream magma;
    magma.name = "magma";
    magma.F = F_liq;  magma.T = T_op;  magma.P = P;  magma.vf = 0.0;
    magma.z.assign(n, 0.0);
    if (F_liq > 0.0) for (std::size_t i = 0; i < n; ++i) magma.z[i] = nliq[i] / F_liq;
    magma.s.assign(n, 0.0);  magma.s[iSolute] = crystal_mol;

    // ---- PSD on the bins (the headline output) -------------------------
    UnitProfile prof;
    prof.xAxis = "L_micron";
    std::vector<scalar> Lcol, ncol, masscol, Gcol;
    Lcol.reserve(Nbins);  ncol.reserve(Nbins);
    masscol.reserve(Nbins);  Gcol.reserve(Nbins);
    std::vector<scalar> binDia(Nbins), binMass(Nbins, 0.0);
    scalar massSum = 0.0;
    for (std::size_t kbin = 0; kbin < Nbins; ++kbin)
    {
        const scalar L = L_centre[kbin];
        const scalar nk = n_pop[kbin];
        const scalar mk = L * L * L * nk * dL;
        binDia[kbin] = L;
        binMass[kbin] = mk;
        massSum += mk;
        Lcol.push_back(L * 1.0e6);
        ncol.push_back(nk);
        masscol.push_back(mk);
        Gcol.push_back(G_bin[kbin]);
    }
    if (massSum > 0.0)
    {
        magma.psd.diameter = binDia;
        magma.psd.massFrac.resize(Nbins);
        for (std::size_t kbin = 0; kbin < Nbins; ++kbin)
            magma.psd.massFrac[kbin] = binMass[kbin] / massSum;
    }
    prof.columns["number_density"]  = ncol;
    prof.columns["mass_density"]    = masscol;
    prof.columns["growth_rate"]     = Gcol;
    profile_ = prof;
    produced_.push_back(magma);

    // ---- Cooling duty --------------------------------------------------
    scalar Cp_feed = 0.0;
    const scalar T_mean = 0.5 * (T_feed + T_op);
    for (std::size_t i = 0; i < n; ++i)
        if (z[i] > 0.0 && thermo.comp(i).hasCpLiquid())
            Cp_feed += z[i] * thermo.comp(i).cpLiquid().Cp(T_mean);
    const scalar Q_sensible = F * 1000.0 * Cp_feed * (T_feed - T_op);
    std::string dHsource;
    const scalar dHcryst    = crystHeatPerMol(thermo, sat, T_op,
        useElec ? oper->lookupScalarOrDefault("dHcryst", 0.0) : sol.dHcryst(), dHsource);
    announceCrystHeat(dHcryst, dHsource, verbosity);
    const scalar Q_cryst    = crystal_mol * 1000.0 * dHcryst;
    const scalar Q_removed  = Q_sensible + Q_cryst;

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["T_op"]            = T_op;
    kpis_["Q_kW"]            = -Q_removed / 1000.0;  // kW, cooling NEGATIVE -> cold-utility stub
    kpis_["residenceTime"]   = tau;
    kpis_["throughput"]      = Q;
    kpis_["c_sat"]           = c_sat;
    kpis_["supersaturation"] = S;
    kpis_["growthRate_L0"]   = G0;
    kpis_["nucleationRate"]  = B0;
    kpis_["L_dominant"]      = L_dom;
    kpis_["L_meanNumber"]    = L10;
    kpis_["L_meanMass"]      = L43;
    kpis_["CV"]              = CV;
    kpis_["magmaDensity"]    = M_T;
    kpis_["mu0"]             = mu0;
    kpis_["mu3"]             = mu3;
    kpis_["yield"]           = yield;
    kpis_["crystal_flow"]    = crystal_mass;
    kpis_["crystal_mol"]     = crystal_mol;
    kpis_["solute_in"]       = solute_in;
    kpis_["liquorFlow"]      = F_liq;
    kpis_["Q_removed"]       = Q_removed;
    kpis_["bins"]            = static_cast<scalar>(Nbins);
    kpis_["sizeFactor"]      = sizeFactor;
    kpis_["newtonIters"]     = static_cast<scalar>(sr.iterations);

    if (verbosity >= 2)
    {
        std::cout << "\n=====================  Crystalliser (FVM-PBE) Result  =============\n"
                  << "  Grid: " << Nbins << " bins, L in [0, "
                  << std::scientific << std::setprecision(3) << Lmax << "] m"
                  << "  (dL = " << dL << " m)\n"
                  << "  Operating T = " << std::fixed << std::setprecision(1) << T_op
                  << " K,  V = " << std::setprecision(3) << V
                  << " m³,  Q = " << std::scientific << std::setprecision(3) << Q
                  << " m³/s  ->  τ = " << std::fixed << std::setprecision(0) << tau << " s\n"
                  << "  Supersaturation S = " << std::setprecision(4) << S
                  << "  (S_feed = " << std::setprecision(3) << S_feed << ")\n"
                  << "  G(0) = " << std::scientific << std::setprecision(3) << G0
                  << " m/s,  sizeFactor = " << std::fixed << std::setprecision(2)
                  << sizeFactor << " 1/m,  B0 = " << std::scientific << B0 << " #/m³s\n"
                  << "  Dominant size L_d = " << std::fixed << std::setprecision(1)
                  << (L_dom * 1.0e6) << " µm,  L43 = " << (L43 * 1.0e6)
                  << " µm,  CV = " << std::setprecision(2) << CV << "\n"
                  << "  Magma density M_T = " << std::setprecision(1) << M_T
                  << " kg/m³,  crystals = " << std::scientific << std::setprecision(3)
                  << crystal_mass << " kg/s  (yield " << std::fixed << std::setprecision(1)
                  << (100.0 * yield) << " %)\n"
                  << "==================================================================\n\n";
    }
    return 0;
}


} // namespace Choupo
