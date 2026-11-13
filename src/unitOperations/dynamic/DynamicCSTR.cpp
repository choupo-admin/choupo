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

#include "DynamicCSTR.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "streams/Composition.H"
#include "unitOperations/reactor/ReactionHeat.H"
#include "unitOperations/reactor/CatalystPellet.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/reaction/Reaction.H"

#include "core/RegistryRefusal.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include "thermo/heatCapacity/HeatCapacityModel.H"

namespace Choupo {

namespace VVH = VariableVolumeHoldup;

void DynamicCSTR::initialise(const DictPtr&        unitDict,
                             const ThermoPackage&  thermo,
                             const DictPtr&        reactionsDict)
{
    thermo_ = &thermo;
    const std::size_t N = thermo.n();

    // ---- Initial state ------------------------------------------------
    auto initDict = unitDict->subDict("initial");
    T_  = initDict->lookupScalar("T");

    // ---- THE VOLUME MODE (C205 slice 2) -------------------------------------
    //  `operation { volumeMode constant|variable; }`.  Absent = constant, the
    //  historical vessel, byte-identical.  A word nobody reads refuses by name.
    {
        const std::string vm = unitDict->subDict("operation")
                                   ->lookupWordOrDefault("volumeMode", "constant");
        if (vm == "variable")      variableVolume_ = true;
        else if (vm == "constant") variableVolume_ = false;
        else
            throw std::runtime_error("DynamicCSTR '" + name_ + "': volumeMode '"
                + vm + "' is not one this vessel reads -- the two are `constant`"
                " (V fixed, F_out = F_in; the default) and `variable` (the"
                " liquid inventory is a state with a level)");
    }
    const std::string whoVV = "dynamicCSTR '" + name_ + "'";

    if (!variableVolume_)
    {
        P_  = initDict->lookupScalarOrDefault("P", 1.0);
        V_  = initDict->lookupScalar("V");
        const scalar nTot = initDict->lookupScalar("totalMoles");

        const sVector x = readComposition(initDict, thermo,
            "DynamicCSTR '" + name_ + "' init");
        n_.assign(N, 0.0);
        for (std::size_t i = 0; i < N; ++i) n_[i] = nTot * x[i];
    }
    else
    {
        //  The inventory is the state; the volume is DERIVED from it on the
        //  case's package.  P is the pressure over the liquid, in Pa.
        P_ = initDict->lookupScalarOrDefault("P", 101325.0);
        auto op = unitDict->subDict("operation");
        geom_ = VVH::VerticalCylinder::read(
            op->found("geometry") ? op->subDict("geometry") : nullptr, whoVV);

        if (!op->found("outflow"))
            throw std::runtime_error(whoVV + ": volumeMode variable needs an"
                " `outflow {}` -- the outflow is DECLARED: `mode flow; F ..;`"
                " (a manipulated flow) or `mode valve; opening ..; valve { Cv"
                " ..; downstreamPressure ..; }`");
        auto of = op->subDict("outflow");
        const std::string mode = of->lookupWordOrDefault("mode", "");
        if (mode == "flow")
        {
            outflow_   = Outflow::flow;
            F_out_set_ = of->lookupScalar("F");
            if (F_out_set_ < 0.0)
                throw std::runtime_error(whoVV + ": outflow.F must be >= 0");
        }
        else if (mode == "valve")
        {
            outflow_ = Outflow::valve;
            opening_ = of->lookupScalar("opening");
            if (opening_ < 0.0 || opening_ > 1.0)
                throw std::runtime_error(whoVV + ": outflow.opening must lie in"
                    " [0, 1] (got " + std::to_string(opening_) + ")");
            valve_ = VVH::Valve::read(
                of->found("valve") ? of->subDict("valve") : nullptr, whoVV);
        }
        else
            throw std::runtime_error(whoVV + ": outflow.mode '" + mode + "' is"
                " not one this vessel reads -- the two are `flow` (a"
                " manipulated flow, the level integrates) and `valve` (a valve"
                " on the outlet, the level self-regulates)");

        const std::string us = op->lookupWordOrDefault("UAScaling", "wetted");
        if (us == "wetted")     UAwetted_ = true;
        else if (us == "fixed") UAwetted_ = false;
        else
            throw std::runtime_error(whoVV + ": UAScaling '" + us + "' is not"
                " one this vessel reads -- `wetted` (UA x A_w(h)/A_w(H), the"
                " default) or `fixed`");

        const sVector x = readComposition(initDict, thermo, whoVV + " init");
        n_.assign(N, 0.0);
        if (initDict->found("level"))
        {
            if (initDict->found("totalMoles") || initDict->found("V"))
                throw std::runtime_error(whoVV + ": the initial inventory is"
                    " stated TWICE (`level` and `totalMoles`/`V`) -- keep one");
            const scalar h0 = initDict->lookupScalar("level");
            const auto ls = VVH::liquidState(thermo, x, T_, P_, whoVV, "dynamicCSTR", name_);
            const scalar nT = h0 * geom_.area() * ls.density / ls.meanMW;
            for (std::size_t i = 0; i < N; ++i) n_[i] = nT * x[i];
        }
        else
        {
            const scalar nT = initDict->lookupScalar("totalMoles");
            for (std::size_t i = 0; i < N; ++i) n_[i] = nT * x[i];
        }
        V_ = VVH::liquidState(thermo, n_, T_, P_, whoVV, "dynamicCSTR", name_).volume;   // m3 (derived)
        if (initDict->found("V"))
        {
            const scalar Vd = initDict->lookupScalar("V");
            if (std::abs(Vd - V_) > 1.0e-4 * std::max(Vd, V_))
                throw std::runtime_error(whoVV + ": the declared V = "
                    + std::to_string(Vd) + " m3 disagrees with the volume of"
                    " the declared inventory on this package ("
                    + std::to_string(V_) + " m3) -- in `volumeMode variable`"
                    " the volume is DERIVED (sum n MW / rho); declare the"
                    " inventory or the level, not a volume beside it");
        }
    }

    // ---- Inlet --------------------------------------------------------
    //  The driver hands the feed over from the stream file of the stream
    //  this unit declares as its inlet (`in <stream>;` -> 0/<stream>).
    if (!unitDict->found("inlet"))
        throw std::runtime_error("DynamicCSTR '" + name_ + "': no feed -- a"
            " continuous vessel declares the stream it is fed by (`in"
            " <stream>;` in flowsheetDict), and that stream's state lives in"
            " its own file 0/<stream>.");
    auto inletDict = unitDict->subDict("inlet");
    F_in_ = inletDict->lookupScalar("F");
    T_in_ = inletDict->lookupScalar("T");
    z_in_ = readComposition(inletDict, thermo,
        "DynamicCSTR '" + name_ + "' inlet");
    // Authoritative per-component molar flows (F, z become derived views).
    nDotIn_.assign(z_in_.size(), 0.0);
    for (std::size_t i = 0; i < z_in_.size(); ++i)
        nDotIn_[i] = F_in_ * z_in_[i];

    // ---- Jacket -------------------------------------------------------
    auto opDict = unitDict->subDict("operation");
    catalystLoading_ = opDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    //  The conversion is all it is: the pellet stays a POINT and eta = 1 is
    //  assumed.  Say so -- see reactor/CatalystPellet.H.
    announceUnresolvedPellet("dynamicCSTR '" + name() + "'",
                             catalystLoading_, thermoAnnounceLevel());
    UA_         = opDict->lookupScalarOrDefault("UA",       0.0);   // W/K
    T_jacket_   = opDict->lookupScalarOrDefault("T_jacket", T_);    // K

    // ---- Reactions ----------------------------------------------------
    std::vector<std::string> rxnNames;
    if (unitDict->found("reactions"))
        rxnNames = unitDict->lookupWordList("reactions");
    else if (unitDict->found("reaction"))
        rxnNames = { unitDict->lookupWord("reaction") };

    if (!rxnNames.empty() && !reactionsDict)
        throw std::runtime_error("DynamicCSTR: case names a reaction but"
            " has no constant/reactions library");

    reactions_.clear();
    for (const auto& rn : rxnNames)
    {
        auto rxn = reactionsDict->subDict(rn);
        ReactionSpec r;
        r.name = rn;
        //  `Arrhenius` is this vessel's own word and reads a power-law `order`
        //  per reactant; a factory law reads its own stoichiometry.
        const bool ownLaw = rxn->subDict("kinetics")->lookupWord("type") == "Arrhenius";
        auto stoich = rxn->lookupDictList("stoichiometry");
        for (const auto& s : stoich)
        {
            r.comps.push_back(thermo.indexOf(s->lookupWord("component")));
            r.nu.push_back(s->lookupScalar("nu"));
            // This USED to accept a reactant with no `order` and silently give it
            // exponent 0, and the comment here recorded why: requiring it in the
            // batch vessel alone made the same shared reaction library legal in a
            // CSTR and illegal here.  That diagnosis was right and the remedy was
            // backwards -- it made the LOOSE reading uniform instead of the strict
            // one.  Now all five readers go through Reaction::forwardOrder, so the
            // asymmetry that forced the retreat is gone.
            r.order.push_back(ownLaw ? Reaction::forwardOrder(
                *s, r.nu.back(), s->lookupWord("component"), "dynamicCSTR") : 0.0);
        }
        //  THE OUTFLOW IS MOLAR AND EQUAL TO THE INFLOW (`F_out = F_in`, the
        //  constant-volume closure in derivatives_), so the holdup's total
        //  moles change only by SUM_i nu_i r V.  For a reaction that changes
        //  the number of moles there is then no steady state but a drain (or a
        //  swell) at a fixed declared V: measured (C131 reactors review,
        //  2026-10-25), isobutene + methanol -> MTBE at 343 K, 1.24 kmol charged
        //  in V = 0.1 m3, fell to 0.051 kmol after 20 residence times while the
        //  steady CSTR on the same law converts 56 %; the ledger closed at
        //  1e-7, because it is consistent with the arithmetic, not with the
        //  vessel.  ANNOUNCED, not refused: the material and element ledgers
        //  stay exact over any horizon (check_ctrl_balance proves them on an
        //  A -> 2B vessel), and a short start-up transient can be what the
        //  case is about; what is false is a long-time "steady state".  The
        //  constant-volume outflow is a proposal in
        //  docs/design/review-c131-reactors.md (W8).
        if (!variableVolume_)   // a variable-volume vessel follows its holdup
        {
            scalar sumNu = 0.0;
            for (auto v : r.nu) sumNu += v;
            if (std::abs(sumNu) > 1.0e-12)
            {
                std::ostringstream m;
                m << "reaction '" << rn << "' changes the number of moles (sum of"
                     " nu = " << sumNu << ") and this vessel's outflow is F_out ="
                     " F_in (molar) at a fixed V, so its holdup "
                  << (sumNu < 0.0 ? "DRAINS" : "SWELLS") << " by sum(nu) r V and"
                     " never reaches a steady state: the vessel's density is not"
                     " held, and a long horizon does not approach the steady"
                     " `cstr` on the same law.  Read the transient as a"
                     " constant-molar-outflow model, not a constant-volume one.";
                if (AdvisoryLog::instance().addAnnouncedOnce(
                        "dynamicCSTR-sumnu:" + name_ + ":" + rn, "model", "warning",
                        "dynamicCSTR '" + name_ + "'", m.str()))
                    std::cout << "  [dynamicCSTR] WARNING: " << m.str() << "\n";
            }
        }
        auto kin = rxn->subDict("kinetics");
        const std::string ktype = kin->lookupWord("type");
        //  A REVERSE LEG ON THE VESSEL'S OWN `Arrhenius` WORD WAS DROPPED IN
        //  SILENCE: the own-law rate below is the forward product alone, so
        //  `reversible true;` (detailed balance) and an explicit `A_rev`/
        //  `Ea_rev` pair both ran irreversible at exit 0 (C131 reactors
        //  review, 2026-10-25).  A reaction that declares either is read by
        //  the shared RateLaw, which carries both legs; c_i = n_i / V in
        //  kmol/m3 is the basis Reaction::equilibriumKc is written in.
        const bool declaresReverse =
            rxn->lookupWordOrDefault("reversible", "false") == "true"
            || kin->found("A_rev");
        if (ktype == "Arrhenius" && !declaresReverse)
        {
            r.A_pre = kin->lookupScalar("A");
            r.Ea    = kin->lookupScalar("Ea");
        }
        else if (ReactionRate::isRegistered(ktype))
        {
            //  LHHW, a `type expression` written in the case, or a user law.
            //  This vessel carries no pressure a rate law can read, and forms
            //  c_i = n_i / V in kmol/m3.
            r.factoryLaw = true;
            RateOffer offer;
            offer.pressure = false;
            offer.concentrationBasis = "n_i / V";
            const std::string who = "DynamicCSTR: reaction '" + rn + "'";
            r.law = ReactionRate::New(rxn, thermo, who, offer);
            r.law->checkLoading(catalystLoading_ > 0.0, who);
        }
        else
        {
            std::vector<std::string> words = { "Arrhenius" };
            for (const auto& w : ReactionRate::availableTypes())
                if (w != "Arrhenius") words.push_back(w);
            throw std::runtime_error("DynamicCSTR: reaction '" + rn + "': "
                + registryRefusal::message("kinetics type", ktype, words, "Accepted"));
        }

        // Heat of reaction on the ONE enthalpy base (elements/formation datum),
        // resolved ONCE here through the shared helper.  When every reacting
        // species carries standardThermochemistry, dH_rxn(T) = Σ νᵢ·hᵢ(T) is authoritative
        // and a present dict `dH_rxn` is cross-checked (mismatch warned, never
        // silently overriding).  The dynamic reactor is always non-isothermal
        // (it integrates T), so the heat of reaction is always consulted.  The
        // ctrl toy components (compA/compB, no standardThermochemistry) take the announced
        // dict-override branch -- their numbers are unchanged.
        const std::string heatCtx = "DynamicCSTR '" + name_ + "' reaction '" + rn + "'";
        const std::optional<scalar> dictDH = resolveDeclaredHeat(thermo, r.comps, r.nu, parseDeclaredHeat(*rxn, heatCtx), heatCtx, 3).overrideForResolver;
        std::string heatSource;
        r.dH = reactionHeat(thermo, r.comps, r.nu, T_, "liquid", dictDH,
                            "DynamicCSTR '" + name_ + "' reaction '" + rn + "'",
                            /*verbosity*/ 3, heatSource);
        reactions_.push_back(std::move(r));
    }

    // ---- A DECLARED ISOTHERMAL VESSEL (2026-09-30) -----------------------
    //  `operation { energy isothermal; }` holds T and solves no energy
    //  equation.  Exact where nothing moves T -- no reaction, no jacket,
    //  every inlet at the vessel's temperature -- and a simplification
    //  otherwise, so it is DECLARED, never inferred, and it refuses the two
    //  cases where holding T needs a duty this unit would not compute.
    //  Absent, the energy equation is chosen by probing exactly as before.
    {
        auto op = unitDict->subDict("operation");
        const std::string e = op->lookupWordOrDefault("energy", "");
        if (!e.empty() && e != "isothermal")
            throw std::runtime_error("DynamicCSTR '" + name_ + "': energy '"
                + e + "' is not a declaration this unit reads -- the one word"
                " is `isothermal`; leave `energy` out for the energy equation"
                " the unit chooses by probing");
        isothermal_ = (e == "isothermal");
        if (isothermal_ && !reactions_.empty())
            throw std::runtime_error("DynamicCSTR '" + name_ + "': `energy"
                " isothermal;` with a reaction -- holding T would need the duty"
                " that removes the heat of reaction, which this declaration"
                " does not compute; drop `energy isothermal;`");
        if (isothermal_ && UA_ != 0.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': `energy"
                " isothermal;` with a jacket (UA " + std::to_string(UA_)
                + " W/K) -- the jacket would move a temperature the declaration"
                " holds; set UA 0 or drop `energy isothermal;`");
    }

    // ---- WHICH ENERGY EQUATION, and it is announced -----------------------
    //
    //  THE CANONICAL ROUTE.  The vessel stores H(n,T) = Σ nᵢ hᵢ(T) on the
    //  project's ONE datum (elements at 298.15 K), and the first law for an
    //  open system at constant P is dH/dt = Ḣ_in − Ḣ_out + Q.  Substituting
    //  dnᵢ/dt from the material balance leaves
    //
    //      Σ nᵢ Cpᵢ(T) dT/dt = Σ ṅ_in,ᵢ [hᵢ(T_in) − hᵢ(T)]
    //                          + UA (T_j − T)
    //                          − Σ_r r_r V ΔH_r(T)
    //
    //  with ΔH_r(T) = Σ νᵢ hᵢ(T) -- the SAME resolver, the same datum.  Note
    //  what the outlet term did: it cancelled exactly, because the stream
    //  leaves at the tank's own state.  That is the whole point of the
    //  reformulation: written this way the ODE IS the derivative of a stored
    //  H, so the ledger can subtract two numbers and get zero.
    //
    //  THE Cp/CONVECTIVE ROUTE.  The previous form used
    //  F_in·Cp_in(T)·(T_in − T) -- the linearisation of that integral with Cp
    //  frozen at T -- and a ΔH_r frozen at the INITIAL temperature.  Neither
    //  is the derivative of anything, which is why the ledger refused.
    //
    //  A model that cannot reach the datum keeps the old equation, because
    //  the honest alternative is not running: the ctrl toy species compA and
    //  compB carry no standardThermochemistry ON PURPOSE (a fictitious
    //  substance has no elements and no heat of formation), and their cases
    //  are about control, not about the first law.  What is NOT acceptable is
    //  choosing between two different energy equations in silence, so the
    //  route is decided once, here, and printed with the reason.
    canonicalEnergy_ = true;
    std::string blocker;
    for (std::size_t i = 0; i < N; ++i)
    {
        //  The canonical route prices PER SPECIES, so the question is not
        //  "does a datum exist somewhere" but "can the per-species leg
        //  serve it" -- and the SURFACE is the authority on that, asked by
        //  PROBE, never by name.  The distinction is real: an electrolyte
        //  salt HAS an elements datum (the aqueous ion reference), but it
        //  lives at the MIXTURE level (aqueousSaltEnthalpy(m,T) -- the
        //  enthalpy depends on molality), and the per-species API refuses
        //  to pretend otherwise (forum #103).  Such a vessel needs the
        //  mixture-H state formulation, a NAMED next slice (DEV.md
        //  roadmap #2), not a leg invented here.
        if (thermo.hasEnthalpyDatum(i))
        {
            try { (void) hLiq_(i, T_); continue; }
            catch (const std::exception& e)
            {
                canonicalEnergy_ = false;
                if (!blocker.empty()) blocker += "; ";
                blocker += thermo.comp(i).name() + std::string(" (per-species"
                    " leg unavailable: ") + e.what() + ")";
                continue;
            }
        }
        canonicalEnergy_ = false;
        if (!blocker.empty()) blocker += "; ";
        blocker += thermo.comp(i).name();
    }
    //  When the per-species leg cannot serve, ask the MIXTURE surface
    //  before falling back: the electrolyte tank's whole problem is that
    //  its salt's enthalpy exists only at mixture level, and
    //  H_liquid_formation is exactly the surface that prices it (the
    //  aqueous ion reference + L_phi).  Probed, like everything else.
    mixtureH_ = false;
    if (!canonicalEnergy_)
    {
        try
        {
            H_ = 0.0;
            scalar nt = 0.0; for (auto v : n_) nt += v;
            H_ = nt * hMix_(n_, T_);                       // kJ
            (void) hMix_(z_in_, T_in_);                    // the inlet leg too
            mixtureH_ = true;
        }
        catch (const std::exception&) { mixtureH_ = false; }
    }

    if (isothermal_)
    {
        canonicalEnergy_ = false;
        mixtureH_        = false;
        std::cout << "  [energy] DynamicCSTR '" << name_ << "': ISOTHERMAL,"
                     " as declared -- T is held at " << T_ << " K and no"
                     " energy equation is solved.  Exact while every inlet"
                     " arrives at that temperature (no reaction, no jacket:"
                     " both refused); an inlet at another temperature would"
                     " exchange heat this unit does not compute, so the"
                     " first-law ledger is WITHHELD.\n";
    }
    else if (canonicalEnergy_)
        std::cout << "  [energy] DynamicCSTR '" << name_ << "': CANONICAL"
                     " route -- the vessel stores H(n,T) on the elements datum"
                     " and the ODE is its exact derivative, so the first-law"
                     " ledger CLAIMS closure.\n";
    else if (mixtureH_)
        std::cout << "  [energy] DynamicCSTR '" << name_ << "': MIXTURE-H"
                     " route -- the per-species leg cannot serve (" << blocker
                  << "), but the mixture surface H_liquid_formation prices"
                     " the whole holdup, so the vessel stores TOTAL H as a"
                     " STATE and integrates dH/dt = Hin - Hout + Q directly;"
                     " T is a readout recovered from H(n,T) on the same"
                     " surface.  Reactions and partial-molar terms need no"
                     " separate pricing: the state carries them.  The"
                     " first-law ledger CLAIMS closure.\n";
    else
        std::cout << "  [energy] DynamicCSTR '" << name_ << "': Cp/convective"
                     " route -- no elements-datum enthalpy for " << blocker
                  << ".  The temperature is integrated as before; the"
                     " first-law ledger REFUSES, because this equation is not"
                     " the derivative of a stored H.\n";

    // ---- The vessel Cp, per route (roadmap #2, 2026-08-01) ----------------
    //
    //  Whatever route the ODE takes, its denominator is Sum n_i*Cp_i.  On
    //  the Cp/convective route the ONLY Cp there is is the declared
    //  per-component liquidHeatCapacity, so it stays REQUIRED there -- the
    //  old refusal, unchanged for the toy cases.
    //
    //  On the CANONICAL route the denominator must be the T-derivative of
    //  the SAME stored-H surface the rest of the equation prices -- and a
    //  DISSOLVED SALT has no liquidHeatCapacity to declare, honestly: its
    //  enthalpy rides the aqueous ionic tier, whose own T-derivative (the
    //  Criss-Cobble cp_aq under the standard-state leg) IS its heat
    //  capacity.  So: a component with a declared liquid Cp uses it (the
    //  surface integrates exactly that Cp on the liquid leg -- same
    //  number); a component without one takes the numerical T-derivative
    //  of speciesPhaseEnthalpy, ANNOUNCED -- one surface, one derivative,
    //  no second home for the datum (this is what unblocked
    //  ctrl10_brine_concentration).
    for (std::size_t i = 0; i < N; ++i)
    {
        if (mixtureH_ || isothermal_) break;   // no Cp is needed at all
        if (thermo.comp(i).hasCpLiquid()) continue;
        if (!canonicalEnergy_)
            throw std::runtime_error("DynamicCSTR: component '"
                + thermo.comp(i).name() + "' has no liquidHeatCapacity"
                " entry in its .dat file (needed for the Cp/convective"
                " energy balance)");
        std::cout << "  [energy] DynamicCSTR '" << name_ << "': '"
                  << thermo.comp(i).name() << "' has no liquidHeatCapacity;"
                     " its vessel Cp is the T-derivative of its own"
                     " stored-H leg (for a dissolved solute, the aqueous"
                     " standard-state cp_aq) -- one surface, one"
                     " derivative.\n";
    }

    // ---- start: explicit (default) vs steadyState seed ----------------
    //  ABSENT or `explicit`  => t=0 is the literal `initial{}` above
    //                           (byte-identical to every existing case).
    //  `steadyState`         => t=0 is SEEDED from the steady solution of the
    //                           holdup ODE at the declared feed/UA/T_jacket
    //                           (dn/dt = 0, dT/dt = 0).  Computed + PRINTED,
    //                           never a fabricated constant (no silent crutch).
    const std::string start =
        initDict->lookupWordOrDefault("start", "explicit");
    if (variableVolume_ && start != "explicit")
        throw std::runtime_error(whoVV + ": initial.start '" + start + "' with"
            " volumeMode variable -- the steady seed relaxes a vessel whose"
            " volume is held; a variable-volume vessel starts from its declared"
            " inventory or level (a heel), which is the point of it");
    if (start == "steadyState" || start == "steady")
    {
        std::cout << "  DynamicCSTR '" << name_
                  << "': start = STEADY-STATE seed (from the holdup ODE at"
                     " the declared feed/UA/T_jacket)\n"
                  << "    explicit initial{} (T0=" << T_
                  << " K) used only as the relaxation guess.\n";
        seedFromSteady();
    }
    else if (start == "explicit")
    {
        std::cout << "  DynamicCSTR '" << name_
                  << "': start = explicit initial{}  (T0=" << T_ << " K)\n";
    }
    else
        throw std::runtime_error("DynamicCSTR '" + name_ + "': unknown"
            " initial.start '" + start + "' (expected `explicit` or"
            " `steadyState`)");

    if (variableVolume_)
    {
        checkAccepted_(0.0);
        const auto r0 = resolveVariable_(n_, T_, true);
        std::cout << "  [dynamicCSTR] '" << name_ << "': VARIABLE VOLUME --"
                     " vertical cylinder D = " << geom_.diameter << " m, H = "
                  << geom_.height << " m (area " << geom_.area() << " m2);"
                     " initial level " << r0.liquid.level << " m (V = "
                  << r0.liquid.volume << " m3, rho = " << r0.liquid.density
                  << " kg/m3 from the case's package).  Reactions use the"
                     " CURRENT volume (c_i = n_i/V); a dry or overflowing"
                     " vessel is REFUSED, never clamped.\n";
        if (outflow_ == Outflow::flow)
            std::cout << "  [dynamicCSTR] '" << name_ << "': outflow = MANIPULATED"
                         " FLOW (F_out = " << F_out_set_ << " kmol/s, mv F_out):"
                         " the level INTEGRATES -- no self-regulation.\n";
        else
            std::cout << "  [dynamicCSTR] '" << name_ << "': outflow = VALVE (Cv = "
                      << valve_.Cv << " m2, opening " << opening_
                      << ", downstream " << valve_.P_downstream_Pa
                      << " Pa; Q = Cv x opening x sqrt(dP/rho), dP = P + rho g h"
                         " - P_down): the level SELF-REGULATES.\n";
        if (UA_ != 0.0)
            std::cout << "  [dynamicCSTR] '" << name_ << "': jacket "
                      << (UAwetted_
                          ? std::string("UA scales with the WETTED area, UA(h) = UA x"
                            " A_w(h)/A_w(H), A_w(h) = pi D h + pi D^2/4, UA declared"
                            " at the FULL height H (`UAScaling fixed;` keeps it"
                            " constant)")
                          : "UA held FIXED at " + std::to_string(UA_) + " W/K"
                            " (UAScaling fixed) -- a jacket whose area does not"
                            " follow the liquid")
                      << " -- now UA = " << r0.UA << " W/K.\n";
    }
}

// ---------------------------------------------------------------------------
//  seedFromSteady():  relax the holdup ODE (dn/dt = f, dT/dt = f) to its steady
//  fixed point with the CURRENT feed / UA / T_jacket HELD, and adopt that
//  (n_i, T) as the t=0 state.  Glass-box: it integrates the SAME RK4 step() the
//  run uses (one code path, no second physics) until the state stops changing,
//  then announces the seeded operating point (no silent crutch).
//
//  THE STEP SIZE is the subtlety.  The reactor's SLOWEST mode is its residence
//  time tau_res = n_tot / F_in (often hours), but its FASTEST mode is the
//  thermal/jacket relaxation tau_T ~ (n*Cp) / (F*Cp + UA/1000) (often seconds).
//  An explicit RK4 step is stable only when dt is a fraction of the FAST mode,
//  so dt is sized off tau_T (NOT tau_res --- using tau_res/200 overshoots the
//  fast thermal mode and the relaxation diverges).  The horizon is then many
//  slow-mode residence times so the composition fully equilibrates.
// ---------------------------------------------------------------------------
//  Routed inlet (tanks-in-series).  nDotIn_ is the authoritative
//  per-component molar flow; F_in_ and z_in_ are derived views of it, so
//  the three stay coherent by construction.  T_in_ follows the routed
//  stream.  P is NOT taken: this vessel's pressure is its own operating
//  datum, and the proposal's scope is forward routing, not a flow network.
void DynamicCSTR::setInletStream(const ContinuousStream& s)
{
    if (s.z.size() != nDotIn_.size())
        throw std::runtime_error("DynamicCSTR '" + name_ + "': routed inlet"
            " carries " + std::to_string(s.z.size()) + " components against"
            " this unit's " + std::to_string(nDotIn_.size())
            + " -- one global component set is the ctrl contract");
    for (std::size_t i = 0; i < nDotIn_.size(); ++i)
        nDotIn_[i] = s.F * s.z[i];
    F_in_ = 0.0;
    for (auto v : nDotIn_) F_in_ += v;
    if (F_in_ > 0.0)
        for (std::size_t i = 0; i < z_in_.size(); ++i)
            z_in_[i] = nDotIn_[i] / F_in_;
    else
        std::fill(z_in_.begin(), z_in_.end(), 0.0);
    T_in_ = s.T;
}

void DynamicCSTR::seedFromSteady()
{
    const std::size_t N = n_.size();

    scalar nTot = 0.0; for (auto v : n_) nTot += v;

    // Heat capacities at the current T (kJ/K and kJ/(K) per mole-rate term).
    scalar CpTot = 0.0, CpInAvg = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        const scalar cp = canonicalEnergy_ ? cpSurface_(i, T_)
                                           : thermo_->comp(i).cpLiquid().Cp(T_);
        CpTot   += n_[i]   * cp;
        CpInAvg += z_in_[i] * cp;
    }
    // Fast (thermal) time constant: (n*Cp) / (F*Cp_in + UA/1000).
    const scalar thermalDenom = F_in_ * CpInAvg + UA_ / 1000.0;
    const scalar tauT = (thermalDenom > 1.0e-30 && CpTot > 1.0e-30)
                      ? CpTot / thermalDenom : 1.0;
    // Slow (residence) time constant.
    const scalar tauRes = (F_in_ > 1.0e-30) ? nTot / F_in_ : tauT;

