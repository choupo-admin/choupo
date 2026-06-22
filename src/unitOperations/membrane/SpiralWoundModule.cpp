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

#include "SpiralWoundModule.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Units.H"
#include "massTransfer/MassTransferModel.H"
#include "osmotic/OsmoticModel.H"
#include "pressureDrop/PressureDropModel.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/electrolyte/ScalingIndices.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "transport/TransportModel.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <variant>

namespace Choupo {

namespace {

// Convert composition (mole fractions z) + total molar flow F [kmol/s] +
// per-component molar mass MW [kg/kmol] + solution mass density rho [kg/m³]
// into per-component concentrations c_i [kmol/m³] and the volumetric flow Q
// [m³/s].
//
// Closure: `rho` is the SOLUTION mass density (constant, the dilute-aqueous
// approximation).  The volumetric flow is the TRUE mass flow over rho ---
//   Q = (Σ z_i F · MW_i) / rho ---
// so the reconstructed mass density Σ c_i · MW_i equals rho EXACTLY and mass
// is conserved through the module.  (The earlier shortcut took Q with
// MW_avg ≈ MW_water AND pinned the downstream water concentration to the
// PURE-water value rho/MW_water; the two together added the solute mass on
// top of a full pure-water mass and CREATED ~1 % mass across an element --
// the closure assertion below now catches any such drift.)
struct BulkState
{
    scalar Q;                       // m³/s
    std::vector<scalar> c;          // kmol/m³ per component
};

BulkState toBulk(scalar F_kmols, const sVector& z, const sVector& MW,
                 scalar rho_kgm3, std::size_t Ncomp)
{
    // Mass flow [kg/s] = F [kmol/s] · MW_avg [kg/kmol];  Q = mass / rho.
    scalar MW_avg = 0.0;
    for (std::size_t i = 0; i < Ncomp; ++i) MW_avg += z[i] * MW[i];
    const scalar Q = F_kmols * MW_avg / rho_kgm3;
    // c_i [kmol/m³] = (F_i [kmol/s]) / Q [m³/s] = (z_i F) / Q
    BulkState s;
    s.Q = Q;
    s.c.assign(Ncomp, 0.0);
    for (std::size_t i = 0; i < Ncomp; ++i)
        s.c[i] = z[i] * F_kmols / Q;
    return s;
}

} // anonymous namespace

// ---------------------------------------------------------------------------
//  solve()
// ---------------------------------------------------------------------------
int SpiralWoundModule::solve(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    const std::size_t Ncomp = thermo.n();

    // ---- Inlet stream from the case's input wiring -------------------------
    // The Flowsheet has already deposited the inlet under two top-level
    // sub-dicts: `feed` (F, T, P) and `composition` (mole fractions per
    // component).  Same pattern as PFR / CSTR.
    auto feedDict = dict->subDict("feed");
    const scalar F_in   = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_in   = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P_in   = feedDict->lookupScalar("P", Dims::pressure);
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
        throw std::runtime_error("SpiralWoundModule: feed composition does not"
            " sum to 1 (Σz = " + std::to_string(zSum) + ")");

    // ---- Operating parameters ---------------------------------------------
    auto opDict = dict->subDict("operation");
    const std::string membraneName = opDict->lookupWord("membrane");

    // ---- Module hardware spec ----------------------------------------------
    // EITHER  `area` + `length` (+ `elements`)  -- explicit area (legacy spec,
    //         numerically untouched)
    // OR      `moduleDiameter` + `nModules`     -- nominal 40-inch standard
    //         elements; the per-module area comes from the hand table below
    //         and the derivation is announced.  `nModules` may be REAL
    //         (continuous, for optimisation drivers -- announced); the
    //         fractional remainder is marched as a shorter last element.
    //
    // Standard 40-inch spiral-wound elements: nominal diameter -> typical
    // active area.  Catalogue-representative values (DuPont FilmTec /
    // Hydranautics / Toray product sheets; the ft2 class is the industry name):
    //     2.5 in ->   2.6 m2   ( 28 ft2 class, e.g. XX-2540)
    //     4   in ->   7.9 m2   ( 85 ft2 class, e.g. XX-4040)
    //     8   in ->  37.2 m2   (400 ft2 class, e.g. SW30HR-380 / BW30-400)
    //     16  in -> 148.6 m2   (1600 ft2 class, large-format elements)
    const bool hasArea = opDict->found("area");
    const bool hasDiam = opDict->found("moduleDiameter");
    if (hasArea && hasDiam)
        throw std::runtime_error("spiralWoundModule: give EITHER `area` "
            "(explicit area, legacy spec) OR `moduleDiameter` + `nModules` "
            "(nominal 40-inch standard elements) -- not both");

    scalar A_membrane   = 0.0;     // per element / module [m2]
    scalar L            = 0.0;     // per element / module [m]
    scalar nModulesReal = 1.0;     // continuous module count (nominal spec)
    int    nElements    = 1;       // marched elements (ceil of nModulesReal)
    scalar lastFrac     = 1.0;     // fractional size of the LAST element
    bool   nominalSpec  = false;
    scalar diam_in      = 0.0;     // matched nominal diameter [inch]

    if (hasDiam)
    {
        nominalSpec = true;
        if (opDict->found("elements"))
            throw std::runtime_error("spiralWoundModule: `elements` is the "
                "legacy-train key -- with `moduleDiameter` the count is "
                "`nModules` (a REAL number is allowed)");
        if (!opDict->hasDimensions("moduleDiameter")
         || !(opDict->dimensionsOf("moduleDiameter") == Dims::length))
            throw std::runtime_error("spiralWoundModule: moduleDiameter needs "
                "a length unit -- e.g. `moduleDiameter 8 in;`  (in | inch)");
        const scalar d_in_raw = opDict->lookupScalar("moduleDiameter")
                              / units::inch_to_m;

        struct NominalElement { scalar d_in; scalar area_m2; };
        static const NominalElement nominalTable[] =
            { {2.5, 2.6}, {4.0, 7.9}, {8.0, 37.2}, {16.0, 148.6} };
        const NominalElement* hit = nullptr;
        for (const auto& t : nominalTable)
            if (std::abs(d_in_raw - t.d_in) < 1.0e-3 * t.d_in) hit = &t;
        if (!hit)
        {
            char b[320];
            std::snprintf(b, sizeof(b),
                "spiralWoundModule: moduleDiameter %g in is not a standard "
                "element -- the nominal table knows 2.5 in (2.6 m2), "
                "4 in (7.9 m2), 8 in (37.2 m2) and 16 in (148.6 m2) "
                "(40-inch standard elements).  For anything else give the "
                "explicit `area` + `length`.", static_cast<double>(d_in_raw));
            throw std::runtime_error(b);
        }
        diam_in    = hit->d_in;
        A_membrane = hit->area_m2;

        nModulesReal = opDict->lookupScalarOrDefault("nModules", 1.0);
        if (nModulesReal <= 0.0)
            throw std::runtime_error("spiralWoundModule: nModules must be > 0");
        const scalar nFull = std::floor(nModulesReal + 1.0e-9);
        const scalar frac  = nModulesReal - nFull;
        if (frac > 1.0e-9) { nElements = static_cast<int>(nFull) + 1; lastFrac = frac; }
        else               { nElements = std::max(1, static_cast<int>(nFull)); }

        // 40-inch standard element length (1.016 m); explicit `length` overrides.
        L = opDict->lookupScalarOrDefault("length", 1.016, Dims::length);
    }
    else
    {
        A_membrane   = opDict->lookupScalar("area",   Dims::area);
        L            = opDict->lookupScalar("length", Dims::length);
        nElements    = static_cast<int>(opDict->lookupScalarOrDefault("elements", 1.0));
        nModulesReal = static_cast<scalar>(nElements);
    }

    if (verbosity >= 2)
    {
        char b[200];
        if (nominalSpec)
        {
            std::snprintf(b, sizeof(b),
                "  [spec] %g x %g m2 (%gin/40in standard element) = %g m2\n",
                static_cast<double>(nModulesReal),
                static_cast<double>(A_membrane),
                static_cast<double>(diam_in),
                static_cast<double>(nModulesReal * A_membrane));
            std::cout << b;
            if (lastFrac != 1.0)
            {
                std::snprintf(b, sizeof(b),
                    "  [spec] nModules %g (continuous -- optimisation mode)\n",
                    static_cast<double>(nModulesReal));
                std::cout << b;
            }
        }
        else
        {
            std::snprintf(b, sizeof(b),
                "  [spec] explicit area (legacy spec): %g m2 per element\n",
                static_cast<double>(A_membrane));
            std::cout << b;
        }
    }

    const scalar P_perm     = opDict->lookupScalar("P_permeate", Dims::pressure);

    const int    nNodes     = static_cast<int>(opDict->lookupScalarOrDefault("nNodes", 100.0));
    const scalar rho        = opDict->lookupScalarOrDefault("rho_feed", 1000.0); // kg/m³

    // ---- Channel hydraulics: k_film + dP selectable models --------
    //  The feed-channel GEOMETRY (channelHeight, spacerPorosity, viscosity)
    //  is shared by the mass-transfer (k_film) and pressure-drop models, so
    //  it is read once --- from whichever sub-block declares it (massTransfer
    //  takes priority).  Each model is then COMPUTED from the local crossflow
    //  velocity u = Q_b(z)/A_channel (so both fall along the channel).  With
    //  NO sub-block the legacy constants are used (k_film / dP_feed_total ---
    //  membrane01/02/03 unchanged).
    scalar h_ch = 0.7e-3, eps = 0.9, mu_feed = 1.0e-3, D_solute = 1.6e-9;
    auto readGeom = [&](const DictPtr& b)
    {
        h_ch    = b->lookupScalarOrDefault("channelHeight",  h_ch, Dims::length);
        eps     = b->lookupScalarOrDefault("spacerPorosity", eps);
        mu_feed = b->lookupScalarOrDefault("viscosity",      mu_feed);
    };
    if (opDict->found("pressureDrop")) readGeom(opDict->subDict("pressureDrop"));
    if (opDict->found("massTransfer"))
    {
        auto mt = opDict->subDict("massTransfer");
        readGeom(mt);
        D_solute = mt->lookupScalarOrDefault("diffusivity", D_solute);
    }
    const scalar W_ch      = A_membrane / (2.0 * L);   // leaf width (2-sided)
    const scalar A_channel = W_ch * h_ch * eps;
    const scalar d_h       = 2.0 * h_ch * eps;

    // k_film model (concentration polarisation).
    std::unique_ptr<MassTransferModel> mtModel;
    scalar k_film_const = 0.0;
    if (opDict->found("massTransfer"))
    {
        auto mt = opDict->subDict("massTransfer");
        mtModel = MassTransferModel::New(mt->lookupWordOrDefault("model", "constant"));
        mtModel->readParameters(mt);
    }
    else
        k_film_const = opDict->lookupScalar("k_film", Dims::massTransferCoeff);

    // Pressure-drop model (axial friction).
    std::unique_ptr<PressureDropModel> pdModel;
    if (opDict->found("pressureDrop"))
    {
        auto pd = opDict->subDict("pressureDrop");
        pdModel = PressureDropModel::New(pd->lookupWordOrDefault("model", "SchockMiquel"));
        pdModel->readParameters(pd);
    }

    // Osmotic-pressure model (van't Hoff default; Pitzer for concentrated
    // brines).  Always built so localFluxes has a model to call.
    std::unique_ptr<OsmoticModel> osmModel;
    if (opDict->found("osmotic"))
    {
        auto os = opDict->subDict("osmotic");
        osmModel = OsmoticModel::New(os->lookupWordOrDefault("model", "vanHoff"));
        osmModel->readParameters(os);
    }
    else
        osmModel = OsmoticModel::New("vanHoff");

    // Transport law (the inner J_w–c_m–c_p problem).  A `transport <name>;`
    // keyword selects the law; without it `solutionDiffusion` (the baseline)
    // is used, so existing cases are unchanged.  The builtins are registered
    // here (the factory lives with SpiralWoundModule, not in UnitOperation).
    membrane::TransportModel::registerBuiltins();
    std::unique_ptr<membrane::TransportModel> transportModel =
        membrane::TransportModel::New(
            opDict->lookupWordOrDefault("transport", "solutionDiffusion"));
    const scalar dP_drop    = opDict->lookupScalarOrDefault("dP_feed_total", 0.0,
                                                            Dims::pressure);

    // Multi-element train: N elements in series (nElements resolved by the
    // hardware spec above -- legacy `elements` or nominal `nModules`).
    // `area` / `length` are PER ELEMENT; the feed channel is continuous, so
    // the march simply runs over the N elements one after another (the
    // retentate of one is the feed of the next).  `interElementDP` is a
    // discrete connector loss applied at each element boundary.
    const scalar interDP = opDict->lookupScalarOrDefault("interElementDP", 0.0,
                                                         Dims::pressure);

    // Find the water component by name; if the user has not called it
    // "water" the look-up fails loudly --- the transport model
    // assumes an aqueous carrier.
    const std::size_t iWater = thermo.indexOf("water");
    const scalar MW_water = thermo.comp(iWater).MW();      // kg/kmol

    // Per-component molar masses [kg/kmol]: needed for a mass-consistent
    // bulk closure (the true mixture mass sets the volumetric flow, so
    // Σ c_i·MW_i reconstructs to rho exactly --- mass conserves).
    sVector MW(Ncomp, 0.0);
    for (std::size_t i = 0; i < Ncomp; ++i) MW[i] = thermo.comp(i).MW();

    // ---- Build per-solute permeability table from the Membrane DB ---------
    const Membrane& mem = MembraneRegistry::byName(membraneName);

    // Rating check (no-silent-crutch / "ratings should speak"): WARN -- never
    // clamp -- if the feed is outside the element's catalogue rating, so the
    // limit speaks during the solve, not only at sizing.  P_in is SI (Pa); the
    // catalogue P_max is in bar.  The advisory is ALWAYS recorded (so the GUI
    // surfaces it); the log line is gated by verbosity.
    if (mem.P_max_bar() > 0.0 && P_in / 1.0e5 > mem.P_max_bar())
    {
        char b[200];
        std::snprintf(b, sizeof(b),
            "feed P %.2f bar EXCEEDS P_max %.2f bar -- operating above the element's rating",
            static_cast<double>(P_in / 1.0e5), static_cast<double>(mem.P_max_bar()));
        if (verbosity >= 1)
            std::cout << "  [rating] membrane '" << membraneName << "': " << b << "\n";
        AdvisoryLog::instance().add("rating", "warning", "membrane '" + membraneName + "'", b);
    }
    if (mem.T_max_K() > 0.0 && T_in > mem.T_max_K())
    {
        char b[200];
        std::snprintf(b, sizeof(b), "feed T %.1f K EXCEEDS T_max %.1f K",
            static_cast<double>(T_in), static_cast<double>(mem.T_max_K()));
        if (verbosity >= 1)
            std::cout << "  [rating] membrane '" << membraneName << "': " << b << "\n";
        AdvisoryLog::instance().add("rating", "warning", "membrane '" + membraneName + "'", b);
    }
    std::vector<std::size_t> soluteIdx;
    std::vector<scalar>      B_s;
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        if (i == iWater) continue;
        if (!thermo.comp(i).isNonvolatile()) continue;     // skip non-solutes
        soluteIdx.push_back(i);
        const std::string nm = thermo.comp(i).name();
        const scalar Bi = mem.B_s(nm);
        B_s.push_back(Bi);
        if (Bi == 0.0 && verbosity >= 1)
            std::cout << "  WARNING  membrane '" << membraneName
                      << "' has no B_s entry for solute '" << nm
                      << "' --- assuming perfect rejection (B_s = 0)\n";
    }
    const std::size_t Ns = soluteIdx.size();

