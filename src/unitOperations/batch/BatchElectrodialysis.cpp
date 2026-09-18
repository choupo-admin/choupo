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
Class
    Choupo::BatchElectrodialysis

Description
    Implementation.  The model, what it claims and what it does NOT model
    are all in BatchElectrodialysis.H -- read that first.
\*---------------------------------------------------------------------------*/

#include "BatchElectrodialysis.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"
#include "streams/Composition.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrochem/EDStack.H"
#include "thermo/electrochem/EDStackRegistry.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "unitOperations/electrochem/Electrochem.H"
#include "unitOperations/electrochem/LimitingCurrent.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>

namespace Choupo {

BatchElectrodialysis::BatchElectrodialysis()  = default;
BatchElectrodialysis::~BatchElectrodialysis() = default;

const std::string& BatchElectrodialysis::type() const
{
    static const std::string t = "batchElectrodialysis";
    return t;
}

namespace {

//- The accepted `overLimiting { model <word>; }` words, in ONE place beside
//  the branches that read them (the 2026-09-07 rule: an if-chain whose else
//  is a catch-all silently selects the default).
const std::vector<std::string>& overLimitingModels()
{
    static const std::vector<std::string> w = { "none", "saltFluxPlateau" };
    return w;
}

} // namespace

// ---------------------------------------------------------------------------
//  initialise
// ---------------------------------------------------------------------------
void BatchElectrodialysis::initialise(const DictPtr&       unitDict,
                                      const ThermoPackage& thermo,
                                      const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t Nc = thermo.n();
    const std::string who = type() + " '" + name() + "'";

    compNames_.clear();
    MW_.assign(Nc, 0.0);
    for (std::size_t i = 0; i < Nc; ++i)
    {
        compNames_.push_back(thermo.comp(i).name());
        MW_[i] = thermo.comp(i).MW();
    }

    verbosity_ = thermoAnnounceLevel();
    if (unitDict->found("solver"))
        verbosity_ = static_cast<int>(
            unitDict->subDict("solver")->lookupScalarOrDefault("verbosity",
                                                               verbosity_));

    bool haveWater = false;
    for (std::size_t i = 0; i < Nc; ++i)
        if (compNames_[i] == "water") { iWater_ = i; haveWater = true; break; }
    if (!haveWater)
        throw std::runtime_error(who + ": no component named `water`."
            "  Electrodialysis needs an aqueous carrier; the molality closure"
            " and the conductivity are both built on it.");

    auto op = unitDict->subDict("operation");

    // ---- the stack record is REQUIRED ------------------------------------
    //  This unit has no legacy inline form to preserve.  The crossflow
    //  velocity that sets the mass-transfer coefficient -- and therefore the
    //  limiting current this whole unit exists to show falling -- needs the
    //  channel section, the spacer and the stack's OWN Sherwood correlation,
    //  and only a `kind edStack` record carries them.
    if (!op->found("stack"))
        throw std::runtime_error(who + ": `stack <name>;` is REQUIRED."
            "  A batch rig's limiting current is predicted from the diluate"
            " composition and the stack's own mass-transfer correlation"
            " (Geraldes & Afonso, J. Membr. Sci. 360 (2010) 499-508), and"
            " that correlation is equipment-and-spacer data that only a"
            " `kind edStack` record carries.  Name one (e.g."
            " `stack EUR2C-7P18;`); registered stacks are listed if the name"
            " is unknown.  There is no inline-geometry form here -- the"
            " steady `electrodialysisStack` keeps one for legacy cases.");
    stack_ = &EDStackRegistry::byName(op->lookupWord("stack"));

    //  ONE HOME, the steady unit's own list: a fact the record supplies may
    //  not be typed beside it.
    {
        std::vector<std::string> clash;
        for (const char* k : { "N_cellpairs", "membraneArea",
                               "channelThickness", "channelLength",
                               "linearVelocity", "hydraulicPasses",
                               "spacerPorosity" })
            if (op->found(k)) clash.push_back(k);
        if (stack_->namesMembranes() && op->found("membrane"))
            clash.push_back("membrane");
        if (!clash.empty())
        {
            std::string list;
            for (const auto& c : clash) list += " `" + c + "`";
            throw std::runtime_error(who + ": `stack " + stack_->name()
                + ";` supplies the membrane pair, the cell pairs, the active"
                  " area, the channel geometry and the hydraulic passes from"
                  " its record (" + stack_->sourcePath() + "), and the"
                  " operation ALSO declares" + list + " -- one home.  Remove"
                  " the inline value(s).  A crossflow VELOCITY is never a"
                  " value to keep: it is the DECLARED recirculation flow"
                  " (`diluateFlow`) divided by the channel section the record"
                  " describes, and the run prints that arithmetic.");
        }
    }

    N_    = stack_->cellPairs();
    area_ = stack_->areaPerCellPair_m2();
    hCh_  = stack_->channelHeight_m();

    if (stack_->namesMembranes())          membraneName_ = stack_->membranes();
    else if (op->found("membrane"))        membraneName_ = op->lookupWord("membrane");
    else
        throw std::runtime_error(who + ": the stack record '" + stack_->name()
            + "' names no membrane pair (its source does not state one), so"
              " the CASE must: declare `membrane <name>;` beside `stack "
            + stack_->name() + ";` (a `kind IEM` record in assets/, e.g."
              " CMX_AMX).  Neither side may guess a pair on the owner's"
              " behalf.");
    edCell::readIEMPair(type(), membraneName_, cem_, aem_);

    // ---- how the rig is driven: current XOR voltage -----------------------
    const bool haveI = op->found("current");
    const bool haveU = op->found("voltage");
    if (haveI == haveU)
        throw std::runtime_error(who + ": give EITHER `current <I> A;` (the"
            " rectifier held at constant current -- i is fixed while i_lim"
            " falls with the depleting diluate, so the run CROSSES into the"
            " over-limiting regime) OR `voltage <U> V;` (held at constant"
            " voltage -- the current is solved from the stack equation at"
            " every instant and DECAYS as the diluate loses conductivity)."
            "  Exactly one; they are two different experiments.");
    if (haveI) { drive_ = Drive::Current; IDeclared_ = op->lookupScalar("current"); }
    else       { drive_ = Drive::Voltage; UDeclared_ = op->lookupScalar("voltage"); }
    if (drive_ == Drive::Current && IDeclared_ < 0.0)
        throw std::runtime_error(who + ": `current` must be >= 0");
    if (drive_ == Drive::Voltage && UDeclared_ < 0.0)
        throw std::runtime_error(who + ": `voltage` must be >= 0");

    xi_ = op->lookupScalarOrDefault("xi", 0.9);
    if (xi_ <= 0.0 || xi_ > 1.0)
        throw std::runtime_error(who + ": xi (current efficiency) must be in"
            " (0, 1]; got " + std::to_string(xi_));
    E_electrodes_ = op->lookupScalarOrDefault("E_electrodes", 0.0);

    //  THE RECIRCULATION FLOW IS DECLARED, and it is NOT a second home.  The
    //  steady stack derives its crossflow velocity from the diluate stream's
    //  own flow; a batch rig has no such stream -- the pump setting IS an
    //  operating choice and nothing else in the case states it.  Only the
    //  DILUATE side is read: the limiting current is set by the depleting
    //  channel, and the concentrate's own velocity enters nothing this model
    //  computes.
    if (!op->found("diluateFlow"))
        throw std::runtime_error(who + ": `diluateFlow <Q> m3/h;` is REQUIRED."
            "  It is the rate at which the diluate tank is pumped through the"
            " stack, and it sets the crossflow velocity, hence the"
            " mass-transfer coefficient, hence the limiting current -- the"
            " number this unit exists to show falling.  A steady stack reads"
            " it off its inlet stream; a batch rig has no stream, so the pump"
            " setting is declared here and nowhere else.  (The concentrate"
            " recirculation rate is NOT read: it enters nothing this model"
            " computes.)");
    Qdil_ = op->lookupScalar("diluateFlow", Dims::volumetricFlow);
    if (Qdil_ <= 0.0)
        throw std::runtime_error(who + ": `diluateFlow` must be > 0");

    // ---- the limiting-current model --------------------------------------
    if (op->found("limitingCurrent"))
    {
        auto lc = op->subDict("limitingCurrent");
        const std::string w = lc->lookupWordOrDefault("model", "");
        bool known = false;
        for (const auto& a : edLimitingCurrent::acceptedModels())
            if (a == w) known = true;
        if (!known)
            throw std::runtime_error(who + " limitingCurrent: "
                + registryRefusal::message("limiting-current model", w,
                      edLimitingCurrent::acceptedModels(), "Accepted"));
        if (w != "GeraldesAfonso2010")
            throw std::runtime_error(who + ": `limitingCurrent { model " + w
                + "; }` is not available in a BATCH rig.  The CowanBrown"
                  " working form needs a DECLARED crossflow velocity and"
                  " channel length, both of which a `stack` record refuses"
                  " (one home), and it reads a counter-ion transport number"
                  " measured in a different solution -- a constant, where"
                  " this unit's entire subject is a limiting current that"
                  " MOVES with the depleting diluate.  Declare"
                  " `model GeraldesAfonso2010;`, or drop the block: it is the"
                  " only route here and is taken by default.");
    }

    // ---- the over-limiting regime: opt in, or be warned -------------------
    if (op->found("overLimiting"))
    {
        auto ol = op->subDict("overLimiting");
        const std::string w = ol->lookupWordOrDefault("model", "");
        bool known = false;
        for (const auto& a : overLimitingModels()) if (a == w) known = true;
        if (!known)
            throw std::runtime_error(who + " overLimiting: "
                + registryRefusal::message("over-limiting model", w,
                      overLimitingModels(), "Accepted"));
        overLimit_ = (w == "saltFluxPlateau") ? OverLimiting::SaltFluxPlateau
                                              : OverLimiting::None;
        overLimitDeclared_ = true;
    }

    // ---- the case's aqueous activity model, never this unit's -------------
    const auto& aqChem = thermo.aqueousChemistry();
    if (!aqChem.declared || aqChem.activityModel.empty())
        throw std::runtime_error(who + " refused: this rig needs aqueous"
            " activities (the Nernst membrane potential is a function of"
            " them) but the case declares no aqueous chemistry.  Add to"
            " constant/thermoPhysPropDict:\n"
            "    equilibrium { aqueous { activityModel { model davies; } } }\n"
            "(independent of `formulation` -- a rig that computes no phase"
            " equilibrium still HAS an aqueous solution).  No default is"
            " applied.");
    act_ = electrolyte::AqueousActivity::New(aqChem.activityModel);

    // ---- the two tanks, from 0/internalState ------------------------------
    auto init = unitDict->subDict("initial");
    state_.T  = init->lookupScalar("T");
    state_.P  = init->lookupScalar("P");
    state_.vf = 0.0;                       // both tanks are liquid

    const scalar nTotD = init->lookupScalar("totalMoles");
    const sVector xD   = readComposition(init, thermo, who + " diluate");
    state_.n.assign(Nc, 0.0);
    for (std::size_t i = 0; i < Nc; ++i) state_.n[i] = nTotD * xD[i];

    if (!init->found("concentrate"))
        throw std::runtime_error(who + ": the initial state declares no"
            " `concentrate {}` block.  A recirculating electrodialysis rig"
            " has TWO tanks and this unit holds both -- the diluate as its"
            " own state (the product) and the concentrate as internal state"
            " it publishes.  Declare, inside this unit's block of"
            " 0/internalState:\n"
            "    concentrate { totalMoles <kmol>; molarComposition { ... } }\n"
            "The concentrate's composition is what the Nernst membrane"
            " potential is a function of; it cannot be defaulted.");
    auto conc = init->subDict("concentrate");
    for (const char* k : { "T", "P" })
        if (conc->found(k))
            throw std::runtime_error(who + ": the `concentrate {}` block"
                " declares `" + std::string(k) + "`.  The rig is ISOTHERMAL"
                " at ONE temperature and pressure -- the block above this"
                " one -- because nothing here models a temperature difference"
                " between two tanks in the same water bath.  Remove it, or"
                " the case has two homes for one fact.");
    const scalar nTotC = conc->lookupScalar("totalMoles");
    const sVector xC   = readComposition(conc, thermo, who + " concentrate");
    nConc_.assign(Nc, 0.0);
    for (std::size_t i = 0; i < Nc; ++i) nConc_[i] = nTotC * xC[i];

    if (state_.totalMoles() <= 0.0 || nTotC <= 0.0)
        throw std::runtime_error(who + ": one of the two tanks is empty."
            "  Both the diluate and the concentrate carry an inventory from"
            " t = 0; a rig with an empty concentrate has no Nernst potential"
            " to compute and no tank for the salt to go to.");

    // ---- the solvent, resolved ONCE (the rig is isothermal) ---------------
    sVector xSolvent(Nc, 0.0);
    xSolvent[iWater_] = 1.0;
    if (thermo.hasLiquidViscosity())
    {
        const scalar mu    = thermo.viscosityLiquid(state_.T, xSolvent);
        const scalar muRef = thermo.viscosityLiquid(298.15, xSolvent);
        nu_       = mu / edCell::RHO_CARRIER;
        seFactor_ = (state_.T / 298.15) * (muRef / mu);
        muPriced_ = true;
    }

    // ---- exactly ONE cation and ONE anion ---------------------------------
    //  See the header: splitting the counter-ion current between several
    //  counter-ions is the membranes' SELECTIVITY, for which this tree
    //  carries no data, and the limiting transport numbers of Eqs. 12/13
    //  describe the film at the limit rather than that selectivity.
    const edCell::ChannelState ch0 =
        edCell::buildChannel(type(), thermo, fractions(state_.n), iWater_,
                             state_.T, *act_);
    {
        std::vector<std::string> cats, ans;
        for (std::size_t k = 0; k < ch0.ion.size(); ++k)
        {
            if (ch0.z[k] > 0.0)
            { cats.push_back(ch0.ion[k].key); iCation_ = ch0.compIdx[k];
              zCation_ = ch0.z[k]; cationName_ = ch0.ion[k].key; }
            else if (ch0.z[k] < 0.0)
            { ans.push_back(ch0.ion[k].key); iAnion_ = ch0.compIdx[k];
              zAnion_ = std::abs(ch0.z[k]); anionName_ = ch0.ion[k].key; }
        }
        auto list = [](const std::vector<std::string>& v)
        { std::string s; for (const auto& x : v) s += " " + x; return s; };
        if (cats.size() != 1 || ans.size() != 1)
            throw std::runtime_error(who + ": the diluate carries"
                + std::to_string(cats.size()) + " cation(s) ("+ list(cats)
                + " ) and " + std::to_string(ans.size()) + " anion(s) ("
                + list(ans) + " ), and this unit models a SINGLE SALT --"
                  " exactly one of each.  It is not a simplification for"
                  " convenience: how the counter-ion current divides between"
                  " two counter-ions is set by the MEMBRANES' selectivity"
                  " between them, and no `kind IEM` record in this tree"
                  " carries that.  The limiting transport numbers of"
                  " Eqs. 12/13 describe the FILM at the limiting current and"
                  " are a different quantity; using them as a split would"
                  " invent exactly the parameter the 2010 model exists to"
                  " remove.  The steady `electrodialysisStack` accepts a"
                  " multi-ionic feed for its limiting-current PREDICTION,"
                  " which needs no such split.");
    }

    n0D_ = state_.n;
    n0C_ = nConc_;
    V0dil_ = waterVolume(state_.n);
    state_.V = V0dil_;

    const Instant s0 = evaluate(state_.n, nConc_);
    I0_    = s0.I;
    iLim0_ = s0.lc.i_lim;

    // ---- announcements: nothing below changes a number --------------------
    auto say = [&](const char* tag, const std::string& msg, const char* cat)
    {
        if (verbosity_ >= 1)
            std::cout << "  [" << tag << "] " << who << ": " << msg << "\n";
        AdvisoryLog::instance().add(cat, "warning", who, msg);
    };

    if (!op->found("xi"))
        say("default", "the current efficiency `xi` was not declared and"
            " DEFAULTS to 0.9.  It fixes how much salt each coulomb moves,"
            " so every demineralisation number below scales with it.",
            "model");
    if (!muPriced_)
        say("legacy", "the ion diffusivities were used at their curated 25 C"
            " reference with NO Stokes-Einstein correction to the run"
            " temperature -- the case declares no `transport { liquid {"
            " viscosity { model Vogel; } } }`, so the viscosity ratio the"
            " correction needs is unavailable, and the kinematic viscosity"
            " fell back to 1e-6 m2/s.", "provenance");
    if (!overLimitDeclared_)
        say("default", "no `overLimiting {}` model is declared, so the"
            " current efficiency stays at xi for the whole run.  If i"
            " crosses i_lim the answer past that point is an EXTRAPOLATION of"
            " a model outside its validity -- the run says so when it"
            " happens.  `overLimiting { model saltFluxPlateau; }` freezes the"
            " counter-ion transfer at its limiting value instead, which"
            " introduces no parameter.", "model");
    say("approximation", "the rig is ISOTHERMAL: both tanks are held at the"
        " declared temperature and the Joule heat that would raise them is"
        " removed by no modelled duty.  Neither tank transports water"
        " (osmotic or electro-osmotic), and no salt diffuses back from the"
        " concentrate -- that would need a membrane salt permeability no"
        " `kind IEM` record carries.", "model");

    //  EVERY ESTIMATE THE RECORD CARRIES, ON EVERY RUN THAT READS IT
    //  (Vitor's ruling, 2026-09-15) -- the steady stack's own loop.
    for (const auto& e : stack_->estimates())
    {
        char v[64];
        std::snprintf(v, sizeof(v), "%.6g", static_cast<double>(e.value));
        if (verbosity_ >= 1)
            std::cout << "  [estimate] stack '" << stack_->name() << "': `"
                      << e.key << "` = " << v << " (SI) is an ESTIMATE,"
                      << " reviewStatus " << e.reviewStatus << " -- "
                      << e.notes << "\n";
        AdvisoryLog::instance().add("provenance", "warning",
            "stack '" + stack_->name() + "'",
            "`" + e.key + "` = " + v + " (SI) is an ESTIMATE, reviewStatus "
            + e.reviewStatus + " -- " + e.notes);
    }

    //  The record's own Reynolds band, and its limits, against THIS run's
    //  starting point.  Announced, never refused (the extrapolated Antoine
    //  posture); a depleting diluate does not change Re, so the band is a
    //  property of the declared flow and is checked once.
    {
        const EDSherwood& shw = stack_->massTransfer();
        if (shw.hasReBand && (s0.lc.Re < shw.Re_lo || s0.lc.Re > shw.Re_hi))
        {
            char b[300];
            std::snprintf(b, sizeof(b), "Re = %.2f is OUTSIDE the band %.4g -"
                " %.4g the record's mass-transfer correlation was fitted over"
                " -- k_c,eff, and therefore the limiting current, is an"
                " EXTRAPOLATION here", static_cast<double>(s0.lc.Re),
                static_cast<double>(shw.Re_lo), static_cast<double>(shw.Re_hi));
            say("extrapolation", b, "model");
        }
        const EDStackLimits& lim = stack_->limits();
        char b[300];
        if (lim.hasI_max && s0.i_dens > lim.i_max)
        {
            std::snprintf(b, sizeof(b), "current density %.2f A/m2 EXCEEDS the"
                " stack's stated maximum %.2f A/m2 -- the run continues"
                " outside the rating (%s)", static_cast<double>(s0.i_dens),
                static_cast<double>(lim.i_max), stack_->source().c_str());
            say("limit", b, "rating");
        }
        if (lim.hasT_max && state_.T > lim.T_max)
        {
            std::snprintf(b, sizeof(b), "tank T %.2f K EXCEEDS the stack's"
                " stated maximum operating temperature %.2f K -- the run"
                " continues outside the rating (%s)",
                static_cast<double>(state_.T),
                static_cast<double>(lim.T_max), stack_->source().c_str());
            say("limit", b, "rating");
        }
        if (lim.hasFlow_max && Qdil_ > lim.flow_max)
        {
            std::snprintf(b, sizeof(b), "diluate recirculation %.3f m3/h"
                " EXCEEDS the stack's stated maximum %.3f m3/h -- the run"
                " continues outside the rating (%s)",
                static_cast<double>(Qdil_ * 3600.0),
                static_cast<double>(lim.flow_max * 3600.0),
                stack_->source().c_str());
            say("limit", b, "rating");
        }
    }

    if (verbosity_ >= 2)
    {
        std::cout << "\n=== batchElectrodialysis '" << name() << "' ===\n"
                  << "  stack        " << stack_->name() << "  ("
                  << stack_->manufacturer() << ", " << stack_->sourcePath()
                  << ")\n"
                  << "  membranes    " << membraneName_ << "  (CEM "
                  << cem_.name << ", AEM " << aem_.name << ")\n"
                  << "  cell pairs   " << N_ << "   area/pair "
                  << std::scientific << std::setprecision(4) << area_
                  << " m2   channel h " << hCh_ << " m\n" << std::defaultfloat
                  << "  salt         " << cationName_ << " (z " << zCation_
                  << ") / " << anionName_ << " (z -" << zAnion_ << ")\n"
                  << "  drive        "
                  << (drive_ == Drive::Current
                        ? "CONSTANT CURRENT " + std::to_string(IDeclared_) + " A"
                          "  (i is fixed; i_lim falls with the diluate)"
                        : "CONSTANT VOLTAGE " + std::to_string(UDeclared_) + " V"
                          "  (I is solved every instant and decays)")
                  << "\n"
                  << "  xi           " << std::fixed << std::setprecision(3)
                  << xi_ << "   E_electrodes " << E_electrodes_ << " V\n"
                  << "  overLimiting "
                  << (overLimit_ == OverLimiting::SaltFluxPlateau
                        ? "saltFluxPlateau  (xi_eff = xi min(1, i_lim/i))"
                        : "none  (xi_eff = xi throughout; a crossing is an"
                          " extrapolation and is announced)")
                  << "\n"
                  << "  crossflow, DERIVED from the declared recirculation:\n"
                  << "      Q_diluate            " << std::scientific
                  << std::setprecision(5) << Qdil_ << " m3/s   ("
                  << std::fixed << std::setprecision(2) << (Qdil_ * 3.6e6)
                  << " L/h)\n"
                  << "      channels in parallel " << std::setprecision(4)
                  << s0.lc.channelsPerPass << "   = " << N_
                  << " cell pairs / " << stack_->hydraulicPasses()
                  << " hydraulic pass"
                  << (stack_->hydraulicPasses() == 1 ? "" : "es") << "\n"
                  << "      u = Q/(n W h)        " << std::setprecision(6)
                  << s0.lc.u_superficial << " m/s  SUPERFICIAL (empty section "
                  << std::scientific << std::setprecision(5)
                  << s0.lc.sectionEmpty << " m2)\n" << std::fixed
                  << "  t = 0:  I " << std::setprecision(4) << s0.I
                  << " A   i " << std::setprecision(2) << s0.i_dens
                  << " A/m2   i_lim " << s0.lc.i_lim << " A/m2   i/i_lim "
                  << std::setprecision(4) << s0.iOverLim << "   U "
                  << std::setprecision(4) << s0.U << " V\n"
                  << "          k_c,eff " << std::scientific
                  << std::setprecision(4) << s0.lc.k_c_eff << " m/s   D_eff "
                  << s0.lc.D_eff << " m2/s   Sh " << std::fixed
                  << std::setprecision(4) << s0.lc.Sh << "  Re " << s0.lc.Re
                  << "  Sc " << s0.lc.Sc << "\n" << std::defaultfloat;
    }
}

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------
sVector BatchElectrodialysis::fractions(const sVector& n) const
{
    const std::size_t Nc = n.size();
    sVector x(Nc, 0.0);
    scalar tot = 0.0;
    for (auto v : n) tot += std::max(v, 0.0);
    if (tot > 0.0)
        for (std::size_t i = 0; i < Nc; ++i) x[i] = std::max(n[i], 0.0) / tot;
    return x;
}

//  The tank volume on the DILUTE-CARRIER density the whole unit is built on
//  (edCell::RHO_CARRIER): the water alone, which is exactly the basis the
//  molalities -- and therefore the concentrations, the conductivity and the
//  limiting current -- are closed on.  One conversion, one basis.
scalar BatchElectrodialysis::waterVolume(const sVector& n) const
{
    return n[iWater_] * 1000.0 * edCell::MW_WATER_KG / edCell::RHO_CARRIER;
}

// ---------------------------------------------------------------------------
//  the rig at one instant
// ---------------------------------------------------------------------------
BatchElectrodialysis::Instant
BatchElectrodialysis::evaluate(const sVector& nD, const sVector& nC) const
{
    Instant s;
    s.chD = edCell::buildChannel(type(), *thermo_, fractions(nD), iWater_,
                                 state_.T, *act_);
    s.chC = edCell::buildChannel(type(), *thermo_, fractions(nC), iWater_,
                                 state_.T, *act_);
    s.lc  = edCell::predictiveLimitingCurrent(*stack_, s.chD, Qdil_, nu_,
                                              seFactor_);

    //  The Nernst membrane potential, per cell pair, on REAL activities --
    //  each membrane sees the concentrate/diluate ratio of its COUNTER-ion,
    //  at that ion's own charge.
    const scalar rCat = edCell::meanActivityRatio(s.chD, s.chC, +1.0);
    const scalar rAn  = edCell::meanActivityRatio(s.chD, s.chC, -1.0);
    s.E_cem = electrochem::nernst(+zCation_, rCat, state_.T);
    s.E_aem = electrochem::nernst(-zAnion_, 1.0 / rAn, state_.T);
    s.E_mem_pair = s.E_cem + s.E_aem;

    s.R_dil  = edCell::solutionResistance(s.chD, hCh_, area_);
    s.R_conc = edCell::solutionResistance(s.chC, hCh_, area_);
    s.R_pair = cem_.R_area / area_ + aem_.R_area / area_ + s.R_dil + s.R_conc;

    if (drive_ == Drive::Current)
        s.I = IDeclared_;
    else
    {
        //  U = N (E_mem + I R_pair) + E_electrodes, solved for I.  A stack
        //  whose back-EMF already exceeds the applied voltage passes NO
        //  current -- the rectifier does not drive it backwards -- so the
        //  result is floored at zero rather than going negative.
        const scalar denom = static_cast<scalar>(N_) * s.R_pair;
        s.I = (denom > 0.0)
            ? std::max((UDeclared_ - E_electrodes_
                        - static_cast<scalar>(N_) * s.E_mem_pair) / denom, 0.0)
            : 0.0;
    }
    s.U      = static_cast<scalar>(N_) * (s.E_mem_pair + s.I * s.R_pair)
             + E_electrodes_;
    s.i_dens = s.I / area_;
    s.iOverLim = (s.lc.i_lim > 0.0) ? s.i_dens / s.lc.i_lim : 0.0;

    //  THE OVER-LIMITING PLATEAU (opt in).  At i = i_lim the film delivers
    //  the counter-ion as fast as it can; a larger current is carried by the
    //  water-splitting products, not by salt.  No new parameter.
    s.xiEff = (overLimit_ == OverLimiting::SaltFluxPlateau && s.iOverLim > 1.0)
            ? xi_ / s.iOverLim : xi_;

    //  Faraday, per counter-ion, summed over the cell pairs; kmol/s.
    const scalar NN = static_cast<scalar>(N_);
    s.rCation = electrochem::faradayMolarRate(s.I, zCation_, s.xiEff) * NN * 1e-3;
    s.rAnion  = electrochem::faradayMolarRate(s.I, zAnion_,  s.xiEff) * NN * 1e-3;

    //  NO SILENT CLAMP, and no silent creation either: a tank cannot give up
    //  an ion it no longer has.  The cut is applied to the SAME number on
    //  both sides of the membrane, so the pair's total is conserved exactly.
    if (nD[iCation_] <= 0.0) { s.rCation = 0.0; s.capped = true; }
    if (nD[iAnion_]  <= 0.0) { s.rAnion  = 0.0; s.capped = true; }
    return s;
}

// ---------------------------------------------------------------------------
//  the packed ODE:  Y = [ n_diluate..., n_concentrate..., W_elec ]
// ---------------------------------------------------------------------------
sVector BatchElectrodialysis::odeState() const
{
    sVector y = state_.n;
    y.insert(y.end(), nConc_.begin(), nConc_.end());
    y.push_back(W_elec_kJ_);
    return y;
}

std::size_t BatchElectrodialysis::odeNPositive() const
{
    //  Every mole number in both tanks, and the cumulative electrical work:
    //  all monotone in the physics and all meaningless below zero.
    return 2 * state_.n.size() + 1;
}

void BatchElectrodialysis::setOdeState(const sVector& y)
{
    const std::size_t Nc = state_.n.size();
    for (std::size_t i = 0; i < Nc; ++i) state_.n[i] = y[i];
    for (std::size_t i = 0; i < Nc; ++i) nConc_[i]   = y[Nc + i];
    W_elec_kJ_ = y[2 * Nc];
    state_.V   = waterVolume(state_.n);
}

sVector BatchElectrodialysis::odeDerivative(const sVector& y) const
{
    const std::size_t Nc = state_.n.size();
    sVector nD(y.begin(), y.begin() + static_cast<long>(Nc));
    sVector nC(y.begin() + static_cast<long>(Nc),
               y.begin() + static_cast<long>(2 * Nc));
    const Instant s = evaluate(nD, nC);

    sVector d(2 * Nc + 1, 0.0);
    //  ONE number, two signs.  The rig is closed, so anything else would be
    //  a leak the campaign balance is right to report.
    d[iCation_]          = -s.rCation;
    d[Nc + iCation_]     = +s.rCation;
    d[iAnion_]           = -s.rAnion;
    d[Nc + iAnion_]      = +s.rAnion;
    //  The electrical work as an INTEGRATED STATE, so every reader of it
    //  agrees with the state the integrator accepted (the diafilter's
    //  permeated-volume lesson).  W -> kJ/s.
    d[2 * Nc] = s.U * s.I * 1.0e-3;
    return d;
}

void BatchElectrodialysis::step(scalar /*t*/, scalar dt)
{
    //  The FIXED-step path (`timeStepping fixed`), and it is RK4 -- what the
    //  driver's own banner says the fixed path is.  Classical four-stage
    //  Runge-Kutta on the packed state, with NO clamping anywhere: clamping
    //  one row of a conserved pair would fabricate or destroy salt, and the
    //  derivative already refuses to draw on an exhausted tank.  Each stage
    //  writes the SAME number with opposite signs into the two tanks, so
    //  every linear combination of stages conserves the pair exactly.
    const sVector y0 = odeState();
    const std::size_t n = y0.size();
    auto axpy = [&](const sVector& d, scalar a)
    {
        sVector y(n);
        for (std::size_t i = 0; i < n; ++i) y[i] = y0[i] + a * d[i];
        return y;
    };
    const sVector k1 = odeDerivative(y0);
    const sVector k2 = odeDerivative(axpy(k1, 0.5 * dt));
    const sVector k3 = odeDerivative(axpy(k2, 0.5 * dt));
    const sVector k4 = odeDerivative(axpy(k3, dt));
    sVector next(n);
    for (std::size_t i = 0; i < n; ++i)
        next[i] = y0[i] + (dt / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
    setOdeState(next);
}

// ---------------------------------------------------------------------------
//  the closed rig: BOTH tanks are the inventory
// ---------------------------------------------------------------------------
sVector BatchElectrodialysis::materialInventory() const
{
    sVector s = state_.n;
    for (std::size_t i = 0; i < s.size() && i < nConc_.size(); ++i)
        s[i] += nConc_[i];
    return s;
}

sVector BatchElectrodialysis::cycleState() const
{
    sVector s = state_.n;
    s.insert(s.end(), nConc_.begin(), nConc_.end());
    s.push_back(state_.T);
    return s;
}

// ---------------------------------------------------------------------------
//  the crossing, recorded at the ACCEPTED state and announced once
// ---------------------------------------------------------------------------
void BatchElectrodialysis::noteTimeAdvanced(scalar t)
{
    tNow_ = t;
    const Instant s = evaluate(state_.n, nConc_);

    if (tCross_ < 0.0 && s.iOverLim >= 1.0)
    {
        tCross_ = t;
        std::ostringstream m;
        m << std::fixed << std::setprecision(2)
          << "OVER-LIMITING CURRENT at t = " << t << " s: i = " << s.i_dens
          << " A/m2 now EXCEEDS i_lim = " << s.lc.i_lim << " A/m2, which has"
             " fallen from " << iLim0_ << " A/m2 at t = 0 because the diluate"
             " is depleting.  The diluate-side boundary layer is ion-depleted:"
             " water splitting and pH swings set in and the membranes are"
             " stressed.  ";
        m << (overLimit_ == OverLimiting::SaltFluxPlateau
                ? "`overLimiting { model saltFluxPlateau; }` is declared, so"
                  " the counter-ion transfer is held at its limiting value"
                  " from here and the current efficiency falls as xi i_lim/i."
                : "NO `overLimiting {}` model is declared, so the current"
                  " efficiency stays at xi from here -- the answer past this"
                  " instant is an EXTRAPOLATION of a model outside its"
                  " validity.");
        m << "  The current is NOT clamped either way.";
        if (!announcedCross_)
        {
            announcedCross_ = true;
            std::cerr << "[WARNING] " << type() << " '" << name() << "': "
                      << m.str() << "\n";
            AdvisoryLog::instance().add("model", "warning",
                type() + " '" + name() + "'", m.str());
        }
    }

    if (s.capped && !announcedCap_)
    {
        announcedCap_ = true;
        const std::string msg = "the diluate ran OUT of a counter-ion: the"
            " Faraday transfer of that ion stopped rather than going"
            " negative, so the current is no longer moving the salt it is"
            " charged for.  The run continues and is past the operation this"
            " model describes.";
        std::cerr << "[WARNING] " << type() << " '" << name() << "': "
                  << msg << "\n";
        AdvisoryLog::instance().add("model", "warning",
            type() + " '" + name() + "'", msg);
    }
}

std::vector<SimulationResult::TimelineEvent>
BatchElectrodialysis::statusEvents() const
{
    if (tCross_ < 0.0) return {};
    std::ostringstream d;
    d << name() << ": i reached i_lim (the limiting current has fallen with"
         " the depleting diluate) -- the run enters the over-limiting regime";
    return { { tCross_, "status", "overLimitingReached", d.str(), "",
               name(), "" } };
}

// ---------------------------------------------------------------------------
//  what the run publishes
// ---------------------------------------------------------------------------
std::vector<std::pair<std::string, scalar>>
BatchElectrodialysis::trajectoryExtras() const
{
    const Instant s = evaluate(state_.n, nConc_);
    std::vector<std::pair<std::string, scalar>> x;
    x.emplace_back("I_A",            s.I);
    x.emplace_back("U_V",            s.U);
    x.emplace_back("i_A_per_m2",     s.i_dens);
    x.emplace_back("i_lim_A_per_m2", s.lc.i_lim);
    x.emplace_back("i_over_ilim",    s.iOverLim);
    x.emplace_back("xi_eff",         s.xiEff);
    x.emplace_back("E_mem_pair_V",   s.E_mem_pair);
    x.emplace_back("R_pair_ohm",     s.R_pair);
    x.emplace_back("P_electric_kW",  s.U * s.I * 1.0e-3);
    x.emplace_back("W_electric_kJ",  W_elec_kJ_);
    x.emplace_back("kappa_dil_S_per_m",  s.chD.kappa);
    x.emplace_back("kappa_conc_S_per_m", s.chC.kappa);
    //  Molality is the basis every number above is closed on, so it is the
    //  basis published beside them.
    for (std::size_t k = 0; k < s.chD.ion.size(); ++k)
        x.emplace_back("m_dil_" + s.chD.ion[k].key, s.chD.m[k]);
    for (std::size_t k = 0; k < s.chC.ion.size(); ++k)
        x.emplace_back("m_conc_" + s.chC.ion[k].key, s.chC.m[k]);
    //  The CONCENTRATE tank's own inventory: it is internal state, so it is
    //  published in full rather than inferred from the diluate.
    for (std::size_t i = 0; i < nConc_.size(); ++i)
        x.emplace_back("n_conc_" + compNames_[i], nConc_[i]);

    //  THE COMPARISON, at every instant: what the vessel did, against the
    //  straight line Faraday's law gives at the INITIAL current.
    const scalar actual = (n0D_[iCation_] > 0.0)
        ? 1.0 - state_.n[iCation_] / n0D_[iCation_] : 0.0;
    const scalar removedIdeal = xi_ * I0_ * static_cast<scalar>(N_) * tNow_
                              / (zCation_ * electrochem::Faraday) * 1.0e-3;
    const scalar ideal = (n0D_[iCation_] > 0.0)
        ? std::min(removedIdeal / n0D_[iCation_], 1.0) : 0.0;
    x.emplace_back("deminActual", actual);
    x.emplace_back("deminIdeal",  ideal);
    return x;
}

std::map<std::string, scalar> BatchElectrodialysis::kpis() const
{
    const Instant s = evaluate(state_.n, nConc_);
    std::map<std::string, scalar> k;

    k["I_initial"]        = I0_;
    k["I_final"]          = s.I;
    k["U_final"]          = s.U;
    k["i_density_final"]  = s.i_dens;
    k["i_lim_initial"]    = iLim0_;
    k["i_lim_final"]      = s.lc.i_lim;
    k["i_over_ilim_initial"] = (iLim0_ > 0.0) ? (I0_ / area_) / iLim0_ : 0.0;
    k["i_over_ilim_final"]   = s.iOverLim;
    k["xi_eff_final"]     = s.xiEff;
    k["N_cellpairs"]      = static_cast<scalar>(N_);
    k["R_pair_final"]     = s.R_pair;
    k["E_mem_pair_final"] = s.E_mem_pair;
    k["kappa_dil_final"]  = s.chD.kappa;
    k["kappa_conc_final"] = s.chC.kappa;

    //  THE MODEL'S OWN DERIVED INPUTS, published because a reader
    //  recomputing Eq. 15 by hand needs exactly these numbers -- the same
    //  ones the steady stack publishes, from the same call.  On a single
    //  salt D_eff is composition-independent, so with the flow declared
    //  Sh, Re, Sc and k_c,eff are constants of the run and i_lim is
    //  proportional to the diluate concentration alone.
    k["D_eff"]            = s.lc.D_eff;
    k["k_c_eff"]          = s.lc.k_c_eff;
    k["Sh"]               = s.lc.Sh;
    k["Re"]               = s.lc.Re;
    k["Sc"]               = s.lc.Sc;
    k["u_superficial"]    = s.lc.u_superficial;
    k["film_thickness"]   = (s.lc.k_c_eff > 0.0) ? s.lc.D_eff / s.lc.k_c_eff : 0.0;

    //  The crossing, as a number a golden can pin.  -1 is "never", which is
    //  a fact about the run and not a missing value.
    k["overLimitingReached"] = (tCross_ >= 0.0) ? 1.0 : 0.0;
    k["t_overLimiting_s"]    = tCross_;

    const scalar nD = state_.n[iCation_], nC = nConc_[iCation_];
    k["demin_actual"] = (n0D_[iCation_] > 0.0)
                      ? 1.0 - nD / n0D_[iCation_] : 0.0;
    //  THE HAND CALCULATION, evaluated from THIS run's own initial current,
    //  its own inventory and its own declared xi -- never declared, so the
    //  gap between the two cannot have been arranged.
    const scalar removedIdeal = xi_ * I0_ * static_cast<scalar>(N_) * tNow_
                              / (zCation_ * electrochem::Faraday) * 1.0e-3;
    k["demin_ideal"] = (n0D_[iCation_] > 0.0)
                     ? std::min(removedIdeal / n0D_[iCation_], 1.0) : 0.0;
    //  The time the straight line says the diluate is empty.  A real rig
    //  never gets there; the number is what the hand calculation promises.
    k["t_idealComplete_s"] = (I0_ > 0.0)
        ? n0D_[iCation_] * 1.0e3 * zCation_ * electrochem::Faraday
          / (xi_ * I0_ * static_cast<scalar>(N_)) : 0.0;

    k["m_dil_final"]  = (state_.n[iWater_] > 0.0)
        ? nD / (state_.n[iWater_] * edCell::MW_WATER_KG) : 0.0;
    k["m_conc_final"] = (nConc_[iWater_] > 0.0)
        ? nC / (nConc_[iWater_] * edCell::MW_WATER_KG) : 0.0;
    k["concentrationFactor"] = (n0C_[iCation_] > 0.0)
                             ? nC / n0C_[iCation_] : 0.0;

    k["energy_electric_kJ"] = W_elec_kJ_;
    //  kWh per m3 of diluate TREATED (the tank's own starting volume): the
    //  figure of merit a desalination rig is quoted on.
    k["specificEnergy_kWh_per_m3"] = (V0dil_ > 0.0)
        ? (W_elec_kJ_ / 3600.0) / V0dil_ : 0.0;
    k["t_end_s"] = tNow_;
    return k;
}

// ---------------------------------------------------------------------------
//  energy: the work is integrated, the first law is NOT claimed
// ---------------------------------------------------------------------------
std::string BatchElectrodialysis::energyLedgerGap() const
{
    //  NOT a placeholder.  The electrical work IS known exactly (it is an
    //  integrated state row, published as `energy_electric_kJ`).  What is
    //  missing is its destination: almost all of it becomes Joule heat, and
    //  holding both tanks at the declared temperature therefore needs a
    //  cooling duty this rig does not have -- no jacket, no coil, no
    //  declared service.  Setting that duty equal to the electrical work
    //  would close the balance BY CONSTRUCTION and measure nothing, which is
    //  the plug this project refuses.  So the campaign says UNAVAILABLE and
    //  names why.
    return "batchElectrodialysis '" + name() + "': the electrical work is"
           " integrated exactly (energy_electric_kJ) but the HEAT it becomes"
           " is not.  The rig is declared ISOTHERMAL and carries no cooling"
           " duty, so the first law cannot be closed without setting the heat"
           " removed equal to the work put in -- which would close it by"
           " construction and measure nothing.  The two recirculation pumps"
           " are likewise unmodelled shaft work.  The MATERIAL balance is"
           " exact (the rig is closed); the campaign energy balance is"
           " UNAVAILABLE until the rig is given a thermal boundary.";
}

} // namespace Choupo