    const scalar dt = std::max<scalar>(tauT / 20.0, 1.0e-6);  // fraction of FAST mode
    // Horizon: enough slow-mode times to equilibrate composition, capped.
    const scalar horizon = std::max<scalar>(20.0 * tauRes, 200.0 * tauT);
    const std::size_t maxSteps =
        std::min<std::size_t>(static_cast<std::size_t>(horizon / dt) + 1, 5000000);

    sVector prev(N + 1);
    for (std::size_t it = 0; it < maxSteps; ++it)
    {
        for (std::size_t i = 0; i < N; ++i) prev[i] = n_[i];
        prev[N] = T_;

        step(0.0, dt);                 // the SAME RK4 the run uses --- one path

        if (!std::isfinite(T_))        // diverged (no stable open-loop SS)
        {
            std::cout << "    WARNING: steady-state seed DIVERGED (the open-loop"
                      << " reactor has no stable attractor at this jacket) ---"
                      << " keeping the explicit initial{}.\n";
            for (std::size_t i = 0; i < N; ++i) n_[i] = prev[i];
            T_ = prev[N];
            return;
        }

        scalar maxRel = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            const scalar d = std::abs(n_[i] - prev[i]);
            maxRel = std::max(maxRel, d / std::max<scalar>(std::abs(prev[i]), 1.0e-12));
        }
        maxRel = std::max(maxRel,
            std::abs(T_ - prev[N]) / std::max<scalar>(std::abs(prev[N]), 1.0));

