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

#include "BatchReactor.H"
#include <memory>
#include "thermo/PropertyDomainError.H"
#include "core/Constants.H"
#include "streams/Composition.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"
#include "thermo/ElementComposition.H"
#include "thermo/reaction/Reaction.H"
#include "unitOperations/reactor/ReactionHeat.H"
#include "unitOperations/reactor/CatalystPellet.H"
#include "thermo/ThermoAnnounce.H"
#include "solver/ODE/ODEIntegrator.H"
#include "solver/SparseLU.H"
#include "solver/ParallelFor.H"
#include "core/Advisory.H"
#include "core/RegistryRefusal.H"
#include <sstream>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <algorithm>
#include <cmath>
#include <iostream>
#include <cstdio>
#include <map>
#include <optional>
#include <stdexcept>
#include "thermo/heatCapacity/HeatCapacityModel.H"

namespace Choupo {

void BatchReactor::initialise(const DictPtr&       unitDict,
                              const ThermoPackage& thermo,
                              const DictPtr&       reactionsDict)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();

    // -----------------------------------------------------------------
    //  Initial state from `initial` sub-dict.
    // -----------------------------------------------------------------
    auto initDict = unitDict->subDict("initial");
    state_.T = initDict->lookupScalar("T");
    state_.P = initDict->lookupScalar("P");
    //  V is an input for every basis but gasConstantP, where it follows from
    //  (n, T, P); it is resolved after the energy basis is read (below).
    const bool vDeclared = initDict->found("V");
    if (vDeclared) state_.V = initDict->lookupScalar("V");
    const scalar nTot = initDict->lookupScalar("totalMoles");

    // Composition: molarComposition / massComposition / composition
    // all delegate to the shared readComposition helper, which returns
    // the canonical mole-fraction vector (mass fractions converted via
    // MW) and warns if the user-supplied values don't sum to 1.
    const sVector x =
        readComposition(initDict, thermo, "BatchReactor '" + name_ + "' init");
    state_.n.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTot * x[i];

    // -----------------------------------------------------------------
    //  Operation mode: isothermal | adiabatic
    // -----------------------------------------------------------------
    auto opDict = unitDict->subDict("operation");
    catalystLoading_ = opDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    //  The conversion is all it is: the pellet stays a POINT and eta = 1 is
    //  assumed.  Say so -- see reactor/CatalystPellet.H.
    announceUnresolvedPellet("batchReactor '" + name() + "'",
                             catalystLoading_, thermoAnnounceLevel());
    const std::string mode = opDict->lookupWordOrDefault("mode", "isothermal");
    if (mode == "isothermal")
    {
        mode_       = Mode::Isothermal;
        T_setpoint_ = opDict->found("T_setpoint")
                      ? opDict->lookupScalar("T_setpoint")
                    : state_.T;
        state_.T    = T_setpoint_;
    }
    else if (mode == "adiabatic")
    {
        mode_       = Mode::Adiabatic;
        T_setpoint_ = 0;
        // state_.T is the initial temperature; it evolves with the
        // energy balance from here on.
    }
    else
    {
        throw std::runtime_error("BatchReactor: unknown mode '" + mode
            + "' (expected 'isothermal' or 'adiabatic')");
    }

    // -----------------------------------------------------------------
    //  Optional time-integrator selection.
    //      solver { integrator RK4 | EulerSI | Rosenbrock23; }
    //  Default RK4 -- the classic explicit step every batch tutorial uses,
    //  so omitting the block changes nothing.  Stiff chemistry (detailed
    //  kinetics) selects Rosenbrock23.
    // -----------------------------------------------------------------
    // Default verbosity = the run's controlDict level (mirrored into the
    // load-phase announce gate by every application main).  Without this,
    // the resolved dH_rxn announcement (gated >= 2 in reactionHeat) never
    // printed for the common no-`solver{}`-block case: the old hardcoded
    // member default of 1 silently out-voted the case's verbosity 3.
    verbosity_ = thermoAnnounceLevel();
    std::string jacKey;                    // `jacobian` as declared ("" = absent)
    jacobianDeclared_ = false;
    jacobianAnalytic_ = false;
    vesselsCoupled_   = false;
    denseHermite_     = false;
    vesselsDeclared_  = false;
    linearSolverKey_  = LinearSolver::Auto;
    if (unitDict->found("solver"))
    {
        auto solverDict = unitDict->subDict("solver");
        integrator_ = solverDict->lookupWordOrDefault("integrator", "RK4");
        integratorDeclared_ = solverDict->found("integrator");
        //  Threads for the independent integrations of a sensitivity block (0 =
        //  the default rule, allowed CPUs - 2; CHOUPO_THREADS caps it).
        const scalar thr = solverDict->lookupScalarOrDefault("threads", 0.0);
        if (!(thr >= 0.0) || thr != std::floor(thr))
            throw std::runtime_error("BatchReactor '" + name_ + "': solver { threads "
                + std::to_string(thr) + "; } -- a whole number >= 1 (0 or absent: the"
                " default, allowed CPUs - 2)");
        sensThreads_ = static_cast<std::size_t>(thr);
        //  How the vessels of a run are integrated: `independent` (the default:
        //  each independent vessel on its own step, choupoBatch) or `coupled`
        //  (all on one step, the historic sweep).
        const std::string ves = solverDict->lookupWordOrDefault("vessels", "independent");
        vesselsDeclared_ = solverDict->found("vessels");
        if      (ves == "coupled")     vesselsCoupled_ = true;
        else if (ves == "independent") vesselsCoupled_ = false;
        else
            throw std::runtime_error("BatchReactor '" + name_ + "': solver"
                " { vessels " + ves + "; } -- "
                + registryRefusal::message("vessels", ves,
                      { "independent", "coupled" }, "Accepted"));
        //  How the rows BETWEEN two steps are written (adaptive free stepping):
        //  `integrator` (the default: the integrator's own dense output, Theory
        //  Guide sec:batch-dense-output) or `hermite` (the driver's cubic Hermite
        //  of the step's ends and slopes, the interpolant of every integrator
        //  before 2026-11-22).  A declared choice, announced in the run.
        const std::string dns = solverDict->lookupWordOrDefault("denseOutput", "integrator");
        if      (dns == "hermite")    denseHermite_ = true;
        else if (dns == "integrator") denseHermite_ = false;
        else
            throw std::runtime_error("BatchReactor '" + name_ + "': solver"
                " { denseOutput " + dns + "; } -- "
                + registryRefusal::message("denseOutput", dns,
                      { "integrator", "hermite" }, "Accepted"));
        // The stiff integrators announce their step/stiffness verdict at
        // verbosity>=3 (numerical-honesty credo).  Read it here, default =
        // the run level so a case that opted into a stiff method still gets
        // the lesson; an explicit per-unit value overrides.
        verbosity_  = static_cast<int>(
            solverDict->lookupScalarOrDefault("verbosity", verbosity_));
        //  The stiff integrators' Jacobian.  Absent the key: ANALYTIC when
        //  every reaction's law has an analytic derivative (decided below,
        //  once the reactions are read), else the finite difference.
        //  `finiteDifference` forces the integrator's dense difference (n + 1
        //  right-hand sides per Jacobian); `analytic` forces odeJacobian,
        //  differencing reaction by reaction a law that has no derivative.
        //  Either analytic Jacobian is AUDITED against the difference
        //  (ODEAnalyticJacobian).  Only the Rosenbrock methods read it; an
        //  explicit RK4 / EulerSI beside a DECLARED `analytic` is a
        //  contradiction refused here, and the default RK4 of a fixed-step run
        //  beside it is refused at the first step (an adaptive run integrates
        //  the ODE vessels with the declared Rosenbrock scheme, Rosenbrock23
        //  when none is, and reads it there).
        jacKey = solverDict->lookupWordOrDefault("jacobian", "");
        if (jacKey == "analytic")               jacobianDeclared_ = true;
        else if (jacKey == "finiteDifference" || jacKey.empty()) {}
        else
            throw std::runtime_error("BatchReactor '" + name_ + "': solver"
                " { jacobian " + jacKey + "; } -- "
                + registryRefusal::message("jacobian", jacKey,
                      { "finiteDifference", "analytic" }, "Accepted"));
        jacobianAnalytic_ = jacobianDeclared_;
        //  The linear solver of W = I - h d J: `dense` (LU with partial
        //  pivoting, the default for a small vessel), `sparse` (SparseLU on
        //  the network's pattern, Theory Guide sec:sparse-lu) or `auto`
        //  (sparse from kSparseAutoRows packed rows, the size at which it was
        //  MEASURED to pay).  Sparse needs the analytic Jacobian's pattern.
        const std::string ls = solverDict->lookupWordOrDefault("linearSolver", "auto");
        if      (ls == "dense")  linearSolverKey_ = LinearSolver::Dense;
        else if (ls == "sparse") linearSolverKey_ = LinearSolver::Sparse;
        else if (ls == "auto")   linearSolverKey_ = LinearSolver::Auto;
        else
            throw std::runtime_error("BatchReactor '" + name_ + "': solver"
                " { linearSolver " + ls + "; } -- "
                + registryRefusal::message("linearSolver", ls,
                      { "dense", "sparse", "auto" }, "Accepted"));
        if (jacobianDeclared_ && solverDict->found("integrator")
            && !solver::ODEIntegrator::readsAnalyticJacobian(integrator_))
            throw std::runtime_error("BatchReactor '" + name_ + "': solver"
                " { integrator " + integrator_ + "; jacobian analytic; } --"
                " the analytic Jacobian is read by the stiff methods"
                " only (Rosenbrock23, Rodas4, seulex); " + integrator_ + " would"
                " leave it unread.  Choose a stiff integrator or drop"
                " `jacobian analytic;`.");
    }

    // -----------------------------------------------------------------
    //  Adiabatic energy basis (only consulted in adiabatic mode).
    //      operation { mode adiabatic; energy gasConstantV | liquidDH; }
    //  Default liquidDH = the legacy per-reaction-ΔH / liquid-Cp path, so
    //  every existing adiabatic tutorial is unchanged.  gasConstantV is the
    //  closed fixed-volume gas-phase balance for combustion (heat release from
    //  the species' formation enthalpies, gas Cv).
    // -----------------------------------------------------------------
    {
        const std::string ebasis = opDict->lookupWordOrDefault("energy", "liquidDH");
        if      (ebasis == "liquidDH")     energy_ = Energy::LiquidDH;
        else if (ebasis == "gasConstantV") energy_ = Energy::GasConstantV;
        else if (ebasis == "gasConstantP") energy_ = Energy::GasConstantP;
        else throw std::runtime_error("BatchReactor: unknown energy basis '"
                + ebasis + "' (expected 'liquidDH', 'gasConstantV' or"
                " 'gasConstantP')");
        if (energy_ == Energy::GasConstantP)
        {
            //  V follows from the ideal-gas law at the declared P.  A declared
            //  V that disagrees is two answers to one question: refused.
            scalar nT = 0.0;
            for (scalar v : state_.n) nT += v;
            const scalar Vp = constPVolume_(nT, state_.T);
            if (vDeclared && std::abs(state_.V - Vp) > 1.0e-6 * Vp)
                throw std::runtime_error("BatchReactor '" + name_ + "': `energy"
                    " gasConstantP;` fixes P = " + std::to_string(state_.P)
                    + " Pa, so V = n R T / P = " + std::to_string(Vp)
                    + " m3, but `initial` declares V = "
                    + std::to_string(state_.V) + " m3.  Drop `V` (it is"
                    " derived) or make it consistent.");
            state_.V = Vp;
        }
        else if (!vDeclared)
            state_.V = initDict->lookupScalar("V");   // refuses by name, as before
    }

    // -----------------------------------------------------------------
    //  Reaction(s) lookup.  Backward-compat: accept either
    //      reaction   name;            (single)
    //  or
    //      reactions  (name1 name2... );   (list)
    // -----------------------------------------------------------------
    if (!reactionsDict)
        throw std::runtime_error("BatchReactor: case has no reactions library"
            " (constant/reactions); cannot resolve reaction reference");

    std::vector<std::string> rxnNames;
    if (unitDict->found("reactions"))
        rxnNames = unitDict->lookupWordList("reactions");
    else if (unitDict->found("reaction"))
        rxnNames = { unitDict->lookupWord("reaction") };
    else
        throw std::runtime_error("BatchReactor: unit needs `reaction` (single)"
            " or `reactions` (list) entry");

    reactions_.clear();
    reactions_.reserve(rxnNames.size());
    for (const auto& rxnName : rxnNames)
    {
        auto rxn = kineticsLibrary::materialise(reactionsDict, thermo)->subDict(rxnName);   // C458: a set by name, else the dict itself
        ReactionSpec r;
        r.name = rxnName;

        //  The vessel's OWN words read a power-law `order` per reactant; a
        //  factory law (LHHW, expression, a user law) reads its own
        //  stoichiometry and refuses what it does not read.
        const std::string ktypeEarly = rxn->subDict("kinetics")->lookupWord("type");
        //  C190 item 14.  An EXPLICIT reverse pair (`A_rev`/`Ea_rev`) is a fact
        //  about the mechanism that only the shared RateLaw reads: the vessel's
        //  own Arrhenius product is the forward leg alone, so a reaction that
        //  declared the pair ran IRREVERSIBLE here at exit 0 (DynamicCSTR has
        //  routed it to RateLaw since C131).  It is routed to the one home, and
        //  on the words RateLaw does not serve the pair is refused by name.
        const auto kinEarly = rxn->subDict("kinetics");
        const bool explicitReverse = kinEarly->found("A_rev") || kinEarly->found("Ea_rev");
        if (explicitReverse && (ktypeEarly == "modifiedArrhenius"
                             || ktypeEarly == "thirdBody" || ktypeEarly == "falloff"))
            throw std::runtime_error("BatchReactor: reaction '" + rxnName + "': `A_rev`/"
                "`Ea_rev` is declared on kinetics `type " + ktypeEarly + "`, whose reverse"
                " leg the vessel does not read -- it would run IRREVERSIBLE.  Declare the pair"
                " on `type Arrhenius` (the shared rate law reads both legs), or use `reversible"
                " true;` (detailed balance) where the law is mass-action.");
        if (kinEarly->found("A_rev") != kinEarly->found("Ea_rev"))
            throw std::runtime_error("BatchReactor: reaction '" + rxnName + "': the explicit reverse"
                " leg is a PAIR -- `A_rev` and `Ea_rev` together; one alone would be read as"
                " no reverse leg at all.");
        if (explicitReverse && kinEarly->found("units"))
            throw std::runtime_error("BatchReactor: reaction '" + rxnName + "': `A_rev`/`Ea_rev`"
                " beside a CHEMKIN `units` block -- the shared rate law that reads the reverse"
                " leg does no cm-mol-s conversion.  Give both legs in SI (kmol, m3, s; J/mol)"
                " and drop the `units` block.");
        const bool ownLaw = !explicitReverse
                         && (ktypeEarly == "Arrhenius" || ktypeEarly == "modifiedArrhenius"
                          || ktypeEarly == "thirdBody" || ktypeEarly == "falloff");

        auto stoich = rxn->lookupDictList("stoichiometry");
        r.comps.reserve(stoich.size());
        r.nu.reserve(stoich.size());
        r.order.reserve(stoich.size());
        for (const auto& s : stoich)
        {
            const std::string cname = s->lookupWord("component");
            r.comps.push_back(thermo.indexOf(cname));
            r.nu.push_back(s->lookupScalar("nu"));
            // This USED to accept a reactant with no `order` and silently give it
            // exponent 0, and the comment here recorded why: requiring it in the
            // batch vessel alone made the same shared reaction library legal in a
            // CSTR and illegal here.  That diagnosis was right and the remedy was
            // backwards -- it made the LOOSE reading uniform instead of the strict
            // one.  Now all five readers go through Reaction::forwardOrder, so the
            // asymmetry that forced the retreat is gone.
            r.order.push_back(ownLaw ? Reaction::forwardOrder(
                *s, r.nu.back(), s->lookupWord("component"), "batchReactor") : 0.0);
            //  The reverse leg's power: the product count, max(nu, 0), unless a
            //  species on BOTH sides declares it (`orderRev`, its product count;
            //  the pair is held to order - orderRev = -nu below, by the one
            //  detailed-balance rule).
            r.orderRev.push_back(s->lookupScalarOrDefault(
                "orderRev", r.nu.back() > 0.0 ? r.nu.back() : 0.0));
        }

        auto kin = rxn->subDict("kinetics");
        const std::string ktype = kin->lookupWord("type");

        // Molecularity (for the cm-mol-s -> SI A conversion) = the SUM of the
        // declared orders, decided ONLY when a cm unit asks for it (a
        // fractional-order law in SI never needs it).  SUM first, then decide:
        // `Reaction::chemkinMolecularity` is the one home and refuses a
        // non-integer sum (C190 item 13: each order used to be rounded BEFORE
        // the sum, orders 0.5 + 1.5 read as 1 + 2, A 1000x too low).
        const auto usesCm = [](const DictPtr& d)
        {
            return d->found("units")
                && d->subDict("units")->lookupWordOrDefault("A", "").find("cm")
                       != std::string::npos;
        };
        const auto molec = [&]() -> int
        {
            return Reaction::chemkinMolecularity(r.order, rxnName, "batchReactor");
        };

        // Optional units block: convert CHEMKIN cm-mol-s / cal-mol to SI on
        // load (and announce it).  Absent => values already SI (legacy).
        const auto convA  = [&](scalar A, int extra)
        { return usesCm(kin) ? ckA_(kin, A, molec() + extra) : A; };
        const auto convEa = [&](scalar Ea)           { return ckEa_(kin, Ea);     };

        //  Keys only some of the vessel's own words read: refused by name on
        //  the others (a silently ignored `sri` would run the reaction on
        //  Lindemann, a silently ignored `defaultEfficiency` on [M] = sum c).
        if (ownLaw)
        {
            if (kin->found("sri") && ktype != "falloff")
                throw std::runtime_error("BatchReactor: reaction '" + rxnName + "': `sri` is"
                    " the broadening of a fall-off; `type " + ktype + "` reads none.");
            if (kin->found("defaultEfficiency") && ktype != "thirdBody" && ktype != "falloff")
                throw std::runtime_error("BatchReactor: reaction '" + rxnName + "':"
                    " `defaultEfficiency` belongs to a collider ([M]) -- `type thirdBody` or"
                    " `falloff`; `type " + ktype + "` has none.");
            if (kin->found("defaultEfficiency") && !kin->found("thirdBody"))
                throw std::runtime_error("BatchReactor: reaction '" + rxnName + "':"
                    " `defaultEfficiency` without a `thirdBody { species eff; }` block --"
                    " name the colliders it does not cover (`thirdBody { AR 1; }` with"
                    " `defaultEfficiency 0;` is CHEMKIN's `(+AR)`).");
        }

        if (ktype == "Arrhenius" && !explicitReverse)
        {
            r.form  = RateForm::Arrhenius;
            r.A_pre = convA(kin->lookupScalar("A"), 0);
            r.Ea    = convEa(kin->lookupScalar("Ea"));
        }
        else if (ktype == "modifiedArrhenius")
        {
            r.form  = RateForm::ModArrhenius;
            r.A_pre = convA(kin->lookupScalar("A"), 0);
            r.b     = kin->lookupScalar("b");
            r.Ea    = convEa(kin->lookupScalar("Ea"));
        }
        else if (ktype == "thirdBody")
        {
            // k·[M], [M] from per-species efficiencies; molecularity gains the
            // +M, so the A conversion uses molecularity+1.
            r.form  = RateForm::ThirdBody;
            r.A_pre = convA(kin->lookupScalar("A"), 1);
            r.b     = kin->lookupScalarOrDefault("b", 0.0);
            r.Ea    = convEa(kin->lookupScalar("Ea"));
            r.tbEff = thirdBodyEfficiencies_(kin, thermo);
        }
        else if (ktype == "falloff")
        {
            // High-pressure limit kInf on the main A/b/Ea; low-pressure kLow in
            // a `low {…}` sub-dict (molecularity+1); optional `troe ( … )`.
            r.form  = RateForm::Falloff;
            r.A_pre = convA(kin->lookupScalar("A"), 0);        // kInf
            r.b     = kin->lookupScalarOrDefault("b", 0.0);
            r.Ea    = convEa(kin->lookupScalar("Ea"));
            auto low = kin->subDict("low");
            r.A_low  = usesCm(low) ? ckA_(low, low->lookupScalar("A"), molec() + 1)
                                   : low->lookupScalar("A");
            r.b_low  = low->lookupScalarOrDefault("b", 0.0);
            r.Ea_low = ckEa_(low, low->lookupScalar("Ea"));
            if (kin->found("troe")) r.troe = kin->lookupList("troe");
            if (kin->found("sri"))  r.sri  = kin->lookupList("sri");
            Reaction::checkFalloffShape(r.troe, r.sri,
                                        "BatchReactor: reaction '" + rxnName + "'");
            r.tbEff = kin->found("thirdBody")
                      ? thirdBodyEfficiencies_(kin, thermo) : sVector{};
        }
        else if (ReactionRate::isRegistered(ktype))
        {
            // A FACTORY law -- LHHW (Langmuir-Hinshelwood-Hougen-Watson), a
            // `type expression` written in the case, or a law a case's code/
            // registered.  No CHEMKIN unit conversion and no molecularity: such
            // a law is reported in whatever basis its source used (`type plog`
            // converts its own cm-mol-s A).  The vessel offers a pressure only
            // for an ideal gas (`energy gasConstantV` or `gasConstantP`), as
            // P = n R T / V; a law that reads P refuses here otherwise.
            // c_i = n_i / V in kmol/m3.
            r.form = RateForm::Factory;
            RateOffer offer;
            //  P = n R T / V exists only for the closed ideal gas: at constant V
            //  it is the state's pressure, at constant P the volume is n R T / P
            //  so the same expression returns the fixed P.  A liquid vessel
            //  carries none.
            offer.pressure = (energy_ == Energy::GasConstantV || energy_ == Energy::GasConstantP);
            offer.pressureAbsent = "a batchReactor reads a pressure only for an ideal"
                " gas (`energy gasConstantV;` or `gasConstantP;`, P = n R T / V); this"
                " liquid vessel carries none.";
            offer.concentrationBasis = "n_i / V";
            const std::string who = "BatchReactor: reaction '" + rxnName + "'";
            r.law = ReactionRate::New(rxn, thermo, who, offer);
            r.law->checkLoading(catalystLoading_ > 0.0, who);
        }
        else
        {
            std::vector<std::string> words = { "Arrhenius", "modifiedArrhenius",
                                               "thirdBody", "falloff" };
            for (const auto& w : ReactionRate::availableTypes())
                if (std::find(words.begin(), words.end(), w) == words.end())
                    words.push_back(w);
            throw std::runtime_error("BatchReactor: reaction '" + rxnName + "': "
                + registryRefusal::message("kinetics type", ktype, words, "Accepted"));
        }

        // Heat of reaction on the ONE enthalpy base (elements/formation datum).
        // Resolved ONCE here through the shared helper so the LiquidDH and
        // GasConstantV bases speak the SAME convention: when every reacting
        // species carries standardThermochemistry, dH_rxn(T) = Σ νᵢ·hᵢ(T) is authoritative
        // (LiquidDH -> h_formation(T,"liquid"); GasConstantV -> h_pure_ig), and a
        // present dict `dH_rxn` is cross-checked (mismatch warned, never silently
        // overriding); species lacking formation data fall to the announced dict
        // override.  Only consulted for the energy balance in ADIABATIC mode --
        // isothermal pins T, so its heat of reaction is inert and we skip the
        // resolve/announce to keep those cases byte-identical and quiet.
        const std::string heatCtx = "BatchReactor '" + name_ + "' reaction '" + rxnName + "'";
        const std::optional<scalar> dictDH = resolveDeclaredHeat(thermo, r.comps, r.nu, parseDeclaredHeat(*rxn, heatCtx), heatCtx, verbosity_).overrideForResolver;
        {
            // Resolved in BOTH modes since the energy ledger (phase (a)):
            // the isothermal jacket duty IS this heat of reaction -- the old
            // "isothermal pins T, dH is inert" shortcut hid the one number
            // the student's cooling-duty question needs.  A reaction that
            // resolves to "none" (no formation data, no override) does not
            // throw: it POISONS the duty record, named below.
            const std::string phase =
                isGas_() ? "gas" : "liquid";
            std::string heatSource;
            r.dH = reactionHeat(thermo, r.comps, r.nu, state_.T, phase, dictDH,
                                "BatchReactor '" + name_ + "' reaction '"
                                    + rxnName + "'",
                                verbosity_, heatSource);
            if (heatSource == "none")
                dutyMissing_.push_back("reaction '" + rxnName
                    + "': no formation data and no dH_rxn override");
        }

        // Optional reversible flag: k_rev derived from k_fwd / K_eq
        // by detailed balance, K_eq(T) re-evaluated each step (T may drift in
        // adiabatic mode) --- see rateOfReaction_.
        r.reversible = rxn->lookupWordOrDefault("reversible", "false") == "true";
        if (r.reversible && r.form != RateForm::Factory)
            Reaction::refuseNonMassActionDetailedBalance(*rxn, rxnName,
                "BatchReactor '" + name_ + "'");

        reactions_.push_back(std::move(r));
    }