    // ---- Discretise the channel length -----------------------------------
    // Effective width W chosen such that  W · L = A_membrane.
    const scalar W  = A_membrane / L;
    const scalar dz = L / nNodes;

    // Initial bulk state from the inlet stream.
    auto bulk0 = toBulk(F_in, z_in, MW, rho, Ncomp);
    // Pack into per-solute bulk concentrations (the local solver only
    // needs the solute c values).
    std::vector<scalar> c_b(Ns, 0.0);
    for (std::size_t s = 0; s < Ns; ++s) c_b[s] = bulk0.c[soluteIdx[s]];
    scalar Q_b = bulk0.Q;
    scalar P_b = P_in;

    // ---- Optional scaling{} audit ------------------------------------------
    // At each module exit along the vessel the BULK concentrate AND the WALL
    // composition (c_m -- the module's own polarisation model; the wall SI is
    // THE scaling indicator) are speciated (Davies, pH given or solved from
    // electroneutrality) and the saturation index of each requested mineral
    // is recorded.  The audit is READ-ONLY on the march: it never feeds back
    // into the transport, so the legacy numerics are untouched.
    const bool doScaling = dict->found("scaling");
    std::vector<std::string> scaleMinerals;
    bool   scalePHsolve = false;
    scalar scalePH      = 7.0;
    std::unique_ptr<electrolyte::SpeciationSolver> specSolver;
    std::vector<scalar> audRecovery, audI, audPH;            // per-module rows
    std::map<std::string, std::vector<scalar>> audSIbulk, audSIwall;
    // Industry calcite indices (LSI / Stiff-Davis / Ryznar), bulk + wall -- the
    // concentration-based EMPIRICAL shortcut, surfaced alongside the rigorous
    // activity SI so the divergence at the wall is visible.  Active only when
    // calcite is tracked AND the feed carries Ca + HCO3.
    bool   doIndices = false;
    int    idxCa = -1, idxHCO3 = -1;     // solute slots for Ca / HCO3
    double logK_calcite_T = 0.0;         // HCO3-basis calcite log K at T (= pK2-pKsp)
    std::vector<scalar> audLSIbulk, audLSIwall, audSDbulk, audSDwall,
                        audRSIbulk, audRSIwall;