        if (maxRel < 1.0e-11)
        {
            scalar nt = 0.0; for (auto v : n_) nt += v;
            std::cout << "    seeded steady state reached after " << (it + 1)
                      << " relaxation steps (dt=" << dt << " s):  T0=" << T_ << " K";
            for (std::size_t i = 0; i < N; ++i)
                if (nt > 0.0)
                    std::cout << "  x_" << thermo_->comp(i).name() << "="
                              << n_[i] / nt;
            std::cout << "\n";
            return;
        }
    }
    std::cout << "    note: steady-state seed reached the relaxation horizon ("
              << maxSteps << " steps) without a tight fixed point --- using the"
              << " last relaxed state (T0=" << T_ << " K) as an approximate"
              << " operating point.\n";
}

// -----------------------------------------------------------------------
//  Arrhenius rate: r = k(T) · ∏_j (n_j / V)^{order_j}    [kmol/(m³·s)]
// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
//  ONE enthalpy surface for the whole vessel.
//
//  h_i(T) comes from the canonical per-species phase leg
//  (ThermoPackage::speciesPhaseEnthalpy, elements datum), which is the same
//  function H_liquid_formation and reactionHeat read.  That is the point: the
//  stored H, the inlet enthalpy and the heat of reaction must be three views
//  of one surface, or the ledger is subtracting numbers from different worlds
//  and the residual it reports is the disagreement between them.
// -----------------------------------------------------------------------
scalar DynamicCSTR::cpSurface_(std::size_t i, scalar T) const
{
    //  The vessel Cp of component i: the declared liquid Cp when there is
    //  one (the canonical surface integrates exactly it on the liquid leg,
    //  so the two are the same number), and otherwise the NUMERICAL
    //  T-derivative of the same stored-H leg the rest of the equation
    //  prices -- central difference over 1 K, far below any physical Cp
    //  variation, and structurally incapable of drifting from the surface
    //  it differentiates.
    if (thermo_->comp(i).hasCpLiquid())
        return thermo_->comp(i).cpLiquid().Cp(T);
    const scalar dT = 0.5;
    return (hLiq_(i, T + dT) - hLiq_(i, T - dT)) / (2.0 * dT);
}