    // Energy-ledger duty branch, decided once: state-difference pricing
    // needs h_i(T) for EVERY species any reaction touches (the Hess identity
    // Sum_j dH_j*dXi_j == Sum_i dn_i*h_i(T) only holds on the full formation
    // datum); otherwise fall to per-reaction extents with the announced
    // overrides.  dutyMissing_ non-empty overrides both (poisoned, named).
    {
        dutyByStateDiff_ = true;
        for (const auto& r : reactions_)
            for (std::size_t s = 0; s < r.comps.size(); ++s)
                if (!thermo.comp(r.comps[s]).hasGibbsData())
                    dutyByStateDiff_ = false;
    }
    announceLibraryChecks_(kineticsLibrary::materialise(reactionsDict, thermo));   // C458 (e), (f): prints only
    if (mode_ == Mode::Adiabatic) requireAdiabaticData_();

    // -----------------------------------------------------------------
    //  The Jacobian, resolved now that every law is known.  A law built by
    //  the factory without an analytic derivative (LHHW, `type expression`,
    //  a case's own law) is differenced reaction by reaction; absent the
    //  key, such a law keeps the WHOLE vessel on the finite difference (the
    //  analytic default is for vessels whose every reaction has one).
    // -----------------------------------------------------------------
    fdLaw_.assign(reactions_.size(), 0);
    bool allAnalytic = true;
    for (std::size_t j = 0; j < reactions_.size(); ++j)
        if (reactions_[j].form == RateForm::Factory && !reactions_[j].law->hasAnalyticGradient())
        { fdLaw_[j] = 1; allAnalytic = false; }
    if (jacKey.empty()) jacobianAnalytic_ = allAnalytic;
    if (jacobianDeclared_ && verbosity_ >= 1)
        for (std::size_t j = 0; j < reactions_.size(); ++j)
            if (fdLaw_[j])
            {
                const std::string m = "reaction '" + reactions_[j].name + "' (`type "
                    + reactions_[j].law->typeName() + "`) has no analytic derivative:"
                    " its columns of the analytic Jacobian are a forward difference of"
                    " that reaction's rate alone";
                if (AdvisoryLog::instance().addAnnouncedOnce(
                        "batchReactor-jacFD:" + name_ + ":" + reactions_[j].name,
                        "numerics", "info", "batchReactor '" + name_ + "'", m))
                    std::cout << "  [jacobian] batchReactor '" << name_ << "': " << m << "\n";
            }
    buildWantG_();
    buildTbClasses_();      // the evaluation's shared tables
    if (jacobianAnalytic_) buildJacobianStructure_();
    if (linearSolverKey_ == LinearSolver::Sparse && !jacobianAnalytic_)
        throw std::runtime_error("BatchReactor '" + name_ + "': solver { linearSolver"
            " sparse; } factors W on the pattern of the ANALYTIC Jacobian, and this vessel"
            " integrates on the finite difference ("
            + std::string(jacKey == "finiteDifference" ? "`jacobian finiteDifference;`"
                          : "a law without an analytic derivative; declare `jacobian analytic;`")
            + ").  Drop `linearSolver sparse;` or use the analytic Jacobian.");
    sparseLinear_ = jacobianAnalytic_
        && (linearSolverKey_ == LinearSolver::Sparse
            || (linearSolverKey_ == LinearSolver::Auto && thermo.n() + 1 >= kSparseAutoRows));

    // -----------------------------------------------------------------
    //  Optional rates-of-production report (opt-in; absent = nothing runs).
    //      rateOfProduction { times ( t1 t2 ... ); top N; }
    // -----------------------------------------------------------------
    ropTimes_.clear();
    ropNext_ = 0;
    pfElements_.clear();
    pfFileStarted_ = false;
    if (unitDict->found("rateOfProduction"))
    {
        const std::string who = "BatchReactor '" + name_ + "': rateOfProduction";
        auto rop = unitDict->subDict("rateOfProduction");
        for (const auto& k : rop->keys())
            if (k != "times" && k != "top" && k != "pathFlux")
                throw std::runtime_error(who + ": unknown key '" + k
                    + "' (the block reads `times ( ... );`, `top N;` and `pathFlux ( elements );`)");
        if (!rop->found("times"))
            throw std::runtime_error(who + ": `times ( t1 t2 ... );` is required"
                " -- the instants [s] at which to report which reactions make and"
                " destroy each species");
        ropTimes_ = rop->lookupList("times");
        if (ropTimes_.empty())
            throw std::runtime_error(who + ": `times` is empty");
        std::sort(ropTimes_.begin(), ropTimes_.end());
        const scalar top = rop->lookupScalarOrDefault("top", 5.0);
        if (!(top >= 1.0) || top != std::floor(top))
            throw std::runtime_error(who + ": `top` must be a positive integer, got "
                + std::to_string(top));
        ropTop_ = static_cast<std::size_t>(top);

        // pathFlux ( H O ); -- the element path flux of phase 2.
        if (rop->found("pathFlux"))
        {
            pfElements_ = rop->lookupWordList("pathFlux");
            if (pfElements_.empty())
                throw std::runtime_error(who + ": `pathFlux ( ... );` is empty -- list"
                    " the elements, e.g. `pathFlux ( H O );`");
            for (std::size_t a = 0; a < pfElements_.size(); ++a)
                for (std::size_t b = a + 1; b < pfElements_.size(); ++b)
                    if (pfElements_[a] == pfElements_[b])
                        throw std::runtime_error(who + ": pathFlux lists element '"
                            + pfElements_[a] + "' twice");
            // Every reaction is split and checked NOW, so a refusal comes at
            // the start of the run and not at the first reported instant.
            for (const auto& e : pfElements_)
            {
                bool seen = false;
                for (std::size_t j = 0; j < reactions_.size(); ++j)
                    seen = pathSplit_(j, e).present || seen;
                if (!seen)
                    throw std::runtime_error(who + ": pathFlux element '" + e
                        + "' is in no species of any reaction of this vessel");
            }
        }
    }

    // -----------------------------------------------------------------
    //  Optional ignition-delay sensitivity (opt-in; absent = nothing runs).
    //      sensitivity { response tauIgnition; factor 1.1; reactions all;
    //                    top 10; rise 400; }
    //  The N+1 integrations run in setRunWindow, from the initial state.
    // -----------------------------------------------------------------
    sensOn_ = false;
    sensResults_.clear();
    sensReactions_.clear();
    if (unitDict->found("sensitivity"))
    {
        const std::string who = "BatchReactor '" + name_ + "': sensitivity";
        auto sd = unitDict->subDict("sensitivity");
        for (const auto& k : sd->keys())
            if (k != "response" && k != "factor" && k != "reactions"
                && k != "top" && k != "rise")
                throw std::runtime_error(who + ": unknown key '" + k
                    + "' (the block reads `response tauIgnition;`, `factor f;`,"
                      " `reactions all | ( names );`, `top N;` and `rise K;`)");
        const std::string resp = sd->lookupWordOrDefault("response", "tauIgnition");
        if (resp != "tauIgnition")
            throw std::runtime_error(who + ": response '" + resp
                + "' is not known; the only response is `tauIgnition` (the"
                  " time T first exceeds T0 + rise)");
        sensFactor_ = sd->lookupScalarOrDefault("factor", 1.1);
        if (!(sensFactor_ > 1.0))
            throw std::runtime_error(who + ": `factor` must be > 1 (it multiplies"
                " the rate of one reaction at a time); got "
                + std::to_string(sensFactor_));
        sensRise_ = sd->lookupScalarOrDefault("rise", 400.0);
        if (!(sensRise_ > 0.0))
            throw std::runtime_error(who + ": `rise` [K] must be > 0");
        const scalar top = sd->lookupScalarOrDefault("top", 10.0);
        if (!(top >= 1.0))
            throw std::runtime_error(who + ": `top` must be >= 1");
        sensTop_ = static_cast<std::size_t>(top);
        if (sd->found("reactions"))
        {
            std::vector<std::string> names;
            try { names = { sd->lookupWord("reactions") }; }
            catch (const std::exception&) { names = sd->lookupWordList("reactions"); }
            if (!(names.size() == 1 && names[0] == "all"))
            {
                for (const auto& nm : names)
                {
                    bool ok = false;
                    for (const auto& r : reactions_) ok = ok || r.name == nm;
                    if (!ok)
                        throw std::runtime_error(who + ": reaction '" + nm
                            + "' is not one of this vessel's reactions");
                }
                sensReactions_ = names;
            }
        }
        if (mode_ != Mode::Adiabatic)
            throw std::runtime_error(who + ": tauIgnition needs `mode adiabatic;`"
                " (T must rise by itself for an ignition delay to exist)");
        if (integrator_ != "Rosenbrock23" && integrator_ != "Rodas4")
            throw std::runtime_error(who + ": the N+1 integrations are stiff;"
                " declare `solver { integrator Rosenbrock23; }` (or Rodas4) -- "
                + integrator_ + " is refused");
        sensOn_ = true;
    }
}

// -----------------------------------------------------------------------
//  The reactant / product split of reaction j for element e, from the
//  stoichiometry entries as the dictionary lists them: an entry with nu < 0
//  is a reactant (coefficient -nu), nu > 0 a product, and a species listed
//  twice (once on each side) keeps both halves.  A species written ONCE with
//  its net coefficient has lost its split: the flux is then built on the net,
//  so a species that is on both sides of the real step must be listed as two
//  entries.  What is refused by name: an entry with nu = 0 (no side), a
//  species whose elemental composition the package cannot resolve, and a
//  reaction whose reactant and product atoms of e differ (the normalisation
//  N_ej would then not be defined).
// -----------------------------------------------------------------------
BatchReactor::PathSplit BatchReactor::pathSplit_(std::size_t j, const std::string& e) const
{
    const ReactionSpec& rx = reactions_[j];
    const std::string who = "BatchReactor '" + name_ + "': pathFlux, reaction '" + rx.name + "'";
    PathSplit ps;
    scalar nR = 0.0, nP = 0.0;
    for (std::size_t s = 0; s < rx.comps.size(); ++s)
    {
        if (rx.nu[s] == 0.0)
            throw std::runtime_error(who + ": species '" + thermo_->comp(rx.comps[s]).name()
                + "' has nu = 0 -- it belongs to neither side, so the reactant/product split"
                " cannot be recovered; list it as two entries (nu -1 and nu +1) or remove it");
        const auto er = elementalCompositionOf(thermo_->comp(rx.comps[s]));
        if (er.completeness == ElementalResolution::Completeness::unavailable)
            throw std::runtime_error(who + ": species '" + thermo_->comp(rx.comps[s]).name()
                + "' has no elemental composition (" + er.reason + ")");
        const auto it = er.atoms.find(e);
        const scalar a = (it == er.atoms.end()) ? 0.0 : it->second;
        if (a == 0.0) continue;
        ps.present = true;
        const scalar w = std::fabs(rx.nu[s]) * a;           // nu a_e
        (rx.nu[s] < 0.0 ? ps.reactants : ps.products).emplace_back(rx.comps[s], w);
        (rx.nu[s] < 0.0 ? nR : nP) += w;
    }
    if (std::fabs(nR - nP) > 1.0e-9 * std::max(nR, nP))
    {
        std::ostringstream os;
        os << who << ": element " << e << " is not conserved by the stoichiometry (reactants "
           << nR << ", products " << nP << " atoms) -- the path flux is normalised by that"
           " count and would not be defined";
        throw std::runtime_error(os.str());
    }
    ps.N = nR;
    return ps;
}

void BatchReactor::setRunWindow(scalar t0, scalar t1)
{
    for (scalar tr : ropTimes_)
        if (tr < t0 || tr > t1)
        {
            std::ostringstream os;
            os << "BatchReactor '" << name_ << "': rateOfProduction time " << tr
               << " s is outside the run [startTime, endTime] = [" << t0 << ", "
               << t1 << "] s";
            throw std::runtime_error(os.str());
        }
    if (sensOn_) runSensitivity_(t1 - t0);
}

