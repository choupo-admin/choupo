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

#include "ElectrodialysisStack.H"
#include "Electrochem.H"
#include "EDCell.H"
#include "LimitingCurrent.H"
#include "thermo/electrolyte/IonTransport.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/RegistryRefusal.H"
#include "thermo/electrochem/EDStack.H"
#include "thermo/electrochem/EDStackRegistry.H"
#include "solver/NewtonRaphson.H"
#include "thermo/Database.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // findIon, ionCharge

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

//  THE CELL PAIR MOVED TO ONE HOME (2026-09-16).  `IEMSpec` / `readIEMPair`,
//  `ChannelState` / `buildChannel`, the mean activity ratio, the solution
//  resistance and the whole GeraldesAfonso2010 assembly lived in this
//  anonymous namespace while this file was their only caller.  The batch
//  recirculating rig is the second, and it asks the same questions once per
//  instant instead of once per pass -- so they are now
//  `unitOperations/electrochem/EDCell.{H,cpp}`, moved verbatim, with the
//  refusal messages carrying the caller's own type word so nothing this unit
//  says has changed.  (The BulkConversion.H precedent: a helper leaves an
//  anonymous namespace the day the second caller arrives.)
using edCell::ChannelState;
using edCell::IEMSpec;
using edCell::MW_WATER_KG;

} // namespace