    if (doScaling)
    {
        auto sc = dict->subDict("scaling");
        scaleMinerals = sc->lookupWordList("minerals");
        if (scaleMinerals.empty())
            throw std::runtime_error("spiralWoundModule scaling{}: needs "
                "`minerals ( calcite gypsum ... );` -- which saturation "
                "indices to track");

        // pH: `pH 6.8;` (given, e.g. acid-dosed feed) or `pH solve;`
        // (H+ solved from electroneutrality) -- same closure pair as the
        // choupoProps speciate / scalingScan ops.
        const EntryValue& pH = sc->entryValue("pH");
        if (std::holds_alternative<std::string>(pH))
        {
            const auto& w = std::get<std::string>(pH);
            if (w != "solve")
                throw std::runtime_error("spiralWoundModule scaling{}: pH must "
                    "be a number (given) or the word `solve` -- got '" + w + "'");
            scalePHsolve = true;
        }
        else
            scalePH = sc->lookupScalar("pH");

        // The audit needs an IONIC water analysis: every component but water
        // must be a nonvolatile master ion of the electrolyte catalogue.
        if (Ns != Ncomp - 1)
            throw std::runtime_error("spiralWoundModule scaling{}: the scaling "
                "audit needs an ionic water analysis -- every component except "
                "water must be a nonvolatile master ion (components Ca, Mg, Na, "
                "K, Cl, SO4, HCO3, ... + water, with the electrolyte catalogue "
                "in constant/electrolyte/).  A non-ionic / volatile solute is "
                "in the feed.");
        for (std::size_t s = 0; s < Ns; ++s)
        {
            const std::string nm = thermo.comp(soluteIdx[s]).name();
            if (!electrolyte::findIon(nm))
                throw std::runtime_error("spiralWoundModule scaling{}: "
                    "component '" + nm + "' has no row in ions.dat -- the "
                    "scaling audit needs an ionic water analysis: components "
                    "Ca, HCO3, ... (master ions of the electrolyte catalogue) "
                    "+ water, and the catalogue in constant/electrolyte/.");
        }

        if (verbosity >= 1)
            std::cout << "  [scaling] per-ion solution-diffusion without "
                         "charge coupling -- permeate electroneutrality not "
                         "enforced (v1)\n"
                      << "  [scaling] molalities from kmol/m3 at rho = " << rho
                      << " kg/m3 (dilute aqueous closure)\n";

        // Optional aqueous-activity-model selection (default Davies, the only S1
        // builtin; an unknown name is refused with the available list).
        specSolver = std::make_unique<electrolyte::SpeciationSolver>(
            sc->lookupWordOrDefault("activityModel", "davies"));

        // Requested minerals must be in the catalogue ...
        for (const auto& m : scaleMinerals)
        {
            bool known = false;
            for (const auto& me : specSolver->minerals())
                if (me.mineral == m) { known = true; break; }
            if (!known)
            {
                std::string avail;
                for (const auto& me : specSolver->minerals())
                    avail += " " + me.mineral;
                throw std::runtime_error("spiralWoundModule scaling{}: mineral '"
                    + m + "' is not in minerals.dat.  Catalogue has:" + avail);
            }
        }

        // ... and resolvable from the FEED analysis.  This pre-solve also
        // lets the speciation honesty header + Davies advisories speak once.
        electrolyte::SpeciationInput in;
        in.solvePH = scalePHsolve;
        in.pH      = scalePH;
        in.T       = T_in;
        for (std::size_t s = 0; s < Ns; ++s)
            if (c_b[s] > 1.0e-30)
                in.totals[thermo.comp(soluteIdx[s]).name()]
                    = c_b[s] * 1.0e3 / rho;        // kmol/m3 -> mol/kg water
        const auto feedRes = specSolver->solve(in, verbosity);
        for (const auto& m : scaleMinerals)
            if (!feedRes.SI.count(m))
                throw std::runtime_error("spiralWoundModule scaling{}: mineral '"
                    + m + "' needs master ions the feed analysis does not carry"
                    " -- add the missing ionic components, or drop the mineral");

        // Industry calcite indices ride this same channel: when calcite is one
        // of the tracked minerals AND the feed carries Ca + HCO3, emit the
        // EMPIRICAL concentration-based LSI / Stiff-Davis / Ryznar at bulk + wall
        // for the contrast against the rigorous activity SI_calcite (see
        // thermo/electrolyte/ScalingIndices).  Absence-tolerant: no calcite or
        // no Ca/HCO3 -> no index columns (byte-identical to a pre-feature run).
        bool tracksCalcite = false;
        for (const auto& m : scaleMinerals) if (m == "calcite") tracksCalcite = true;
        if (tracksCalcite)
        {
            for (std::size_t s = 0; s < Ns; ++s)
            {
                const std::string nm = thermo.comp(soluteIdx[s]).name();
                if (nm == "Ca")   idxCa   = static_cast<int>(s);
                if (nm == "HCO3") idxHCO3 = static_cast<int>(s);
            }
            if (idxCa >= 0 && idxHCO3 >= 0)
            {
                bool hasCc = false;
                logK_calcite_T =
                    specSolver->mineralLogK_T("calcite", T_in, hasCc);
                doIndices = hasCc;
                if (doIndices && verbosity >= 1)
                    std::cout << "  [scaling] industry calcite indices ON "
                                 "(LSI / Stiff-Davis / Ryznar) -- EMPIRICAL, "
                                 "concentration-based:\n"
                                 "  [scaling] compare to the rigorous activity "
                                 "SI_calcite; they diverge at high I / at the "
                                 "wall (Stiff-Davis K is a chart fit, announced)\n";
            }
        }
    }

