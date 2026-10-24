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
#include "BulkConversion.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Units.H"
#include "massTransfer/MassTransferModel.H"
#include "massTransfer/Polarisation.H"
#include "osmotic/OsmoticModel.H"
#include "pressureDrop/PressureDropModel.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/electrolyte/ScalingIndices.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "thermo/membrane/FeedSpacer.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/membrane/MembraneModule.H"
#include "thermo/membrane/MembraneModuleRegistry.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "transport/TransportModel.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <cstdio>
#include <iostream>
#include <map>
#include <sstream>
#include <memory>
#include <stdexcept>
#include <variant>

namespace Choupo {

namespace {

// Convert composition (mole fractions z) + total molar flow F [kmol/s] +
//  toBulk / BulkState moved to membrane/BulkConversion.H when the batch
//  diafilter became its second caller -- same arithmetic, same closure,
//  one home.  See that header for the mass-density derivation.

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
    const std::string unitLabel = dict->name().empty() ? type() : dict->name();

    // ---- Module RECORD (2026-09-15): `module <name>;` names a commercial
    //      element or a laboratory cell in assets/ (kind membraneModule) and
    //      the record supplies what a case used to type -- the membrane (a
    //      spiral is wound with one; a flat cell takes any coupon, declared
    //      beside it), the active area, the channel geometry and the leaf
    //      length -- plus the manufacturer's limits, checked below.  ONE
    //      home: the same fact declared inline beside `module` REFUSES by
    //      name, every offending key listed.
    const bool hasModule = opDict->found("module");
    const MembraneModule* modRec = nullptr;
    if (hasModule)
    {
        modRec = &MembraneModuleRegistry::byName(opDict->lookupWord("module"));
        std::vector<std::string> clash;
        for (const char* k : { "area", "length", "feedSpacer" })
            if (opDict->found(k)) clash.push_back(k);
        for (const char* blk : { "massTransfer", "pressureDrop" })
            if (opDict->found(blk))
            {
                auto b = opDict->subDict(blk);
                for (const char* k : { "channelHeight", "spacerPorosity" })
                    if (b->found(k)) clash.push_back(std::string(blk) + "." + k);
            }
        //  An element record that NAMES its membrane owns it; a generic
        //  element or a flat cell takes the case's (C146).
        if (!modRec->membrane().empty() && opDict->found("membrane"))
            clash.push_back("membrane");
        if (!clash.empty())
        {
            std::string list;
            for (const auto& c : clash) list += " `" + c + "`";
            throw std::runtime_error("spiralWoundModule '" + unitLabel + "': `module "
                + modRec->name() + ";` supplies the geometry"
                + (modRec->isFlatSheetCell() ? "" : " and the membrane")
                + " from its record (" + modRec->sourcePath() + "), and the"
                  " operation ALSO declares" + list + " -- one home.  Remove"
                  " the inline value(s), or drop `module` and keep them.");
        }
        if (modRec->membrane().empty() && !opDict->found("membrane"))
            throw std::runtime_error("spiralWoundModule '" + unitLabel + "': `module "
                + modRec->name() + ";` is " + (modRec->isFlatSheetCell()
                  ? std::string("a flat-sheet cell, which takes ANY coupon")
                  : std::string("a generic element whose record names no"
                                " membrane"))
                + " -- declare the membrane beside it: `membrane <name>;`"
                  " (a record of kind RO | NF).");
        if (modRec->isFlatSheetCell() && opDict->found("elements"))
            throw std::runtime_error("spiralWoundModule '" + unitLabel + "': a"
                " flat-sheet cell is ONE coupon; `elements` is a spiral train's key.");
    }
    const std::string membraneName = (hasModule && !modRec->membrane().empty())
                                   ? modRec->membrane()
                                   : opDict->lookupWord("membrane");

    // ---- Module hardware spec ----------------------------------------------
    // TWO FORMS, never both:
    //   * `module <name>;` -- resolved ABOVE: the record supplies the area,
    //     the leaf length (and leaf count) and the channel, and `area` /
    //     `length` have already refused beside it;
    //   * `area` + `length` -- explicit per-element area (the legacy spec,
    //     numerically untouched).
    // Either way `elements` is the number of elements IN SERIES in one
    // pressure vessel and `vessels` the number of IDENTICAL vessels in
    // PARALLEL: one unit is one STAGE of an array (C146, 2026-10-24).
    //
    // THE NOMINAL-DIAMETER TABLE IS RETIRED (C146).  `moduleDiameter` +
    // `nModules` read a hand table of four areas (2.6 / 7.9 / 37.2 / 148.6 m2)
    // kept in this file -- a second home for what an element record says.
    // The four standard sizes are RECORDS now (data/standards/assets/
    // Generic-2540 | Generic-4040 | Generic-8040 | Generic-16040, kind
    // membraneModule, every value an announced estimate), so the keys refuse
    // and name them.  No dual reader.
    for (const char* retired : { "moduleDiameter", "nModules" })
        if (opDict->found(retired))
            throw std::runtime_error("spiralWoundModule '" + unitLabel + "': `"
                + std::string(retired) + "` is RETIRED (2026-10-24) -- the"
                  " nominal 40-inch sizes are element RECORDS now.  Write"
                  " `module Generic-2540 | Generic-4040 | Generic-8040 |"
                  " Generic-16040;` (data/standards/assets/, every value an"
                  " announced estimate) or a real element (`module"
                  " SW30HR-380;`), with `elements <n>;` for the elements in"
                  " series in one vessel (a REAL n is allowed: the fraction is"
                  " marched as a shorter last element) and `vessels <n>;` for"
                  " identical vessels in parallel.  The retired hand table's"
                  " areas were 2.6 / 7.9 / 37.2 / 148.6 m2; the records carry"
                  " the same.  For anything else give `area` + `length`.");

    scalar A_membrane   = 0.0;     // per element [m2]
    scalar L            = 0.0;     // per element: the marched leaf length [m]
    if (hasModule)
    {
        A_membrane = modRec->activeArea_m2();
        //  A spiral marches its LEAF length (the record's, an estimate where
        //  the sheet publishes only the element length); a flat cell's channel
        //  length is activeArea / slotWidth, DERIVED here and never stored.
        L = modRec->isFlatSheetCell()
          ? modRec->activeArea_m2() / modRec->slotWidth_m()
          : modRec->leafLength_m();
    }
    else
    {
        A_membrane   = opDict->lookupScalar("area",   Dims::area);
        L            = opDict->lookupScalar("length", Dims::length);
    }

    //  Elements in series in one vessel.  A REAL count is allowed (an
    //  optimisation driver varies it continuously -- optim04): the integer
    //  part is marched whole and the fraction as a shorter LAST element, and
    //  the run says so.
    const scalar nModulesReal = opDict->lookupScalarOrDefault("elements", 1.0);
    if (!(nModulesReal > 0.0))
        throw std::runtime_error("spiralWoundModule '" + unitLabel + "':"
            " `elements` must be > 0");
    int    nElements = 1;          // marched elements (ceil of nModulesReal)
    scalar lastFrac  = 1.0;        // fractional size of the LAST element
    {
        const scalar nFull = std::floor(nModulesReal + 1.0e-9);
        const scalar frac  = nModulesReal - nFull;
        if (frac > 1.0e-9) { nElements = static_cast<int>(nFull) + 1; lastFrac = frac; }
        else               { nElements = std::max(1, static_cast<int>(nFull)); }
    }