// ---------------------------------------------------------------------------
int ElectrodialysisStack::solve(const DictPtr& dict,
                                const ThermoPackage& thermo,
                                int verbosity)
{
    products_.clear();
    kpis_.clear();
    const std::size_t Ncomp = thermo.n();

    // ---- Two inputs: diluate feed + concentrate feed -----------------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("electrodialysisStack: expected exactly 2 input "
            "streams (diluate-feed concentrate-feed); got "
            + std::to_string(ins.size())
            + ".  Declare  inputs ( diluateFeed concentrateFeed );");

    struct Feed { sVector z; scalar F = 0, T = 0, P = 0, vf = 0; };
    auto readFeed = [&](const DictPtr& sd) -> Feed
    {
        Feed f;
        f.F  = sd->lookupScalar("F", Dims::molarFlow);
        f.T  = sd->lookupScalar("T", Dims::temperature);
        f.P  = sd->lookupScalar("P", Dims::pressure);
        f.vf = sd->lookupScalarOrDefault("vf", 0.0);
        f.z.assign(Ncomp, 0.0);
        auto cd = sd->subDict("composition");
        scalar sum = 0.0;
        for (const auto& kk : cd->keys()) f.z[thermo.indexOf(kk)] = cd->lookupScalar(kk);
        for (auto v : f.z) sum += v;
        if (sum > 0.0) for (auto& v : f.z) v /= sum;
        return f;
    };
    Feed dil = readFeed(ins[0]);
    Feed con = readFeed(ins[1]);
    const scalar T = dil.T;     // isothermal stack (announced)

    const std::size_t iWater = thermo.indexOf("water");   // loud if absent

    // ---- operation{} hardware ---------------------------------------------
    auto op = dict->subDict("operation");
    const std::string unitLabel = dict->name().empty() ? type() : dict->name();

    //  THE STACK RECORD (2026-09-16).  `stack <name>;` names a `kind edStack`
    //  record in assets/ and the record supplies what the case used to type:
    //  the membrane pair, the cell pairs, the active area, the channel, the
    //  hydraulic passes and the Sherwood correlation fitted to THAT stack.
    //  ONE home: the same fact declared inline beside `stack` REFUSES by
    //  name, every offending key listed.  `linearVelocity` is in that list
    //  for a reason of its own -- it was never an operating knob, it is the
    //  diluate flow divided by the channel section, and the unit already has
    //  the flow.
    const bool hasStack = op->found("stack");
    const EDStack* stk = nullptr;
    if (hasStack)
    {
        stk = &EDStackRegistry::byName(op->lookupWord("stack"));
        std::vector<std::string> clash;
        for (const char* k : { "N_cellpairs", "membraneArea",
                               "channelThickness", "channelLength",
                               "linearVelocity", "hydraulicPasses",
                               "spacerPorosity" })
            if (op->found(k)) clash.push_back(k);
        //  The membrane pair is the record's ONLY where the record's source
        //  names one.  A stack FRAME whose source does not (Vitor's own
        //  industrial unit) takes any pair, so the CASE declares it -- the
        //  SEPA CF flat-cell shape, one band along.
        if (stk->namesMembranes() && op->found("membrane")) clash.push_back("membrane");
        if (!clash.empty())
        {
            std::string list;
            for (const auto& c : clash) list += " `" + c + "`";
            throw std::runtime_error("electrodialysisStack '" + unitLabel
                + "': `stack " + stk->name() + ";` supplies the membrane pair,"
                  " the cell pairs, the active area, the channel geometry and"
                  " the hydraulic passes from its record ("
                + stk->sourcePath() + "), and the operation ALSO declares"
                + list + " -- one home.  Remove the inline value(s), or drop"
                  " `stack` and keep them.  A crossflow VELOCITY is never a"
                  " value to keep: it is the diluate flow on the inlet stream"
                  " divided by the channel section the record describes, and"
                  " the run prints that arithmetic.");
        }
    }

    const int N = hasStack ? stk->cellPairs()
                           : static_cast<int>(op->lookupScalar("N_cellpairs"));
    if (N <= 0)
        throw std::runtime_error("electrodialysisStack: N_cellpairs must be > 0");

    const scalar xi = op->lookupScalarOrDefault("xi", 0.9);
    if (xi <= 0.0 || xi > 1.0)
        throw std::runtime_error("electrodialysisStack: xi (current efficiency) "
            "must be in (0, 1]; got " + std::to_string(xi));

    //  `area` is the area ONE CELL PAIR presents to the current, which is what
    //  a current density is taken on.  Under a record that is the DERIVED
    //  activeArea / cellPairs -- Vitor's ruling (2026-09-16): the record's
    //  activeArea IS the cell-pair area of the whole stack, so a 50 m2 stack
    //  carries 50 m2 of anionic membrane AND 50 m2 of cationic membrane.
    const scalar area = hasStack ? stk->areaPerCellPair_m2()
                                 : op->lookupScalar("membraneArea", Dims::area);
    const scalar h_ch = hasStack ? stk->channelHeight_m()
                                 : op->lookupScalar("channelThickness", Dims::length);
    const scalar E_el = op->lookupScalarOrDefault("E_electrodes", 0.0);        // V (lumped)
    if (hasStack && !stk->namesMembranes() && !op->found("membrane"))
        throw std::runtime_error("electrodialysisStack '" + unitLabel
            + "': the stack record '" + stk->name() + "' names no membrane"
              " pair (its source does not state one), so the CASE must:"
              " declare `membrane <name>;` beside `stack " + stk->name()
            + ";` (a `kind IEM` record in assets/, e.g. CMX_AMX).  Neither"
              " side may guess a pair on the owner's behalf.");
    const std::string memName = (hasStack && stk->namesMembranes())
        ? stk->membranes()
        : op->lookupWordOrDefault("membrane", "CMX_AMX");

    //  THREE OPERATING FORMS, exactly one of which the case gives (the third
    //  arrived 2026-09-19 for the wine tutorial): the current itself; the
    //  demineralisation of the reference cation; or the fraction of the
    //  diluate's CONDUCTIVITY to remove -- the quantity a cellar floor
    //  actually measures, and the one the tartaric-stability practice is
    //  stated in.  Zero or two-or-more is a degrees-of-freedom error and the
    //  refusal names all three and what it found.
    const bool haveI      = op->found("current");
    const bool haveTarget = op->found("targetDemin");
    const bool haveKappa  = op->found("targetConductivityRemoval");
    {
        std::vector<std::string> given;
        if (haveI)      given.push_back("`current`");
        if (haveTarget) given.push_back("`targetDemin`");
        if (haveKappa)  given.push_back("`targetConductivityRemoval`");
        if (given.size() != 1)
        {
            std::string found = given.empty() ? "none of them" : "";
            for (std::size_t k = 0; k < given.size(); ++k)
                found += (k ? " AND " : "") + given[k];
            throw std::runtime_error("electrodialysisStack '" + unitLabel
                + "': give EXACTLY ONE of `current <I> A;` (the applied"
                  " current), `targetDemin <fraction>;` (solve I for that"
                  " demineralisation of the reference cation) or"
                  " `targetConductivityRemoval <fraction>;` (solve I for that"
                  " fraction of the diluate's conductivity removed) -- the"
                  " operation declares " + found + ".");
        }
    }

    // ---- IEM membrane pair (the stack's own reader) ------------------------
    IEMSpec cem, aem;
    edCell::readIEMPair(type(), memName, cem, aem);

    // ---- The CASE's aqueous activity model, never this stack's -------------
    //  This read a frozen "davies" literal: a unit op selecting thermodynamics
    //  on the author's behalf, invisible in every file the student opens.  It
    //  survived because the grammar had no slot for a liquid-only electrolyte
    //  declaration; now that `equilibrium { aqueous { … } }` is readable with
    //  any formulation, the stack reads what the case declared -- or refuses.
    const auto& aqChem = thermo.aqueousChemistry();
    if (!aqChem.declared || aqChem.activityModel.empty())
        throw std::runtime_error("electrodialysisStack refused: this stack"
            " needs aqueous activities but the case declares no aqueous"
            " chemistry.  Add to constant/thermoPhysPropDict:\n"
            "    equilibrium { aqueous { activityModel { model davies; } } }\n"
            "(independent of `formulation` -- a stack that computes no phase"
            " equilibrium still HAS an aqueous solution).  No default is"
            " applied.");
    auto act = electrolyte::AqueousActivity::New(aqChem.activityModel);

    // Build channel states ONCE per pass (NOT inside any inner I loop).
    ChannelState chD = edCell::buildChannel(type(), thermo, dil.z, iWater, T, *act);
    ChannelState chC = edCell::buildChannel(type(), thermo, con.z, iWater, T, *act);

    // mol/s of each transferable ion entering the diluate channel (the cap on
    // what current can remove).  Per ion: F_dil [kmol/s] * 1000 * z_frac.
    // We track removal per ION via the molality fraction of the diluate feed.

    // ---- THE LIMITING CURRENT DENSITY --------------------------------------
    //  TWO models now (2026-09-16), so the dispatch lives in
    //  unitOperations/electrochem/LimitingCurrent.{H,cpp} with the accepted
    //  words in ONE place and a refusal for a word neither branch knows.  The
    //  header sentence that justified keeping this INLINE ("exactly ONE
    //  limiting-current correlation in v1 ... not a factory-for-one") was
    //  true and is buried here.
    //
    //    GeraldesAfonso2010 -- the PREDICTION (J. Membr. Sci. 360 (2010)
    //      499-508).  No transport number is declared: the linearised
    //      Nernst-Planck equations in the film give the limiting transport
    //      numbers from the ion diffusivities and the diluate composition
    //      (Eqs. 12/13) and the limiting current in closed form (Eq. 15).
    //      It needs the stack's OWN Sherwood correlation, which is
    //      equipment-and-spacer data and lives on the stack record -- so a
    //      case with no `stack` cannot take this route and is told so.
    //
    //    CowanBrown -- the LEGACY route, unchanged bit for bit: the classical
    //      single-salt working form on the membrane record's DECLARED t_cu,
    //      with k from a Leveque-type estimate on a mean ion diffusivity.
    //
    //  THE DEFAULT is announced either way: GeraldesAfonso2010 when a stack
    //  record supplies the correlation AND every diluate ion resolves a
    //  diffusivity AND both signs are present; CowanBrown otherwise, naming
    //  which of those was missing.
    std::string lcModel;
    bool        lcDeclared = false;
    if (op->found("limitingCurrent"))
    {
        auto lc = op->subDict("limitingCurrent");
        lcModel = lc->lookupWordOrDefault("model", "");
        bool known = false;
        for (const auto& w : edLimitingCurrent::acceptedModels())
            if (w == lcModel) known = true;
        if (!known)
            throw std::runtime_error("electrodialysisStack '" + unitLabel
                + "' limitingCurrent: "
                + registryRefusal::message("limiting-current model", lcModel,
                      edLimitingCurrent::acceptedModels(), "Accepted"));
        lcDeclared = true;
    }

    //  Can the predictive route be taken at all?  Asked BEFORE any default is
    //  chosen, so the reason a case falls back is a fact and not a guess.
    std::string predictiveBlocker;
    if (!hasStack)
        predictiveBlocker = "the case names no `stack <name>;` record, and the"
            " Sherwood correlation the model needs is equipment-and-spacer data"
            " that only a `kind edStack` record carries";
    else
    {
        int nCat = 0, nAn = 0;
        for (auto zz : chD.z) { if (zz > 0.0) ++nCat; else if (zz < 0.0) ++nAn; }
        if (nCat == 0 || nAn == 0)
            predictiveBlocker = "the diluate carries ions of only one sign";
        else
            for (const auto& sp : chD.ion)
                try { (void) electrolyte::ionD0(sp); }
                catch (const std::exception& e)
                {
                    predictiveBlocker = std::string("an ion has no curated"
                        " diffusivity -- ") + e.what();
                    break;
                }
    }
    if (lcDeclared && lcModel == "GeraldesAfonso2010" && !predictiveBlocker.empty())
        throw std::runtime_error("electrodialysisStack '" + unitLabel
            + "': `limitingCurrent { model GeraldesAfonso2010; }` was declared"
              " and cannot be evaluated, because " + predictiveBlocker
            + ".  Name a stack record and curate the missing diffusivity, or"
              " declare `model CowanBrown;` to keep the legacy single-salt"
              " form on the membrane record's own t_cu.");
    if (!lcDeclared)
        lcModel = predictiveBlocker.empty() ? "GeraldesAfonso2010" : "CowanBrown";

    //  ---- the DERIVED crossflow velocity, printed with its arithmetic ------
    //  The velocity was an operation key until 2026-09-16 and was a SECOND
    //  HOME: the diluate flow arrives on the inlet stream, so the velocity is
    //  a consequence of that flow, the channel section and how many channels
    //  run side by side in one hydraulic pass.  A declared velocity could
    //  contradict the flow and nothing noticed -- while it sets k and
    //  therefore i_lim.
    const scalar rho_carrier = 1000.0;      // kg/m3, the dilute-carrier value this unit already uses
    const scalar Q_dil_in = dil.F * dil.z[iWater] * 1000.0 * MW_WATER_KG / rho_carrier;  // m3/s
    scalar u_superficial = 0.0, u_interstitial = 0.0, channelsPerPass = 0.0;
    scalar pathLength = 0.0, sectionEmpty = 0.0;
    if (hasStack)
    {
        channelsPerPass = stk->channelsPerPass();
        sectionEmpty    = channelsPerPass * stk->channelWidth_m() * h_ch;
        u_superficial   = Q_dil_in / sectionEmpty;
        u_interstitial  = u_superficial / stk->spacerPorosity();
        pathLength      = stk->flowPathLength_m();
    }

    //  ---- the fluid: kinematic viscosity, and D0 corrected to the run T ----
    //  The paper prices Re and Sc on PURE WATER at the run temperature, so
    //  the package is asked for the solvent's own liquid viscosity (a
    //  water-only composition) rather than a mixture value; the density is
    //  the dilute-carrier 1000 kg/m3 this unit already announces for the
    //  conductivity -- ONE constant, and Sh depends on it as rho^(b-c), which
    //  is 0.03 % over the 0.18 % between 1000 and the paper's 998.2.
    //  The ion D0 tier is curated at 25 C; the paper's Table 3 is at 20 C,
    //  corrected through Stokes-Einstein.  So is this, from the SAME
    //  viscosity model at both temperatures -- and when the case declares no
    //  liquid-viscosity model there is no correction and the run SAYS so.
    sVector xSolvent(Ncomp, 0.0);
    xSolvent[iWater] = 1.0;
    scalar mu_solvent = 0.0, nu_solvent = 1.0e-6, seFactor = 1.0;
    bool   muPriced = false;
    if (thermo.hasLiquidViscosity())
    {
        mu_solvent = thermo.viscosityLiquid(T, xSolvent);
        const scalar mu_ref = thermo.viscosityLiquid(298.15, xSolvent);
        nu_solvent = mu_solvent / rho_carrier;
        seFactor   = (T / 298.15) * (mu_ref / mu_solvent);
        muPriced   = true;
    }

    scalar D_eff = 0.0, k_c_eff = 0.0, Sh_lc = 0.0, Re_lc = 0.0, Sc_lc = 0.0;
    scalar i_lim = 0.0, i_lim_cem = 0.0, i_lim_aem = 0.0, i_lim_eq16 = 0.0;
    bool   haveEq16 = false;
    std::string i_lim_setBy;
    std::vector<edLimitingCurrent::Ion> lcIons;
    std::vector<scalar> t_cem_lim, t_aem_lim;
    const scalar t_cu = cem.t_cu;                        // CEM counter-ion (cation) tn (DECLARED)
    const scalar t_co = 1.0 - t_cu;

    if (lcModel == "GeraldesAfonso2010")
    {
        //  ONE HOME since 2026-09-16 (edCell::predictiveLimitingCurrent): the
        //  batch recirculating rig assembles the paper's Eqs. A13/12/13/15/16
        //  from exactly this channel state and exactly this record, once per
        //  instant.  The code below is the same code, called.
        const edCell::LimitingCurrent lc =
            edCell::predictiveLimitingCurrent(*stk, chD, Q_dil_in, nu_solvent,
                                              seFactor);
        lcIons     = lc.ions;
        t_cem_lim  = lc.t_cem;
        t_aem_lim  = lc.t_aem;
        D_eff      = lc.D_eff;   k_c_eff = lc.k_c_eff;
        Sh_lc      = lc.Sh;      Re_lc   = lc.Re;   Sc_lc = lc.Sc;
        i_lim      = lc.i_lim;   i_lim_cem = lc.i_lim_cem;
        i_lim_aem  = lc.i_lim_aem;
        i_lim_eq16 = lc.i_lim_eq16;
        haveEq16   = lc.haveEq16;
        i_lim_setBy = lc.setBy;
    }
    else
    {
        // ---- CowanBrown (LEGACY, bit for bit) ------------------------------
        // i_lim = z F k c_dil / (t_cu - t_co),  t_co = 1 - t_cu (CEM convention).
        // Mass-transfer coefficient k from a simple Leveque-type Sherwood estimate
        // for the thin spacer channel (the honest "simple correlation over theory"
        // rung -- ANNOUNCED):
        //     Sh = 1.85 (Re Sc d_h / L)^(1/3),   k = Sh D / d_h
        // with d_h ~ 2 h_channel (slit), Re = v d_h / nu, Sc = nu / D.  The cross-
        // flow velocity `linearVelocity` therefore SETS k -- the student sees the
        // limiting current rise with flow.  nu = water kinematic viscosity (~1e-6
        // m2/s at 25 C, dilute-carrier approximation, announced).  L ~ membraneArea
        // / channel-width is unknown here; we use a representative L = 0.5 m and
        // announce it (an explicit operation key can override later).
        const scalar vel = op->lookupScalarOrDefault("linearVelocity", 0.05, Dims::velocity);
        scalar D_mean = 0.0;
        for (const auto& nm : chD.ion) D_mean += electrolyte::ionD0(nm);
        D_mean /= static_cast<scalar>(chD.ion.size());
        const scalar d_h   = 2.0 * h_ch;                     // slit hydraulic diameter [m]
        const scalar nu    = 1.0e-6;                         // m2/s (water, 25 C, announced)
        const scalar L_ch  = op->lookupScalarOrDefault("channelLength", 0.5, Dims::length); // m
        const scalar Re    = vel * d_h / nu;
        const scalar Sc    = nu / D_mean;
        const scalar Sh    = 1.85 * std::cbrt(std::max(Re * Sc * d_h / L_ch, 1.0e-12));
        const scalar k_mt  = Sh * D_mean / d_h;              // m/s
        const scalar z_lim = 1.0;                            // monovalent salt basis (NaCl)
        // i_lim uses the DILUATE bulk equivalent concentration (the depleting side).
        i_lim   = z_lim * electrochem::Faraday * k_mt * chD.c_eq / (t_cu - t_co);   // A/m2
        Sh_lc   = Sh;  Re_lc = Re;  Sc_lc = Sc;  k_c_eff = k_mt;  D_eff = D_mean;
        u_superficial = vel;
        i_lim_setBy = "the membrane record's declared t_cu";
    }

    // ---- ANNOUNCEMENTS: the route, the assumptions, the estimates ----------
    //  Nothing below changes a number; all of it says what the run did.  The
    //  [estimate] tag and the AdvisoryLog channel are Database.cpp's -- one
    //  vocabulary -- so a record with no estimate produces no line and the
    //  silence keeps meaning "nothing was assumed".
    {
        auto say = [&](const char* tag, const std::string& msg,
                       const char* category)
        {
            if (verbosity >= 1)
                std::cout << "  [" << tag << "] electrodialysisStack '"
                          << unitLabel << "': " << msg << "\n";
            AdvisoryLog::instance().add(category, "warning",
                "electrodialysisStack '" + unitLabel + "'", msg);
        };
        if (verbosity >= 2)
            std::cout << "  [limiting current] model " << lcModel << " "
                      << (lcDeclared ? "DECLARED by the case"
                                     : "selected by default")
                      << (lcDeclared || predictiveBlocker.empty()
                            ? "" : " because " + predictiveBlocker)
                      << "\n";
        if (!lcDeclared && !predictiveBlocker.empty())
            say("legacy", "the limiting current falls back to the CowanBrown"
                " single-salt working form on the membrane record's DECLARED"
                " t_cu, because " + predictiveBlocker + ".  The predictive"
                " route (GeraldesAfonso2010) needs none.", "provenance");
        if (!hasStack)
            say("legacy", "the crossflow velocity was DECLARED"
                " (`linearVelocity`) and the engine could not check it against"
                " the diluate flow on the inlet stream -- a velocity is a"
                " consequence of that flow, the channel section and the number"
                " of channels in parallel.  Name a `kind edStack` record"
                " (`stack <name>;`) and the velocity is derived and printed"
                " with its arithmetic.", "provenance");
        if (lcModel == "GeraldesAfonso2010" && !muPriced)
            say("legacy", "the ion diffusivities were used at their curated"
                " 25 C reference with NO Stokes-Einstein correction to the run"
                " temperature -- the case declares no `transport {"
                " liquidViscosity { model Vogel; } }`, so the viscosity ratio"
                " the correction needs is unavailable, and the kinematic"
                " viscosity fell back to 1e-6 m2/s.", "provenance");
        if (hasStack)
        {
            //  A cross-check, not a derivation: the source states the channel
            //  footprint AND the effective area, and they are two facts.
            const scalar ratio = stk->areaPerCellPair_m2() / stk->channelFootprint_m2();
            if (stk->lengthDeclared() && (ratio < 0.95 || ratio > 1.05))
            {
                char b[300];
                std::snprintf(b, sizeof(b), "the declared active area per cell"
                    " pair (%.6g m2) and the channel footprint W*L (%.6g m2)"
                    " differ by %.1f %% -- they are two facts about one cell,"
                    " but that much apart usually means one of them is wrong",
                    static_cast<double>(stk->areaPerCellPair_m2()),
                    static_cast<double>(stk->channelFootprint_m2()),
                    static_cast<double>(100.0 * (ratio - 1.0)));
                say("record", b, "provenance");
            }
            //  THE CORRELATION'S OWN VALIDITY WINDOW.  It is EQUIPMENT DATA
            //  on the record, like every other validity window in this tree,
            //  and leaving it is ANNOUNCED rather than refused -- the posture
            //  of the extrapolated Antoine and the sub-band Davies.
            const EDSherwood& shw = stk->massTransfer();
            if (shw.hasReBand && lcModel == "GeraldesAfonso2010"
             && (Re_lc < shw.Re_lo || Re_lc > shw.Re_hi))
            {
                char b[300];
                std::snprintf(b, sizeof(b), "Re = %.2f is OUTSIDE the band"
                    " %.4g - %.4g the record's mass-transfer correlation was"
                    " fitted over -- k_c,eff, and therefore the limiting"
                    " current, is an EXTRAPOLATION here", static_cast<double>(Re_lc),
                    static_cast<double>(shw.Re_lo), static_cast<double>(shw.Re_hi));
                say("extrapolation", b, "model");
            }
            //  EVERY ESTIMATE THE RECORD CARRIES, ON EVERY RUN THAT READS IT
            //  (Vitor's ruling, 2026-09-15: an educated value with a note
            //  saying it must be verified, never silent).
            for (const auto& e : stk->estimates())
            {
                char v[64];
                std::snprintf(v, sizeof(v), "%.6g", static_cast<double>(e.value));
                if (verbosity >= 1)
                    std::cout << "  [estimate] stack '" << stk->name() << "': `"
                              << e.key << "` = " << v << " (SI) is an ESTIMATE,"
                              << " reviewStatus " << e.reviewStatus << " -- "
                              << e.notes << "\n";
                AdvisoryLog::instance().add("provenance", "warning",
                    "stack '" + stk->name() + "'",
                    "`" + e.key + "` = " + v + " (SI) is an ESTIMATE,"
                    " reviewStatus " + e.reviewStatus + " -- " + e.notes);
            }
        }
    }

    // ---- Stack voltage as a function of current I --------------------------
    // E_mem (per cell pair): CEM passes cations, AEM passes anions; each sees
    // the (concentrate/diluate) activity ratio of its counter-ion.  We take the
    // mean cation and mean anion activity ratio across the channels.
    //  ONE HOME (edCell::meanActivityRatio): the batch rig takes the same
    //  geometric mean over the same two channel states.
    const scalar rCat = edCell::meanActivityRatio(chD, chC, +1.0);
    const scalar rAn  = edCell::meanActivityRatio(chD, chC, -1.0);
    // Nernst potential of each membrane (counter-ion charge magnitude 1 for NaCl).
    const scalar E_cem = electrochem::nernst(+1.0, rCat, T);   // cation across CEM
    const scalar E_aem = electrochem::nernst(-1.0, 1.0 / rAn, T); // anion across AEM (a_conc/a_dil w/ z<0)
    const scalar E_mem_pair = E_cem + E_aem;                   // V per cell pair

    // Solution resistances per cell pair (one diluate + one concentrate channel):
    //   R_sol = thickness / (kappa * area)   [Ohm]   per channel
    const scalar R_dil  = edCell::solutionResistance(chD, h_ch, area);
    const scalar R_conc = edCell::solutionResistance(chC, h_ch, area);
    const scalar R_cem  = cem.R_area / area;     // Ohm
    const scalar R_aem  = aem.R_area / area;     // Ohm
    const scalar R_pair = R_cem + R_aem + R_dil + R_conc;   // Ohm per cell pair

    // U(I) = N (E_mem_pair + I * R_pair) + E_electrodes
    auto stackVoltage = [&](scalar I) -> scalar
    {
        return static_cast<scalar>(N) * (E_mem_pair + I * R_pair) + E_el;
    };

    // ---- Determine the current I -------------------------------------------
    // demineralisation per ion is set by Faraday: the diluate loses, per ion,
    //   dn_i = xi * I / (z_i F) * N   [mol/s]   (counter-ions; here the salt)
    // demin ratio = dn_salt / n_salt_in_diluate.
    // The diluate salt INFLOW [mol/s of equivalents removed basis]:
    //   n_in_i = F_dil[kmol/s]*1000 * (z_frac_i)   -- per ion mole flow.
    auto diluateIonInflow = [&](std::size_t compIdx) -> scalar
    {
        return dil.F * 1000.0 * dil.z[compIdx];   // mol/s
    };

    //  THE FARADAY SPLIT, ONE HOME (2026-09-19).  Every counter-ion in the
    //  diluate loses xi I N / (|z_i| F) mol/s, capped at what the diluate
    //  carries (announced when the cap binds).  It used to live inline after
    //  the current was fixed; the conductivity target needs the OUTLET
    //  composition inside its residual, so the arithmetic is a function now
    //  and the product streams are built from the same call -- never a
    //  second copy of the split.  Bit for bit the old loop.
    struct FaradaySplit
    {
        sVector   FzD, FzC;              // kmol/s per component, after transfer
        bool      capBound   = false;
        scalar    removedRef = 0.0, refInflow = 0.0;
        SpeciesId refIon;                // the FIRST cation in component order
    };
    auto faradaySplit = [&](scalar Icur) -> FaradaySplit
    {
        FaradaySplit s;
        s.FzD.assign(Ncomp, 0.0);
        s.FzC.assign(Ncomp, 0.0);
        for (std::size_t i = 0; i < Ncomp; ++i)
        {
            s.FzD[i] = dil.F * dil.z[i];     // kmol/s per component (diluate)
            s.FzC[i] = con.F * con.z[i];     // kmol/s per component (concentrate)
        }
        for (std::size_t k = 0; k < chD.ion.size(); ++k)
        {
            const std::size_t i = chD.compIdx[k];
            const scalar zmag    = std::abs(chD.z[k]);
            scalar dn = electrochem::faradayMolarRate(Icur, zmag, xi)
                      * static_cast<scalar>(N);            // mol/s for THIS ion
            const scalar avail = s.FzD[i] * 1000.0;        // mol/s present in diluate
            if (dn > avail) { dn = avail; s.capBound = true; }
            const scalar dn_kmol = dn / 1000.0;            // kmol/s
            s.FzD[i] -= dn_kmol;
            s.FzC[i] += dn_kmol;
            if (s.refIon.key.empty() && chD.z[k] > 0)
            { s.refIon = chD.ion[k]; s.removedRef = dn; s.refInflow = avail; }
        }
        return s;
    };
    //  Mole fractions from a per-component flow vector (the product streams
    //  and the outlet channel state are both built through this).
    auto moleFractions = [&](const sVector& Fz) -> sVector
    {
        scalar Ftot = 0.0; for (auto v : Fz) Ftot += v;
        sVector z(Ncomp, 0.0);
        if (Ftot > 0.0) for (std::size_t i = 0; i < Ncomp; ++i) z[i] = Fz[i] / Ftot;
        return z;
    };
    //  The diluate OUTLET's conductivity at a current: the split, then the
    //  SAME channel builder (Nernst-Einstein on the ion D0 tier, the
    //  dilute-carrier density) that priced the inlet -- one sentence for
    //  both ends of the channel.
    auto outletConductivity = [&](scalar Icur) -> scalar
    {
        const FaradaySplit s = faradaySplit(Icur);
        return edCell::buildChannel(type(), thermo, moleFractions(s.FzD),
                                    iWater, T, *act).kappa;
    };

    scalar I = 0.0;
    bool   solvedI = false;
    scalar kappa_out = 0.0, kappaRemoval = 0.0;   // filled on the conductivity form
    std::string solvedFor;                        // which target fixed I
    if (haveI)
    {
        I = op->lookupScalar("current");   // A (raw)
    }
    else if (haveKappa)
    {
        //  f(I) = (1 - kappa_out(I)/kappa_in) - target.  kappa_out is linear
        //  in I until a cap binds (the water carrier is untouched, so every
        //  molality falls in proportion to the moles removed), and it FALLS
        //  with I, so f rises monotonically -- the bracket posture of the
        //  demin form.  Order-INDEPENDENT: every ion contributes its own
        //  z^2 D0 c, and no ion is singled out as a reference.
        const scalar target = op->lookupScalar("targetConductivityRemoval");
        if (target <= 0.0 || target >= 1.0)
            throw std::runtime_error("electrodialysisStack '" + unitLabel
                + "': targetConductivityRemoval must be in (0, 1); got "
                + std::to_string(target));
        const scalar kappa_in = chD.kappa;
        if (!(kappa_in > 0.0))
            throw std::runtime_error("electrodialysisStack '" + unitLabel
                + "': the diluate feed has no conductivity to remove"
                  " (kappa_in = " + std::to_string(kappa_in) + " S/m)");
        auto f  = [&](scalar Icur) {
            return (1.0 - outletConductivity(Icur) / kappa_in) - target;
        };
        auto df = [&](scalar Icur) { const scalar d = 1e-3; return (f(Icur+d)-f(Icur-d))/(2*d); };
        solver::NROptions nro;
        nro.tolerance = 1e-8; nro.maxIter = 50;
        nro.lower = 0.0; nro.upper = 1e7; nro.bracket = true;
        nro.monotoneIncreasing = true;
        //  The seed is the LINEAR answer read off the same residual at a
        //  probe current (no second formula for the slope): exact until a
        //  cap binds, and the Newton is then a one-step confirmation the
        //  student can see.
        const scalar I_probe = 1.0;                                  // A
        const scalar drop    = kappa_in - outletConductivity(I_probe);   // S/m per A
        const scalar I0      = (drop > 0.0) ? target * kappa_in * I_probe / drop : 1.0;
        auto r = solver::newton1D(f, df, std::max(I0, 1e-3), nro);
        I = r.x; solvedI = true; solvedFor = "targetConductivityRemoval";
        recordResidual(std::abs(r.residual));
        kappa_out    = outletConductivity(I);
        kappaRemoval = 1.0 - kappa_out / kappa_in;
        if (verbosity >= 3)
            std::cout << "  [solve I] targetConductivityRemoval " << target
                      << "  ->  I = " << I << " A  (kappa_in = " << kappa_in
                      << " S/m, kappa_out = " << kappa_out << " S/m; Newton, "
                      << r.iterations << " it, residual " << std::scientific
                      << r.residual << std::fixed << "; seed " << I0
                      << " A from the linear slope at " << I_probe << " A)\n";
    }
    else
    {
        const scalar target = op->lookupScalar("targetDemin");
        if (target <= 0.0 || target >= 1.0)
            throw std::runtime_error("electrodialysisStack: targetDemin must be "
                "in (0, 1); got " + std::to_string(target));
        // Use the FIRST cation as the reference counter-ion for the demin target.
        SpeciesId refIon = chD.ion.front();
        std::size_t refK = 0;
        for (std::size_t k = 0; k < chD.ion.size(); ++k)
            if (chD.z[k] > 0) { refIon = chD.ion[k]; refK = k; break; }
        const scalar z_ref = static_cast<scalar>(electrolyte::ionCharge(refIon));
        const scalar n_in  = diluateIonInflow(chD.compIdx[refK]);   // mol/s
        // demin(I) = (xi I N)/(|z| F) / n_in - target = 0  (linear -> direct, but
        // solved via Newton-1D to KEEP the glass-box solver visible).
        auto f  = [&](scalar Icur) {
            const scalar removed = electrochem::faradayMolarRate(Icur, std::abs(z_ref), xi)
                                 * static_cast<scalar>(N);
            return removed / n_in - target;
        };
        auto df = [&](scalar Icur) { const scalar d = 1e-3; return (f(Icur+d)-f(Icur-d))/(2*d); };
        solver::NROptions nro;
        nro.tolerance = 1e-8; nro.maxIter = 50;
        nro.lower = 0.0; nro.upper = 1e7; nro.bracket = true;
        nro.monotoneIncreasing = true;
        const scalar I0 = std::abs(z_ref) * electrochem::Faraday * n_in * target
                        / (xi * std::max(1, N));
        auto r = solver::newton1D(f, df, std::max(I0, 1e-3), nro);
        I = r.x; solvedI = true; solvedFor = "targetDemin";
        recordResidual(std::abs(r.residual));
        if (verbosity >= 3)
            std::cout << "  [solve I] targetDemin " << target << " on ion " << refIon.key
                      << "  ->  I = " << I << " A  (Newton, " << r.iterations
                      << " it, residual " << std::scientific << r.residual
                      << std::fixed << ")\n";
    }
    if (I < 0.0)
        throw std::runtime_error("electrodialysisStack: current I must be >= 0");

    const scalar i_dens = I / area;        // A/m2 (current density)

    // ---- Faraday transfer: move ions diluate -> concentrate ----------------
    //  ONE call of the split above at the current now fixed; the product
    //  streams are re-mole-fractioned from it (water unchanged; F constant --
    //  ion transfer is mole-for-mole charge-balanced, water carrier dominates).
    products_.resize(2);
    ProcessStream& outD = products_[0];
    ProcessStream& outC = products_[1];
    outD.name = "diluate"; outC.name = "concentrate";
    outD.T = dil.T; outD.P = dil.P; outD.vf = dil.vf; outD.F = dil.F;
    outC.T = con.T; outC.P = con.P; outC.vf = con.vf; outC.F = con.F;
    const FaradaySplit split = faradaySplit(I);
    const bool   capBound   = split.capBound;
    const scalar removedRef = split.removedRef, refInflow = split.refInflow;
    const SpeciesId refIonSp = split.refIon;
    auto finalise = [&](ProcessStream& s, const sVector& Fz)
    {
        scalar Ftot = 0.0; for (auto v : Fz) Ftot += v;
        s.F = Ftot;
        s.z = moleFractions(Fz);
    };
    finalise(outD, split.FzD);
    finalise(outC, split.FzC);

    // ---- Stack voltage, power, efficiencies --------------------------------
    const scalar U = stackVoltage(I);
    const scalar W_electric = U * I;        // W
    const scalar overLimit  = (i_lim > 0.0) ? i_dens / i_lim : 0.0;

    // demin ratio (reference cation)
    const scalar demin = (refInflow > 0.0) ? removedRef / refInflow : 0.0;

    // current efficiency actually realised (counter-ion equivalents moved / charge)
    // ~ xi by construction unless capped; report the capped value.
    const scalar curEff = (I > 0.0)
        ? (removedRef * std::abs(static_cast<scalar>(electrolyte::ionCharge(
              refIonSp.key.empty() ? chD.ion.front() : refIonSp)))
           * electrochem::Faraday) / (I * static_cast<scalar>(N))
        : 0.0;

    // specific energy [kWh / m3 of diluate product].  Diluate volumetric flow ~
    // water molar flow * MW_water / rho.
    const scalar Fwater_kmol_s = outD.F * outD.z[iWater];      // kmol/s water in diluate
    const scalar Q_dil_m3_s = Fwater_kmol_s * 1000.0 * MW_WATER_KG / 1000.0; // m3/s
    const scalar specEnergy = (Q_dil_m3_s > 0.0)
        ? (W_electric / 1000.0) / (Q_dil_m3_s * 3600.0)        // kW / (m3/h) = kWh/m3
        : 0.0;

    // ---- Glass-box report --------------------------------------------------
    if (verbosity >= 3)
    {
        std::cout << "\n=====================  Electrodialysis Stack  ====================\n";
        std::cout << std::fixed;
        std::cout << "  Membrane pair:   " << memName << "  (CEM " << cem.name
                  << ", AEM " << aem.name << ")\n";
        std::cout << "  N cell pairs:    " << N << "\n";
        std::cout << "  Area per cell pair: " << std::setprecision(4) << area
                  << " m2   (what one cell pair presents to the current, and"
                     " what the current DENSITY is taken on)\n";
        std::cout << "  Current eff. xi: " << std::setprecision(3) << xi
                  << "   (ANNOUNCED default 0.9 unless set)\n";
        if (hasStack)
        {
            std::cout << "  Stack record:    " << stk->name() << "  ("
                      << stk->manufacturer() << ", " << stk->sourcePath() << ")\n";
            std::cout << "  Area (Vitor's rule: activeArea IS the cell-pair area):\n";
            std::cout << "      declared activeArea      " << std::setprecision(6)
                      << stk->activeArea_m2() << " m2  (the whole stack, per cell pair summed)\n";
            std::cout << "      -> per cell pair         " << stk->areaPerCellPair_m2()
                      << " m2   (activeArea / " << N << " cell pairs)\n";
            std::cout << "      -> per membrane KIND     " << stk->areaPerMembraneKind_m2()
                      << " m2   (that much CEM and that much AEM)\n";
            std::cout << "      -> total membrane area   " << stk->totalMembraneArea_m2()
                      << " m2   (2 x activeArea)\n";
            if (stk->lengthDeclared())
                std::cout << "      geometric footprint W*L  "
                          << stk->channelFootprint_m2()
                          << " m2   (a SECOND fact the source states, not a"
                             " derivative -- cross-checked, never used)\n";
            std::cout << "  Crossflow velocity, DERIVED from the diluate flow"
                         " (it is no longer declared):\n";
            std::cout << "      channels in parallel     " << std::setprecision(4)
                      << channelsPerPass << "   = " << N << " cell pairs / "
                      << stk->hydraulicPasses() << " hydraulic pass"
                      << (stk->hydraulicPasses() == 1 ? "" : "es") << "\n";
            std::cout << "      Q_diluate                " << std::scientific
                      << std::setprecision(5) << Q_dil_in << " m3/s   ("
                      << std::fixed << std::setprecision(2) << (Q_dil_in * 3.6e6)
                      << " L/h)\n";
            std::cout << "      u = Q/(n W h)            " << std::setprecision(6)
                      << u_superficial << " m/s  SUPERFICIAL (empty channel section "
                      << std::scientific << std::setprecision(5) << sectionEmpty
                      << " m2)\n" << std::fixed;
            std::cout << "      u/porosity               " << std::setprecision(6)
                      << u_interstitial << " m/s  interstitial (spacer porosity "
                      << std::setprecision(3) << stk->spacerPorosity() << ")\n";
            std::cout << "      channel length           " << std::setprecision(6)
                      << stk->channelLength_m() << " m   "
                      << (stk->lengthDeclared()
                            ? "(DECLARED by the source)"
                            : "(DERIVED: activeArea / (cellPairs x channelWidth)"
                              " -- the source states none)") << "\n";
            std::cout << "      flow path length         " << std::setprecision(4)
                      << pathLength << " m   = channelLength x passes\n";
            std::cout << "      spacer type              " << stk->spacerType()
                      << "   (DECLARED; no correlation selects on it today --"
                         " it is the fact the Sherwood fit belongs to)\n";
        }
        std::cout << "  Mass-transfer k: " << std::scientific << std::setprecision(3)
                  << k_c_eff << " m/s  (Sh=" << std::fixed << std::setprecision(4)
                  << Sh_lc << ", Re=" << Re_lc << ", Sc=" << Sc_lc
                  << ", D=" << std::scientific << D_eff << " m2/s)\n" << std::fixed;
        std::cout << "  Davies I (dil):  " << std::setprecision(4) << chD.I
                  << " mol/kg   kappa_dil = " << std::setprecision(4) << chD.kappa
                  << " S/m\n";
        std::cout << "  Davies I (con):  " << std::setprecision(4) << chC.I
                  << " mol/kg   kappa_con = " << std::setprecision(4) << chC.kappa
                  << " S/m\n";
        if (haveKappa)
            std::cout << "  kappa_dil OUT:   " << std::setprecision(4) << kappa_out
                      << " S/m   -> conductivity removal " << std::setprecision(2)
                      << (100.0 * kappaRemoval) << " %  (the target, met)\n";
        std::cout << "  --- potentials (per cell pair) ---\n";
        std::cout << "  E_mem  = " << std::setprecision(5) << E_mem_pair
                  << " V   (CEM " << E_cem << " + AEM " << E_aem
                  << ", from REAL Davies activities)\n";
        std::cout << "  R_pair = " << std::setprecision(5) << R_pair
                  << " Ohm   (CEM " << R_cem << " + AEM " << R_aem
                  << " + dil " << R_dil << " + conc " << R_conc << ")\n";
        std::cout << "  E_ohmic= " << std::setprecision(5) << (I * R_pair)
                  << " V  at I = " << std::setprecision(3) << I << " A\n";
        std::cout << "  E_electrodes (lumped, ANNOUNCED): " << std::setprecision(4)
                  << E_el << " V  (no Butler-Volmer in v1)\n";
        std::cout << "  --- current ---\n";
        std::cout << "  I        = " << std::setprecision(3) << I << " A"
                  << (solvedI ? "  (solved for " + solvedFor + ")" : "  (specified)") << "\n";
        std::cout << "  i (dens) = " << std::setprecision(2) << i_dens << " A/m2\n";
        std::cout << "  i_lim    = " << std::setprecision(2) << i_lim
                  << " A/m2  (model " << lcModel << ", "
                  << (lcDeclared ? "DECLARED" : "default") << "; set by "
                  << i_lim_setBy << ")\n";
        if (lcModel == "GeraldesAfonso2010")
        {
            std::cout << "  --- limiting current: Geraldes & Afonso, J. Membr. Sci."
                         " 360 (2010) 499-508 ---\n";
            std::cout << "  D_eff    = " << std::scientific << std::setprecision(5)
                      << D_eff << " m2/s   (Eq. A13, from the ion equivalent"
                         " fractions -- no salt decomposition)\n";
            std::cout << "  k_c,eff  = " << k_c_eff << " m/s   (Sh = "
                      << std::fixed << std::setprecision(4) << Sh_lc
                      << " = " << stk->massTransfer().a << " Re^"
                      << stk->massTransfer().b << " Sc^" << stk->massTransfer().c
                      << ", the stack record's OWN fit)\n";
            std::cout << "  delta    = D_eff/k_c,eff = " << std::scientific
                      << std::setprecision(4) << (D_eff / k_c_eff)
                      << " m   (Eq. 1, the film)\n" << std::fixed;
            std::cout << "  ionic diffusivities at " << std::setprecision(2) << T
                      << " K" << (muPriced
                          ? "  (D0(25 C) x Stokes-Einstein (T/298.15)(mu_ref/mu) = "
                          : "  (NO Stokes-Einstein correction, factor = ")
                      << std::setprecision(5) << seFactor << ")\n";
            for (const auto& io : lcIons)
                std::cout << "      " << std::setw(6) << io.name
                          << "  z " << std::setprecision(1) << io.z
                          << "   C " << std::setprecision(4) << io.C
                          << " mol/m3   D " << std::scientific << std::setprecision(4)
                          << io.D << " m2/s\n" << std::fixed;
            std::cout << "  limiting transport numbers (Eqs. 12/13; co-ions NULL"
                         " by the model's own assumption):\n";
            for (std::size_t k = 0; k < lcIons.size(); ++k)
                std::cout << "      " << std::setw(6) << lcIons[k].name
                          << "   CEM t_lim " << std::setprecision(5) << t_cem_lim[k]
                          << "   AEM t_lim " << t_aem_lim[k] << "\n";
            std::cout << "  i_lim (Eq. 15) CEM " << std::setprecision(2) << i_lim_cem
                      << " A/m2,  AEM " << i_lim_aem
                      << " A/m2  -> the LOWEST absolute value applies\n";
            if (haveEq16)
                std::cout << "  single salt: Eq. 16 gives " << std::setprecision(4)
                          << i_lim_eq16 << " A/m2 against Eq. 15's "
                          << i_lim_cem << " A/m2 -- the reduction, seen\n";
            std::cout << "  the membrane record DECLARES t_cu = " << std::setprecision(3)
                      << t_cu << " (CEM, 0.5 M NaCl); this model READS NONE of it"
                         " -- it takes the co-ion numbers as null and computes the"
                         " counter-ion ones above.  Neither value overrides the"
                         " other; both are printed.\n";
        }
        else
        {
            std::cout << "             (Cowan-Brown working form on the membrane"
                         " record's t_cu=" << std::setprecision(3) << t_cu
                      << ", t_co=" << t_co << ")\n";
        }
        std::cout << "  i/i_lim  = " << std::setprecision(3) << overLimit << "\n";
        std::cout << "  --- stack ---\n";
        std::cout << "  U        = " << std::setprecision(3) << U << " V\n";
        std::cout << "  P=U*I    = " << std::setprecision(3) << (W_electric/1000.0)
                  << " kW  (W_electric, on the energy wire)\n";
        std::cout << "  demin    = " << std::setprecision(4) << (100.0*demin)
                  << " %  (ion " << (refIonSp.key.empty()
                        ? chD.ion.front().key : refIonSp.key)
                  << ")\n";
        std::cout << "  spec.E   = " << std::setprecision(4) << specEnergy
                  << " kWh/m3 diluate\n";
        std::cout << "==================================================================\n";
    }

    // ---- LOUD warnings (no silent crutch / no silent clamp) ----------------
    if (overLimit > 1.0)
    {
        std::cerr << "[WARNING] electrodialysisStack: OVER-LIMITING CURRENT -- "
                  << "i = " << std::fixed << std::setprecision(2) << i_dens
                  << " A/m2 EXCEEDS i_lim = " << i_lim << " A/m2 (i/i_lim = "
                  << std::setprecision(3) << overLimit << ").  The diluate-side "
                     "boundary layer is ion-depleted: water splitting / pH swings "
                     "set in, current efficiency collapses and the membranes are "
                     "stressed.  Choupo does NOT clamp the current -- the result is "
                     "the unclamped Faraday transfer; reduce I (or raise the flow / "
                     "concentration) to run below the limiting current.\n";
    }
    if (capBound)
        std::cerr << "[WARNING] electrodialysisStack: the requested Faraday "
                     "transfer would remove MORE of an ion than the diluate feed "
                     "carries -- transfer was capped at the available inflow "
                     "(the diluate is fully demineralised for that ion).  Reduce "
                     "the current or N_cellpairs.\n";

    // ---- The stack's LIMITS, checked against THIS run ---------------------
    //  Announced as a departure from the source's stated limit, never
    //  refused: a student may drive a stack past its rating on purpose, and
    //  the run then says so in the log and the end-of-run caveat block.  A
    //  limit the record does not declare is ABSENT and is not checked.
    if (hasStack)
    {
        const EDStackLimits& lim = stk->limits();
        auto violate = [&](const std::string& what)
        {
            if (verbosity >= 1)
                std::cout << "  [limit] stack '" << stk->name() << "': " << what
                          << " -- the run continues outside the stated rating ("
                          << stk->source() << ")\n";
            AdvisoryLog::instance().add("rating", "warning",
                "stack '" + stk->name() + "'", what + " -- outside the stated"
                " rating, run continued");
        };
        char b[260];
        if (lim.hasI_max && i_dens > lim.i_max)
        {
            std::snprintf(b, sizeof(b), "current density %.2f A/m2 EXCEEDS the"
                " maximum %.2f A/m2", static_cast<double>(i_dens),
                static_cast<double>(lim.i_max));
            violate(b);
        }
        if (lim.hasT_max && T > lim.T_max)
        {
            std::snprintf(b, sizeof(b), "diluate T %.2f K EXCEEDS the maximum"
                " operating temperature %.2f K", static_cast<double>(T),
                static_cast<double>(lim.T_max));
            violate(b);
        }
        if (lim.hasFlow_max && Q_dil_in > lim.flow_max)
        {
            std::snprintf(b, sizeof(b), "diluate flow %.3f m3/h EXCEEDS the"
                " maximum %.3f m3/h", static_cast<double>(Q_dil_in * 3600.0),
                static_cast<double>(lim.flow_max * 3600.0));
            violate(b);
        }
    }

    // ---- KPIs --------------------------------------------------------------
    kpis_["U"]                        = U;
    kpis_["I"]                        = I;
    kpis_["i_density"]                = i_dens;
    kpis_["i_lim"]                    = i_lim;
    kpis_["i_over_ilim"]              = overLimit;
    kpis_["current_efficiency"]       = curEff;
    kpis_["specific_energy_kWh_per_m3"] = specEnergy;
    kpis_["demin_ratio"]              = demin;
    kpis_["N_cellpairs"]              = static_cast<scalar>(N);
    kpis_["W_electric"]               = W_electric;
    kpis_["W_electric_kW"]            = W_electric / 1000.0;
    kpis_["E_mem_pair"]               = E_mem_pair;
    kpis_["R_pair"]                   = R_pair;
    //  The conductivity form's own numbers, published ONLY on that form so no
    //  pre-existing golden gains an unpinned KPI (the module-record rule of
    //  2026-09-15): the two conductivities the target was taken on, and the
    //  removal achieved.
    if (haveKappa)
    {
        kpis_["kappa_dil_in_S_m"]     = chD.kappa;
        kpis_["kappa_dil_out_S_m"]    = kappa_out;
        kpis_["conductivityRemoval"]  = kappaRemoval;
    }
    //  The predictive route's own numbers, published ONLY on that route, so
    //  no pre-existing golden gains an unpinned KPI (the module-record rule
    //  of 2026-09-15).
    if (lcModel == "GeraldesAfonso2010")
    {
        kpis_["D_eff"]            = D_eff;
        kpis_["k_c_eff"]          = k_c_eff;
        kpis_["Sh"]               = Sh_lc;
        kpis_["Re"]               = Re_lc;
        kpis_["Sc"]               = Sc_lc;
        kpis_["u_superficial"]    = u_superficial;
        kpis_["u_interstitial"]   = u_interstitial;
        kpis_["i_lim_cem"]        = i_lim_cem;
        kpis_["i_lim_aem"]        = i_lim_aem;
        kpis_["film_thickness"]   = D_eff / k_c_eff;
        kpis_["stokesEinsteinFactor"] = seFactor;
        for (std::size_t k = 0; k < lcIons.size(); ++k)
        {
            //  The diffusivity the model ACTUALLY used, at the run temperature
            //  -- published, because it is the model's key derived input and a
            //  reader recomputing Eq. A13 by hand needs the same number.
            kpis_["D_ion_" + lcIons[k].name]     = lcIons[k].D;
            kpis_["C_ion_" + lcIons[k].name]     = lcIons[k].C;
            kpis_["t_lim_cem_" + lcIons[k].name] = t_cem_lim[k];
            kpis_["t_lim_aem_" + lcIons[k].name] = t_aem_lim[k];
        }
        if (haveEq16) kpis_["i_lim_eq16"] = i_lim_eq16;
    }

    return 0;
}

} // namespace Choupo