    // Permeate accumulator: total volumetric permeate Q_perm [m³/s] and
    // per-solute molar permeate flow F_s [kmol/s].
    scalar              Q_perm = 0.0;
    std::vector<scalar> F_perm_solute(Ns, 0.0);

    // ---- Profile bookkeeping ---------------------------------------------
    profile_ = UnitProfile{};
    profile_->xAxis = "z";
    auto& cols = profile_->columns;
    cols["J_w"] = {};
    cols["Q_b"] = {};
    cols["P_b"] = {};
    cols["k_film"] = {};
    for (std::size_t s = 0; s < Ns; ++s)
        cols["c_b_" + thermo.comp(soluteIdx[s]).name()] = {};
    std::vector<scalar> zGrid;
    zGrid.reserve(nNodes + 1);

    // Local film coefficient: from the selected model (computed from the
    // local crossflow velocity u = Q_b / A_channel) or the legacy constant.
    auto kFilmAt = [&](scalar Qlocal) -> scalar
    {
        if (!mtModel) return k_film_const;
        MassTransferContext c;
        c.d_h = d_h; c.D = D_solute; c.mu = mu_feed; c.rho = rho;
        c.u   = (A_channel > 0.0) ? Qlocal / A_channel : 0.0;
        return mtModel->kFilm(c);
    };