scalar DynamicCSTR::hMix_(const sVector& n, scalar T) const
{
    //  The mixture surface and its inverse have ONE home since C205
    //  (VariableVolumeHoldup): the dynamic tank calls the same two functions.
    return VariableVolumeHoldup::mixtureEnthalpy(*thermo_, n, T);   // J/mol
}

scalar DynamicCSTR::TfromH_(const sVector& n, scalar H, scalar Tguess) const
{
    return VariableVolumeHoldup::temperatureFromEnthalpy(*thermo_, n, H, Tguess);
}

scalar DynamicCSTR::hLiq_(std::size_t i, scalar T) const
{
    return thermo_->speciesPhaseEnthalpy(
        //  P_ is held in bar here (the liquid balance never used it); the
        //  package's API is SI, so convert rather than hand it a number that
        //  is 1e5 times too small and hope the liquid leg ignores it.
        i, T, P_Pa_(), "liquid",
        ThermoPackage::ReferenceContext::StandardPhase);
}

scalar DynamicCSTR::reactionEnthalpyAtT_(const ReactionSpec& rxn, scalar T) const
{
    scalar dH = 0.0;
    for (std::size_t s = 0; s < rxn.comps.size(); ++s)
        dH += rxn.nu[s] * hLiq_(rxn.comps[s], T);
    return dH;                                    // J/mol
}

