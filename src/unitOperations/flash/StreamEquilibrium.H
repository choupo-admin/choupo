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
File
    src/unitOperations/flash/StreamEquilibrium.H

Description
    ONE HOME for "what state is this stream actually in, and what does that
    state cost on the elements datum".

    R-E5 of `docs/design/tp-stream-energy-coherence.md` says the unit duty
    and the balance report must price a given stream identically -- resolved
    state for an unpinned stream, declared state for a pinned one, solid rung
    for any crystal.  It was implemented twice (the flash's duty block and
    `reporting/BalanceMath.H`), and the day after the two agreed, a THIRD
    surface was found disagreeing with both: the `heater` inverted its Q on a
    sensible Cp relation and wrote an outlet that, resolved at its own
    (T, P, z), was two-phase and cost 8x the declared duty (process02,
    827 % closure, 2026-08-09).  A rule enforced by repetition is a rule with
    an arity of three.

    So the two primitives live here, in `unitOperations` -- the lowest band
    that may call a flash:

      * `equilibriumAt(...)`  -- the constitution's unpinned reading.  An
        unpinned (T, P, z) MEANS its own equilibrium; a pinned stream keeps
        its declared reading and is not re-solved.  A package that refuses to
        resolve the state returns nothing and says so (never a crash, never a
        silent fall-back to the carried representation).

      * `hOfState(...)` -- the per-mole enthalpy of a resolved state on the
        elements datum: the phase blend at the equilibrium compositions, plus
        each crystallised mole moved from the apparent-liquid rung onto
        `h_formation(T, "solid")` (R-E3).

    `reporting/BalanceMath.H` and `unitOperations/heatTransfer/Heater.cpp`
    both read them; `applications/` never sees this header.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Advisory.H"
#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"
#include "unitOperations/flash/PureSaturationPlateau.H"