// -----------------------------------------------------------------------
//  IGNITION-DELAY SENSITIVITY (brute force).  Theory Guide
//  sec:ignition-sensitivity.
//
//      tau(m)  = the time at which T first exceeds T0 + rise, LINEARLY
//                INTERPOLATED between the two accepted states that bracket it
//      S_j     = ( ln tau(m_j = factor) - ln tau(m = 1) ) / ln factor
//              = d ln tau / d ln k_j        (a forward difference in ln k_j)
//
//  m_j multiplies the NET rate r_j (forward and reverse together, so K_c and
//  the final equilibrium are untouched; Cantera's set_multiplier).  The base
//  run and every perturbed run use the same integrator, tolerances and tau
//  definition, so the integrator's own bias cancels in the difference.
// -----------------------------------------------------------------------
bool BatchReactor::sensitivityTau_(const sVector& y0, scalar tMax,
                                   scalar& tau, scalar& Tend, std::string& why)
{
    const std::size_t n = y0.size() - 1;
    const scalar Tthr = y0[n] + sensRise_;
    auto integ = solver::ODEIntegrator::New(integrator_);
    solver::DerivFn f = [this](scalar, const sVector& y) { return derivatives_(y); };
    solver::ODEControls ctrl;
    ctrl.atol.assign(n + 1, 1.0e-18);
    ctrl.atol[n] = 1.0e-8;
    ctrl.rtol = 1.0e-9;
    ctrl.hMax = tMax * 2.0e-4;          // linear interpolation stays inside a short step
    ctrl.positiveRows.assign(n, true);
    ctrl.verbosity = 0;
    solver::ODEAnalyticJacobian audit;
    if (jacobianAnalytic_)
    {
        wireAnalytic_(audit, "batchReactor '" + name_ + "' sensitivity");
        ctrl.analytic = &audit;
    }
    //  tau is read at the FIRST accepted state above T0 + rise; the run then
    //  goes on to tMax so that T_end can be compared across runs (the
    //  multiplier must leave the equilibrium where it was).
    scalar tPrev = 0.0, TPrev = y0[n];
    bool found = false;
    ctrl.onAcceptState = [&](scalar tEnd, scalar, const sVector& y)
    {
        const scalar T = y[n];
        if (!found && T > Tthr)
        {
            tau = tPrev + (Tthr - TPrev) / (T - TPrev) * (tEnd - tPrev);
            found = true;
        }
        tPrev = tEnd; TPrev = T;
    };
    sVector y = y0;
    const auto st = integ->integrate(y, 0.0, tMax, f, ctrl);
    if (!st.ok) { why = "the integrator gave up: " + st.failure; return false; }
    if (!found)
    {
        why = "T did not exceed T0 + " + std::to_string(sensRise_)
            + " K within the run's endTime";
        return false;
    }
    Tend = y[n];
    return true;
}

void BatchReactor::runSensitivity_(scalar tMax)
{
    const std::string who = "BatchReactor '" + name_ + "': sensitivity";
    if (!solver::ODEIntegrator::known(integrator_)) solver::ODEIntegrator::registerBuiltins();
    const sVector y0 = odeState();
    std::string why;
    //  The BASE run first, alone: besides tau_0 it touches every lazily
    //  resolved piece of the thermodynamics (a heat-capacity law's first use,
    //  a datum bridge) on the path the perturbed runs follow, so that while
    //  the threads below run, the shared data is only READ.
    if (!sensitivityTau_(y0, tMax, sensTau0_, sensTend0_, why))
        throw std::runtime_error(who + ": the base run has no ignition delay: " + why);
    const scalar lnF = std::log(sensFactor_);
    std::vector<std::size_t> js;
    for (std::size_t j = 0; j < reactions_.size(); ++j)
        if (sensReactions_.empty()
            || std::find(sensReactions_.begin(), sensReactions_.end(),
                         reactions_[j].name) != sensReactions_.end())
            js.push_back(j);
    //  The N perturbed runs are independent: one per job, each on its own
    //  thread with ITS multiplier in thread-local storage (multOf_), each
    //  writing only its own slot.  The same bits at any thread count.
    sensThreadsUsed_ = solver::workerThreads(sensThreads_, js.size(),
                                             "the sensitivity of batchReactor '" + name_ + "'");
    std::vector<SensResult> res(js.size());
    std::vector<std::string> fail(js.size());
    solver::parallelFor(js.size(), sensThreadsUsed_, [&](std::size_t q)
    {
        const std::size_t j = js[q];
        SensResult& r = res[q];
        r.name = reactions_[j].name;
        sensOwner_ = this; sensJ_ = j; sensF_ = sensFactor_;
        std::string whyq;
        bool ok = false;
        try { ok = sensitivityTau_(y0, tMax, r.tau, r.Tend, whyq); }
        catch (...) { sensOwner_ = nullptr; sensJ_ = kNoSens; sensF_ = 1.0; throw; }
        sensOwner_ = nullptr; sensJ_ = kNoSens; sensF_ = 1.0;
        if (!ok) fail[q] = whyq;
        else     r.S = (std::log(r.tau) - std::log(sensTau0_)) / lnF;
    });
    for (std::size_t q = 0; q < js.size(); ++q)          // the first failure, by index
        if (!fail[q].empty())
            throw std::runtime_error(who + ": the run with reaction '" + res[q].name
                + "' multiplied by " + std::to_string(sensFactor_) + " has no"
                " ignition delay: " + fail[q]);
    sensResults_ = std::move(res);
    std::stable_sort(sensResults_.begin(), sensResults_.end(),
                     [](const SensResult& a, const SensResult& b)
                     { return std::abs(a.S) > std::abs(b.S); });

    std::cout << "\n  [sensitivity] batchReactor '" << name_ << "': ignition delay"
                 " tau = time T first exceeds T0 + " << sensRise_
              << " K (interpolated),  S_j = d ln tau / d ln k_j by a factor of "
              << sensFactor_ << " on the net rate of one reaction, "
              << sensResults_.size() + 1 << " integrations ("
              << sensResults_.size() << " of them on " << sensThreadsUsed_
              << " thread(s))\n"
              << "      tau_0 = " << std::setprecision(8) << sensTau0_ * 1.0e6
              << " us\n      reaction                      S_j        tau_j [us]\n";
    for (const auto& r : sensResults_)
        std::cout << "      " << std::left << std::setw(26) << r.name << std::right
                  << std::setw(10) << std::fixed << std::setprecision(4) << r.S
                  << std::setw(16) << std::setprecision(6) << r.tau * 1.0e6 << "\n";
    std::cout << std::defaultfloat;
    std::ofstream f("sensitivity.csv");
    if (!f) throw std::runtime_error(who + ": cannot open sensitivity.csv for writing");
    f << std::setprecision(17) << "reaction,S,tau_s,tau0_s,factor,T_end_K,T_end0_K\n";
    for (const auto& r : sensResults_)
        f << r.name << ',' << r.S << ',' << r.tau << ',' << sensTau0_ << ',' << sensFactor_
          << ',' << r.Tend << ',' << sensTend0_ << '\n';
}

std::map<std::string, scalar> BatchReactor::kpis() const
{
    std::map<std::string, scalar> k;
    if (!sensOn_) return k;
    k["sens_tau0"] = sensTau0_;
    for (std::size_t i = 0; i < sensResults_.size() && i < sensTop_; ++i)
        k["sens_S_" + sensResults_[i].name] = sensResults_[i].S;
    return k;
}

// -----------------------------------------------------------------------
//  RATES OF PRODUCTION.  At the state (T, n, V) of the committed step:
//
//      r_j    = rateOfReaction_(reaction j)           [kmol/(m^3 s)]  net rate
//      c_ij   = nu_ij * r_j * V                       [kmol/s]  what reaction j
//                                                     does to species i
//      net_i  = sum_j c_ij  ( = dn_i/dt, derivatives_ )
//      P_i    = sum of the positive c_ij (gross production)
//      D_i    = -sum of the negative c_ij (gross consumption)
//      share  = c_ij / P_i  (a producer)  or  -c_ij / D_i  (a consumer)
//
//  r_j is the SAME rateOfReaction_ the integrator's right-hand side calls, so
//  the third-body [M], the fall-off blend and the reverse leg are in it; the
//  integrator's own dn_i/dt is written beside net_i so the identity is
//  checkable from the output alone (bin/curate/check_rate_of_production.py).
// -----------------------------------------------------------------------
void BatchReactor::reportRatesOfProduction_(scalar tRequested, scalar t)
{
    const sVector y = odeState();
    const std::size_t nc = state_.n.size();
    const scalar V = state_.V;
    const scalar T = (mode_ == Mode::Isothermal) ? T_setpoint_ : state_.T;
    const sVector dndt = derivatives_(y);

    const std::size_t nr = reactions_.size();
    sVector r(nr, 0.0);
    const sVector gT = gibbsAt_(T);
    for (std::size_t j = 0; j < nr; ++j)
        r[j] = rateOfReaction_(reactions_[j], T, state_.n, V, &gT);

    // c[i][j]: dense species x reaction matrix [kmol/s] (a species may be
    // listed once per reaction; repeated entries add).
    std::vector<sVector> c(nc, sVector(nr, 0.0));
    for (std::size_t j = 0; j < nr; ++j)
        for (std::size_t s = 0; s < reactions_[j].comps.size(); ++s)
            c[reactions_[j].comps[s]][j] += reactions_[j].nu[s] * r[j] * V;

    // ---- the matrix, long format, appended -------------------------------
    {
        std::ofstream f("rateOfProduction.csv",
                        ropFileStarted_ ? std::ios::app : std::ios::trunc);
        if (!f) throw std::runtime_error("BatchReactor '" + name_
            + "': cannot open rateOfProduction.csv for writing");
        f << std::setprecision(17);
        if (!ropFileStarted_)
            f << "t_s,species,reaction,nu,rate_kmol_m3_s,contribution_kmol_s\n";
        ropFileStarted_ = true;
        for (std::size_t i = 0; i < nc; ++i)
        {
            scalar net = 0.0;
            for (std::size_t j = 0; j < nr; ++j)
            {
                if (c[i][j] == 0.0) continue;
                scalar nu = 0.0;
                for (std::size_t s = 0; s < reactions_[j].comps.size(); ++s)
                    if (reactions_[j].comps[s] == i) nu += reactions_[j].nu[s];
                f << t << ',' << thermo_->comp(i).name() << ',' << reactions_[j].name
                  << ',' << nu << ',' << r[j] << ',' << c[i][j] << '\n';
                net += c[i][j];
            }
            f << t << ',' << thermo_->comp(i).name() << ",NET,,," << net << '\n';
            f << t << ',' << thermo_->comp(i).name() << ",DNDT_ODE,,," << dndt[i] << '\n';
        }
    }

    // ---- the table on stdout (own stream: leaves cout's flags alone) ------
    std::ostringstream os;
    os << std::defaultfloat << std::setprecision(6);
    os << "\n=== Rates of production, unit '" << name_ << "' ===\n";
    os << "  requested t = " << tRequested << " s; reported at the first committed"
                 " step that reaches it, t = " << t << " s\n";
    os << "  T = " << T << " K, V = " << V << " m3.  c_ij = nu_ij r_j V [kmol/s];"
                 " share = c_ij / gross production (or consumption) of species i.\n";
    os << std::scientific << std::setprecision(4);
    for (std::size_t i = 0; i < nc; ++i)
    {
        scalar prod = 0.0, cons = 0.0;
        for (std::size_t j = 0; j < nr; ++j)
            (c[i][j] > 0.0 ? prod : cons) += (c[i][j] > 0.0 ? c[i][j] : -c[i][j]);
        if (prod == 0.0 && cons == 0.0) continue;
        scalar net = prod - cons;
        os << "  " << thermo_->comp(i).name() << ":  net " << net
                  << " kmol/s   (production " << prod << ", consumption " << cons
                  << ";  integrator dn/dt " << dndt[i] << ")\n";
        for (int side = 0; side < 2; ++side)
        {
            std::vector<std::size_t> idx;
            for (std::size_t j = 0; j < nr; ++j)
                if (side == 0 ? c[i][j] > 0.0 : c[i][j] < 0.0) idx.push_back(j);
            std::sort(idx.begin(), idx.end(), [&](std::size_t a, std::size_t b)
                      { return std::fabs(c[i][a]) > std::fabs(c[i][b]); });
            const scalar gross = side == 0 ? prod : cons;
            os << "      " << (side == 0 ? "made by:    " : "destroyed by:");
            if (idx.empty()) os << " (none)";
            const std::size_t m = std::min(idx.size(), ropTop_);
            for (std::size_t k = 0; k < m; ++k)
                os << (k ? ", " : " ") << reactions_[idx[k]].name << " "
                          << std::fixed << std::setprecision(1)
                          << 100.0 * std::fabs(c[i][idx[k]]) / gross << " %"
                          << std::scientific << std::setprecision(4);
            if (idx.size() > m) os << "  (+" << idx.size() - m << " more)";
            os << "\n";
        }
    }
    os << std::defaultfloat << std::setprecision(6);
    os << "  Full matrix appended to rateOfProduction.csv\n";
    std::cout << os.str();
    if (!pfElements_.empty()) reportPathFlux_(tRequested, t, r, V);
}

// -----------------------------------------------------------------------
//  ELEMENT PATH FLUX.  For element e and reaction j, with N_ej the atoms of e
//  on either side of one turnover (sum over reactants nu' a_e = sum over
//  products nu'' a_e), the atoms of e that go from reactant A to product B:
//
//      f_AB^(e,j) = |r_j| V (nu'_A a_eA) (nu''_B a_eB) / N_ej     [kmol atoms/s]
//
//  Each atom of e leaving A lands on one of the products in proportion to the
//  atoms of e they take, so sum_B f_AB = |r_j| V nu'_A a_eA (what the step
//  takes out of A) and sum_A f_AB = |r_j| V nu''_B a_eB (what it puts into B).
//  r_j < 0 runs the step backwards: the products are the donors, so the same
//  magnitudes flow from B to A.  Net species-to-species flux
//  F_AB = sum_j (f_AB - f_BA); the writer keeps one direction per pair.
// -----------------------------------------------------------------------
void BatchReactor::reportPathFlux_(scalar tRequested, scalar t, const sVector& r, scalar V)
{
    const std::size_t nc = state_.n.size();
    const std::size_t nr = reactions_.size();
    std::ofstream f("pathFlux.csv", pfFileStarted_ ? std::ios::app : std::ios::trunc);
    if (!f) throw std::runtime_error("BatchReactor '" + name_
        + "': cannot open pathFlux.csv for writing");
    f << std::setprecision(17);
    if (!pfFileStarted_)
        f << "t_s,element,from,to,reaction,flux_kmol_atoms_s\n";
    pfFileStarted_ = true;

    std::ostringstream os;
    os << std::defaultfloat << std::setprecision(6);
    os << "\n=== Element path flux, unit '" << name_ << "' ===\n";
    os << "  requested t = " << tRequested << " s; reported at t = " << t
       << " s.  f_AB = |r_j| V (nu' a)_A (nu'' a)_B / N_ej [kmol atoms/s]; share = of the"
          " element's total net throughput.\n";

    char tbuf[32];
    std::snprintf(tbuf, sizeof tbuf, "%.3e", tRequested);
    const std::string tTag(tbuf);

    for (const auto& e : pfElements_)
    {
        std::vector<sVector> net(nc, sVector(nc, 0.0));        // net[A][B]: directed, signed
        std::vector<sVector> lead(nc, sVector(nc, 0.0));       // largest directed leg
        std::vector<std::vector<int>> leadRx(nc, std::vector<int>(nc, -1));
        for (std::size_t j = 0; j < nr; ++j)
        {
            const PathSplit ps = pathSplit_(j, e);
            if (!ps.present || r[j] == 0.0) continue;
            const bool fwd = r[j] > 0.0;
            const auto& donors = fwd ? ps.reactants : ps.products;
            const auto& sinks  = fwd ? ps.products  : ps.reactants;
            for (const auto& [A, wA] : donors)
                for (const auto& [B, wB] : sinks)
                {
                    const scalar flux = std::fabs(r[j]) * V * wA * wB / ps.N;
                    f << t << ',' << e << ',' << thermo_->comp(A).name() << ','
                      << thermo_->comp(B).name() << ',' << reactions_[j].name << ','
                      << flux << '\n';
                    if (A == B) continue;                       // a self-loop moves no atom between species
                    net[A][B] += flux;
                    net[B][A] -= flux;
                    if (flux > lead[A][B]) { lead[A][B] = flux; leadRx[A][B] = static_cast<int>(j); }
                }
        }
        struct Edge { std::size_t a, b; scalar F; int rx; };
        std::vector<Edge> edges;
        scalar total = 0.0;
        for (std::size_t A = 0; A < nc; ++A)
            for (std::size_t B = 0; B < nc; ++B)
                if (net[A][B] > 0.0)
                {
                    edges.push_back({A, B, net[A][B], leadRx[A][B]});
                    total += net[A][B];
                    f << t << ',' << e << ',' << thermo_->comp(A).name() << ','
                      << thermo_->comp(B).name() << ",NET," << net[A][B] << '\n';
                }
        std::sort(edges.begin(), edges.end(),
                  [](const Edge& x, const Edge& y) { return x.F > y.F; });

        os << std::scientific << std::setprecision(4);
        os << "  element " << e << ": total net throughput " << total << " kmol atoms/s, "
           << edges.size() << " species pairs\n";
        const std::size_t m = std::min(edges.size(), ropTop_);
        for (std::size_t k = 0; k < m; ++k)
        {
            const Edge& g = edges[k];
            os << "      " << thermo_->comp(g.a).name() << " -> " << thermo_->comp(g.b).name()
               << "  " << g.F << "  (" << std::fixed << std::setprecision(1)
               << 100.0 * g.F / total << " %)  via "
               << (g.rx >= 0 ? reactions_[g.rx].name : std::string("?"))
               << std::scientific << std::setprecision(4) << "\n";
        }
        if (edges.size() > m) os << "      (+" << edges.size() - m << " more pairs in pathFlux.csv)\n";

        // Graphviz: nodes = species with an edge, width ~ log of the flux.
        const std::string dotName = "pathFlux_" + e + "_" + tTag + ".dot";
        std::ofstream d(dotName);
        if (!d) throw std::runtime_error("BatchReactor '" + name_ + "': cannot open "
            + dotName + " for writing");
        d << "digraph pathFlux_" << e << " {\n"
          << "  // element " << e << ", t = " << std::defaultfloat << std::setprecision(6) << t
          << " s; edge = net flux of " << e
          << " atoms [kmol/s], penwidth = max(0.25, 1 + 4 log10(F/Fmax)/6), label = value (leading reaction)\n"
          << "  rankdir=LR;\n  node [shape=box];\n";
        std::vector<bool> used(nc, false);
        for (const auto& g : edges) used[g.a] = used[g.b] = true;
        for (std::size_t i = 0; i < nc; ++i)
            if (used[i]) d << "  \"" << thermo_->comp(i).name() << "\";\n";
        const scalar Fmax = edges.empty() ? 1.0 : edges.front().F;
        for (const auto& g : edges)
        {
            const scalar w = std::max(0.25, 1.0 + 4.0 * std::log10(g.F / Fmax) / 6.0);
            d << std::defaultfloat << std::setprecision(4);
            d << "  \"" << thermo_->comp(g.a).name() << "\" -> \"" << thermo_->comp(g.b).name()
              << "\" [penwidth=" << w << ", label=\"" << std::scientific << std::setprecision(3)
              << g.F << " (" << (g.rx >= 0 ? reactions_[g.rx].name : std::string("?"))
              << ")\"];\n";
        }
        d << "}\n";
    }
    os << std::defaultfloat << std::setprecision(6);
    os << "  Per-reaction fluxes and NET pairs appended to pathFlux.csv; one"
          " pathFlux_<element>_<t>.dot per element and instant.\n";
    std::cout << os.str();
}