scalar DynamicCSTR::storedEnthalpy_() const
{
    scalar H = 0.0;
    for (std::size_t i = 0; i < n_.size(); ++i)
        H += n_[i] * hLiq_(i, T_);                // kmol · J/mol = kJ
    return H;
}

scalar DynamicCSTR::rateOfReaction_(const ReactionSpec& rxn,
                                    scalar               T,
                                    const sVector&       n,
                                    scalar               V) const
{
    // LHHW answers for itself: the shared RateLaw carries the basis (concentration
    // or activity), the adsorption denominator and the reverse leg.  With conc in
    // kmol/m^3, a `catalystLoading` in kg/m^3 turns a per-gram rate constant into
    // the reactor's volumetric one exactly: mol/(g.s) x kg/m^3 = kmol/(m^3.s).
    if (rxn.factoryLaw)
    {
        const std::size_t nc = n.size();
        sVector conc(nc, 0.0), x(nc, 0.0);
        scalar ntot = 0.0;
        for (std::size_t j = 0; j < nc; ++j)
        { conc[j] = std::max<scalar>(n[j], 0.0) / V; ntot += std::max<scalar>(n[j], 0.0); }
        if (ntot > 0.0) for (std::size_t j = 0; j < nc; ++j) x[j] = std::max<scalar>(n[j], 0.0) / ntot;
        const scalar cf = (catalystLoading_ > 0.0) ? catalystLoading_ : 1.0;
        RateState rs;
        rs.T = T; rs.P = std::nan(""); rs.conc = &conc; rs.x = &x;
        rs.amountPerKmol = 1.0;                       // conc in kmol/m3
        return cf * rxn.law->netRate(*thermo_, rs);
    }

    const scalar k = (catalystLoading_ > 0.0 ? catalystLoading_ : 1.0) * rxn.A_pre * std::exp(-rxn.Ea / (constant::R * T));  // C190 item 11: the bed density converts a per-gram constant (it was read and dropped)
    scalar r = k;
    for (std::size_t s = 0; s < rxn.comps.size(); ++s)
    {
        if (rxn.order[s] == 0.0) continue;              // C190 item 10: a NEGATIVE order is honoured
        const scalar c_i = n[rxn.comps[s]] / V;
        r *= Reaction::powerLawFactor(rxn.order[s] > 0.0 ? std::max<scalar>(c_i, 0.0) : c_i, rxn.order[s], thermo_->comp(rxn.comps[s]).name(), "dynamicCSTR reaction '" + rxn.name + "'");
    }
    return r;
}