    // Local axial pressure gradient dP/dz [Pa/m]: from the selected model
    // (computed from the local velocity) or the legacy linear dP_feed_total/L.
    auto dPdzAt = [&](scalar Qlocal) -> scalar
    {
        if (!pdModel) return (L > 0.0) ? dP_drop / L : 0.0;
        PressureDropContext c;
        c.d_h = d_h; c.mu = mu_feed; c.rho = rho; c.L = L;
        c.u   = (A_channel > 0.0) ? Qlocal / A_channel : 0.0;
        return pdModel->dPdz(c);
    };

    // ---- Forward Euler march (RK4 over Jw is overkill; the local Newton
    //   is the load-bearing nonlinearity).  For a smoother profile we
    //   could RK4 here, but the bulk fields change slowly compared to
    //   the inner Jw–c_m–c_p problem.
    if (verbosity >= 3)
    {
        std::cout << "\nSpiral-wound march (n = " << nNodes
                  << " nodes, dz = " << dz << " m):\n"
                  << "   node   z[m]   J_w[m/s]   Q_b[m³/s]   P_b[bar]";
        for (std::size_t s = 0; s < Ns; ++s)
            std::cout << "   c_b(" << thermo.comp(soluteIdx[s]).name() << ")";
        std::cout << "\n";
    }