// -----------------------------------------------------------------------
//  The data an ADIABATIC energy balance reads, checked in ONE place: at
//  initialise for a reactor declared adiabatic, and at the instant a recipe
//  takes the cooling away (setOperationParameter "adiabatic").  Two copies
//  of this check would be two answers to "can this reactor go adiabatic?".
// -----------------------------------------------------------------------
void BatchReactor::requireAdiabaticData_() const
{
    // Each component must carry the thermo the chosen energy basis reads:
    //   liquidDH     -> liquidHeatCapacity (legacy)
    //   gasConstantV -> ideal-gas Cp + formation (h_pure_ig / Cv)
    for (std::size_t i = 0; i < state_.n.size(); ++i)
    {
        const auto& c = thermo_->comp(i);
        if (energy_ == Energy::LiquidDH && !c.hasCpLiquid())
            throw std::runtime_error("BatchReactor (adiabatic, liquidDH):"
                " component '" + c.name() + "' has no liquidHeatCapacity"
                " in its.dat file");
        if (isGas_() && (!c.hasCpIdealGas() || !c.hasGibbsData()))
            throw std::runtime_error(std::string("BatchReactor (adiabatic, ")
                + (energy_ == Energy::GasConstantP ? "gasConstantP" : "gasConstantV") + "):"
                " component '" + c.name() + "' needs idealGasHeatCapacity +"
                " standardThermochemistry (for u_i = h_pure_ig − R_uT and Cv) in its"
                " .dat file");
    }
}

// -----------------------------------------------------------------------
//  Rate of a single reaction r at the current state.
//
//        r = k(T) · ∏_j (n_j / V)^{order_j}        [kmol/(m³·s)]
//
//  k(T) = A · exp(−Ea / RT)  with R in J/(mol·K) and Ea in J/mol.
// -----------------------------------------------------------------------
// -- CHEMKIN unit conversion on load (announced at verbosity>=2) -------------
scalar BatchReactor::ckA_(const DictPtr& kin, scalar A, int molecularity) const
{
    if (!kin->found("units")) return A;
    const std::string u = kin->subDict("units")->lookupWordOrDefault("A", "");
    // cm-mol-s -> SI kmol-m³-s:  A_SI = A · (1e-3)^(molecularity-1).
    if (u.find("cm") != std::string::npos)
    {
        const scalar f = std::pow(1.0e-3, molecularity - 1);
        if (verbosity_ >= 2)
            std::cout << "  [kinetics] A: " << A << " " << u << "  ->  "
                      << A * f << " (SI, kmol-m³-s; ×" << f << ", molecularity "
                      << molecularity << ")\n";
        return A * f;
    }
    return A;
}

scalar BatchReactor::ckEa_(const DictPtr& kin, scalar Ea) const
{
    if (!kin->found("units")) return Ea;
    const std::string u = kin->subDict("units")->lookupWordOrDefault("Ea", "");
    scalar f = 1.0;
    if      (u.find("kcal") != std::string::npos) f = 4184.0;
    else if (u.find("cal")  != std::string::npos) f = 4.184;
    else if (u.find("kJ")   != std::string::npos) f = 1000.0;
    if (f != 1.0 && verbosity_ >= 2)
        std::cout << "  [kinetics] Ea: " << Ea << " " << u << "  ->  "
                  << Ea * f << " J/mol (×" << f << ")\n";
    return Ea * f;
}

sVector
BatchReactor::thirdBodyEfficiencies_(const DictPtr& kin,
                                     const ThermoPackage& thermo) const
{
    //  unlisted species => defaultEfficiency (1.0 when absent)
    sVector eff(thermo.n(), kin->lookupScalarOrDefault("defaultEfficiency", 1.0));
    auto tb = kin->subDict("thirdBody");
    for (const auto& sp : tb->keys())
        eff[thermo.indexOf(sp)] = tb->lookupScalar(sp);
    return eff;
}

//  c^p for a reaction order.  std::pow(c, 1.0) is c exactly and std::pow(c, 0.0)
//  is 1 exactly, so those two (the most common orders, and the p - 1 of the
//  derivative) skip the call; every other order goes to std::pow.
static inline scalar orderPow(scalar c, scalar p)
{
    if (p == 1.0) return c;
    //  p == 2 is NOT taken as c * c: std::pow(c, 2.0) is within 1 ulp of it and not always equal,
    //  and the 1-ulp differences moved an accept/reject decision, and the nox03 trajectory by
    //  3e-9 relative (measured 2026-11-22), so the square stays a pow.
    if (p == 0.0) return 1.0;
    return std::pow(c, p);
}

std::uint64_t BatchReactor::MemoId::next()
{
    static std::atomic<std::uint64_t> counter{0};
    return ++counter;
}

void BatchReactor::buildWantG_()
{
    std::vector<char>& want = wantG_;
    want.clear();
    for (const auto& rxn : reactions_)
    {
        if (rxn.form == RateForm::Factory)
        {
            const sVector* nuLaw = rxn.law ? rxn.law->gibbsStoichiometry() : nullptr;
            if (!nuLaw) continue;
            if (want.empty()) want.assign(thermo_->n(), 0);
            Reaction::markSpecies(want, *nuLaw);
        }
        else if (rxn.reversible)
        {
            if (want.empty()) want.assign(thermo_->n(), 0);
            for (std::size_t c : rxn.comps) want[c] = 1;
        }
    }
}

//  g_i(T) and h_i(T) of the wanted species.  The right-hand side, the Jacobian
//  and the next step's first evaluation read the SAME T many times (the
//  accepted step's last right-hand side is the next Jacobian's point), and both
//  are pure functions of T: the last (vessel, T) a thread asked for is kept and
//  returned as the identical numbers.  g_i = h_i - T s_i is
//  Component::g_pure_ig's own expression, so taking h_i once for both is the
//  same numbers, and the Jacobian's d ln Kc / dT reads the h_i the step's last
//  right-hand side already computed.  thread_local: the sensitivity block runs
//  one integration per thread on one vessel.
namespace
{
struct GibbsMemo
{
    std::uint64_t id = 0;
    scalar        T  = 0.0;
    bool          haveH = false, haveG = false, haveAll = false;
    sVector       h, g;
    sVector       hAll, cpAll;          // every species: h_i(T) and Cp_i(T) of the energy equation
};
GibbsMemo& gibbsMemo() { static thread_local GibbsMemo m; return m; }
}

//  The returned reference is the calling thread's memo: valid until the next call on this thread
//  at another (vessel, T) (see the header).
const sVector& BatchReactor::gibbsAt_(scalar T) const
{
    static const sVector kNone;
    if (wantG_.empty()) return kNone;
    GibbsMemo& m = gibbsMemo();
    if (m.id != memoId_.v || m.T != T)
    {
        m.id = memoId_.v; m.T = T; m.haveH = m.haveG = m.haveAll = false;
    }
    if (m.haveG) return m.g;
    const std::size_t n = wantG_.size();
    m.haveH = m.haveG = false;      // a throw below leaves nothing half-filled
    sVector h(n, 0.0), g(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
        if (wantG_[i])
        {
            const Component& c = thermo_->comp(i);
            h[i] = c.h_pure_ig(T);
            g[i] = c.gibbsFromH_ig(T, h[i]);        // = c.g_pure_ig(T), one home
        }
    m.h = std::move(h); m.g = std::move(g);
    m.haveH = m.haveG = true;
    return m.g;
}

//  What every reaction of one evaluation shares, in thread-local scratch (the sensitivity block
//  runs one integration per thread on one vessel).
struct BatchReactor::KinCtx
{
    const BatchReactor* owner = nullptr;   // the vessel this context was built for
    sVector nvec;                 // the mole numbers of the packed state
    sVector conc, M;              // n_j / V; [M] per efficiency class
    sVector concC, x;             // factory laws: max(n,0)/V and the mole fractions
    sVector expEa, powB, cf;      // exp(-Ea/RT) per distinct Ea, T^b per distinct b, c_std^sumNu
    scalar  ntot = 0.0, P = 0.0;
    std::size_t sensJ = static_cast<std::size_t>(-1);   // the sensitivity multiplier of this thread
    scalar      sensF = 1.0;
};

scalar BatchReactor::kModArr_(const KinCtx& ctx, scalar A, int bIdx, int eaIdx)
{
    return bIdx < 0 ? A * ctx.expEa[eaIdx] : A * ctx.powB[bIdx] * ctx.expEa[eaIdx];
}

void BatchReactor::factoryState_(const sVector& n, scalar V, scalar T, sVector& conc, sVector& x,
                                 scalar& ntot, scalar& P)
{
    const std::size_t nc = n.size();
    conc.assign(nc, 0.0); x.assign(nc, 0.0);
    ntot = 0.0;
    for (std::size_t j = 0; j < nc; ++j) { conc[j] = std::max<scalar>(n[j], 0.0) / V; ntot += std::max<scalar>(n[j], 0.0); }
    if (ntot > 0.0) for (std::size_t j = 0; j < nc; ++j) x[j] = std::max<scalar>(n[j], 0.0) / ntot;
    //  P = n R T / V (kmol -> mol): read only by a law that asked for it (the offer refuses a
    //  liquid vessel); NaN when the vessel is empty.
    P = (ntot > 0.0 && V > 0.0) ? ntot * 1000.0 * constant::R * T / V : std::nan("");
}

scalar BatchReactor::multOf_(const ReactionSpec& rxn, const KinCtx* ctx) const
{
    if (!ctx) return multOf_(rxn);
    if (ctx->owner != this)
        throw std::logic_error("BatchReactor '" + name_ + "': a KinCtx built for another vessel was"
                               " handed to this one (internal error: the shared tables belong to"
                               " one vessel's evaluation)");
    return (ctx->sensJ == static_cast<std::size_t>(&rxn - reactions_.data())) ? ctx->sensF : 1.0;
}

scalar BatchReactor::rateOfReaction_(const ReactionSpec& rxn,
                                     scalar               T,
                                     const sVector&       n,
                                     scalar               V,
                                     const sVector*       g,
                                     const KinCtx*        ctx) const
{
    // Forward rate constant k_eff(T, c), with third-body [M] and fall-off
    // blending folded in.  Concentration vector c_j = n_j/V (kmol/m³) is only
    // needed for [M] (third-body / fall-off); cheap to skip otherwise.
    // LHHW answers for itself: the shared RateLaw carries the basis (concentration
    // or activity), the adsorption denominator and the reverse leg.  The rate comes
    // back per unit of whatever the constants were reported in; `catalystLoading`
    // (kg of dry catalyst per m^3) converts a per-gram constant into the reactor's
    // volumetric kmol/(m^3.s).  With conc in kmol/m^3 the factor is the loading
    // itself: mol/(g.s) x kg/m^3 = kmol/(m^3.s), exactly.
    if (rxn.form == RateForm::Factory)
    {
        sVector concL, xL;
        scalar ntot = 0.0, Pg = 0.0;
        const sVector* concP = nullptr; const sVector* xP = nullptr;
        if (ctx) { concP = &ctx->concC; xP = &ctx->x; ntot = ctx->ntot; Pg = ctx->P; }
        else
        {
            factoryState_(n, V, T, concL, xL, ntot, Pg);
            concP = &concL; xP = &xL;
        }
        const scalar cf = (catalystLoading_ > 0.0) ? catalystLoading_ : 1.0;
        RateState rs;
        rs.T = T; rs.P = Pg;
        rs.conc = concP; rs.x = xP;
        rs.amountPerKmol = 1.0;                       // conc in kmol/m3
        rs.gibbs = (g && !g->empty()) ? g : nullptr;
        return multOf_(rxn, ctx) * cf * rxn.law->netRate(*thermo_, rs);
    }

    scalar k = 0.0;
    switch (rxn.form)
    {
        case RateForm::Arrhenius:
            k = ctx ? rxn.A_pre * ctx->expEa[rxn.eaIdx]
                    : Reaction::arrheniusRate(rxn.A_pre, rxn.Ea, T);
            break;
        case RateForm::ModArrhenius:
            if (ctx) { k = kModArr_(*ctx, rxn.A_pre, rxn.bIdx, rxn.eaIdx); break; }   // the same expression, tabled
            k = Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);
            break;
        case RateForm::Factory: break;   // handled above
        case RateForm::ThirdBody:        // k [M], the arm below (C185 (9))
        case RateForm::Falloff:
        {
            scalar M;
            if (ctx && rxn.tbClass >= 0) M = ctx->M[rxn.tbClass];
            else
            {
                sVector conc(n.size());
                for (std::size_t j = 0; j < n.size(); ++j) conc[j] = n[j] / V;
                static const sVector kAll1;
                const sVector& eff = rxn.tbEff.empty() ? kAll1 : rxn.tbEff;
                M = Reaction::thirdBodyConcentration(conc, eff);
            }
            if (rxn.form == RateForm::ThirdBody)
                k = (ctx ? kModArr_(*ctx, rxn.A_pre, rxn.bIdx, rxn.eaIdx)
                         : Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T)) * M;
            else
            {
                const scalar kInf = ctx ? kModArr_(*ctx, rxn.A_pre, rxn.bIdx, rxn.eaIdx)
                                        : Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);
                const scalar kLow = ctx ? kModArr_(*ctx, rxn.A_low, rxn.bLowIdx, rxn.eaLowIdx)
                                        : Reaction::modifiedArrheniusRate(rxn.A_low, rxn.b_low, rxn.Ea_low, T);
                k = Reaction::falloffRate(kLow, kInf, M, T, rxn.troe, rxn.sri, rxn.name);
            }
            break;
        }
    }

    //  C190 item 11.  `catalystLoading` (kg of catalyst per m3 of vessel) turns a
    //  rate constant reported PER GRAM of catalyst into the vessel's volumetric
    //  one: mol/(g.s) x kg/m3 = kmol/(m3.s), exactly.  The factory laws applied it
    //  above and the steady cstr/pfr apply it to every law; this path read the key
    //  (and announced that the pellet is a point) but never used it, so the
    //  declared bed density changed nothing.  Both legs carry it (k_rev = k/Kc).
    if (catalystLoading_ > 0.0) k *= catalystLoading_;
    //  The sensitivity multiplier scales k, and so k_rev = k / Kc with it: the
    //  NET rate is multiplied and the equilibrium is unchanged.  1 otherwise.
    if (const scalar m = multOf_(rxn, ctx); m != 1.0) k *= m;

    scalar r = k;
    for (std::size_t s = 0; s < rxn.comps.size(); ++s)
    {
        if (rxn.order[s] == 0.0) continue;              // C190 item 10: a NEGATIVE order is honoured
        const scalar c_i = ctx ? ctx->conc[rxn.comps[s]] : n[rxn.comps[s]] / V;
        if (rxn.order[s] > 0.0)
            r *= orderPow(std::max<scalar>(c_i, 0.0), rxn.order[s]);   // = powerLawFactorLazy's pow
        else
            r *= Reaction::powerLawFactorLazy(c_i, rxn.order[s],
                                              [&]() -> const std::string& { return thermo_->comp(rxn.comps[s]).name(); },
                                              [&]() { return "batchReactor reaction '" + rxn.name + "'"; });
    }
    if (!rxn.reversible) return r;

    // Reverse leg (detailed balance): k_rev = k_fwd / Kc, the concentration-
    // basis equilibrium constant (Reaction::equilibriumKc), re-evaluated each
    // call so it tracks T in adiabatic mode.  For third-body/fall-off the same
    // k_eff carries [M]/the blend, which cancels at equilibrium (Kc is the
    // gas-species ratio), so this stays consistent.
    const scalar K_eq  = (g && !g->empty())
                       ? ((ctx && rxn.cfIdx >= 0)
                              ? Reaction::equilibriumKcWithFactor(rxn.comps, rxn.nu, T, *g, ctx->cf[rxn.cfIdx])
                              : Reaction::equilibriumKc(rxn.comps, rxn.nu, T, *g))
                       : Reaction::equilibriumKc(*thermo_, rxn.comps, rxn.nu, T);
    const scalar k_rev = k / K_eq;

    //  The products at their counts, orderRev = max(nu, 0) -- or, for a species
    //  on BOTH sides, its declared product count (nu = 0 for a pure collider).
    scalar r_rev = k_rev;
    for (std::size_t s = 0; s < rxn.comps.size(); ++s)
    {
        if (rxn.orderRev[s] == 0.0) continue;           // products only
        const scalar c_i = ctx ? ctx->conc[rxn.comps[s]] : n[rxn.comps[s]] / V;
        r_rev *= orderPow(std::max<scalar>(c_i, 0.0), rxn.orderRev[s]);
    }
    return r - r_rev;
}