// -----------------------------------------------------------------------
//  Combined derivatives for the packed state.
//      packed[0..N-1] = n_i [kmol]
//      packed[N]      = T   [K]
//
//   dn_i/dt = F_in · z_in_i  -  F_out · (n_i/Σn)  +  Σ_r ν_{i,r} · r_r · V
//   Σn·Cp · dT/dt = F_in·Cp_in·(T_in-T) + (UA/1000)·(T_j-T) - Σ_r r_r·V·ΔH_r
//
//  F_out = F_in (constant-volume CSTR; assumes incompressible liquid).
// -----------------------------------------------------------------------
sVector DynamicCSTR::derivatives_(const sVector& packed) const
{
    const std::size_t N = packed.size() - 1;
    sVector n(N);
    for (std::size_t i = 0; i < N; ++i) n[i] = packed[i];
    //  On the mixture-H route the last row is the STORED ENTHALPY, and T is
    //  the readout recovered from it on the same surface.  Everywhere else
    //  the last row is T itself.
    const scalar T = mixtureH_ ? TfromH_(n, packed[N], T_) : packed[N];

    scalar nTot = 0.0;
    for (auto v : n) nTot += std::max<scalar>(v, 0.0);

    sVector dydt(N + 1, 0.0);

    //  The volume, the outflow and the jacket area are CONSTANTS of the
    //  constant-volume vessel and FUNCTIONS OF THE STATE of the variable one.
    scalar V     = V_;
    scalar F_out = F_in_;   // constant-volume assumption
    scalar UAnow = UA_;
    if (variableVolume_)
    {
        const Resolved rv = resolveVariable_(n, T, false);
        V     = rv.liquid.volume > 0.0 ? rv.liquid.volume : 1.0;  // no moles => no rate
        F_out = rv.F_out;
        UAnow = rv.UA;
    }

    // ---- Mass balance per component -----------------------------------
    for (std::size_t i = 0; i < N; ++i)
    {
        //  a trial stage may carry a negative mole number: the variable-volume
        //  vessel clamps it in the composition it draws (the step itself is
        //  refused, never clamped, when it ACCEPTS one)
        const scalar x_i = (nTot > 0)
            ? (variableVolume_ ? std::max<scalar>(n[i], 0.0) : n[i]) / nTot : 0.0;
        dydt[i] = F_in_ * z_in_[i] - F_out * x_i;
    }

    // ---- Reactions ----------------------------------------------------
    scalar heatRxn = 0.0;   // kJ/s released (signed: + means absorbed)
    for (const auto& rxn : reactions_)
    {
        const scalar rr = rateOfReaction_(rxn, T, n, V);    // kmol/(m³·s)
        for (std::size_t s = 0; s < rxn.comps.size(); ++s)
            dydt[rxn.comps[s]] += rxn.nu[s] * rr * V;        // kmol/s
        //  ΔH_r AT THE CURRENT T on the canonical route.  Frozen at the
        //  initial T it is a constant that no stored H has as a derivative --
        //  and on a reactor that swings 40 K it is also simply wrong.
        const scalar dHr = canonicalEnergy_ ? reactionEnthalpyAtT_(rxn, T) : rxn.dH;
        heatRxn += dHr * rr * V;                             // kJ/s (dH J/mol · kmol/s = kJ/s)
    }

    // ---- Energy balance ----------------------------------------------
    if (isothermal_)
    {
        dydt[N] = 0.0;                          // T held, as declared
        return dydt;
    }
    if (mixtureH_)
    {
        //  dH/dt = Hdot_in - Hdot_out + Q, every enthalpy on the ONE
        //  mixture surface.  No reaction term (the elements datum already
        //  carries it inside H) and no partial-molar terms (they live
        //  implicitly in the state).
        const scalar Hin  = F_in_ * hMix_(nDotIn_.empty() ? z_in_ : z_in_, T_in_);  // kW
        const scalar Hout = F_out * hMix_(n, T);                                    // kW
        const scalar Q    = (UAnow / 1000.0) * (T_jacket_ - T);                     // kW
        dydt[N] = Hin - Hout + Q;                                                   // kJ/s
        return dydt;
    }
    //  CpTot (in kJ/K) = Σ n_i · Cp_liq_i(T)   (Cp J/(mol·K) ≡ kJ/(kmol·K))
    scalar CpTot = 0.0;
    for (std::size_t i = 0; i < N; ++i)
        CpTot += n[i] * (canonicalEnergy_ ? cpSurface_(i, T)
                                          : thermo_->comp(i).cpLiquid().Cp(T));

    if (CpTot > 1.0e-30)
    {
        scalar convective = 0.0;                                   // kJ/s
        if (canonicalEnergy_)
        {
            //  The EXACT inlet term: what the feed's enthalpy has to change by
            //  on arriving at the tank's temperature.  The outlet does not
            //  appear because it leaves at T -- it cancelled when dn/dt was
            //  substituted, and that cancellation is what makes this the
            //  derivative of a stored H rather than a resemblance to one.
            for (std::size_t i = 0; i < N; ++i)
            {
                const scalar nDot = F_in_ * z_in_[i];              // kmol/s
                if (nDot == 0.0) continue;
                convective += nDot * (hLiq_(i, T_in_) - hLiq_(i, T));  // kJ/s
            }
        }
        else
        {
            scalar CpInAvg = 0.0;
            for (std::size_t i = 0; i < N; ++i)
                CpInAvg += z_in_[i] * thermo_->comp(i).cpLiquid().Cp(T);
            convective = F_in_ * CpInAvg * (T_in_ - T);            // kJ/s
        }
        const scalar jacket = (UAnow / 1000.0) * (T_jacket_ - T);  // kJ/s
        dydt[N] = (convective + jacket - heatRxn) / CpTot;         // K/s
    }
    return dydt;
}

void DynamicCSTR::step(scalar t, scalar dt)
{
    const std::size_t N = n_.size();
    sVector y(N + 1);
    for (std::size_t i = 0; i < N; ++i) y[i] = n_[i];
    y[N] = mixtureH_ ? H_ : T_;   // the last row is H on the mixture-H route

    auto axpy = [](const sVector& a, scalar c, const sVector& b)
    {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + c * b[i];
        return r;
    };

    auto k1 = derivatives_(y);
    auto k2 = derivatives_(axpy(y, 0.5*dt, k1));
    auto k3 = derivatives_(axpy(y, 0.5*dt, k2));
    auto k4 = derivatives_(axpy(y,     dt, k3));

    for (std::size_t i = 0; i < y.size(); ++i)
        y[i] += dt / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);

    //  A fixed RK4 step cannot reject an overshoot, so a negative mole number
    //  is clipped to zero here -- ANNOUNCED with the amount it invents, never
    //  silent (2026-10-31, DEV.md 4c C185 item 8).  The adaptive path has no
    //  clip: its per-row mask rejects the step instead (setOdeState below).
    if (variableVolume_)
    {
        scalar total = 0.0;
        for (std::size_t i = 0; i < N; ++i) total += y[i];
        if (!(total > 0.0))
            throw std::runtime_error("dynamicCSTR '" + name_ + "': the vessel"
                " RAN DRY at t = " + std::to_string(t + dt) + " s (the step"
                " drove the total inventory to " + std::to_string(total)
                + " kmol).  Refused, not clamped: lower the outflow, raise the"
                " inflow or the setpoint (or reduce deltaT if the step"
                " overshot the empty vessel)");
    }
    for (std::size_t i = 0; i < N; ++i)
    {
        if (variableVolume_ && y[i] < 0.0)
            throw std::runtime_error("dynamicCSTR '" + name_ + "': the step"
                " drove n_" + thermo_->comp(i).name() + " to "
                + std::to_string(y[i]) + " kmol at t = "
                + std::to_string(t + dt) + " s.  Refused, not clamped (a"
                " variable-volume vessel that empties is a case that no longer"
                " describes what it declares) -- reduce deltaT, or lower the"
                " outflow");
        if (y[i] < 0.0)
        {
            std::ostringstream m;
            m << "the fixed RK4 step of " << dt << " s drove n_"
              << thermo_->comp(i).name() << " to " << y[i]
              << " kmol and it was CLIPPED to zero (" << -y[i]
              << " kmol invented): a fixed step cannot reject an overshoot --"
                 " reduce deltaT, or declare `timeStepping adaptive;` so the"
                 " step that crosses zero is rejected instead";
            if (AdvisoryLog::instance().addAnnouncedOnce(
                    "dynamicCSTR-clip:" + name_ + ":" + thermo_->comp(i).name(),
                    "bound", "warning", "dynamicCSTR '" + name_ + "'", m.str()))
                std::cerr << "  [dynamicCSTR] WARNING: '" << name_ << "': "
                          << m.str() << "\n";
        }
        n_[i] = std::max<scalar>(y[i], 0.0);
    }
    if (mixtureH_) { H_ = y[N];  T_ = TfromH_(n_, H_, T_); }
    else           T_ = y[N];
    if (variableVolume_)
    {
        t_ = t + dt;
        checkAccepted_(t_);
    }
}

// ---- Packed-ODE form (the adaptive driver) ------------------------------
//  Pack/unpack mirror step()'s convention EXACTLY: (n_0..n_{N-1}, T) -- or
//  (n_0..n_{N-1}, H) on the mixture-H route, where T is the readout.
sVector DynamicCSTR::odeState() const
{
    const std::size_t N = n_.size();
    sVector y(N + 1);
    for (std::size_t i = 0; i < N; ++i) y[i] = n_[i];
    y[N] = mixtureH_ ? H_ : T_;
    return y;
}

void DynamicCSTR::setOdeState(const sVector& y)
{
    const std::size_t N = n_.size();
    for (std::size_t i = 0; i < N; ++i)
    {
        //  The adaptive driver's per-row positivity mask covers every mole
        //  number this vessel packs (odeNPositive), so the integrator never
        //  ACCEPTS a step that drives one negative.  This used to clip to
        //  zero in silence -- and with two or more packed units the mask was
        //  OFF, so the clip was inventing inventory (DEV.md 4c C185 item 8:
        //  A -> B from A = 1 beside an idle vessel published A = 0, B = 2).
        //  A negative row arriving here now is an ENGINE DEFECT (a mask not
        //  applied, or a caller committing an unaccepted trial), and it is
        //  refused by name rather than hidden.
        if (y[i] < 0.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': the"
                " integrator committed a NEGATIVE mole number n_"
                + thermo_->comp(i).name() + " = " + std::to_string(y[i])
                + " kmol.  The per-row positivity mask (solver/ODE/"
                "AdaptiveTimeStep.H, positiveRowMask) must reject such a"
                " step before it is accepted; that it reached setOdeState is"
                " an engine defect, not a case error -- report it.");
        n_[i] = y[i];
    }
    if (mixtureH_) { H_ = y[N];  T_ = TfromH_(n_, H_, T_); }
    else           T_ = y[N];
}