#include <cmath>
#include <cstdio>
#include <exception>
#include <iostream>
#include <limits>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {
namespace flashState {

//  The equilibrium of (T, P, z) in `thermo`'s world, or nothing.
//
//  Returns nothing when:
//    * the stream is PINNED to a single phase (R-E2 -- a declaration is not
//      re-solved; a saturation-quality pin, 0 < vf < 1, IS resolvable);
//    * the package has no vapour phase (an LL-only world has nothing to
//      split against here);
//    * the flash did not converge;
//    * the package REFUSED the state -- announced, or captured in `deferTo`
//      when the caller evaluates the same state many times (a Newton on T)
//      and must announce once rather than once per iteration.
//
//  A CONVERGED SINGLE-PHASE answer is returned, not discarded: the caller
//  that must decide a stream's vapour fraction needs to know the resolution
//  said "all liquid" rather than "could not tell".
//  IS THERE A SATURATION STATE TO SPEAK OF AT ALL?
//
//  Above the highest pure critical temperature among the components PRESENT
//  there is no liquid and no dew point, so any statement of the form "this
//  stream is below its dew point" is not false -- it is not a statement.  Two
//  readers need this and they must not each invent it: the resolver below
//  (which discards an impossible two-phase root) and the energy report's
//  incipient-phase test (which would otherwise ACCUSE a correctly labelled
//  supercritical vapour, 2026-09-08 -- Vitor caught exactly that on
//  ammonia02's converter outlet at 839.6 K, where the highest Tc present is
//  ammonia's 405.5 K).
//
//  A component with no declared Tc does not vote: absence is not evidence.
//  If nothing present declares one, the answer is false and the caller
//  proceeds -- this rule never fires on ignorance.
inline bool aboveEveryCriticalT(scalar T, const sVector& z,
                                const ThermoPackage& thermo,
                                scalar* TcMaxOut = nullptr)
{
    scalar TcMax = 0.0;
    for (std::size_t i = 0; i < z.size() && i < thermo.n(); ++i)
        if (z[i] > 1.0e-12 && thermo.comp(i).Tc() > TcMax)
            TcMax = thermo.comp(i).Tc();
    if (TcMaxOut) *TcMaxOut = TcMax;
    return (TcMax > 0.0 && T > TcMax);
}

//  A TWO-PHASE ROOT ABOVE EVERY Tc IS NOT A SPLIT -- discard it, and SAY so.
//
//  The ONE home of the discard (2026-09-26).  `equilibriumAt` below had it
//  inline since 2026-09-08, which served every reader that resolves a stream
//  THROUGH this header -- the balance report, the heater, the exchanger, the
//  column, the evaporator, the conversion reactor, the model-boundary ledger.
//  `IsothermalFlash`'s duty does not: it re-resolves its feed through
//  `solveCore` directly (R-E1, with the unit's own phase set), so the report
//  discarded the root and the unit blended it -- two readers of one state
//  disagreeing about what counts as a phase.  Measured on
//  `ammoniaStaged04_kinetic`: the separator, fed at 844.86 K and 200 bar,
//  closed at 90.32 % and the whole plant residual, -22 274.7 kW (5.918 %),
//  was that one unit.
//
//  Returns the sentence when the root was discarded (the caller may print it
//  at its own site), nothing when `fs` is single-phase or the state is not
//  above every present component's Tc.  The advisory rides `AdvisoryLog`
//  under `category` / `locus`, or is handed to `deferTo` for a caller that
//  evaluates the same state many times.  Judges nothing about the case: it
//  says what was found and what was done.
//
//  `nameT`: whether the sentence quotes the temperature.  `AdvisoryLog`
//  dedups on the exact message, so a reader that resolves ONE accepted state
//  (the balance report) names T and gets one line; a reader re-solved on
//  every recycle pass and Jacobian perturbation (a unit's duty) must NOT, or
//  each trial T is a new entry -- measured: 18 lines for one fact in
//  ammoniaStaged04's caveat block on the first build.  Such a caller prints T
//  at its own site instead and puts the stream's identity in `locus`.
inline std::optional<std::string>
supercriticalSplitDiscarded(const FlashSolution& fs,
                            scalar               T,
                            const sVector&       z,
                            const ThermoPackage& thermo,
                            const std::string&   locus,
                            const char*          category,
                            std::string*         deferTo = nullptr,
                            bool                 nameT   = true)
{
    if (!(fs.V_over_F > 1.0e-9 && fs.V_over_F < 1.0 - 1.0e-9))
        return std::nullopt;
    scalar TcMax = 0.0;
    if (!aboveEveryCriticalT(T, z, thermo, &TcMax))
        return std::nullopt;
    const std::string msg =
        std::string("resolved TWO-PHASE ")
        + (nameT ? "at T = " + std::to_string(T) + " K, which is"
                 : std::string("at a temperature"))
        + " above the highest critical temperature of any"
          " component present (" + std::to_string(TcMax) + " K): no"
          " liquid can exist there, so the split is DISCARDED and this"
          " stream is priced on the state it carries.  A root like"
          " this comes from a correlation evaluated far outside its"
          " declared window -- read the [henry] and [psat]"
          " extrapolation lines for this run";
    if (deferTo) *deferTo = msg;
    else AdvisoryLog::instance().add(category, "warning", locus, msg);
    return msg;
}

//  ---- THE SAME DISCARD, FOR A UNIT THAT SEARCHES ITS OWN OUTLET -----------
//
//  `equilibriumAt` answers for a stream that EXISTS: a discarded root leaves
//  the stream priced on the state it carries.  A unit searching for its
//  OUTLET has no carried state -- the flash IS the answer it will publish --
//  so the discarded root needs a replacement, and above every present
//  component's Tc there is one: the single fluid phase, on the vapour leg.
//  `phaseChanger` wrote exactly that on 2026-10-01 in its anonymous
//  namespace; the valve's and the adiabatic flash's outlet searches, the
//  pipe's inlet-regime test and the isothermal flash's own operating
//  resolution called `solveCore` bare and accepted the root (DEV.md §5,
//  2026-09-26, named not fixed; C34 wave 1).  Five callers of one rule, so it
//  lives here, beside the test it applies.
//
//  A THREE-phase answer is left alone (its `V_over_F` is a liquid fraction,
//  not a vapour one).  The sentence is DEFERRED into `discarded` (kept from
//  the first trial only): an outlet search evaluates many trial
//  temperatures, and the caller says it once, at its own site, through
//  `reportSupercriticalDiscard`.  Returns whether the root was discarded.
inline bool takeSupercriticalAsSinglePhase(FlashSolution&       fs,
                                           scalar               T,
                                           const sVector&       z,
                                           const ThermoPackage& thermo,
                                           std::string&         discarded)
{
    if (fs.threePhase) return false;
    std::string said;
    if (!supercriticalSplitDiscarded(fs, T, z, thermo, "", "", &said,
                                     /*nameT=*/false))
        return false;
    fs.V_over_F = 1.0;
    fs.x        = z;
    fs.y        = z;
    fs.regime   = "single phase above every Tc (two-phase root discarded)";
    //  Nothing of the impossible liquid may survive the discard.
    fs.speciation.reset();
    fs.organicLiquid.reset();
    if (discarded.empty()) discarded = said;
    return true;
}

//  `IsothermalFlash::solveCore` at `in`, with the discard above applied.
inline FlashSolution flashDiscardingSupercriticalSplit(const FlashInput&    in,
                                                       const ThermoPackage& thermo,
                                                       const FlashOptions&  opts,
                                                       std::string&         discarded)
{
    FlashSolution fs = IsothermalFlash::solveCore(in, thermo, opts);
    takeSupercriticalAsSinglePhase(fs, in.T, in.z, thermo, discarded);
    return fs;
}

//  Say a deferred discard ONCE: on `AdvisoryLog` (the end-of-run caveat
//  block) and, at verbosity >= 1, at the unit's own site as `[<category>]`.
inline void reportSupercriticalDiscard(const std::string& discarded,
                                       const char*        category,
                                       const std::string& locus,
                                       int                verbosity)
{
    if (discarded.empty()) return;
    AdvisoryLog::instance().add(category, "warning", locus, discarded);
    if (verbosity >= 1)
        std::cout << "  [" << category << "] " << discarded << "\n";
}

inline std::optional<FlashSolution> equilibriumAt(scalar               T,
                                                  scalar               P,
                                                  const sVector&       z,
                                                  bool                 pinned,
                                                  scalar               vfCarried,
                                                  const ThermoPackage& thermo,
                                                  const std::string&   locus,
                                                  const char*          category,
                                                  std::string*         deferTo = nullptr,
                                                  const FlashOptions*  recipe  = nullptr)
{
    const bool resolvable = pinned
        ? (vfCarried > 1.0e-9 && vfCarried < 1.0 - 1.0e-9)
        : true;
    if (!resolvable)                          return std::nullopt;
    if (thermo.phasesOfType("vapor").empty()) return std::nullopt;

    FlashInput fin; fin.F = 1.0; fin.T = T; fin.P = P; fin.z = z;
    //  `recipe`: the search the stream's CONSUMER resolves it with, when that
    //  search is richer than vapour-liquid -- a `phaseSet VLLE` flash
    //  (`IsothermalFlash::inletEquilibriumOptions`, C35 item 4).  Absent, the
    //  vapour-liquid default every reader applied before.
    FlashOptions fopts;
    if (recipe) fopts = *recipe;
    fopts.verbosity    = 0;
    fopts.residualSink = nullptr;
    FlashSolution fs;
    try
    {
        fs = IsothermalFlash::solveCore(fin, thermo, fopts);
    }
    catch (const std::exception& ex)
    {
        //  A STREAM WHOSE OWN EQUILIBRIUM THE PACKAGE WILL NOT RESOLVE still
        //  has a defined enthalpy under the state it carries -- and refusing
        //  outright would report NOTHING about a unit whose energy is
        //  perfectly computable (flash19's vapour outlet carries no Ca, so
        //  the reactive package refuses to speciate it at all).  The caller
        //  prices what the stream carries, and SAYS SO: an announced
        //  fall-back is a reading the student can check, a silent one is the
        //  crutch.
        const std::string msg =
            "priced on the state it CARRIES (vf = " + std::to_string(vfCarried)
            + "): its own equilibrium at (T, P, z) could not be resolved -- "
            + ex.what();
        if (deferTo) *deferTo = msg;
        else AdvisoryLog::instance().add(category, "info", locus, msg);
        return std::nullopt;
    }
    if (!fs.converged) return std::nullopt;

    //  ---- A LIQUID CANNOT EXIST ABOVE EVERY COMPONENT'S Tc ---------------
    //
    //  MEASURED, 2026-09-08: ammonia02's converter outlet -- 842.9 K, 200 bar,
    //  N2/H2/NH3/Ar -- resolves to V/F = 0.2589.  74 % LIQUID in a mixture
    //  whose highest pure critical temperature is ammonia's 405.5 K.  The
    //  K-values say why: K_H2 = 0.5396 and K_N2 = 0.7713, both below 1,
    //  because their Henry pairs are being read ~500 K past the windows their
    //  own records declare and van't Hoff carried that far collapses H(T) to
    //  5 % of the fitted value.  A correlation asked far outside its data can
    //  return a root that violates no equation and is physically impossible.
    //
    //  Nothing downstream could tell: the report priced the converter outlet
    //  on that split and misattributed 22 376 kW between the reactor and the
    //  feed-effluent exchanger, at exit 0.
    //
    //  The test is the strongest one available without a mixture critical
    //  locus: above the HIGHEST pure Tc among the components actually present
    //  there is no liquid.  A mixture's critical temperature can exceed a
    //  single component's, but it is bounded well below this -- the case that
    //  forced this rule sits 437 K past the maximum, not a few degrees.  A
    //  component with no declared Tc does not vote (absence is not evidence),
    //  and if NO present component declares one the test does not run.
    //
    //  What happens then: the SPLIT is discarded and the caller prices the
    //  state the stream carries, announced -- never a silent substitution.
    //
    //  THE DISCARD ITSELF LIVES ONE FUNCTION UP (`supercriticalSplitDiscarded`,
    //  2026-09-26): `IsothermalFlash`'s duty re-resolves its feed through
    //  `solveCore` directly and needed the SAME sentence, and the day it had
    //  its own copy of the test it had none -- ammoniaStaged04's separator
    //  accepted the root this block discards and the plant lost 22 274.7 kW.
    //  A three-phase or two-liquid answer (only a VLLE `recipe` returns
    //  one) carries a LIQUID fraction in `V_over_F`, which the discard would
    //  misread as a vapour fraction.  It is left alone, as
    //  `takeSupercriticalAsSinglePhase` leaves a three-phase answer alone.
    if (!fs.threePhase && !fs.liquidLiquid
        && supercriticalSplitDiscarded(fs, T, z, thermo, locus, category, deferTo))
        return std::nullopt;
    return fs;
}

//  ---- A PURE STREAM ON ITS OWN SATURATION CURVE IS NOT YET A STATE --------
//
//  DEV.md C36 item 1 (Vitor, 2026-10-05).  By Duhem's theorem a stream of
//  known component flows has two intensive degrees of freedom, and for a
//  MIXTURE (T, P) are those two (CLAUDE.md §3, "A STREAM IS FIXED BY TWO
//  VARIABLES").  For a PURE component they are not, exactly where it
//  matters: on its saturation curve T and P are ONE condition, and the
//  second variable -- which phase, how much of each -- is missing.
//
//  What the engine did with the missing word, measured on the C35 #4
//  regression: once the flash learned to skip absent components, a pure
//  undeclared stream at Tsat(P) was classified by the LAST DIGITS of T --
//  check_evaporator_chest_phase's fixture at Tsat(200 kPa) = 392.1781136 K
//  read as vapour, the same stream 0.008 K colder as liquid.  Nothing in the
//  case said which; the rounding did.
//
//  THE BAND, from the numerics and nothing else.  For a single component the
//  Rachford-Rice residual is RR(V) = (K - 1) / (1 + V (K - 1)), whose
//  magnitude over 0 <= V <= 1 is at most |K - 1| / min(1, K) ~ |ln K| near
//  K = 1.  So when |ln K| <= the flash's OWN convergence tolerance
//  (`FlashOptions::tolerance`, the flash `equilibriumAt` runs), EVERY vapour
//  fraction satisfies the criterion that flash accepts as converged: the
//  answer it returns is undetermined in its own terms.  That is the band --
//  no wider (a wider band is a modelling judgement, not a numerical fact,
//  and would refuse streams the flash decides cleanly), and stated in the
//  refusal in both forms, |ln K| and the equivalent |T - Tsat|.
//
//  Returns nothing -- the question has no meaning -- when the stream is not
//  pure (one present component), the package has no vapour phase, the
//  component is above its Tc, is a Henry solute (K = H/P has no saturation
//  curve without a solvent) or nonvolatile (K = 0), or its K does not move
//  with T (a single-root cubic gives K = phi_L/phi_V = 1 identically; that
//  is not a saturation curve, and the flash seeds past it with Wilson).
//  Never a crash: a package that refuses the K returns nothing here and the
//  stream goes on to be resolved and announced as before.
struct SaturationProximity
{
    std::size_t component = 0;   //  index of the one present component
    scalar      lnK       = 0.0; //  ln K at the stream's own (T, P)
    scalar      dlnKdT    = 0.0; //  slope of ln K along T at fixed P [1/K]
    scalar      Tsat      = 0.0; //  where ln K = 0 at this P (Newton from T)
    scalar      band      = 0.0; //  the |ln K| band: the flash's tolerance
};

inline scalar saturationBand() { return FlashOptions{}.tolerance; }

inline std::optional<SaturationProximity>
pureSaturationProximity(scalar               T,
                        scalar               P,
                        const sVector&       z,
                        const ThermoPackage& thermo)
{
    std::size_t idx = 0;
    int nPresent = 0;
    for (std::size_t i = 0; i < z.size() && i < thermo.n(); ++i)
        if (z[i] > 0.0) { ++nPresent; idx = i; }
    if (nPresent != 1)                        return std::nullopt;
    if (thermo.phasesOfType("vapor").empty()) return std::nullopt;
    if (thermo.isHenrySolute(idx))            return std::nullopt;
    if (aboveEveryCriticalT(T, z, thermo))    return std::nullopt;

    const scalar NaN = std::numeric_limits<scalar>::quiet_NaN();
    auto lnKat = [&](scalar Tq) -> scalar
    {
        const sVector K = thermo.Kvec(Tq, P, z, z);
        if (idx >= K.size() || !(K[idx] > 0.0) || !std::isfinite(K[idx]))
            return NaN;
        return std::log(K[idx]);
    };
    SaturationProximity sp;
    sp.component = idx;
    sp.band      = saturationBand();
    try
    {
        //  A central difference over +-1 mK: ln K is smooth there on every
        //  surface the corpus uses, and the slope only scales the T form of
        //  the band and the Tsat printed -- never the decision, which is
        //  taken on |ln K| itself.
        const scalar h = 1.0e-3;
        sp.lnK    = lnKat(T);
        //  FAR from the curve the decision is already taken: return before
        //  any evaluation away from the stream's own T.  The slope and the
        //  Newton toward Tsat below only serve the refusal's message, and a
        //  Newton started 20 K below Tsat asks the package for K at Tsat --
        //  for water at 2 bar an extrapolated Antoine that then sat in the
        //  caveat block of a run whose answer never used it (heatExchanger01,
        //  found by the C36 full regression).
        if (std::isfinite(sp.lnK) && std::fabs(sp.lnK) > sp.band)
        {
            sp.Tsat = NaN;
            return sp;
        }
        sp.dlnKdT = (lnKat(T + h) - lnKat(T - h)) / (2.0 * h);
        if (!std::isfinite(sp.lnK) || !std::isfinite(sp.dlnKdT)
            || std::fabs(sp.dlnKdT) < 1.0e-12)
            return std::nullopt;
        sp.Tsat = T;
        for (int it = 0; it < 3; ++it)
        {
            const scalar l = lnKat(sp.Tsat);
            if (!std::isfinite(l)) break;
            sp.Tsat -= l / sp.dlnKdT;
        }
    }
    catch (const std::exception&)
    {
        return std::nullopt;
    }
    return sp;
}

//  The refusal itself, or nothing.  `name` and `file` are for the message;
//  the caller decides WHICH streams are declarations (only an authored,
//  unpinned inlet is: a unit's outlet or a tear seed is the engine's own
//  answer, and "declare the phase" is not a remedy anyone can apply to it).
inline std::optional<std::string>
undeterminedSaturationRefusal(const std::string&   name,
                              const std::string&   file,
                              scalar               T,
                              scalar               P,
                              const sVector&       z,
                              const ThermoPackage& thermo)
{
    const auto sp = pureSaturationProximity(T, P, z, thermo);
    if (!sp || std::fabs(sp->lnK) > sp->band) return std::nullopt;
    char buf[640];
    std::snprintf(buf, sizeof buf,
        "stream '%s' (%s) is PURE %s declared by T and P alone, and that "
        "(T, P) lies ON its saturation curve: T = %.10g K against the "
        "package's own Tsat(P = %.10g Pa) = %.10g K, |ln K| = %.3e <= %.0e "
        "(the flash's own convergence tolerance; |T - Tsat| <= %.3e K here).",
        name.c_str(), file.c_str(), thermo.comp(sp->component).name().c_str(),
        T, P, sp->Tsat, std::fabs(sp->lnK), sp->band,
        sp->band / std::fabs(sp->dlnKdT));
    return std::string(buf)
        + "  On the saturation curve of a pure component (T, P) are ONE "
          "condition, not two: the Rachford-Rice residual meets the flash's "
          "tolerance at EVERY vapour fraction, so which phase this stream "
          "is in would be decided by the last digits of T, not by the case.  "
          "Say which state it is: `phase liquid;` (saturated liquid) or "
          "`phase gas;` (saturated vapour) -- or, for a wet stream, "
          "`vaporFraction q;` (the pure-component exception of the "
          "two-variable rule).  Record: "
          "docs/design/a-stream-is-fixed-by-two-variables.md";
}

//  The refusal of a whole run, from every offender collected first.  ONE
//  sentence for every binary that applies the rule (DEV.md C37 item 5): the
//  steady flowsheet (`Flowsheet::solve`, the global world and each unit's
//  own) and the time-integrated driver (`dynamicDriver`).  `who` prefixes
//  it ("" for choupoSolve, which has always refused unprefixed).
inline std::string undeterminedStreamsMessage(
    const std::vector<std::string>& undetermined,
    const std::string&              who = "")
{
    std::string msg = (who.empty() ? std::string() : who + ": ")
        + "UNDETERMINED STREAM STATE -- "
        + std::to_string(undetermined.size())
        + " authored stream(s) sit on a pure component's saturation "
          "curve with no phase declared:";
    for (const auto& u : undetermined) msg += "\n  * " + u;
    return msg;
}

//  ---- THE SEARCH A STREAM'S CONSUMER RESOLVES IT WITH (2026-10-05) --------
//
//  C35 item 4.  A stream fed to a `phaseSet VLLE` flash carries that unit's
//  dict (`ProcessStream::equilibriumConsumer`, stamped by the flowsheet);
//  this turns it into the search, through the ONE call the unit makes on its
//  own feed.  Nothing for every other stream: the vapour-liquid default.
//
//  WHICH STREAMS MEAN THEIR CONSUMER'S SEARCH (2026-10-05, DEV.md C37 item 4).
//  An AUTHORED inlet declares (T, P, z) and means its own equilibrium (R-E2),
//  which for a feed to a unit that admits a vapour and two liquids is the
//  three-phase one.  A PRODUCED stream is different: it keeps its PRODUCER's
//  answer (CLAUDE.md §3), and a heater or a mixer resolved and priced its
//  outlet vapour-liquid.  Re-reading that outlet with the consumer's
//  three-phase search priced ONE stream two ways -- the producer's row and
//  the report parted by the whole difference (193.92 kW on the witness
//  `vlle05_produced_feed`, the heater's outlet two-phase vapour-liquid at
//  352.3 K and three-phase under the decanter's search).  The exception is a
//  stream a three-phase search itself published
//  (`ProcessStream::fromThreePhaseSearch`): its producer's search IS that
//  rich, so reading it with the consumer's does not overrule the producer.
//  ONE rule, three readers: the flowsheet's stamp (`equilibriumConsumer`),
//  hence the energy report and the stream table, and the VLLE unit's own
//  pricing of its feed (through the feed dict, overload below).
inline bool consumerSearchApplies(bool authoredInlet, bool fromThreePhaseSearch)
{
    return authoredInlet || fromThreePhaseSearch;
}
inline bool consumerSearchApplies(const ProcessStream& s)
{
    return consumerSearchApplies(s.authoredInlet, s.fromThreePhaseSearch);
}
//  A unit's feed dict (`UnitInputs`): `authoredInlet` is always written in a
//  flowsheet; ABSENT means the unit was handed its feed outside one (a unit
//  test, a bench), where the feed is the caller's own declaration.
inline bool consumerSearchApplies(const DictPtr& feedDict)
{
    if (!feedDict) return true;
    return consumerSearchApplies(
        feedDict->lookupScalarOrDefault("authoredInlet", 1.0) > 0.5,
        feedDict->lookupScalarOrDefault("fromThreePhaseSearch", 0.0) > 0.5);
}

inline std::optional<FlashOptions> consumerRecipe(const ProcessStream& s,
                                                  const ThermoPackage& thermo)
{
    if (!s.equilibriumConsumer) return std::nullopt;
    return IsothermalFlash::inletEquilibriumOptions(s.equilibriumConsumer,
                                                    thermo, s.T, s.P, s.z);
}

//  ---- WHAT A RESOLVED STATE IS, WHATEVER ITS KIND (2026-10-05) ------------
//
//  A vapour-liquid answer carries its vapour fraction in `V_over_F`; a
//  three-phase answer (a `phaseSet VLLE` search, C35 item 4) carries the
//  ALPHA LIQUID fraction there and the vapour in `betaVapor`; a VLLE search
//  that found no vapour carries the beta LIQUID fraction there.  A reader
//  that must know whether a state is a split, or how much of it is vapour,
//  asks these two -- never `V_over_F` alone.
inline bool isSplit(const FlashSolution& fs)
{
    if (fs.threePhase || fs.liquidLiquid) return true;
    return fs.V_over_F > 1.0e-9 && fs.V_over_F < 1.0 - 1.0e-9;
}
inline scalar vapourFractionOf(const FlashSolution& fs)
{
    const scalar v = fs.threePhase   ? fs.betaVapor
                   : fs.liquidLiquid ? 0.0
                                     : fs.V_over_F;
    return (v <= 1.0e-9) ? 0.0 : (v >= 1.0 - 1.0e-9) ? 1.0 : v;
}

//  Per-mole enthalpy [J/mol] of a RESOLVED state on the elements datum.
//
//  The phase blend uses the equilibrium phase COMPOSITIONS (x, y), not the
//  overall z: the two differ by exactly the latent heat of separation, which
//  is what a blend-by-z would report as a phantom duty next to a Q = 0 flash.
//
//  R-E3: a resolved state may carry crystals the caller's own stream record
//  does not.  `fs.x` is the APPARENT liquid -- any precipitate resolved here
//  is still inside it, priced as dissolved -- so each such mole moves onto
//  the solid formation rung, the SAME leg `solidH_elements` reads.  Amounts
//  are on the flash's F = 1 basis, so the result is per mole of stream.
inline scalar hOfState(const FlashSolution& fs,
                       scalar               T,
                       scalar               P,
                       const sVector&       z,
                       const ThermoPackage& thermo)
{
    const scalar bV = fs.V_over_F;
    scalar h;
    if (fs.threePhase || fs.liquidLiquid)
    {
        //  A VLLE resolution (C35 item 4): each phase at its own composition,
        //  the vapour as a vapour and BOTH liquids as liquids, through the
        //  ONE unpacking the unit's ports read (`vllePorts`).
        const auto ports = vllePorts(fs, thermo.n());
        h = 0.0;
        for (const VllePhase* ph : { &ports.vapour, &ports.alpha, &ports.beta })
            if (ph->beta > 0.0)
                h += ph->beta * thermo.H_stream_formation(T, P, ph->vf, ph->z);
    }
    else if (bV <= 1.0e-9)       h = thermo.H_stream_formation(T, P, 0.0, z);
    else if (bV >= 1.0 - 1.0e-9) h = thermo.H_stream_formation(T, P, 1.0, z);
    else
        h = (1.0 - bV) * thermo.H_stream_formation(T, P, 0.0, fs.x)
          +        bV  * thermo.H_stream_formation(T, P, 1.0, fs.y);

    sVector e(thermo.n(), 0.0);
    for (std::size_t i = 0; i < fs.solidFlows.size() && i < thermo.n(); ++i)
    {
        const scalar s_i = fs.solidFlows[i];
        if (s_i <= 0.0) continue;
        e.assign(thermo.n(), 0.0);
        e[i] = 1.0;
        h += s_i * (thermo.comp(i).h_formation(T, "solid")
                    - thermo.H_liquid_formation(T, e));
    }
    return h;
}

//  IS THIS STREAM'S EFFECTIVE STATE A TWO-PHASE SPLIT?  (2026-09-12)
//
//  `equilibriumAt` answers "what is the equilibrium", which is a different
//  question from "does this stream have a split to price".  A CONVERGED
//  single-phase answer is deliberately returned by the former (a caller
//  deciding a vapour fraction needs to know the resolution said "all liquid"
//  rather than "could not tell") and is deliberately NOT a split.
//
//  The distinction had ONE reader, `reporting/BalanceMath.H::streamSplit`, and
//  it was about to get a second: the distillation column must price its feed
//  the way the balance report prices it, or the two disagree by exactly the
//  latent heat of the feed's vapour half -- 630.861080 kW on `column01`, 24.68 %
//  of that plant's exchanged energy, for four months, at exit 0.
//
//  So the rule lives HERE, where both bands can reach it, rather than being
//  transcribed into `unitOperations` from a header in `reporting` that
//  `unitOperations` may not include.  Two readers of one sentence, not two
//  sentences that happen to agree today.
inline std::optional<FlashSolution> twoPhaseSplit(scalar               T,
                                                  scalar               P,
                                                  const sVector&       z,
                                                  bool                 pinned,
                                                  scalar               vfCarried,
                                                  const ThermoPackage& thermo,
                                                  const std::string&   locus,
                                                  const char*          category,
                                                  std::string*         deferTo = nullptr,
                                                  const FlashOptions*  recipe  = nullptr)
{
    auto fs = equilibriumAt(T, P, z, pinned, vfCarried, thermo,
                            locus, category, deferTo, recipe);
    //  Without a recipe the answer is vapour-liquid and `isSplit` reduces to
    //  0 < V/F < 1 exactly as before; with one (a VLLE consumer) a
    //  three-phase or two-liquid answer is a split too, and its readers
    //  price it through `hOfState`, never through `V_over_F` as a vf.
    if (fs && isSplit(*fs))
        return fs;
    return std::nullopt;
}

//  ---- THE SAME QUESTION, ASKED OF A STREAM DICT ----------------------------
//
//  A unit does not hold a `ProcessStream`; the flowsheet hands it a dictionary
//  (`Flowsheet::streamToDict` / the `feed {}` block), so a unit that must know
//  which phase its inlet is in has to read `vf` + `phasePinned` off that dict
//  and then apply exactly the rule above.  That was written out once inside
//  `DistillationColumn.cpp` (2026-09-12, the feed-quality slice) and a second
//  unit needed it the same week -- the evaporator, whose chest steam it never
//  read at all.  Two copies of a rule about second homes is the joke this
//  project has already paid for twice, so the rule lives here, beside the
//  primitive it calls.
//
//  WHY RESOLVE RATHER THAN READ THE DECLARED FIELD.  A stream that declares no
//  `vaporFraction` is not thereby a liquid: it is unpinned, and an unpinned
//  (T, P, z) MEANS its own equilibrium (R-E2).  `origin` records which of the
//  three routes answered, so a refusal or a banner can say HOW it knows.
struct StreamThermalState
{
    scalar                       vf = 0.0;   //  the vapour fraction actually used
    std::optional<FlashSolution> split;      //  the resolution, when it is two-phase
    std::string                  origin;     //  how `vf` was arrived at, for the log
};

inline StreamThermalState resolveStreamThermalState(const DictPtr&       streamDict,
                                                    scalar               T,
                                                    scalar               P,
                                                    const sVector&       z,
                                                    const ThermoPackage& thermo,
                                                    const std::string&   locus,
                                                    const char*          category = "model")
{
    StreamThermalState st;
    const scalar vfCarried = streamDict->lookupScalarOrDefault("vf", 0.0);
    const bool   pinned    =
        streamDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;

    //  A PURE two-phase stream that DECLARES its quality: on its saturation
    //  curve (T, P) do not fix the split, so the pin is the state and there is
    //  nothing to resolve (the rule `resolvedInletVaporFraction` applies
    //  below, DEV.md C37 item 1).
    if (const auto q = pinnedPureQuality(streamDict, z))
    {
        st.vf     = *q;
        st.origin = "declared by the stream (pure, on its saturation curve)";
        return st;
    }

    st.split = twoPhaseSplit(T, P, z, pinned, vfCarried, thermo,
                             locus, category);

    if (st.split)
    {
        st.vf     = st.split->V_over_F;
        st.origin = "resolved at its own (T, P, z)";
    }
    else
    {
        //  Not a split: either the author PINNED a single phase (a declaration
        //  is never re-solved) or the resolution said single-phase / could not
        //  tell.  Price what the stream carries -- which is what the balance
        //  report does in the same state, by the same rule.
        st.vf     = vfCarried;
        st.origin = pinned ? "declared by the stream"
                           : "carried by the stream (single phase)";
    }
    return st;
}

//  ---- THE VAPOUR FRACTION AN INLET MEANS, single phase included -----------
//
//  `resolveStreamThermalState` answers "is there a split to price", and on a
//  converged SINGLE-phase answer it keeps the carried value -- right for
//  pricing, wrong for a unit that must know WHICH phase it was handed: an
//  unpinned all-vapour inlet carries the struct default 0 and would read as a
//  liquid (the phasechange01 trap, 2026-09-12).  This is the reading the
//  flowsheet's post-solve surface pass takes (Flowsheet.cpp, 2026-10-03),
//  made available to the units that read their inlet DURING the solve
//  (valve, adiabaticFlash, heatExchanger, storageTank -- DEV.md C33; the
//  mixer, splitter, cstr, pfr, conversionReactor, shortcutColumn, the three
//  dryers, heater, phaseChanger and multiStreamHX -- C34; the distillation
//  column, both branches, through its `resolveFeedThermalState` -- C35/D1),
//  each in its own
//  thermo world.  Which readers were LEFT, and why, is the table in C33.  A pinned single phase is a declaration and is
//  returned as carried; a resolution that fails or is refused leaves the
//  carried value and is announced by `equilibriumAt` itself.
inline scalar resolvedInletVaporFraction(const DictPtr&       streamDict,
                                         scalar               T,
                                         scalar               P,
                                         const sVector&       z,
                                         const ThermoPackage& thermo,
                                         const std::string&   locus)
{
    const scalar vfCarried = streamDict->lookupScalarOrDefault("vf", 0.0);
    const bool   pinned    =
        streamDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    //  A PURE two-phase inlet DECLARES its quality (pinned, 0 < vf < 1, one
    //  present component): on its saturation curve (T, P) are ONE condition,
    //  so a flash at (T, P, z) would hand back one side of the curve chosen
    //  by the last digits of T and lose the pin.  The pin IS the state
    //  (CLAUDE.md §3, the pure-component exception of the two-variable rule).
    //  Read here, in the one home, for EVERY caller (DEV.md C37 item 1):
    //  until then only heatExchanger, heater and phaseChanger asked
    //  `pinnedPureQuality` first, and every other unit got one side of the
    //  curve.
    if (const auto q = pinnedPureQuality(streamDict, z)) return *q;
    //  Only an AUTHORED inlet is resolved: a produced stream keeps its
    //  producer's answer (column12's mixer writes the right vf at a
    //  fictitious T), the rule the flowsheet's own surface pass applies.
    if (streamDict->lookupScalarOrDefault("authoredInlet", 0.0) < 0.5)
        return vfCarried;
    auto fs = equilibriumAt(T, P, z, pinned, vfCarried, thermo, locus,
                            "streamState");
    if (!fs) return vfCarried;
    return (fs->V_over_F <= 1.0e-9)       ? 0.0
         : (fs->V_over_F >= 1.0 - 1.0e-9) ? 1.0 : fs->V_over_F;
}

//  ---- PRICE A STATE EXACTLY AS THE ENERGY REPORT PRICES IT -----------------
//
//  THE THIRD CALLER MOVED IT HERE (2026-09-27).  This function was written on
//  2026-09-25 inside `ConversionReactor.cpp`'s anonymous namespace, the day
//  that reactor was taken off the ideal-gas surface.  Two days later the
//  flagship plant's first law was traced to THREE more units computing their
//  energy balance on a surface their streams are not priced on -- the spray
//  dryer (a constant-Cp air balance and a Watson latent heat), the solid
//  dryer (the same, plus a temperature floor that evaporated water nobody
//  paid for) and the CSTR (a quality blend at the overall z where the report
//  resolves the split).  Four copies of "price it the way the report does"
//  would be the arity sin in the machinery that ends it, so there is one.
//
//  What it does is the `streamH_elements` rule of `reporting/BalanceMath.H`,
//  which `unitOperations` may not include: resolve the state
//  (`twoPhaseSplit`), price the EQUILIBRIUM phases (`hOfState`) when it is a
//  split, else price the state the stream carries (`H_stream_formation` at the
//  carried vapour fraction).  NOT `H_stream_formation(T, P, vf, z)` alone: that
//  is a quality blend at the overall composition, exact only for a pure fluid
//  (the 5.509232 kW `column01` paid for on 2026-09-12).
//
//  kW when F is in kmol/s (kJ/kmol x kmol/s).  The advisory the resolution may
//  raise is DEFERRED into `notes` rather than logged: a recycle solves a unit
//  against states it does not end on, and the report raises the same note
//  about the same stream at the answer, where it is true.
inline scalar priceState(scalar                    T,
                         scalar                    P,
                         const sVector&            z,
                         scalar                    F,
                         bool                      pinned,
                         scalar                    vfCarried,
                         const ThermoPackage&      thermo,
                         const std::string&        locus,
                         std::vector<std::string>* notes,
                         const FlashOptions*       recipe = nullptr)
{
    std::string deferred;
    auto sp = twoPhaseSplit(T, P, z, pinned, vfCarried, thermo,
                            locus, "model", &deferred, recipe);
    if (!deferred.empty() && notes) notes->push_back(locus + ": " + deferred);
    if (sp) return F * hOfState(*sp, T, P, z, thermo);
    return F * thermo.H_stream_formation(T, P, vfCarried, z);
}

//  The CRYSTALLINE phase a stream carries in `s[]` (kmol/s), on the solid
//  formation rung -- the leg `reporting/BalanceMath.H::solidH_elements` adds
//  to every stream it prices.  kW.  A unit whose streams carry crystals must
//  add it to `priceState` or its balance and the report's part by the solid.
inline scalar priceSolids(const sVector& s, scalar T, const ThermoPackage& thermo)
{
    scalar h = 0.0;
    for (std::size_t i = 0; i < s.size() && i < thermo.n(); ++i)
        if (s[i] > 0.0) h += s[i] * thermo.comp(i).h_formation(T, "solid");
    return h;
}

} // namespace flashState
} // namespace Choupo