// -----------------------------------------------------------------------
//  Combined derivatives.
//
//  packed[0..n-1] = mole numbers [kmol]
//  packed[n]      = temperature  [K]
//
//  dn_i/dt = Σ_r ν_{i,r} · r_r · V                 [kmol/s]
//  dT/dt   = −Σ_r r_r · V · ΔH_r / Σ_i n_i · Cp_i  [K/s]   (adiabatic only)
// -----------------------------------------------------------------------
sVector BatchReactor::derivatives_(const sVector& packed) const
{
    ++rhsEvals_;                 // a count for the glass box, nothing else
    const auto tic = std::chrono::steady_clock::now();
    struct Toc
    {
        std::atomic<long long>& acc; std::chrono::steady_clock::time_point t0;
        ~Toc() { acc += std::chrono::duration_cast<std::chrono::nanoseconds>(
                     std::chrono::steady_clock::now() - t0).count(); }
    } toc{nsRhs_, tic};
    const std::size_t n = packed.size() - 1;
    const scalar T = (mode_ == Mode::Isothermal) ? T_setpoint_ : packed[n];
    scalar V = state_.V;
    if (energy_ == Energy::GasConstantP)
    {
        //  Fixed P: the volume follows the trial (n, T) the integrator is at.
        scalar nT = 0.0;
        for (std::size_t i = 0; i < n; ++i) nT += packed[i];
        V = constPVolume_(nT, T);
    }

    sVector dydt(n + 1, 0.0);

    // Loop over reactions; accumulate the species derivatives and (for the
    // liquid-ΔH basis) the per-reaction heat release.
    scalar heatRate = 0.0;   // Σ r_r · V · ΔH_r  [J·kmol / (mol·s)]
                             // (the mol/kmol factor cancels in dT/dt --- see header)
    const sVector& gT = gibbsAt_(T);      // g_i(T) once per evaluation, not once per reaction
    const KinCtx& ctx = kinCtx_(T, packed, V);   // c = n/V, [M], the factory laws' c and x, once
    const sVector& n_vec = ctx.nvec;
    for (const auto& rxn : reactions_)
    {
        const scalar r_r = rateOfReaction_(rxn, T, n_vec, V, &gT, &ctx);   // kmol/(m³·s)
        for (std::size_t s = 0; s < rxn.comps.size(); ++s)
            dydt[rxn.comps[s]] += rxn.nu[s] * r_r * V;          // kmol/s
        heatRate += rxn.dH * r_r * V;                            // J·kmol/(mol·s)
    }

    if (mode_ == Mode::Adiabatic && energy_ == Energy::LiquidDH)
    {
        // Legacy liquid path: Σ r·V·ΔH over liquid Cp.
        scalar CpTot = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            CpTot += n_vec[i] * thermo_->comp(i).cpLiquid().Cp(T);

        if (CpTot < 1.0e-30) { dydt[n] = 0.0; }
        else                  { dydt[n] = -heatRate / CpTot; }
        // The (J·kmol / mol·s) / (kmol · J/(mol·K)) = K/s  --- the
        // mol/kmol factors cancel, no explicit 1000 needed.
    }
    else if (mode_ == Mode::Adiabatic && energy_ == Energy::GasConstantV)
    {
        // Closed fixed-volume gas: first law dU = 0 gives, per the chain rule,
        //     dT/dt = − Σ_i u_i(T)·(dn_i/dt) / Σ_i n_i·Cv_i(T)
        // with u_i = h_pure_ig_i(T) − R_u·T  (internal energy, ideal gas) and
        // Cv_i = Cp_gas_i(T) − R_u.  The heat release is INTRINSIC to the
        // species' formation enthalpies (curated thermo) -- no per-reaction ΔH.
        // The kmol(dn/dt)·J/mol(u) and kmol(n)·J/mol/K(Cv) factors of 1000
        // cancel, as in the liquid path.
        scalar uDot  = 0.0;   // Σ u_i · dn_i/dt
        scalar CvTot = 0.0;   // Σ n_i · Cv_i
        const sVector *hAll = nullptr, *cpAll = nullptr;
        energiesAt_(T, hAll, cpAll);          // h_i(T), Cp_i(T): once per T, shared with the Jacobian
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar u_i  = (*hAll)[i] - constant::R * T;
            const scalar Cv_i = (*cpAll)[i] - constant::R;
            uDot  += u_i  * dydt[i];
            CvTot += n_vec[i] * Cv_i;
        }
        dydt[n] = (CvTot < 1.0e-30) ? 0.0 : -uDot / CvTot;
    }
    else if (mode_ == Mode::Adiabatic && energy_ == Energy::GasConstantP)
    {
        // Closed adiabatic gas at fixed P: the first law is dH = 0, so
        //     dT/dt = − Σ_i h_i(T)·(dn_i/dt) / Σ_i n_i·Cp_i(T)
        // with h_i = h_pure_ig_i(T) (formation datum: the SAME datum
        // gasConstantV takes u_i = h_i − R_u·T from) and Cp_i the ideal-gas
        // heat capacity.  V = n R T / P above is why no −R_u appears.
        scalar hDot  = 0.0;   // Σ h_i · dn_i/dt
        scalar CpTot = 0.0;   // Σ n_i · Cp_i
        const sVector *hAll = nullptr, *cpAll = nullptr;
        energiesAt_(T, hAll, cpAll);
        for (std::size_t i = 0; i < n; ++i)
        {
            hDot  += (*hAll)[i] * dydt[i];
            CpTot += n_vec[i] * (*cpAll)[i];
        }
        dydt[n] = (CpTot < 1.0e-30) ? 0.0 : -hDot / CpTot;
    }
    // else: dydt[n] stays 0 (isothermal)

    return dydt;
}

//  h_i(T) = h_pure_ig(T) and Cp_i(T) = cpIdealGas().Cp(T) for EVERY species, the two sums
//  of the gas energy equation (u_i = h_i - R T, Cv_i = Cp_i - R).  They were evaluated afresh
//  by the right-hand side and again by the Jacobian at the same T; they are pure functions of
//  T, kept with the Gibbs memo (a wanted species' h_i is the one gibbsAt_ already holds).
void BatchReactor::energiesAt_(scalar T, const sVector*& h, const sVector*& cp) const
{
    GibbsMemo& m = gibbsMemo();
    if (m.id != memoId_.v || m.T != T)
    {
        m.id = memoId_.v; m.T = T; m.haveH = m.haveG = m.haveAll = false;
    }
    if (!m.haveAll)
    {
        const std::size_t n = thermo_->n();
        sVector hv(n, 0.0), cv(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            hv[i] = (m.haveH && i < wantG_.size() && wantG_[i]) ? m.h[i] : thermo_->comp(i).h_pure_ig(T);
            cv[i] = thermo_->comp(i).cpIdealGas().Cp(T);
        }
        m.hAll = std::move(hv); m.cpAll = std::move(cv);
        m.haveAll = true;
    }
    h = &m.hAll; cp = &m.cpAll;
}

void BatchReactor::buildTbClasses_()
{
    tbClasses_.clear();
    anyFactory_ = false;
    for (auto& r : reactions_)
    {
        r.tbClass = -1;
        if (r.form == RateForm::Factory) anyFactory_ = true;
        if (r.form != RateForm::ThirdBody && r.form != RateForm::Falloff) continue;
        std::size_t k = 0;
        for (; k < tbClasses_.size(); ++k)
            if (tbClasses_[k] == r.tbEff) break;
        if (k == tbClasses_.size()) tbClasses_.push_back(r.tbEff);
        r.tbClass = static_cast<int>(k);
    }
    //  The distinct rate-constant inputs: the same exp(-Ea/(R T)), T^b and c_std^sumNu would be
    //  evaluated again and again (100 distinct Ea and 41 distinct b among the 235 reactions of
    //  Miller & Bowman's Appendix A).  Equal values give equal results, so taking each once per
    //  evaluation changes no bit.
    arrEa_.clear(); arrB_.clear(); cfSumNu_.clear();
    const auto slot = [](sVector& v, scalar x) -> int
    {
        for (std::size_t i = 0; i < v.size(); ++i) if (v[i] == x) return static_cast<int>(i);
        v.push_back(x);
        return static_cast<int>(v.size() - 1);
    };
    for (auto& r : reactions_)
    {
        r.eaIdx = r.bIdx = r.eaLowIdx = r.bLowIdx = r.cfIdx = -1;
        if (r.form == RateForm::Arrhenius) r.eaIdx = slot(arrEa_, r.Ea);
        if (r.form == RateForm::ModArrhenius || r.form == RateForm::ThirdBody || r.form == RateForm::Falloff)
        {
            r.eaIdx = slot(arrEa_, r.Ea);
            if (r.b != 0.0) r.bIdx = slot(arrB_, r.b);
        }
        if (r.form == RateForm::Falloff)
        {
            r.eaLowIdx = slot(arrEa_, r.Ea_low);
            if (r.b_low != 0.0) r.bLowIdx = slot(arrB_, r.b_low);
        }
        if (r.form != RateForm::Factory && r.reversible)
        {
            scalar sumNu = 0.0;
            for (std::size_t s = 0; s < r.comps.size(); ++s) sumNu += r.nu[s];
            r.cfIdx = slot(cfSumNu_, sumNu);
        }
    }
}

const BatchReactor::KinCtx& BatchReactor::kinCtx_(scalar T, const sVector& packed, scalar V) const
{
    static thread_local KinCtx c;
    const std::size_t n = thermo_->n();
    c.owner = this;
    c.nvec.assign(packed.begin(), packed.begin() + n);
    c.sensJ = (sensOwner_ == this) ? sensJ_ : kNoSens;
    c.sensF = sensF_;
    c.conc.resize(n);
    for (std::size_t j = 0; j < n; ++j) c.conc[j] = c.nvec[j] / V;
    c.expEa.resize(arrEa_.size());
    for (std::size_t i = 0; i < arrEa_.size(); ++i) c.expEa[i] = std::exp(-arrEa_[i] / (constant::R * T));
    c.powB.resize(arrB_.size());
    for (std::size_t i = 0; i < arrB_.size(); ++i) c.powB[i] = std::pow(T, arrB_[i]);
    c.cf.resize(cfSumNu_.size());
    for (std::size_t i = 0; i < cfSumNu_.size(); ++i) c.cf[i] = Reaction::concentrationBasisFactor(cfSumNu_[i], T);
    if (!tbClasses_.empty())
    {
        c.M.resize(tbClasses_.size());
        for (std::size_t k = 0; k < tbClasses_.size(); ++k)
            c.M[k] = Reaction::thirdBodyConcentration(c.conc, tbClasses_[k]);
    }
    if (anyFactory_)
    {
        factoryState_(c.nvec, V, T, c.concC, c.x, c.ntot, c.P);
    }
    return c;
}

void BatchReactor::setOperationParameter(const std::string& key, scalar value)
{
    if (key == "T_setpoint")
    {
        if (mode_ != Mode::Isothermal)
            throw std::runtime_error("BatchReactor '" + name_ + "': cannot"
                " set T_setpoint on a non-isothermal reactor (mode is"
                " adiabatic --- temperature is integrated by the energy"
                " balance, not user-supplied)");
        // A T change ends the current constant-physics segment, and the
        // JUMP itself is an energy intervention: an impulse record prices
        // it as a state difference (phase (e), #99-3).
        if (value != T_setpoint_)
        {
            closeSegment_(lastTime_);
            emitImpulse_(T_setpoint_, value);
            T_setpoint_ = value;
            state_.T    = value;
            openSegment_(lastTime_);
            return;
        }
        T_setpoint_ = value;
        state_.T    = value;
        return;
    }
    if (key == "T")
    {
        // For adiabatic mode, allow direct T forcing (e.g. external
        // jacket coming on).  In isothermal mode this is equivalent to
        // T_setpoint.
        if (value != state_.T)
        {
            closeSegment_(lastTime_);
            emitImpulse_(state_.T, value);
            state_.T    = value;
            if (mode_ == Mode::Isothermal) T_setpoint_ = value;
            openSegment_(lastTime_);
            return;
        }
        state_.T    = value;
        if (mode_ == Mode::Isothermal) T_setpoint_ = value;
        return;
    }
    if (key == "adiabatic")
    {
        //  THE COOLING FAILURE (DEV.md 4c C60, 2026-10-11).  A recipe event
        //  `setParameter reactor adiabatic 1` says: from this instant the
        //  jacket removes no heat.  The reactor stops being HELD at its
        //  setpoint and its temperature is integrated by the same adiabatic
        //  energy balance a reactor declared `mode adiabatic` uses, starting
        //  from the temperature it was held at, with whatever reactant has
        //  accumulated.  That is the scenario of the thermal-safety
        //  methodology (the MTSR is where it ends), and it was not one
        //  declaration before: `mode` is read once, at the charge.
        //
        //  `value 0` keeps the jacket working -- a no-op on an isothermal
        //  reactor, so a page can run the SAME recipe with and without the
        //  failure.  Bringing cooling BACK is refused: the jacket returning
        //  would hold the reactor at some temperature again, which is a
        //  setpoint and a duty this key does not declare.
        if (value != 0.0 && value != 1.0)
            throw std::runtime_error("BatchReactor '" + name_ + "': key"
                " 'adiabatic' takes 1 (the jacket stops removing heat) or 0"
                " (it keeps working); got " + std::to_string(value) + ".");
        if (mode_ == Mode::Adiabatic)
        {
            if (value == 1.0)
                throw std::runtime_error("BatchReactor '" + name_ + "': the"
                    " recipe sets 'adiabatic 1' on a reactor that is already"
                    " adiabatic -- there is no cooling left to lose.");
            throw std::runtime_error("BatchReactor '" + name_ + "': the"
                " recipe sets 'adiabatic 0' on an adiabatic reactor.  Bringing"
                " the cooling back is not modelled: the jacket would hold the"
                " reactor at a temperature again, which is a setpoint and a"
                " duty this key does not declare.");
        }
        if (value == 0.0) return;   // the jacket keeps working: nothing changes

        //  A reactor with no resolved heat of reaction would go adiabatic
        //  and stay at its temperature for ever -- a silently thermally
        //  neutral answer to a safety question.  Refuse, naming what is
        //  missing.
        if (!dutyMissing_.empty())
        {
            std::string why;
            for (const auto& m : dutyMissing_) why += "\n    " + m;
            throw std::runtime_error("BatchReactor '" + name_ + "': cannot"
                " take the cooling away -- the adiabatic energy balance needs"
                " a heat of reaction and this reactor has none:" + why);
        }
        requireAdiabaticData_();

        //  The jacket's last isothermal segment ends HERE, on the state it
        //  held; an adiabatic reactor exchanges nothing, so no record opens.
        closeSegment_(lastTime_);
        const scalar T_held = T_setpoint_;
        mode_       = Mode::Adiabatic;
        T_setpoint_ = 0;
        state_.T    = T_held;   // the adiabatic leg starts where it was held
        if (jacobianAnalytic_) buildJacobianStructure_();   // the T row and column join

        scalar nTot = 0.0;
        for (auto v : state_.n) nTot += v;
        std::cout << "  [cooling failure] batchReactor '" << name_ << "' at t = "
                  << lastTime_ << " s: the jacket stops removing heat.  The"
                     " reactor is ADIABATIC from here on, starting at T = "
                  << T_held << " K with " << nTot << " kmol in the vessel;"
                     " its temperature is now integrated by the energy"
                     " balance (the same one `mode adiabatic` uses).\n";
        return;
    }
    // Anything else: delegate to base so the standard error fires.
    BatchUnitOperation::setOperationParameter(key, value);
}

// ---- Energy ledger (phase (a)): exact per-segment duty --------------------

void BatchReactor::noteTimeAdvanced(scalar t)
{
    lastTime_ = t;
    while (ropNext_ < ropTimes_.size()
           && t >= ropTimes_[ropNext_] * (1.0 - 1.0e-9) - 1.0e-18)
        reportRatesOfProduction_(ropTimes_[ropNext_++], t);
    if (!timeSeen_)
    {
        timeSeen_ = true;
        openSegment_(t);
        return;
    }
    //  Temporal demand sample (ratified 2026-08-03): the SAME exact
    //  state-difference pricing the segment record closes over, taken per
    //  accepted DRIVER step.  It lives HERE and not in step() because a
    //  hasOdeForm() unit is advanced by the stiff sweep (setOdeState) --
    //  step() never runs for it -- while noteTimeAdvanced fires for every
    //  unit on every accepted step.  Q_iso is linear in dn at fixed T, so
    //  the samples telescope to the record exactly; a sampler bug shows up
    //  as a refused profile, never a moved ledger.
    if (mode_ == Mode::Isothermal && dutyByStateDiff_ && dutyMissing_.empty()
        && !demandDead_ && t > demandTPrev_)
    {
        //  An inventory the datum cannot price (e.g. a SPECTATOR without
        //  formation data -- dutyByStateDiff_ only vets the REACTING
        //  species) throws here just as it does at segment close; the
        //  close catches it and the record goes invalid NAMED, so the
        //  sampler stops quietly -- an invalid record casts no profile.
        try
        {
            const scalar dE = isoMixH_(state_.n) - isoMixH_(demandN0_);
            if (dE != 0.0)
                demandLog_.push_back({demandTPrev_, t, "reaction", dE, true});
        }
        catch (const std::exception&)
        {
            rethrowHardRefusal();   // C398 TG-01: a hard refusal is never a number
            demandDead_ = true;
            demandLog_.clear();
        }
    }
    demandN0_    = state_.n;
    demandTPrev_ = t;
}

void BatchReactor::notifyStateWillChange()
{
    // Recipe material charge/discharge, PRE-mutation: the segment closes
    // on the untouched inventory so its state difference stays PURELY
    // reactive.  (Closing post-mutation priced the transfer jump into the
    // "reaction" record -- recipe01's +6716.6 kJ that was really
    // H(empty)-H(charge), caught by the temporal-demand reconciliation.)
    closeSegment_(lastTime_);
}

void BatchReactor::notifyStateChanged()
{
    if (energy_ == Energy::GasConstantP) syncConstPVolume_();
    // POST-mutation re-base: the next segment starts from the transferred
    // state.  Never close here -- the close happened above, pre-mutation.
    openSegment_(lastTime_);
}

std::vector<SimulationResult::EnergyRecord>
BatchReactor::energyRecords(scalar tEnd)
{
    closeSegment_(tEnd);
    return energyLog_;
}

std::string BatchReactor::energyLedgerGap() const
{
    // Isothermal: the jacket duty is ledgered per segment.
    if (mode_ == Mode::Isothermal) return "";
    // Adiabatic liquidDH: the ODE conserves a FROZEN-dH surrogate (r.dH
    // resolved once at the charge T drives dT/dt over Cp), not the
    // canonical H surface -- so the vessel's end-state dH is ~dCp_rxn*
    // dT*xi away from zero (5.4 kJ on batch02, 2.6%; surfaced by the #106
    // golden scrutiny).  Until the adiabatic ODE integrates on the
    // canonical surface, the balance must not claim a verdict over it.
    if (energy_ == Energy::LiquidDH)
        return "adiabatic liquidDH ODE conserves a frozen-dH surrogate, not"
               " the canonical H surface (dH_rxn pinned at the charge T);"
               " canonical-H adiabatic integration pending";
    if (energy_ == Energy::GasConstantP)
        return "constant-pressure vessel (gasConstantP): dH = 0 holds by"
               " construction (the ODE is the first law), but no adiabatic"
               " vessel is ledgered yet; the H-based accounting is pending";
    return "constant-volume vessel (gasConstantV): an H-based balance is"
           " the wrong functional; U-based accounting pending";
}

void BatchReactor::openSegment_(scalar t)
{
    segStart_ = t;
    segN0_    = state_.n;
    segT_     = state_.T;
    // The demand-sample basis follows the segment: a charge/discharge or a
    // T impulse re-bases the sampler so the next reaction sample is purely
    // reactive (same reason the record's segN0_ resets here).
    demandN0_    = state_.n;
    demandTPrev_ = t;
}