std::string DynamicCSTR::odeRowLabel(std::size_t i) const
{
    return i < n_.size() ? "n_" + thermo_->comp(i).name()
                         : std::string(mixtureH_ ? "H" : "T");
}

sVector DynamicCSTR::stateVector() const
{
    sVector s = n_;
    s.push_back(T_);
    s.push_back(F_in_);
    for (auto z : z_in_) s.push_back(z);
    if (variableVolume_)
    {
        const Resolved r = resolveVariable_(n_, T_, false);
        s.push_back(r.liquid.level);
        s.push_back(r.liquid.volume);
        s.push_back(r.liquid.density);
        s.push_back(r.F_out);
    }
    return s;
}

std::vector<std::string> DynamicCSTR::stateLabels() const
{
    std::vector<std::string> labels;
    labels.reserve(2 * n_.size() + 2);
    for (std::size_t i = 0; i < n_.size(); ++i)
        labels.push_back("n_" + thermo_->comp(i).name());
    labels.push_back("T");
    // Inlet DERIVED views (forum #103: an inlet-field disturbance must
    // prove that F and z changed by the derived values, not merely that
    // the reactor responded) -- constant columns for undisturbed cases.
    labels.push_back("F_in");
    for (std::size_t i = 0; i < n_.size(); ++i)
        labels.push_back("z_in_" + thermo_->comp(i).name());
    if (variableVolume_)
        for (const char* l : { "level", "volume", "density", "F_out" })
            labels.push_back(l);
    return labels;
}

ContinuousStream DynamicCSTR::outletStream() const
{
    ContinuousStream s;
    s.F = F_in_;                              // constant volume → F_out = F_in
    s.T = T_;
    s.P = P_;
    if (variableVolume_)
    {
        const Resolved r = resolveVariable_(n_, T_, false);
        s.F = r.F_out;
        //  the pressure at the outlet nozzle: the vessel pressure plus the head
        s.P = P_ + VVH::staticHead(r.liquid.density, r.liquid.level);
    }
    s.z.assign(n_.size(), 0.0);
    scalar nTot = 0;
    for (auto v : n_) nTot += v;
    if (nTot > 0)
        for (std::size_t i = 0; i < n_.size(); ++i) s.z[i] = n_[i] / nTot;
    return s;
}

ContinuousStream DynamicCSTR::inletStream() const
{
    // The instantaneous FEED face: F_in/T_in/P/z_in held at the current MV
    // state.  Mirror of outletStream() --- a read-only projection, no physics.
    ContinuousStream s;
    s.F = F_in_;
    s.T = T_in_;
    s.P = P_;
    s.z = z_in_;
    return s;
}

BalanceSnapshot DynamicCSTR::balanceSnapshot() const
{
    BalanceSnapshot bs;
    if (!thermo_)
    {
        bs.materialReason = "dynamicCSTR '" + name_
            + "': not initialised (no thermo package)";
        return bs;
    }
    const std::size_t N = n_.size();
    scalar Fout = F_in_;          // constant volume: F_out = F_in
    scalar UAnow = UA_;
    if (variableVolume_)
    {
        const Resolved rv = resolveVariable_(n_, T_, false);
        Fout  = rv.F_out;
        UAnow = rv.UA;
    }
    bs.componentNames.reserve(N);
    for (std::size_t i = 0; i < N; ++i)
        bs.componentNames.push_back(thermo_->comp(i).name());
    bs.inventory.assign(n_.begin(), n_.end());

    // Feed face: the AUTHORITATIVE per-component inlet flows (a composition
    // disturbance never hides inside a renormalised z).
    BalanceFace in;
    in.id = name_ + ".feed";
    in.direction = BalanceFace::Direction::in;
    in.role = BalanceFace::Role::boundary;
    in.molarFlows.assign(nDotIn_.begin(), nDotIn_.end());
    if (canonicalEnergy_)
        for (std::size_t i = 0; i < N; ++i)
            in.enthalpyFlow_kW += nDotIn_[i] * hLiq_(i, T_in_);   // kmol/s·J/mol = kW
    bs.faces.push_back(std::move(in));

    // Outlet face: constant volume => F_out = F_in at the tank composition
    // (variable volume: the declared outflow at the current state).
    BalanceFace outF;
    outF.id = name_ + ".out";
    outF.direction = BalanceFace::Direction::out;
    outF.role = BalanceFace::Role::boundary;
    outF.molarFlows.assign(N, 0.0);
    scalar nTot = 0.0;
    for (auto v : n_) nTot += v;
    if (nTot > 0.0)
        for (std::size_t i = 0; i < N; ++i)
            outF.molarFlows[i] = Fout * n_[i] / nTot;
    //  The outlet leaves AT THE TANK'S STATE -- that is the CSTR assumption,
    //  and it is why the outlet term cancels out of the temperature ODE.  The
    //  ledger still needs it explicitly: the ODE's cancellation is between
    //  two things the balance reports separately.
    if (canonicalEnergy_)
        for (std::size_t i = 0; i < N; ++i)
            outF.enthalpyFlow_kW += outF.molarFlows[i] * hLiq_(i, T_);
    bs.faces.push_back(std::move(outF));

    bs.materialAvailable = true;
    bs.materialReason.clear();

    // ---- Energy ---------------------------------------------------------
    //  The refusal that stood here was correct about the equation it was
    //  describing.  On the canonical route it is no longer that equation:
    //  the vessel stores H(n,T) = Σ nᵢ hᵢ(T) on the elements datum, the
    //  temperature ODE is that H's exact derivative (see derivatives_), and
    //  every face above carries its enthalpy on the SAME surface -- so
    //  dH/dt − (Ḣ_in − Ḣ_out + Q) is zero by construction, and the ledger has
    //  something real to measure instead of a resemblance to check.
    //
    //  Off that route the old sentence still holds word for word, and still
    //  refuses.
    if (canonicalEnergy_)
    {
        bs.functional = BalanceSnapshot::EnergyFunctional::H;
        bs.physicalEnergyAvailable = true;
        bs.energyReason.clear();
        bs.storedEnergy_kJ = storedEnthalpy_();
        bs.heatInput_kW    = (UAnow / 1000.0) * (T_jacket_ - T_);   // kW
    }
    else if (mixtureH_)
    {
        //  The stored H IS the state on this route, and the faces are
        //  priced on the same mixture surface it lives on.
        bs.functional = BalanceSnapshot::EnergyFunctional::H;
        bs.physicalEnergyAvailable = true;
        bs.energyReason.clear();
        bs.storedEnergy_kJ = H_;
        bs.heatInput_kW    = (UAnow / 1000.0) * (T_jacket_ - T_);   // kW
        for (auto& fc : bs.faces)
        {
            if (fc.direction == BalanceFace::Direction::in)
                fc.enthalpyFlow_kW = F_in_ * hMix_(z_in_, T_in_);
            else
                fc.enthalpyFlow_kW = Fout * hMix_(n_, T_);
        }
    }
    else
    {
        bs.functional = BalanceSnapshot::EnergyFunctional::none;
        bs.physicalEnergyAvailable = false;
        bs.energyReason = isothermal_
            ? "the vessel is DECLARED isothermal: T is held and no energy"
              " equation is solved, so there is no stored functional to"
              " close a first law on"
            : "the dynamicCSTR energy equation is a Cp/convective"
              " model, not the exact derivative of a stored U(n,T) or H(n,T);"
              " a physical first-law closure requires the model reformulation";
    }
    return bs;
}