    //  Identical vessels in parallel.  They see the same feed state, so ONE
    //  vessel is solved on F / n and its outlets are scaled by n -- exact,
    //  not an approximation, and said so on every run that has more than one.
    const scalar vesselsReal = opDict->lookupScalarOrDefault("vessels", 1.0);
    if (!(vesselsReal >= 1.0) || std::abs(vesselsReal - std::round(vesselsReal)) > 1.0e-12)
        throw std::runtime_error("spiralWoundModule '" + unitLabel + "':"
            " `vessels` is a whole number of pressure vessels in parallel"
            " (>= 1) -- got " + std::to_string(vesselsReal));
    const int nVessels = static_cast<int>(std::round(vesselsReal));
    if (hasModule && modRec->isFlatSheetCell() && nVessels > 1)
        throw std::runtime_error("spiralWoundModule '" + unitLabel + "': a"
            " flat-sheet cell is ONE coupon; `vessels` is an array's key.");

    //  The channel has TWO membrane faces per leaf in a spiral (the leaf is
    //  an envelope, permeate carrier inside) and ONE in a flat cell (the
    //  coupon lies on the permeate carrier; the channel above it has a steel
    //  lid).  The module reads the format and says which it used.
    const bool   flatCell     = hasModule && modRec->isFlatSheetCell();
    const scalar facesPerLeaf = flatCell ? 1.0 : 2.0;