void BatchReactor::emitImpulse_(scalar T_old, scalar T_new)
{
    if (!timeSeen_ || T_new == T_old) return;

    SimulationResult::EnergyRecord er;
    er.tStart = er.tEnd = lastTime_;
    er.unit   = name_;
    er.kind   = "impulse";
    er.T_service_K = T_new;   // worst case either way: heating must reach
                              // T_new; cooling must get below it

    bool ok = true;
    scalar H0 = 0.0, H1 = 0.0;   // kmol * J/mol = kJ
    try
    {
        scalar nTot = 0.0;
        for (auto v : state_.n) nTot += v;
        for (std::size_t i = 0; i < state_.n.size(); ++i)
        {
            if (state_.n[i] <= 0.0) continue;
            const auto& c = thermo_->comp(i);
            if (!c.hasGibbsData())
            {
                ok = false;
                er.E_missing.push_back("no enthalpy datum for '"
                                       + c.name() + "'");
            }
        }
        if (ok && nTot > 0.0)
        {
            // Priced on the SAME canonical surface as the duty and the
            // vessel terms (H_stream_formation) -- a second surface would
            // leak a fake residual into the balance.
            const scalar vf = isGas_() ? 1.0 : 0.0;
            const scalar P_Pa = state_.P > 0.0 ? state_.P : 1.0e5;   // state_.P is Pa (C390)
            sVector z(state_.n.size());
            for (std::size_t i = 0; i < state_.n.size(); ++i)
                z[i] = state_.n[i] / nTot;
            H0 = thermo_->H_stream_formation(T_old, P_Pa, vf, z) * nTot;
            H1 = thermo_->H_stream_formation(T_new, P_Pa, vf, z) * nTot;
        }
    }
    catch (const std::exception& ex)
    {
        rethrowHardRefusal();   // C398 TG-01: a hard refusal is never a number
        ok = false;
        er.E_missing.push_back(std::string("enthalpy evaluation failed: ")
                               + ex.what());
    }

    if (ok)
    {
        er.E_kJ    = H1 - H0;
        er.E_valid = true;
        er.basis   = "instantaneous setParameter T: E = H(n,T_new) -"
                     " H(n,T_old) on the elements datum (state difference,"
                     " never Sum n*Cp*dT)";
        //  Temporal demand: an impulse sample -- energy with no duration
        //  has NO finite rate (rateDefined=false: excluded from the peak,
        //  reported with a warning by the driver).
        demandLog_.push_back({lastTime_, lastTime_, "impulse",
                              er.E_kJ, false});
    }
    else
    {
        er.E_valid = false;
        er.basis   = "setParameter T impulse UNAVAILABLE: unpriceable"
                     " inventory";
    }
    energyLog_.push_back(std::move(er));
}

scalar BatchReactor::isoMixH_(const sVector& nv) const
{
    //  The ONE pricing of the isothermal segment (record AND per-step
    //  demand samples read it -- two pricings would leak a fake
    //  reconciliation residual): H on the canonical elements-datum
    //  surface at (segT_, P, phase leg).
    scalar nTot = 0.0;
    for (auto v : nv) nTot += v;
    if (nTot <= 0.0) return 0.0;
    const scalar vf = isGas_() ? 1.0 : 0.0;
    const scalar P_Pa = state_.P > 0.0 ? state_.P : 1.0e5;   // state_.P is Pa (C390)
    sVector z(nv.size());
    for (std::size_t i = 0; i < nv.size(); ++i) z[i] = nv[i] / nTot;
    return thermo_->H_stream_formation(segT_, P_Pa, vf, z) * nTot;  // kJ
}

void BatchReactor::closeSegment_(scalar t)
{
    if (mode_ != Mode::Isothermal || !timeSeen_) return;

    bool changed = false;
    for (std::size_t i = 0; i < state_.n.size() && i < segN0_.size(); ++i)
        if (state_.n[i] != segN0_[i]) { changed = true; break; }
    if (!changed && t <= segStart_ + 1.0e-12) return;   // empty boundary echo

    SimulationResult::EnergyRecord er;
    er.tStart = segStart_;
    er.tEnd   = t;
    er.unit   = name_;
    er.kind   = "reaction";
    er.T_service_K = segT_;   // isothermal: the jacket serves at the held T

    if (!dutyMissing_.empty())
    {
        er.E_valid   = false;
        er.E_missing = dutyMissing_;
        er.basis     = "isothermal jacket duty UNAVAILABLE:"
                       " unresolved heat of reaction";
        energyLog_.push_back(std::move(er));
        return;
    }

    try
    {
        if (dutyByStateDiff_)
        {
            // Q = dH of the closed constant-P isothermal segment: an exact
            // state difference priced on the CANONICAL enthalpy surface
            // (H_stream_formation -- the same one the vessel terms and the
            // material ledger read; two surfaces would leak a fake residual
            // into the balance, found live on batch05/batch01).
            er.E_kJ    = isoMixH_(state_.n) - isoMixH_(segN0_);
            er.E_valid = true;
            er.basis   = "isothermal closed vessel at constant P:"
                         " Q = dH = H(n1,T) - H(n0,T), canonical elements-"
                         "datum surface (H_stream_formation)";
        }
        else
        {
            // Extent branch: solve N*xi = dn (normal equations, pivot-
            // checked Gauss) and price with the per-reaction resolved dH --
            // the announced dict override where formation data is absent.
            const std::size_t nR = reactions_.size();
            sVector dn(state_.n.size(), 0.0);
            for (std::size_t i = 0;
                 i < state_.n.size() && i < segN0_.size(); ++i)
                dn[i] = state_.n[i] - segN0_[i];

            // A = N^T N, b = N^T dn  (nR x nR; nR is small)
            std::vector<sVector> A(nR, sVector(nR, 0.0));
            sVector b(nR, 0.0);
            auto nuOf = [&](const ReactionSpec& r, std::size_t i) -> scalar
            {
                for (std::size_t s = 0; s < r.comps.size(); ++s)
                    if (r.comps[s] == i) return r.nu[s];
                return 0.0;
            };
            for (std::size_t j = 0; j < nR; ++j)
            {
                for (std::size_t k = 0; k < nR; ++k)
                    for (std::size_t i = 0; i < dn.size(); ++i)
                        A[j][k] += nuOf(reactions_[j], i)
                                 * nuOf(reactions_[k], i);
                for (std::size_t i = 0; i < dn.size(); ++i)
                    b[j] += nuOf(reactions_[j], i) * dn[i];
            }
            // Gauss with partial pivoting; a vanishing pivot means the
            // reaction set is linearly dependent and extents cannot be
            // separated from state differences -- refuse, NAMED.
            bool singular = false;
            for (std::size_t p = 0; p < nR && !singular; ++p)
            {
                std::size_t best = p;
                for (std::size_t r2 = p + 1; r2 < nR; ++r2)
                    if (std::abs(A[r2][p]) > std::abs(A[best][p])) best = r2;
                std::swap(A[p], A[best]);
                std::swap(b[p], b[best]);
                if (std::abs(A[p][p]) < 1.0e-30) { singular = true; break; }
                for (std::size_t r2 = p + 1; r2 < nR; ++r2)
                {
                    const scalar f = A[r2][p] / A[p][p];
                    for (std::size_t c2 = p; c2 < nR; ++c2)
                        A[r2][c2] -= f * A[p][c2];
                    b[r2] -= f * b[p];
                }
            }
            if (singular)
            {
                er.E_valid   = false;
                er.E_missing = { "linearly dependent reaction set:"
                                 " extents unrecoverable from state"
                                 " differences" };
                er.basis     = "isothermal jacket duty UNAVAILABLE";
                energyLog_.push_back(std::move(er));
                return;
            }
            sVector xi(nR, 0.0);
            for (std::size_t p = nR; p-- > 0;)
            {
                scalar s = b[p];
                for (std::size_t c2 = p + 1; c2 < nR; ++c2)
                    s -= A[p][c2] * xi[c2];
                xi[p] = s / A[p][p];
            }
            scalar E = 0.0;   // J/mol * kmol = kJ
            for (std::size_t j = 0; j < nR; ++j)
                E += reactions_[j].dH * xi[j];
            er.E_kJ    = E;
            er.E_valid = true;
            er.basis   = "isothermal closed vessel: Q = sum(dH_j*xi_j),"
                         " extents solved from N*xi = dn (announced dH_rxn"
                         " override where formation data is absent)";
        }
    }
    catch (const std::exception& ex)
    {
        rethrowHardRefusal();   // C398 TG-01: a hard refusal is never a number
        er.E_valid   = false;
        er.E_missing = { std::string("enthalpy evaluation failed: ")
                         + ex.what() };
        er.basis     = "isothermal jacket duty UNAVAILABLE";
        er.E_kJ      = 0.0;
    }
    energyLog_.push_back(std::move(er));
}

//  The pressure of a closed constant-volume ideal gas, P = n R T / V [Pa].  A vessel in
//  `energy gasConstantV` has no other pressure: the one declared under `initial` is its
//  START, and every reader of the vessel's state (KPI P_final, the state table) must see
//  the pressure of the state it reads (it used to see the initial one for ever).
static scalar gasConstantVPressure(const BatchState& s)
{
    scalar nTot = 0.0;
    for (scalar v : s.n) nTot += v;
    return s.V > 0.0 ? nTot * 1000.0 * constant::R * s.T / s.V : s.P;   // kmol -> mol
}

void BatchReactor::syncConstPVolume_()
{
    state_.V = constPVolume_(state_.totalMoles(), state_.T);
}

void BatchReactor::step(scalar t, scalar dt)
{
    // Pack state: (n[0..n-1], T).
    const std::size_t n = state_.n.size();
    sVector y0(n + 1);
    for (std::size_t i = 0; i < n; ++i) y0[i] = state_.n[i];
    y0[n] = state_.T;

    if (jacobianDeclared_ && !solver::ODEIntegrator::readsAnalyticJacobian(integrator_))
        throw std::runtime_error("BatchReactor '" + name_ + "': `jacobian"
            " analytic;` is declared but this fixed-step run integrates the"
            " vessel with " + integrator_ + ", which builds no Jacobian --"
            " the key would be read by nothing.  Declare `integrator"
            " Rosenbrock23;` (or Rodas4), or `timeStepping adaptive;` in"
            " controlDict, or drop the key.");

    if (integrator_ == "RK4")
    {
        // The classic explicit step -- unchanged, so every existing batch
        // tutorial is byte-identical.
        auto axpy = [](const sVector& x, scalar a, const sVector& y) {
            sVector r(x.size());
            for (std::size_t i = 0; i < x.size(); ++i) r[i] = x[i] + a * y[i];
            return r;
        };

        auto k1 = derivatives_(y0);
        auto k2 = derivatives_(axpy(y0, 0.5 * dt, k1));
        auto k3 = derivatives_(axpy(y0, 0.5 * dt, k2));
        auto k4 = derivatives_(axpy(y0,       dt, k3));

        for (std::size_t i = 0; i < y0.size(); ++i)
            y0[i] += dt / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);
    }
    else
    {
        // Stiff / semi-implicit path: advance the SAME packed derivatives over
        // [0, dt] with the selected adaptive integrator.  The derivatives are
        // autonomous in t (chemistry), so the wrapper ignores the time arg.
        if (!solver::ODEIntegrator::known(integrator_))
            solver::ODEIntegrator::registerBuiltins();
        auto integ = solver::ODEIntegrator::New(integrator_);

        solver::DerivFn f =
            [this](scalar /*t*/, const sVector& y) { return derivatives_(y); };

        solver::ODEControls ctrl;
        ctrl.atol.assign(n + 1, 1.0e-15);   // species rows: rtol dominates
        ctrl.atol[n] = 1.0e-6;              // temperature row [K]
        ctrl.rtol      = 1.0e-7;
        ctrl.positiveRows.assign(n, true);  // mole numbers must stay >= 0 (T free)
        ctrl.verbosity = verbosity_;
        //  The opt-in analytic Jacobian, its audit record kept on the vessel
        //  across steps so the doubling schedule spans the whole run.
        if (jacobianAnalytic_ && solver::ODEIntegrator::readsAnalyticJacobian(integrator_))
        {
            wireAnalytic_(jacAudit_, "batchReactor '" + name_ + "'");
            ctrl.analytic = &jacAudit_;
        }
        const auto tInt = std::chrono::steady_clock::now();
        const auto st = integ->integrate(y0, 0.0, dt, f, ctrl);
        nsIntegrate_ += std::chrono::duration_cast<std::chrono::nanoseconds>(
                            std::chrono::steady_clock::now() - tInt).count();
        if (ctrl.analytic) announceJacobianAudits_(t);
        //  The cost, counted (verbosity >= 4): every right-hand side this
        //  vessel has evaluated -- steps, Jacobians, audits -- so the two
        //  Jacobians can be compared by what they spend, not by a claim.
        if (verbosity_ >= 4)
            std::cout << "  [ODE] batchReactor '" << name_ << "': right-hand"
                         " sides so far " << rhsEvals_.load() << ", Jacobian "
                      << (ctrl.analytic ? "analytic (" + std::to_string(jacAudit_.jacobians)
                              + " built, " + std::to_string(jacAudit_.auditEvals)
                              + " right-hand sides spent on audits)"
                                            : std::string("finite difference"))
                      << ", W factored "
                      << (ctrl.analytic && jacAudit_.sparse
                              ? "SPARSE (" + std::to_string(jacAudit_.sparseFactorisations)
                                + " factorisations, " + std::to_string(jacAudit_.denseFallbacks)
                                + " refactored dense, worst probe backward error "
                                + [this] { char b[32]; std::snprintf(b, sizeof b, "%.1e",
                                      jacAudit_.sparseBackwardErrorMax); return std::string(b); }()
                                + ")"
                              : std::string("dense"))
                      << [this] {
                             char b[200];
                             const double tot = 1e-9 * double(nsIntegrate_), rhs = 1e-9 * double(nsRhs_.load()),
                                          jac = 1e-9 * double(nsJac_.load());
                             std::snprintf(b, sizeof b, "; wall %.3f s = right-hand sides %.3f"
                                           " (audits included) + Jacobian %.3f + linear algebra"
                                           " and the rest %.3f", tot, rhs, jac, tot - rhs - jac);
                             return std::string(b); }()
                      << "\n";
        //  The integrator REPORTS when it gave up (maxSteps / hMin / a
        //  positivity or finiteness violation on a fixed step) -- and until
        //  2026-08-22 this return value was DISCARDED, so an EulerSI ignition
        //  that blew up to T = -1610 K sailed on to exit 0.  An accepted
        //  state that is infeasible is fatal (Constitution SS6).
        if (!st.ok)
            throw std::runtime_error("BatchReactor '" + name_ + "': the '"
                + integrator_ + "' integrator GAVE UP inside a "
                + std::to_string(dt) + " s step (accepted " 
                + std::to_string(st.accepted) + " sub-step(s), stopping "
                + std::to_string(st.tReached) + " s into it: "
                + (st.failure.empty() ? std::string("cause not reported")
                                      : st.failure)
                + ").  Use a"
                " smaller deltaT or a stiff integrator"
                " (integrator Rosenbrock23;).");
    }

    //  Unpack.  The stiff branch cannot hand back a negative mole number
    //  (its positivity mask rejects the trial), so a negative row here comes
    //  from the EXPLICIT RK4 step, which cannot reject a step.  It is clipped
    //  to zero -- and the clip is ANNOUNCED with the amount it invents, never
    //  silent (2026-10-31, DEV.md 4c C185 item 8): a clipped overshoot is
    //  inventory the vessel did not hold.
    for (std::size_t i = 0; i < n; ++i)
    {
        if (y0[i] < 0.0)
        {
            std::ostringstream m;
            m << "the fixed " << integrator_ << " step of " << dt
              << " s drove n_" << thermo_->comp(i).name() << " to " << y0[i]
              << " kmol and it was CLIPPED to zero (" << -y0[i]
              << " kmol invented): a fixed step cannot reject an overshoot --"
                 " reduce deltaT, or declare `timeStepping adaptive;` so the"
                 " step that crosses zero is rejected instead";
            if (AdvisoryLog::instance().addAnnouncedOnce(
                    "batchReactor-clip:" + name_ + ":" + thermo_->comp(i).name(),
                    "bound", "warning", "batchReactor '" + name_ + "'", m.str()))
                std::cerr << "  [batchReactor] WARNING: '" << name_ << "': "
                          << m.str() << "\n";
        }
        state_.n[i] = std::max<scalar>(y0[i], 0.0);
    }
    state_.T = (mode_ == Mode::Isothermal) ? T_setpoint_ : y0[n];
    if (energy_ == Energy::GasConstantV) state_.P = gasConstantVPressure(state_);
    else if (energy_ == Energy::GasConstantP) syncConstPVolume_();
    //  An ACCEPTED state must be physical: a finite but negative or zero
    //  absolute temperature is not an extrapolation, it is a blown
    //  integration, and it used to sail into the thermo (which dutifully
    //  announced Cp "extrapolated to -1610 K, still returned") at exit 0.
    if (!std::isfinite(state_.T) || state_.T <= 0.0)
        throw std::runtime_error("BatchReactor '" + name_ + "': accepted"
            " state has unphysical T = " + std::to_string(state_.T)
            + " K after a " + integrator_ + " step -- the integration blew"
            " up.  Use a smaller deltaT or a stiff integrator"
            " (integrator Rosenbrock23;).");
}

// ---- Packed-ODE form (the adaptive driver) ------------------------------
//  Pack/unpack mirror step()'s convention EXACTLY (n_0..n_{N-1}, T), including
//  the isothermal T-pin, so the adaptive sweep and a fixed step() agree.
sVector BatchReactor::odeState() const
{
    const std::size_t n = state_.n.size();
    sVector y(n + 1);
    for (std::size_t i = 0; i < n; ++i) y[i] = state_.n[i];
    y[n] = state_.T;
    return y;
}

void BatchReactor::setOdeState(const sVector& y)
{
    const std::size_t n = state_.n.size();
    for (std::size_t i = 0; i < n; ++i)
    {
        //  The adaptive driver's per-row positivity mask covers every mole
        //  number this vessel packs (odeNPositive), so the integrator never
        //  ACCEPTS a step that drives one negative.  This used to clip to
        //  zero in silence -- and with two or more packed units the mask was
        //  OFF, so the clip was inventing inventory (DEV.md 4c C185 item 8).
        //  A negative row arriving here now is an ENGINE DEFECT (a mask not
        //  applied, or a caller committing an unaccepted trial), and it is
        //  refused by name rather than hidden.
        if (y[i] < 0.0)
            throw std::runtime_error("BatchReactor '" + name_ + "': the"
                " integrator committed a NEGATIVE mole number n_"
                + thermo_->comp(i).name() + " = " + std::to_string(y[i])
                + " kmol.  The per-row positivity mask (solver/ODE/"
                "AdaptiveTimeStep.H, positiveRowMask) must reject such a"
                " step before it is accepted; that it reached setOdeState is"
                " an engine defect, not a case error -- report it.");
        state_.n[i] = y[i];
    }
    state_.T = (mode_ == Mode::Isothermal) ? T_setpoint_ : y[n];
    if (energy_ == Energy::GasConstantV) state_.P = gasConstantVPressure(state_);
    else if (energy_ == Energy::GasConstantP) syncConstPVolume_();
}