// ---------------------------------------------------------------------------
//  VARIABLE VOLUME (C205 slice 2).  Every number below is VariableVolumeHoldup's
//  (decision D4): this vessel only CALLS it.
// ---------------------------------------------------------------------------
DynamicCSTR::Resolved DynamicCSTR::resolveVariable_(const sVector& n, scalar T,
                                                    bool strict) const
{
    const std::string who = "dynamicCSTR '" + name_ + "'";
    Resolved r;
    r.liquid = VVH::liquidState(*thermo_, n, T, P_, who, "dynamicCSTR", name_);
    r.liquid.level = VVH::level(geom_, r.liquid.volume);
    if (outflow_ == Outflow::flow)
        r.F_out = F_out_set_;
    else
    {
        const scalar Q = VVH::valveVolumetricFlow(valve_, opening_,
            r.liquid.density, P_, r.liquid.level, strict, who);        // m3/s
        r.F_out = (r.liquid.meanMW > 0.0) ? Q * r.liquid.density / r.liquid.meanMW
                                          : 0.0;                       // kmol/s
    }
    r.UA = UAwetted_
        ? UA_ * VVH::wettedArea(geom_, r.liquid.level)
              / VVH::wettedArea(geom_, geom_.height)
        : UA_;
    return r;
}

void DynamicCSTR::checkAccepted_(scalar t) const
{
    const Resolved r = resolveVariable_(n_, T_, true);
    VVH::refuseDryOrOverflow(geom_, r.liquid, t, "dynamicCSTR '" + name_ + "'");
}

void DynamicCSTR::applyInletFlows_()
{
    scalar F = 0.0;
    for (auto v : nDotIn_) F += v;
    F_in_ = F;
    if (F > 0.0)
        for (std::size_t i = 0; i < nDotIn_.size(); ++i)
            z_in_[i] = nDotIn_[i] / F;
    // F == 0: keep the last z (a temporarily shut feed has no composition
    // of its own; the flows are authoritative and all zero).
}

void DynamicCSTR::setMV(const std::string& key, scalar value)
{
    if (key == "T_jacket") { T_jacket_ = value; return; }
    if (key == "T_in")     { T_in_     = value; return; }
    if (key == "F_out" || key == "opening")
    {
        if (!variableVolume_)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': mv " + key
                + " needs `operation { volumeMode variable; }` -- this vessel"
                " is constant-volume, its outflow IS its inflow (F_out = F_in)");
        if (key == "F_out")
        {
            if (outflow_ != Outflow::flow)
                throw std::runtime_error("DynamicCSTR '" + name_ + "': mv F_out"
                    " is the manipulated flow of `mode flow`; this vessel is in"
                    " `mode valve`, whose manipulated variable is `opening`");
            if (value < 0.0)
                throw std::runtime_error("DynamicCSTR '" + name_ + "': F_out"
                    " must be >= 0 (got " + std::to_string(value) + ")");
            F_out_set_ = value;
        }
        else
        {
            if (outflow_ != Outflow::valve)
                throw std::runtime_error("DynamicCSTR '" + name_ + "': mv"
                    " opening is the valve of `mode valve`; this vessel is in"
                    " `mode flow`, whose manipulated variable is `F_out`");
            if (value < 0.0 || value > 1.0)
                throw std::runtime_error("DynamicCSTR '" + name_ + "': opening"
                    " must lie in [0, 1] (got " + std::to_string(value) + ")");
            opening_ = value;
        }
        return;
    }
    if (key == "F_in")
    {
        if (value < 0.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': F_in"
                " must be ≥ 0 (got " + std::to_string(value) + ")");
        // Total-flow MV: scales the authoritative component flows
        // PROPORTIONALLY (composition preserved -- the historical F_in
        // semantics, now stated).
        if (F_in_ > 0.0)
        {
            const scalar f = value / F_in_;
            for (auto& v : nDotIn_) v *= f;
        }
        else
            for (std::size_t i = 0; i < nDotIn_.size(); ++i)
                nDotIn_[i] = value * z_in_[i];
        applyInletFlows_();
        return;
    }
    // ---- Inlet-field actuators (forum #100.4/#101/#103) ------------------
    if (key.rfind("moleFraction.", 0) == 0)
    {
        // ABSOLUTE mole fraction of one component; the OTHERS renormalise
        // proportionally and the TOTAL molar flow F_in is held.  Validated
        // hard: the disturbance never fabricates or destroys total feed.
        const std::string nm = key.substr(std::string("moleFraction.").size());
        const std::size_t c  = thermo_->indexOf(nm);
        if (value < 0.0 || value > 1.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " must lie in [0, 1] (got "
                + std::to_string(value) + ")");
        const scalar F = F_in_;
        scalar restOld = 0.0;
        for (std::size_t i = 0; i < z_in_.size(); ++i)
            if (i != c) restOld += z_in_[i];
        if (restOld <= 0.0 && value < 1.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " = " + std::to_string(value) + " needs the OTHER"
                " components renormalised proportionally, but they are all"
                " zero in the current inlet -- there is no proportion to"
                " preserve.  Use componentMolarFlow.<c> instead.");
        sVector zNew(z_in_.size(), 0.0);
        zNew[c] = value;
        const scalar scale = (restOld > 0.0) ? (1.0 - value) / restOld : 0.0;
        scalar sum = value;
        for (std::size_t i = 0; i < z_in_.size(); ++i)
        {
            if (i == c) continue;
            zNew[i] = z_in_[i] * scale;
            sum += zNew[i];
        }
        if (std::abs(sum - 1.0) > 1.0e-12)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " renormalisation failed the machine-precision sum"
                " check (sum = " + std::to_string(sum) + ")");
        for (std::size_t i = 0; i < zNew.size(); ++i)
            nDotIn_[i] = F * zNew[i];
        applyInletFlows_();
        return;
    }
    if (key.rfind("componentMolarFlow.", 0) == 0)
    {
        // ABSOLUTE molar flow of one component [kmol/s]; the others keep
        // their flows, so F_in and z_in both change by DERIVED values --
        // the disturbance never hides from the other components (#101).
        const std::string nm =
            key.substr(std::string("componentMolarFlow.").size());
        const std::size_t c = thermo_->indexOf(nm);
        if (value < 0.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " must be >= 0 kmol/s (got "
                + std::to_string(value) + ")");
        nDotIn_[c] = value;
        applyInletFlows_();
        return;
    }
    DynamicUnitOperation::setMV(key, value);  // throws
}

scalar DynamicCSTR::getCV(const std::string& key) const
{
    if (key == "T")        return T_;
    if (key == "T_jacket") return T_jacket_;
    if (key == "F_in")     return F_in_;
    if (key == "T_in")     return T_in_;

    if (key == "n_total")
    {
        scalar s = 0;
        for (auto v : n_) s += v;
        return s;
    }
    if (variableVolume_ && (key == "level" || key == "volume"
                            || key == "density" || key == "F_out"))
    {
        const Resolved r = resolveVariable_(n_, T_, false);
        if (key == "level")   return r.liquid.level;
        if (key == "volume")  return r.liquid.volume;
        if (key == "density") return r.liquid.density;
        return r.F_out;
    }
    if (variableVolume_ && key == "opening" && outflow_ == Outflow::valve)
        return opening_;
    // Try x_<name>
    if (key.rfind("x_", 0) == 0)
    {
        const std::string nm = key.substr(2);
        const std::size_t i  = thermo_->indexOf(nm);
        scalar nTot = 0; for (auto v : n_) nTot += v;
        return (nTot > 0) ? n_[i] / nTot : 0.0;
    }
    return DynamicUnitOperation::getCV(key);  // throws
}

std::vector<std::string> DynamicCSTR::availableMVs() const
{
    std::vector<std::string> v = { "T_jacket", "T_in", "F_in" };
    if (variableVolume_) v.push_back(outflow_ == Outflow::flow ? "F_out" : "opening");
    for (std::size_t i = 0; i < n_.size(); ++i)
    {
        v.push_back("moleFraction." + thermo_->comp(i).name());
        v.push_back("componentMolarFlow." + thermo_->comp(i).name());
    }
    return v;
}

std::vector<std::string> DynamicCSTR::availableCVs() const
{
    std::vector<std::string> v = { "T", "T_jacket", "F_in", "T_in", "n_total" };
    if (variableVolume_)
    {
        for (const char* k : { "level", "volume", "density", "F_out" }) v.push_back(k);
        if (outflow_ == Outflow::valve) v.push_back("opening");
    }
    for (std::size_t i = 0; i < n_.size(); ++i)
        v.push_back("x_" + thermo_->comp(i).name());
    return v;
}

} // namespace Choupo