    auto recordNode = [&](int k, scalar z, scalar Jw)
    {
        zGrid.push_back(z);
        cols["J_w"].push_back(Jw);
        cols["Q_b"].push_back(Q_b);
        cols["P_b"].push_back(P_b);
        cols["k_film"].push_back(kFilmAt(Q_b));
        for (std::size_t s = 0; s < Ns; ++s)
            cols["c_b_" + thermo.comp(soluteIdx[s]).name()].push_back(c_b[s]);

        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(5) << k
                      << "  " << std::fixed << std::setprecision(3) << z
                      << "  " << std::scientific << std::setprecision(4) << Jw
                      << "  " << std::scientific << std::setprecision(4) << Q_b
                      << "  " << std::fixed << std::setprecision(3) << (P_b * 1.0e-5);
            for (std::size_t s = 0; s < Ns; ++s)
                std::cout << "  " << std::scientific << std::setprecision(4) << c_b[s];
            std::cout << "\n";
        }
    };

    // Initial node
    auto makeCtx = [&](scalar k_film_local) -> membrane::TransportContext
    {
        return membrane::TransportContext{ thermo, soluteIdx, B_s, mem.A_w(),
                                 k_film_local, P_b, P_perm, T_in, c_b,
                                 *osmModel, &mem, specSolver.get() };
    };
    auto sol = transportModel->localFluxes(makeCtx(kFilmAt(Q_b)));
    recordNode(0, 0.0, sol.J_w);

    const scalar Q_feed = Q_b;          // for per-element recovery
    int   globalNode = 0;
    bool  dry = false;
    std::vector<scalar> elemRecovery, elemRetConc;   // per-element diagnostics
    // ---- March element by element (a train is a continuous channel) ------
    for (int e = 0; e < nElements && !dry; ++e)
    {
        const scalar z0 = e * L;        // axial offset of this element
        // A continuous nModules (nominal spec, optimisation mode) marches its
        // fractional remainder as a shorter LAST element; legacy: always 1.
        const scalar elemFrac = (e == nElements - 1) ? lastFrac : 1.0;
        const scalar dz_e = (L * elemFrac) / nNodes;
        for (int k = 0; k < nNodes; ++k)
        {
            // Local fluxes at the start of the cell (forward Euler for the
            // mass / volume balances --- the cell width is small relative
            // to the variation, the inner Newton is exact in J_w).
            const scalar J_w = sol.J_w;
            const std::vector<scalar>& Js = sol.J_s;

            // Mass balances over the slice of width W·dz:
            //   dQ_b/dz = -W · J_w
            //   dc_b,s/dz = (J_w · c_b,s − J_s,s) · W / Q_b
            const scalar dQ = -W * J_w * dz_e;
            std::vector<scalar> dcs(Ns, 0.0);
            for (std::size_t s = 0; s < Ns; ++s)
                dcs[s] = ((J_w * c_b[s] - Js[s]) * W / std::max(Q_b, 1e-30)) * dz_e;

            // Permeate accumulation over this slice
            Q_perm += W * J_w * dz_e;                         // m³/s
            for (std::size_t s = 0; s < Ns; ++s)
                F_perm_solute[s] += W * Js[s] * dz_e;        // kmol/s

            // Advance bulk state
            Q_b += dQ;
            for (std::size_t s = 0; s < Ns; ++s)
                c_b[s] = std::max<scalar>(c_b[s] + dcs[s], 0.0);
            P_b -= dPdzAt(Q_b) * dz_e;

            if (Q_b <= 0.0) { dry = true; break; }
            sol = transportModel->localFluxes(makeCtx(kFilmAt(Q_b)));
            recordNode(++globalNode, z0 + (k + 1) * dz_e, sol.J_w);
        }

        // Per-element diagnostics: cumulative recovery through element e+1,
        // and the retentate concentration leaving it (shows the buildup).
        elemRecovery.push_back((Q_feed > 0.0) ? Q_perm / Q_feed : 0.0);
        elemRetConc.push_back(Ns > 0 ? c_b[0] : 0.0);   // first solute [kmol/m³]

        // Scaling audit at this module's exit: speciate the local BULK
        // concentrate AND the WALL composition (c_m from the module's own
        // polarisation model) and record the SI of each requested mineral.
        // Diagnostic only -- never feeds back into the march.
        if (doScaling && !dry)
        {
            auto speciateAt = [&](const std::vector<scalar>& conc)
            {
                electrolyte::SpeciationInput in;
                in.solvePH = scalePHsolve;
                in.pH      = scalePH;
                in.T       = T_in;
                for (std::size_t s = 0; s < Ns; ++s)
                    if (conc[s] > 1.0e-30)
                        in.totals[thermo.comp(soluteIdx[s]).name()]
                            = conc[s] * 1.0e3 / rho;    // kmol/m3 -> mol/kg w
                return specSolver->solve(in, 0);        // advisories still log
            };
            const auto rb = speciateAt(c_b);            // bulk concentrate
            const auto rw = speciateAt(sol.c_m);        // membrane wall
            audRecovery.push_back(elemRecovery.back());
            audI.push_back(rb.I);
            audPH.push_back(rb.pH);
            for (const auto& m : scaleMinerals)
            {
                audSIbulk[m].push_back(rb.SI.at(m));
                audSIwall[m].push_back(rw.SI.at(m));
            }
            // Industry calcite indices on TOTAL (analytical) Ca + HCO3
            // concentrations [mol/L] (= kmol/m3) -- the empirical shortcut uses
            // analytical concentrations + the empirical I-shift, never the
            // speciated free-ion ACTIVITY the rigorous SI uses.  THAT is the
            // lesson, and the wall (high local I from polarisation) is where it
            // misleads most.
            if (doIndices)
            {
                const auto ixB = electrolyte::ScalingIndices::compute(
                    rb.pH, c_b[idxCa], c_b[idxHCO3], rb.I, T_in, logK_calcite_T);
                const auto ixW = electrolyte::ScalingIndices::compute(
                    rw.pH, sol.c_m[idxCa], sol.c_m[idxHCO3], rw.I, T_in,
                    logK_calcite_T);
                audLSIbulk.push_back(ixB.LSI);  audLSIwall.push_back(ixW.LSI);
                audSDbulk.push_back(ixB.stiffDavis);
                audSDwall.push_back(ixW.stiffDavis);
                audRSIbulk.push_back(ixB.RSI);  audRSIwall.push_back(ixW.RSI);
            }
        }

        // Inter-element connector pressure loss (not after the last element).
        if (e + 1 < nElements) P_b -= interDP;
    }
    profile_->columns["z"] = std::move(zGrid);

    // ---- Scaling audit: per-module profile + onset detection ---------------
    const int nAudited = static_cast<int>(audRecovery.size());
    std::map<std::string, int>    si0Module;     // first module with wall SI >= 0
    std::map<std::string, scalar> si0Recovery;   // cumulative recovery there
    std::map<std::string, scalar> maxSIwall;     // max wall SI along the vessel
    if (doScaling)
    {
        // The unit profile becomes the per-module scaling table (one profile
        // per unit -- this replaces the per-node z-profile, announced).
        UnitProfile p;
        p.xAxis = "module";
        auto& pc = p.columns;
        for (int e = 0; e < nAudited; ++e)
        {
            pc["module"].push_back(static_cast<scalar>(e + 1));
            pc["recovery_cum"].push_back(audRecovery[e]);
            pc["I_bulk"].push_back(audI[e]);
            pc["pH_bulk"].push_back(audPH[e]);
            for (const auto& m : scaleMinerals)
            {
                pc["SI_" + m + "_bulk"].push_back(audSIbulk[m][e]);
                pc["SI_" + m + "_wall"].push_back(audSIwall[m][e]);
            }
            if (doIndices)
            {
                pc["LSI_bulk"].push_back(audLSIbulk[e]);
                pc["LSI_wall"].push_back(audLSIwall[e]);
                pc["StiffDavis_bulk"].push_back(audSDbulk[e]);
                pc["StiffDavis_wall"].push_back(audSDwall[e]);
                pc["RSI_bulk"].push_back(audRSIbulk[e]);
                pc["RSI_wall"].push_back(audRSIwall[e]);
            }
        }
        profile_ = std::move(p);
        if (verbosity >= 2)
            std::cout << "  [scaling] unit profile = per-module scaling table"
                         " (replaces the per-node z-profile)\n";

        for (const auto& m : scaleMinerals)
        {
            int    cross = -1;
            scalar rAt   = -1.0, simax = -1.0e30;
            for (int e = 0; e < nAudited; ++e)
            {
                simax = std::max(simax, audSIwall[m][e]);
                if (cross < 0 && audSIwall[m][e] >= 0.0)
                {
                    cross = e + 1;
                    rAt   = audRecovery[e];
                }
            }
            si0Module[m]   = cross;
            si0Recovery[m] = rAt;
            maxSIwall[m]   = (nAudited > 0) ? simax : 0.0;
        }
    }

    // ---- Build outlet streams --------------------------------------------
    // Mass-consistent closure: `rho` is the solution mass density, so the
    // water molar concentration is whatever fills the volume the solutes do
    // NOT --- c_water = (rho − Σ c_s·MW_s) / MW_water --- and Σ c_i·MW_i = rho
    // by construction.  Both outlets then carry mass density rho, and since
    // volume is conserved along the march (Q_feed = Q_b + Q_perm) the masses
    // close to the feed EXACTLY (verified by the assertion below).  Pinning
    // c_water to the pure-water value rho/MW_water was the ~1 %-mass bug: it
    // added the solute mass on top of a full pure-water mass.
    out_.clear();
    scalar mass_ret = 0.0, mass_perm = 0.0;        // kg/s (for the closure check)
    {
        scalar mass_solute = 0.0;                  // Σ c_s·MW_s [kg/m³]
        for (std::size_t s = 0; s < Ns; ++s)
            mass_solute += c_b[s] * MW[soluteIdx[s]];
        const scalar c_water = (rho - mass_solute) / MW_water;  // kmol/m³
        scalar cTot = c_water;
        for (auto ci : c_b) cTot += ci;
        const scalar F_ret = cTot * Q_b;          // kmol/s SI
        mass_ret = rho * Q_b;                      // = (Σ c_i·MW_i)·Q_b
        ProcessStream ret;
        ret.name = "retentate";
        ret.F = F_ret;
        ret.T = T_in;
        ret.P = P_b;
        ret.vf = 0.0;
        ret.z.assign(Ncomp, 0.0);
        ret.z[iWater] = (cTot > 0) ? c_water / cTot : 1.0;
        for (std::size_t s = 0; s < Ns; ++s)
            ret.z[soluteIdx[s]] = (cTot > 0) ? c_b[s] / cTot : 0.0;
        out_.push_back(std::move(ret));
    }
    // Permeate: same mass-consistent closure.  Water carries the bulk
    // volumetric flux Q_perm; the solute permeate molar flows are
    // F_perm_solute (accumulated exactly along the march).
    {
        scalar mass_solute_p = 0.0;                // Σ (F_s/Q)·MW_s [kg/m³]
        for (std::size_t s = 0; s < Ns; ++s)
            mass_solute_p += (Q_perm > 0 ? F_perm_solute[s] / Q_perm : 0.0)
                           * MW[soluteIdx[s]];
        const scalar c_water_perm = (rho - mass_solute_p) / MW_water; // kmol/m³
        scalar cTot_p = c_water_perm;
        for (std::size_t s = 0; s < Ns; ++s)
            cTot_p += (Q_perm > 0 ? F_perm_solute[s] / Q_perm : 0.0);
        const scalar F_perm_total = cTot_p * Q_perm;    // kmol/s SI
        mass_perm = rho * Q_perm;                  // = (Σ c_i·MW_i)·Q_perm
        ProcessStream perm;
        perm.name = "permeate";
        perm.F = F_perm_total;
        perm.T = T_in;
        perm.P = P_perm;
        perm.vf = 0.0;
        perm.z.assign(Ncomp, 0.0);
        perm.z[iWater] = (cTot_p > 0) ? c_water_perm / cTot_p : 1.0;
        for (std::size_t s = 0; s < Ns; ++s)
        {
            const scalar c_s_perm = (Q_perm > 0) ? F_perm_solute[s] / Q_perm : 0.0;
            perm.z[soluteIdx[s]] = (cTot_p > 0) ? c_s_perm / cTot_p : 0.0;
        }
        out_.push_back(std::move(perm));
    }

    // ---- Overall mass-closure guard (CREDO: balances close) ---------------
    // feed mass = retentate mass + permeate mass, to machine precision.  This
    // is the module's own first law of mass and must never silently regress
    // (the +1 % "mass created" QA bug).  When the channel ran dry the march
    // stops mid-vessel, so the equality is only asserted on a completed run.
    // The relative residual is surfaced as a KPI below (after kpis_.clear()).
    scalar mass_closure_rel = 0.0;
    if (!dry)
    {
        const scalar mass_feed = rho * bulk0.Q;    // kg/s
        const scalar mass_out  = mass_ret + mass_perm;
        mass_closure_rel = (mass_feed > 0.0)
                         ? std::abs(mass_out - mass_feed) / mass_feed : 0.0;
        if (mass_closure_rel > 1.0e-9)
        {
            char b[200];
            std::snprintf(b, sizeof(b),
                "spiralWoundModule mass balance does not close: feed %.9g kg/s "
                "vs retentate+permeate %.9g kg/s (rel = %.3e)",
                static_cast<double>(mass_feed), static_cast<double>(mass_out),
                static_cast<double>(mass_closure_rel));
            throw std::runtime_error(b);
        }
    }

    // ---- KPIs -------------------------------------------------------------
    kpis_.clear();
    const scalar feed_vol = bulk0.Q;                       // m³/s
    const scalar recovery = (feed_vol > 0) ? Q_perm / feed_vol : 0.0;
    const scalar A_total  = nModulesReal * A_membrane;     // whole train
                            // (legacy: nModulesReal == nElements, identical)
    kpis_["water_recovery"] = recovery;
    kpis_["J_w_avg"]        = (A_total > 0) ? Q_perm / A_total : 0.0;  // m/s
    kpis_["dP_feed"]        = P_in - P_b;
    // Mass-closure residual |feed − (ret+perm)| / feed (the guard above also
    // throws if it ever exceeds 1e-9): a permanent, visible witness that the
    // module conserves mass.
    if (!dry) kpis_["mass_closure_rel"] = mass_closure_rel;
    // Scaling-audit KPIs: max wall SI per mineral, the module where the wall
    // first crosses SI = 0 (-1 = never) and the cumulative recovery there.
    if (doScaling)
        for (const auto& m : scaleMinerals)
        {
            kpis_["maxSI_" + m + "_wall"]  = maxSIwall[m];
            kpis_["SI0_module_" + m]       = static_cast<scalar>(si0Module[m]);
            kpis_["SI0_recovery_" + m]     = si0Recovery[m];
        }
    // Industry-index KPIs: the wall value at the LAST module (deepest into the
    // concentrate, highest local I -- where the empirical indices mislead most)
    // and the max wall LSI along the vessel.  These ride beside maxSI_calcite_wall
    // so the divergence (index minus rigorous SI) reads straight off the KPIs.
    if (doIndices && !audLSIwall.empty())
    {
        scalar maxLSIw = -1.0e30;
        for (auto v : audLSIwall) maxLSIw = std::max(maxLSIw, v);
        kpis_["maxLSI_calcite_wall"]        = maxLSIw;
        kpis_["LSI_calcite_wall_end"]       = audLSIwall.back();
        kpis_["LSI_calcite_bulk_end"]       = audLSIbulk.back();
        kpis_["StiffDavis_calcite_wall_end"]= audSDwall.back();
        kpis_["RSI_calcite_wall_end"]       = audRSIwall.back();
    }
    // Per-element diagnostics (a train of >1 element: see the degradation).
    if (nElements > 1)
    {
        kpis_["elements"] = static_cast<scalar>(nElements);
        for (std::size_t e = 0; e < elemRecovery.size(); ++e)
        {
            const std::string ee = std::to_string(e + 1);
            kpis_["recovery_elem" + ee] = elemRecovery[e];
            kpis_["c_ret_elem"   + ee] = elemRetConc[e];
        }
    }
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const std::string nm = thermo.comp(soluteIdx[s]).name();
        const scalar c_feed  = bulk0.c[soluteIdx[s]];
        const scalar c_perm  = (Q_perm > 0) ? F_perm_solute[s] / Q_perm : 0.0;
        const scalar R_obs   = (c_feed > 0) ? 1.0 - c_perm / c_feed : 1.0;
        kpis_["R_obs_" + nm] = R_obs;
    }

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Spiral-wound result  ===\n"
                  << "  Membrane:        " << membraneName << "  (" << mem.kind() << ")\n";
        if (nominalSpec)
        {
            char b[200];
            std::snprintf(b, sizeof(b),
                "  Modules:         %g x %g m2 (%gin/40in standard element) = %g m2\n",
                static_cast<double>(nModulesReal),
                static_cast<double>(A_membrane),
                static_cast<double>(diam_in),
                static_cast<double>(nModulesReal * A_membrane));
            std::cout << b;
        }
        else
            std::cout << "  Area:            " << A_membrane << " m²\n";
        std::cout << "  Water recovery:  " << std::fixed << std::setprecision(3)
                  << 100.0 * recovery << " %\n"
                  << "  Average flux:    " << std::scientific << std::setprecision(3)
                  << kpis_["J_w_avg"] << " m/s   ("
                  << std::fixed << std::setprecision(2)
                  << kpis_["J_w_avg"] * 3600.0 * 1000.0 << " LMH)\n"
                  << "  Feed ΔP:         " << std::fixed << std::setprecision(2)
                  << (kpis_["dP_feed"] * 1.0e-5) << " bar\n";
        for (std::size_t s = 0; s < Ns; ++s)
        {
            const std::string nm = thermo.comp(soluteIdx[s]).name();
            std::cout << "  R_obs(" << nm << "):"
                      << std::string(std::max<int>(0, 10 - (int)nm.size()), ' ')
                      << std::fixed << std::setprecision(3)
                      << 100.0 * kpis_["R_obs_" + nm] << " %\n";
        }
        if (doScaling)
        {
            // Per-module SI table (the glass-box view of the audit).
            std::cout << "  --- scaling audit (wall = membrane-wall composition) ---\n"
                      << "   module    r_cum     I_bulk    pH_bulk";
            for (const auto& m : scaleMinerals)
                std::cout << "   SI_" << m << "(blk|wall)";
            if (doIndices) std::cout << "   LSI(blk|wall)";
            std::cout << "\n";
            for (int e = 0; e < nAudited; ++e)
            {
                char b[64];
                std::snprintf(b, sizeof(b), "   %6d   %6.3f   %8.5f   %7.3f",
                    e + 1, static_cast<double>(audRecovery[e]),
                    static_cast<double>(audI[e]), static_cast<double>(audPH[e]));
                std::cout << b;
                for (const auto& m : scaleMinerals)
                {
                    std::snprintf(b, sizeof(b), "   %+7.3f | %+7.3f",
                        static_cast<double>(audSIbulk[m][e]),
                        static_cast<double>(audSIwall[m][e]));
                    std::cout << b;
                }
                if (doIndices)
                {
                    std::snprintf(b, sizeof(b), "   %+7.3f | %+7.3f",
                        static_cast<double>(audLSIbulk[e]),
                        static_cast<double>(audLSIwall[e]));
                    std::cout << b;
                }
                std::cout << "\n";
            }
            if (doIndices)
            {
                // Spell out the lesson where it bites: at the LAST module (deepest
                // concentrate, highest local I) print the empirical LSI against the
                // rigorous activity SI_calcite, both at the WALL.
                const int e = nAudited - 1;
                char b[300];
                std::snprintf(b, sizeof(b),
                    "  Indices (calcite, EMPIRICAL conc-based vs RIGOROUS activity"
                    " SI, WALL @ last module):\n"
                    "    LSI = %+.3f  Stiff-Davis = %+.3f  RSI = %.2f   |"
                    "  rigorous SI_calcite = %+.3f   (gap LSI-SI = %+.3f)\n",
                    static_cast<double>(audLSIwall[e]),
                    static_cast<double>(audSDwall[e]),
                    static_cast<double>(audRSIwall[e]),
                    static_cast<double>(audSIwall["calcite"][e]),
                    static_cast<double>(audLSIwall[e] - audSIwall["calcite"][e]));
                std::cout << b;
            }
            // Onset announcement: where each mineral first reaches SI = 0
            // at the WALL (the scaling driver polarization exposes).
            for (const auto& m : scaleMinerals)
            {
                char b[240];
                if (si0Module[m] > 0)
                    std::snprintf(b, sizeof(b),
                        "  Scaling:         %s reaches SI=0 at module %d of %g"
                        " (wall, r_cum=%.2f)\n",
                        m.c_str(), si0Module[m],
                        static_cast<double>(nModulesReal),
                        static_cast<double>(si0Recovery[m]));
                else
                    std::snprintf(b, sizeof(b),
                        "  Scaling:         %s stays below SI=0 along the"
                        " vessel (max wall SI = %+.2f)\n",
                        m.c_str(), static_cast<double>(maxSIwall[m]));
                std::cout << b;
            }
        }
        std::cout << "==================================================\n\n";
    }

    return 0;
}

} // namespace Choupo