// -----------------------------------------------------------------------
//  THE ANALYTIC JACOBIAN (the default where every law has a derivative;
//  `solver { jacobian analytic | finiteDifference; }` to choose).
//
//  State y = (n_1..n_N, T); right-hand side (derivatives_)
//      dn_i/dt = sum_j nu_ij r_j V,     c_k = n_k / V.
//  Per reaction the Jacobian needs the TOTAL derivatives of r_j V,
//      D_jm = d(r_j V)/d n_m,    E_j = d(r_j V)/d T,
//  and then  J_im = sum_j nu_ij D_jm,  J_iT = sum_j nu_ij E_j.
//  The rate is a function of (c, T, P); the vessel decides how c, P and V
//  move with the state (Theory Guide, sec:batch-analytic-jacobian):
//    V fixed (liquidDH, gasConstantV):  D_jm = g_jm + s_j,
//        g_jm = d r_j / d c_m                      (sparse: the species r_j reads)
//        s_j  = (d r_j/d P) 1000 R T               (a law reading P = n R T / V)
//        E_j  = V (d r_j/d T + (d r_j/d P) P / T);
//    P fixed (gasConstantP, V = n R T / P):  dV/dn_m = V/n, dc_k/dn_m = d_km/V - c_k/n,
//        s_j  = (V/n) (r_j - sum_k g_jk c_k),
//        E_j  = V (d r_j/d T - (1/T) sum_k g_jk c_k) + r_j V / T.
//  s_j is the same for EVERY species column: J = S + u v^T with S on the
//  network's pattern, u_i = sum_j nu_ij s_j and v the species indicator --
//  dense, but of rank one, so the sparse solver keeps S (Sherman-Morrison).
//
//  g_jm and d r_j / d T come from the SAME pieces rateOfReaction_ multiplies
//  (rateGradient_), term by term:
//    mass action   r_f = k * prod_s f_s,  f_s = c_s^order_s (clamped at 0
//                  for a positive order, exactly as the rate is), and
//                  d r_f / d c_k = k * sum_{s: species k} f_s' * prod_{s'!=s} f_s'
//                  -- the product EXCLUDING the entry, never r_f / c_k
//                  (which would divide by a zero radical);
//    rate constant d k/dT = k (b/T + Ea/(R T^2)) per Arrhenius leg;
//    third body    k = k0(T) [M], [M] = sum_i eff_i c_i  =>  dk/dc_k = k0 eff_k;
//    fall-off      k = F(kLow, kInf, [M], T): Lindemann and Troe EXACTLY in
//                  [M] and in T (Reaction::falloffRateDerivs, F_cent(T)
//                  included);
//    reverse leg   k / Kc * prod_{products} c^nu, Kc once per reaction at the
//                  T of the call, d ln Kc/dT = sum nu h_i/(R T^2) - sum nu/T
//                  (h_i(T) from the species' own records, enthalpyAt_);
//    factory laws  ElementaryRate (modifiedArrhenius, thirdBody, falloff,
//                  PLOG -- d k/d P of the ln P interpolation) answers for
//                  itself (ReactionRate::netRateGradient); a law WITHOUT a
//                  derivative (LHHW, expression, a case's law) is a forward
//                  difference of THAT reaction's r V over every species column
//                  and T (rateGradientFD_), V moving with n and T as the
//                  vessel's basis says -- the law receives the whole
//                  concentration and mole-fraction vectors, so its own species
//                  would not be its whole reach.  So is a power below one at
//                  zero concentration (an infinite one-sided derivative).
//  The energy row, by the chain rule with the per-reaction weight w_j:
//    liquidDH      Tdot = -sum_j dH_j r_j V / CpTot,   w_j = dH_j,
//    gasConstantV  Tdot = -sum_i u_i ndot_i / CvTot,   w_j = sum_s nu_s u_s,
//    gasConstantP  Tdot = -sum_i h_i ndot_i / CpTot,   w_j = sum_s nu_s h_s,
//      d Tdot/d n_m = -( sum_j w_j D_jm + Tdot C_m ) / Ctot,
//      d Tdot/d T   = -( [gas] sum_i C_i ndot_i + sum_j w_j E_j
//                        + Tdot sum_i n_i dC_i/dT ) / Ctot,
//  (du_i/dT = Cv_i, dh_i/dT = Cp_i).  dC_i/dT, the slope of the record's
//  heat-capacity law, is the one scalar taken by a central difference: the
//  law lives in the component record, which offers no derivative.
//  Isothermal: the right-hand side reads T_setpoint, not y[N], so the T row
//  and column are exactly zero.
//
//  The whole matrix is AUDITED by the integrator against a central finite
//  difference on a doubling schedule (ODEAnalyticJacobian) and the run is
//  refused by name if a column disagrees.
// -----------------------------------------------------------------------
namespace
{
//  The forward-difference step the integrator's dense Jacobian takes for a
//  column (solver/ODE/Jacobian.cpp, fdJacobianODE), reproduced so a column
//  differenced here is the column the audit compares it with.
scalar fdStep(scalar y, scalar typ)
{
    static const scalar kSqrtEps = std::sqrt(2.220446049250313e-16);
    scalar eps = kSqrtEps * std::max(std::max(std::abs(y), std::abs(typ)), 1.0e-30);
    if (eps == 0.0) eps = kSqrtEps;
    return eps;
}

//  d Cp / d T of a record's heat-capacity law: a central difference, step
//  cbrt(eps) T (truncation ~1e-11 relative, rounding ~1e-10 of the slope).
scalar cpSlope(const HeatCapacityModel& cp, scalar T)
{
    const scalar h = 6.0555e-6 * T;
    return (cp.Cp(T + h) - cp.Cp(T - h)) / (2.0 * h);
}
}

scalar BatchReactor::volumeAt_(const sVector& n, scalar T) const
{
    if (energy_ != Energy::GasConstantP) return state_.V;
    scalar nT = 0.0;
    for (scalar v : n) nT += v;
    return constPVolume_(nT, T);
}

//  Same lifetime as gibbsAt_'s reference.
const sVector& BatchReactor::enthalpyAt_(scalar T) const
{
    static const sVector kNone;
    const std::vector<char>& want = wantG_;     // the same species as gibbsAt_
    if (want.empty()) return kNone;
    GibbsMemo& m = gibbsMemo();
    if (m.id != memoId_.v || m.T != T)
    {
        m.id = memoId_.v; m.T = T; m.haveH = m.haveG = m.haveAll = false;
    }
    if (m.haveH) return m.h;
    sVector h(want.size(), 0.0);
    for (std::size_t i = 0; i < want.size(); ++i)
        if (want[i]) h[i] = thermo_->comp(i).h_pure_ig(T);
    m.h = std::move(h);
    m.haveH = true;       // gibbsAt_ at this T refills h and g together, never reads this half-state
    return m.h;
}

//  THE PATTERN, from the network, once.  Row i (a species) holds column m
//  when a reaction that changes i (nu_i != 0) reads m: its forward orders,
//  its reverse products, its colliders (every species of non-zero
//  efficiency, all of them when no efficiencies are listed), every species
//  for a law without a pattern.  Every species row has the T column, the T
//  row is full (Tdot C_m reaches every column), every diagonal is stored.
//  Isothermal: no T row or column beyond the diagonal.
void BatchReactor::buildJacobianStructure_()
{
    const std::size_t n = thermo_->n();
    const std::size_t N = n + 1;
    const bool adiab = (mode_ == Mode::Adiabatic);
    jacDeps_.assign(reactions_.size(), {});
    jacRankOne_ = (energy_ == Energy::GasConstantP);
    std::vector<std::vector<std::size_t>> rows(N);
    std::vector<char> mark(n, 0);
    for (std::size_t j = 0; j < reactions_.size(); ++j)
    {
        const auto& r = reactions_[j];
        std::vector<std::size_t>& d = jacDeps_[j];
        bool all = false;
        if (r.form == RateForm::Factory)
        {
            if (fdLaw_[j] || !r.law->rateDependencies(d)) all = true;
            if (!fdLaw_[j] && r.law->readsPressure()
                && energy_ == Energy::GasConstantV) jacRankOne_ = true;
        }
        else
        {
            for (std::size_t s = 0; s < r.comps.size(); ++s)
            {
                if (r.order[s] != 0.0) d.push_back(r.comps[s]);
                if (r.reversible && r.orderRev[s] != 0.0) d.push_back(r.comps[s]);
            }
            if (r.form == RateForm::ThirdBody || r.form == RateForm::Falloff)
            {
                if (r.tbEff.empty()) all = true;
                else for (std::size_t i = 0; i < n; ++i) if (r.tbEff[i] != 0.0) d.push_back(i);
            }
        }
        if (all) { d.resize(n); for (std::size_t i = 0; i < n; ++i) d[i] = i; }
        std::sort(d.begin(), d.end());
        d.erase(std::unique(d.begin(), d.end()), d.end());
        for (std::size_t s = 0; s < r.comps.size(); ++s)
            if (r.nu[s] != 0.0)
                rows[r.comps[s]].insert(rows[r.comps[s]].end(), d.begin(), d.end());
    }
    for (std::size_t i = 0; i < N; ++i)
    {
        rows[i].push_back(i);
        if (adiab && i < n) rows[i].push_back(n);
        if (adiab && i == n) for (std::size_t k = 0; k < n; ++k) rows[i].push_back(k);
    }
    auto P = std::make_shared<solver::SparsePattern>();
    P->n = N;
    P->rowPtr.assign(N + 1, 0);
    for (std::size_t i = 0; i < N; ++i)
    {
        auto& r = rows[i];
        std::sort(r.begin(), r.end());
        r.erase(std::unique(r.begin(), r.end()), r.end());
        P->col.insert(P->col.end(), r.begin(), r.end());
        P->rowPtr[i + 1] = P->col.size();
    }
    jacPattern_ = P;
    jacPos_.assign(reactions_.size(), {});
    for (std::size_t j = 0; j < reactions_.size(); ++j)
    {
        const auto& r = reactions_[j];
        const auto& d = jacDeps_[j];
        auto& pos = jacPos_[j];
        pos.assign(r.comps.size() * d.size(), static_cast<std::size_t>(-1));
        for (std::size_t s = 0; s < r.comps.size(); ++s)
            if (r.nu[s] != 0.0)
                for (std::size_t q = 0; q < d.size(); ++q)
                    pos[s * d.size() + q] = P->find(r.comps[s], d[q]);
    }
    jacPosTrow_.assign(N, static_cast<std::size_t>(-1));
    jacPosTcol_.assign(n, static_cast<std::size_t>(-1));
    if (adiab)
    {
        for (std::size_t k = 0; k < N; ++k) jacPosTrow_[k] = P->find(n, k);
        for (std::size_t i = 0; i < n; ++i) jacPosTcol_[i] = P->find(i, n);
    }
}

void BatchReactor::rateGradientFD_(const ReactionSpec& rxn, scalar T,
                                   const sVector& n, const sVector& sc, scalar epsT,
                                   sVector& D, scalar& E) const
{
    const scalar V0 = volumeAt_(n, T);
    const scalar r0 = rateOfReaction_(rxn, T, n, V0, nullptr) * V0;
    sVector np = n;
    for (std::size_t k = 0; k < n.size(); ++k)
    {
        const scalar eps = fdStep(n[k], k < sc.size() ? sc[k] : 1.0);
        np[k] = n[k] + eps;
        const scalar Vp = volumeAt_(np, T);
        D[k] = (rateOfReaction_(rxn, T, np, Vp, nullptr) * Vp - r0) / eps;
        np[k] = n[k];
    }
    E = 0.0;
    if (mode_ == Mode::Adiabatic)
    {
        const scalar Vp = volumeAt_(n, T + epsT);
        E = (rateOfReaction_(rxn, T + epsT, n, Vp, nullptr) * Vp - r0) / epsT;
    }
}

bool BatchReactor::rateGradientLaw_(const ReactionSpec& rxn, scalar T,
                                    const sVector& n, scalar V, sVector& grad,
                                    scalar& dT, scalar& dP,
                                    const sVector* g, const sVector* h,
                                    const KinCtx* ctx) const
{
    //  The state exactly as rateOfReaction_ hands it to the law.
    sVector concL, xL;
    scalar ntotL = 0.0, PL = 0.0;
    if (!ctx) factoryState_(n, V, T, concL, xL, ntotL, PL);
    RateState rs;
    rs.T = T; rs.P = ctx ? ctx->P : PL;
    rs.conc = ctx ? &ctx->concC : &concL; rs.x = ctx ? &ctx->x : &xL;
    rs.amountPerKmol = 1.0;
    rs.gibbs = (g && !g->empty()) ? g : nullptr;
    rs.enthalpy = (h && !h->empty()) ? h : nullptr;
    RateGradient rg;
    rg.dc = &grad;
    if (!rxn.law->netRateGradient(*thermo_, rs, rg)) return false;
    const scalar f = multOf_(rxn, ctx) * ((catalystLoading_ > 0.0) ? catalystLoading_ : 1.0);
    if (f != 1.0)
        for (std::size_t k : jacDeps_[&rxn - reactions_.data()]) grad[k] *= f;
    dT = f * rg.dT;
    dP = f * rg.dP;
    return true;
}

bool BatchReactor::rateGradient_(const ReactionSpec& rxn, scalar T,
                                 const sVector& n, scalar V, sVector& grad,
                                 scalar& dT, const sVector* g, const sVector* h,
                                 const KinCtx* ctx) const
{
    const std::size_t nc = n.size();
    // ---- k_eff, d k_eff / d [M] and d k_eff / d T ---------------------------
    scalar k = 0.0, dkdT = 0.0, dkdM = 0.0;
    const sVector* eff = nullptr;
    static const sVector kAll1;
    switch (rxn.form)
    {
        case RateForm::Arrhenius:
            k = ctx ? rxn.A_pre * ctx->expEa[rxn.eaIdx]
                    : Reaction::arrheniusRate(rxn.A_pre, rxn.Ea, T);
            dkdT = k * Reaction::dlnModifiedArrheniusdT(0.0, rxn.Ea, T);
            break;
        case RateForm::ModArrhenius:
            k = ctx ? kModArr_(*ctx, rxn.A_pre, rxn.bIdx, rxn.eaIdx)
                    : Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);
            dkdT = k * Reaction::dlnModifiedArrheniusdT(rxn.b, rxn.Ea, T);
            break;
        case RateForm::Factory: return false;      // rateGradientLaw_ / rateGradientFD_
        case RateForm::ThirdBody:
        case RateForm::Falloff:
        {
            eff = rxn.tbEff.empty() ? &kAll1 : &rxn.tbEff;
            scalar M;
            if (ctx && rxn.tbClass >= 0) M = ctx->M[rxn.tbClass];
            else
            {
                sVector conc(nc);
                for (std::size_t j = 0; j < nc; ++j) conc[j] = n[j] / V;
                M = Reaction::thirdBodyConcentration(conc, *eff);
            }
            const scalar dlnInf = Reaction::dlnModifiedArrheniusdT(rxn.b, rxn.Ea, T);
            if (rxn.form == RateForm::ThirdBody)
            {
                const scalar k0 = ctx ? kModArr_(*ctx, rxn.A_pre, rxn.bIdx, rxn.eaIdx)
                                      : Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);
                k    = k0 * M;
                dkdM = k0;
                dkdT = k0 * dlnInf * M;
            }
            else
            {
                const scalar kInf = ctx ? kModArr_(*ctx, rxn.A_pre, rxn.bIdx, rxn.eaIdx)
                                        : Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);
                const scalar kLow = ctx ? kModArr_(*ctx, rxn.A_low, rxn.bLowIdx, rxn.eaLowIdx)
                                        : Reaction::modifiedArrheniusRate(rxn.A_low, rxn.b_low, rxn.Ea_low, T);
                k = Reaction::falloffRate(kLow, kInf, M, T, rxn.troe, rxn.sri, rxn.name);
                const auto fd = Reaction::falloffRateDerivs(kLow, kInf, M, T, rxn.troe,
                    Reaction::dlnModifiedArrheniusdT(rxn.b_low, rxn.Ea_low, T), dlnInf, rxn.sri, rxn.name);
                dkdM = fd.dkdM;
                dkdT = fd.dkdT;
            }
            break;
        }
    }
    const scalar mult = multOf_(rxn, ctx);
    const scalar kscale = ((catalystLoading_ > 0.0) ? catalystLoading_ : 1.0) * mult;
    if (catalystLoading_ > 0.0) k *= catalystLoading_;   // as in rateOfReaction_
    if (mult != 1.0) k *= mult;
    dkdT *= kscale;
    dkdM *= kscale;

    // ---- the factors f_s and their derivatives f_s' ----------------------
    //  Mirrors rateOfReaction_: a positive order reads max(c, 0); a negative
    //  order reads c (and powerLawFactor refuses c <= 0, as the rate does).
    //  A power below one at c = 0 has an INFINITE one-sided derivative: that
    //  reaction is differenced instead (rateGradientFD_), never inf into W.
    const std::size_t m = rxn.comps.size();
    const auto factor = [&](scalar c, scalar p, bool clamp,
                            std::size_t s, scalar& f, scalar& df) -> bool
    {
        if (p == 0.0) { f = 1.0; df = 0.0; return true; }
        const scalar cc = clamp ? std::max<scalar>(c, 0.0) : c;
        f = clamp ? orderPow(cc, p)
                  : Reaction::powerLawFactorLazy(cc, p,
                        [&]() -> const std::string& { return thermo_->comp(rxn.comps[s]).name(); },
                        [&]() { return "batchReactor reaction '" + rxn.name + "'"; });
        if (clamp && c < 0.0) { df = 0.0; return true; }     // flat clamp
        if (cc == 0.0)
        {
            if (p == 1.0) { df = 1.0; return true; }
            if (p > 1.0)  { df = 0.0; return true; }
            return false;                                   // p < 1: infinite
        }
        df = p * orderPow(cc, p - 1.0);
        return true;
    };

    //  The four per-reaction factor vectors live in thread-local scratch (no allocation after the
    //  first call on a thread; one reaction at a time per thread, no recursion).
    struct FactorScratch { sVector ff, dff, fr, dfr; };
    static thread_local FactorScratch fs;
    sVector& ff = fs.ff; sVector& dff = fs.dff;
    ff.assign(m, 1.0); dff.assign(m, 0.0);
    for (std::size_t s = 0; s < m; ++s)
    {
        const scalar p = rxn.order[s];
        if (p == 0.0) continue;
        if (!factor(ctx ? ctx->conc[rxn.comps[s]] : n[rxn.comps[s]] / V, p, p > 0.0, s, ff[s], dff[s])) return false;
    }
    // Reverse factors (clamped, exponent orderRev: the products' nu, or a
    // both-sides species' declared product count).
    sVector& fr = fs.fr; sVector& dfr = fs.dfr;
    fr.assign(m, 1.0); dfr.assign(m, 0.0);
    if (rxn.reversible)
        for (std::size_t s = 0; s < m; ++s)
        {
            if (rxn.orderRev[s] == 0.0) continue;
            // the rate uses std::pow(max(c,0), orderRev) -- the same function
            if (!factor(ctx ? ctx->conc[rxn.comps[s]] : n[rxn.comps[s]] / V, rxn.orderRev[s], true, s, fr[s], dfr[s])) return false;
        }

    const auto productExcept = [m](const sVector& f, std::size_t skip)
    {
        scalar p = 1.0;
        for (std::size_t s = 0; s < m; ++s) if (s != skip) p *= f[s];
        return p;
    };

    // forward leg
    const scalar Pf = productExcept(ff, m);           // the whole product
    if (eff)
        for (std::size_t j = 0; j < nc; ++j)
        {
            const scalar e = (j < eff->size()) ? (*eff)[j] : 1.0;
            if (e != 0.0) grad[j] += dkdM * e * Pf;
        }
    for (std::size_t s = 0; s < m; ++s)
        if (dff[s] != 0.0)
            grad[rxn.comps[s]] += k * dff[s] * productExcept(ff, s);
    dT = dkdT * Pf;
    if (!rxn.reversible) return true;

    // reverse leg: k / Kc, Kc once per reaction at this T
    const scalar Kc = (g && !g->empty())
                        ? ((ctx && rxn.cfIdx >= 0)
                               ? Reaction::equilibriumKcWithFactor(rxn.comps, rxn.nu, T, *g, ctx->cf[rxn.cfIdx])
                               : Reaction::equilibriumKc(rxn.comps, rxn.nu, T, *g))
                        : Reaction::equilibriumKc(*thermo_, rxn.comps, rxn.nu, T);
    scalar dH = 0.0, sumNu = 0.0;
    for (std::size_t s = 0; s < m; ++s)
    {
        sumNu += rxn.nu[s];
        dH += rxn.nu[s] * ((h && !h->empty()) ? (*h)[rxn.comps[s]]
                                              : thermo_->comp(rxn.comps[s]).h_pure_ig(T));
    }
    const scalar dlnKc = dH / (constant::R * T * T) - sumNu / T;
    const scalar Prev = productExcept(fr, m);
    if (eff)
        for (std::size_t j = 0; j < nc; ++j)
        {
            const scalar e = (j < eff->size()) ? (*eff)[j] : 1.0;
            if (e != 0.0) grad[j] -= dkdM * e / Kc * Prev;
        }
    for (std::size_t s = 0; s < m; ++s)
        if (dfr[s] != 0.0)
            grad[rxn.comps[s]] -= k / Kc * dfr[s] * productExcept(fr, s);
    dT += -dkdT / Kc * Prev + k / Kc * Prev * dlnKc;
    return true;
}