    if (verbosity >= 2)
    {
        char b[240];
        if (hasModule)
        {
            std::snprintf(b, sizeof(b),
                "  [spec] module '%s' (%s, %s): A %g m2, %s %g m\n",
                modRec->name().c_str(), modRec->format().c_str(),
                modRec->manufacturer().c_str(),
                static_cast<double>(A_membrane),
                flatCell ? "channel length = activeArea / slotWidth ="
                         : "leaf length",
                static_cast<double>(L));
            std::cout << b;
        }
        else
        {
            std::snprintf(b, sizeof(b),
                "  [spec] explicit area (legacy spec): %g m2 per element\n",
                static_cast<double>(A_membrane));
            std::cout << b;
        }
        if (lastFrac != 1.0)
        {
            std::snprintf(b, sizeof(b),
                "  [spec] elements %g (continuous -- optimisation mode: the"
                " last element is marched at %.4g of its length)\n",
                static_cast<double>(nModulesReal), static_cast<double>(lastFrac));
            std::cout << b;
        }
    }
    if (nVessels > 1)
    {
        std::ostringstream m;
        m << nVessels << " identical pressure vessels in PARALLEL, each "
          << nModulesReal << " element(s) in series: ONE vessel is solved on"
             " F/" << nVessels << " and its retentate and permeate are scaled"
             " by " << nVessels << " (identical vessels see the same feed"
             " state; a maldistribution between them is not modelled)";
        if (verbosity >= 1)
            std::cout << "  [array] " << m.str() << "\n";
        AdvisoryLog::instance().add("model", "info",
            "membrane stage '" + unitLabel + "'", m.str());
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
    bool muDeclared = false, DDeclared = false;
    auto readGeom = [&](const DictPtr& b)
    {
        h_ch    = b->lookupScalarOrDefault("channelHeight",  h_ch, Dims::length);
        eps     = b->lookupScalarOrDefault("spacerPorosity", eps);
        if (b->found("viscosity")) { mu_feed = b->lookupScalar("viscosity"); muDeclared = true; }
    };
    if (opDict->found("pressureDrop")) readGeom(opDict->subDict("pressureDrop"));
    if (opDict->found("massTransfer"))
    {
        auto mt = opDict->subDict("massTransfer");
        readGeom(mt);
        if (mt->found("diffusivity")) { D_solute = mt->lookupScalar("diffusivity"); DDeclared = true; }
    }
    //  THE FEED SPACER IS A RECORD (C146, 2026-10-24).  Named by the element
    //  record (`feedSpacer <name>;` in a kind membraneModule) or, with the
    //  explicit `area` + `length` spec, by the case beside them.  Its
    //  thickness IS the channel height (Schock & Miquel 1987, p. 341), its
    //  porosity is weighed or derived from the mesh (Eqs. 19-22) and its
    //  hydraulic diameter is Schock & Miquel's Eq. (17) -- one home each,
    //  so an inline channelHeight / spacerPorosity beside it REFUSES.
    const FeedSpacer* spacer = nullptr;
    {
        const std::string spacerName = hasModule
            ? modRec->feedSpacer()
            : opDict->lookupWordOrDefault("feedSpacer", "");
        if (!spacerName.empty())
        {
            spacer = &FeedSpacerRegistry::byName(spacerName);
            if (!hasModule)
                for (const char* blk : { "massTransfer", "pressureDrop" })
                    if (opDict->found(blk))
                    {
                        auto b = opDict->subDict(blk);
                        for (const char* k : { "channelHeight", "spacerPorosity" })
                            if (b->found(k))
                                throw std::runtime_error("spiralWoundModule '"
                                    + unitLabel + "': `feedSpacer " + spacerName
                                    + ";` supplies the channel, and `" + blk
                                    + "." + k + "` ALSO declares it -- one home."
                                      "  Remove the inline value or the spacer.");
                    }
        }
    }
    if (spacer)
    {
        h_ch = spacer->thickness_m();
        eps  = spacer->porosity();
    }
    else if (hasModule)
    {
        //  The record's inline channel (the case's inline keys were refused above).
        h_ch = modRec->channelHeight_m();
        eps  = modRec->spacerPorosity();
    }
    //  THE TWO LEGACY CONSTANTS ARE ANNOUNCED, NOT ASSUMED (2026-09-05).
    //  mu_feed = 1e-3 Pa.s and D_solute = 1.6e-9 m²/s were hard-coded here
    //  since the first membrane case -- water at 20 C and NaCl in water,
    //  roughly, applied to every feed including a 10 g/L glucose NF and a
    //  Pitzer brine.  The eleven membrane goldens were recorded on them, so
    //  the VALUES stay; what changes is that a run says so.  Precedence:
    //  a value declared in the sub-block wins (the case's own number); else
    //  a declared package transport model prices it from the feed state
    //  (announced with the model); else the legacy default, announced as
    //  such with the remedy.  No case in the corpus declares liquid
    //  transport, so the model route moves no golden -- checked.
    if (!muDeclared)
    {
        if (thermo.hasLiquidViscosity())
        {
            mu_feed = thermo.viscosityLiquid(T_in, z_in);
            AdvisoryLog::instance().add("model", "info",
                "membrane '" + (dict->name().empty() ? type() : dict->name()) + "'",
                "feed viscosity " + std::to_string(mu_feed) + " Pa.s priced"
                " from the case's declared liquidViscosity transport model"
                " at the feed T and composition (no `viscosity` in the"
                " massTransfer/pressureDrop sub-block)");
        }
        else
            AdvisoryLog::instance().add("model", "warning",
                "membrane '" + (dict->name().empty() ? type() : dict->name()) + "'",
                "[legacy] mu_feed 1e-3 Pa.s ASSUMED (water near 20 C) -- no"
                " `viscosity` in the massTransfer/pressureDrop sub-block and"
                " no liquidViscosity transport model declared; declare"
                " transport { liquid { viscosity { model ...; } } } to price"
                " it from the package, or set it in the sub-block");
    }
    //  D_solute is read by the film model for a NEUTRAL / lumped solute
    //  only: an ion's k_c,i is priced on the ion's own species-record D0
    //  (2026-09-15, membrane::Polarisation), and a constant k_film reads no
    //  D at all.  So the pricing happens here, but the ANNOUNCEMENT is
    //  deferred until the polarisation object knows whether any solute is
    //  neutral -- an announced default that nothing reads would be a
    //  sentence about a model that is not running (the 2026-08-04 banner
    //  trap).  `announceDsolute` is called once below, when it applies.
    std::string dSoluteAdvisory, dSoluteSeverity;
    if (!DDeclared && opDict->found("massTransfer"))
    {
        if (thermo.hasLiquidDiffusivity() && thermo.hasLiquidViscosity())
        {
            //  One solute diffusivity serves the film model; price it for the
            //  FIRST nonvolatile solute in water, and say which one.
            std::size_t iSol = Ncomp, iW = thermo.indexOf("water");
            for (std::size_t i = 0; i < Ncomp; ++i)
                if (thermo.comp(i).isNonvolatile() && z_in[i] > 0.0) { iSol = i; break; }
            if (iSol < Ncomp)
            {
                D_solute = thermo.diffusivityLiquid(T_in, iSol, iW);
                dSoluteSeverity = "info";
                dSoluteAdvisory =
                    "solute diffusivity " + std::to_string(D_solute) + " m2/s"
                    " priced for '" + thermo.comp(iSol).name() + "' in water"
                    " from the case's declared liquidDiffusivity transport"
                    " model at the feed T (no `diffusivity` in the"
                    " massTransfer sub-block)";
            }
        }
        else
        {
            dSoluteSeverity = "warning";
            dSoluteAdvisory =
                "[legacy] D_solute 1.6e-9 m2/s ASSUMED (NaCl in water, roughly)"
                " for the film model -- no `diffusivity` in the massTransfer"
                " sub-block and no liquidDiffusivity (+ liquidViscosity)"
                " transport model declared; declare transport { liquid {"
                " diffusivity { model WilkeChang; } viscosity { model ...; } } }"
                " to price it from the package, or set it in the sub-block";
        }
    }
    const scalar W_ch      = A_membrane / (facesPerLeaf * L);   // channel width: A/(2L) spiral, A/L flat cell
    const scalar A_channel = W_ch * h_ch * eps;
    //  The hydraulic diameter: the spacer's Eq. (17) value where a spacer
    //  record is named; otherwise the legacy 2 h eps, which is NOT Schock &
    //  Miquel's definition (their Eq. 17 needs the filament's wetted surface;
    //  2 h eps is neither it nor their empty-channel Eq. 10, 2h).  The legacy
    //  value is kept so no golden moves, and is ANNOUNCED below wherever a
    //  correlation reads it.
    const scalar d_h       = spacer ? spacer->hydraulicDiameter_m()
                                    : 2.0 * h_ch * eps;
    //  The leaves: W_leaf = A / (2 n L), DERIVED (the record stores A, n, L).
    const int    nLeaves   = (hasModule && !flatCell) ? modRec->leaves() : 0;
    const scalar W_leaf    = nLeaves > 0 ? W_ch / nLeaves : 0.0;

    // k_film model (concentration polarisation).
    std::unique_ptr<MassTransferModel> mtModel;
    scalar k_film_const = 0.0;
    if (opDict->found("massTransfer"))
    {
        auto mt = opDict->subDict("massTransfer");
        //  NO DEFAULT HERE, DELIBERATELY.  This slot used to default to
        //  "constant", which the factory has been unable to build since the
        //  constant film model was pruned (2026-08-23) as a duplicate of the
        //  bare `k_film` scalar --- so a block that simply forgot its `model`
        //  key died naming a model the ENGINE had invented, and no document
        //  could have warned the reader against a name only the engine used.
        //  A default must never name what the factory cannot build; where
        //  there is no honest default, refuse and name both routes.
        if (!mt->found("model"))
        {
            std::string avail;
            for (const auto& k : MassTransferModel::availableTypes())
                avail += " " + k;
            throw std::runtime_error(
                "SpiralWoundModule: the `massTransfer {}` block declares no"
                " `model` --- there is no default film model.\n"
                "  Registered:" + (avail.empty() ? std::string(" (none)") : avail)
                + "\n  For a FIXED coefficient declare no massTransfer block at"
                  " all and give `k_film <value>;` in operation instead.");
        }
        mtModel = MassTransferModel::New(mt->lookupWord("model"));
        //  A spacer that CARRIES the correlation supplies its coefficients:
        //  the case selects the model by name, the record holds the numbers.
        if (spacer && spacer->massTransfer().declared)
        {
            const auto& sc = spacer->massTransfer();
            if (mt->lookupWord("model") != sc.model)
                throw std::runtime_error("spiralWoundModule '" + unitLabel
                    + "': massTransfer model '" + mt->lookupWord("model")
                    + "' is not the correlation the feed spacer '"
                    + spacer->name() + "' carries ('" + sc.model + "', "
                    + spacer->sourcePath() + ").  Name '" + sc.model
                    + "', or fix k_film and declare no massTransfer block.");
            for (const char* k : { "a", "b", "c" })
                if (mt->found(k))
                    throw std::runtime_error("spiralWoundModule '" + unitLabel
                        + "': massTransfer `" + std::string(k) + "` beside the"
                          " feed spacer '" + spacer->name() + "', which carries"
                          " the coefficients of its own correlation -- one home.");
            mtModel->readParameters(sc.dict);
        }
        else
            mtModel->readParameters(mt);
    }
    else
        k_film_const = opDict->lookupScalar("k_film", Dims::massTransferCoeff);

    // Pressure-drop model (axial friction).
    std::unique_ptr<PressureDropModel> pdModel;
    if (opDict->found("pressureDrop"))
    {
        auto pd = opDict->subDict("pressureDrop");
        const std::string pdWord = pd->lookupWordOrDefault("model", "SchockMiquel");
        pdModel = PressureDropModel::New(pdWord);
        if (spacer && spacer->pressureDrop().declared)
        {
            const auto& sc = spacer->pressureDrop();
            if (pdWord != sc.model)
                throw std::runtime_error("spiralWoundModule '" + unitLabel
                    + "': pressureDrop model '" + pdWord + "' is not the"
                      " correlation the feed spacer '" + spacer->name()
                    + "' carries ('" + sc.model + "', " + spacer->sourcePath()
                    + ").  Name '" + sc.model + "', or give `dP_feed_total` and"
                      " declare no pressureDrop block.");
            for (const char* k : { "a", "b" })
                if (pd->found(k))
                    throw std::runtime_error("spiralWoundModule '" + unitLabel
                        + "': pressureDrop `" + std::string(k) + "` beside the"
                          " feed spacer '" + spacer->name() + "', which carries"
                          " the coefficients of its own correlation -- one home.");
            pdModel->readParameters(sc.dict);
        }
        else
            pdModel->readParameters(pd);
    }

    //  WHAT THE CHANNEL IS, said once.  A spacer record: its geometry and the
    //  derivations (Schock & Miquel Eqs. 17, 20-23) and every estimate it
    //  carries.  The legacy inline channel: that its 2 h eps is not Eq. 17 --
    //  said only where a correlation actually reads d_h.
    if (spacer)
    {
        if (verbosity >= 2)
        {
            char b[420];
            if (spacer->hasFilament())
                std::snprintf(b, sizeof(b),
                    "  [spacer] '%s': h = %.4g mm, d_F = %.4g mm%s -> porosity"
                    " %.4f (%s), S_v,sp = 4/d_F = %.4g 1/mm (Eq. 23), d_h ="
                    " 4 eps/(2/h + (1-eps) S_v,sp) = %.4g mm (Schock & Miquel"
                    " Eq. 17)\n",
                    spacer->name().c_str(),
                    static_cast<double>(spacer->thickness_m() * 1e3),
                    static_cast<double>(spacer->filamentDiameter_m() * 1e3),
                    spacer->hasMesh()
                      ? (", l_M = " + std::to_string(spacer->meshLength_m() * 1e3)
                         + " mm").c_str() : "",
                    static_cast<double>(spacer->porosity()),
                    spacer->porosityDerived() ? "Eqs. 20-22, from the mesh"
                                              : "declared",
                    static_cast<double>(spacer->specificSurface() * 1e-3),
                    static_cast<double>(d_h * 1e3));
            else
                std::snprintf(b, sizeof(b),
                    "  [spacer] '%s': h = %.4g mm, porosity %.4f, d_h = %.4g mm"
                    " (published, no filament geometry)\n",
                    spacer->name().c_str(),
                    static_cast<double>(spacer->thickness_m() * 1e3),
                    static_cast<double>(spacer->porosity()),
                    static_cast<double>(d_h * 1e3));
            std::cout << b;
        }
        for (const auto& e : spacer->estimates())
        {
            char v[64];
            std::snprintf(v, sizeof(v), "%.6g", static_cast<double>(e.value));
            const std::string msg = "`" + e.key + "` = " + v + " (SI) is an"
                " ESTIMATE, reviewStatus " + e.reviewStatus + " -- " + e.notes;
            if (verbosity >= 1)
                std::cout << "  [estimate] spacer '" << spacer->name() << "': "
                          << msg << "\n";
            AdvisoryLog::instance().add("provenance", "warning",
                "spacer '" + spacer->name() + "'", msg);
        }
    }
    else if (mtModel || pdModel)
    {
        char b[400];
        std::snprintf(b, sizeof(b),
            "d_h = 2 h eps = %.4g mm from the inline channel (h %.4g mm, eps"
            " %.3g): NOT Schock & Miquel's hydraulic diameter (Desalination 64"
            " (1987) 339, Eq. 17, which needs the spacer filament's wetted"
            " surface); name a feed spacer record (`feedSpacer <name>;`, kind"
            " feedSpacer) to use Eq. 17",
            static_cast<double>(d_h * 1e3), static_cast<double>(h_ch * 1e3),
            static_cast<double>(eps));
        if (verbosity >= 2)
            std::cout << "  [spacer] " << b << "\n";
        AdvisoryLog::instance().add("approximation", "info",
            "membrane '" + unitLabel + "'", b);
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
    //  A law that declares its own parameters reads them from
    //  `transportParameters {}` -- the convention batchDiafilter already
    //  had, so one declaration serves both binaries (gelPolarisation's
    //  `gel {}` lives there).  Absent, nothing is read and every law that
    //  predates it is untouched.
    if (opDict->found("transportParameters"))
        transportModel->readParameters(opDict->subDict("transportParameters"));
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
    if (hasModule)
    {
        //  THE CHANNEL THE RECORD GAVE, and which face count was used -- said
        //  once, because a student comparing a cell with an element must see
        //  that W = A/L on one and A/(2L) on the other.
        if (verbosity >= 2)
        {
            char b[300];
            std::snprintf(b, sizeof(b),
                "  [spec] module '%s': channel W = A/(%g L) = %.4g m (%s),"
                " h = %.4g mm, spacer porosity %.3g, d_h = %.4g mm\n",
                modRec->name().c_str(), static_cast<double>(facesPerLeaf),
                static_cast<double>(W_ch),
                flatCell ? "one membrane face: the coupon on its carrier"
                         : "two membrane faces per leaf",
                static_cast<double>(h_ch * 1.0e3), static_cast<double>(eps),
                static_cast<double>(d_h * 1.0e3));
            std::cout << b;
        }
        //  EVERY ESTIMATE THE RECORD CARRIES IS ANNOUNCED ON EVERY RUN THAT
        //  READS IT (Vitor's ruling, 2026-09-15: an educated value with a note
        //  saying it must be verified, never silent).  The [estimate] tag and
        //  the AdvisoryLog channel are Database.cpp's -- one vocabulary; a
        //  record with no estimate produces no line.
        for (const auto& e : modRec->estimates())
        {
            char v[64];
            std::snprintf(v, sizeof(v), "%.6g", static_cast<double>(e.value));
            const std::string msg = "`" + e.key + "` = " + v + " (SI) is an"
                " ESTIMATE, reviewStatus " + e.reviewStatus + " -- " + e.notes;
            if (verbosity >= 1)
                std::cout << "  [estimate] module '" << modRec->name() << "': "
                          << msg << "\n";
            AdvisoryLog::instance().add("provenance", "warning",
                "module '" + modRec->name() + "'", msg);
        }
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
        if (Bi == 0.0 && verbosity >= 1 && transportModel->readsMembranePermeabilities())
            std::cout << "  WARNING  membrane '" << membraneName
                      << "' has no B_s entry for solute '" << nm
                      << "' --- assuming perfect rejection (B_s = 0)\n";
    }
    const std::size_t Ns = soluteIdx.size();

    //  AN ION-DECLARED FEED UNDER THE UNCOUPLED LAW IS SAID SO, WHATEVER ELSE
    //  THE CASE DECLARES.  This sentence used to live inside the scaling{}
    //  audit, so an ionic case with no audit block ran silent -- an
    //  announcement inside a conditional that is not the condition of the
    //  fact (the 2026-09-07 shape).  The fact is the LAW and the FEED: per-ion
    //  solution-diffusion couples nothing, so the permeate carries whatever
    //  net charge the per-ion permeances happen to produce (measured on
    //  membrane07: -0.82 % of the cation equivalents).  `transport SDEM;`
    //  couples the ions by the zero-current field with the SAME permeances.
    {
        std::size_t nIonic = 0;
        for (std::size_t s = 0; s < Ns; ++s)
            if (thermo.comp(soluteIdx[s]).hasAqueousMapping()) ++nIonic;
        if (nIonic >= 2 && transportModel->type() == "solutionDiffusion")
        {
            const std::string msg =
                "per-ion solution-diffusion without charge coupling: "
                + std::to_string(nIonic) + " ionic solute(s) each with its own"
                " B_s and nothing enforcing permeate electroneutrality;"
                " declare `transport SDEM;` to couple them by the zero-current"
                " field (same permeances, no new parameter)";
            if (verbosity >= 1)
                std::cout << "  [transport] " << msg << "\n";
            AdvisoryLog::instance().add("approximation", "warning",
                "membrane '" + membraneName + "'", msg);
        }
    }

    // ---- The wall: ONE home ------------------------------------------------
    //  Built once per run from the `polarisation {}` policy, each solute's
    //  charge (through its declared bridge) and diffusivity (an ion's own
    //  D0 when a correlation or the coupling needs it, else D_solute), and
    //  the k supplier (the correlation per solute, or the constant).  Every
    //  transport law asks this object for c_m; none computes a film of its
    //  own.  Defaults that are used are announced inside the builder.
    const membrane::Polarisation polar = membrane::buildPolarisation(
        opDict, thermo, soluteIdx, mtModel.get(), k_film_const, D_solute, T_in,
        "membrane '" + membraneName + "'", verbosity);
    const bool perSoluteK = polar.perSoluteK();
    if (!dSoluteAdvisory.empty() && polar.nIons() < polar.solutes().size())
        AdvisoryLog::instance().add("model", dSoluteSeverity,
            "membrane '" + (dict->name().empty() ? type() : dict->name()) + "'",
            dSoluteAdvisory);

    // ---- Discretise the channel length -----------------------------------
    // Effective width W chosen such that  W · L = A_membrane.
    const scalar W  = A_membrane / L;
    const scalar dz = L / nNodes;

    // Initial bulk state from the inlet stream.
    //  ONE VESSEL of the stage: the feed is split evenly over the identical
    //  vessels in parallel, and the outlets are scaled back by nVessels below.
    auto bulk0 = membrane::toBulk(F_in / nVessels, z_in, MW, rho, Ncomp);
    // Pack into per-solute bulk concentrations (the local solver only
    // needs the solute c values).
    std::vector<scalar> c_b(Ns, 0.0);
    for (std::size_t s = 0; s < Ns; ++s) c_b[s] = bulk0.c[soluteIdx[s]];
    scalar Q_b = bulk0.Q;
    //  The bulk SOLUTE FLOWS [kmol/s] are the marched state; c_b is derived
    //  from them (c_b = N_b / Q_b).  Marching c_b itself does not conserve
    //  the product Q_b c_b: it leaks O(dz^2) per cell, O(dz) over the module,
    //  and because the water is closed by mass the leak turned solute into
    //  water at constant mass -- 0.064 % of the glucose on membrane02, found
    //  2026-09-29 by the engine's own element balance.
    std::vector<scalar> N_b(Ns, 0.0);
    for (std::size_t s = 0; s < Ns; ++s) N_b[s] = Q_b * c_b[s];
    const std::vector<scalar> N_feed = N_b;
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
    const electrolyte::SpeciationSolver* specSolver = nullptr;
    std::vector<SpeciesId> masterOfSolute;   // the declared bridge, per solute
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

        // WHICH SOLIDS EXIST IS THE SYSTEM'S; WHAT TO DO ABOUT THEM IS THE
        // UNIT'S.  The admitted solid phases are declared once, in
        // constant/chemistryDict (`equilibria { solidPhases ( … ); }`) -- the
        // ratified one home for "which equilibria/phases belong to this
        // system".  This unit's `reportMinerals` is POLICY: which of the
        // admitted phases to track here.  Omit it and every admitted phase is
        // tracked; name one that the system does not admit and it is refused,
        // because a unit may not smuggle chemistry past the declaration.
        const auto& admitted = thermo.aqueousChemistry().solidPhases;
        if (admitted.empty())
            throw std::runtime_error("spiralWoundModule scaling refused: no"
                " solid phases are admitted by this case.  Declare them in"
                " constant/chemistryDict:\n"
                "    recordType chemistrySystem;\n"
                "    equilibria { solidPhases ( calcite gypsum ); }\n"
                "The unit then decides only WHICH of them to report.");

        if (sc->found("minerals"))
            throw std::runtime_error("spiralWoundModule scaling: `minerals` is"
                " no longer a unit key -- which solid phases EXIST belongs to"
                " the case, in constant/chemistryDict:\n"
                "    equilibria { solidPhases ( calcite gypsum ); }\n"
                "Use `reportMinerals ( … );` here to track a subset of them.");

        scaleMinerals = sc->found("reportMinerals")
                      ? sc->lookupWordList("reportMinerals") : admitted;

        for (const auto& m : scaleMinerals)
            if (std::find(admitted.begin(), admitted.end(), m) == admitted.end())
            {
                std::string list;
                for (const auto& a : admitted) list += " " + a;
                throw std::runtime_error("spiralWoundModule scaling: mineral '"
                    + m + "' is not part of the declared aqueous chemistry."
                      "  Admitted by constant/chemistryDict:" + list
                    + ".  A unit reports the system's phases; it never adds"
                      " one.");
            }

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
            if (!electrolyte::findAqueousSpecies(nm))
                throw std::runtime_error("spiralWoundModule scaling{}: "
                    "component '" + nm + "' has no row in ions.dat -- the "
                    "scaling audit needs an ionic water analysis: components "
                    "Ca, HCO3, ... (master ions of the electrolyte catalogue) "
                    "+ water, and the catalogue in constant/electrolyte/.");
        }

        if (verbosity >= 1)
            std::cout << "  [scaling] molalities from kmol/m3 at rho = " << rho
                      << " kg/m3 (dilute aqueous closure)\n";

        // THE AQUEOUS ACTIVITY MODEL IS THE CASE'S, NOT THIS UNIT'S.  A unit op
        // never chooses thermodynamics: it reads what the case declared in
        // `equilibrium { aqueous { activityModel { model …; } } }`.  The old
        // `activityModel` key here, defaulting to Davies, was a hidden default
        // -- it existed only because the grammar had no slot for a liquid-only
        // electrolyte declaration.  The slot exists now, so the default goes:
        // an undeclared case is REFUSED, naming the block it must add.
        if (sc->found("activityModel"))
            throw std::runtime_error(
                "spiralWoundModule scaling: `activityModel` is no longer a unit"
                " key -- the aqueous activity model belongs to the case, in"
                " constant/thermoPhysPropDict:\n"
                "    equilibrium { aqueous { activityModel { model davies; } } }\n"
                "A unit op reads the declared chemistry; it never selects one.");

        const auto& aqChem = thermo.aqueousChemistry();
        if (!aqChem.declared || aqChem.activityModel.empty())
            throw std::runtime_error(
                "spiralWoundModule scaling refused: this case speciates its"
                " brine but declares no aqueous chemistry.  Add to"
                " constant/thermoPhysPropDict:\n"
                "    equilibrium { aqueous { activityModel { model davies; } } }\n"
                "(the declaration is independent of `formulation` -- a vessel"
                " that computes no phase equilibrium still HAS an aqueous"
                " solution).  No default is applied.");

        // The package OWNS the speciation: one engine per case, built from the
        // declared model.  This unit borrows it; it no longer builds one.
        specSolver = &thermo.speciator();

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
        // THE component -> species crossing, once, through the DECLARED
        // bridge (each component's aqueousMapping / dissociatesTo) -- never
        // by name identity.  A solute with no declared mapping is refused
        // here by name, before any physics runs.
        masterOfSolute.resize(Ns);
        for (std::size_t s = 0; s < Ns; ++s)
            masterOfSolute[s] = thermo.aqueousChemistry().singleMaster(
                ComponentId(thermo.comp(soluteIdx[s]).name()));

        electrolyte::SpeciationInput in;
        in.solvePH = scalePHsolve;
        in.pH      = scalePH;
        in.T       = T_in;
        for (std::size_t s = 0; s < Ns; ++s)
            if (c_b[s] > 1.0e-30)
                in.totals[masterOfSolute[s]]
                    = c_b[s] * 1.0e3 / rho;        // kmol/m3 -> mol/kg water
        const auto feedRes = specSolver->solve(in, verbosity);

        // THE CHAIN BEHIND THE INDEX.  A saturation index is a five-step
        // argument -- analytical total -> free ion + complexes -> gamma ->
        // activity -> IAP against Ksp -- and printing only its last number
        // makes a black box of the four steps that matter pedagogically.  The
        // course teaches the climb; the report now shows it, once, for the
        // feed, at the verbosity where Newton iterations are already visible.
        if (verbosity >= 3)
        {
            std::cout << "\n  [chain] the saturation index, step by step"
                         " (feed, T = " << T_in << " K)\n"
                         "  [chain] 1. analytical totals -- what the water"
                         " analysis measures, and what the stream conserves\n";
            for (std::size_t s = 0; s < Ns; ++s)
                if (in.totals.count(masterOfSolute[s]))
                    std::printf("  [chain]      %-8s %12.6e mol/kg water\n",
                        masterOfSolute[s].key.c_str(),
                        in.totals.at(masterOfSolute[s]));

            std::cout << "  [chain] 2. speciation -- each total distributes"
                         " over free ions and complexes\n"
                         "  [chain] 3. gamma -- the declared aqueous model at"
                         " this ionic strength\n"
                         "  [chain] 4. activity = molality x gamma\n";
            std::printf("  [chain]      %-10s %3s %14s %10s %14s\n",
                        "species", "z", "molality", "gamma", "activity");
            for (const auto& r : feedRes.rows)
                if (r.molality > 1.0e-12)
                    std::printf("  [chain]      %-10s %+3.0f %14.6e %10.4f"
                                " %14.6e%s\n", r.name.c_str(), r.z,
                                r.molality, r.gamma, r.activity,
                                r.isMaster ? "   (master)" : "");
            std::printf("  [chain]      I = %.4e mol/kg   a_w = %.5f  "
                        " pH = %.3f\n", feedRes.I, feedRes.aw, feedRes.pH);

            std::cout << "  [chain] 5. IAP against Ksp -- SI = log10(IAP/K),"
                         " positive means it would precipitate\n";
            for (const auto& m : scaleMinerals)
            {
                if (!feedRes.SI.count(m)) continue;
                bool ok = false;
                const double logK = specSolver->mineralLogK_T(m, T_in, ok);
                const double si   = feedRes.SI.at(m);
                if (ok)
                    std::printf("  [chain]      %-10s log IAP %8.3f   log K"
                                " %8.3f   SI %+7.3f\n",
                                m.c_str(), si + logK, logK, si);
                else
                    std::printf("  [chain]      %-10s SI %+7.3f   (log K not"
                                " available at this T)\n", m.c_str(), si);
            }
            std::cout << "  [chain] the same climb runs at every module exit,"
                         " for the bulk AND the wall; the table below reports"
                         " step 5 only.\n\n";
        }
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
    //  k_film: ONE column when every solute sees the same coefficient (a
    //  constant, or a correlation on one diffusivity -- every case recorded
    //  before 2026-09-15); one column PER SOLUTE when the correlation prices
    //  a different k on each solute's own D (an ion-declared feed).
    if (perSoluteK)
        for (std::size_t s = 0; s < Ns; ++s)
            cols["k_film_" + thermo.comp(soluteIdx[s]).name()] = {};
    else
        cols["k_film"] = {};
    for (std::size_t s = 0; s < Ns; ++s)
        cols["c_b_" + thermo.comp(soluteIdx[s]).name()] = {};
    //  The polarisation index Gamma_i = (c_m - c_b)/c_b per solute -- the
    //  quantity of Geraldes & Afonso (2007), and what a student compares
    //  between ions.
    for (std::size_t s = 0; s < Ns; ++s)
        cols["Gamma_" + thermo.comp(soluteIdx[s]).name()] = {};
    std::vector<scalar> zGrid;
    zGrid.reserve(nNodes + 1);
    std::vector<scalar> gammaSum(Ns, 0.0);
    scalar xiSum = 0.0; int nXi = 0; int nRecorded = 0;
    //  Per-element diagnostics (C146): the polarisation modulus of each solute
    //  averaged over each element's stations.
    std::vector<scalar> elemGammaSum(Ns, 0.0);
    int elemNodes = 0;
    //  The pore's own account, when the transport law SOLVED the pore
    //  (DSPM-DE poreSolver finiteDifference): merged over every station.
    membrane::PoreAccount poreRun;
    bool anyPore = false;

    // Local channel hydraulics for the film coefficient: the crossflow
    // velocity u = Q_b / A_channel, the hydraulic diameter and the fluid
    // properties; the polarisation object prices k_c,i per solute from it
    // (or hands back the constant k_film when no correlation is declared).
    auto hydraulicsAt = [&](scalar Qlocal) -> MassTransferContext
    {
        MassTransferContext c;
        c.d_h = d_h; c.D = D_solute; c.mu = mu_feed; c.rho = rho;
        c.u   = (A_channel > 0.0) ? Qlocal / A_channel : 0.0;
        return c;
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

    auto recordNode = [&](int k, scalar z, const membrane::TransportSolution& st)
    {
        const scalar Jw = st.J_w;
        zGrid.push_back(z);
        cols["J_w"].push_back(Jw);
        cols["Q_b"].push_back(Q_b);
        cols["P_b"].push_back(P_b);
        {
            const MassTransferContext hyd = hydraulicsAt(Q_b);
            if (perSoluteK)
                for (std::size_t s = 0; s < Ns; ++s)
                    cols["k_film_" + thermo.comp(soluteIdx[s]).name()]
                        .push_back(polar.kFilm(hyd, s));
            else
                cols["k_film"].push_back(polar.kFilm(hyd, 0));
        }
        for (std::size_t s = 0; s < Ns; ++s)
        {
            const scalar g = (c_b[s] > 0.0 && st.c_m.size() == Ns)
                           ? (st.c_m[s] - c_b[s]) / c_b[s] : 0.0;
            cols["Gamma_" + thermo.comp(soluteIdx[s]).name()].push_back(g);
            gammaSum[s] += g;
            elemGammaSum[s] += g;
        }
        ++nRecorded;
        ++elemNodes;
        //  The interface potential gradient of the coupled film (Geraldes &
        //  Afonso 2007), V/m -- published only when a coupled wall produced
        //  it, beside the membrane's own psi below.
        if (st.hasXi)
        {
            cols["xi_V_per_m"].push_back(st.xi);
            xiSum += st.xi; ++nXi;
        }
        if (st.hasPore) { poreRun.merge(st.pore); anyPore = true; }
        //  The electric potential drop across the active layer, when the
        //  transport law computes one (SDEM).  RT/F units -> mV, so a reader
        //  compares it with a membrane-potential measurement directly.  A law
        //  that computes none publishes no column: absence keeps meaning
        //  "not modelled", never "zero".
        if (st.hasPsi)
            cols["psi_mV"].push_back(st.psi * constant::R * T_in / constant::F * 1.0e3);
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
    auto makeCtx = [&](scalar Qlocal) -> membrane::TransportContext
    {
        return membrane::TransportContext{ thermo, soluteIdx, B_s, mem.A_w(),
                                 polar, hydraulicsAt(Qlocal), P_b, P_perm,
                                 T_in, c_b, *osmModel, &mem, specSolver };
    };
    auto sol = transportModel->localFluxes(makeCtx(Q_b));
    recordNode(0, 0.0, sol);

    const scalar Q_feed = Q_b;          // for per-element recovery
    int   globalNode = 0;
    bool  dry = false;
    std::vector<scalar> elemRecovery, elemRetConc;   // per-element diagnostics
    //  C146: what each element of the vessel does -- its own flux, its own
    //  friction drop, the Reynolds number it is fed at, the feed it receives,
    //  and the polarisation modulus of each solute.
    std::vector<scalar> elemJw, elemDP, elemReIn, elemFeed;
    std::vector<std::vector<scalar>> elemGamma;
    //  The Reynolds number the correlations are evaluated at, over the march
    //  (Re = rho u d_h / mu, u = Q / (W h eps): Schock & Miquel Eqs. 5, 11-12).
    const bool readsDh = (mtModel != nullptr) || (pdModel != nullptr);
    auto ReAt = [&](scalar Qlocal) -> scalar
    {
        if (A_channel <= 0.0 || mu_feed <= 0.0) return 0.0;
        return rho * (Qlocal / A_channel) * d_h / mu_feed;
    };
    scalar ReMin = ReAt(Q_b), ReMax = ReMin;
    // ---- March element by element (a train is a continuous channel) ------
    for (int e = 0; e < nElements && !dry; ++e)
    {
        const scalar z0 = e * L;        // axial offset of this element
        // A continuous nModules (nominal spec, optimisation mode) marches its
        // fractional remainder as a shorter LAST element; legacy: always 1.
        const scalar elemFrac = (e == nElements - 1) ? lastFrac : 1.0;
        const scalar dz_e = (L * elemFrac) / nNodes;
        const scalar Qperm0 = Q_perm, P0 = P_b;
        elemFeed.push_back(Q_b);
        elemReIn.push_back(ReAt(Q_b));
        for (int k = 0; k < nNodes; ++k)
        {
            // Local fluxes at the start of the cell (forward Euler for the
            // mass / volume balances --- the cell width is small relative
            // to the variation, the inner Newton is exact in J_w).
            const scalar J_w = sol.J_w;
            const std::vector<scalar>& Js = sol.J_s;

            // Balances over the slice of width W·dz, in CONSERVATIVE form --
            // what leaves the bulk is exactly what the permeate receives:
            //   dQ_b/dz   = -W · J_w
            //   dN_b,s/dz = -W · J_s,s          (N_b,s = Q_b · c_b,s)
            // which is  dc_b,s/dz = (J_w c_b,s - J_s,s) W / Q_b  written so
            // that the discrete step conserves each solute to round-off.
            const scalar dQ = -W * J_w * dz_e;

            // Permeate accumulation over this slice
            Q_perm += W * J_w * dz_e;                         // m³/s
            for (std::size_t s = 0; s < Ns; ++s)
                F_perm_solute[s] += W * Js[s] * dz_e;        // kmol/s

            // Advance bulk state
            Q_b += dQ;
            for (std::size_t s = 0; s < Ns; ++s)
            {
                N_b[s] -= W * Js[s] * dz_e;
                c_b[s] = (Q_b > 0.0) ? std::max<scalar>(N_b[s] / Q_b, 0.0) : 0.0;
            }
            P_b -= dPdzAt(Q_b) * dz_e;

            if (Q_b <= 0.0) { dry = true; break; }
            ReMin = std::min(ReMin, ReAt(Q_b));
            ReMax = std::max(ReMax, ReAt(Q_b));
            sol = transportModel->localFluxes(makeCtx(Q_b));
            recordNode(++globalNode, z0 + (k + 1) * dz_e, sol);
        }

        // Per-element diagnostics: cumulative recovery through element e+1,
        // and the retentate concentration leaving it (shows the buildup).
        elemRecovery.push_back((Q_feed > 0.0) ? Q_perm / Q_feed : 0.0);
        elemRetConc.push_back(Ns > 0 ? c_b[0] : 0.0);   // first solute [kmol/m³]
        {
            const scalar Ae = A_membrane * elemFrac;
            elemJw.push_back(Ae > 0.0 ? (Q_perm - Qperm0) / Ae : 0.0);
            elemDP.push_back(P0 - P_b);
            std::vector<scalar> g(Ns, 0.0);
            for (std::size_t s2 = 0; s2 < Ns; ++s2)
                g[s2] = elemNodes > 0 ? elemGammaSum[s2] / elemNodes : 0.0;
            elemGamma.push_back(std::move(g));
            std::fill(elemGammaSum.begin(), elemGammaSum.end(), 0.0);
            elemNodes = 0;
        }

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
                        in.totals[masterOfSolute[s]]
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

    //  THE WINDOW OF THE CORRELATION (C146).  A spacer record carries the
    //  Reynolds band its correlation was measured over (Schock & Miquel:
    //  "100 < Re < 1000", p. 345, for the friction law; the same band for the
    //  Sherwood law's Fig. 9).  The run is ANNOUNCED outside it and continues:
    //  an extrapolation is a fact about the answer, not a reason to refuse it.
    if (spacer && readsDh)
    {
        auto checkBand = [&](const SpacerCorrelation& c, bool used, const char* what)
        {
            if (!used || !c.declared || !c.hasReBand) return;
            if (ReMin >= c.Re_lo && ReMax <= c.Re_hi) return;
            char b[400];
            std::snprintf(b, sizeof(b),
                "%s correlation '%s' of the feed spacer '%s' EXTRAPOLATED: Re"
                " runs %.4g to %.4g along the vessel, outside its measured"
                " window %.4g < Re < %.4g (the spacer record's validity) --"
                " the run continues",
                what, c.model.c_str(), spacer->name().c_str(),
                static_cast<double>(ReMin), static_cast<double>(ReMax),
                static_cast<double>(c.Re_lo), static_cast<double>(c.Re_hi));
            if (verbosity >= 1)
                std::cout << "  [window] " << b << "\n";
            AdvisoryLog::instance().add("extrapolation", "warning",
                "membrane stage '" + unitLabel + "'", b);
        };
        checkBand(spacer->massTransfer(), mtModel != nullptr, "mass-transfer");
        checkBand(spacer->pressureDrop(), pdModel != nullptr, "friction");
    }

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
        ret.F = F_ret * nVessels;          // the stage: n identical vessels
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
        perm.F = F_perm_total * nVessels;  // the stage: n identical vessels
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
    scalar solute_closure_rel = 0.0;   // worst solute: |feed - ret - perm| / feed
    if (!dry)
    {
        //  EACH SOLUTE closes too.  The mass check alone cannot see a solute
        //  lost to the water (the water is closed BY mass), which is how a
        //  0.03-0.4 % solute leak sat under a mass closure of 1e-16 in every
        //  spiral-wound case until 2026-09-29.
        for (std::size_t s = 0; s < Ns; ++s)
        {
            if (N_feed[s] <= 0.0) continue;
            const scalar out_s = c_b[s] * Q_b + F_perm_solute[s];
            solute_closure_rel = std::max(solute_closure_rel,
                std::abs(out_s - N_feed[s]) / N_feed[s]);
        }
        if (solute_closure_rel > 1.0e-9)
        {
            char b[240];
            std::snprintf(b, sizeof(b),
                "spiralWoundModule solute balance does not close: worst solute"
                " rel = %.3e (retentate + permeate against feed).  A solute"
                " exhausted from the bulk inside the channel is clamped at"
                " zero; refine nNodes or shorten the module.",
                static_cast<double>(solute_closure_rel));
            throw std::runtime_error(b);
        }

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

    // ---- The manufacturer's LIMITS, checked against THIS run ---------------
    //  Announced as a violation of the data sheet's limit, never refused: a
    //  student may exceed a rating on purpose, and the run then says so in
    //  the log and the caveat block.  Each limit the record does not declare
    //  is not checked (absent, never a zero).  pH is checked only when the
    //  case states one (a `scaling { pH <value>; }` block); a run that knows
    //  no pH says nothing about it.
    if (hasModule)
    {
        const ModuleLimits& lim = modRec->limits();
        auto violate = [&](const std::string& what)
        {
            if (verbosity >= 1)
                std::cout << "  [limit] module '" << modRec->name() << "': " << what
                          << " -- the run continues outside the manufacturer's"
                             " rating (" << modRec->source() << ")\n";
            AdvisoryLog::instance().add("rating", "warning",
                "module '" + modRec->name() + "'", what + " -- outside the"
                " manufacturer's rating, run continued");
        };
        char b[240];
        if (lim.hasP_max && P_in > lim.P_max)
        {
            std::snprintf(b, sizeof(b), "feed P %.2f bar EXCEEDS the maximum"
                " operating pressure %.2f bar", static_cast<double>(P_in * 1e-5),
                static_cast<double>(lim.P_max * 1e-5));
            violate(b);
        }
        if (lim.hasT_max && T_in > lim.T_max)
        {
            std::snprintf(b, sizeof(b), "feed T %.2f K EXCEEDS the maximum"
                " operating temperature %.2f K", static_cast<double>(T_in),
                static_cast<double>(lim.T_max));
            violate(b);
        }
        //  Per VESSEL and per ELEMENT (C146): the first element of a vessel
        //  receives the vessel's whole feed, and each element's own friction
        //  drop is checked -- never the vessel average.
        if (lim.hasFeedFlow_max && Q_feed > lim.feedFlow_max)
        {
            std::snprintf(b, sizeof(b), "feed flow %.3f m3/h EXCEEDS the"
                " maximum feed flow %.3f m3/h",
                static_cast<double>(Q_feed * 3600.0),
                static_cast<double>(lim.feedFlow_max * 3600.0));
            violate(b);
        }
        if (lim.hasDP_max)
        {
            std::size_t eMax = 0;
            for (std::size_t e = 1; e < elemDP.size(); ++e)
                if (elemDP[e] > elemDP[eMax]) eMax = e;
            if (!elemDP.empty() && elemDP[eMax] > lim.dP_max)
            {
                std::snprintf(b, sizeof(b), "feed-channel pressure drop %.3f bar"
                    " in element %zu EXCEEDS the maximum pressure drop %.3f bar"
                    " per element", static_cast<double>(elemDP[eMax] * 1e-5),
                    eMax + 1, static_cast<double>(lim.dP_max * 1e-5));
                violate(b);
            }
        }
        if (lim.hasPH && doScaling && !scalePHsolve
         && (scalePH < lim.pH_min || scalePH > lim.pH_max))
        {
            std::snprintf(b, sizeof(b), "declared pH %.2f is OUTSIDE the"
                " continuous-operation band %.1f - %.1f",
                static_cast<double>(scalePH), static_cast<double>(lim.pH_min),
                static_cast<double>(lim.pH_max));
            violate(b);
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
    //  The inlet crossflow velocity in the record's channel -- the number a
    //  laboratory protocol prescribes (the SEPA CF manual's 0.1-0.5 m/s), so
    //  a case that declares its feed flow to hit one can be held to it.
    //  Published only under `module`: no pre-existing golden gains an
    //  unpinned KPI.
    if (hasModule && A_channel > 0.0) kpis_["u_crossflow_inlet"] = feed_vol / A_channel;
    //  C146: the stage, the channel and the window.
    if (nVessels > 1)
    {
        kpis_["vessels"]        = static_cast<scalar>(nVessels);
        kpis_["feedFlowPerVessel"] = feed_vol;                     // m3/s
        kpis_["area_stage"]     = nVessels * A_total;              // m2
    }
    if (nLeaves > 0)
    {
        kpis_["leaves"]    = static_cast<scalar>(nLeaves);
        kpis_["leafWidth"] = W_leaf;                               // m, derived
    }
    if (readsDh)
    {
        kpis_["hydraulicDiameter"] = d_h;                          // m
        kpis_["Re_inlet"] = elemReIn.empty() ? 0.0 : elemReIn.front();
        kpis_["Re_min"]   = ReMin;
        kpis_["Re_max"]   = ReMax;
    }
    // Mass-closure residual |feed − (ret+perm)| / feed (the guard above also
    // throws if it ever exceeds 1e-9): a permanent, visible witness that the
    // module conserves mass.
    if (!dry) kpis_["mass_closure_rel"] = mass_closure_rel;
    if (!dry) kpis_["solute_closure_rel"] = solute_closure_rel;
    //  Membrane potential (SDEM only): the channel average of the per-node
    //  potential drop, the one number that says the field was there.
    if (cols.count("psi_mV") && !cols["psi_mV"].empty())
    {
        scalar sum = 0.0;
        for (scalar v : cols["psi_mV"]) sum += v;
        kpis_["membranePotential_mV_avg"] = sum / cols["psi_mV"].size();
    }
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
            kpis_["J_w_avg_elem" + ee] = elemJw[e];
            kpis_["dP_elem"      + ee] = elemDP[e];
            kpis_["feedFlow_elem" + ee] = elemFeed[e];
            if (readsDh) kpis_["Re_in_elem" + ee] = elemReIn[e];
            for (std::size_t s = 0; s < Ns; ++s)
                kpis_["Gamma_" + thermo.comp(soluteIdx[s]).name() + "_elem" + ee]
                    = elemGamma[e][s];
        }
    }
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const std::string nm = thermo.comp(soluteIdx[s]).name();
        const scalar c_feed  = bulk0.c[soluteIdx[s]];
        const scalar c_perm  = (Q_perm > 0) ? F_perm_solute[s] / Q_perm : 0.0;
        const scalar R_obs   = (c_feed > 0) ? 1.0 - c_perm / c_feed : 1.0;
        kpis_["R_obs_" + nm] = R_obs;
        //  The channel-average polarisation index per solute (Geraldes &
        //  Afonso 2007's Gamma), so a golden can pin what the film did.
        if (nRecorded > 0) kpis_["Gamma_" + nm + "_avg"] = gammaSum[s] / nRecorded;
    }
    //  The interface potential gradient, averaged, when the film was coupled.
    if (nXi > 0) kpis_["xi_V_per_m_avg"] = xiSum / nXi;
    //  The pore, when it was SOLVED: the grid and the stiffness of the
    //  answer are published (a golden can pin them); the residuals are
    //  round-off and are PRINTED, never pinned -- a golden on a number at
    //  the last digit pins the compiler, not the physics.
    if (anyPore)
    {
        kpis_["pore_nodes"]         = static_cast<scalar>(poreRun.nodes);
        kpis_["pore_stiffness_max"] = poreRun.stiffnessMax;
        std::ostringstream m;
        m << std::setprecision(3)
          << "  [DSPM-DE] pore summary (" << (dict->name().empty() ? type() : dict->name()) << "): " << poreRun.solves
          << " pore solves on " << poreRun.nodes << " nodes (pore, wall and water"
             " flux in one Newton per station), at most "
          << poreRun.newtonMax << " Newton iterations (" << poreRun.newtonTotal
          << " in all), ||F|| <= "
          << poreRun.residualMax << "; flux constancy <= "
          << poreRun.fluxConstancyMax << " of the terms it nets ("
          << poreRun.fluxRelativeMax << " of the net flux, at a stiffness of "
          << poreRun.stiffnessMax << "), zero current <= " << poreRun.currentMax
          << ", electroneutrality <= " << poreRun.electroneutralMax << "; "
          << poreRun.continuations << " solves by continuation in J_v";
        if (poreRun.adaptive)
            m << "; adaptive grid: " << poreRun.gridPasses << " re-solves on a"
                 " moved grid, final node movement <= " << poreRun.gridMoveMax
              << " of a cell, " << poreRun.gridUnsettled << " stations unsettled";
        m << "\n";
        std::cout << m.str();
    }

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Spiral-wound result  ===\n"
                  << "  Membrane:        " << membraneName << "  (" << mem.kind() << ")\n";
        if (hasModule)
        {
            std::cout << "  Module:          " << modRec->name() << "  ("
                      << modRec->format() << ", " << modRec->manufacturer()
                      << ")  A = " << A_membrane << " m2";
            if (nElements > 1) std::cout << " x " << nElements;
            std::cout << "\n";
            if (nLeaves > 0)
            {
                char b[200];
                std::snprintf(b, sizeof(b), "  Leaves:          %d x %.4g m"
                    " long x %.4g m wide (width = A/(2 n L), derived)\n",
                    nLeaves, static_cast<double>(L), static_cast<double>(W_leaf));
                std::cout << b;
            }
            const RatedTest& rt = modRec->ratedTest();
            if (rt.declared)
            {
                //  The data sheet's own standard test, printed beside the run
                //  so a reader sees what the manufacturer measured at.  The
                //  comparison at THOSE conditions is check_membrane_modules'.
                char b[300];
                std::snprintf(b, sizeof(b),
                    "  Rated test:      %g ppm %s, %.2f bar, %.2f K, recovery"
                    " %.0f %%: permeate %.3g m3/d, rejection %.2f %% (data sheet)\n",
                    static_cast<double>(rt.feedMassFraction * 1e6),
                    rt.solute.c_str(), static_cast<double>(rt.P * 1e-5),
                    static_cast<double>(rt.T),
                    static_cast<double>(rt.recovery * 100.0),
                    static_cast<double>(rt.permeateFlow * 86400.0),
                    static_cast<double>(rt.rejection * 100.0));
                std::cout << b;
            }
        }
        else
            std::cout << "  Area:            " << A_membrane << " m²\n";
        if (nVessels > 1)
        {
            char b[200];
            std::snprintf(b, sizeof(b), "  Stage:           %d vessels x %g"
                " element(s) = %.4g m2 (one vessel solved on F/%d)\n",
                nVessels, static_cast<double>(nModulesReal),
                static_cast<double>(nVessels * nModulesReal * A_membrane), nVessels);
            std::cout << b;
        }
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
                      << 100.0 * kpis_["R_obs_" + nm] << " %";
            if (kpis_.count("Gamma_" + nm + "_avg"))
                std::cout << "   Gamma_avg " << std::showpos << std::fixed
                          << std::setprecision(4) << kpis_["Gamma_" + nm + "_avg"]
                          << std::noshowpos;
            std::cout << "\n";
        }
        if (nXi > 0)
            std::cout << "  Interface field: xi_avg = " << std::scientific
                      << std::setprecision(3) << kpis_["xi_V_per_m_avg"]
                      << " V/m  (Geraldes & Afonso 2007, ionCoupling"
                         " electroneutral)\n";
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