void BatchReactor::odeJacobianSparse(const sVector& y, const sVector& f0,
                                     const sVector& typ,
                                     solver::SparseJacobian& J) const
{
    const auto tic = std::chrono::steady_clock::now();
    struct Toc
    {
        std::atomic<long long>& acc; std::chrono::steady_clock::time_point t0;
        ~Toc() { acc += std::chrono::duration_cast<std::chrono::nanoseconds>(
                     std::chrono::steady_clock::now() - t0).count(); }
    } toc{nsJac_, tic};
    const std::size_t n = state_.n.size();
    const std::size_t N = n + 1;
    const solver::SparsePattern& P = *jacPattern_;
    J.values.assign(P.nnz(), 0.0);
    if (jacRankOne_)
    {
        J.u.assign(N, 0.0);
        J.v.assign(N, 1.0);
        J.v[n] = 0.0;                         // the rank-one part reaches species columns only
    }
    else { J.u.clear(); J.v.clear(); }
    const sVector nv(y.begin(), y.begin() + n);
    const bool adiab = (mode_ == Mode::Adiabatic);
    const bool constP = (energy_ == Energy::GasConstantP);
    const scalar T = adiab ? y[n] : T_setpoint_;
    scalar ntot = 0.0;
    for (std::size_t i = 0; i < n; ++i) ntot += nv[i];
    const scalar V = volumeAt_(nv, T);
    //  The per-species energies of the energy row (the weights w_j).
    sVector e, C;                             // u_i, h_i or nothing; Cv_i / Cp_i
    if (adiab)
    {
        e.assign(n, 0.0); C.assign(n, 0.0);
        const sVector *hAll = nullptr, *cpAll = nullptr;
        if (energy_ != Energy::LiquidDH) energiesAt_(T, hAll, cpAll);   // memo: the right-hand side's own
        for (std::size_t i = 0; i < n; ++i)
        {
            const auto& comp = thermo_->comp(i);
            if (energy_ == Energy::LiquidDH) C[i] = comp.cpLiquid().Cp(T);
            else
            {
                const scalar Cp = (*cpAll)[i];
                const scalar hi = (*hAll)[i];
                e[i] = constP ? hi : hi - constant::R * T;
                C[i] = constP ? Cp : Cp - constant::R;
            }
        }
    }
    //  A reaction differenced here steps on the AUDIT's row sizes, not on the
    //  integrator's typ: sqrt(eps) * atol (~1e-23 kmol for a product not yet
    //  formed) moves an LHHW denominator by less than the rounding of r, and
    //  the column came out exactly 0 against -0.058 (batch07_lhhw_methylAcetate,
    //  measured 2026-11-19).
    const sVector sc = odeJacobianScale(y);
    const scalar epsT = fdStep(y[n], n < typ.size() ? typ[n] : 1.0);
    const sVector gT = gibbsAt_(T);          // once per Jacobian, not once per reaction; COPIES: the
    const sVector hT = enthalpyAt_(T);       // memo's references die at the next call at another T
    const scalar Pgas = (ntot > 0.0 && V > 0.0) ? ntot * 1000.0 * constant::R * T / V : 0.0;
    const KinCtx& kctx = kinCtx_(T, y, V);   // c = n/V, [M], the rate-constant tables: once per Jacobian
    sVector grad(n, 0.0);                    // zero outside the current deps
    scalar sumWS = 0.0, sumWE = 0.0;         // sum_j w_j s_j, sum_j w_j E_j
    for (std::size_t j = 0; j < reactions_.size(); ++j)
    {
        const auto& rxn = reactions_[j];
        const auto& deps = jacDeps_[j];
        scalar Ej = 0.0, sj = 0.0;
        bool done = false;
        if (!fdLaw_[j])
        {
            scalar dT = 0.0, dP = 0.0;
            const bool ok = (rxn.form == RateForm::Factory)
                ? rateGradientLaw_(rxn, T, nv, V, grad, dT, dP, &gT, &hT, &kctx)
                : rateGradient_(rxn, T, nv, V, grad, dT, &gT, &hT, &kctx);
            if (ok)
            {
                done = true;
                if (constP)
                {
                    const scalar r = rateOfReaction_(rxn, T, nv, V, &gT);
                    scalar gc = 0.0;
                    for (std::size_t k : deps) gc += grad[k] * nv[k] / V;
                    sj = (ntot > 0.0) ? V / ntot * (r - gc) : 0.0;
                    Ej = V * (dT - gc / T) + r * V / T;
                }
                else
                {
                    const bool pLaw = (rxn.form == RateForm::Factory && energy_ == Energy::GasConstantV
                                       && rxn.law->readsPressure());
                    sj = pLaw ? dP * 1000.0 * constant::R * T : 0.0;
                    Ej = V * (dT + (pLaw ? dP * Pgas / T : 0.0));
                }
            }
        }
        if (!done)
        {
            //  every species column (deps is all of them for a law without a
            //  derivative; for a power below one at zero, the FD fills them all
            //  and only deps are stored -- the rest are zero by construction).
            sVector D(n, 0.0);
            rateGradientFD_(rxn, T, nv, sc, epsT, D, Ej);
            //  AT CONSTANT PRESSURE the difference is the TOTAL derivative of
            //  r V, which carries the rank-one volume term s_j in EVERY
            //  species column -- also the columns the pattern does not store
            //  for this reaction (a species its law does not read).  Dropped
            //  there, those columns came out zero where they are s_j
            //  (review of e537d5766, point 3).  A column outside deps is
            //  exactly s_j (g_jm = 0 there), so it is read off one such
            //  column, carried by the rank-one pair like every analytic
            //  reaction's, and taken out of the stored columns.
            sj = 0.0;
            if (jacRankOne_ && constP && deps.size() < n)
            {
                std::size_t m = 0;
                while (m < n && std::binary_search(deps.begin(), deps.end(), m)) ++m;
                if (m < n) sj = D[m];
            }
            for (std::size_t k : deps) grad[k] = D[k] - sj;
        }
        //  scatter: J_im += nu_ij D_jm on the pattern, u_i += nu_ij s_j, J_iT += nu_ij E_j
        const std::size_t nd = deps.size();
        const auto& pos = jacPos_[j];
        scalar wj = 0.0;
        for (std::size_t s = 0; s < rxn.comps.size(); ++s)
        {
            const scalar nu = rxn.nu[s];
            if (nu == 0.0) continue;
            const std::size_t i = rxn.comps[s];
            for (std::size_t q = 0; q < nd; ++q)
                J.values[pos[s * nd + q]] += nu * grad[deps[q]];
            if (jacRankOne_) J.u[i] += nu * sj;
            if (adiab)
            {
                J.values[jacPosTcol_[i]] += nu * Ej;
                if (energy_ != Energy::LiquidDH) wj += nu * e[i];
            }
        }
        if (adiab)
        {
            if (energy_ == Energy::LiquidDH) wj = rxn.dH;
            for (std::size_t q = 0; q < nd; ++q)
                J.values[jacPosTrow_[deps[q]]] += wj * grad[deps[q]];   // scaled below
            sumWS += wj * sj;
            sumWE += wj * Ej;
        }
        for (std::size_t k : deps) grad[k] = 0.0;
    }

    // ---- the energy row: -( sum_j w_j D_jm + Tdot C_m ) / Ctot -------------
    if (adiab)
    {
        scalar Ctot = 0.0, CnDot = 0.0, nDC = 0.0;
        for (std::size_t i = 0; i < n; ++i) Ctot += nv[i] * C[i];
        if (Ctot >= 1.0e-30)
        {
            const scalar Tdot = f0[n];
            for (std::size_t i = 0; i < n; ++i)
            {
                const auto& comp = thermo_->comp(i);
                nDC += nv[i] * cpSlope(energy_ == Energy::LiquidDH ? comp.cpLiquid()
                                                                    : comp.cpIdealGas(), T);
                if (energy_ != Energy::LiquidDH) CnDot += C[i] * f0[i];
            }
            for (std::size_t k = 0; k < n; ++k)
            {
                scalar& v = J.values[jacPosTrow_[k]];
                v = -(v + Tdot * C[k] + sumWS) / Ctot;   // sumWS: the rank-one part, folded
            }
            J.values[jacPosTrow_[n]] = -(CnDot + sumWE + Tdot * nDC) / Ctot;
        }
        else
            for (std::size_t k = 0; k < N; ++k) J.values[jacPosTrow_[k]] = 0.0;
    }
}

//  The analytic Jacobian handed to a Rosenbrock integrator: the dense form
//  always (the dense path), the sparse form and the pattern when the vessel
//  factors W sparse (sparseLinear_).  The pattern is re-read every call: a
//  cooling failure rebuilds it with the T row and column.
void BatchReactor::wireAnalytic_(solver::ODEAnalyticJacobian& A,
                                 const std::string& owner) const
{
    A.jacobian = [this](scalar, const sVector& y, const sVector& f0, const sVector& typ)
    { return odeJacobian(y, f0, typ); };
    A.autonomous = true;                   // derivatives_ ignores t
    A.owner = owner;
    A.rowLabel = [this](std::size_t i) { return odeRowLabel(i); };
    A.auditScale = [this](const sVector& y) { return odeJacobianScale(y); };
    A.sparse = sparseLinear_;
    A.pattern = jacPattern_;
    A.sparseJacobian = [this](scalar, const sVector& y, const sVector& f0,
                              const sVector& typ, solver::SparseJacobian& J)
    { odeJacobianSparse(y, f0, typ, J); };
}

std::vector<sVector> BatchReactor::odeJacobian(const sVector& y,
                                               const sVector& f0,
                                               const sVector& typ) const
{
    solver::SparseJacobian J;
    odeJacobianSparse(y, f0, typ, J);
    return J.dense(*jacPattern_);
}


//  The audit's row sizes: a species row is judged on max(|n_k|, 1e-2 of the
//  vessel's inventory) -- the difference step is then sqrt(eps) of that,
//  ~1.5e-10 of the inventory: far above the rounding of f (a sum of large
//  terms that cancel), far below any concentration whose curvature could
//  bias a forward difference -- and T on itself.  MEASURED on
//  ignition01_h2o2_jac (2026-11-19): the worst column difference over the
//  audits scales as 1/floor, i.e. it IS the difference's rounding --
//  floor 1e-4: up to 3.0e-5; 1e-3: up to 2.2e-6; 1e-2: up to 3.3e-7 --
//  and with the integrator's own step (sqrt(eps) * atol) the T row of the
//  H2O2 column came out 1.55 of its scale WRONG in the difference, not in
//  the analytic J.
sVector BatchReactor::odeJacobianScale(const sVector& y) const
{
    const std::size_t n = state_.n.size();
    scalar tot = 0.0;
    for (std::size_t i = 0; i < n; ++i) tot += std::abs(y[i]);
    sVector s(y.size());
    for (std::size_t i = 0; i < n; ++i) s[i] = std::max(std::abs(y[i]), 1.0e-2 * tot);
    s[n] = std::max(std::abs(y[n]), 1.0);
    return s;
}

void BatchReactor::announceJacobianAudits_(scalar tRun)
{
    const auto& A = jacAudit_;
    for (; jacAnnounced_ < A.audits.size(); ++jacAnnounced_)
    {
        const auto& a = A.audits[jacAnnounced_];
        const bool first = (jacAnnounced_ == 0);
        if (verbosity_ < (first ? 1 : 3)) continue;
        std::ostringstream os;
        os << "  [jacobian] batchReactor '" << name_ << "': analytic Jacobian #"
           << a.jacobian << " AUDITED at t = " << std::scientific
           << std::setprecision(4) << tRun + a.t << " s (T = "
           << std::defaultfloat << std::setprecision(6)
           << (a.y.empty() ? 0.0 : a.y.back()) << " K): worst column d("
           << odeRowLabel(a.row) << ")/d(" << odeRowLabel(a.col) << ") "
           << std::scientific << std::setprecision(3) << a.worst
           << " of the column's scale from the finite difference (tolerance "
           << A.tolerance << ")\n";
        if (first)
            os << "             the Jacobian is ANALYTIC ("
               << (jacobianDeclared_ ? "`jacobian analytic;`"
                                     : "the default; `jacobian finiteDifference;` selects the difference")
               << "): species columns from the rate laws, the energy row by the"
                  " chain rule, the T column in closed form; audited against"
                  " the dense finite difference at analytic Jacobians 1, 2, 4,"
                  " 8, ...; a column above the tolerance refuses the run\n";
        if (first && A.sparse && A.lu)
            os << "             W = I - h d J is factored SPARSE (`linearSolver "
               << (linearSolverKey_ == LinearSolver::Sparse ? "sparse" : "auto")
               << "`): " << A.pattern->n << " rows, " << A.lu->nnzPattern()
               << " entries on the network's pattern, " << A.lu->nnzFactor()
               << " in L+U after minimum-degree ordering (" << A.lu->denseNodes()
               << " dense node(s) ordered last), " << A.lu->flopsFactor()
               << " multiply-adds per factorisation against n^3/3 = "
               << static_cast<double>(A.pattern->n) * A.pattern->n * A.pattern->n / 3.0
               << " dense\n";
        std::cout << os.str();
    }
}

std::string BatchReactor::odeRowLabel(std::size_t i) const
{
    const std::size_t n = state_.n.size();
    return i < n ? "n_" + thermo_->comp(i).name() : std::string("T");
}

//  C458 (e) and (f), printed at the vessel's initial temperature, never
//  changing a number: the K_c of a library set's own thermochemistry against
//  this run's, and k_f/k_r of every EXPLICIT reverse (a leg with
//  `A_rev`/`Ea_rev`, or two irreversible entries that are each other's
//  reverse) against K_c(T).  Silent for a case with neither.
void BatchReactor::announceLibraryChecks_(const DictPtr& rxnLib) const
{
    const ThermoPackage& thermo = *thermo_;
    std::vector<DictPtr> entries;
    std::vector<kineticsLibrary::LegProbe> legs;
    for (std::size_t j = 0; j < reactions_.size(); ++j)
    {
        const DictPtr e = rxnLib->subDict(reactions_[j].name);
        entries.push_back(e);
        const auto& r = reactions_[j];
        kineticsLibrary::LegProbe lp;
        lp.name = r.name; lp.comps = r.comps;
        lp.nu.assign(r.nu.begin(), r.nu.end());
        lp.reversible = r.reversible;
        const scalar T0 = state_.T;
        if (r.form == RateForm::Arrhenius || r.form == RateForm::ModArrhenius)
        {
            lp.plainForm = true;
            lp.kf = Reaction::arrheniusRate(r.A_pre, r.Ea, T0)
                  * (r.form == RateForm::ModArrhenius ? std::pow(T0, r.b) : 1.0);
            //  k_f/k_r = K_c holds for mass action: a declared order that is not the coefficient is not compared
            for (std::size_t k = 0; k < r.comps.size(); ++k)
                if (r.order[k] != (r.nu[k] < 0.0 ? -r.nu[k] : 0.0)) lp.massAction = false;
        }
        else if (r.form == RateForm::Factory && e->subDict("kinetics")->found("A_rev")
                 //  only the concentration-basis Arrhenius leg: an activity-basis or adsorption (LHHW)
                 //  law has constants K_c cannot be held to
                 && e->subDict("kinetics")->lookupWordOrDefault("type", "") == "Arrhenius"
                 && e->subDict("kinetics")->lookupWordOrDefault("basis", "concentration") == "concentration"
                 && !e->subDict("kinetics")->found("adsorption"))
        {
            auto kin = e->subDict("kinetics");
            lp.kf = Reaction::arrheniusRate(kin->lookupScalar("A"), kin->lookupScalar("Ea"), T0);
            lp.hasKr = true;
            lp.kr = Reaction::arrheniusRate(kin->lookupScalar("A_rev"), kin->lookupScalar("Ea_rev"), T0);
            for (const auto& st : e->lookupDictList("stoichiometry"))
            {
                const scalar nu = st->lookupScalar("nu");
                const scalar of = st->lookupScalarOrDefault("order", nu < 0 ? -nu : 0.0);
                const scalar orv = st->lookupScalarOrDefault("orderRev", nu > 0 ? nu : 0.0);
                if (of != (nu < 0 ? -nu : 0.0) || orv != (nu > 0 ? nu : 0.0)) lp.massAction = false;
            }
        }
        legs.push_back(std::move(lp));
    }
    kineticsLibrary::announceThermoDifference(thermo, entries, state_.T, std::cerr);
    kineticsLibrary::announceReverseConsistency(thermo, legs, state_.T, std::cerr);
}

} // namespace Choupo
