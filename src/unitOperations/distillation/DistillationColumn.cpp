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

#include "core/InfeasibleTrial.H"
#include "thermo/PropertyDomainError.H"
#include "core/PropertySourceLog.H"
#include "thermo/LiquidPropertyDoor.H"
#include "core/Formula.H"
#include "core/Advisory.H"
#include "core/RegistryRefusal.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE resolve-and-price home
#include "unitOperations/flash/IncipientPhase.H"      // the ONE incipient-vapour iteration
#include "thermo/equationOfState/EquationOfState.H"  // isIdeal(): does phi depend on y?
#include "unitOperations/saturation/BubblePoint.H"
#include "unitOperations/saturation/DewPoint.H"
#include "DistillationColumn.H"
#include "TrayHydraulics.H"
#include "TrayEfficiency.H"
#include "PackingRBF.H"
#include "PackingDelft.H"
#include "core/Constants.H"
#include "thermo/transport/WilkeChang.H"
#include "solver/NewtonRaphson.H"
#include "thermo/electrolyte/ReactiveVLE.H"
#include "solver/NewtonND.H"
#include "thermo/SaturationCurves.H"
#include "thermo/reaction/ReactionRate.H"
#include "thermo/reaction/Reaction.H"   // Reaction::forwardOrder -- the ONE home of the forward order
#include "unitOperations/reactor/ReactionHeat.H"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <mutex>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <vector>
#include "thermo/activityCoefficient/ActivityModel.H"

namespace Choupo {

namespace {

//  A FEED OR A SIDE DRAW ON STAGE 1 IS REFUSED BY THE MESH METHODS, IN ONE
//  SENTENCE (C123, 2026-10-21).  The simultaneous MESH -- CMO and full --
//  writes stage 1's balances with NO feed and NO draw term (the `j == 0` rows
//  of `residual` and `residualF` in `solveSimultaneous`), while the bottoms
//  come from the TOTAL feed (`Bf = sum F - D - sum draws`).  So a stage-1
//  feed was ACCEPTED and then LOST: a pressure-swing benchmark with its
//  recycle on stage 1 published a 109.27 % mass closure and an element
//  balance 50 % off, "converged", at exit 0.  The single-feed form had always
//  refused `feedStage 1`; the multi-feed list, the legacy inline feeds and
//  the side draws did not.  Every one of those sites calls this function, so
//  the refusal cannot be worded four ways.  (Wang-Henke, single feed only,
//  DOES carry a feed on stage 1 -- its tridiagonal has the term -- and keeps
//  it under a total condenser, where stage 1 is the top tray.)
[[noreturn]] void refuseStageOneTerm(const std::string& unit,
                                     const std::string& what,
                                     const std::string& remedy)
{
    throw std::runtime_error("DistillationColumn(simultaneous) '" + unit
        + "': " + what + " is declared on stage 1, and this method refuses it."
        "  Stage 1 is the top of the column, where the reflux returns, and the"
        " MESH writes its balances there with no feed and no draw term -- so it"
        " would be accepted and then LOST from the column's balance (the"
        " bottoms are computed from the total feed).  " + remedy);
}

const char* const kStageOneFeedRemedy =
    "Put the feed on stage 2, the stage below, or mix it into another feed"
    " upstream with a `mixer`.  (A SINGLE feed on stage 1 is carried by"
    " `model WangHenke;`.)";
const char* const kStageOneDrawRemedy =
    "Draw it from stage 2, or split it off the distillate downstream with a"
    " `splitter`.";

//  THE CONDENSER IS A DECLARED CHOICE, AND THE STAGE COUNT FOLLOWS FROM IT
//  (C123, 2026-10-21).  `nStages` counts the column's EQUILIBRIUM stages, top
//  to bottom; the partial reboiler is always the last of them.
//
//    total   (the default)  The condenser condenses ALL of the vapour leaving
//            stage 1 and is NOT an equilibrium stage, so it is not counted:
//            stage 1 is the TOP TRAY.  Reflux and distillate leave the drum as
//            one saturated liquid of the vapour's composition,
//                 x_D = y_1 = K_1 x_1,   at the bubble point of x_D,
//            and the reflux R D returns to stage 1 with that composition.  The
//            tray-1 balance  R D x_D + V_2 y_2 = L_1 x_1 + (R+1) D y_1  is the
//            same equation as  L_1 x_1 + D y_1 - V_2 y_2 = 0,  which is the row
//            every method writes -- so x_D = y_1 is not a mislabel.
//    partial  The condenser IS stage 1, an equilibrium stage: it returns its
//            liquid x_1 as the reflux (L_1 = R D) and sends the distillate as a
//            saturated VAPOUR  y_D = K_1 x_1  at T_1, its dew point.
//
//  The two have THE SAME material equations and differ in what stage 1 is,
//  the distillate's phase, the condenser duty, whether stage 1 is a tray, and
//  -- under `fullMESH` -- whether stage 1 carries an energy balance (a tray
//  does; a partial condenser's duty is free).  A source that counts a TOTAL
//  condenser as "stage 1" describes a column of N-1 equilibrium stages, which
//  is nStages N-1 here.
//
//  Why this was written down: the corpus held BOTH readings at once.  The
//  header, the Wang-Henke hydraulics and the tray count said "stage 1 is the
//  top tray"; the MESH hydraulics (V_0 = 0), the full-MESH stage-1 rows (no
//  energy balance, L_1 = R D), `docs/ai/unit-ops.md` and the Theory Guide
//  said "stage 1 is the total condenser" -- so one declaration gave a column
//  one more tray under Wang-Henke than under the MESH.  Declared in the
//  condenser's own block, beside its utility:
//      operation { condenser { type total|partial;  utility coolingWater; } }
enum class CondenserType { total, partial };

CondenserType readCondenserType(const DictPtr&     operDict,
                                const std::string& unit,
                                int                verbosity)
{
    std::string word = "total";
    bool declared = false;
    if (operDict->found("condenser"))
    {
        DictPtr cd;
        try { cd = operDict->subDict("condenser"); }
        catch (const std::exception&)
        {
            throw std::runtime_error("DistillationColumn '" + unit + "': "
                "`condenser` is the condenser's own block -- write"
                " `condenser { type total; }` or `condenser { type partial; }`"
                " (the same block that names its utility).");
        }
        if (cd && cd->found("type"))
        {
            word = cd->lookupWord("type");
            declared = true;
        }
    }
    if (word != "total" && word != "partial")
        throw std::runtime_error("DistillationColumn '" + unit + "': "
            + registryRefusal::message("condenser type", word,
                {"total", "partial"}, "Accepted"));

    //  A DEFAULT THAT IS USED IS ANNOUNCED, once per column per process (a
    //  recycle or a sweep solves the column many times); a declared type
    //  announces nothing, so silence keeps meaning "nothing was assumed".
    if (!declared && verbosity >= 1)
    {
        static std::mutex lock;
        static std::set<std::string> said;
        std::lock_guard<std::mutex> g(lock);
        if (said.insert(unit).second)
            std::cout << "  [column] " << unit << ": condenser TOTAL (the"
                         " default; declare `condenser { type total|partial; }`)"
                         " -- nStages counts the EQUILIBRIUM stages, stage 1 is"
                         " the top tray and the last the reboiler; the total"
                         " condenser above stage 1 is not one of them, and the"
                         " reflux and the distillate leave it at x_D = y_1.\n";
    }
    return word == "partial" ? CondenserType::partial : CondenserType::total;
}

//  THE CONDENSER DUTY HAS ONE HOME FOR EVERY METHOD (C123), because the
//  column's two solver paths each wrote it out for themselves and it is the
//  condenser TYPE that decides what it is.  [kW; negative = heat removed]
//
//    total    the condenser takes the vapour leaving stage 1, V_top of y_1 at
//             T_1, and returns all of it as a liquid of the same composition
//             at T_cond:
//                 Q = -V_top [ h_V(y_1, T_1) - h_L(y_1, T_cond) ]
//             (one composition on both sides, so the enthalpy datum cancels).
//    partial  stage 1 IS the condenser, and its duty closes ITS OWN envelope:
//             the vapour V_in of y_2 rising from stage 2 in, the reflux L_1
//             of x_1 and the vapour distillate D of y_1 out, both at T_1:
//                 Q = -[ V_in h_V(y_2, T_2) - L_1 h_L(x_1, T_1) - D h_V(y_1, T_1) ]
//             (the component flows balance across it, so the datum cancels).
//
//  Q_reboiler is then the plug that closes the column, as it always was.
//
//  AND THE PLUG IS NOT EVIDENCE (DEV.md 4c C174).  Because Q_reboiler is
//  dH - Q_condenser, the column's first law over its boundary is zero for ANY
//  condenser duty: the closure sees only the SUM of the two duties, which is
//  how a condenser priced on the wrong surface on every column of the corpus
//  went past a green `check_energy_closure` (C169).  So the column publishes
//  the plug as a CLOSURE VARIABLE (result/ClosureVariable.H) and, beside it,
//  the reboiler's OWN envelope -- the vapour V_N it boils up and the bottoms
//  B leaving, against the liquid L_{N-1} falling into it and any feed on its
//  stage -- on the same surface:
//
//      Q_own = V_N h_V(y_N, T_N) + B h_L(x_N, T_N) [+ draws]
//            - L_{N-1} h_L(x_{N-1}, T_{N-1}) - H(feeds on N)
//
//  Q_plug - Q_own is the sum of every OTHER envelope's energy residual (the
//  stages and the condenser; the condenser's is zero by its own definition).
//  Under the FULL MESH every stage row is an energy balance solved to 1e-9,
//  so the two must agree, and the record says `verified` only then.  Under
//  CMO no stage carries an energy balance -- that is the approximation the
//  model declares -- so the gap is the energy CMO does not conserve inside
//  the column, all of it landing in the reboiler.  It is published, and it
//  is never a verification.
ClosureVariable reboilerClosure(scalar Q_plug, std::optional<scalar> Q_own,
                                bool fullMesh, scalar termsMagnitude,
                                const std::string& whyNoRoute)
{
    ClosureVariable c;
    c.balance  = "energy";
    c.variable = "Q_reboiler_kW";
    c.rule     = "Q_reboiler = dH(streams) - Q_condenser: the column's whole"
                 " first law, closed by the reboiler";
    c.blindTo  = "the split between the condenser and the reboiler duties --"
                 " the closure over the column holds for ANY Q_condenser";
    if (!Q_own)
    {
        c.note = "no second route: " + whyNoRoute;
        return c;
    }
    c.check      = "the reboiler's own envelope on the solver's stage traffic:"
                   " V_N h_V + B h_L - L_(N-1) h_L - H(feeds on N)";
    c.hasCheck   = true;
    c.checkValue = *Q_own;
    c.gap        = Q_plug - *Q_own;
    //  The full MESH solves each energy row to 1e-9 of the feed times the
    //  stages' mean latent heat, and the result JSON carries 12 figures of
    //  formation enthalpies of order 1e5 kJ/kmol: 1e-5 kW plus 1e-9 of the
    //  envelope's own terms (the sum of their magnitudes) sits above both and
    //  four orders below the 3.9 kW the C169 audit found on one stage.
    c.tolerance  = 1.0e-5 + 1.0e-9 * termsMagnitude;
    if (!fullMesh)
    {
        std::ostringstream m;
        m << std::scientific << std::setprecision(6)
          << "CMO solves no stage energy balance (the approximation it"
             " declares), so the reboiler's own envelope on the CMO traffic"
             " is not a route that can agree: it reads " << *Q_own
          << " kW against the plug's " << Q_plug << " kW, and the gap is the"
             " energy the CMO approximation does not conserve inside the"
             " column, all of it carried by the reboiler.  The condenser duty"
             " is held by check_column_thermo_consistency arm (a)";
        c.note = m.str();
        return c;
    }
    c.mustAgree = true;
    c.verified = std::abs(c.gap) <= c.tolerance;
    if (!c.verified)
    {
        std::ostringstream m;
        m << std::scientific << std::setprecision(6)
          << "the full MESH's reboiler envelope reads " << *Q_own
          << " kW against the plug's " << Q_plug << " kW (gap " << c.gap
          << " kW > " << c.tolerance << "): some envelope inside the column"
             " does not close on the surface its streams are priced on";
        c.note = m.str();
    }
    return c;
}

struct CondenserTop
{
    scalar  D     = 0.0;   // distillate [kmol/s]
    sVector yD;            // its composition, y_1 normalised
    scalar  T1    = 0.0;   // stage 1 temperature [K]
    scalar  Tcond = 0.0;   // total: the temperature the condensate leaves at
    scalar  Vtop  = 0.0;   // total: the vapour into the condenser
    scalar  Vin   = 0.0;   // partial: the vapour rising into stage 1
    sVector y2;            // partial: its composition
    scalar  T2    = 0.0;   // partial: stage 2 temperature
    scalar  L1    = 0.0;   // partial: the reflux, the liquid leaving stage 1
    sVector x1;            // partial: its composition
    //  total, when the distillate is NOT a declared liquid (its bubble point
    //  was not solved): the distillate's enthalpy [kW] priced on the state
    //  the stream CARRIES, so the condenser condenses only the reflux it
    //  returns and the distillate it actually publishes (DEV.md 4c C201
    //  item 3, `distillateEnthalpy`).
    bool    distillateCarried = false;
    scalar  Hdist = 0.0;
};

//  ONE ENTHALPY SURFACE FOR THE WHOLE COLUMN, AND IT IS THE STREAMS' ONE
//  (DEV.md 4c C169, 2026-10-26).
//
//  WHAT WAS WRONG.  The full MESH solved every stage's energy balance, the
//  condenser duty and the energy scale on `ThermoPackage::Hliquid` /
//  `Hvapour` -- a sensible datum per component with the vapour built as
//  Hliq_pure + a Watson latent heat -- while the streams the column
//  publishes, the reboiler plug beside that duty and the energy report all
//  price on the formation datum (`H_stream_formation`: h_ig - dHvap for a
//  liquid, h_ig + the EoS departure for a vapour).  The two surfaces differ
//  in their TEMPERATURE dependence, not by a per-component constant, so the
//  difference does not cancel on a stage that conserves every component.
//  Measured by an external audit and reproduced by
//  `check_column_thermo_consistency`: an interior stage of column06 that
//  closed to 2.5e-8 kW on the internal surface left 3.937574 kW on the
//  streams', column08 left 124.000623 kW on one stage, and the published
//  condenser duty differed from the streams' by 22.89 and 93.89 kW.  The
//  column's GLOBAL first law closed by construction -- Q_reboiler is the
//  plug dH - Q_condenser -- so no first-law gate could see any of it: the
//  2026-09-12 family ("the state a unit computes with is not the state its
//  streams carry"), on the one unit that family was thought closed on.
//
//  THE RULE.  Every enthalpy the column computes with -- the full MESH's
//  stage rows, its feeds, the reflux, the energy scale, the condenser duty
//  and the products in the reboiler plug -- is read off THIS object, which
//  prices a stage liquid and a stage vapour each on its OWN composition by
//  the function that prices the published streams.  So the stage balances,
//  the duties and the stream table are one surface, and under the full MESH
//  the reboiler plug equals the reboiler's own balance.
//
//  THE ONE OTHER SURFACE, DECLARED.  When a species in the feed carries no
//  formation datum the formation surface cannot price the column at all,
//  and the column falls back to the sensible datum (Hliquid / Hvapour) --
//  the degraded datum, ANNOUNCED once by `columnEnthalpySurface` below in
//  the words Flowsheet.cpp uses for the same decision.  Its results are
//  never published as the package's: the announcement says which surface
//  the duties are on, and the energy report (which needs the formation
//  datum) is UNAVAILABLE for such a stream anyway.
struct ColumnEnthalpy
{
    const ThermoPackage* thermo    = nullptr;
    scalar               P         = 0.0;
    bool                 formation = true;   // false: the announced sensible fallback

    //  [J/mol] a liquid of composition x at T.
    scalar hL(const sVector& x, scalar T) const
    {
        return formation ? thermo->H_stream_formation(T, P, 0.0, x)
                         : thermo->Hliquid(T, x);
    }
    //  [J/mol of the amounts in y] a vapour.  A Newton trial's y = K x need
    //  not sum to one, and the EoS departure is a per-mole quantity of a
    //  NORMALISED composition, so the vapour is priced at y / sum(y) and
    //  scaled back by sum(y) -- at a converged stage sum(y) = 1 and this is
    //  exactly the published vapour's enthalpy.
    scalar hV(const sVector& y, scalar T) const
    {
        if (!formation) return thermo->Hvapour(T, y);
        scalar s = 0.0;
        for (auto v : y) s += v;
        if (!(s > 0.0)) return 0.0;
        sVector yn(y);
        for (auto& v : yn) v /= s;
        return s * thermo->H_stream_formation(T, P, 1.0, yn);
    }
    //  [J/mol] a state at a DECLARED quality vf and one composition z -- a
    //  quality blend, used only for a product of a single phase (vf 0 or 1,
    //  where it is that phase's own enthalpy) and for an inline `feeds`
    //  entry, which is a dict declaration with no state to resolve.
    scalar hQuality(scalar vf, const sVector& z, scalar T) const
    {
        if (formation) return thermo->H_stream_formation(T, P, vf, z);
        if (vf >= 1.0) return thermo->Hvapour(T, z);
        if (vf <= 0.0) return thermo->Hliquid(T, z);
        return (1.0 - vf) * thermo->Hliquid(T, z) + vf * thermo->Hvapour(T, z);
    }
};

//  Which surface this column computes on, decided ONCE per solve from the
//  compositions that enter it (every species the column can hold enters in
//  a feed), and announced when it is the fallback.  Every column path calls
//  this one function, so the downgrade cannot be worded -- or decided --
//  two ways.
ColumnEnthalpy columnEnthalpySurface(const ThermoPackage& thermo, scalar P,
                                     const std::vector<std::pair<scalar, sVector>>& feeds)
{
    ColumnEnthalpy h;
    h.thermo = &thermo;
    h.P      = P;
    try
    {
        for (const auto& f : feeds)
        {
            (void)thermo.H_stream_formation(f.first, P, 0.0, f.second);
            (void)thermo.H_stream_formation(f.first, P, 1.0, f.second);
        }
    }
    catch (const InfeasibleTrial&) { throw; } catch (const HardWindowRefusal&) { throw; }   // a law's hard window REFUSES (CV-13)
    catch (const std::exception& e)
    {
        h.formation = false;
        //  LOUD DOWNGRADE (AS3).  This catch used to be EMPTY, and on a
        //  REACTIVE column that is not a lost decimal: the elements datum is
        //  what carries the heat of reaction, so dropping to the sensible
        //  datum DELETES it from the reboiler duty.  The column converged,
        //  printed a duty, and exited 0.
        //
        //  Flowsheet.cpp answers the identical question correctly, and the
        //  wording here is deliberately ITS wording -- same channel, same
        //  once-per-cause suppression -- because the two are ONE decision
        //  ("what does a missing formation datum mean?") and a reader must
        //  not have to learn two vocabularies for it.  They still perform
        //  DIFFERENT fallbacks (blend there, sensible here), so this is an
        //  announcement made consistent, NOT a shared home; the shared home
        //  is the open half of AS9 and is recorded rather than pretended.
        if (AdvisoryLog::instance().add("thermo", "warning",
                                        "enthalpy-gap", e.what()))
            std::cerr << "[thermo] enthalpy GAP (formation datum): "
                      << e.what()
                      << "\n          -> the column's energy items fall back"
                         " to the SENSIBLE datum -- its duties and, under a"
                         " full MESH, its stage energy balances (Hliquid /"
                         " Hvapour: a degraded datum, not the one its streams"
                         " are priced on; it drifts from the canonical"
                         " surface and never enters a closed balance).\n"
                         "          -> IF THIS COLUMN REACTS, the heat of"
                         " reaction is NOT in the reboiler duty reported"
                         " below; fix the species data to close it.\n";
    }
    return h;
}

scalar condenserDuty(const ColumnEnthalpy& h, CondenserType condenser,
                     const CondenserTop& t)
{
    if (condenser == CondenserType::partial)
        return -( t.Vin * h.hV(t.y2, t.T2)
                - t.L1  * h.hL(t.x1, t.T1)
                - t.D   * h.hV(t.yD, t.T1));
    if (t.distillateCarried)
        return -( t.Vtop * h.hV(t.yD, t.T1)
                - (t.Vtop - t.D) * h.hL(t.yD, t.Tcond)
                - t.Hdist);
    return -t.Vtop * (h.hV(t.yD, t.T1) - h.hL(t.yD, t.Tcond));
}

//  THE DISTILLATE IS PRICED ON THE STATE IT CARRIES (DEV.md 4c C201 item 3).
//  A distillate whose bubble point was SOLVED is a declared liquid
//  (`makeDistillate` pins it), and its quality blend at vf = 0 is that
//  liquid's own enthalpy -- unchanged.  One whose bubble point was NOT solved
//  (it did not converge, or the package resolves reactive equilibrium) is
//  published UNPINNED at the top tray's temperature, which with a total
//  condenser is its DEW point; an unpinned (T, P, z) MEANS its own
//  equilibrium (R-E2), and the energy report prices it so.  The column used
//  to price that same stream as a LIQUID at that temperature -- in its
//  product enthalpy and in the condensate its condenser duty removes -- so
//  the unit's balance and the report's parted by the distillate's latent
//  heat (aceticAcid02_plant's lightsColumn: a distillate carrying 7 % CO
//  that no liquid at 1.5 bar can hold, 6.43 kW unattributed).  Here it goes
//  through the ONE home the report's rule lives in, `flashState::priceState`;
//  the sensible fallback surface keeps the blend, as every term does there.
scalar distillateEnthalpy(const ProcessStream& d, const ColumnEnthalpy& hs,
                          const ThermoPackage& thermo)
{
    if (d.phasePinned || !hs.formation)
        return d.F * hs.hQuality(d.vf, d.z, d.T);
    return flashState::priceState(d.T, d.P, d.z, d.F, false, d.vf, thermo,
                                  "distillationColumn distillate", nullptr);
}

//  y = K x at a stage, normalised -- the composition a duty is priced at.
sVector normalisedVapour(const sVector& K, const sVector& x)
{
    sVector y(x.size(), 0.0);
    scalar s = 0.0;
    for (std::size_t i = 0; i < x.size(); ++i) { y[i] = K[i] * x[i]; s += y[i]; }
    if (s > 0.0) for (auto& v : y) v /= s;
    return y;
}

//  THE VAPOUR'S FUGACITY IS EVALUATED AT THE VAPOUR (DEV.md 4c C169 item 2).
//
//  WHAT WAS WRONG.  Every column model asked `stageK(T, P, x, x, x)` -- the
//  K-values with the LIQUID composition in the vapour's slot -- so a stage
//  satisfied  y_i phi_i(T, P, x) P = x_i gamma_i Psat_i  instead of the
//  package's equilibrium  y_i phi_i(T, P, y) P = x_i gamma_i Psat_i.  Under an
//  ideal vapour phi = 1 and the two are the same equation, which is why the
//  corpus never saw it; on SRK the published state missed the package's own
//  equilibrium by max |ln(y / (x K(x, y)))| = 9.4e-4 (column15, 75 stages)
//  while satisfying the equation implemented to 1e-11.
//
//  THE RULE.  The K a stage uses is the package's K at the vapour the stage
//  sends up: the incipient vapour of its liquid, y <- K(x, y) x / sum(K x),
//  iterated to 1e-13 by `incipientPhase::vapour` -- the ONE home of that
//  iteration, already read by the bubble pressure and the flash's phase
//  test -- and seeded from the stage's previous vapour where the caller has
//  one.  At a converged stage sum(K x) = 1, so the published y = K x IS that
//  vapour and the fugacities are equal.  A phi-phi package reads its two
//  roots the same way, each phase at its own composition.
//
//  WHERE IT IS SKIPPED, and why that is not an approximation: a vapour whose
//  fugacity coefficient does not depend on its composition (an ideal gas:
//  phi = 1, so K(x, y) = K(x, x) exactly, and every such column is
//  byte-identical), and a package that resolves reactive equilibrium, whose
//  `stageK` is the stage's own reactive flash and reads neither slot.
//  An ASSOCIATED ideal-gas vapour (DEV.md 4c C201 item 1) is the second
//  case: its fugacity coefficients are the dimer split's, which depends on
//  y -- the package says which (`vapourFugacityDependsOnComposition`, one
//  home), so the column cannot name the EoS case and forget this one.
bool vapourFugacityDependsOnY(const ThermoPackage& thermo)
{
    return !thermo.hasReactiveEquilibrium() && thermo.hasEos()
        && thermo.vapourFugacityDependsOnComposition();
}

sVector stageVapourK(const ThermoPackage& thermo, scalar T, scalar P,
                     const sVector& x, const sVector* ySeed = nullptr,
                     bool* converged = nullptr)
{
    if (converged) *converged = true;
    if (!vapourFugacityDependsOnY(thermo))
        return thermo.stageK(T, P, x, x, x);
    //  A Newton trial may carry a slightly negative fraction; the vapour it
    //  sends up is read off the physical liquid (negatives as absent).  At a
    //  converged state every fraction is non-negative and this is x itself.
    sVector xp(x.size(), 0.0);
    bool clipped = false;
    scalar sp = 0.0;
    for (std::size_t i = 0; i < x.size(); ++i)
    {
        if (x[i] < 0.0) clipped = true;
        xp[i] = std::max(x[i], 0.0);
        sp += xp[i];
    }
    //  C245 3d: a clipped composition no longer sums to what it did; the
    //  activity model reads a mole-fraction vector, so it is renormalised
    //  (only when something was clipped: a converged stage is untouched).
    if (clipped && sp > 0.0) for (auto& v : xp) v /= sp;
    const sVector K0 = thermo.Kvec(T, P, xp, ySeed ? *ySeed : xp);
    const auto r = incipientPhase::vapour(thermo, T, P, xp, K0);
    if (converged) *converged = r.converged;
    return r.K.empty() ? K0 : r.K;
}

//  The BUBBLE POINT of a liquid with its own incipient vapour -- the reflux
//  and the distillate of a total condenser.  On a vapour whose fugacity does
//  not depend on y this is `bubbleT` at y = x, unchanged.  Otherwise the
//  temperature and the vapour are solved together: T at a fixed vapour
//  (`bubbleT`'s Newton, one home), the vapour at that T (`incipientPhase`),
//  repeated until the vapour stops moving.  `converged` is false when it
//  does not, AND when the bubble-T Newton that returned T did not meet its
//  own tolerance (DEV.md 4c C186 item 6, the architect's ruling: a verdict
//  dropped is the defect) -- and the caller says so.
scalar bubbleTWithItsVapour(const ThermoPackage& thermo, const sVector& x,
                            scalar P, scalar Tguess, scalar tol,
                            bool* converged = nullptr, sVector* yOut = nullptr)
{
    if (converged) *converged = true;
    bool tOk = true;
    if (!vapourFugacityDependsOnY(thermo))
    {
        const scalar T0 = bubbleT(thermo, x, P, Tguess, tol, nullptr, &tOk);
        if (converged) *converged = tOk;
        return T0;
    }
    sVector y = normalisedVapour(thermo.Kvec(Tguess, P, x, x), x);
    scalar T = Tguess;
    bool ok = false;
    for (int it = 0; it < 50 && !ok; ++it)
    {
        T = bubbleT(thermo, x, P, T, tol, &y, &tOk);
        const auto r = incipientPhase::vapour(thermo, T, P, x,
                                              thermo.Kvec(T, P, x, y));
        if (r.trial.empty()) break;
        scalar dy = 0.0;
        for (std::size_t i = 0; i < y.size(); ++i)
            dy = std::max(dy, std::abs(r.trial[i] - y[i]));
        y  = r.trial;
        ok = dy < 1.0e-12;
    }
    if (ok) T = bubbleT(thermo, x, P, T, tol, &y, &tOk);
    //  The verdict that counts is the LAST solve's, the one whose T is
    //  returned; an inner solve that missed and was then superseded is an
    //  iterate.
    if (converged) *converged = ok && tOk;
    if (yOut) *yOut = y;
    return T;
}

//  Announced once per column per process when a PUBLISHED stage's vapour
//  iteration did not converge: that stage's K is then the last iterate's.
void announceUnconvergedVapour(const std::string& unit)
{
    static std::mutex lock;
    static std::set<std::string> said;
    std::lock_guard<std::mutex> g(lock);
    if (!said.insert(unit).second) return;
    std::cout << "  [column] " << unit << ": WARNING -- the incipient-vapour"
                 " iteration y <- K(x, y) x did not converge on at least one"
                 " published stage, so that stage's K is the last iterate's"
                 " and its fugacities are equal only to that iterate's"
                 " precision.\n";
    AdvisoryLog::instance().add("numerics", "warning",
        "distillationColumn vapour",
        "the incipient-vapour iteration did not converge on a published stage"
        " of '" + unit + "'; its K-values are the last iterate's.");
}

//  THE DISTILLATE LEAVES AT ITS OWN BUBBLE POINT, not at the top tray's
//  temperature -- and this lives in ONE function because the column has TWO
//  solver paths (Wang-Henke and the simultaneous MESH) that each used to build
//  this stream for themselves.  One decision, two transcriptions: a fix
//  applied to either alone would have been right on half the corpus.
//
//  WHAT WAS WRONG.  Both paths wrote `T = T[0]` beside `vf = 0`, and those two
//  statements cannot both be true.  Stage 1's equilibrium makes T[0]
//  simultaneously the bubble point of the liquid x_1 and the DEW point of the
//  vapour y_1; with a total condenser x_D = y_1, so publishing the condensate
//  at T[0] reports a saturated LIQUID at the temperature where that
//  composition is a saturated VAPOUR.  A total condenser without subcooling
//  delivers it at the bubble point of x_D, which is lower -- measured at
//  0.58 K on column01 (354.2109 published against 353.6301 computed), always
//  in the same direction, widening with the boiling range and closing as the
//  product approaches purity.  Every downstream unit that priced this stream
//  inherited that bias.
ProcessStream makeDistillate(const ThermoPackage& thermo,
                             const sVector&       xD,
                             scalar               D,
                             scalar               P,
                             scalar               T_topTray,
                             CondenserType        condenser)
{
    ProcessStream d;
    d.name = "distillate";
    d.F    = D;
    d.P    = P;
    d.z    = xD;
    d.vf   = 0.0;                       // a total condenser: already condensed

    //  A PARTIAL CONDENSER SENDS A SATURATED VAPOUR: stage 1 is that
    //  condenser, its T_1 is the bubble point of x_1 and therefore the DEW
    //  point of y_1 = x_D, so the vapour leaves at T_1 exactly.  That is a
    //  declaration of the stream's phase, as the total condenser's liquid is.
    if (condenser == CondenserType::partial)
    {
        d.T           = T_topTray;
        d.vf          = 1.0;
        d.phasePinned = true;
        return d;
    }

    //  WHERE THE PACKAGE RESOLVES CHEMISTRY, THIS CORRECTION DOES NOT APPLY,
    //  and pretending otherwise is worse than the defect it fixes.
    //  `BubblePoint::compute` asks `Kvec` on the APPARENT composition, and in
    //  a reactive electrolyte system that is not the equilibrium the stage
    //  actually solved -- the reactive path owns that question through
    //  `stageK`/`ReactiveVLE`, which resolve the speciation at each trial
    //  state.  Applied blindly it made two sour-water columns WORSE, not
    //  better: `column13` began publishing a distillate its own energy report
    //  could prove impossible as a liquid, and `stripper01`'s energy residual
    //  grew from 12.79 to 15.47 kW.  So the reactive columns keep the top
    //  tray's temperature and are TOLD that they do -- a named gap, not a
    //  silent one, and the next slice's work.
    if (thermo.hasReactiveEquilibrium())
    {
        d.T = T_topTray;
        static bool announcedReactive = false;
        if (!announcedReactive)
        {
            std::cout << "  [distillate] this package resolves reactive"
                         " equilibrium, so the distillate's own bubble point is"
                         " NOT computed here: the apparent-basis K-values a"
                         " bubble point would use are not the equilibrium this"
                         " column solved.  Its temperature is the TOP TRAY's,"
                         " which with a total condenser is the composition's"
                         " DEW point -- so this stream is published warm, by"
                         " an amount nobody has measured for a reactive"
                         " system.\n";
            announcedReactive = true;
        }
        AdvisoryLog::instance().add("model", "warning",
            "distillationColumn distillate",
            "the distillate temperature is the top tray's, not this"
            " composition's bubble point, because the package resolves"
            " reactive equilibrium and a bubble point on the apparent basis"
            " would not be the equilibrium the column solved.  With a total"
            " condenser the top tray's temperature is the DEW point, so the"
            " stream is published warm; anything downstream that prices it"
            " inherits that.");
        return d;
    }

    //  T_topTray is the initial guess, and a good one: it is the DEW point of
    //  this same composition, so the bubble point sits just below it.
    //  On a vapour whose fugacity depends on its composition the bubble point
    //  is solved WITH its own incipient vapour (C169 item 2; the reflux row
    //  of the full MESH calls the same function, so the reflux and the
    //  published distillate are one temperature); on an ideal vapour it is
    //  `BubblePoint::compute`, unchanged.
    BubblePoint::Result bub;
    if (vapourFugacityDependsOnY(thermo))
    {
        bool ok = false;
        sVector yInc;
        bub.T = bubbleTWithItsVapour(thermo, xD, P, T_topTray, 1.0e-12, &ok, &yInc);
        const sVector Kb = thermo.Kvec(bub.T, P, xD, yInc);
        scalar S = 0.0;
        for (std::size_t i = 0; i < xD.size(); ++i) S += Kb[i] * xD[i];
        bub.residual  = S - 1.0;
        bub.converged = ok && std::abs(S - 1.0) <= 1.0e-8
                     && !trivialSaturationRoot(thermo, bub.T, P, xD, Kb);
    }
    else
        bub = BubblePoint::compute(thermo, xD, P, T_topTray);
    if (bub.converged)
    {
        d.T = bub.T;
        //  A TOTAL CONDENSER DECLARES ITS OUTLET'S PHASE (2026-09-12).  This
        //  stream is not a guess about a state: the condenser condenses ALL of
        //  the overhead and this very function has just solved for the
        //  temperature at which that composition is a saturated liquid.  That
        //  is a declaration in exactly the sense R-E2 means, so it is PINNED
        //  and no reader re-solves it.
        //
        //  What that was costing: a bubble-point stream left unpinned gets
        //  re-flashed by `reporting/BalanceMath.H`, whose flash returns
        //  V/F ~ 1e-6 -- numerical zero, but above the 1e-9 threshold that
        //  decides "two-phase" -- so the report priced a vapour whisker the
        //  column never made.  Measured AFTER every other defect in this slice
        //  was fixed, it was the whole of what remained: 3.4107 W on
        //  column15_klemola_ideal_trays against a residual of 0.003411 kW, and
        //  1.6957 W on column14 against 0.001696 kW.
        //
        //  ONLY ON THIS ROUTE.  The two routes below publish `T_topTray`, which
        //  is the composition's DEW point and is the wrong temperature for a
        //  liquid -- both say so.  Pinning a state we have just called wrong
        //  would convert an announced approximation into a declaration, and a
        //  consumer would price a superheated liquid instead of re-resolving.
        d.phasePinned = true;
        return d;
    }

    //  NEVER silently fall back on the temperature we have just called wrong.
    //  Report the old value so the run completes, and say which number this is.
    d.T = T_topTray;
    std::cout << "  [distillate] WARNING: the bubble point of the distillate"
                 " did not converge (residual " << bub.residual << " after "
              << bub.iterations << " iterations), so its temperature is"
                 " reported as the TOP TRAY's " << T_topTray << " K.  With a"
                 " total condenser that is this composition's DEW point, so"
                 " the stream is published WARM.\n";
    AdvisoryLog::instance().add("numerics", "warning",
        "distillationColumn distillate",
        "the distillate's bubble point did not converge, so the top tray's"
        " temperature is reported instead.  With a total condenser that is"
        " this composition's DEW point, so the stream is published warmer"
        " than it leaves, and anything downstream that prices it inherits"
        " that.");
    return d;
}


//  THE FEED'S THERMAL STATE LIVES IN THE STREAM  (2026-09-12)
//  ========================================================
//
//  `operation.feedQuality` was a SECOND HOME for a fact the stream already
//  carries, and the two were never reconciled on the single-feed paths.  What
//  that cost, measured on `column01_benzene_toluene`, this project's flagship
//  distillation tutorial, which students run:
//
//      0/feed          T 370 K;  vaporFraction 0.6972418857;   (=> q = 0.3028)
//      flowsheetDict   feedQuality 1.0;                        (=> saturated liquid)
//
//  The engine's own flash puts that feed at V/F = 0.697242, so the stream was
//  right and the dict was wrong.  The column read the dict, the first-law
//  report read the stream, and the plant lost 630.861080 kW -- 24.68 % of its
//  exchanged energy -- with the suite green, because a golden pins what a run
//  PRINTS and this run printed the same wrong number every time.
//
//  The fix is not a reconciliation rule; it is deleting the second home.  The
//  thermal state is RESOLVED here, once, from the stream -- and the resolution
//  is `flashState::twoPhaseSplit`, the SAME call `reporting/BalanceMath.H`
//  makes, so the state the column computes with and the state the balance
//  prices are one object rather than two conventions that agree by luck.
//
//  WHY RESOLVE RATHER THAN READ THE DECLARED FIELD.  A stream that declares no
//  `vaporFraction` is not thereby a liquid: it is unpinned, and an unpinned
//  (T, P, z) MEANS its own equilibrium (R-E2).  `stripper01_sour_water` and
//  `stripper02_sour_water_h2s` declare none, say `feedQuality 1.0`, and resolve
//  two-phase -- 12.794585 kW and 17.480393 kW, 10.4 % and 13.6 % of exchanged
//  energy, the WHOLE of each plant's first-law residual.  A rule that read only
//  the declared field would have left both untouched and looked complete.
//
//  This function is the one home for the whole question, because the column has
//  TWO solver paths that each used to answer it for themselves -- the same
//  reason `makeDistillate` above exists.
//  MOVED, 2026-09-12 (the evaporator chest-steam slice).  The struct and the
//  three-route resolution below it are now
//  `flashState::StreamThermalState` / `resolveStreamThermalState` in
//  `unitOperations/flash/StreamEquilibrium.H`, beside the `twoPhaseSplit`
//  primitive they call -- because a SECOND unit needed exactly this sentence
//  (the evaporator, which never read its chest steam's phase at all) and two
//  copies of a rule about second homes is the joke this file has already paid
//  for.  The alias keeps this file's own vocabulary: a column's inlet is a
//  FEED, and the reader here should not have to translate.
using FeedThermalState = flashState::StreamThermalState;

FeedThermalState resolveFeedThermalState(const DictPtr&       feedDict,
                                         scalar               T,
                                         scalar               P,
                                         const sVector&       z,
                                         const ThermoPackage& thermo,
                                         const std::string&   unitName)
{
    const std::string sName =
        feedDict->lookupWordOrDefault("streamName", "the feed");
    const std::string locus =
        "distillationColumn '" + unitName + "' feed '" + sName + "'";
    FeedThermalState st = flashState::resolveStreamThermalState(
        feedDict, T, P, z, thermo, locus, "model");
    //  A SINGLE-PHASE FEED IS READ AS WHAT IT MEANS TOO (2026-10-05, DEV.md
    //  §4d D1, decided by Vítor in C35).  `resolveStreamThermalState` answers
    //  "is there a split to price"; on a converged single-phase answer it
    //  keeps the CARRIED vapour fraction, whose default is 0 -- so an unpinned
    //  authored feed that resolves single-phase VAPOUR reached the MESH as a
    //  saturated liquid (q = 1), the phasechange01 trap one unit over.  The
    //  single-phase reading is `resolvedInletVaporFraction`, the one home
    //  every other inlet reader went through in C33/C34; it returns the
    //  carried value for a PINNED feed (a declaration is never re-solved) and
    //  for a PRODUCED one (its producer's answer stands).
    if (!st.split)
    {
        const scalar vfMeant = flashState::resolvedInletVaporFraction(
            feedDict, T, P, z, thermo, locus);
        if (vfMeant != st.vf)
        {
            st.vf     = vfMeant;
            st.origin = "resolved single phase at its own (T, P, z)";
        }
    }
    return st;
}

//  Price a feed on the state that was RESOLVED for it, by the rule
//  `reporting/BalanceMath.H::streamH_elements` uses on the very same stream:
//  a two-phase split is priced at the equilibrium compositions (x, y), and
//  anything else on the state the stream carries.
//
//  WHY THE SPLIT MATTERS AND A VAPOUR FRACTION DOES NOT SUFFICE.
//  `ThermoPackage::H_stream_formation(T, P, vf, z)` returns
//  (1-vf)*H_liquid_formation(T, z) + vf*H_real(T, P, z) -- BOTH legs at the
//  OVERALL composition z.  That is a quality blend: exact for a pure fluid,
//  and for a mixture it is not the enthalpy of the two-phase state, whose
//  phases have different compositions.  Measured on `column01` with its feed
//  state corrected: the blend says 1785.050057 kW where the equilibrium says
//  1779.540826 kW, a 5.509232 kW phantom that would have been left behind by a
//  fix that corrected only the vapour fraction.
//
//  ONE HOME FOR A FEED'S ENTHALPY, read by the duty block AND by the full
//  MESH's stage energy rows (C169): the rows used to price a feed on
//  Hliquid / Hvapour while the duty priced the same feed here, so the
//  profile was solved against one feed enthalpy and the reboiler closed
//  against another.  On the sensible fallback the split is still priced at
//  its own phases (the old fallback priced every feed as a LIQUID at z,
//  vapour or not; no corpus column reached it with a vapour feed).
scalar feedEnthalpy(const FeedThermalState& st,
                    scalar                  F,
                    scalar                  T,
                    scalar                  P,
                    const sVector&          z,
                    const ThermoPackage&    thermo,
                    const ColumnEnthalpy&   h)
{
    if (h.formation)
    {
        if (st.split) return F * flashState::hOfState(*st.split, T, P, z, thermo);
        return F * thermo.H_stream_formation(T, P, st.vf, z);
    }
    if (st.split && !st.split->liquidLiquid && !st.split->threePhase)
    {
        const scalar b = st.split->V_over_F;
        return F * ((1.0 - b) * h.hL(st.split->x, T) + b * h.hV(st.split->y, T));
    }
    return F * h.hQuality(st.vf, z, T);
}

//  THE CMO FEED QUALITY IS THE ENTHALPIC q (DEV.md 4c C169 item 4; the C131
//  separations review's W4 and proposal P1, decided under C163).
//
//  WHAT WAS WRONG.  Both CMO models (Wang-Henke and `simultaneous`) took
//  q = 1 - vf.  A single-phase liquid has vf = 0, so q = 1 at ANY
//  temperature: column01 fed at 300 K published the same profile and the
//  same V_strip as at 364 K, to nine figures, while its reboiler plug rose by
//  the 260 kW of sensible heat the profile never saw -- a published traffic
//  that contradicted the published duty.  And the textbook q (1.29 there)
//  was REFUSED as a contradiction with the stream.
//
//  THE RULE.  Under constant molar overflow a feed's quality is the fraction
//  of a mole of it that joins the liquid on the feed stage:
//
//      q = (H_V,sat - H_F) / (H_V,sat - H_L,sat)
//
//  (Wankat ch. 4; Seader, Henley & Roper, the q-line), with H_F the feed's
//  enthalpy as the column prices it (`feedEnthalpy`), H_L,sat the feed's
//  composition as a saturated liquid at its bubble point and H_V,sat as a
//  saturated vapour at its dew point, all on the column's one surface
//  (`ColumnEnthalpy`).  q > 1 is a subcooled liquid, which condenses vapour
//  on the feed stage; q < 0 a superheated vapour, which evaporates liquid
//  there.  A component that cannot vaporise (K = 0) stays liquid in H_V,sat
//  and the dew point is its volatile part's.  A TWO-PHASE feed keeps
//  q = 1 - vf, its resolved liquid fraction -- the exact value at
//  saturation for a pure fluid and the one the CMO profile has always used.
//
//  WHEN IT CANNOT BE FORMED (a bubble or dew point that does not converge,
//  a feed with nothing volatile, a surface that cannot price a saturated
//  state) the column keeps 1 - vf and SAYS so, naming why -- never in
//  silence.
struct CmoFeedQuality
{
    scalar      q         = 1.0;
    bool        enthalpic = false;   //  q came from the enthalpies
    bool        fellBack  = false;   //  wanted the enthalpic q, could not form it
    scalar      Tbubble   = 0.0;
    scalar      Tdew      = 0.0;
    std::string why;                 //  the fall-back's reason
};

//  C235: THE FEED IS PRICED AT ITS OWN PRESSURE.  `Pfeed` is the stream's
//  pressure (H_F is the enthalpy of what arrives), `P` the column's: the
//  bubble and dew points are those of the stage the feed is let down onto, an
//  adiabatic flash, so the q-line compares H_F(Pfeed) with H_L,sat and H_V,sat
//  at the column's P.
CmoFeedQuality cmoFeedQuality(const FeedThermalState& st, scalar T,
                              scalar Pfeed, scalar P,
                              const sVector& z, const ThermoPackage& thermo,
                              const ColumnEnthalpy& h)
{
    CmoFeedQuality fq;
    fq.q = 1.0 - st.vf;
    if (st.split) return fq;                       // two-phase: its liquid fraction
    try
    {
        //  A SPECIATING FEED'S SATURATION POINTS ARE THE REACTIVE FLASH'S.
        //  Its bubble point on the apparent molecular K is not the
        //  equilibrium the column solves (the sour-water feed of column13
        //  read a bubble point BELOW its own 350 K and so q = 0.885 for a
        //  subcooled liquid) -- the same reason `makeDistillate` does not
        //  price a reactive distillate at its bubble point.  Kept at
        //  1 - vf, and said.
        if (thermo.hasReactiveEquilibrium())
            throw std::runtime_error("the package resolves reactive"
                " equilibrium, so this feed's bubble and dew points are the"
                " reactive flash's, which the column does not compute");
        const std::size_t n = z.size();
        bool okb = false;
        sVector yb;
        const scalar Tb = bubbleTWithItsVapour(thermo, z, P, T, 1.0e-12, &okb, &yb);
        const sVector Kb = thermo.Kvec(Tb, P, z, yb.empty() ? z : yb);
        scalar S = 0.0;
        for (std::size_t i = 0; i < n; ++i) S += Kb[i] * z[i];
        if (!okb || !(std::abs(S - 1.0) <= 1.0e-8))
            throw std::runtime_error("its bubble point did not converge");
        //  The volatile part (K > 0) and the part that stays liquid.
        sVector zV(n, 0.0), zN(n, 0.0);
        scalar sV = 0.0, sN = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (z[i] <= 0.0) continue;
            if (Kb[i] > 0.0) { zV[i] = z[i]; sV += z[i]; }
            else             { zN[i] = z[i]; sN += z[i]; }
        }
        if (!(sV > 0.0)) throw std::runtime_error("nothing in it is volatile");
        sVector zVn = zV;
        for (auto& v : zVn) v /= sV;
        const auto dew = DewPoint::compute(thermo, zVn, P, Tb);
        if (!dew.converged || !(dew.T >= Tb - 1.0e-6))
            throw std::runtime_error("its dew point did not converge");
        const scalar HF = feedEnthalpy(st, 1.0, T, Pfeed, z, thermo, h);
        const scalar HL = h.hL(z, Tb);
        scalar HV = h.hV(zV, dew.T);                 // extensive: sV mol of vapour
        if (sN > 0.0)
        {
            sVector zNn = zN;
            for (auto& v : zNn) v /= sN;
            HV += sN * h.hL(zNn, dew.T);             // what cannot vaporise, as liquid
        }
        if (!(HV - HL > 0.0))
            throw std::runtime_error("its saturated vapour is not above its"
                                     " saturated liquid on this surface");
        fq.q         = (HV - HF) / (HV - HL);
        fq.enthalpic = true;
        fq.Tbubble   = Tb;
        fq.Tdew      = dew.T;
    }
    catch (const std::exception& e)
    {
        fq.q        = 1.0 - st.vf;
        fq.fellBack = true;
        fq.why      = e.what();
    }
    return fq;
}

//  The words that say which q a feed got: the stream's resolved liquid
//  fraction, or its enthalpy.  One sentence for the refusals and the banner.
std::string feedQualityOrigin(const FeedThermalState& st, const CmoFeedQuality& fq)
{
    std::ostringstream os;
    os.setf(std::ios::fixed);
    if (fq.enthalpic)
        os << std::setprecision(2) << "the enthalpic q = (H_V,sat - H_F)/"
              "(H_V,sat - H_L,sat): saturated liquid at its bubble point "
           << fq.Tbubble << " K, saturated vapour at its dew point "
           << fq.Tdew << " K";
    else if (st.split)
        os << "its resolved liquid fraction, the feed being two-phase";
    else
        os << "1 - vf: the enthalpic q could not be formed (" << fq.why << ")";
    return os.str();
}

//  Said once per column feed per process: a q that is not 1 - vf, and a
//  fall-back to 1 - vf, are both facts the CMO profile is built on.
void announceFeedQuality(const std::string& unit, const std::string& feed,
                         const FeedThermalState& st, const CmoFeedQuality& fq,
                         scalar T, int verbosity)
{
    static std::mutex lock;
    static std::set<std::string> said;
    const scalar q0 = 1.0 - st.vf;
    const bool differs  = fq.enthalpic && std::abs(fq.q - q0) > 1.0e-4;
    if (!differs && !fq.fellBack) return;
    {
        std::lock_guard<std::mutex> g(lock);
        if (!said.insert(unit + "|" + feed).second) return;
    }
    std::ostringstream os;
    os.setf(std::ios::fixed);
    if (fq.fellBack)
    {
        os << "distillationColumn '" << unit << "' feed '" << feed << "': the"
              " CMO feed quality is 1 - vf = " << std::setprecision(4) << q0
           << " because the enthalpic q could not be formed (" << fq.why
           << "); a single-phase feed away from saturation is then treated as"
              " saturated by the CMO profile.";
        AdvisoryLog::instance().add("model", "warning",
                                    "distillationColumn feed quality", os.str());
        if (verbosity >= 1) std::cout << "  [column] " << os.str() << "\n";
        return;
    }
    if (verbosity < 1) return;
    std::cout << "  [column] " << unit << " feed '" << feed << "': CMO q = "
              << std::fixed << std::setprecision(4) << fq.q << " from its"
                 " enthalpy at " << std::setprecision(2) << T << " K, "
              << feedQualityOrigin(st, fq) << "; 1 - vf = "
              << std::setprecision(4) << q0 << ".  "
              << (fq.q > 1.0 ? "A subcooled liquid condenses vapour on the"
                               " feed stage: V' = V + (q - 1) F."
                             : fq.q < 0.0
                               ? "A superheated vapour evaporates liquid on"
                                 " the feed stage: L' = L + q F < L."
                               : "Under CMO, L' = L + q F, V' = V - (1 - q) F.")
              << std::defaultfloat << "\n";
}

//  The refusal.  A `feedQuality` that disagrees with the stream is not a
//  parameter the engine may prefer one way or the other: the case says two
//  things and only its author knows which is true.
//
//  The message names BOTH numbers and BOTH remedies with the values filled in,
//  deliberately.  Eleven shipped tutorials reached a converged answer through
//  this contradiction, so anyone holding a case of their own is likely to meet
//  this refusal cold -- and a refusal that states a rule without stating the
//  edit is the shape invariant I5 exists to stop.
void refuseContradictoryFeedQuality(const DictPtr&     operDict,
                                    const DictPtr&     feedDict,
                                    const FeedThermalState& st,
                                    const CmoFeedQuality&   fq,
                                    scalar             T,
                                    const std::string& unitName)
{
    if (!operDict->found("feedQuality")) return;

    //  THE q THE COLUMN USES (C169 item 4): the enthalpic q of a single-phase
    //  feed, the liquid fraction of a two-phase one.  Compared against 1 - vf
    //  this refusal called the textbook q of a subcooled feed a contradiction.
    const scalar qDecl = operDict->lookupScalar("feedQuality");
    const scalar qRes  = fq.q;
    if (std::abs(qDecl - qRes) <= 1.0e-3) return;

    const std::string sName =
        feedDict->lookupWordOrDefault("streamName", "the feed");
    std::ostringstream os;
    os.setf(std::ios::fixed);
    os << std::setprecision(6);
    os << "DistillationColumn '" << unitName << "': operation.feedQuality = "
       << qDecl << " contradicts the feed stream '" << sName << "', whose"
          " thermal state at T = " << T << " K is vapour fraction " << st.vf
       << " (" << st.origin << ")  =>  q = " << qRes << " ("
       << feedQualityOrigin(st, fq) << ").\n"
          "  A feed's thermal state lives in the STREAM, not in the column --"
          " so this case says two different things and the engine will not"
          " choose between them.  Pick the one that is TRUE of your feed:\n"
          "    * the stream is right  -> DELETE `feedQuality` from the unit's"
          " `operation {}` block; the column will use q = " << qRes << ".\n"
          "    * the dict is right    -> set the feed stream's state file so it"
          " says so: ";
    //  THE STREAM-SIDE REMEDY NAMES A LINE THE READER WILL ACCEPT (2026-10-03).
    //  It used to say `vaporFraction <1-q>;`, which on a mixture beside T and
    //  P is the over-specification the reader now refuses -- a remedy that
    //  creates the next refusal is advice that creates the bug.  A saturated
    //  liquid or vapour feed is the `phase` pin; a two-phase quality is the
    //  (T, P) that gives it, which this engine does not solve from q.
    const scalar vfDecl = 1.0 - qDecl;
    if (std::abs(qDecl - 1.0) <= 1.0e-9)
        os << "`phase liquid;` (a declared saturated-liquid feed, R-E2) at its"
              " bubble point -- q = 1 IS a saturated liquid; a colder one has"
              " q > 1";
    else if (std::abs(qDecl) <= 1.0e-9)
        os << "`phase gas;` (a declared vapour feed, R-E2) at its dew point --"
              " q = 0 IS a saturated vapour; a hotter one has q < 0";
    else if (qDecl > 1.0 || qDecl < 0.0)
        os << "a T at which its own enthalpy gives q = " << qDecl
           << " (q > 1 a subcooled liquid, q < 0 a superheated vapour; the"
              " engine does not solve T from a declared q)";
    else
        os << "a T and P at which its own equilibrium gives vapour fraction "
           << vfDecl << " (a mixture's (T, P) fix its split, so"
              " `vaporFraction` beside them is refused as over-specified; the"
              " engine does not solve T from a declared quality)";
    os << " -- at " << T << " K it is not so.\n"
          "  Deleting the key is the recommended fix: it leaves ONE home for"
          " the feed's thermal state and this contradiction cannot recur.";
    throw std::runtime_error(os.str());
}

} // anonymous namespace


namespace {

// Thomas algorithm: solves a tridiagonal system in-place.
//   A_j * x_{j-1} + B_j * x_j + C_j * x_{j+1} = D_j
// A_0 and C_{N-1} are ignored.  All vectors have size N.
sVector thomas(const sVector& A,
               const sVector& B,
               const sVector& C,
               sVector D)
{
    const std::size_t N = B.size();
    sVector C_(N, 0.0), D_(N, 0.0);
    C_[0] = C[0] / B[0];
    D_[0] = D[0] / B[0];
    for (std::size_t j = 1; j < N; ++j)
    {
        scalar denom = B[j] - A[j] * C_[j-1];
        C_[j] = (j+1 < N) ? C[j] / denom : 0.0;
        D_[j] = (D[j] - A[j] * D_[j-1]) / denom;
    }
    sVector x(N);
    x[N-1] = D_[N-1];
    for (std::size_t k = 1; k < N; ++k)
    {
        std::size_t j = N - 1 - k;
        x[j] = D_[j] - C_[j] * x[j+1];
    }
    return x;
}

// (bubble-T lives in src/thermo/SaturationCurves.H -- shared with the
//  T-x-y sweep that the GUI's Plots tab consumes.)

} // anonymous namespace

//  ---- THE INTERIOR THE CASE DECLARED, OR THE ONE THE UNIT INVENTS --------
//
//  Until 2026-09-06 this class seeded its own stage profile in code -- "initial
//  T-profile (linear between guesses)" -- and said nothing about it.  Every
//  other solver aid in Choupo is explicit in a dict and announced when it
//  binds (the 2026-05-30 rule); this one was neither, on the unit whose
//  interior a student is most likely to have an opinion about.  Both routes
//  now speak, and the declared one is a FILE the case owns:
//  `0/internalStates/<SECTOR>/<unit>` (its `stageProfile` block), in the very
//  grammar `converged/` writes.
//
//  A DECLARED PROFILE THAT DOES NOT SATISFY THE BALANCES IS A SEED, NOT AN
//  ANSWER.  Nothing here checks the profile against the column equations --
//  the iteration does that, and it moves off any profile that is wrong.  What
//  IS checked is that the declaration describes THIS column: the stage count,
//  the component set, and that every number is a number.
bool DistillationColumn::seedFromDeclaredInterior(std::size_t           N,
                                                  const ThermoPackage&  thermo,
                                                  sVector&              T,
                                                  std::vector<sVector>& x,
                                                  int                   verbosity,
                                                  const char*           methodName) const
{
    const UnitProfile* p = declaredInterior("stageProfile");
    if (!p)
    {
        if (verbosity >= 2)
            std::cout << "  [seed] interior seeded by the unit: linear T between"
                         " the guesses, feed composition on every stage ("
                      << methodName << ") -- declare a stageProfile block"
                         " in 0/internalStates/<SECTOR>/<unit> to own it\n";
        return false;
    }

    const std::size_t n = thermo.n();
    auto refuse = [&](const std::string& why) {
        throw std::runtime_error(
            "DistillationColumn: the stageProfile block declared in"
            " 0/internalStates/<SECTOR>/<unit> does not describe this column -- "
            + why + ".  A declared interior is read as this unit's starting"
              " state; it must carry `stage`, `T` and one `x_<component>`"
              " column per component of the case, all of length nStages."
              "  Re-copy the file from converged/internalStates/<SECTOR>/<unit>"
              " after a run of THIS case, or delete it and let the unit seed"
              " itself.");
    };

    if (p->xAxis != "stage")
        refuse("its xAxis is `" + p->xAxis + "`, not `stage`");

    auto column = [&](const std::string& name) -> const sVector& {
        auto it = p->columns.find(name);
        if (it == p->columns.end())
            refuse("it carries no `" + name + "` column");
        return it->second;
    };

    const sVector& stageCol = column("stage");
    if (stageCol.size() != N)
        refuse("it carries " + std::to_string(stageCol.size())
               + " stages and this column declares nStages "
               + std::to_string(N));

    const sVector& Tcol = column("T");
    if (Tcol.size() != N)
        refuse("its `T` column has " + std::to_string(Tcol.size())
               + " values for " + std::to_string(N) + " stages");

    //  THE COMPONENT SET IS THE CASE'S, both ways.  A missing component would
    //  seed a composition that is not a composition; an extra one is a profile
    //  written for a different case, and reading it silently would be name
    //  identity between two unrelated systems.
    std::vector<const sVector*> xcol(n, nullptr);
    for (std::size_t i = 0; i < n; ++i)
        xcol[i] = &column("x_" + thermo.comp(i).name());
    for (const auto& [cname, vals] : p->columns)
    {
        (void)vals;
        if (cname.rfind("x_", 0) != 0) continue;
        const std::string comp = cname.substr(2);
        bool known = false;
        for (std::size_t i = 0; i < n; ++i)
            if (thermo.comp(i).name() == comp) { known = true; break; }
        if (!known)
            refuse("it carries a column `" + cname + "` and this case has no"
                   " component `" + comp + "`");
    }
    for (std::size_t i = 0; i < n; ++i)
        if (xcol[i]->size() != N)
            refuse("its `x_" + thermo.comp(i).name() + "` column has "
                   + std::to_string(xcol[i]->size()) + " values for "
                   + std::to_string(N) + " stages");

    //  EVERY VALUE FINITE.  A `nan` in a state file is a fact about the run
    //  that produced it, and seeding an iteration with one guarantees a
    //  rank-deficient Jacobian that reads like a modelling failure.
    auto finite = [&](const sVector& v, const std::string& what) {
        for (std::size_t j = 0; j < v.size(); ++j)
            if (!std::isfinite(v[j]))
                refuse("its `" + what + "` column holds a non-finite value at"
                       " stage " + std::to_string(j + 1));
    };
    finite(Tcol, "T");
    for (std::size_t i = 0; i < n; ++i) finite(*xcol[i], "x_" + thermo.comp(i).name());

    //  NORMALISED, AND SAID WHEN IT MATTERED.  A hand-authored profile need
    //  not sum to one; the iteration normalises anyway.  Renormalising in
    //  silence would hide a declaration that is not a composition.
    scalar worst = 0.0;
    std::size_t worstStage = 0;
    for (std::size_t j = 0; j < N; ++j)
    {
        scalar s = 0.0;
        for (std::size_t i = 0; i < n; ++i) s += (*xcol[i])[j];
        if (s <= 0.0)
            refuse("the mole fractions at stage " + std::to_string(j + 1)
                   + " sum to " + std::to_string(s));
        if (std::abs(s - 1.0) > worst) { worst = std::abs(s - 1.0); worstStage = j + 1; }
        T[j] = Tcol[j];
        for (std::size_t i = 0; i < n; ++i) x[j][i] = (*xcol[i])[j] / s;
    }

    if (verbosity >= 2)
    {
        std::cout << "  [seed] interior read from 0/ (stageProfile): " << N
                  << " stages, T " << std::fixed << std::setprecision(2)
                  << T.front() << " .. " << T.back()
                  << " K (" << methodName << ") -- a declared profile is a SEED,"
                     " not an answer: the balances still decide\n"
                  << std::defaultfloat;
        if (worst > 1.0e-9)
            std::cout << "  [seed] the declared mole fractions do not sum to 1"
                         " (worst " << worst << " at stage " << worstStage
                      << ") -- normalised on read\n";
    }
    return true;
}

int DistillationColumn::solve(const DictPtr& dict,
                              const ThermoPackage& thermo,
                              int verbosity)
{
    auto operDict = dict->subDict("operation");

    // Model selector.  The variant goes in the `model` slot RIGHT AFTER
    // `type` (the project-wide convention: type = which unit, model =
    // which variant, operation = the values).  Default Wang-Henke;
    // `model simultaneous;` switches to the MESH Newton below.  Falls back
    // to the legacy `method` key inside operation for old cases.
    const std::string method = dict->lookupWordOrDefault(
        "model", operDict->lookupWordOrDefault("method", "WangHenke"));

    //  A BLOCK ONLY `totalReflux` READS IS REFUSED ELSEWHERE (RB-03, 2026-11-12).
    //  `efficiency { model AIChE|ChanFair|SyedaChuang; }` and `packing { ... }`
    //  are read by `model totalReflux;` and by nothing else.  On a Wang-Henke,
    //  simultaneous or recovery column they were ignored: the column ran on
    //  IDEAL stages at exit 0 and the only notice was one "[dict] key written
    //  and never read" line mid-log, absent from the caveat block -- a student
    //  who declared a computed efficiency received E_MV = 1.
    if (method != "totalReflux" && method != "rateBased")   // rateBased: RateBasedSegment.cpp
        for (const char* blk : {"efficiency", "packing"})
            if (operDict->found(blk))
                throw std::runtime_error("DistillationColumn '" + dict->name()
                    + "': `" + blk + " { ... }` is read ONLY by `model totalReflux;`" + (std::string(blk) == "packing" ? " and `model rateBased;`" : "")
                    + " (binary columns at total reflux, C329) and this column"
                      " runs `model " + method + ";`, which would ignore it and"
                      " solve on ideal stages.  Select `model totalReflux;` to"
                      " compute the "
                    + (std::string(blk) == "efficiency"
                           ? std::string("tray efficiency (`efficiency { model"
                                         " AIChE|ChanFair|SyedaChuang; }`)")
                           : std::string("packed-bed HETP and pressure drop"
                                         " (`packing { model RochaBravoFair|Delft; }`)"))
                    + ", or remove the block; for a fixed Murphree efficiency on"
                      " this column declare `murphreeEfficiency <E>;` where the"
                      " model reads it.");

    //  A recovery specification wraps whichever method is selected (DistillationColumn.H).
    if (method == "totalReflux") return solvePackedReadingRecord(dict, thermo, verbosity, false);
    if (method == "rateBased")   return solvePackedReadingRecord(dict, thermo, verbosity, true);
    if (operDict->found("distillateRecovery"))
        return solveForRecovery(dict, thermo, verbosity);

    if (method == "simultaneous" || method == "MESH"
        || method == "NaphtaliSandholm" || method == "fullMESH")
        return solveSimultaneous(dict, thermo, verbosity);

    //  THE ELSE IS NOT A CATCH-ALL (2026-09-07).  Everything below this point
    //  is Wang-Henke, so a word the chain above does not recognise used to
    //  select it silently: `model simultaneou;` ran the bubble-point sweep
    //  (79 outer iterations) where the author had asked for the MESH Newton
    //  (5), at exit 0, publishing a different KPI set and slightly different
    //  temperatures.  Refuse the word instead, naming what this slot takes.
    if (method != "WangHenke")
        throw std::runtime_error("DistillationColumn: "
            + registryRefusal::message("distillation column model", method,
                {"WangHenke", "simultaneous", "MESH", "NaphtaliSandholm",
                 "fullMESH", "totalReflux", "rateBased"}, "Accepted"));

    // Capability boundary, made LOUD (no silent crutch): multiple feeds and
    // side draws live only in the simultaneous MESH.  The Wang-Henke
    // tridiagonal sweep takes a single feed --- so REFUSE clearly here rather
    // than silently ignore a `feeds`/`sideDraws` block the user wrote.
    if (operDict->found("feeds") || operDict->found("sideDraws")
        || dict->found("reaction") || dict->found("inputStreams"))
        throw std::runtime_error("DistillationColumn: multiple feeds (`inputs (...)` / "
            "`feeds`), side draws, or reactive distillation require `model "
            "simultaneous;` --- the Wang-Henke method handles a single feed only.");

    // ---- Feed ----------------------------------------------------------
    auto feedDict = dict->subDict("feed");
    auto compDict = dict->subDict("composition");
    const scalar F  = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar Tf = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P  = operDict->lookupScalarOrDefault("P",
                          feedDict->lookupScalar("P", Dims::pressure),
                          Dims::pressure);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    // ---- Column spec ---------------------------------------------------
    const int    Nint     = static_cast<int>(operDict->lookupScalar("nStages"));
    const int    NFint    = static_cast<int>(operDict->lookupScalar("feedStage"));
    const std::size_t N   = static_cast<std::size_t>(Nint);
    const std::size_t NF  = static_cast<std::size_t>(NFint);   // 1-based
    const scalar R        = operDict->lookupScalar("refluxRatio");
    const scalar D        = operDict->lookupScalar("distillateRate", Dims::molarFlow);
    //  THE FEED'S THERMAL STATE COMES FROM THE STREAM (2026-09-12).  It used
    //  to be `operDict->lookupScalarOrDefault("feedQuality", 1.0)` -- a second
    //  home, defaulted, never reconciled.  See `resolveFeedThermalState` above
    //  for what that cost.  `feedQuality` is now a CROSS-CHECK only: present
    //  and agreeing, it is silent; present and disagreeing, it refuses.
    //  C235: a stream feed is resolved and priced at ITS pressure, not the
    //  column's (the letdown is the stage's adiabatic flash).
    const scalar Pfeed = feedDict->lookupScalarOrDefault("P", P, Dims::pressure);
    const FeedThermalState feedState =
        resolveFeedThermalState(feedDict, Tf, Pfeed, z, thermo, dict->name());
    //  The column's one enthalpy surface, and the CMO q read off it (C169).
    const ColumnEnthalpy hs = columnEnthalpySurface(thermo, P, {{Tf, z}});
    const CmoFeedQuality feedQ = cmoFeedQuality(feedState, Tf, Pfeed, P, z, thermo, hs);
    announceFeedQuality(dict->name(),
                        feedDict->lookupWordOrDefault("streamName", "the feed"),
                        feedState, feedQ, Tf, verbosity);
    refuseContradictoryFeedQuality(operDict, feedDict, feedState, feedQ, Tf,
                                   dict->name());
    const scalar q        = feedQ.q;

    // Strictly INSIDE the cascade: NF == N (feed onto the bottom stage)
    // walked the Wang-Henke arrays out of bounds and SEGFAULTED (found live
    // by the Front-4c integer enumeration probing nStages below the feed).
    // The guard now states what the algorithm actually supports, with the
    // remedy in the message -- never a crash.
    if (NFint < 1 || NFint >= Nint)
        throw std::runtime_error("DistillationColumn: feedStage ("
            + std::to_string(NFint) + ") must lie in 1.." + std::to_string(Nint - 1)
            + " (strictly above the bottom stage; nStages = "
            + std::to_string(Nint) + ").  Raise nStages or lower feedStage.");

    const CondenserType condenser = readCondenserType(operDict, dict->name(), verbosity);
    const bool partialCond = (condenser == CondenserType::partial);
    if (partialCond && NFint == 1)
        throw std::runtime_error("DistillationColumn '" + dict->name()
            + "': `feedStage 1` with `condenser { type partial; }` puts the feed"
            " INTO the partial condenser, which this column does not model (its"
            " duty would have to price the feed).  Feed stage 2, or declare a"
            " total condenser, under which stage 1 is the top tray.");

    const scalar B  = F - D;
    if (B <= 0.0)
        throw InfeasibleTrial("DistillationColumn: bottoms B = F - D <= 0 (infeasible trial)");

    //  SUBCOOLED REFLUX (`refluxTemperature`, total condenser).  A plant's
    //  condenser usually returns its reflux BELOW the bubble point.  The cold
    //  reflux is heated to saturation on the top tray by condensing vapour
    //  there, so the liquid that runs down the rectifying section is larger
    //  than the reflux that was pumped in:
    //
    //      L_internal = L_external (1 + phi)
    //      phi = [hL(x_D, T_bubble) - hL(x_D, T_reflux)]
    //            / [hV(x_D, T_1)     - hL(x_D, T_bubble)]
    //
    //  `refluxRatio` stays the EXTERNAL ratio (what a flow meter reads); the
    //  overhead vapour into the condenser stays (R + 1) D by the condenser's
    //  own balance.  With a total condenser y_1 = x_D, so the top tray's
    //  component balance is exact with the internal ratio.  phi needs the
    //  converged x_D and T_1, so the column is solved, phi is evaluated, and
    //  the column is solved again until phi stops moving (announced).
    const bool   hasRefluxT = operDict->found("refluxTemperature");
    const scalar T_reflux   = hasRefluxT
        ? operDict->lookupScalar("refluxTemperature", Dims::temperature) : 0.0;
    if (hasRefluxT && partialCond)
        throw std::runtime_error("DistillationColumn '" + dict->name()
            + "': `refluxTemperature` declares a subcooled reflux, which only a"
              " TOTAL condenser returns; a partial condenser is an equilibrium"
              " stage and its reflux leaves saturated.  Remove the key or"
              " declare `condenser total;`.");
    if (!hasRefluxT) { subcoolPhi_ = 0.0; subcoolPass_ = 0; }
    const scalar R_int = R * (1.0 + subcoolPhi_);

    const scalar Ll  = R_int * D;            // L above feed
    const scalar Vl  = (R_int + 1.0) * D;    // V above feed
    const scalar Lp  = Ll + q * F;       // L below feed (L')
    const scalar Vp  = Vl - (1.0 - q) * F;
    if (Vp <= 0.0)
        throw std::runtime_error(
            "DistillationColumn: vapour flow below feed is non-positive");
    if (Lp <= 0.0)
        throw std::runtime_error("DistillationColumn '" + dict->name()
            + "': the liquid flow below the feed is non-positive (L' = L + q F"
            " with q = " + std::to_string(q) + ", a superheated feed that"
            " evaporates more liquid than the reflux brings down).  Raise the"
            " reflux or feed the vapour lower.");

    // ---- Convergence config -------------------------------------------
    //  THE STOP IS DECIDED BY THE BALANCES, NOT BY THE STEP (2026-09-28,
    //  DEV.md §5 A7 item (5)).  Wang-Henke is successive substitution, not a
    //  Newton: each pass solves the stage balances EXACTLY at the previous
    //  pass's K, then normalises x and moves T to the bubble point, and the
    //  error contracts by a constant factor per pass (0.64 on column01, close
    //  to 1 on a close-boiling splitter).  It used to stop when max|dx|
    //  between passes fell under `compositionTol` -- a statement about the
    //  STEP -- and a slowly contracting column is still a long way from its
    //  fixed point when its step is small: the corpus published columns whose
    //  balances were open by 2.5e-8 of the feed (column01) and 8.6e-7
    //  (pareto01's representative pass) while saying "Converged: yes".
    //
    //  So the stop is the `solver/Convergence.H` rule applied by hand, the
    //  same one the MESH uses: normalise by the terms the equation balances.
    //  Summed over the stages a column's component balances telescope to
    //  feed = products, so each balance is measured as a fraction of the
    //  feed.  A pass is accepted only when, on the state it will PUBLISH,
    //    * every stage's component balance (y = K x, the published profile)
    //      closes to `balanceTol` of the feed,
    //    * the column's own balance over its ports (the published distillate
    //      and bottoms) closes to `balanceTol` of the feed,
    //    * every bubble point |Sum_i K_i x_i - 1| closes to `bubbleTol`,
    //    * and the step is under `compositionTol` -- a DECLARED control, so it
    //      is still honoured, now as one condition among four.
    //  1e-9 is the MESH's own number, so one fraction means the same on both
    //  column models.  The inner bubble-point Newton is solved to 1e-12,
    //  nested well under the outer test: at its old 1e-8 the bubble point
    //  stopped moving once the per-pass change in x put |Sum K x - 1| under
    //  1e-8 at the old T, and the balances stalled at ~4e-9 on column01.
    const int    maxOuter = static_cast<int>(dict->lookupScalarOrDefault("maxOuterIter", 200));
    const scalar tolX     = dict->lookupScalarOrDefault("compositionTol", 1.0e-6);
    constexpr scalar balanceTol     = 1.0e-9;   // a fraction of the feed
    constexpr scalar bubbleTol      = 1.0e-9;   // |Sum_i K_i x_i - 1| on every stage
    constexpr scalar bubbleSolveTol = 1.0e-12;  // the nested bubble-point Newton

    // ---- Initial T profile (linear) -----------------------------------
    // Heuristic: T_top ≈ Tf - 10, T_bot ≈ Tf + 10 (refined by bubble-point)
    sVector T(N);
    for (std::size_t j = 0; j < N; ++j)
    {
        scalar a = static_cast<scalar>(j) / static_cast<scalar>(N - 1);
        T[j] = (Tf - 5.0) + a * 20.0;
    }

    // ---- Initial x profile (linear in z) ------------------------------
    // For light/heavy intuition we use the same feed composition at all
    // stages; the iteration refines it.
    std::vector<sVector> x(N, z);

    //  ...unless the CASE declared the interior.  Both routes announce; the
    //  declared one replaces T and x wholesale and refuses a declaration that
    //  does not describe this column.
    seedFromDeclaredInterior(N, thermo, T, x, verbosity, "WangHenke");

    if (verbosity >= 2)
    {
        std::ostringstream m;                      // leave std::cout's format as found
        m << std::scientific << std::setprecision(1)
          << "  [solver] Wang-Henke: the stop is decided by the BALANCES, not"
             " the step -- every stage's component balance and the column's"
             " own balance over its ports close to " << balanceTol
          << " of the feed (" << std::setprecision(4) << F
          << " kmol/s), every bubble point |Sum K x - 1| to "
          << std::setprecision(1) << bubbleTol << ", and the composition step"
             " max|dx| is under compositionTol (" << tolX << ").  Successive"
             " substitution converges linearly, so a small step alone does"
             " not close a balance.\n";
        std::cout << m.str();
    }
    if (verbosity >= 3)
    {
        std::cout << "DistillationColumn  N=" << N
                  << "  feedStage=" << NF
                  << "  R=" << R << "  D=" << D
                  << "  B=" << B << "  q=" << q << "  P=" << (P * 1.0e-5) << " bar\n"
                  << "   Pass      max|Δx|      balance/F         T_top       T_bottom\n"
                  << "   ----    -----------   -----------    -----------    -----------\n";
    }

    // ---- MURPHREE TRAY EFFICIENCY (declared, never guessed) ------------
    //  Up to here every stage is an EQUILIBRIUM stage: the vapour leaving it is in
    //  equilibrium with the liquid leaving it.  No real tray achieves that -- the
    //  vapour spends a finite time in the froth.  Murphree measured the shortfall
    //  on the VAPOUR side:
    //
    //      y_j = E_MV . y*_j  +  (1 - E_MV) . y_{j+1},        y*_j = K_j x_j
    //
    //  i.e. the vapour leaving tray j travels a fraction E_MV of the way from what
    //  entered (y_{j+1}) to what equilibrium would give (y*_j).  E_MV = 1 is the
    //  ideal stage and every existing case keeps that default, byte for byte.
    //
    //  E_MV is a DECLARED number, like the orifice coefficient and the weep-point
    //  constant in the hydraulics: it comes from a correlation, a chart, or plant
    //  data, and it is the student's to own.  Choupo will not invent it.
    //
    //  With efficiency, `nStages` counts REAL TRAYS, not ideal stages -- which is
    //  what the hydraulics pass then sizes.  The condenser and the reboiler stay
    //  equilibrium devices (they are not trays).
    const scalar Emv = operDict->lookupScalarOrDefault("murphreeEfficiency", 1.0);
    if (Emv <= 0.0)
        throw std::runtime_error("DistillationColumn: murphreeEfficiency must be "
            "POSITIVE -- a tray that transfers nothing is not a tray");
    //  E_MV ABOVE 1 IS PHYSICAL, and refusing it was a modelling claim, not a
    //  guard.  The Murphree VAPOUR efficiency compares the vapour leaving a tray
    //  with equilibrium against that tray's OUTLET liquid.  On a large
    //  cross-flow tray the liquid is not well mixed: it enters rich and leaves
    //  lean, so the vapour has been in contact with liquid richer than the
    //  outlet, and E_MV > 1 follows without anything exceeding equilibrium
    //  anywhere.  Measured routinely on industrial trays -- Klemola & Ilme, IECR
    //  35 (1996) 4579 report 119.1 % on a 2.9 m i-butane/n-butane fractionator
    //  and cite Sakata & Yanagi (1979) measuring a little under 120 % on a
    //  1.2 m column.  The old bound (0, 1] would have refused that column's own
    //  measurement.
    //
    //  There is NO ceiling the engine can check from the declared inputs: the
    //  plug-flow limit depends on the point efficiency and on lambda = mV/L,
    //  neither of which a declared E_MV carries.  So this announces rather than
    //  bounds, and says which of the two it is doing.
    if (Emv > 1.0 && verbosity >= 1)
        std::cout << "  [column] Murphree vapour efficiency E_MV = " << Emv
                  << " EXCEEDS 1.  That is physical on a cross-flow tray whose"
                     " liquid is not well mixed (the vapour meets liquid richer"
                     " than the outlet), and is measured on industrial columns."
                     "  NOT CHECKED: the plug-flow ceiling, which needs the point"
                     " efficiency and mV/L -- neither is declared here.\n";
    if (Emv < 1.0 && verbosity >= 2)
        std::cout << "  Murphree vapour efficiency E_MV = " << Emv
                  << "  -- the " << (N - 1) << " trays are REAL trays, not ideal stages\n";

    int outerIt = 0;
    scalar maxDx = 0.0;
    bool   converged = false;

    //  y from the PREVIOUS outer pass.  The Murphree relation couples tray j to the
    //  vapour rising from j+1, which would destroy the tridiagonal structure if it
    //  were an unknown.  Lag it one pass: the linear solve keeps its shape, and at
    //  convergence y^old == y, so the converged profile satisfies Murphree EXACTLY.
    //  Honest, and visible: the outer loop is what pays for it.
    std::vector<sVector> yPrev(N, sVector(n, 0.0));
    bool haveY = false;
    std::vector<sVector> Keff(N, sVector(n, 1.0));
    //  THE STAGES' EQUILIBRIUM K AT THEIR OWN VAPOURS (C169 item 2), kept out
    //  of the loop so the published profile reads the K the stop was taken
    //  on.  `yVap` is each stage's incipient vapour from the previous pass:
    //  the warm seed of the next K, and the vapour the bubble-point update
    //  prices phi at (lagged one pass -- at a fixed point it is the vapour).
    const bool nonIdealVapour = vapourFugacityDependsOnY(thermo);
    std::vector<sVector> Kst(N, sVector(n, 1.0));
    std::vector<sVector> yVap;
    bool vapourConverged = true;

    //  THE RESIDUALS OF THE STATE THE COLUMN WOULD PUBLISH, as fractions of
    //  the feed (see the convergence config above).  The CMO traffic of the
    //  tridiagonal below: stage j (0-based) sends L_j down and V_j up, with the
    //  feed stage's liquid already L' and its vapour still V; the top stage
    //  sends D overhead (the total condenser returns the reflux), the reboiler
    //  sends B out.  y_j = Keff_j x_j is the vapour the profile publishes, and
    //  the distillate is y_1 normalised -- exactly what the report below
    //  writes -- so the port residual is the closure a reader recomputes from
    //  the result.
    const std::size_t jFeed = NF - 1;
    auto Lstage = [&](std::size_t j) { return (j < jFeed)  ? Ll : Lp; };
    auto Vstage = [&](std::size_t j) { return (j <= jFeed) ? Vl : Vp; };
    scalar resStage = 0.0, resPort = 0.0, resBubble = 0.0;
    auto residuals = [&](const std::vector<sVector>& Keq, const std::vector<sVector>& Kpub)
    {
        resStage = resPort = resBubble = 0.0;
        std::vector<sVector> y(N, sVector(n, 0.0));
        for (std::size_t j = 0; j < N; ++j)
        {
            scalar s = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                y[j][i] = Kpub[j][i] * x[j][i];
                s      += Keq[j][i]  * x[j][i];
            }
            resBubble = std::max(resBubble, std::abs(s - 1.0));
        }
        sVector yD = y[0];
        {
            scalar s = 0.0;
            for (auto v : yD) s += v;
            if (s > 0.0) for (auto& v : yD) v /= s;
        }
        for (std::size_t i = 0; i < n; ++i)
        {
            for (std::size_t j = 0; j < N; ++j)
            {
                scalar in = (j == jFeed) ? F * z[i] : 0.0;
                if (j > 0)     in += Lstage(j-1) * x[j-1][i];
                if (j + 1 < N) in += Vstage(j+1) * y[j+1][i];
                const scalar out = ((j + 1 < N) ? Lstage(j) : B) * x[j][i]
                                 + ((j == 0)     ? D : Vstage(j)) * y[j][i];
                resStage = std::max(resStage, std::abs(in - out) / F);
            }
            resPort = std::max(resPort,
                               std::abs(F * z[i] - D * yD[i] - B * x[N-1][i]) / F);
        }
    };

    for (outerIt = 0; ; ++outerIt)
    {
        // 1. K-matrix at current (T, x), each stage's at its own vapour
        std::vector<sVector>& K = Kst;
        vapourConverged = true;
        for (std::size_t j = 0; j < N; ++j)
        {
            bool okj = true;
            K[j] = stageVapourK(thermo, T[j], P, x[j],
                                yVap.empty() ? nullptr : &yVap[j], &okj);
            vapourConverged = vapourConverged && okj;
        }
        if (nonIdealVapour)
        {
            yVap.resize(N);
            for (std::size_t j = 0; j < N; ++j) yVap[j] = normalisedVapour(K[j], x[j]);
        }

        // 1b. Fold the tray efficiency into an EFFECTIVE K, so that y_j = Keff_j x_j
        //     carries the Murphree relation without changing a single equation below.
        Keff = K;
        if (Emv != 1.0)
            //  The reboiler is not a tray, and neither is a PARTIAL condenser:
            //  both are equilibrium stages by definition, so E_MV = 1 there.
            for (std::size_t j = partialCond ? 1 : 0; j + 1 < N; ++j)
                for (std::size_t i = 0; i < n; ++i)
                {
                    const scalar xj = x[j][i];
                    if (xj <= 1.0e-12) continue;           // absent component: y ~ 0 either way
                    const scalar yDown = haveY ? yPrev[j+1][i] : K[j+1][i] * x[j+1][i];
                    Keff[j][i] = std::max(0.0, Emv * K[j][i] + (1.0 - Emv) * yDown / xj);
                }

        // 1c. The stop, taken on the state the previous pass left (the one the
        //     report will publish if we stop here), never on the step alone.
        residuals(K, Keff);
        if (outerIt > 0)
        {
            const scalar balance = std::max(resStage, resPort);
            recordResidual(balance);                 // feed-normalised, like the MESH's
            converged = balance   <= balanceTol
                     && resBubble <= bubbleTol
                     && maxDx     <  tolX;
            if (verbosity >= 3 && (outerIt < 7 || outerIt % 5 == 0 || converged))
                std::cout << "   " << std::setw(4) << outerIt
                          << "    " << std::scientific << std::setprecision(3)
                          << std::setw(11) << maxDx
                          << "   " << std::setw(11) << balance
                          << "    " << std::fixed << std::setprecision(2)
                          << std::setw(11) << T[0]
                          << "    " << std::setw(11) << T[N-1] << "\n";
            if (converged) break;
        }
        if (outerIt >= maxOuter) break;

        // 2. Solve tridiagonal per component i
        std::vector<sVector> x_new(N, sVector(n, 0.0));
        for (std::size_t i = 0; i < n; ++i)
        {
            sVector A(N, 0.0), Bv(N, 0.0), C(N, 0.0), Dv(N, 0.0);
            // Stage 1 (top): A=0, B = L + D*K_1, C = -V*K_2
            Bv[0] =  Ll + D * Keff[0][i];
            C[0]  = -Vl * Keff[1][i];
            // Stages 2..NF-1 above feed
            for (std::size_t j = 1; j + 1 < NF; ++j)
            {
                A[j]  = -Ll;
                Bv[j] =  Ll + Vl * Keff[j][i];
                C[j]  = -Vl * Keff[j+1][i];
            }
            // Feed stage (NF, 1-based → index NF-1)
            std::size_t jf = NF - 1;
            if (jf > 0)
            {
                A[jf]  = -Ll;
                Bv[jf] =  Lp + Vl * Keff[jf][i];
                C[jf]  = -Vp * Keff[jf+1][i];
                Dv[jf] =  F * z[i];
            }
            else
            {
                // Feed is at stage 1 — treat similarly to top with feed term.
                Bv[0] = Lp + D * Keff[0][i];
                Dv[0] = F * z[i];
                C[0]  = -Vp * Keff[1][i];
            }
            // Stages NF+1.. N-1 below feed
            for (std::size_t j = jf + 1; j + 1 < N; ++j)
            {
                A[j]  = -Lp;
                Bv[j] =  Lp + Vp * Keff[j][i];
                C[j]  = -Vp * Keff[j+1][i];
            }
            // Stage N (reboiler): A = -L', B = V*K_N + B
            A[N-1]  = -Lp;
            Bv[N-1] =  Vp * Keff[N-1][i] + B;

            sVector xi = thomas(A, Bv, C, Dv);
            for (std::size_t j = 0; j < N; ++j) x_new[j][i] = std::max(xi[j], 0.0);
        }

        // 3. Normalise x at each stage
        for (std::size_t j = 0; j < N; ++j)
        {
            scalar s = 0.0;
            for (auto v : x_new[j]) s += v;
            if (s > 0.0) for (auto& v : x_new[j]) v /= s;
        }

        // 3b. The vapour this pass actually produced -- the lag term for the next.
        if (Emv != 1.0)
        {
            for (std::size_t j = 0; j < N; ++j)
            {
                scalar sy = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                { yPrev[j][i] = Keff[j][i] * x_new[j][i]; sy += yPrev[j][i]; }
                if (sy > 0.0) for (auto& v : yPrev[j]) v /= sy;
            }
            haveY = true;
        }

        // 4. Update T at each stage via bubble-point
        for (std::size_t j = 0; j < N; ++j)
            T[j] = bubbleT(thermo, x_new[j], P, T[j], bubbleSolveTol,
                           nonIdealVapour ? &yVap[j] : nullptr);

        // 5. Convergence
        maxDx = 0.0;
        for (std::size_t j = 0; j < N; ++j)
            for (std::size_t i = 0; i < n; ++i)
                maxDx = std::max(maxDx, std::abs(x_new[j][i] - x[j][i]));

        x = x_new;
    }

    // ---- Distillate composition: x_D = y_1, the vapour leaving the TOP TRAY.
    //  With E_MV < 1 that is Keff_1 x_1, not the equilibrium K_1 x_1: a real top
    //  tray hands the condenser a vapour it never fully equilibrated with.
    if (!vapourConverged) announceUnconvergedVapour(dict->name());
    auto K1 = (Emv != 1.0) ? Keff[0] : Kst[0];
    sVector xD(n);
    for (std::size_t i = 0; i < n; ++i) xD[i] = K1[i] * x[0][i];
    {
        scalar s = 0.0; for (auto v : xD) s += v;
        if (s > 0.0) for (auto& v : xD) v /= s;
    }

    // ---- Stage profile (consumed by the GUI's profile plot) -----------
    //  xAxis: 1-indexed stage number, matching the printed table.
    //  Columns: T, x_<comp>, y_<comp>.  y is the equilibrium vapour
    //  composition at the stage's (T, x), i.e. y_{j,i} = K_{j,i} x_{j,i}
    //  after a per-stage K solve.
    profile_ = UnitProfile{};
    profile_.xAxis = "stage";
    profile_.columns["stage"].reserve(N);
    profile_.columns["T"].reserve(N);
    for (std::size_t i = 0; i < n; ++i)
    {
        profile_.columns["x_" + thermo.comp(i).name()].reserve(N);
        profile_.columns["y_" + thermo.comp(i).name()].reserve(N);
    }
    for (std::size_t j = 0; j < N; ++j)
    {
        const auto Kj = (Emv != 1.0) ? Keff[j] : Kst[j];
        profile_.columns["stage"].push_back(static_cast<scalar>(j + 1));
        profile_.columns["T"].push_back(T[j]);
        for (std::size_t i = 0; i < n; ++i)
        {
            profile_.columns["x_" + thermo.comp(i).name()].push_back(x[j][i]);
            profile_.columns["y_" + thermo.comp(i).name()].push_back(Kj[i] * x[j][i]);
        }
    }
    profile_.markers.push_back({static_cast<scalar>(NF), "feed"});

    // ---- Report --------------------------------------------------------
    std::cout << "\n========================  DistillationColumn  =====================\n"
              << "  Converged:     " << (converged ? "yes" : "NO") << "\n"
              << "  Outer iter.:   " << outerIt << "\n"
              << "  Final max|Δx|: " << std::scientific << std::setprecision(3)
              << maxDx << "   (compositionTol " << tolX << ")\n"
              << "  Stage balance: " << resStage << "   of the feed (tolerance "
              << balanceTol << ")\n"
              << "  Port balance:  " << resPort << "   of the feed (tolerance "
              << balanceTol << ")\n"
              << "  Bubble point:  " << resBubble << "   |Sum K x - 1| (tolerance "
              << bubbleTol << ")\n\n"
              << "  Stage-by-stage profile  (T, x_i):\n"
              << "    stage      T [K]      ";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "x(" << thermo.comp(i).name() << ")  ";
    std::cout << "\n";
    for (std::size_t j = 0; j < N; ++j)
    {
        std::cout << "    " << std::setw(4) << (j+1) << "    "
                  << std::fixed << std::setprecision(2)
                  << std::setw(8) << T[j] << "   ";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << " " << std::setw(7) << std::setprecision(5)
                      << x[j][i];
        if (j+1 == NF) std::cout << "  ← feed";
        if (j+1 == 1)  std::cout << "  (top)";
        if (j+1 == N)  std::cout << "  (reboiler)";
        std::cout << "\n";
    }
    std::cout << "\n  Products:\n"
              << "    Distillate  D = " << std::fixed << std::setprecision(4)
              << (D * 3600.0) << " kmol/h  T = " << T[0] << " K\n"
              << "      x_D = ";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << thermo.comp(i).name() << "=" << std::setprecision(5)
                  << xD[i] << "  ";
    std::cout << "\n    Bottoms     B = " << (B * 3600.0) << " kmol/h  T = "
              << T[N-1] << " K\n"
              << "      x_B = ";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << thermo.comp(i).name() << "=" << x[N-1][i] << "  ";
    std::cout << "\n=====================================================================\n\n";

    // ---- Produced streams (order: distillate, bottoms) ----------------
    produced_.clear();
    ProcessStream dStream = makeDistillate(thermo, xD, D, P, T[0], condenser);
    scalar subcooling_K = 0.0;
    if (hasRefluxT)
    {
        const scalar T_bub = dStream.T;
        if (!dStream.phasePinned)
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': `refluxTemperature` needs the distillate's bubble point,"
                  " and it was not solved for this package (see the"
                  " [distillate] announcement).  Remove the key.");
        if (T_reflux > T_bub)
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': refluxTemperature " + std::to_string(T_reflux)
                + " K is ABOVE the distillate's bubble point "
                + std::to_string(T_bub) + " K at the column pressure; a total"
                  " condenser cannot return a liquid hotter than that.");
        const scalar sensible = hs.hL(xD, T_bub) - hs.hL(xD, T_reflux);
        const scalar latent   = hs.hV(xD, T[0])  - hs.hL(xD, T_bub);
        const scalar phiNew   = sensible / latent;
        if (std::abs(phiNew - subcoolPhi_) > 1.0e-7 && subcoolPass_ < 12)
        {
            std::cout << "  [subcooled reflux] pass " << (subcoolPass_ + 1)
                      << ": reflux " << (T_bub - T_reflux) << " K below its"
                         " bubble point; internal/external reflux = 1 + phi, phi "
                      << subcoolPhi_ << " -> " << phiNew
                      << "; solving the column again on that traffic.\n";
            subcoolPhi_ = phiNew;
            ++subcoolPass_;
            return solve(dict, thermo, verbosity);
        }
        if (std::abs(phiNew - subcoolPhi_) > 1.0e-7)
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': the subcooled-reflux traffic did not settle in 12 passes.");
        subcoolPass_ = 0;
        subcooling_K = T_bub - T_reflux;
        //  The reflux and the distillate leave the same drum: the distillate
        //  is that subcooled liquid too, and the condenser removes its
        //  sensible heat as well.
        dStream.T = T_reflux;
    }
    produced_.push_back(dStream);

    ProcessStream bStream;
    bStream.name = "bottoms";
    bStream.F    = B;
    bStream.T    = T[N-1];
    bStream.P    = P;
    bStream.z    = x[N-1];
    bStream.vf   = 0.0;
    //  The reboiler is an EQUILIBRIUM STAGE, so its liquid leaves at that
    //  stage's own bubble point -- a declaration, for the same reason the
    //  distillate's is one.  See `makeDistillate`.
    bStream.phasePinned = true;
    produced_.push_back(bStream);

    // ---- KPIs --------------------------------------------------------
    kpis_.clear();
    kpis_["nStages"]    = static_cast<scalar>(N);
    kpis_["feedStage"]  = static_cast<scalar>(NF);
    kpis_["R"]          = R;
    kpis_["D"]          = D;
    if (hasRefluxT)
    {
        kpis_["R_internal"]          = R_int;
        kpis_["refluxSubcooling_K"]  = subcooling_K;
    }
    kpis_["B"]          = B;
    kpis_["T_top"]      = T[0];
    kpis_["T_bottom"]   = T[N-1];
    kpis_["V_rect"]     = Vl;       // vapour flow in rectifying section
    kpis_["L_rect"]     = Ll;
    kpis_["V_strip"]    = Vp;       // vapour flow at reboiler ~ Q_reboiler proxy
    kpis_["L_strip"]    = Lp;
    // Light-key purity in distillate, heavy-key purity in bottoms
    // (component 0 = light by convention for binary feed)
    kpis_["x_D_LK"]     = xD[0];
    kpis_["x_B_HK"]     = (n > 1) ? x[N-1][n - 1] : 0.0;
    kpis_["iterations"] = static_cast<scalar>(outerIt);
    //  Published whenever the trays are REAL, on either side of 1 -- the guard
    //  used to read `< 1.0`, so a column carrying a measured E_MV above unity
    //  would have hidden the very number that defines its run.  Exactly 1 stays
    //  silent: that is the ideal-stage default, and an absent key means it.
    if (Emv != 1.0) kpis_["murphreeEfficiency"] = Emv;

    // Energy items [kW].  Q_condenser is the condenser's own duty
    // (`condenserDuty`; its type decides which envelope); Q_reboiler then
    // CLOSES the column energy balance, Q_reb = dH_streams - Q_cond, so the
    // two reconcile with the stream enthalpy change (this is how a column
    // duty is reported).  Signed as energy added to the process: condenser
    // negative (removed), reboiler positive (supplied).  Every term is on the
    // surface the streams are priced on (`ColumnEnthalpy`, C169): the
    // condenser used to be on Hliquid / Hvapour while the plug beside it was
    // on the formation datum, so the SPLIT between the two duties was wrong
    // by 0.15-347 kW across the corpus although their sum was right.
    {
        CondenserTop top;
        top.D = D;  top.yD = xD;  top.T1 = T[0];
        top.Tcond = dStream.T;                  // the condensate's bubble point
        top.Vtop  = (R + 1.0) * D;              // overhead vapour [kmol/s]
        const scalar Hdist = distillateEnthalpy(dStream, hs, thermo);
        if (!partialCond && !dStream.phasePinned)
        {
            top.distillateCarried = true;
            top.Hdist = Hdist;
        }
        if (partialCond)
        {
            top.Vin = Vl;                       // NF >= 2 under a partial condenser
            top.y2  = normalisedVapour((Emv != 1.0) ? Keff[1] : Kst[1], x[1]);
            top.T2  = T[1];
            top.L1  = Ll;
            top.x1  = x[0];
        }
        //  ONE SURFACE (C169): the condenser, the products and the feed are
        //  priced by `columnEnthalpySurface`, the formation datum the streams
        //  carry, or the announced sensible fallback when a species has none.
        const scalar Q_cond = condenserDuty(hs, condenser, top);
        auto H = [&](scalar Fx, scalar Tx, scalar vfx, const sVector& zx) {
            return Fx * hs.hQuality(vfx, zx, Tx);
        };
        //  THE DUTY PRICES THE STATES THE STREAMS CARRY (2026-09-12).
        //  Two of these three terms used to price a state this unit does not
        //  publish:
        //    * the DISTILLATE was priced at the top tray's T[0] while
        //      `makeDistillate` publishes it at its own BUBBLE POINT -- a
        //      correction applied to the stream and not to the duty
        //      (1.095541 kW on column01, and live on every non-reactive
        //      column in the corpus);
        //    * the FEED was priced at `1 - feedQuality` on a quality blend --
        //      see `resolveFeedThermalState` and `feedEnthalpy` above.
        //  `dStream` is built above, so its temperature is the one this
        //  column actually hands downstream.  Nobody recomputes it here: a
        //  second bubble point would be a second home for the same answer.
        const scalar dH = (Hdist + H(B, T[N-1], 0.0, x[N-1]))
                        -  feedEnthalpy(feedState, F, Tf, Pfeed, z, thermo, hs);
        kpis_["Q_condenser_kW"] = Q_cond;
        kpis_["Q_reboiler_kW"]  = dH - Q_cond;                          // closes the balance

        //  THE PLUG IS NOT EVIDENCE (C174): publish the reboiler's own
        //  envelope on the CMO traffic beside it -- see `reboilerClosure`.
        //  Wang-Henke never puts the feed on the reboiler (NF < N, refused
        //  above), so the envelope is the boil-up and the bottoms against the
        //  stripping liquid from stage N-1.
        std::optional<scalar> Q_own;
        scalar terms = 0.0;
        if (N >= 2)
        {
            const sVector yN = normalisedVapour((Emv != 1.0) ? Keff[N-1] : Kst[N-1],
                                                x[N-1]);
            const scalar hVN = Vp * hs.hV(yN, T[N-1]);
            const scalar hBN = B  * hs.hL(x[N-1], T[N-1]);
            const scalar hLN = Lp * hs.hL(x[N-2], T[N-2]);
            Q_own = hVN + hBN - hLN;
            terms = std::abs(hVN) + std::abs(hBN) + std::abs(hLN);
        }
        closures_.clear();
        closures_.push_back(reboilerClosure(dH - Q_cond, Q_own,
                                            /*fullMesh=*/false, terms,
                                            "a column of fewer than two stages"));
        if (Q_own) kpis_["Q_reboiler_ownEnvelope_kW"] = *Q_own;
    }

    // ---- Optional sieve-tray hydraulics ------------------------------
    //  Under CMO the traffic is constant within each section, so V and L are
    //  section step-functions.  Stage N-1 is the reboiler; a TOTAL condenser
    //  is external to the stage list, so every stage above the reboiler is a
    //  tray -- and a PARTIAL condenser is stage 1, which is not.
    {
        std::vector<scalar> Vs(N, 0.0), Ls(N, 0.0);
        std::vector<sVector> yAll(N, sVector(n, 0.0));
        for (std::size_t j = 0; j < N; ++j)
        {
            const bool rect = (j + 1 < static_cast<std::size_t>(NFint));
            Vs[j] = rect ? Vl : Vp;
            Ls[j] = rect ? Ll : Lp;
            const auto Kj = (Emv != 1.0) ? Keff[j] : Kst[j];
            scalar sy = 0.0;
            for (std::size_t i = 0; i < n; ++i) { yAll[j][i] = Kj[i] * x[j][i]; sy += yAll[j][i]; }
            if (sy > 0.0) for (auto& v : yAll[j]) v /= sy;
        }
        Vs[N-1] = 0.0;                    // the reboiler is not a tray
        if (partialCond) Vs[0] = 0.0;     // nor is a partial condenser (stage 1)
        hydraulicsPass(operDict, dict->name(), thermo, P, T, x, yAll, Vs, Ls, NF, verbosity);
    }

    return converged ? 0 : 1;
}

// ===========================================================================
//   Rigorous simultaneous-correction method (MESH Newton).
//
//   Variables, per stage j:  x_{j,0..n-2}  (the last fraction by Σx=1)
//                            and T_j.   ->  N·n unknowns.
//   Equations, per stage j:  n-1 component balances M_{j,i} (same CMO
//   coefficients as Wang-Henke, but with K_j(T_j) live) + the bubble-
//   point Σ_i K_{j,i} x_{j,i} − 1 = 0 that fixes T_j.   ->  N·n residuals.
//
//   Solved by solver::newtonND (finite-difference Jacobian, dense Gauss,
//   Armijo backtracking).  This is the SIMULTANEOUS Newton on the MESH
//   set --- the part that converges azeotropes; the Naphtali-Sandholm
//   block-tridiagonal Jacobian is an efficiency refinement left for later.
// ===========================================================================
// ---------------------------------------------------------------------------
//  DISTILLATE BY RECOVERY -- an announced outer secant on the rate.
// ---------------------------------------------------------------------------
int DistillationColumn::solveForRecovery(const DictPtr& dict,
                                         const ThermoPackage& thermo,
                                         int verbosity)
{
    auto operDict = dict->subDict("operation");
    auto specDict = operDict->subDict("distillateRecovery");

    //  ---- DOF guard.  Exactly one distillate specification ---------------
    if (operDict->found("distillateRate"))
        throw std::runtime_error("DistillationColumn: `distillateRate` AND "
            "`distillateRecovery` are BOTH declared, and they specify the same "
            "degree of freedom -- the column cannot honour two.  Keep the rate "
            "for a fixed-duty column, or the recovery for one whose feed moves "
            "(a column inside a recycle); delete the other.");

    const std::string comp = specDict->lookupWord("component");
    const scalar target    = specDict->lookupScalar("fraction");
    if (target <= 0.0 || target >= 1.0)
        throw std::runtime_error("DistillationColumn: distillateRecovery "
            "`fraction` must be strictly between 0 and 1 (got "
            + std::to_string(target) + ").  A recovery of 1 asks for a perfect "
            "separation, which no finite column performs and which no rate can "
            "deliver.");

    const std::size_t ic = thermo.indexOf(comp);

    //  ---- READ THE COLUMN'S OWN KEYS, ON THE CASE'S OWN DICT ---------------
    //  Not decoration, and not only for the announcement.  Every inner
    //  evaluation below runs on a `deepCopy`, so without this the case's
    //  operation block is never touched by the run at all -- and
    //  `check_unread_keys` reported exactly that: nStages, refluxRatio,
    //  feedStage, P and feedQuality all DEAD on the acetone plant's C1.  They
    //  were being read, on a copy; from outside, a column whose geometry a
    //  typo had silently dropped would look identical.
    //
    //  So they are read HERE, where the case declares them, and they buy two
    //  real things: the geometry is validated BEFORE the search spends dozens
    //  of full MESH solves on a column that cannot run, and the announcement
    //  says which column is being searched.
    const int nSt = static_cast<int>(operDict->lookupScalar("nStages"));
    const int nFd = static_cast<int>(operDict->lookupScalar("feedStage"));
    const scalar RR = operDict->lookupScalar("refluxRatio");
    const scalar Pc = operDict->lookupScalarOrDefault("P", 0.0, Dims::pressure);
    //  The condenser type too: read (and refused, if misspelled) here on the
    //  case's own dict, for the same reason as the geometry above.
    (void)readCondenserType(operDict, dict->name(), verbosity);
    if (nFd < 2 || nFd > nSt)
        throw std::runtime_error("DistillationColumn: feedStage " +
            std::to_string(nFd) + " is outside 2.." + std::to_string(nSt) +
            " -- refused BEFORE the recovery search, which would otherwise "
            "have spent dozens of column solves discovering it.");

    //  ---- The component's FEED flow, which is what a recovery is OF ------
    //  Single feed only, and the refusal says so rather than summing an
    //  arbitrary subset: with several feeds "the recovery" needs to name
    //  which of them it is referenced to, and that is a grammar decision
    //  nobody has taken.
    if (dict->found("inputStreams") || operDict->found("feeds"))
        throw std::runtime_error("DistillationColumn: `distillateRecovery` is "
            "implemented for a SINGLE-feed column only.  With several feeds a "
            "recovery must state which feed it is referenced to, and that is "
            "not declarable today -- use `distillateRate` here, or merge the "
            "feeds upstream with a mixer.");

    auto feedDict = dict->subDict("feed");
    auto compDict = dict->subDict("composition");
    const scalar Ff = feedDict->lookupScalar("F", Dims::molarFlow);
    scalar zsum = 0.0, zc = 0.0;
    for (const auto& key : compDict->keys())
    {
        const scalar v = compDict->lookupScalar(key);
        zsum += v;
        if (thermo.indexOf(key) == ic) zc = v;
    }
    //  ---- THE FEED'S THERMAL STATE, on the CASE'S OWN DICT ---------------
    //  `feedQuality` used to be read a few lines above with a default, purely
    //  so `check_unread_keys` would see the key touched (the inner solves all
    //  run on a `deepCopy`).  After 2026-09-12 the column does not compute
    //  with that number at all -- and the recovery banner went on PRINTING it
    //  as "q = ...", which is a banner describing a model that is not running:
    //  the same defect the speciation banner was caught in on 2026-08-04.
    //
    //  So the state is RESOLVED here, from this case's own feed, and the
    //  banner prints THAT.  Cross-checking here as well as inside each inner
    //  solve is not a second home for the rule -- it is the same function,
    //  called where the case's own dict lives, so a contradiction is refused
    //  once and up front instead of dozens of MESH solves later.
    sVector zFeed(thermo.n(), 0.0);
    for (const auto& key : compDict->keys())
        zFeed[thermo.indexOf(key)] = compDict->lookupScalar(key);
    if (zsum > 0.0) for (auto& v : zFeed) v /= zsum;
    const scalar Tf0 = feedDict->lookupScalar("T", Dims::temperature);
    const scalar Pfeed0 = feedDict->lookupScalar("P", Dims::pressure);
    const scalar Pf0 = (Pc > 0.0) ? Pc : Pfeed0;   // the column's pressure
    const FeedThermalState recoveryFeed =
        resolveFeedThermalState(feedDict, Tf0, Pfeed0, zFeed, thermo, dict->name());
    const ColumnEnthalpy recoveryH =
        columnEnthalpySurface(thermo, Pf0, {{Tf0, zFeed}});
    const CmoFeedQuality recoveryQ =
        cmoFeedQuality(recoveryFeed, Tf0, Pfeed0, Pf0, zFeed, thermo, recoveryH);
    refuseContradictoryFeedQuality(operDict, feedDict, recoveryFeed, recoveryQ,
                                   Tf0, dict->name());
    const scalar qF = recoveryQ.q;

    const scalar feedOfComp = (zsum > 0.0) ? Ff * zc / zsum : 0.0;
    if (feedOfComp <= 0.0)
        throw std::runtime_error("DistillationColumn: distillateRecovery names "
            "'" + comp + "', which this column's feed does not carry -- a "
            "recovery of a component that is not there is not a specification.");

    //  ---- One evaluation: set the rate, run the column, read the recovery -
    //  Returns false when the column does not solve AT THAT RATE.  A rate is
    //  not merely a number here: too much material asked overhead has to be
    //  made up with the heavy component, and past some point no set of stage
    //  compositions satisfies the MESH at all.  That is a real boundary of
    //  the feasible region, not a numerical wobble, so the outer search has
    //  to RETREAT from it rather than treat it as a fatal error -- which is
    //  what the first version did, aborting the plant on its second guess.
    auto tryEvaluate = [&](scalar D, scalar& recovery) -> bool
    {
        DictPtr work = dict->deepCopy();
        auto wOper = work->subDict("operation");
        //  The inner call must not see the recovery block again; erasing it
        //  is what makes this a wrapper rather than a recursion.
        wOper->erase("distillateRecovery");
        wOper->insert("distillateRate", D, Dims::molarFlow);
        try
        {
            const int rc = solve(work, thermo, verbosity >= 4 ? verbosity : 0);
            if (rc != 0 || produced_.empty()) return false;
        }
        catch (const std::exception&) { return false; }
        const ProcessStream& d = produced_.front();
        recovery = d.F * d.z[ic] / feedOfComp;
        return true;
    };

    //  Step from a KNOWN-FEASIBLE rate towards a trial one, halving until the
    //  column solves.  Announced when it bites: a bound that moves the answer
    //  and says nothing is the silent crutch the doctrine forbids.
    scalar lastGood = 0.0;
    auto evaluateNear = [&](scalar trial, scalar& accepted) -> scalar
    {
        scalar r = 0.0;
        scalar D = trial;
        for (int back = 0; back < 12; ++back)
        {
            if (tryEvaluate(D, r)) { accepted = D; lastGood = D; return r; }
            if (lastGood <= 0.0)
                throw std::runtime_error("DistillationColumn: the column does "
                    "not solve at ANY distillate rate tried while searching for "
                    "a recovery of '" + comp + "' -- the first trial was "
                    + std::to_string(trial * 3600.0) + " kmol/h.  The recovery "
                    "specification is not the problem; the column is not "
                    "solving.");
            if (verbosity >= 2)
                std::cout << "      [bound] " << (D * 3600.0)
                          << " kmol/h is outside the feasible region -- halving"
                             " back towards " << (lastGood * 3600.0) << " kmol/h\n";
            D = 0.5 * (D + lastGood);
        }
        throw std::runtime_error("DistillationColumn: could not find a feasible "
            "distillate rate near " + std::to_string(trial * 3600.0)
            + " kmol/h while searching for a recovery of '" + comp + "'.");
    };

    //  ---- Announced secant.  The bracket is physical: the rate cannot be
    //  negative and cannot exceed the feed.  The first guess assumes a pure
    //  distillate (D = recovered component), the second allows for the
    //  co-distilled remainder -- so the pair straddles the answer for any
    //  column that concentrates the named component at all.
    const scalar tol     = specDict->lookupScalarOrDefault("tolerance", 1.0e-6);
    const int    maxIter = static_cast<int>(
                               specDict->lookupScalarOrDefault("maxIter", 40));

    //  D0 is the PURE-DISTILLATE lower bound: if the overhead were the named
    //  component alone, this rate would deliver the target exactly.  Any real
    //  column carries something else over too, so the answer lies ABOVE it --
    //  which is why the search starts here and steps up, never down into a
    //  region where the recovery cannot be reached at all.
    scalar D0 = target * feedOfComp, a0 = D0;
    scalar f0 = evaluateNear(D0, a0) - target;
    D0 = a0;
    scalar D1 = std::min(1.05 * D0, 0.999 * Ff), a1 = D1;
    scalar f1 = evaluateNear(D1, a1) - target;
    D1 = a1;

    if (verbosity >= 2)
        std::cout << "  [recovery] " << nSt << " stages, feed " << nFd
                  << ", R = " << RR << ", q = " << qF
                  << (Pc > 0.0 ? ", P = " + std::to_string(Pc * 1.0e-5) + " bar"
                               : std::string(", P from the feed"))
                  << "\n  [recovery] targeting " << target << " of " << comp
                  << " (" << (feedOfComp * 3600.0) << " kmol/h in the feed)"
                  << " by secant on the distillate rate:\n"
                  << "      " << (D0 * 3600.0) << " kmol/h -> " << (f0 + target)
                  << "\n      " << (D1 * 3600.0) << " kmol/h -> " << (f1 + target)
                  << "\n";

    int it = 2;
    scalar D = D1;
    for (; it < maxIter && std::abs(f1) > tol; ++it)
    {
        const scalar den = f1 - f0;
        if (std::abs(den) < 1.0e-14)
            throw std::runtime_error("DistillationColumn: the recovery secant "
                "stalled -- two distillate rates gave the same recovery of '"
                + comp + "', so the specification does not select a rate here.");
        D = D1 - f1 * (D1 - D0) / den;
        D = std::max(1.0e-9 * Ff, std::min(D, 0.999 * Ff));
        D0 = D1; f0 = f1;
        scalar acc = D;
        f1 = evaluateNear(D, acc) - target;
        D1 = acc;
        if (verbosity >= 2)
            std::cout << "      " << (D1 * 3600.0) << " kmol/h -> "
                      << (f1 + target) << "\n";
    }
    if (std::abs(f1) > tol)
        throw std::runtime_error("DistillationColumn: the distillate recovery "
            "of '" + comp + "' did not reach its target (" + std::to_string(target)
            + ") in " + std::to_string(maxIter) + " outer iterations; the last "
              "recovery was " + std::to_string(f1 + target) + ".  A recovery "
              "above what the column's stages and reflux can deliver has no "
              "rate that satisfies it -- check the specification against the "
              "separation, do not raise maxIter.");

    //  A final evaluation at the accepted rate, at the CALLER's verbosity, so
    //  the printed profile and the stored produced_/kpis_ are the accepted
    //  answer and not the last search step.
    DictPtr fin = dict->deepCopy();
    auto fOper = fin->subDict("operation");
    fOper->erase("distillateRecovery");
    fOper->insert("distillateRate", D1, Dims::molarFlow);
    const int rc = solve(fin, thermo, verbosity);

    kpis_["recovery_" + comp]        = f1 + target;
    kpis_["recoveryOuterIterations"] = static_cast<scalar>(it);
    if (verbosity >= 2)
        std::cout << "  [recovery] accepted D = " << (D1 * 3600.0)
                  << " kmol/h, recovery of " << comp << " = " << (f1 + target)
                  << " after " << it << " outer iteration(s)\n";
    return rc;
}

int DistillationColumn::solveSimultaneous(const DictPtr& dict,
                                          const ThermoPackage& thermo,
                                          int verbosity)
{
    auto operDict = dict->subDict("operation");
    //  A REACTIVE FULL MESH CARRIES THE REACTION (DEV.md 4c C231, C233).
    //  C169 refused `model fullMESH;` over a `reaction {}` because the stage
    //  rows carried no extent; they do now: the equilibrium extents as
    //  unknowns (component rows -nu_i xi, total rows -sumNu xi, NO
    //  heat-of-reaction term -- the energy rows price on the elements datum,
    //  which already holds it), or, for a `kinetics {}` block, the extent
    //  COMPUTED per reactive stage from the rate and the catalyst mass.
    const bool fullMeshWord = [&] {
        const std::string m = dict->lookupWordOrDefault(
            "model", operDict->lookupWordOrDefault("method", "WangHenke"));
        return m == "fullMESH" || m == "MESH" || m == "NaphtaliSandholm";
    }();
    // Murphree efficiency is implemented on the Wang-Henke path only (folded into
    // an effective K, with the vapour from below lagged one outer pass).  The MESH
    // Newton has no outer pass to lag against: the relation would have to enter the
    // residual and the Jacobian.  Refuse rather than silently return ideal stages.
    //  `!= 1.0`, not `< 1.0`: the moment E_MV above unity became admissible (a
    //  real cross-flow measurement -- see the bound at the top of the
    //  Wang-Henke path), a `< 1.0` test would have let 1.191 through THIS gate
    //  and then quietly solved ideal stages.  A refusal that only catches half
    //  its subject is the silent fallback it was written to prevent.
    if (operDict->lookupScalarOrDefault("murphreeEfficiency", 1.0) != 1.0)
        throw std::runtime_error("DistillationColumn: `murphreeEfficiency` is not "
            "implemented for `method simultaneous` -- it would have to enter the MESH "
            "residual and Jacobian, and Choupo will not quietly hand you ideal stages "
            "instead.  Use the Wang-Henke method, or drop the efficiency.");
    // A MULTI-FEED column takes its feeds as flowsheet STREAMS (`inputs (...)` ->
    // `inputStreams`), so the plant-boundary mass + energy balance sees them.  A
    // single-feed column keeps the legacy `in feed;` (-> `feed{}` + `composition{}`).
    const bool   multiFeed = dict->found("inputStreams");
    const DictPtr feedDict = multiFeed ? nullptr : dict->subDict("feed");
    const DictPtr compDict = multiFeed ? nullptr : dict->subDict("composition");

    const scalar P  = multiFeed
        ? operDict->lookupScalar("P", Dims::pressure)
        : operDict->lookupScalarOrDefault("P", feedDict->lookupScalar("P", Dims::pressure),
                                          Dims::pressure);

    const std::size_t n = thermo.n();
    auto readComp = [&](const DictPtr& cd) {
        sVector zz(n, 0.0); scalar s = 0.0;
        for (const auto& k : cd->keys()) zz[thermo.indexOf(k)] = cd->lookupScalar(k);
        for (auto v : zz) s += v;
        if (s > 0.0) for (auto& v : zz) v /= s;
        return zz;
    };

    const std::size_t N  = static_cast<std::size_t>(operDict->lookupScalar("nStages"));
    //  THE COLUMN'S TWO DEGREES OF FREEDOM (C231).  Either (refluxRatio,
    //  distillateRate) -- the form every column here has always taken -- or
    //  (bottomsRate, boilupRatio), the form a reactive column is usually
    //  specified in: with a mole-changing reaction D is no longer F - B, so D
    //  becomes an unknown of the full MESH closed by the top balance.  Any
    //  other mixture of the four keys refuses by name.
    const bool hasR  = operDict->found("refluxRatio");
    const bool hasD  = operDict->found("distillateRate");
    const bool hasBr = operDict->found("bottomsRate");
    const bool hasBu = operDict->found("boilupRatio");
    const bool specBoil = hasBr || hasBu;
    const CondenserType condenser = readCondenserType(operDict, dict->name(), verbosity);
    if (operDict->found("refluxTemperature"))
        throw std::runtime_error("DistillationColumn '" + dict->name()
            + "': `refluxTemperature` (subcooled reflux) is read by `model"
              " WangHenke;` only.  The simultaneous MESH paths return saturated"
              " reflux; remove the key or select WangHenke.");
    const bool partialCond = (condenser == CondenserType::partial);
    scalar R = 0.0, D = 0.0, Bspec = 0.0, boilup = 0.0;
    if (specBoil)
    {
        if (!(hasBr && hasBu) || hasR || hasD)
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': the column's two specifications are either"
                " (`refluxRatio`, `distillateRate`) or (`bottomsRate`,"
                " `boilupRatio`) -- both keys of ONE pair and none of the"
                " other.  Found:" + std::string(hasR ? " refluxRatio" : "")
                + (hasD ? " distillateRate" : "") + (hasBr ? " bottomsRate" : "")
                + (hasBu ? " boilupRatio" : "") + ".  A third specification"
                " would over-determine the column; one missing leaves it"
                " under-determined.");
        if (!fullMeshWord)
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': `bottomsRate` / `boilupRatio` close the top balance for"
                " the distillate through the full MESH's total rows; declare"
                " `model fullMESH;` (the constant-molal-overflow methods take"
                " `refluxRatio` and `distillateRate`).");
        if (!partialCond)
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': `bottomsRate` / `boilupRatio` are implemented with a"
                " PARTIAL condenser (`condenser { type partial; }`: stage 1 is"
                " the condenser and the distillate leaves as vapour).  With a"
                " total condenser declare `refluxRatio` and `distillateRate`.");
        Bspec  = operDict->lookupScalar("bottomsRate", Dims::molarFlow);
        boilup = operDict->lookupScalar("boilupRatio");
        if (!(Bspec > 0.0) || !(boilup > 0.0))
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': `bottomsRate` and `boilupRatio` must be positive.");
    }
    else
    {
        R = operDict->lookupScalar("refluxRatio");
        D = operDict->lookupScalar("distillateRate", Dims::molarFlow);
    }

    // ---- per-stage feed / side-draw maps -------------------------------
    //  General RadFrac-style staircase: any stage may receive a feed and/or
    //  bleed a liquid (U) or vapour (W) side draw.  The single `feed{}` block
    //  is feed #1 (backward compatible); extra `feeds(...)` and `sideDraws(...)`
    //  lists add more.  Feeds on the same stage are merged (mole-weighted z, q).
    std::vector<scalar>  Ffeed(N, 0.0), feedLiq(N, 0.0), feedTmol(N, 0.0),
                         Udraw(N, 0.0), Wdraw(N, 0.0);
    std::vector<sVector> feedComp(N, sVector(n, 0.0));
    //  EVERY FEED IS KEPT AS ITSELF for the full MESH's stage energy rows
    //  (C131 review, 2026-10-25).  The rows used to price stage j's feed as
    //  q hL(z, T) + (1-q) hV(z, T) on the MERGED per-stage scalars: a quality
    //  blend at the overall composition for a two-phase feed (the 5.51 kW
    //  `feedEnthalpy` below exists to avoid, on column01), and a
    //  molar-average temperature for two feeds sharing a stage.  The duty
    //  block below prices the same feed at its equilibrium (x, y), so under
    //  `fullMESH` the profile was solved against one feed enthalpy and the
    //  reboiler duty closed against another.  Each feed is priced once, by
    //  its own state, in `stageFeedEnthalpy` below -- through `feedEnthalpy`,
    //  the duty's own home, and on the duty's own surface (C169).
    struct FeedRecord
    {
        std::size_t j = 0;
        scalar F = 0.0, q = 1.0, T = 0.0;
        scalar P = 0.0;                        // the STREAM's pressure (C235); 0 = the column's
        sVector z;
        std::optional<FeedThermalState> state; // its resolution, when it is a stream
        std::string           name = "the feed";
        std::optional<scalar> qDeclared;       // operation.feeds.quality, cross-checked
    };
    std::vector<FeedRecord> feedRecords;
    auto addFeed = [&](std::size_t j, scalar Ff, scalar qf, scalar Tff, const sVector& zf,
                       const FeedThermalState* st = nullptr, scalar Pff = 0.0) {
        Ffeed[j] += Ff; feedLiq[j] += qf * Ff; feedTmol[j] += Ff * Tff;
        for (std::size_t i = 0; i < n; ++i) feedComp[j][i] += Ff * zf[i];
        FeedRecord r; r.j = j; r.F = Ff; r.q = qf; r.T = Tff; r.z = zf; r.P = Pff;
        if (st) r.state = *st;
        feedRecords.push_back(std::move(r));
    };

    // Representative primary-feed scalars (initial-guess anchor, profile
    // marker).  The per-stage arrays above carry the real physics.
    scalar       Tf = 0.0;
    std::size_t  NF = 0;
    sVector      z(n, 0.0);

    //  EVERY FEED'S THERMAL STATE IS RESOLVED FROM ITS STREAM, IN BOTH
    //  BRANCHES (the single-feed one since 2026-09-12; the multi-feed one
    //  since 2026-10-05, DEV.md §4d D1, decided by Vítor in C35).  Each
    //  resolution is kept with its FEED (`FeedRecord`, above) so the duty
    //  block and the full MESH's energy rows can price a two-phase feed at
    //  its equilibrium compositions (x, y), the rule `reporting/BalanceMath.H`
    //  prices the same stream by -- feed by feed, so two feeds sharing a
    //  stage are two terms (until C131 such a stage kept the blend at its
    //  merged q).  The multi-feed branch used to read each stream's CARRIED
    //  `vf`, so an unpinned feed that resolves vapour or two-phase reached the
    //  MESH as a liquid -- not live on the corpus that day (measured, see
    //  DEV.md D1).

    if (multiFeed)   // ---- feeds are flowsheet streams, mapped to stages ----------
    {
        std::map<std::string, DictPtr> byName;
        for (const auto& s : dict->lookupDictList("inputStreams")) byName[s->name()] = s;
        if (!operDict->found("feeds"))
            throw std::runtime_error("DistillationColumn: a multi-input column needs "
                "`operation { feeds ( { stream <name>; stage <k>; } ... ); }` to map each "
                "input stream to a stage.");
        bool first = true;
        for (const auto& fe : operDict->lookupDictList("feeds"))
        {
            const std::string sName = fe->lookupWord("stream");
            const std::size_t st = static_cast<std::size_t>(fe->lookupScalar("stage"));
            if (st < 1 || st > N)
                throw std::runtime_error("DistillationColumn: a feed `stage` is out of range.");
            if (st == 1)
                refuseStageOneTerm(dict->name(), "feed '" + sName + "'",
                                   kStageOneFeedRemedy);
            auto it = byName.find(sName);
            if (it == byName.end())
                throw std::runtime_error("DistillationColumn: feed stream '" + sName
                    + "' is not among the column's `inputs (...)`.");
            const auto& sd = it->second;
            const scalar  Ff  = sd->lookupScalar("F", Dims::molarFlow);
            const scalar  Tfe = sd->lookupScalar("T", Dims::temperature);
            const sVector zf  = readComp(sd->subDict("composition"));
            // The feed's thermal state lives in the STREAM (information follows the
            // streams): the McCabe--Thiele quality q = 1 - vf, with vf what the
            // stream MEANS -- its declaration when pinned, its producer's answer
            // when produced, and otherwise its own equilibrium at (T, P, z),
            // single phase included (the same one home as the single-feed
            // branch).  A redundant operation.feeds.quality that DISAGREES is
            // exactly the column08-class silent bug (a vapour feed declared
            // liquid) -> REFUSE it loudly.
            const scalar Pfe = sd->lookupScalarOrDefault("P", P, Dims::pressure);
            const FeedThermalState fst =
                resolveFeedThermalState(sd, Tfe, Pfe, zf, thermo, dict->name());
            //  q is set below, from the feed's enthalpy (C169), and a declared
            //  `quality` is cross-checked against THAT.
            addFeed(st - 1, Ff, 1.0 - fst.vf, Tfe, zf, &fst, Pfe);
            feedRecords.back().name = sName;
            if (fe->found("quality"))
                feedRecords.back().qDeclared = fe->lookupScalar("quality");
            if (first) { Tf = Tfe; NF = st; z = zf; first = false; }
        }
    }
    else             // ---- legacy single feed{} block + feedStage ----------------
    {
        Tf = feedDict->lookupScalar("T", Dims::temperature);
        NF = static_cast<std::size_t>(operDict->lookupScalar("feedStage"));
        if (NF < 1 || NF > N)
            throw std::runtime_error("DistillationColumn(simultaneous): feedStage "
                "must be 2..nStages");
        if (NF == 1)
            refuseStageOneTerm(dict->name(), "the feed (`feedStage 1`)",
                               kStageOneFeedRemedy);
        z = readComp(compDict);
        //  SAME RULE AS WANG-HENKE, and the same one home reached from both --
        //  this branch used to read `feedQuality` with its own default, which
        //  is how one defect came to have two transcriptions.
        const scalar Pfp = feedDict->lookupScalarOrDefault("P", P, Dims::pressure);
        const FeedThermalState primaryFeedState =
            resolveFeedThermalState(feedDict, Tf, Pfp, z, thermo, dict->name());
        //  Cross-checked below, against the q the column uses (C169).
        addFeed(NF - 1, feedDict->lookupScalar("F", Dims::molarFlow),
                1.0 - primaryFeedState.vf, Tf, z, &primaryFeedState, Pfp);
        feedRecords.back().name =
            feedDict->lookupWordOrDefault("streamName", "the feed");

        // legacy INLINE extra feeds (a side channel -- NOT on the flowsheet graph,
        // so the plant-boundary balance misses them; prefer `inputs (...)` streams).
        if (operDict->found("feeds"))
            for (const auto& fe : operDict->lookupDictList("feeds"))
            {
                const std::size_t st = static_cast<std::size_t>(fe->lookupScalar("stage"));
                if (st < 1 || st > N)
                    throw std::runtime_error("DistillationColumn: a feed `stage` is out of range.");
                if (st == 1)
                    refuseStageOneTerm(dict->name(), "an inline `feeds` entry",
                                       kStageOneFeedRemedy);
                const scalar Ff = fe->lookupScalar("F", Dims::molarFlow);
                const scalar qf = fe->lookupScalarOrDefault("quality", 1.0);
                const scalar Tfe = fe->lookupScalarOrDefault("T", Tf, Dims::temperature);
                addFeed(st - 1, Ff, qf, Tfe, readComp(fe->subDict("composition")));
                //  An inline feed is a dict declaration, not a stream: it has
                //  no state to resolve, so it is priced at its declared q (a
                //  blend at its own z).  Its q DEFAULTS to 1 when `quality` is
                //  not declared, and that default is not announced -- a gap
                //  recorded in docs/design/review-c131-separations.md (M5).
                //  No corpus case uses an inline feed.
            }
    }
    // side draws:  sideDraws ( { stage k; phase liquid|vapor; rate ..; } ... )
    std::size_t nDraws = 0;
    if (operDict->found("sideDraws"))
        for (const auto& dr : operDict->lookupDictList("sideDraws"))
        {
            const std::size_t st = static_cast<std::size_t>(dr->lookupScalar("stage"));
            if (st < 1 || st > N)
                throw std::runtime_error("DistillationColumn: a sideDraw `stage` is out of range.");
            if (st == 1)
                refuseStageOneTerm(dict->name(), "a side draw", kStageOneDrawRemedy);
            const scalar rate = dr->lookupScalar("rate", Dims::molarFlow);
            //  Same rule as the `model` slot above (2026-09-07): the else was
            //  a catch-all, so `phase vapou;` drew LIQUID -- byte-identical to
            //  a liquid draw, while the vapour draw it asked for moves the
            //  reboiler duty by 10 %.  A declared word the site does not know
            //  refuses.
            const std::string ph = dr->lookupWordOrDefault("phase", "liquid");
            if (ph != "liquid" && ph != "vapor" && ph != "vapour" && ph != "V")
                throw std::runtime_error("DistillationColumn: "
                    + registryRefusal::message("side-draw phase", ph,
                        {"liquid", "vapour", "vapor", "V"}, "Accepted"));
            if (ph == "vapor" || ph == "vapour" || ph == "V") Wdraw[st - 1] += rate;
            else                                              Udraw[st - 1] += rate;
            ++nDraws;
        }

    //  THE ONE ENTHALPY SURFACE of this column (C169): the CMO q below, the
    //  full MESH's rows, its feeds, its energy scale and both duties read it.
    std::vector<std::pair<scalar, sVector>> enteringStates;
    for (const auto& r : feedRecords) enteringStates.emplace_back(r.T, r.z);
    const ColumnEnthalpy hs = columnEnthalpySurface(thermo, P, enteringStates);

    //  EVERY STREAM FEED'S CMO q FROM ITS ENTHALPY (C169 item 4), and every
    //  declared quality cross-checked against the q the column USES -- the
    //  rule of `cmoFeedQuality`, one home for both branches and Wang-Henke.
    //  An inline `feeds` entry keeps its declared quality: it is a dict
    //  declaration with no state to resolve.
    feedLiq.assign(N, 0.0);
    for (std::size_t k = 0; k < feedRecords.size(); ++k)
    {
        auto& r = feedRecords[k];
        if (r.state)
        {
            const CmoFeedQuality fq =
                cmoFeedQuality(*r.state, r.T, r.P > 0.0 ? r.P : P, P, r.z, thermo, hs);
            announceFeedQuality(dict->name(), r.name, *r.state, fq, r.T, verbosity);
            if (!multiFeed && k == 0)
                refuseContradictoryFeedQuality(operDict, feedDict, *r.state, fq,
                                               r.T, dict->name());
            if (r.qDeclared && std::abs(*r.qDeclared - fq.q) > 1.0e-3)
                throw std::runtime_error("DistillationColumn: feed '" + r.name
                    + "': operation.feeds.quality = " + std::to_string(*r.qDeclared)
                    + " contradicts the feed STREAM (vapour fraction "
                    + std::to_string(r.state->vf) + ", " + r.state->origin
                    + " => q = " + std::to_string(fq.q) + ", "
                    + feedQualityOrigin(*r.state, fq)
                    + ").  A feed's thermal state lives in the stream, not the"
                    " column -- delete the `quality` and set the stream's"
                    " T and P (or its `phase gas|liquid;` pin) so the two"
                    " can never disagree.");
            r.q = fq.q;
        }
        feedLiq[r.j] += r.q * r.F;
    }

    // resolve merged feed composition / quality per stage
    std::vector<scalar>  qfeed(N, 1.0), feedT(N, Tf);
    std::vector<sVector> zfeed(N, sVector(n, 0.0));
    for (std::size_t j = 0; j < N; ++j)
        if (Ffeed[j] > 0.0)
        {
            qfeed[j] = feedLiq[j] / Ffeed[j];
            feedT[j] = feedTmol[j] / Ffeed[j];
            for (std::size_t i = 0; i < n; ++i) zfeed[j][i] = feedComp[j][i] / Ffeed[j];
        }

    // ---- CMO flow profile L[j] (down), V[j] (up) -----------------------
    std::vector<scalar> L(N, 0.0), V(N, 0.0);
    if (specBoil)
    {
        //  The SEED's D and R from the two declared specs, ANNOUNCED (no silent
        //  crutch): the non-reactive overall balance gives D = F - draws - B,
        //  and the boil-up fixes the vapour leaving the reboiler, from which
        //  the constant-molal vapour profile climbs to V_2 = (R+1) D.  The
        //  full MESH then solves D and R as unknowns.
        scalar tF = 0.0, tD = 0.0;
        for (std::size_t j = 0; j < N; ++j) { tF += Ffeed[j]; tD += Udraw[j] + Wdraw[j]; }
        D = tF - tD - Bspec;
        if (!(D > 0.0))
            throw InfeasibleTrial("DistillationColumn '" + dict->name()
                + "': bottomsRate >= the feed less the draws -- no distillate"
                " is left for the seed profile.");
        scalar Vup = boilup * Bspec;               // vapour leaving the reboiler
        for (std::size_t j = N - 2; j >= 1; --j)
            Vup += (1.0 - qfeed[j]) * Ffeed[j] - Wdraw[j];
        R = Vup / D - 1.0;
        if (!(R > 0.0))
            throw InfeasibleTrial("DistillationColumn '" + dict->name()
                + "': the boil-up leaves no reflux in the seed profile"
                " (R = " + std::to_string(R) + ").");
        if (verbosity >= 2)
            std::cout << "  [solver] bottomsRate/boilupRatio: the CMO seed"
                         " takes D = F - B = " << D*3600.0 << " kmol/h and"
                         " R = " << R << " from the boil-up; the full MESH"
                         " solves D as an unknown\n";
    }
    L[0] = R * D;                                  // reflux
    for (std::size_t j = 1; j < N; ++j) L[j] = L[j-1] + qfeed[j]*Ffeed[j] - Udraw[j];
    if (N > 1) V[1] = (R + 1.0) * D;               // vapour rising into stage 1
    //  V[0] is the vapour LEAVING stage 1.  Under a TOTAL condenser stage 1 is
    //  the top tray and sends (R+1) D up to the condenser, which returns R D as
    //  reflux; the stage-1 rows below carry that as their net, D y_1, so V[0]
    //  enters no balance -- but it is the tray's traffic, which the
    //  hydraulics rate and the full MESH solves.  Under a PARTIAL condenser
    //  stage 1 IS the condenser: no vapour rises out of it, and its vapour
    //  product is the distillate.
    V[0] = partialCond ? 0.0 : (R + 1.0) * D;
    for (std::size_t j = 1; j + 1 < N; ++j) V[j+1] = V[j] - (1.0 - qfeed[j])*Ffeed[j] + Wdraw[j];

    scalar totFeed = 0.0, totDraw = 0.0;
    for (std::size_t j = 0; j < N; ++j) { totFeed += Ffeed[j]; totDraw += Udraw[j] + Wdraw[j]; }
    scalar Bf = totFeed - D - totDraw;             // bottoms by overall balance
    if (Bf <= 0.0)
        throw InfeasibleTrial("DistillationColumn(simultaneous): B = sumF - D - sumDraws <= 0 (infeasible trial)");
    for (std::size_t j = 1; j < N; ++j)
        if (V[j] <= 0.0 || L[j] < 0.0)
            throw std::runtime_error("DistillationColumn(simultaneous): a stage vapour/liquid "
                "flow went non-positive (a feed/draw combination starves the column).");

    // ---- Optional reaction: equilibrium reactive distillation ----------
    //  Mole-conserving (Σν = 0) reactions only (esterification, transester.):
    //  total moles are preserved, so the CMO flow profile above is untouched.
    //  Each reactive stage gains ONE unknown -- the molar extent ξ_j -- closed
    //  by an activity-based equilibrium residual  Σ_i ν_i ln(γ_i x_i) = ln K_a.
    //  The reaction HEAT is NOT fed back into the CMO flows: this is the honest
    //  bubble-point SCREENING model for reactive distillation; the full energy
    //  coupling is the deferred full-MESH step.
    sVector nu(n, 0.0);
    std::vector<std::size_t> rxStages;
    scalar Ka298 = 1.0, dHrxn = 0.0;               // K_a(T) = Ka298·exp(-dHrxn/R·(1/T − 1/298.15))
    enum class KaForm { vantHoff, records, formula };
    KaForm kaForm = KaForm::vantHoff;
    std::shared_ptr<Formula> lnKaFormula;          // `equilibrium { lnKa "..."; }`
    scalar kaTmin = 0.0, kaTmax = 0.0;             // its declared validity (0 = none)
    bool   kinetic = false, adsorption = false;    // kinetic (rate) vs equilibrium mode
    //  `kinetics { model expression; }` (C233): the rate is a law WRITTEN in the
    //  case and read by the reaction factory; the column hands it T, P, x and
    //  the PACKAGE's activities a[i] = gamma_i x_i.
    bool   kineticExpr = false;
    std::unique_ptr<ReactionRate> exprLaw;
    scalar kfA = 0.0, kfEa = 0.0, krA = 0.0, krEa = 0.0, mCatPerStage = 0.0;
    sVector Kads(n, 0.0);                           // adsorption equilibrium constants
    sVector order(n, 0.0);                          // FORWARD order (kinetic mode only)
    const bool reactive = dict->found("reaction"); if (reactive) announceDeclaredHeatDivergence(*dict->subDict("reaction"), "DistillationColumn '" + dict->name() + "'");
    if (reactive)
    {
        auto rx = dict->subDict("reaction");
        for (const auto& s : rx->lookupDictList("stoichiometry"))
            nu[thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");
        scalar sumNu = 0.0; for (auto v : nu) sumNu += v;
        if (std::abs(sumNu) > 1.0e-9 && !fullMeshWord)
            throw std::runtime_error("DistillationColumn: a reaction with"
                " Sum nu != 0 (" + std::to_string(sumNu) + ") changes the"
                " internal molar flows, which `model simultaneous;` holds"
                " constant (constant molal overflow).  Declare `model"
                " fullMESH;`: its total rows carry the mole change"
                " (-Sum nu xi) and its energy rows price the heat of reaction"
                " on the elements datum.  Sum nu = 0 reactions (esterification)"
                " run under either model.");
        for (auto v : rx->lookupList("reactiveStages"))
            rxStages.push_back(static_cast<std::size_t>(v) - 1);
        if (rx->found("kinetics"))                 // KINETIC (rate-limited) reactive distillation
        {
            kinetic = true;
            auto kin = rx->subDict("kinetics");
            //  A declared word the site dispatches on refuses a word it does
            //  not know (the 2026-09-07 rule): this was `== "adsorption"` with
            //  every other word -- a typo included -- silently running the
            //  pseudo-homogeneous law.
            const std::string kinModel =
                kin->lookupWordOrDefault("model", "pseudoHomogeneous");
            if (kinModel != "pseudoHomogeneous" && kinModel != "adsorption"
                && kinModel != "expression")
                throw std::runtime_error("DistillationColumn: "
                    + registryRefusal::message("reaction kinetics model", kinModel,
                        {"pseudoHomogeneous", "adsorption", "expression"}, "Accepted"));
            adsorption = (kinModel == "adsorption");
            kineticExpr = (kinModel == "expression");
            if (kineticExpr)
            {
                //  The law is read by the reaction FACTORY from a copy of the
                //  block that holds only what the law reads: `model` and
                //  `catalystMass` are the COLUMN's keys.
                const std::string who = "DistillationColumn '" + dict->name()
                    + "' (kinetics model expression)";
                if (kin->found("forward") || kin->found("reverse") || kin->found("adsorption"))
                    throw std::runtime_error(who + ": `forward`, `reverse` and"
                        " `adsorption` belong to the native kinetics words; an"
                        " expression law writes its own legs inside the law.");
                DictPtr rxCopy = rx->deepCopy();
                DictPtr kinCopy = rxCopy->subDict("kinetics");
                kinCopy->erase("model");
                kinCopy->erase("catalystMass");
                kinCopy->insert("type", std::string("expression"));
                RateOffer offer;
                offer.pressure      = true;
                offer.concentration = false;
                offer.concentrationBasis = "the column forms no concentration";
                offer.activities    = true;
                exprLaw = ReactionRate::New(rxCopy, thermo, who, offer);
                //  The law read the COPY; the keys it consumed are the
                //  factory's reader's, and are declared so here (its own key
                //  list already refuses a misspelt one by name).
                for (const auto& key : kin->keys())
                    if (key != "model" && key != "catalystMass")
                        kin->noteForeignBlock(key);
                if (exprLaw->declaredBasis() != "catalystMass")
                    throw std::runtime_error(who + ": the column's kinetic stage"
                        " carries a CATALYST MASS (`catalystMass` on the"
                        " kinetics block), so the law must declare `basis"
                        " catalystMass;` -- a rate per reactor volume has no"
                        " volume on a stage to multiply.");
            }
            else {
            auto fwd = kin->subDict("forward"); kfA = fwd->lookupScalar("A"); kfEa = fwd->lookupScalar("Ea");
            auto rev = kin->subDict("reverse"); krA = rev->lookupScalar("A"); krEa = rev->lookupScalar("Ea");
            //  THE FORWARD ORDER HAS ONE HOME, and this reader had escaped it
            //  (found 2026-09-27, beside D06): the rate used |nu| as the
            //  exponent of every reactant without reading `order` at all --
            //  a sixth reader of the decision §5 says has one home.  It now
            //  goes through Reaction::forwardOrder like the CSTR, the PFR, the
            //  batch reactor, the dynamic CSTR and RateLaw: a declared order is
            //  honoured, a reactant with none REFUSES by name.  The REVERSE leg
            //  stays mass-action on the products (nu > 0), the order detailed
            //  balance fixes.  The equilibrium mode reads no order.
            for (const auto& s : rx->lookupDictList("stoichiometry"))
            {
                const std::string c = s->lookupWord("component");
                const std::size_t i = thermo.indexOf(c);
                order[i] = Reaction::forwardOrder(*s, nu[i], c,
                    "DistillationColumn (kinetic reaction)");
            }
            if (adsorption)
            {
                std::vector<bool> declaredK(n, false);
                for (const auto& a : kin->lookupDictList("adsorption"))
                {
                    const std::size_t i = thermo.indexOf(a->lookupWord("component"));
                    Kads[i] = a->lookupScalar("K");
                    declaredK[i] = true;
                }
                //  An UNDECLARED K on a species that is IN the rate law makes
                //  its adsorbed activity a'_i = K_i a_i / M_i identically zero
                //  and switches a whole leg of the rate off -- the forward leg
                //  for a reactant, the reverse leg for a product.  Until D06
                //  (2026-09-27) the product case was worse still: the reverse
                //  leg skipped a zero activity and priced the product at unit
                //  activity.  Either way it is a number nobody declared, so a
                //  reacting species without its K refuses.  (An explicit
                //  `K 0;` is a claim and is honoured; an INERT species with no
                //  K adsorbs nothing, which is what its absence says.)
                for (std::size_t i = 0; i < n; ++i)
                    if (nu[i] != 0.0 && !declaredK[i])
                        throw std::runtime_error("DistillationColumn: the"
                            " `adsorption` kinetics give every species in the"
                            " rate law an adsorbed activity a'_i = K_i a_i / M_i,"
                            " and '" + thermo.comp(i).name() + "' (nu = "
                            + std::to_string(nu[i]) + ") declares no K in"
                            " `kinetics.adsorption`.\n"
                            "    Without it a'_i is zero and the "
                            + std::string(nu[i] < 0.0 ? "FORWARD" : "REVERSE")
                            + " leg of the rate vanishes -- a number nobody"
                            " declared.\n"
                            "    REMEDY: add `{ component " + thermo.comp(i).name()
                            + "; K <value>; }` to `kinetics.adsorption`"
                            " (an explicit `K 0;` is honoured as a claim).");
            }
            }   // native words
            const scalar mCatTot = kin->lookupScalar("catalystMass", Dims::mass);   // kg total
            mCatPerStage = (!rxStages.empty()) ? mCatTot * 1000.0 / rxStages.size() : 0.0;  // g/stage
        }
        else                                       // EQUILIBRIUM reactive distillation
        {
            auto eq = rx->subDict("equilibrium");
            const int nForms = (eq->found("Ka298") ? 1 : 0) + (eq->found("Ka") ? 1 : 0)
                             + (eq->found("fromRecords") ? 1 : 0)
                             + (eq->found("lnKa") ? 1 : 0);
            if (nForms != 1)
                throw std::runtime_error("DistillationColumn '" + dict->name()
                    + "': `reaction.equilibrium` declares its K_a(T) in EXACTLY"
                    " ONE form: `Ka298` (+ `dHrxn`), `Ka`, `fromRecords;` or"
                    " `lnKa \"<formula>\";` (+ `parameters {}`); found "
                    + std::to_string(nForms) + ".");
            if (eq->found("Ka298"))                // van't Hoff form
            { Ka298 = eq->lookupScalar("Ka298"); dHrxn = eq->lookupScalarOrDefault("dHrxn", 0.0); }
            else if (eq->found("Ka"))              // constant K_a
            { Ka298 = eq->lookupScalar("Ka"); dHrxn = 0.0; }
            else if (eq->found("fromRecords"))
                kaForm = KaForm::records;
            else
            {
                kaForm = KaForm::formula;
                //  ln K_a(T) WRITTEN in the case (the C67 rule): dimensionless,
                //  T the only state symbol, every parameter with its unit.
                const std::string text = eq->lookupWord("lnKa");
                std::vector<std::string> known = { "T" };
                std::vector<std::pair<std::string, std::pair<scalar, Dimensions>>> prm;
                if (eq->found("parameters"))
                {
                    auto pd = eq->subDict("parameters");
                    for (const auto& key : pd->keys())
                    {
                        if (!pd->hasDimensions(key))
                            throw std::runtime_error("DistillationColumn: lnKa"
                                " parameter `" + key + "` carries no unit"
                                " (write `-` for a pure number).");
                        prm.push_back({key, {pd->lookupScalar(key), pd->dimensionsOf(key)}});
                        known.push_back(key);
                    }
                }
                Formula::Resolver resolve = [&](const std::string& id)
                    -> std::optional<Formula::Symbol>
                {
                    Formula::Symbol sy;
                    if (id == "T") { sy.slot = 0; sy.dims = Dims::temperature; return sy; }
                    for (const auto& pr : prm)
                        if (pr.first == id)
                        { sy.constant = true; sy.value = pr.second.first;
                          sy.dims = pr.second.second; return sy; }
                    return std::nullopt;
                };
                Formula::TableResolver noTables =
                    [](const std::string&) -> std::shared_ptr<const Formula::Table>
                    { return nullptr; };
                lnKaFormula = std::make_shared<Formula>(Formula::compile(
                    text, resolve, noTables,
                    "DistillationColumn '" + dict->name() + "' reaction.equilibrium.lnKa",
                    known));
                if (lnKaFormula->dims() != Dims::dimensionless)
                    throw std::runtime_error("DistillationColumn: `lnKa` must be"
                        " dimensionless (it is the logarithm of an activity"
                        " quotient); write the temperature as `T / Kelvin` with"
                        " `Kelvin 1 K;` among the parameters.");
                if (eq->found("validity"))
                {
                    auto vd = eq->subDict("validity");
                    kaTmin = vd->lookupScalar("Tmin", Dims::temperature);
                    kaTmax = vd->lookupScalar("Tmax", Dims::temperature);
                }
            }
        }
    }
    //  ln K_a(T): THE ONE HOME of the equilibrium constant, whatever form the
    //  case declared.  `Ka298`/`dHrxn`/`Ka` keep their arithmetic exactly (the
    //  logarithm of the same product), so the esterification columns are
    //  byte-identical.  `fromRecords` is ln K_a = -Sum nu_i [g_ig,i(T)/(R T) +
    //  ln(Psat_i(T)/P0)] on the SAME records that price the energy rows, so a
    //  column cannot carry one heat of reaction in its K and another in its
    //  energy balance; it needs no more than the records and refuses by name
    //  where one lacks a datum.
    auto lnKaAt = [&](scalar T) -> scalar {
        if (kaForm == KaForm::formula)
            return lnKaFormula->evaluate(std::vector<scalar>{T});
        if (kaForm == KaForm::records)
        {
            //  The pure-liquid standard state of each species is the liquid
            //  in equilibrium with its own ideal-gas datum:
            //  mu_L = g_ig + RT ln(f_ref/P0), f_ref the package's reference
            //  fugacity (Psat for an ideal vapour; phi_sat Psat exp(Vliq (P -
            //  Psat)/RT) for a real one -- C235, the same factor K reads).
            const scalar Rg = 8.314462, P0 = 1.0e5;
            scalar acc = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                if (nu[i] == 0.0) continue;
                acc += nu[i] * (thermo.comp(i).g_pure_ig(T) / (Rg * T)
                                + std::log(thermo.pureLiquidReference(i, T, P) / P0));
            }
            return -acc;
        }
        return std::log(Ka298 * std::exp(-dHrxn / 8.314462 * (1.0/T - 1.0/298.15)));
    };
    const std::size_t nRx = rxStages.size();
    std::vector<int> extentOf(N, -1);
    for (std::size_t k = 0; k < nRx; ++k) extentOf[rxStages[k]] = static_cast<int>(k);

    //  A REACTIVE FULL MESH PRICES THE HEAT OF REACTION ON THE ELEMENTS DATUM
    //  AND ON NOTHING ELSE (C231): every species that reacts must carry its
    //  formation datum, or the energy rows would silently lose the reaction
    //  heat (the sensible-datum fallback deletes it).  Refused by name here.
    if (reactive && fullMeshWord)
    {
        if (!hs.formation)
            throw std::runtime_error("DistillationColumn '" + dict->name()
                + "': a reactive full MESH needs the formation (elements)"
                " datum, because the heat of reaction rides on it and the"
                " stage energy rows carry no separate reaction term; the feeds"
                " fall back to the sensible datum (see the enthalpy-GAP"
                " announcement above).  Supply `standardThermochemistry` for"
                " the species.");
        for (std::size_t i = 0; i < n; ++i)
        {
            if (nu[i] == 0.0) continue;
            try { (void)thermo.comp(i).h_pure_ig(298.15);
                  if (kaForm == KaForm::records)
                      (void)thermo.comp(i).g_pure_ig(298.15); }
            catch (const std::exception& e)
            {
                throw std::runtime_error("DistillationColumn '" + dict->name()
                    + "': the reacting species '" + thermo.comp(i).name()
                    + "' has no formation datum the reactive full MESH can"
                    " price (" + std::string(e.what()).substr(0,
                        std::string(e.what()).find('\n')) + ").  The heat of"
                    " reaction is the difference of the species' formation"
                    " enthalpies on the elements datum; declare"
                    " `standardThermochemistry { dHf_298 ...; s_298 ...; }` in"
                    " the component record (or a case-local overlay) -- no"
                    " value is invented.");
            }
        }
        if (kaForm == KaForm::records)
        {
            //  The announced origin of every datum that is an ESTIMATE: K_a and
            //  the heat of reaction inherit its error.
            for (std::size_t i = 0; i < n; ++i)
            {
                if (nu[i] == 0.0) continue;
                for (const char* fld : { "dHf_298", "dGf_298", "s_298" })
                {
                    const OriginInfo oi = thermo.comp(i).provenanceFor(fld);
                    if (oi.origin != Origin::estimated) continue;
                    const std::string msg = "column '" + dict->name()
                        + "': K_a(T) `fromRecords` and the heat of reaction"
                        " inherit the ESTIMATED " + std::string(fld)
                        + " of '" + thermo.comp(i).name() + "' ("
                        + (oi.method.empty() ? "estimate" : oi.method)
                        + "); an error in it is an error in the equilibrium"
                        " constant (exp of the Gibbs error / RT).  Hold the"
                        " result against a measured K_a(T) before trusting it.";
                    if (AdvisoryLog::instance().addAnnouncedOnce(
                            "ka-estimated:" + thermo.comp(i).name() + ":" + fld,
                            "approximation", "warning",
                            "distillationColumn '" + dict->name() + "' K_a(T)", msg))
                        std::cerr << "  [reaction] " << msg << "\n";
                }
            }
        }
    }

    const std::size_t nv = n;                      // vars per stage
    const std::size_t nExtents = kinetic ? 0 : nRx; // kinetic: extent is COMPUTED, not an unknown
    const std::size_t nU = N * nv + nExtents;

    //  EVERY MESH SOLVES ON DIMENSIONLESS BALANCES (DEV.md §5 A7, 2026-09-27;
    //  taken first for the kinetic column alone, then for every column).  A
    //  component balance is a molar flow (kmol/s); the bubble-point row beside
    //  it, Sum(y) - 1, is a pure number.  newtonND takes ONE absolute
    //  tolerance and ONE line-search merit, ||F||_2, over both, so on a small
    //  column (column05's feeds are ~1e-5 kmol/s) the balances weighed 1e-5
    //  of the Sum(y) rows and the 1e-9 tolerance let a balance stay open by
    //  ~5e-5 of the feed.  On the kinetic column that failed twice, measured
    //  on column05's system: a charge whose imbalance stayed under 1e-9
    //  kmol/s was never solved at all (ZERO Newton iterations, the profile
    //  left non-reactive), and a larger one was refused by the line search
    //  (alpha fell to 1/32 and the run stalled at a floor proportional to the
    //  charge).  The same absolute tolerance on a column fed 1e-8 kmol/s is
    //  met by the SEED wherever the seed already satisfies the other rows --
    //  which is what `check_degenerate_limits` A8 runs to see it.
    //
    //  WHICH SCALE, and why not a per-row one.  src/solver/Convergence.H
    //  normalises a residual by the terms its equation balances.  Summed over
    //  the stages a column's component balances TELESCOPE: the internal L and
    //  V cancel and what is left is feed = products, so what the column
    //  balances is its feed.  Dividing every balance row by the total feed
    //  makes it a fraction of what enters -- exactly the closure a reader
    //  checks -- and it is a CONSTANT row scale, so the Newton direction and
    //  the root are unchanged; only what the tolerance and the line search
    //  count as progress moves.  The per-row alternative (each row over the
    //  sum of its own |terms|) was measured and rejected: it inflates a trace
    //  component's row by the inverse of its own ~1e-10 flows, asking for a
    //  relative precision the finite-difference Jacobian cannot resolve, and
    //  it moves with the iterate -- 11 of the corpus's 15 MESH cases failed
    //  to converge under it, and the other four took 13-60 iterations where
    //  the feed scale takes 5-20 on all but stripper02.
    const scalar balanceScale = 1.0 / totFeed;     // totFeed > Bf > 0 (above)
    if (verbosity >= 2)
    {
        std::ostringstream f;                      // leave std::cout's format as found
        f << std::scientific << std::setprecision(4) << totFeed;
        std::cout << "  [solver] MESH: each component balance"
                     " is divided by the total feed (" << f.str() << " kmol/s),"
                     " so it is a fraction like the Sum(y) - 1 row beside it and"
                     " the 1e-9 tolerance is relative\n";
    }

    // Reaction rate r [mol/(g_cat·s)] at a stage (pseudo-homogeneous or adsorption
    // LHHW).  a_i = γ_i x_i; for the adsorption model a'_i = K_i a_i / M_i and the
    // rate is divided by (Σ a'_i)².  Forward over the declared forward orders
    // (Reaction::forwardOrder), reverse over the products (ν>0) at their
    // stoichiometry.  The stage extent is then r · m_cat (per stage).
    //
    //  AN ABSENT SPECIES IS THE SAME LIMIT ON BOTH LEGS (D06, 2026-09-27).
    //  This loop used to multiply only when a > 0 and then patch the forward
    //  leg alone -- `else if (nu < 0) af = 0` -- so an ABSENT PRODUCT left
    //  `ar` at 1.0: the reverse rate priced as though that product sat at
    //  unit activity.  Reachable two ways: a Newton trial that drives a
    //  product's x to or below zero (the clamp below makes it exactly zero,
    //  and the residual then jumped by kr·Π(others) across that boundary),
    //  and an adsorption law whose product had no K.  The rule is now the
    //  one RateLaw::netRate and every reactor in reactor/, batch/ and
    //  dynamic/ already use: a^p with p > 0 is 0 at a = 0, on BOTH legs, by
    //  std::pow and with no special case -- so the two legs cannot be
    //  patched apart again.  For a > 0 and a mass-action order (order = |nu|)
    //  the arithmetic is unchanged.
    auto rateAt = [&](const sVector& xj, scalar Tj, const sVector& gam) -> scalar {
        if (kineticExpr)
        {
            //  The law WRITTEN in the case (C233): T, P, x[i] and the activities
            //  a[i] = gamma_i x_i the package prices at this stage.  Returns
            //  kmol/(kg s), numerically mol/(g s) -- the unit the extent below
            //  multiplies by the catalyst mass in grams.  A non-finite value
            //  (a_MeOH -> 0) throws from the law; the trial wrapper turns it
            //  into an infeasible trial, never a floor.
            sVector act(n, 0.0);
            for (std::size_t i = 0; i < n; ++i) act[i] = gam[i] * xj[i];
            RateState st;
            st.T = Tj; st.P = P; st.x = &xj; st.act = &act;
            return exprLaw->netRate(thermo, st);
        }
        const scalar Rg = 8.314462;
        const scalar kf = kfA * std::exp(-kfEa / (Rg * Tj));
        const scalar kr = krA * std::exp(-krEa / (Rg * Tj));
        scalar af = 1.0, ar = 1.0, sumA = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar a = std::max(gam[i] * xj[i], 0.0);
            if (adsorption) a = Kads[i] * a / thermo.comp(i).MW();   // a'_i
            sumA += a;
            if (order[i] != 0.0) af *= std::pow(a, order[i]);
            if (nu[i]    >  0.0) ar *= std::pow(a, nu[i]);
        }
        scalar r = kf * af - kr * ar;
        if (adsorption) r /= std::max(sumA * sumA, 1.0e-300);
        return r;
    };

    // Pack/unpack u = [x_{0,0..n-2}, T_0, x_{1,...}, T_1,...].
    auto unpack = [&](const sVector& u, std::size_t j, sVector& xj, scalar& Tj) {
        xj.assign(n, 0.0);
        scalar s = 0.0;
        for (std::size_t i = 0; i + 1 < n; ++i) { xj[i] = u[j*nv + i]; s += xj[i]; }
        xj[n-1] = 1.0 - s;
        Tj = u[j*nv + (n-1)];
    };
    //  A STATE WITH A NEGATIVE MOLE FRACTION IS NOT A STATE (C245 slice 2,
    //  kernel audit Rank 1/2).  The box of the Newton (below) keeps every
    //  carried x_i >= 0 by the fraction-to-boundary rule, but 1 - sum(x) is a
    //  linear inequality a box cannot hold; a trial that breaks it is REFUSED
    //  here -- the solver's own "shorten the step" -- instead of being priced
    //  at a clamped composition.
    //  The room is 0.05, not rounding: measured 2026-11-08, a refusal at
    //  1e-9 (or 1e-6) makes the face 1 - sum(x) = 0 a WALL -- every Newton
    //  step that points through it is shortened to nothing and column05
    //  went from 17 to 285 iterations, column19/20's CMO seed stopped
    //  NOT converged; at 0.05 they converge in 20 / 16 / 16.  What 0.05
    //  refuses is a composition no stage model could price.
    constexpr scalar kFractionRoom = 0.05;
    //  The refusals below belong to the bounded contract.  A case may DECLARE
    //  `newton legacy;` in the column's operation to keep the legacy Newton
    //  and its legacy residual (DEV.md 4c C245 slice 3, C246 knob 1): the
    //  default is the bounded Armijo contract for every package, aqueous
    //  chemistry included -- stripper01 and column13 converge in 6 iterations
    //  under it (measured 2026-11-08); stripper02, a heel case (NH4HS in the
    //  liquid, V -> 1), stalls at |F| = 1.1e-2 and declares legacy.
    //  ONE HOME for the choice (DEV.md 4c C246 (3)): the operation's
    //  `newton bounded|legacy` and the solverDict block's
    //  `distillationColumn { lineSearch armijo|none; }` mean the same thing
    //  (armijo = bounded, none = legacy); a case declares it ONCE, and both
    //  at once is refused.  The block's keys reach `dict` through
    //  buildAugmentedDict, so they are read here as top-level entries.
    std::string newtonWord =
        operDict->lookupWordOrDefault("newton", "bounded");
    if (newtonWord != "bounded" && newtonWord != "legacy")
        throw std::runtime_error("DistillationColumn(simultaneous): operation"
            " `newton` must be `bounded` (default) or `legacy`, got '"
            + newtonWord + "'");
    if (dict->found("lineSearch"))
    {
        if (operDict->found("newton"))
            throw std::runtime_error("DistillationColumn(simultaneous): both"
                " operation `newton " + newtonWord + ";` and solverDict"
                " `lineSearch " + dict->lookupWord("lineSearch") + ";` are"
                " declared.  They are ONE choice (armijo = newton bounded,"
                " none = newton legacy): declare it once.");
        const std::string ls = dict->lookupWord("lineSearch");
        if (ls != "armijo" && ls != "none")
            throw std::runtime_error("DistillationColumn(simultaneous): solverDict"
                " `lineSearch` must be `armijo` (default) or `none` (the legacy"
                " Newton), got '" + ls + "'");
        newtonWord = (ls == "none") ? "legacy" : "bounded";
        if (verbosity >= 1)
            std::cout << "  [solver] column Newton: lineSearch " << ls
                      << " (system/solverDict)\n";
    }
    const bool meshBoxed = (newtonWord != "legacy");
    //  Switched off for phase 1 of a reactive column (see there).
    bool refuseFractions = true;
    auto requireFractions = [&](const sVector& xj)
    {
        if (!meshBoxed || !refuseFractions) return;
        for (std::size_t i = 0; i < n; ++i)
            if (!(xj[i] >= -kFractionRoom))
                throw InfeasibleTrial("DistillationColumn(simultaneous): a MESH"
                    " trial has x_" + std::to_string(i) + " = "
                    + std::to_string(xj[i]) + " < 0 (infeasible trial)");
    };

    // Residual: n-1 component balances + bubble-point per stage (+ reaction).
    //  rxnActive is a HOMOTOPY switch: phase 1 solves the column with the
    //  reaction OFF (extents driven to 0 -- robust, converges in a few iters);
    //  phase 2 turns the reaction ON, seeded from the converged non-reactive
    //  profile.  This is the standard way to converge reactive distillation.
    bool rxnActive = false;
    scalar mCatScale = 1.0;                            // catalyst-mass continuation (kinetic mode)
    //  The equilibrium-mode K_a continuation (phase 2, below): the reactive
    //  row reads  ln Q - ln K_a - (1 - s) * lnOffset_k,  so s = 1 is the
    //  column the case declared and s = 0 is the seed's own quotient.
    scalar homotopyS = 1.0;
    sVector lnOffset(nRx, 0.0);

    //  A STAGE REFUSAL ON A NEWTON TRIAL IS A FACT ABOUT THE TRIAL.  After
    //  the seed has been priced, every stage model has shown it can price
    //  this column; a refusal the Newton provokes later (the line search
    //  probing a full step that puts a reactive stage at 63 K, or its
    //  solvent below zero) says the TRIAL is not a state, and it becomes an
    //  InfeasibleTrial -- the solver's own "shorten the step", never an
    //  answer.  Found by this slice on stripper02: with the balances
    //  dimensionless its Newton sat on the same |F| ~ 0.012 plateau the old
    //  one sat on, probed the same absurd full step, and the old run survived
    //  it only because its accept/reject pattern happened to differ.  A
    //  refusal at the SEED still propagates (a missing record refuses there),
    //  and the converged profile is re-priced below with no such catch, so
    //  nothing refused is ever inside an answer.  Announced once, after the
    //  search, like every stage aid.
    std::atomic<bool> seedPriced{false};
    std::atomic<bool> trialRefused{false};
    std::string       trialRefusal;                    // first message, for the announcement
    std::mutex        trialRefusalLock;
    auto stageKOnTrial = [&](scalar Tj, const sVector& xj) -> sVector
    {
        try
        {
            //  C245 3d: the incipient-vapour iteration's verdict is read; a
            //  trial whose vapour did not converge is REFUSED, not priced on
            //  the last iterate.  (No warm start from a shared "last accepted
            //  vapour": the MESH residual runs its FD columns in parallel and
            //  must stay a pure function of its argument.)
            bool vapOk = true;
            const sVector Kj = stageVapourK(thermo, Tj, P, xj, nullptr, &vapOk);
            if (!vapOk)
                throw InfeasibleTrial("DistillationColumn: the incipient-"
                    "vapour iteration did not converge on this MESH trial");
            return Kj;                                    // at its own vapour (C169)
        }
        catch (const InfeasibleTrial&) { throw; }
        catch (const std::exception& e)
        {
            if (!seedPriced.load()) throw;
            if (!trialRefused.exchange(true))
            {
                std::lock_guard<std::mutex> g(trialRefusalLock);
                const std::string w = e.what();
                trialRefusal = w.substr(0, w.find('\n'));
            }
            throw InfeasibleTrial(std::string("a stage could not price this"
                " MESH trial: ") + e.what());
        }
    };
    //  The kinetic extent of a stage on a Newton trial.  A law that has no
    //  value at the trial (a_MeOH -> 0 under Rehfinger & Hoffmann's 1/a_MeOH,
    //  a non-finite rate) is a fact about the TRIAL: it becomes an
    //  InfeasibleTrial, announced, and the step is shortened.  No floor is
    //  hidden here; a floor, if the case wants one, is WRITTEN in its law.
    auto rateOnTrial = [&](const sVector& xj, scalar Tj) -> scalar
    {
        try { return rateAt(xj, Tj, thermo.activity().gamma(Tj, xj)); }
        catch (const InfeasibleTrial&) { throw; }
        catch (const std::exception& e)
        {
            if (!seedPriced.load()) throw;
            if (!trialRefused.exchange(true))
            {
                std::lock_guard<std::mutex> g(trialRefusalLock);
                const std::string w = e.what();
                trialRefusal = w.substr(0, w.find('\n'));
            }
            throw InfeasibleTrial(std::string("the kinetic law has no value at"
                " this MESH trial: ") + e.what());
        }
    };
    auto announceTrialRefusals = [&]()
    {
        if (!trialRefused.load() || verbosity < 1) return;
        std::cout << "  [solver] a MESH line-search trial could not be priced by"
                     " a stage model (first: \"" << trialRefusal << "\") -- each"
                     " such trial was treated as INFEASIBLE and the step"
                     " shortened.  A solver aid on the PATH only: the seed and"
                     " the converged profile are priced without it.\n";
        trialRefused.store(false);
    };

    auto residual = [&](const sVector& u) -> sVector {
        std::vector<sVector> x(N), y(N), K(N);
        sVector T(N);
        for (std::size_t j = 0; j < N; ++j) {
            unpack(u, j, x[j], T[j]);
            requireFractions(x[j]);
            K[j] = stageKOnTrial(T[j], x[j]);
            y[j].assign(n, 0.0);
            for (std::size_t i = 0; i < n; ++i) y[j][i] = K[j][i] * x[j][i];
        }
        sVector g(nU, 0.0);
        for (std::size_t j = 0; j < N; ++j) {
            const int ext = reactive ? extentOf[j] : -1;
            scalar xi = 0.0;                               // molar extent on stage j [kmol/s]
            if (ext >= 0 && rxnActive)
            {
                if (kinetic)                               // computed from the rate × catalyst mass
                {
                    xi = rateOnTrial(x[j], T[j]) * mCatPerStage * mCatScale / 1000.0;
                }
                else
                    xi = u[N*nv + ext];                    // equilibrium: a free unknown
            }
            for (std::size_t i = 0; i + 1 < n; ++i) {       // M_{j,i}  (out − in − generation)
                scalar m;
                if (j == 0)                                  // stage 1 (see readCondenserType)
                    m = L[0]*x[0][i] + D*y[0][i] - V[1]*y[1][i];
                else if (j == N-1)                           // partial reboiler
                    m = V[N-1]*y[N-1][i] + Bf*x[N-1][i]
                        + Udraw[N-1]*x[N-1][i] + Wdraw[N-1]*y[N-1][i]
                        - L[N-2]*x[N-2][i] - Ffeed[N-1]*zfeed[N-1][i];
                else                                         // any interior stage
                    m = (L[j] + Udraw[j])*x[j][i] + (V[j] + Wdraw[j])*y[j][i]
                        - L[j-1]*x[j-1][i] - V[j+1]*y[j+1][i] - Ffeed[j]*zfeed[j][i];
                if (ext >= 0) m -= nu[i] * xi;              // reaction generation ν_i·ξ_j
                g[j*nv + i] = m * balanceScale;             // a fraction of the feed
            }
            scalar sy = 0.0;                                // E_j: Σ y − 1
            for (std::size_t i = 0; i < n; ++i) sy += y[j][i];
            g[j*nv + (n-1)] = sy - 1.0;
        }
        // Reactive-stage equilibrium residuals:  Σ_i ν_i ln(γ_i x_i) − ln K_a = 0.
        // (Kinetic mode has no extent unknowns -- the extent is computed above.)
        if (reactive && !kinetic)
            for (std::size_t k = 0; k < nRx; ++k)
            {
                if (!rxnActive) { g[N*nv + k] = u[N*nv + k]; continue; }   // phase 1: ξ_k -> 0
                const std::size_t j = rxStages[k];
                const sVector gam = thermo.activity().gamma(T[j], x[j]);
                scalar lnQ = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                    if (nu[i] != 0.0)
                    {
                        //  gamma x <= 0 has no logarithm: a refused trial, not
                        //  ln(1e-300) = -690.8 with a flat Jacobian column
                        //  (C245 slice 2; the seed floor keeps the start > 0)
                        const scalar a = gam[i] * x[j][i];
                        if (meshBoxed && !(a > 0.0))
                            throw InfeasibleTrial("DistillationColumn(simultaneous):"
                                " a reactive-stage trial has gamma x <= 0 for '"
                                + thermo.comp(i).name() + "' (infeasible trial)");
                        lnQ += nu[i] * std::log(meshBoxed ? a : std::max(a, 1.0e-300));
                    }
                g[N*nv + k] = lnQ - lnKaAt(T[j])
                            - (1.0 - homotopyS) * lnOffset[k];
            }
        seedPriced.store(true);
        return g;
    };

    // Initial guess: linear T, feed composition at every stage; extents ξ_j = 0.
    //  Non-reactive: the primary feed z + a Tf-anchored ramp (unchanged).
    //  Reactive: the AVERAGED feed composition blended toward uniform (so all
    //  species, incl. products, are present -- avoids ln(0) in the equilibrium
    //  residual) and a T ramp spanning the components' boiling points (the cold
    //  feed T is a poor anchor for a hot reactive column).
    sVector zGuess = z;
    scalar Ttop = Tf - 5.0, Tbot = Tf + 15.0;
    if (reactive)
    {
        sVector zAvg(n, 0.0); scalar Ftot = 0.0;
        for (std::size_t j = 0; j < N; ++j)
        { for (std::size_t i = 0; i < n; ++i) zAvg[i] += Ffeed[j]*zfeed[j][i]; Ftot += Ffeed[j]; }
        if (Ftot > 0.0) for (auto& v : zAvg) v /= Ftot;
        zGuess.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) zGuess[i] = 0.5*zAvg[i] + 0.5/static_cast<scalar>(n);
        scalar tbMin = 1.0e9, tbMax = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        { const scalar tb = thermo.comp(i).Tb();
          if (tb > 0.0) { tbMin = std::min(tbMin, tb); tbMax = std::max(tbMax, tb); } }
        if (tbMax > tbMin) { Ttop = tbMin; Tbot = tbMax; }
        //  A REAL VAPOUR IS SEEDED AT THE PRESSURE'S SATURATION, NOT AT 1 atm
        //  (C235).  The ramp above spans the NORMAL boiling points, which at
        //  the column's P are subcooled states: an ideal vapour prices them
        //  smoothly (phi = 1), a cubic EoS has no vapour root there and
        //  returns the liquid-like root (phi ~ 0.05), so every K on the seed
        //  is a wild number and the CMO Newton starts in a nonphysical basin
        //  (column19 under SRK: stage temperatures of 140 K at iteration 4,
        //  stopped NOT converged).  With a non-ideal vapour both ends move to
        //  the coldest and hottest PURE SATURATION TEMPERATURE at P of the
        //  package's own curves (`pureSaturationTemperature`, capped at each
        //  Tc).  Measured on column19: a Trouton estimate overshot methanol's
        //  by 18 K and a ramp end above the C4s' Tc failed the (R, D) form,
        //  so the curve itself is read.  An ideal vapour keeps the ramp it
        //  always had, byte-identical.
        if (tbMax > tbMin && thermo.vapourFugacityDependsOnComposition())
        {
            scalar tsMin = 1.0e9, tsMax = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                if (!(zAvg[i] > 0.0)) continue;
                const scalar ts = pureSaturationTemperature(thermo, i, P);
                if (ts > 0.0) { tsMin = std::min(tsMin, ts); tsMax = std::max(tsMax, ts); }
            }
            if (tsMax > tsMin)
            {
                Ttop = tsMin;  Tbot = tsMax;
                if (verbosity >= 3)
                    std::cout << "  [seed] real-vapour package: the reactive T ramp is"
                                 " taken between the components' own saturation"
                                 " temperatures at P (" << Ttop << " -> " << Tbot
                              << " K) rather than at the normal boiling points\n";
            }
        }
    }
    //  The unit's OWN seed, built first and then offered to the case: linear T
    //  between the end guesses, `zGuess` on every stage.  A declared
    //  `stageProfile` block in `0/internalStates/<SECTOR>/<unit>` replaces
    //  both; with none the two
    //  vectors are exactly what this method has always packed into u0.
    sVector              Tseed(N, 0.0);
    std::vector<sVector> xseed(N, zGuess);
    for (std::size_t j = 0; j < N; ++j)
    {
        const scalar a = static_cast<scalar>(j) / static_cast<scalar>(N - 1);
        Tseed[j] = Ttop + a * (Tbot - Ttop);
    }
    seedFromDeclaredInterior(N, thermo, Tseed, xseed, verbosity, "simultaneous");

    sVector u0(nU, 0.0);
    for (std::size_t j = 0; j < N; ++j) {
        for (std::size_t i = 0; i + 1 < n; ++i) u0[j*nv + i] = xseed[j][i];
        u0[j*nv + (n-1)] = Tseed[j];
    }

    solver::NDOptions opts;
    opts.tolerance = 1.0e-9;
    opts.maxIter   = 80;
    opts.parallel  = true;     // the MESH residual is a pure function (thread-safe)

    //  THE SIMULTANEOUS MESH DECLARES ITS BOX AND TAKES THE ARMIJO CONTRACT
    //  (DEV.md 4c C245 slice 2; the full MESH below was slice 1's proof
    //  caller).  Every carried x_i in [0, 1]; every stage T in
    //  [0.5 Tsat,min, 1.2 Tsat,max] of the components fed (pure saturation at
    //  P), never so tight that the seed lies outside; the equilibrium extents
    //  free.  typX per block (x 0.1, T 300 K, extent = the total feed) turns
    //  the finite-difference step into h = sqrt(eps) max(|u|, typX), one-sided
    //  at a bound.  (V and L are not unknowns of this MESH; they are the CMO
    //  flows.)  The residual refuses -- InfeasibleTrial -- a trial with a
    //  negative mole fraction or gamma x <= 0 in the reactive row.
    //  EXCEPT where the case declares `newton legacy;` (stripper02: a heel
    //  case -- NH3 bound as NH4HS leaves the vapour balance as V -> 1 -- on
    //  which the monotone Armijo search stops NOT converged at |F| = 1.1e-2
    //  after 80 iterations, with the old K surface and with a continuous one
    //  alike, while the legacy search converges in 43; kernel audit Rank 3e,
    //  slice 3, check_stagek_continuity's docstring has the diagnosis).  The
    //  declaration is announced: a solver aid is visible and the student's.
    if (!meshBoxed)
    {
        if (verbosity >= 1)
            std::cout << "  [solver] simultaneous MESH: `newton legacy;` is"
                         " DECLARED by the case, so the legacy Newton (monotone"
                         " line search, no bounds, clamped residual) is used"
                         " instead of the bounded Armijo contract\n";
    }
    else
    {
        scalar tsMin = 0.0, tsMax = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            bool fed = false;
            for (std::size_t j = 0; j < N && !fed; ++j)
                fed = Ffeed[j] > 0.0 && zfeed[j][i] > 0.0;
            if (!fed) continue;
            const scalar ts = pureSaturationTemperature(thermo, i, P);
            if (!(ts > 0.0)) continue;
            tsMin = (tsMin > 0.0) ? std::min(tsMin, ts) : ts;
            tsMax = std::max(tsMax, ts);
        }
        constexpr scalar inf = std::numeric_limits<scalar>::infinity();
        opts.lower.assign(nU, -inf);
        opts.upper.assign(nU,  inf);
        opts.typX.assign(nU, 1.0);
        for (std::size_t j = 0; j < N; ++j)
        {
            for (std::size_t i = 0; i + 1 < n; ++i)
            {
                opts.lower[j*nv + i] = 0.0;
                opts.upper[j*nv + i] = 1.0;
                opts.typX[j*nv + i]  = 0.1;
            }
            opts.typX[j*nv + (n-1)] = 300.0;
            if (tsMax > 0.0)
            {
                opts.lower[j*nv + (n-1)] = std::min(0.5 * tsMin, 0.9 * Tseed[j]);
                opts.upper[j*nv + (n-1)] = std::max(1.2 * tsMax, 1.1 * Tseed[j]);
            }
        }
        for (std::size_t k = 0; k < nExtents; ++k) opts.typX[N*nv + k] = totFeed;
        opts.globalisation = solver::Globalisation::armijo;
        //  The per-unknown step caps a case may declare (DEV.md 4c C246 (3)):
        //  `maxStepT` (K per stage temperature) and `maxStepX` (mole-fraction
        //  change per iteration).  Absent = no cap, as before.  Extents are
        //  uncapped.  Announced with the value: the aid is the student's.
        if (dict->found("maxStepT") || dict->found("maxStepX"))
        {
            const scalar mT = dict->found("maxStepT")
                ? dict->lookupScalar("maxStepT")
                : std::numeric_limits<scalar>::infinity();
            const scalar mX = dict->found("maxStepX")
                ? dict->lookupScalar("maxStepX")
                : std::numeric_limits<scalar>::infinity();
            if (!(mT > 0.0))
                throw std::runtime_error("DistillationColumn(simultaneous):"
                    " solverDict `maxStepT` must be > 0 K, got "
                    + std::to_string(mT));
            if (!(mX > 0.0))
                throw std::runtime_error("DistillationColumn(simultaneous):"
                    " solverDict `maxStepX` must be > 0, got "
                    + std::to_string(mX));
            opts.maxStep.assign(nU, std::numeric_limits<scalar>::infinity());
            for (std::size_t j = 0; j < N; ++j)
            {
                for (std::size_t i = 0; i + 1 < n; ++i) opts.maxStep[j*nv + i] = mX;
                opts.maxStep[j*nv + (n-1)] = mT;
            }
            if (verbosity >= 1)
                std::cout << "  [solver] column Newton step caps (system/solverDict):"
                          << (dict->found("maxStepT") ? " maxStepT = " + std::to_string(mT) + " K" : "")
                          << (dict->found("maxStepX") ? " maxStepX = " + std::to_string(mX) : "")
                          << "\n";
        }
    }
    if (!meshBoxed && (dict->found("maxStepT") || dict->found("maxStepX")))
        throw std::runtime_error("DistillationColumn(simultaneous): solverDict"
            " maxStepT / maxStepX cap the bounded Newton's step and are not"
            " read by the legacy Newton (`newton legacy;` / `lineSearch none;`);"
            " a declared cap nothing reads is refused.");

    //  THE MESH JACOBIAN IS BLOCK-TRIDIAGONAL, AND THE SOLVER IS TOLD SO.
    //  Stage j's residual sees only stages j-1, j, j+1 (measured on the
    //  corpus before this was written: max off-band |J| = 0, exactly).
    //  Declaring the structure buys the Curtis-Powell-Reid colored
    //  Jacobian -- ~3*nv residual evaluations per iteration, INDEPENDENT
    //  of the stage count, where dense costs N*nv -- and a block-Thomas
    //  solve.  The declaration is VERIFIED on the first iteration against
    //  the dense Jacobian and refuses by name if false; the measured
    //  off-band maximum is announced below, because a declared structure
    //  is a solver aid and aids report aloud (the no-silent-crutch rule).
    opts.blockTri = { N, nv };
    if (verbosity >= 3)
        opts.onIter = [this](const solver::NDTrace& tr) {
            recordResidual(tr.normF);
        };
    //  THE MESH NEWTON WALKS, AND SAYS SO.
    //
    //  Every residual evaluation below prices a stage at a composition the
    //  Newton invented, and all but the last are thrown away.  Advisories
    //  raised in here are facts about the PATH -- on a reactive column,
    //  ~99 of them for four stages -- and the caveat block would otherwise
    //  bury the handful that describe the converged profile among them.
    //
    //  The frame is opened around the whole campaign, on this thread, never
    //  inside the residual: `opts.parallel` runs the finite-difference
    //  Jacobian on a pool, and the workers raising advisories underneath are
    //  exactly who this frame speaks for (core/Advisory.H).  It closes here,
    //  so the reporting passes below -- which re-price every stage at the
    //  CONVERGED profile -- raise their advisories unmarked, and those are
    //  the ones a reader meets in full.
    //  Named from the flowsheet's own `name` where the author declared one,
    //  so two columns in one flowsheet are told apart; the type is the
    //  honest fallback when nothing named it.
    AdvisoryFrame walk(
        //  The augmented dict carries the unit's name as the DICTIONARY'S OWN
        //  name and strips the `name` entry: lookupWordOrDefault("name") took
        //  the fallback every time, so every column in the corpus framed its
        //  MESH search as "column 'distillationColumn'" -- the type, naming
        //  none of them.  ShortcutColumn.cpp records the same finding.
        "column '" + (dict->name().empty() ? type() : dict->name())
        + "' MESH search");

    //  PHASE 1 OF A REACTIVE COLUMN KEEPS THE LEGACY NEWTON (C245 slice 2,
    //  measured 2026-11-08 on column05 and the kinetic column05 probe).  With
    //  the reaction off, the products nobody feeds (water, methyl acetate)
    //  sit EXACTLY on x = 0, a degenerate face: the bounded Armijo search
    //  stalls against it (|F| = 1.0 after 37 iterations, x_water = -0.05 on
    //  the refusal wall) and the unconverged iterate then seeded phase 2 / the
    //  full MESH, which failed.  Phase 1 only seeds, so it takes the legacy
    //  search, without the box or the refusals; phase 2 -- where every species
    //  of the quotient is lifted off zero -- takes the bounded contract.
    //  Announced below.
    const solver::NDOptions boxedOpts = opts;
    if (reactive && meshBoxed)
    {
        opts.lower.clear();
        opts.upper.clear();
        opts.typX.clear();
        opts.globalisation = solver::Globalisation::legacy;
        refuseFractions = false;
        if (verbosity >= 2)
            std::cout << "  [solver] reactive column phase 1 (reaction off,"
                         " products at x = 0): legacy Newton, no box; the"
                         " bounded Armijo contract is taken from phase 2\n";
    }
    auto res = solver::newtonND(residual, u0, opts);   // phase 1: reaction OFF (robust)
    if (reactive && meshBoxed)
    {
        opts = boxedOpts;
        refuseFractions = true;
    }
    //  UNDER THE FULL MESH THE CMO IS ONLY THE SEED, and it is the NON-REACTIVE
    //  one: the reaction enters through the full MESH's own homotopy below
    //  (C231, announced).
    if (reactive && !fullMeshWord)
    {
        rxnActive = true;                              // phase 2: reaction ON, seeded from phase 1
        if (kinetic)                                   // ramp the catalyst mass (continuation):
            for (scalar s : {0.01, 0.05, 0.2, 0.5, 1.0})   // a fast rate is stiff if switched on whole
            { mCatScale = s; res = solver::newtonND(residual, res.x, opts); }
        else
        {
            //  THE EQUILIBRIUM PHASE 2: SEED THE QUOTIENT OFF ZERO, THEN RAMP
            //  K_a FROM WHERE THE SEED STANDS (DEV.md §5 A7, 2026-09-27).
            //
            //  Phase 1 carries no reaction, so a product nobody feeds leaves it
            //  at x = 0 -- measured on column05, slightly BELOW zero (-4e-15)
            //  -- and ln(gamma x) is clamped at ln(1e-300) = -690.8.  The row
            //  ln Q - ln K_a then starts at ~730 on every reactive stage and,
            //  worse, is FLAT there: the clamp gives the Jacobian no column for
            //  the product, so a Newton cannot see which way to move it.  With
            //  the balances in kmol/s the old run got through anyway, because
            //  a balance weighing 1e-5 of the other rows let the line search
            //  ignore them (|F| 2.2e3 at the start, alpha 1/8, dT = 134 K
            //  steps); with dimensionless balances the same start diverged
            //  (exit 2, |F| 9e21).
            //
            //  Three routes were measured on column05 and on a 3 x 3 grid
            //  around it (Ka298 5 / 38.7 / 500 x reflux 1.5 / 2.1 / 4; the old
            //  engine converged 2 of the 9):
            //    * RAMP K_a alone (K = s K_a, s = 1e-6 ... 1): converged on 6
            //      of 9, and its first step spent 30 iterations climbing out of
            //      the clamp -- the ramp works AROUND the flat row, not on it;
            //    * SEED the quotient's species to 1e-4 alone: 5 of 9 (16
            //      iterations on column05 -- fewer than the old 29);
            //    * seed each stage to its own local chemical equilibrium: 50
            //      iterations on column05 with alpha crawling at 1/64.
            //  What is taken is the pair: every species in the quotient is
            //  raised to at least 1e-4 on each reactive stage (renormalised;
            //  the balances it disturbs are the Newton's to close), then the
            //  target is K_eff = K_a exp(-(1 - s) lnOffset), where lnOffset is
            //  the SEED's own ln Q - ln K_a -- so s = 0 is satisfied by the
            //  seed and s = 1 is the declared column.  The full step s = 1 is
            //  tried FIRST (16 iterations on column05, the shipped case); a
            //  step that fails is halved and retried from the last accepted
            //  s, a step that succeeds doubles.  9 of 9 on the grid, the SAME
            //  conversion wherever the older routes also converged.  Below
            //  1/64 it gives up and says so -- the column is then NOT
            //  converged, never quietly returned.
            constexpr scalar kQuotientSeedFloor = 1.0e-4;
            sVector uDone = res.x;
            for (std::size_t k = 0; k < nRx; ++k)
            {
                const std::size_t j = rxStages[k];
                sVector xj;
                scalar  Tj;
                unpack(uDone, j, xj, Tj);
                scalar sx = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                {
                    if (nu[i] != 0.0) xj[i] = std::max(xj[i], kQuotientSeedFloor);
                    sx += xj[i];
                }
                for (std::size_t i = 0; i + 1 < n; ++i) uDone[j*nv + i] = xj[i] / sx;
            }
            homotopyS = 1.0;                           // lnOffset is the seed's own quotient gap
            {
                const sVector g0 = residual(uDone);
                for (std::size_t k = 0; k < nRx; ++k) lnOffset[k] = g0[N*nv + k];
            }
            scalar sDone = 0.0, ds = 1.0;
            int    phase2Iters = 0;
            std::vector<scalar> accepted;
            while (sDone < 1.0 && ds >= 1.0 / 64.0)
            {
                homotopyS = std::min(1.0, sDone + ds);
                auto r = solver::newtonND(residual, uDone, opts);
                phase2Iters += r.iterations;
                if (r.converged)
                {
                    uDone = r.x;
                    sDone = homotopyS;
                    accepted.push_back(sDone);
                    ds    = std::min(2.0 * ds, 1.0 - sDone);
                }
                else
                    ds *= 0.5;
                res = r;
            }
            homotopyS = 1.0;
            res.converged  = res.converged && sDone >= 1.0;
            res.iterations = phase2Iters;
            if (verbosity >= 2)
            {
                std::ostringstream m;                  // leave std::cout's format as found
                m << "  [solver] equilibrium reactive column: every species"
                     " in the quotient seeded to >= " << kQuotientSeedFloor
                  << " on the reactive stages, then K_a reached from the"
                     " seed's own quotient in " << accepted.size()
                  << " continuation step(s) (s =";
                for (scalar a : accepted) m << " " << a;
                m << "; " << phase2Iters << " Newton iterations)"
                  << (sDone >= 1.0 ? "" : " -- NOT reached: the step fell"
                                          " below 1/64")
                  << "\n";
                std::cout << m.str();
            }
        }
    }
    announceTrialRefusals();

    if (verbosity >= 2 && res.stalledSteps > 0)
        std::cout << "  [solver] MESH: " << res.stalledSteps
                  << " floor-damped line-search step(s) were taken (the line"
                     " search exhausted without reducing |F|; announced,"
                     " limited by NDOptions::maxStalledSteps)\n";
    if (verbosity >= 2 && std::isfinite(res.offBandMax))
        std::cout << "  [solver] block-tridiagonal structure VERIFIED on the"
                     " first iteration: max |J| outside the bands = "
                  << std::scientific << std::setprecision(2) << res.offBandMax
                  << std::defaultfloat
                  << "; Jacobians built with 3-color finite differences ("
                  << res.jacobianEvals << " residual evaluations total)\n";

    std::vector<sVector> x(N);
    sVector T(N);
    for (std::size_t j = 0; j < N; ++j) unpack(res.x, j, x[j], T[j]);
    //  The converged extents [kmol/s] (equilibrium form), in one place for the
    //  KPIs: the CMO's unknowns, replaced by the full MESH's when it runs.
    sVector xiFinal(nRx, 0.0);
    if (reactive && !kinetic)
        for (std::size_t k = 0; k < nRx; ++k) xiFinal[k] = res.x[N*nv + k];
    scalar sumNuAll = 0.0;
    for (auto v : nu) sumNuAll += v;


    // ===== FULL-MESH refinement (Naphtali-Sandholm) =========================
    // `model fullMESH`: promote V_j, L_j to UNKNOWNS and add the per-stage TOTAL-
    // mass + ENERGY balances, SEEDED from the converged CMO profile (the cheap
    // bubble-point model bootstraps the rigorous one -- Vitor's idea).  The energy
    // balance lets V_j, L_j follow the REAL latent heats instead of assuming
    // equimolal overflow -> the enthalpy residual the CMO never carried.  Stage
    // 1 by condenser type (`readCondenserType`): TOTAL -- the top tray, with an
    // energy balance like any tray, the reflux R D entering it at its own
    // bubble point and V_1 = (R+1) D leaving it; PARTIAL -- the condenser
    // itself, V_1 = 0 and L_1 = R D, its duty free.  Reboiler: L_{N-1} = B.
    // The free duties are computed post hoc.  A REACTIVE full MESH (C231) adds
    // the equilibrium extents as unknowns after the stage blocks (and D, under
    // bottomsRate/boilupRatio); see the row comments in residualF.
    const std::string fmModel = dict->lookupWordOrDefault(
        "model", operDict->lookupWordOrDefault("method", "WangHenke"));
    if (fullMeshWord)
    {
        const std::size_t mv = n + 2;              // x_{0..n-2}, T, V, L per stage
        //  Unknown layout: N stage blocks, then the nRx equilibrium extents
        //  [kmol/s], then (bottomsRate/boilupRatio) the distillate D.
        const std::size_t iXi = N * mv;
        //  The equilibrium form carries nRx extent unknowns; the kinetic form
        //  COMPUTES each extent (rate x catalyst mass), so it carries none.
        const std::size_t nXiU = kinetic ? 0 : nRx;
        const std::size_t iD  = iXi + nXiU;
        const std::size_t mU  = iD + (specBoil ? 1 : 0);
        //  Reaction ON/OFF and the K_a continuation, as in the CMO MESH.
        bool    rxnOnF = false;
        scalar  sF = 1.0;
        sVector lnOffF(nRx, 0.0);
        scalar  totDrawF = 0.0;
        for (std::size_t j = 0; j < N; ++j) totDrawF += Udraw[j] + Wdraw[j];
        auto unpackF = [&](const sVector& w, std::size_t j, sVector& xj,
                           scalar& Tj, scalar& Vj, scalar& Lj) {
            xj.assign(n, 0.0); scalar s = 0.0;
            for (std::size_t i = 0; i + 1 < n; ++i) { xj[i] = w[j*mv+i]; s += xj[i]; }
            xj[n-1] = 1.0 - s;
            Tj = w[j*mv + (n-1)]; Vj = w[j*mv + n]; Lj = w[j*mv + n+1];
        };
        //  EVERY ROW DIMENSIONLESS HERE TOO (DEV.md §5 A7, 2026-09-27).  The
        //  material rows (component, total, the reflux and bottoms specs) are
        //  divided by the total feed, as in the CMO MESH above; the ENERGY
        //  rows by the total feed times the mean latent heat of the CMO
        //  profile's stage liquids, lambda = mean_j [hV(x_j) - hL(x_j)] --
        //  evaluated at ONE composition, so the enthalpy datum cancels and
        //  the scale is the heat that moves the column, per mole of feed.
        //  An energy row is then a fraction of the heat it takes to vaporise
        //  the feed.  In kW the energy rows had dominated the merit and a
        //  1e-7 kW tolerance meant a different thing on every column (1e-10
        //  of column06's latent load, 1e-11 of column07's); the material rows
        //  carried 1e-7 kmol/s, up to 3.6e-6 of column06's feed.  One
        //  tolerance, 1e-9, now means the same fraction on every row of every
        //  MESH.  Measured on the three fullMESH cases: 3-4 iterations as
        //  before, every golden row unmoved.
        scalar lambdaMean = 0.0;
        for (std::size_t j = 0; j < N; ++j)
            lambdaMean += std::abs(hs.hV(x[j], T[j]) - hs.hL(x[j], T[j]));
        lambdaMean /= static_cast<scalar>(N);
        if (!(lambdaMean > 0.0))
            throw std::runtime_error("DistillationColumn(fullMESH): the stage"
                " liquids' mean latent heat is not positive ("
                + std::to_string(lambdaMean) + " kJ/kmol) -- the energy rows"
                " have no scale to be measured against.");
        const scalar energyScale = balanceScale / lambdaMean;
        //  Each stage's feed enthalpy [kW], summed feed by feed, by the ONE
        //  home the duty block prices the same feeds with (`feedEnthalpy`):
        //  a feed resolved from its stream at its own resolution -- the
        //  equilibrium phases (x, y) when it splits -- and an inline `feeds`
        //  entry at its declared quality.  Until C169 the rows priced every
        //  feed on Hliquid / Hvapour while the duty priced it here, so the
        //  profile was solved against one feed enthalpy and the reboiler plug
        //  closed against another.  Fixed by the feeds, so computed once.
        std::vector<scalar> stageFeedEnthalpy(N, 0.0);
        for (const auto& r : feedRecords)
            stageFeedEnthalpy[r.j] += r.state
                ? feedEnthalpy(*r.state, r.F, r.T, r.P > 0.0 ? r.P : P, r.z, thermo, hs)
                : r.F * hs.hQuality(1.0 - r.q, r.z, r.T);
        if (verbosity >= 2)
        {
            std::ostringstream f;
            f << std::scientific << std::setprecision(4) << lambdaMean;
            std::cout << "  [solver] full-MESH: the material rows are divided by"
                         " the total feed and the energy rows by the total feed"
                         " times the stage liquids' mean latent heat ("
                      << f.str() << " kJ/kmol), so every row is a fraction and"
                         " the 1e-9 tolerance is relative\n";
        }
        auto residualF = [&](const sVector& w) -> sVector {
            std::vector<sVector> xs(N), ys(N);
            sVector Ts(N), Vs(N), Ls(N);
            for (std::size_t j = 0; j < N; ++j) {
                unpackF(w, j, xs[j], Ts[j], Vs[j], Ls[j]);
                const auto Kj = stageKOnTrial(Ts[j], xs[j]);
                ys[j].assign(n, 0.0);
                for (std::size_t i = 0; i < n; ++i) ys[j][i] = Kj[i]*xs[j][i];
            }
            auto hL = [&](const sVector& xx, scalar TT){ return hs.hL(xx, TT); };
            auto hV = [&](const sVector& yy, scalar TT){ return hs.hV(yy, TT); };
            sVector g(mU, 0.0);
            //  D: a declared constant, or an unknown (bottomsRate/boilupRatio).
            const scalar Dd = specBoil ? w[iD] : D;
            //  The stage extents in force, and the whole mole change they make.
            sVector xiKin(N, 0.0);                       // kinetic: xi_j = r(T_j, x_j, gamma_j) m_cat,j
            if (kinetic && rxnOnF)
                for (std::size_t k = 0; k < nRx; ++k)
                {
                    const std::size_t jr = rxStages[k];
                    xiKin[jr] = rateOnTrial(xs[jr], Ts[jr]) * mCatPerStage
                                * mCatScale / 1000.0;
                }
            auto xiOf = [&](std::size_t j) -> scalar {
                if (kinetic) return xiKin[j];
                const int e = reactive ? extentOf[j] : -1;
                return (e >= 0 && rxnOnF) ? w[iXi + static_cast<std::size_t>(e)] : 0.0;
            };
            scalar xiSum = 0.0;
            for (std::size_t j = 0; j < N; ++j) xiSum += xiOf(j);
            const scalar BfF = specBoil ? Bspec
                : (totFeed + sumNuAll*xiSum - Dd - totDrawF);
            for (std::size_t j = 0; j < N; ++j) {
                const scalar xij = xiOf(j);
                for (std::size_t i = 0; i + 1 < n; ++i) {        // component balances
                    scalar m;
                    if (j == 0)
                        m = Ls[0]*xs[0][i] + Dd*ys[0][i] - Vs[1]*ys[1][i];
                    else if (j == N-1)
                        m = Vs[N-1]*ys[N-1][i] + Ls[N-1]*xs[N-1][i]
                            + Udraw[N-1]*xs[N-1][i] + Wdraw[N-1]*ys[N-1][i]
                            - Ls[N-2]*xs[N-2][i] - Ffeed[N-1]*zfeed[N-1][i];
                    else
                        m = (Ls[j]+Udraw[j])*xs[j][i] + (Vs[j]+Wdraw[j])*ys[j][i]
                            - Ls[j-1]*xs[j-1][i] - Vs[j+1]*ys[j+1][i] - Ffeed[j]*zfeed[j][i];
                    if (xij != 0.0) m -= nu[i] * xij;            // generation nu_i xi_j
                    g[j*mv + i] = m * balanceScale;
                }
                scalar sy = 0.0; for (std::size_t i = 0; i < n; ++i) sy += ys[j][i];
                g[j*mv + (n-1)] = sy - 1.0;                       // summation
                if (j == 0)                                       // stage 1: its vapour
                    g[j*mv + n] = (partialCond ? Vs[0]            // partial: none rises
                                   : Vs[0] - (R + 1.0)*D)         // total: to the condenser
                                  * balanceScale;
                else if (j == N-1)
                    g[j*mv + n] = (Vs[N-1] + Ls[N-1] + Udraw[N-1] + Wdraw[N-1]
                                - Ls[N-2] - Ffeed[N-1] - sumNuAll*xij) * balanceScale;
                else
                    g[j*mv + n] = (Ls[j] + Vs[j] + Udraw[j] + Wdraw[j]
                                - Ls[j-1] - Vs[j+1] - Ffeed[j] - sumNuAll*xij) * balanceScale;
                if (j == 0 && partialCond && specBoil)
                    g[j*mv + n+1] = (Vs[N-1] - boilup*Bspec) * balanceScale;   // boil-up spec
                else if (j == 0 && partialCond)                    // energy / flow specs
                    g[j*mv + n+1] = (Ls[0] - R*D) * balanceScale;  // reflux = condenser liquid
                else if (j == 0)
                {
                    //  TOTAL CONDENSER: stage 1 is the TOP TRAY and balances its
                    //  enthalpy like any tray.  The reflux R D enters it as the
                    //  condensate of its own vapour, a saturated liquid at the
                    //  bubble point of y_1 -- the state the distillate leaves
                    //  in -- and (R+1) D leaves it as vapour; the liquid L_1 it
                    //  sends down is what the balance makes it, not R D.
                    sVector yD = ys[0];
                    { scalar sy0 = 0.0; for (auto v : yD) sy0 += v;
                      if (sy0 > 0.0) for (auto& v : yD) v /= sy0; }
                    //  C245 3c: the reflux temperature is an INNER bubble
                    //  point.  Its verdict was dropped, so a trial whose
                    //  bubble point did not converge fed an arbitrary T into
                    //  the energy row; now such a trial is refused.
                    bool refluxOk = true;
                    const scalar Treflux =
                        bubbleTWithItsVapour(thermo, yD, P, Ts[0], 1.0e-12,
                                             &refluxOk);
                    if (!refluxOk)
                        throw InfeasibleTrial("DistillationColumn: the reflux"
                            " bubble point (total condenser) did not converge"
                            " on this MESH trial");
                    g[j*mv + n+1] = energyScale * (
                          R*D*hL(yD, Treflux) + Vs[1]*hV(ys[1], Ts[1])
                        - Ls[0]*hL(xs[0], Ts[0]) - Vs[0]*hV(ys[0], Ts[0]));
                }
                else if (j == N-1)
                    g[j*mv + n+1] = (Ls[N-1] - BfF) * balanceScale; // bottoms spec
                else {                                             // ENERGY balance (enthalpy residual)
                    g[j*mv + n+1] = energyScale * (
                          Ls[j-1]*hL(xs[j-1],Ts[j-1]) + Vs[j+1]*hV(ys[j+1],Ts[j+1])
                        + stageFeedEnthalpy[j]
                        - (Ls[j]+Udraw[j])*hL(xs[j],Ts[j]) - (Vs[j]+Wdraw[j])*hV(ys[j],Ts[j]));
                }
            }
            //  Rows beyond the stage blocks.
            //  (1) the distillate, closed by stage 1's total balance:
            //      L_1 + D - V_2 - sumNu xi_1 = 0   (bottomsRate/boilupRatio);
            if (specBoil)
                g[iD] = (Ls[0] + Dd - Vs[1] - sumNuAll*xiOf(0)) * balanceScale;
            //  (2) one equilibrium row per reactive stage:
            //      sum_i nu_i ln(gamma_i x_i) - ln K_a(T_j) = 0, K_a eased in
            //      by the homotopy; with the reaction OFF the extent is held 0.
            if (reactive && !kinetic)
                for (std::size_t k = 0; k < nRx; ++k)
                {
                    if (!rxnOnF) { g[iXi + k] = w[iXi + k]; continue; }
                    const std::size_t j = rxStages[k];
                    const sVector gam = thermo.activity().gamma(Ts[j], xs[j]);
                    scalar lnQ = 0.0;
                    for (std::size_t i = 0; i < n; ++i)
                        if (nu[i] != 0.0)
                            lnQ += nu[i] * std::log(std::max(gam[i] * xs[j][i], 1.0e-300));
                    g[iXi + k] = lnQ - lnKaAt(Ts[j]) - (1.0 - sF) * lnOffF[k];
                }
            return g;
        };
        //  AN UNCONVERGED CMO PHASE SEEDS THE MESH ONLY AS AN ANNOUNCED SEED
        //  (DEV.md 4c C184 defect A).  This phase used to start on the model
        //  word alone: a CMO iterate that had NOT met its tolerance seeded the
        //  rigorous Newton in silence, and a full MESH that then converged was
        //  still reported NOT converged by the CMO's flag.  Seeds are the
        //  student's to own (no silent crutch), so: the failed bootstrap is
        //  announced with its stage count, iterations and residual; the
        //  rigorous Newton still runs from it (it solves different rows, and
        //  refusing would discard a run it may rescue); and the verdict is
        //  THE FULL MESH'S -- the equations the case declared -- never the
        //  bootstrap's.
        const bool cmoSeedFailed = !res.converged;
        auto fmtSci = [](scalar v) {
            std::ostringstream o;
            o << std::scientific << std::setprecision(3) << v;
            return o.str();
        };
        if (cmoSeedFailed)
        {
            const std::string msg = "column '" + dict->name() + "' (" + fmModel
                + "): the constant-molal-overflow phase that seeds the full"
                " MESH did NOT converge (" + std::to_string(N) + " stages, "
                + std::to_string(res.iterations) + " iterations, |F| = "
                + fmtSci(res.residual) + " against 1e-9).  The full"
                " MESH is started from that unconverged iterate as an"
                " ANNOUNCED seed; the verdict below is the full MESH's own.";
            AdvisoryLog::instance().add("solver", "warning",
                                        "distillationColumn", msg);
            std::cerr << "  [solver] " << msg << "\n";
        }
        sVector w0(mU, 0.0);                                       // seed from the CMO profile
        for (std::size_t j = 0; j < N; ++j) {
            for (std::size_t i = 0; i + 1 < n; ++i) w0[j*mv+i] = x[j][i];
            w0[j*mv + (n-1)] = T[j];  w0[j*mv + n] = V[j];  w0[j*mv + n+1] = L[j];
        }
        if (specBoil) w0[iD] = D;
        solver::NDOptions optsF;
        optsF.tolerance = 1.0e-9; optsF.maxIter = 60; optsF.parallel = true;
        if (reactive) optsF.maxIter = 80;
        //  THE FULL MESH DECLARES ITS BOX AND TAKES THE ARMIJO CONTRACT
        //  (DEV.md 4c C245 slice 1, the proof caller of NDOptions'
        //  globalisation contract).  Without it the Newton took the whole
        //  step: from the built-in seed column08 visited thousands of kelvin
        //  and stalled at |F| = 8.4 after 60 iterations and 20 uphill steps.
        //  With it the descent is monotone (11.3 -> 0.37 in 60) but column08
        //  STILL does not converge unseeded, and the reason is the seed, not
        //  this Newton: the CMO phase converges there to a trivial SRK
        //  profile (T 287-300 K at 16 bar, mean latent heat 930 kJ/kmol
        //  against 16067 from its declared seed) -- an EoS-root defect
        //  (kernel audit Rank 4/5), which is why column08 keeps its seed.
        //  Measured 2026-11-08 on the five full-MESH cases: no golden row
        //  moved; column19/20 take 24/35 iterations against 19/26.
        //  Declared here, every stage temperature stays in
        //  [0.5 Tsat,min, 1.2 Tsat,max] -- the coldest and hottest pure
        //  saturation temperatures at P of the components fed -- every
        //  carried fraction in [0, 1], every V and L >= 0 and a distillate
        //  unknown >= 0, each by the fraction-to-boundary rule on the whole
        //  step; the line search is a true Armijo test, and when it fails the
        //  step is a Levenberg-Marquardt step, never an uphill one.  The
        //  eliminated fraction 1 - sum(x) is NOT boxed here (a linear
        //  inequality; slice 2).  Extents carry no bound.
        {
            scalar tsMin = 0.0, tsMax = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                bool fed = false;
                for (std::size_t j = 0; j < N && !fed; ++j)
                    fed = Ffeed[j] > 0.0 && zfeed[j][i] > 0.0;
                if (!fed) continue;
                const scalar ts = pureSaturationTemperature(thermo, i, P);
                if (!(ts > 0.0)) continue;
                tsMin = (tsMin > 0.0) ? std::min(tsMin, ts) : ts;
                tsMax = std::max(tsMax, ts);
            }
            constexpr scalar inf = std::numeric_limits<scalar>::infinity();
            optsF.lower.assign(mU, -inf);
            optsF.upper.assign(mU,  inf);
            for (std::size_t j = 0; j < N; ++j)
            {
                for (std::size_t i = 0; i + 1 < n; ++i)
                { optsF.lower[j*mv + i] = 0.0; optsF.upper[j*mv + i] = 1.0; }
                if (tsMax > 0.0)
                {
                    //  never so tight that the seed itself lies outside
                    optsF.lower[j*mv + (n-1)] = std::min(0.5 * tsMin, 0.9 * T[j]);
                    optsF.upper[j*mv + (n-1)] = std::max(1.2 * tsMax, 1.1 * T[j]);
                }
                optsF.lower[j*mv + n]   = 0.0;               // V_j
                optsF.lower[j*mv + n+1] = 0.0;               // L_j
            }
            if (specBoil) optsF.lower[iD] = 0.0;
            optsF.globalisation = solver::Globalisation::armijo;
            if (verbosity >= 2)
            {
                std::cout << "  [solver] full-MESH: bounded Newton (Armijo line"
                             " search, Levenberg-Marquardt when it fails): ";
                if (tsMax > 0.0)
                    std::cout << "T in [0.5 x " << tsMin << ", 1.2 x " << tsMax
                              << "] K (pure saturation at P), ";
                else
                    std::cout << "T unbounded (no saturation curve), ";
                std::cout << "fractions in [0, 1], V and L >= 0\n";
            }
        }
        if (verbosity >= 3)
            optsF.onIter = [this](const solver::NDTrace& tr){ recordResidual(tr.normF); };
        auto resF = solver::newtonND(residualF, w0, optsF);   // reaction OFF (reactive) / the column
        if (reactive && resF.converged)
        {
            //  THE REACTION ENTERS BY THE EXISTING HOMOTOPY, ANNOUNCED (C231):
            //  the non-reactive full MESH just solved is the seed; every
            //  species in the quotient is raised to >= 1e-4 on the reactive
            //  stages (renormalised), then K_eff = K_a exp(-(1-s) lnOffset)
            //  with lnOffset the seed's own quotient gap, s from 0 to 1 by
            //  halving/doubling steps (the CMO's rule, 1/64 floor).
            if (kinetic)
            {
                //  THE CATALYST MASS ENTERS BY CONTINUATION, ANNOUNCED (C233):
                //  the non-reactive full MESH is the seed, the reaction is
                //  switched on at a fraction s of the declared catalyst mass
                //  (m_cat,j -> s m_cat,j) and s is raised by growth while the
                //  Newton converges, bisected toward the last accepted s when
                //  it does not (floor: a step of 1e-4).  s = 1 is the column
                //  the case declared; the column is NOT converged unless it
                //  is reached.
                rxnOnF = true;
                sVector wK = resF.x;
                scalar sDone = 0.0, sTry = 0.01;
                int itersTot = 0;
                std::vector<scalar> acc;
                const scalar sMin = 1.0e-4;
                while (sDone < 1.0 && (sTry - sDone) >= sMin)
                {
                    mCatScale = sTry;
                    auto r = solver::newtonND(residualF, wK, optsF);
                    itersTot += r.iterations;
                    resF = r;
                    if (verbosity >= 3)
                        std::cout << "  [solver] kinetic full MESH: catalyst fraction s = "
                                  << sTry << (r.converged ? " converged in " : " NOT converged after ")
                                  << r.iterations << " iterations (|F| = " << r.residual << ")\n";
                    if (r.converged)
                    {
                        wK = r.x; sDone = sTry; acc.push_back(sDone);
                        sTry = std::min(1.0, sDone * 3.0);
                    }
                    else sTry = sDone + 0.5 * (sTry - sDone);
                }
                mCatScale = 1.0;
                resF.converged = resF.converged && sDone >= 1.0;
                resF.iterations = itersTot;
                if (verbosity >= 2)
                {
                    std::ostringstream m;
                    m << "  [solver] kinetic full MESH: the non-reactive full MESH"
                         " seeds it; the catalyst mass was raised to its declared"
                         " value in " << acc.size() << " continuation step(s)"
                         " (s =";
                    for (scalar a : acc) m << " " << a;
                    m << "; " << itersTot << " Newton iterations)"
                      << (sDone >= 1.0 ? "" : " -- NOT reached: the step fell below 1e-4")
                      << "\n";
                    std::cout << m.str();
                }
            }
            else {
            constexpr scalar kFloor = 1.0e-4;
            rxnOnF = true;
            sVector wDone = resF.x;
            for (std::size_t k = 0; k < nRx; ++k)
            {
                const std::size_t j = rxStages[k];
                sVector xj; scalar Tj, Vj, Lj;
                unpackF(wDone, j, xj, Tj, Vj, Lj);
                scalar sx = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                {
                    if (nu[i] != 0.0) xj[i] = std::max(xj[i], kFloor);
                    sx += xj[i];
                }
                for (std::size_t i = 0; i + 1 < n; ++i) wDone[j*mv + i] = xj[i] / sx;
            }
            sF = 1.0;
            { const sVector g0 = residualF(wDone);
              for (std::size_t k = 0; k < nRx; ++k) lnOffF[k] = g0[iXi + k]; }
            scalar sDone = 0.0, ds = 1.0;
            int    itersTot = 0;
            std::vector<scalar> acc;
            while (sDone < 1.0 && ds >= 1.0 / 64.0)
            {
                sF = std::min(1.0, sDone + ds);
                auto r = solver::newtonND(residualF, wDone, optsF);
                itersTot += r.iterations;
                if (r.converged)
                { wDone = r.x; sDone = sF; acc.push_back(sDone);
                  ds = std::min(2.0 * ds, 1.0 - sDone); }
                else ds *= 0.5;
                resF = r;
            }
            sF = 1.0;
            resF.converged = resF.converged && sDone >= 1.0;
            resF.iterations = itersTot;
            if (verbosity >= 2)
            {
                std::ostringstream m;
                m << "  [solver] reactive full MESH: the non-reactive full MESH"
                     " seeds it (the CMO seeds that one); K_a reached from the"
                     " seed's own quotient (species floored at " << kFloor
                  << " on the reactive stages) in " << acc.size()
                  << " continuation step(s) (s =";
                for (scalar a : acc) m << " " << a;
                m << "; " << itersTot << " Newton iterations)"
                  << (sDone >= 1.0 ? "" : " -- NOT reached: the step fell below 1/64")
                  << "\n";
                std::cout << m.str();
            }
            }   // equilibrium form
        }
        announceTrialRefusals();
        for (std::size_t j = 0; j < N; ++j) unpackF(resF.x, j, x[j], T[j], V[j], L[j]);
        if (reactive)
        {
            if (kinetic)
                for (std::size_t k = 0; k < nRx; ++k)
                {
                    const std::size_t jr = rxStages[k];
                    xiFinal[k] = rateAt(x[jr], T[jr], thermo.activity().gamma(T[jr], x[jr]))
                                 * mCatPerStage * mCatScale / 1000.0;
                }
            else
            for (std::size_t k = 0; k < nRx; ++k) xiFinal[k] = resF.x[iXi + k];
            scalar xs2 = 0.0; for (auto v : xiFinal) xs2 += v;
            if (specBoil) D = resF.x[iD];
            Bf = specBoil ? Bspec : (totFeed + sumNuAll*xs2 - D - totDrawF);
        }
        else if (specBoil) { D = resF.x[iD]; Bf = Bspec; }
        if (specBoil) R = L[0] / D;
        if (cmoSeedFailed) { res.converged = resF.converged; res.residual = resF.residual; }
        else if (!resF.converged) res.converged = false;
        if (resF.stalledSteps > 0 && verbosity >= 2)
            std::cerr << "  [solver] full-MESH: " << resF.stalledSteps
                      << " floor-damped line-search step(s) were taken"
                         " (announced; NDOptions::maxStalledSteps)\n";
        if (verbosity >= 2)
            std::cerr << "  full-MESH (Naphtali-Sandholm): "
                      << (resF.converged ? "converged" : "NOT converged")
                      << " in " << resF.iterations << " iters, ||F|| = " << resF.residual
                      << "  (V,L now energy-consistent, not CMO)\n";
    }
    // ========================================================================

    // Distillate: x_D = y_1 = K_1·x_1, normalised -- the condensate of stage
    // 1's vapour under a total condenser, the vapour product of a partial one.
    //  THE SEARCH IS OVER.  Everything from here re-prices the stages at the
    //  CONVERGED profile, so its advisories are about the answer and are
    //  reported in full.  The reset must sit BELOW the full-MESH refinement
    //  above -- placed between the two Newtons it left the second one's ~96
    //  discarded states marked `accepted`, which is the defect wearing the
    //  fix's clothes.
    walk.close();

    //  ONE K PER STAGE for everything published below -- the profile, the
    //  distillate, the side draws, the duties and the hydraulics -- at the
    //  stage's own vapour (C169 item 2).
    std::vector<sVector> Kfin(N);
    {
        bool allOk = true;
        for (std::size_t j = 0; j < N; ++j)
        {
            bool okj = true;
            Kfin[j] = stageVapourK(thermo, T[j], P, x[j], nullptr, &okj);
            allOk = allOk && okj;
        }
        if (!allOk) announceUnconvergedVapour(dict->name());
    }
    const auto& K0 = Kfin[0];
    sVector xD(n);
    { scalar s = 0.0;
      for (std::size_t i = 0; i < n; ++i) { xD[i] = K0[i]*x[0][i]; s += xD[i]; }
      if (s > 0.0) for (auto& v : xD) v /= s; }

    // Profile.
    profile_ = UnitProfile{};
    profile_.xAxis = "stage";
    for (std::size_t j = 0; j < N; ++j) {
        const auto& Kj = Kfin[j];
        profile_.columns["stage"].push_back(static_cast<scalar>(j + 1));
        profile_.columns["T"].push_back(T[j]);
        for (std::size_t i = 0; i < n; ++i) {
            profile_.columns["x_" + thermo.comp(i).name()].push_back(x[j][i]);
            profile_.columns["y_" + thermo.comp(i).name()].push_back(Kj[i]*x[j][i]);
        }
    }
    profile_.markers.push_back({static_cast<scalar>(NF), "feed"});

    //  THE REACTIVE FULL MESH PUBLISHES WHAT ITS EQUILIBRIUM ROW IS MADE OF
    //  (C231): the activity coefficient of every reacting species, the
    //  ln K_a(T) the row was closed against, and the extent of each stage, so
    //  a reader (and `check_reactive_mesh`) can recompute
    //  sum nu_i ln(gamma_i x_i) - ln K_a(T) from the published numbers alone.
    if (reactive && fullMeshWord && !kinetic)
    {
        std::vector<std::vector<scalar>> gcol(n);
        std::vector<scalar> lnk(N, 0.0), xic(N, 0.0);
        for (std::size_t j = 0; j < N; ++j)
        {
            const sVector gam = thermo.activity().gamma(T[j], x[j]);
            for (std::size_t i = 0; i < n; ++i)
                if (nu[i] != 0.0) gcol[i].push_back(gam[i]);
            lnk[j] = lnKaAt(T[j]);
            if (extentOf[j] >= 0)
                xic[j] = xiFinal[static_cast<std::size_t>(extentOf[j])] * 3600.0;
        }
        for (std::size_t i = 0; i < n; ++i)
            if (nu[i] != 0.0) profile_.columns["gamma_" + thermo.comp(i).name()] = gcol[i];
        profile_.columns["lnKa"]          = lnk;
        profile_.columns["extent_kmol_h"] = xic;
    }
    //  THE KINETIC FULL MESH PUBLISHES WHAT ITS EXTENT IS MADE OF (C233): the
    //  activity coefficient and the activity a_i = gamma_i x_i of every
    //  reacting species, the rate r [mol/(g_cat s)] the law returned and the
    //  extent r x m_cat of each stage, so a reader (and `check_kinetic_mesh`)
    //  can recompute the law from T, x and gamma alone and read the activities
    //  the law was evaluated at against the range it was fitted over.
    if (reactive && fullMeshWord && kinetic)
    {
        std::vector<std::vector<scalar>> gcol(n), acol(n);
        std::vector<scalar> rcol(N, 0.0), xic(N, 0.0);
        for (std::size_t j = 0; j < N; ++j)
        {
            const sVector gam = thermo.activity().gamma(T[j], x[j]);
            for (std::size_t i = 0; i < n; ++i)
                if (nu[i] != 0.0)
                { gcol[i].push_back(gam[i]); acol[i].push_back(gam[i] * x[j][i]); }
            if (extentOf[j] >= 0)
            {
                rcol[j] = rateAt(x[j], T[j], gam);
                xic[j]  = rcol[j] * mCatPerStage / 1000.0 * 3600.0;
            }
        }
        for (std::size_t i = 0; i < n; ++i)
            if (nu[i] != 0.0)
            {
                profile_.columns["gamma_" + thermo.comp(i).name()] = gcol[i];
                profile_.columns["a_" + thermo.comp(i).name()]     = acol[i];
            }
        profile_.columns["r_mol_gcat_s"]  = rcol;
        profile_.columns["extent_kmol_h"] = xic;
    }

    if (verbosity >= 2)
    {
        std::cout << "\n=============  DistillationColumn (simultaneous MESH)  ============\n"
                  << "  Converged:   " << (res.converged ? "yes" : "NO")
                  << "   Newton iters: " << res.iterations
                  << "   ||F|| = " << std::scientific << std::setprecision(3) << res.residual << "\n\n"
                  << "  Stage-by-stage profile  (T, x_i, y_i):\n"
                  << "    stage      T [K]   ";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "  x(" << thermo.comp(i).name() << ")";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "  y(" << thermo.comp(i).name() << ")";
        std::cout << "\n";
        for (std::size_t j = 0; j < N; ++j)
        {
            const auto& Kj = Kfin[j];
            std::cout << "    " << std::setw(4) << (j+1) << "    "
                      << std::fixed << std::setprecision(2) << std::setw(8) << T[j] << "  ";
            for (std::size_t i = 0; i < n; ++i)
                std::cout << " " << std::setw(7) << std::setprecision(4) << x[j][i];
            for (std::size_t i = 0; i < n; ++i)
                std::cout << " " << std::setw(7) << std::setprecision(4) << (Kj[i]*x[j][i]);
            if (j+1 == NF) std::cout << "  <- feed";
            if (j+1 == 1)  std::cout << "  (top)";
            if (j+1 == N)  std::cout << "  (reboiler)";
            std::cout << "\n";
        }
        std::cout << "\n  Products:\n"
                  << "    Distillate  D = " << std::fixed << std::setprecision(4) << (D*3600.0)
                  << " kmol/h  T = " << std::setprecision(2) << T[0] << " K   x_D("
                  << thermo.comp(0).name() << ") = " << std::setprecision(5) << xD[0] << "\n"
                  << "    Bottoms     B = " << std::setprecision(4) << (Bf*3600.0)
                  << " kmol/h  T = " << std::setprecision(2) << T[N-1] << " K   x_B("
                  << thermo.comp(n-1).name() << ") = " << std::setprecision(5) << x[N-1][n-1] << "\n"
                  << "==================================================================\n\n";
    }

    produced_.clear();
    ProcessStream dStream = makeDistillate(thermo, xD, D, P, T[0], condenser);
    produced_.push_back(dStream);
    ProcessStream bStream;
    bStream.name = "bottoms"; bStream.F = Bf; bStream.T = T[N-1]; bStream.P = P;
    bStream.z = x[N-1]; bStream.vf = 0.0;
    bStream.phasePinned = true;          // equilibrium stage -- see makeDistillate
    produced_.push_back(bStream);
    // side draws (in stage order): a liquid draw leaves at x[j], a vapour draw at y[j].
    for (std::size_t j = 0; j < N; ++j)
    {
        if (Udraw[j] > 0.0)
        {
            ProcessStream s; s.name = "liquidDraw_" + std::to_string(j + 1);
            s.F = Udraw[j]; s.T = T[j]; s.P = P; s.z = x[j]; s.vf = 0.0;
            produced_.push_back(s);
        }
        if (Wdraw[j] > 0.0)
        {
            const auto& Kj = Kfin[j];
            sVector yj(n, 0.0); scalar sy = 0.0;
            for (std::size_t i = 0; i < n; ++i) { yj[i] = Kj[i]*x[j][i]; sy += yj[i]; }
            if (sy > 0.0) for (auto& v : yj) v /= sy;
            ProcessStream s; s.name = "vaporDraw_" + std::to_string(j + 1);
            s.F = Wdraw[j]; s.T = T[j]; s.P = P; s.z = yj; s.vf = 1.0;
            produced_.push_back(s);
        }
    }

    kpis_.clear();
    kpis_["nStages"]    = static_cast<scalar>(N);
    kpis_["feedStage"]  = static_cast<scalar>(NF);
    kpis_["R"]          = R;
    kpis_["D"]          = D;
    kpis_["B"]          = Bf;
    kpis_["T_top"]      = T[0];
    kpis_["T_bottom"]   = T[N-1];
    kpis_["x_D_LK"]     = xD[0];
    kpis_["x_B_HK"]     = (n > 1) ? x[N-1][n-1] : 0.0;
    kpis_["iterations"] = static_cast<scalar>(res.iterations);

    // Reactive distillation: total extent + conversion of the limiting reactant.
    if (reactive)
    {
        if (kaForm == KaForm::formula && kaTmax > kaTmin)
        {
            scalar lo = 1e9, hi = 0.0;
            for (std::size_t k = 0; k < nRx; ++k)
            { lo = std::min(lo, T[rxStages[k]]); hi = std::max(hi, T[rxStages[k]]); }
            if (lo < kaTmin || hi > kaTmax)
            {
                const std::string msg = "column '" + dict->name() + "': the"
                    " declared ln K_a(T) is valid over " + std::to_string(kaTmin)
                    + "-" + std::to_string(kaTmax) + " K (the range it was"
                    " measured over) and the reactive stages run at "
                    + std::to_string(lo) + "-" + std::to_string(hi)
                    + " K: K_a is EXTRAPOLATED there.";
                if (AdvisoryLog::instance().addAnnouncedOnce(
                        "ka-extrapolated:" + dict->name(), "approximation",
                        "warning", "distillationColumn '" + dict->name() + "' K_a(T)", msg))
                    std::cerr << "  [reaction] " << msg << "\n";
            }
        }
        scalar extentTot = 0.0;
        for (std::size_t k = 0; k < nRx; ++k)
        {
            const std::size_t j = rxStages[k];
            if (kinetic)                                   // recompute from the converged profile
                extentTot += rateAt(x[j], T[j], thermo.activity().gamma(T[j], x[j]))
                             * mCatPerStage / 1000.0;
            else
                extentTot += xiFinal[k];
        }
        // limiting reactant = the fed reactant (nu<0) with the least feed.
        std::size_t iLim = n; scalar fedLim = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (nu[i] >= 0.0) continue;
            scalar fed = 0.0;
            for (std::size_t j = 0; j < N; ++j) fed += Ffeed[j] * zfeed[j][i];
            if (iLim == n || fed < fedLim) { iLim = i; fedLim = fed; }
        }
        const scalar consumed = (iLim < n) ? -nu[iLim] * extentTot : 0.0;
        kpis_["reactionExtent"]   = extentTot;                       // kmol/s
        kpis_["conversion"]       = (fedLim > 0.0) ? consumed / fedLim : 0.0;
        if (verbosity >= 2 && iLim < n)
            std::cout << "  Reaction: Σξ = " << std::scientific << std::setprecision(3)
                      << (extentTot*3600.0) << " kmol/h,  conversion of "
                      << thermo.comp(iLim).name() << " = " << std::fixed
                      << std::setprecision(1) << (100.0 * consumed / std::max(fedLim,1e-30))
                      << " %  ("
                      << (kinetic ? (kineticExpr ? "expression kinetics (the case's own law)"
                                                 : adsorption ? "adsorption (LHHW) kinetics"
                                                : "pseudo-homogeneous kinetics")
                                  : "equilibrium")
                      << ", " << nRx << " reactive stages)\n";
    }

    // Energy items [kW] (see the Wang-Henke path): the condenser's own duty,
    // the reboiler closes the column energy balance.
    {
        //  Under the full MESH the traffic V, L is the solver's own and a TOTAL
        //  condenser's reflux entered stage 1 at the condensate's bubble
        //  point, so the duty is that envelope exactly and Q_reboiler then
        //  equals the reboiler's own balance.  Under CMO the traffic is
        //  (R+1) D, and the condensate leaves at the same bubble point.
        const bool fullMesh = fullMeshWord;
        CondenserTop top;
        top.D = D;  top.yD = xD;  top.T1 = T[0];
        top.Tcond = dStream.T;                  // the condensate's bubble point
        top.Vtop  = fullMesh ? V[0] : (R + 1.0) * D;
        const scalar Hdist = distillateEnthalpy(dStream, hs, thermo);
        if (!partialCond && !dStream.phasePinned)
        {
            top.distillateCarried = true;
            top.Hdist = Hdist;
        }
        if (partialCond)
        {
            top.Vin = V[1];
            top.y2  = normalisedVapour(Kfin[1], x[1]);
            top.T2  = T[1];
            top.L1  = L[0];
            top.x1  = x[0];
        }
        const scalar Q_cond = condenserDuty(hs, condenser, top);
        auto H = [&](scalar Fx, scalar Tx, scalar vfx, const sVector& zx) {
            return Fx * hs.hQuality(vfx, zx, Tx);
        };
        // products out (distillate + bottoms + every side draw) minus feeds in.
        //  The DISTILLATE at the temperature this column PUBLISHES it at --
        //  `makeDistillate`'s bubble point, not the top tray's dew point.  See
        //  the twin comment on the Wang-Henke duty block; one defect, two
        //  transcriptions, and a fix applied to either alone would have been
        //  right on half the corpus.
        scalar Hout = Hdist + H(Bf, T[N-1], 0.0, x[N-1]);
        for (std::size_t j = 0; j < N; ++j)
        {
            if (Udraw[j] > 0.0) Hout += H(Udraw[j], T[j], 0.0, x[j]);
            if (Wdraw[j] > 0.0)
            {
                const auto& Kj = Kfin[j];
                sVector yj(n, 0.0); scalar sy = 0.0;
                for (std::size_t i = 0; i < n; ++i) { yj[i] = Kj[i]*x[j][i]; sy += yj[i]; }
                if (sy > 0.0) for (auto& v : yj) v /= sy;
                Hout += H(Wdraw[j], T[j], 1.0, yj);
            }
        }
        scalar Hin = 0.0;
        //  FEED BY FEED (C131 review): a feed RESOLVED from its stream (both
        //  branches) is priced at its own resolution -- the equilibrium
        //  compositions when it splits, the rule `reporting/BalanceMath.H`
        //  prices the same stream by -- and an inline feed at its declared q.
        //  Two feeds on one stage are two terms, never one blend at a merged
        //  composition and a molar-average temperature.
        for (const auto& r : feedRecords)
        {
            if (r.F <= 0.0) continue;
            if (r.state)
                Hin += feedEnthalpy(*r.state, r.F, r.T, r.P > 0.0 ? r.P : P, r.z, thermo, hs);
            else
                Hin += H(r.F, r.T, 1.0 - r.q, r.z);
        }
        const scalar dH = Hout - Hin;
        kpis_["Q_condenser_kW"] = Q_cond;
        kpis_["Q_reboiler_kW"]  = dH - Q_cond;

        //  THE PLUG IS NOT EVIDENCE (C174): the reboiler's own envelope on
        //  the solver's stage traffic, feed by feed on its stage priced by
        //  the ONE home the stage rows and the duty use (`feedEnthalpy`).
        //  Under the full MESH the bottoms row is L_N = B, so the envelope's
        //  liquid out IS the bottoms; under CMO B is the overall balance's.
        {
            std::optional<scalar> Q_own;
            scalar terms = 0.0;
            if (N >= 2)
            {
                const std::size_t r = N - 1;
                const sVector yN = normalisedVapour(Kfin[r], x[r]);
                const scalar hVN = V[r]  * hs.hV(yN, T[r]);
                const scalar hBN = Bf    * hs.hL(x[r], T[r]);
                const scalar hLN = L[r-1] * hs.hL(x[r-1], T[r-1]);
                scalar hDr = 0.0;
                if (Udraw[r] > 0.0) hDr += Udraw[r] * hs.hL(x[r], T[r]);
                if (Wdraw[r] > 0.0) hDr += Wdraw[r] * hs.hV(yN, T[r]);
                scalar hFr = 0.0;
                for (const auto& fr : feedRecords)
                {
                    if (fr.j != r || fr.F <= 0.0) continue;
                    hFr += fr.state
                        ? feedEnthalpy(*fr.state, fr.F, fr.T, fr.P > 0.0 ? fr.P : P, fr.z, thermo, hs)
                        : fr.F * hs.hQuality(1.0 - fr.q, fr.z, fr.T);
                }
                Q_own = hVN + hBN + hDr - hLN - hFr;
                terms = std::abs(hVN) + std::abs(hBN) + std::abs(hDr)
                      + std::abs(hLN) + std::abs(hFr);
            }
            closures_.clear();
            closures_.push_back(reboilerClosure(dH - Q_cond, Q_own, fullMesh,
                                                terms,
                                                "a column of fewer than two stages"));
            if (Q_own) kpis_["Q_reboiler_ownEnvelope_kW"] = *Q_own;
        }
        kpis_["nFeeds"]         = static_cast<scalar>(
            std::count_if(Ffeed.begin(), Ffeed.end(), [](scalar v){ return v > 0.0; }));
        kpis_["nSideDraws"]     = static_cast<scalar>(nDraws);
    }

    // ---- PER-TRAY CHEMISTRY, when the package resolves one --------------
    //  A reacting column's profile is incomplete without it.  The whole
    //  reason the separation and the speciation are the same problem is
    //  that ammonia's volatility follows the pH -- and a profile that
    //  prints x, y and T and NOT the pH shows the consequence while hiding
    //  the cause.  A student cannot check the mechanism they were taught.
    //
    //  This is a REPORT, and it costs one reactive flash per stage, ONCE,
    //  after convergence -- not one per residual.  It is computed on the
    //  same composition the stage's own K-value was: the tray liquid at the
    //  tray's (T, P).  The unit implements no chemistry (the ratified
    //  contract): it asks the package to equilibrate and reads back what
    //  the package resolved.
    //
    //  A stage whose chemistry cannot be resolved leaves NaN in its row
    //  rather than a plausible zero -- an unsolved pH is not pH 0, and a
    //  column that quietly printed one would be lying in the one place
    //  this report exists to tell the truth.
    //
    //  SPECIATED AS A LIQUID, not flashed (2026-08-23).  The first version
    //  ran the full two-phase equilibrate on each tray liquid -- but a
    //  converged tray liquid sits EXACTLY at its bubble point (the MESH's
    //  own residual pins sum y = 1 there), which is the two-phase Newton's
    //  degenerate corner: V/F = 0 on the boundary.  On stripper01 at reflux
    //  0.5 it stalled on five trays of eight and this report printed NaN
    //  for chemistry the package resolves without difficulty -- the
    //  question was merely posed to the wrong tool.  The report wants the
    //  LIQUID's speciation, and speciateReactiveAsLiquid asks exactly that
    //  (no phase split posed at all).  NaN still stands for a tray whose
    //  SPECIATION fails, which is what it was meant for.
    if (thermo.hasReactiveEquilibrium())
    {
        std::vector<scalar> pHcol(N, std::numeric_limits<scalar>::quiet_NaN());
        std::map<std::string, std::vector<scalar>> mSpecies;
        scalar Iany = 0.0;
        std::vector<scalar> Icol(N, std::numeric_limits<scalar>::quiet_NaN());
        for (std::size_t j = 0; j < N; ++j)
        {
            try
            {
                const auto sr = thermo.speciateReactiveAsLiquid(T[j], x[j]);
                pHcol[j] = sr.pH;
                Icol[j]  = sr.I;
                Iany     = std::max(Iany, sr.I);
                for (const auto& row : sr.rows)
                {
                    auto& col = mSpecies[row.name];
                    if (col.empty())
                        col.assign(N, std::numeric_limits<scalar>::quiet_NaN());
                    col[j] = row.molality;
                }
            }
            catch (const std::exception&) { /* NaN stands, see above */ }
        }
        //  A SOLVED TRAY WITH AN EMPTY FAMILY IS A ZERO, NOT A NaN.  A
        //  species column is discovered on whichever tray first reports it,
        //  and a tray whose family total converged to numerical zero has
        //  that family EXCLUDED at the speciation intake -- so its cells
        //  stayed at the NaN the column was initialised with.  But this
        //  report's NaN is a CLAIM ("this tray's chemistry could not be
        //  resolved"), and on a tray whose speciation SOLVED (its pH is a
        //  number) the truth about an absent family is exact: no atoms, so
        //  every one of its species is 0.  Found by the three-family
        //  sour-water prototype (2026-08-23): the top tray had stripped its
        //  H2S to -3e-25, and the sulfide columns read NaN beside a solved
        //  pH of 8.49.  NaN stays exactly where it was meant: a tray whose
        //  own speciation failed keeps NaN in EVERY chemistry column, pH
        //  included, so the two states cannot be confused.
        for (auto& kv : mSpecies)
            for (std::size_t j = 0; j < N; ++j)
                if (kv.second[j] != kv.second[j] && pHcol[j] == pHcol[j])
                    kv.second[j] = 0.0;
        profile_.columns["pH"]            = pHcol;
        profile_.columns["ionicStrength"] = Icol;
        for (auto& kv : mSpecies)
            profile_.columns["m_" + kv.first] = std::move(kv.second);
        if (verbosity >= 2)
        {
            std::cout << "\n  Per-tray chemistry (the package's own"
                         " speciation of each tray liquid):\n"
                      << "    stage      T [K]        pH     I [mol/kg]\n";
            for (std::size_t j = 0; j < N; ++j)
                std::cout << "    " << std::setw(4) << (j + 1) << "    "
                          << std::fixed << std::setprecision(2)
                          << std::setw(8) << T[j] << "  "
                          << std::setprecision(4) << std::setw(8) << pHcol[j]
                          << "  " << std::setw(10) << Icol[j] << "\n";
            std::cout << "\n";
        }
    }

    // ---- Optional sieve-tray hydraulics ------------------------------
    //  Here V[j] and L[j] are the solver's own per-stage traffic.  V[0] = 0
    //  identifies a PARTIAL condenser (stage 1 is the condenser); under a
    //  total condenser V[0] = (R+1) D and stage 1 is the top tray, as on the
    //  Wang-Henke path.  The reboiler is the last stage.  The non-trays drop
    //  out of the tray list on their own.
    {
        std::vector<sVector> yAll(N, sVector(n, 0.0));
        for (std::size_t j = 0; j < N; ++j)
        {
            const auto& Kj = Kfin[j];
            scalar sy = 0.0;
            for (std::size_t i = 0; i < n; ++i) { yAll[j][i] = Kj[i] * x[j][i]; sy += yAll[j][i]; }
            if (sy > 0.0) for (auto& v : yAll[j]) v /= sy;
        }
        std::vector<scalar> Vs = V, Ls = L;
        Vs[N-1] = 0.0;                     // the reboiler is not a tray
        hydraulicsPass(operDict, dict->name(), thermo, P, T, x, yAll, Vs, Ls, NF, verbosity);
    }

    return res.converged ? 0 : 1;
}

void DistillationColumn::hydraulicsPass(const DictPtr&              operDict,
                                        const std::string&          unitName,
                                        const ThermoPackage&        thermo,
                                        scalar                      P,
                                        const std::vector<scalar>&  T,
                                        const std::vector<sVector>& x,
                                        const std::vector<sVector>& y,
                                        const std::vector<scalar>&  V,
                                        const std::vector<scalar>&  L,
                                        std::size_t                 feedStage,
                                        int                         verbosity)
{
    if (!operDict->found("hydraulics")) return;

    const auto geo = TrayHydraulics::readGeometry(operDict->subDict("hydraulics"));
    const auto res =
        TrayHydraulics::evaluate(thermo, P, T, x, y, V, L, geo, feedStage);
    if (res.stages.empty()) return;

    TrayHydraulics::report(res, geo, verbosity);

    //  WHAT THE LIQUID DENSITIES LEFT OUT (C79), gathered over the trays here
    //  and the overhead condensate below, and announced ONCE after both.
    std::string dropped    = res.liquidDensityDropped;
    scalar      droppedMax = res.liquidDensityDroppedMax;

    kpis_["diameter"]          = res.diameter;
    //  HOW MANY TRAYS THERE ACTUALLY ARE, from the pass that ENUMERATES them.
    //  `nStages` counts equilibrium stages and the two conventions do not
    //  agree: this solver's stage list carries the reboiler and not the
    //  condenser, so `nStages - 2` is short by one and `nStages - 1` is right
    //  only for a total condenser.  `TrayHydraulics` decides what is a tray by
    //  asking whether the stage carries vapour traffic, which is the fact
    //  itself rather than a rule about the fact -- so the count is published
    //  from there and nothing downstream re-derives it.
    kpis_["nTrays"]            = static_cast<scalar>(res.stages.size());
    //  WHICH MODE THE PASS RAN IN, as a fact rather than something a reader
    //  downstream infers by comparing numbers.  In DESIGN mode `diameter` is
    //  the widest tray's requirement; in RATING mode it is the author's
    //  declaration and may be NARROWER than a section needs -- `column10`
    //  runs at 1.1 m and floods.  A sizer told only the number would print
    //  the same basis sentence for both, and one of the two would be false.
    kpis_["diameterDesigned"]  = res.designed ? 1.0 : 0.0;
    //  THE TWO SECTIONS TRAVEL AS DATA (2026-09-07).  Until this line the
    //  hydraulics' whole answer reached the reader as a console table and
    //  died there: nothing downstream -- no KPI, no result block, no golden,
    //  no sizer -- could see that the trays above and below the feed want
    //  different diameters.  A column cannot be SIZED from a printed table.
    //
    //  Zero is not published: a column whose feed sits above every tray has
    //  no rectifying section, and a KPI of 0.0 m would be a claim about a
    //  diameter rather than the absence of one.
    if (res.diameterRectifying > 0.0)
        kpis_["diameter_rectifying"] = res.diameterRectifying;
    if (res.diameterStripping > 0.0)
        kpis_["diameter_stripping"]  = res.diameterStripping;
    kpis_["floodApproach_max"] = res.floodApproachMax;
    kpis_["floodStage"]        = static_cast<scalar>(res.floodStage);
    kpis_["dP_column_kPa"]     = res.dPColumn / 1000.0;
    kpis_["downcomerBackup_max_mm"] = res.backupMax;
    kpis_["downcomerFloodStages"]   = static_cast<scalar>(res.nDcFlood);
    if (res.weepChecked) kpis_["weepingStages"] = static_cast<scalar>(res.nWeeping);

    //  THE OVERHEAD CONDENSATE, AS A VOLUME PER SECOND -- what a reflux drum
    //  is sized on (2026-09-07).
    //
    //  WHY IT IS PUBLISHED HERE.  A drum holds LIQUID, and the only place in
    //  this run that can price a liquid volume is where the thermo package
    //  is: the sizing pass receives KPIs, a material and a dict, and no
    //  package at all.  `VesselSize`, which the drum otherwise resembles,
    //  builds an IDEAL-GAS volumetric flow (N R T / P) from a molar-flow KPI;
    //  applied to a condensate that is wrong by about three orders of
    //  magnitude, so the drum could not simply reuse it.
    //
    //  WHAT IT IS, EXACTLY.  V[0] is the vapour leaving the top tray, which
    //  is the whole of what the condenser condenses; for a total condenser it
    //  is the reflux plus the distillate.  Its composition is y[0] and it
    //  arrives in the drum as a liquid of that composition.  The density is
    //  taken at the TOP-TRAY temperature T[0], which is the nearest state
    //  this pass holds -- the condensate's own bubble point is a degree or so
    //  below it.  The sizer's basis sentence says so, so the state the number
    //  was evaluated at travels with the number rather than being remembered.
    //
    //  A package that cannot supply a liquid density publishes NOTHING here
    //  and the drum sizer refuses by name; the pass itself does not fail,
    //  because the diameters above are a complete answer without it.
    if (!V.empty() && V[0] > 0.0)
    {
        const std::size_t nc = thermo.n();
        scalar MW_V = 0.0;
        for (std::size_t i = 0; i < nc; ++i) MW_V += y[0][i] * thermo.comp(i).MW();
        try
        {
            //  THE SAME DOOR AS THE TRAYS' LIQUID (C79): a condensate that
            //  carries a component above its critical temperature is priced
            //  over the rest, renormalised, and what was left out joins the
            //  announcement below.  Its MASS is counted whole.
            const TrayHydraulics::LiquidDensity lq =
                TrayHydraulics::liquidDensity(thermo, T[0], P, y[0]);
            const scalar rho = lq.rho;                                  // kg/m3
            if (rho > 0.0 && std::isfinite(rho))
            {
                //  V is kmol/s and MW kg/kmol, so the product is kg/s.
                kpis_["Q_condensate_m3_s"] = V[0] * MW_V / rho;
                TrayHydraulics::noteDropped(lq, dropped, droppedMax);
            }
        }
        catch (const std::exception&)
        {
            //  Silent HERE and named THERE: the drum sizer is the surface
            //  that owes the reader a sentence, because it is the one whose
            //  answer is missing.  Raising an advisory from this pass would
            //  put a caveat on every column that declares hydraulics and
            //  never asks to be sized.
        }
    }

    //  THE ANNOUNCEMENT (C79).  No iterate in the sentence -- the fraction
    //  moves with every pass of a recycle, and an advisory per digit is a
    //  wall of lines the reader cannot rank -- so the sentence names the RULE
    //  and the components, and the largest share left out on any tray (or in
    //  the condensate) is the KPI it names.  Raised only when something WAS
    //  left out, so a column whose liquid the package prices whole says
    //  nothing new and publishes nothing new.
    if (!dropped.empty())
    {
        kpis_["liquidDensityUnpricedFraction_max"] = droppedMax;
        const std::string msg =
            "the tray hydraulics' liquid density (every tray's, and the"
            " overhead condensate's where one is published) is taken over the"
            " components the package can price, renormalised: " + dropped + " ha"
            + (dropped.find(',') != std::string::npos ? "ve" : "s")
            + " no liquid density there -- a component above its critical"
              " temperature has no saturated-liquid molar volume.  The MASS"
              " traffic still counts every component, so what the"
              " approximation touches is the density.  The largest excluded"
              " mole fraction is the KPI `liquidDensityUnpricedFraction_max`";
        //  ONCE PER PROCESS, AND NOT BEHIND THE VERBOSITY: a recycle runs
        //  this column quietly on every pass but the last, so a line gated
        //  on the pass's verbosity was raised silently and never printed.
        if (AdvisoryLog::instance().addAnnouncedOnce(
                "hydraulicsDensity:" + unitName, "approximation", "warning",
                "distillationColumn '" + unitName + "' hydraulics", msg))
            std::cerr << "  [hydraulics] " << unitName << ": " << msg << ".\n";
    }

    // The profile carries one row per stage; a non-tray stage (condenser,
    // reboiler) leaves zeros rather than pretending to have hydraulics.
    const std::size_t N = T.size();
    auto& fa = profile_.columns["floodApproach"];
    auto& dp = profile_.columns["dP_Pa"];
    auto& hb = profile_.columns["h_backup_mm"];
    fa.assign(N, 0.0); dp.assign(N, 0.0); hb.assign(N, 0.0);
    for (const auto& st : res.stages)
    {
        fa[st.index - 1] = st.floodApproach;
        dp[st.index - 1] = st.dP;
        hb[st.index - 1] = st.h_b;
    }
}

//  WHAT THE UNIT ACCEPTS (DEV.md 4c C188 item 5, slice D): the unit models
//  whatever component it is handed, in any phase, as its sentence says; it
//  has no component-subset rule, so the sentence is the whole contract.
UnitAcceptance DistillationColumn::acceptance() const
{
    UnitAcceptance a;
    a.declared = true;
    a.models.sentence =
        "every component of every feed, equilibrated stage by stage on the "
        "package's K-values under constant molar overflow (a nonvolatile, K "
        "= 0, goes to the bottoms); the stage energy balance is NOT solved "
        "by the CMO method (the full MESH route solves it), and a Murphree "
        "efficiency only where declared (`model rateBased;`: a binary packed bed at total reflux, as non-equilibrium segments)";
    return a;
}


// ===========================================================================
//   TOTAL REFLUX (`model totalReflux;`, DEV.md 4c C329 first delivery).
//
//   THE PHYSICAL MODE.  No feed, no products: the condenser returns every
//   mole the top tray sends up, the reboiler boils every mole the bottom tray
//   sends down.  This is how efficiency is measured on a test column (FRI,
//   Yanagi & Sakata 1982; Schulz et al. 2018), because the result then
//   depends on the trays and on nothing else.
//
//   WHAT TOTAL REFLUX MAKES EXACT, WITHOUT ANY CMO ASSUMPTION.  Cut the column
//   between tray j and the stage below it.  Nothing leaves the column, so the
//   component flows crossing the cut balance one by one:
//
//       V_{j+1} y_{j+1,i} = L_j x_{j,i}     for every i
//
//   Summing over i gives V_{j+1} = L_j, and then y_{j+1} = x_j: the operating
//   line IS the diagonal y = x.  The energy crossing the same cut is the one
//   heat the column receives, so on every cut
//
//       V_{j+1} h_V(y_{j+1}, T_{j+1}) - L_j h_L(x_j, T_j) = Q_reboiler
//
//   and the vapour flow changes from tray to tray exactly as the latent heat
//   does.  Every stage energy balance is therefore solved, not assumed.
//
//   THE DEGREES OF FREEDOM.  Per stage the unknowns are x (c), y (c), T, L
//   and V (2c + 3) and the equations are the c component balances, the c
//   equilibrium/Murphree relations, two summations and the energy balance
//   (2c + 3).  Over the whole column, with no stream crossing its boundary,
//   the c component balances SUMMED over the stages read 0 = 0: c of them
//   are dependent.  The column also carries two duties and one energy
//   balance over the whole (Q_R + Q_C = 0).  What is left open is c numbers:
//   how much of each component circulates.  A real test column fixes them
//   by its CHARGE and the liquid it holds up on each tray -- a steady stage
//   model has no hold-up, so it cannot.  They are closed here by
//       (1) the boil-up (one number: the vapour leaving the reboiler, as a
//           molar rate or as an F-factor on the tower area), and
//       (2) the liquid composition at one point (c - 1 numbers): the
//           reboiler liquid, which is what a test report gives (Yanagi &
//           Sakata 1982, Table III, "reboiler liquid").
//   With those, the column is solved by MARCHING up from the reboiler, one
//   bubble point per stage, with no iteration across stages.
//
//   When the efficiency is COMPUTED (`efficiency { model AIChE; }`) it
//   depends on the traffic and the traffic on the compositions, so the
//   march is repeated on the efficiencies of the previous march until they
//   stop moving (announced, with the count).
//
//   NOT MODELLED, said in the output: the tray pressure drop is not fed back
//   (every stage at the declared P; the hydraulics pass reports the drop);
//   the composition can be fixed only at the reboiler.
// ===========================================================================
int DistillationColumn::solveTotalReflux(const DictPtr& dict,
                                         const ThermoPackage& thermo,
                                         int verbosity)
{
    auto operDict = dict->subDict("operation");
    if (operDict->found("packing"))
    {
        if (operDict->found("efficiency"))
            throw std::runtime_error("DistillationColumn '" + dict->name() + "': `packing {}`"
                " (a packed bed) and `efficiency {}` (a tray efficiency) are two"
                " different columns; the packed route does not read `efficiency`."
                "  Declare one of them.");
        return solveTotalRefluxPacked(dict, thermo, verbosity);
    }
    const std::string unit = dict->name();
    const std::size_t n = thermo.n();

    //  A column at total reflux has no ports.  Anything that would make one
    //  is refused by name rather than ignored.
    for (const char* k : {"feed", "inputStreams", "reaction"})
        if (dict->found(k))
            throw std::runtime_error("DistillationColumn '" + unit + "': `model"
                " totalReflux;` has no feed and no products -- remove the `in` /"
                " `inputs` wire and any reaction (found `" + std::string(k) + "`).");
    for (const char* k : {"feeds", "sideDraws", "refluxRatio", "distillateRate",
                          "feedStage", "distillateRecovery", "refluxTemperature"})
        if (operDict->found(k))
            throw std::runtime_error("DistillationColumn '" + unit + "': `" + k
                + "` has no meaning at total reflux (no feed, no distillate, no"
                  " bottoms); the specification is `totalReflux { boilupRate |"
                  " fFactor; specifiedAt reboiler; composition {...}; }`.");

    const int Nint = static_cast<int>(operDict->lookupScalar("nStages"));
    if (Nint < 3)
        throw std::runtime_error("DistillationColumn '" + unit + "': total reflux"
            " needs at least two trays above the reboiler (nStages >= 3).");
    const std::size_t N = static_cast<std::size_t>(Nint);
    const scalar P = operDict->lookupScalar("P", Dims::pressure);
    if (readCondenserType(operDict, unit, verbosity) != CondenserType::total)
        throw std::runtime_error("DistillationColumn '" + unit + "': total reflux"
            " is modelled with a TOTAL condenser (every mole of overhead vapour"
            " returns as reflux).");

    auto tr = operDict->subDict("totalReflux");
    const std::string at = tr->lookupWordOrDefault("specifiedAt", "reboiler");
    if (at != "reboiler")
        throw std::runtime_error("DistillationColumn '" + unit + "': "
            + registryRefusal::message("total-reflux composition location", at,
                {"reboiler"}, "Accepted"));
    sVector xN(n, 0.0);
    {
        auto comp = tr->subDict("composition");
        scalar s = 0.0;
        for (const auto& key : comp->keys())
        {
            const std::size_t i = thermo.indexOf(key);
            xN[i] = comp->lookupScalar(key);
            if (xN[i] < 0.0)
                throw std::runtime_error("DistillationColumn '" + unit
                    + "': a negative mole fraction in totalReflux.composition");
            s += xN[i];
        }
        if (!(s > 0.0))
            throw std::runtime_error("DistillationColumn '" + unit
                + "': totalReflux.composition is empty");
        for (auto& v : xN) v /= s;
    }
    const bool hasRate = tr->found("boilupRate");
    const bool hasF    = tr->found("fFactor");
    if (hasRate == hasF)
        throw std::runtime_error("DistillationColumn '" + unit + "': give exactly"
            " ONE of `boilupRate` (the vapour leaving the reboiler, a molar flow)"
            " or `fFactor` (that vapour's F-factor on the TOWER cross-section,"
            " (m/s)(kg/m3)^0.5, which needs `hydraulics { diameter ...; }`).");

    //  Tray geometry, one home: the hydraulics block.
    const bool hasHyd = operDict->found("hydraulics");
    TrayHydraulics::Geometry geo;
    if (hasHyd) geo = TrayHydraulics::readGeometry(operDict->subDict("hydraulics"));
    const scalar A_T = (geo.diameter > 0.0)
                     ? 0.25 * constant::pi * geo.diameter * geo.diameter : 0.0;
    if (hasF && !(A_T > 0.0))
        throw std::runtime_error("DistillationColumn '" + unit + "': `fFactor`"
            " is a velocity on the tower area, so it needs a declared"
            " `hydraulics { diameter ...; }` (rating mode).");

    //  ---- The efficiency: declared (default 1) or computed ------------
    const bool declaredE = operDict->found("murphreeEfficiency");
    const bool computedE = operDict->found("efficiency");
    if (declaredE && computedE)
        throw std::runtime_error("DistillationColumn '" + unit + "': declare"
            " `murphreeEfficiency` OR compute it with `efficiency { model ...; }`,"
            " not both.");
    const scalar Edecl = operDict->lookupScalarOrDefault("murphreeEfficiency", 1.0);
    if (!(Edecl > 0.0))
        throw std::runtime_error("DistillationColumn: murphreeEfficiency must be "
            "POSITIVE -- a tray that transfers nothing is not a tray");

    std::size_t lk = 0;
    bool entrainment = false;
    scalar muLdecl = 0.0;
    TrayEfficiency::Geometry tg;
    TrayEfficiency::Model effModel = TrayEfficiency::Model::AIChE;
    std::string effModelName = "AIChE";
    if (computedE)
    {
        auto ed = operDict->subDict("efficiency");
        const std::string model = ed->lookupWordOrDefault("model", "AIChE");
        if (model == "AIChE")            effModel = TrayEfficiency::Model::AIChE;
        else if (model == "ChanFair")    effModel = TrayEfficiency::Model::ChanFair;
        else if (model == "SyedaChuang") effModel = TrayEfficiency::Model::SyedaChuang;
        else
            throw std::runtime_error("DistillationColumn '" + unit + "': "
                + registryRefusal::message("tray efficiency model", model,
                    {"AIChE", "ChanFair", "SyedaChuang"}, "Accepted"));
        effModelName = model;
        if (n != 2)
            throw std::runtime_error("DistillationColumn '" + unit + "': the "
                + model + " tray efficiency is implemented for a BINARY (one key"
                " pair, one liquid and one gas diffusivity); this package has "
                + std::to_string(n) + " components.");
        if (!hasHyd || !(geo.diameter > 0.0))
            throw std::runtime_error("DistillationColumn '" + unit + "': a computed"
                " efficiency reads the tray geometry from `hydraulics {}` and"
                " needs its `diameter` (rating mode).");
        if (!thermo.hasTransport() || !thermo.hasDiffusivity())
            throw std::runtime_error("DistillationColumn '" + unit + "': the AIChE"
                " gas-phase transfer units need the vapour Schmidt number --"
                " declare `transport { vapour { viscosity { model Chung; }"
                " diffusivity { model Fuller; } } }` in the thermo package.");
        if (ed->found("lightKey")) lk = thermo.indexOf(ed->lookupWord("lightKey"));
        if (ed->found("liquidViscosity"))
            muLdecl = ed->lookupScalar("liquidViscosity", Dims::viscosity);
        else if (!thermo.hasLiquidViscosity())
            throw std::runtime_error("DistillationColumn '" + unit + "': the liquid"
                " diffusivity (Wilke-Chang) needs a liquid viscosity, and the"
                " package has no liquidViscosity model -- declare one, or a measured"
                " `liquidViscosity <Pa s>;` in the efficiency block.");
        const std::string ent = ed->lookupWordOrDefault("entrainment", "FairMedian");
        if (ent != "FairMedian" && ent != "none")
            throw std::runtime_error("DistillationColumn '" + unit + "': "
                + registryRefusal::message("entrainment correction", ent,
                    {"FairMedian", "none"}, "Accepted"));
        entrainment = (ent == "FairMedian");
        const scalar lw = geo.weirLengthFrac * geo.diameter;
        tg.activeArea = A_T * (1.0 - 2.0 * geo.downcomerFrac);
        tg.weirHeight = geo.weirHeight;
        tg.flowPath   = TrayEfficiency::flowPathLength(geo.diameter, lw);
        tg.flowWidth  = 0.5 * (geo.diameter + lw);
        tg.towerArea  = A_T;
        tg.weirLength = lw;
        tg.holeDiameter = geo.holeDiameter;
        tg.holeAreaFrac = geo.holeAreaFrac;
        if (effModel == TrayEfficiency::Model::SyedaChuang)
            tg.holePitch = ed->lookupScalar("holePitch", Dims::length);
    }

    const ColumnEnthalpy hs = columnEnthalpySurface(thermo, P, {{350.0, xN}});

    //  ---- One march up the column on a given efficiency profile -------
    std::vector<scalar>  T(N, 0.0), V(N, 0.0), L(N, 0.0), E(N, computedE ? 1.0 : Edecl);
    std::vector<sVector> x(N, sVector(n, 0.0)), y(N, sVector(n, 0.0)), ys(N, sVector(n, 0.0));
    sVector xD(n, 0.0);
    scalar TD = 0.0, QR = 0.0, QC = 0.0, Lreflux = 0.0;
    E[N-1] = 1.0;                                   // the reboiler is an equilibrium stage
    bool bubbleOk = true, clipped = false;

    auto bubble = [&](const sVector& xl, scalar Tg)
    {
        bool ok = true;
        const scalar Tb = bubbleTWithItsVapour(thermo, xl, P, Tg, 1.0e-12, &ok);
        bubbleOk = bubbleOk && ok;
        return Tb;
    };
    auto equilibriumVapour = [&](const sVector& xl, scalar Tl)
    {
        return normalisedVapour(stageVapourK(thermo, Tl, P, xl), xl);
    };
    auto vapourMW = [&](const sVector& yv)
    {
        scalar m = 0.0;
        for (std::size_t i = 0; i < n; ++i) m += yv[i] * thermo.comp(i).MW();
        return m;
    };

    auto march = [&]()
    {
        bubbleOk = true; clipped = false;
        x[N-1] = xN;
        T[N-1] = bubble(xN, 350.0);
        ys[N-1] = equilibriumVapour(xN, T[N-1]);
        y[N-1]  = ys[N-1];
        if (hasRate)
            V[N-1] = tr->lookupScalar("boilupRate", Dims::molarFlow);
        else
        {
            const scalar rhoV = thermo.density(T[N-1], P, y[N-1], DensityPhase::Vapour);
            //  F = u sqrt(rho_V),  u = m_V/(rho_V A_T)  =>  m_V = F A_T sqrt(rho_V)
            V[N-1] = tr->lookupScalar("fFactor") * A_T * std::sqrt(rhoV) / vapourMW(y[N-1]);
        }
        if (!(V[N-1] > 0.0))
            throw std::runtime_error("DistillationColumn '" + unit
                + "': the boil-up must be positive");
        L[N-1] = 0.0;                               // no bottoms product
        //  The liquid falling into the reboiler: y = x on the cut.
        x[N-2] = y[N-1];
        T[N-2] = bubble(x[N-2], T[N-1]);
        L[N-2] = V[N-1];
        QR = V[N-1] * (hs.hV(y[N-1], T[N-1]) - hs.hL(x[N-2], T[N-2]));
        for (std::size_t jj = N - 1; jj-- > 0; )
        {
            const std::size_t j = jj;
            ys[j] = equilibriumVapour(x[j], T[j]);
            scalar s = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                y[j][i] = y[j+1][i] + E[j] * (ys[j][i] - y[j+1][i]);
                if (y[j][i] < 0.0) { y[j][i] = 0.0; clipped = true; }
                s += y[j][i];
            }
            for (auto& v : y[j]) v /= s;
            //  The liquid on the cut above this tray carries y_j, at its own
            //  bubble point (for j = 0 that liquid is the saturated reflux).
            const sVector xa = y[j];
            const scalar  Ta = bubble(xa, T[j]);
            V[j] = QR / (hs.hV(y[j], T[j]) - hs.hL(xa, Ta));
            if (j > 0) { x[j-1] = xa; T[j-1] = Ta; L[j-1] = V[j]; }
            else       { xD = xa; TD = Ta; Lreflux = V[0]; }
        }
        QC = Lreflux * hs.hL(xD, TD) - V[0] * hs.hV(y[0], T[0]);
    };

    //  ---- The computed efficiency of one tray on the current march -----
    std::vector<TrayEfficiency::Result> eff(N);
    const WilkeChang wilkeChang(nullptr);
    auto trayEfficiency = [&](std::size_t j, scalar Phi)
    {
        const scalar rhoV = thermo.density(T[j], P, y[j], DensityPhase::Vapour);
        const scalar rhoL = TrayHydraulics::liquidDensity(thermo, T[j], P, x[j]).rho;
        scalar MWL = 0.0;
        for (std::size_t i = 0; i < n; ++i) MWL += x[j][i] * thermo.comp(i).MW();
        const scalar muV = thermo.viscosityGas(T[j], y[j]);
        const scalar DV  = thermo.diffusivityGas(T[j], P, 0, 1);
        const scalar muL = (muLdecl > 0.0) ? muLdecl : liquidProperty::evaluate(thermo, liquidProperty::Property::viscosity, T[j], P, x[j]).value;
        //  Infinite-dilution Wilke-Chang both ways, in the mixture's own
        //  viscosity, combined linearly in mole fraction (Poling, Prausnitz &
        //  O'Connell 5th ed. Eq. 11-10.2, thermodynamic factor 1).
        const scalar D01 = wilkeChang.diffusivityLiquidBinary(thermo.comp(0), thermo.comp(1), T[j], muL);
        const scalar D10 = wilkeChang.diffusivityLiquidBinary(thermo.comp(1), thermo.comp(0), T[j], muL);
        const scalar DL  = x[j][0] * D10 + x[j][1] * D01;
        PropertySourceLog::instance().useHere("liquidDiffusivity", liquidSource::ownWilkeChang, "own", took(DL, T[j], P));
        if (muLdecl > 0.0)
            PropertySourceLog::instance().useHere("liquidViscosity", liquidSource::declaredByCase, "declared", took(muLdecl));
        //  The local slope of the equilibrium line for the light key.
        const scalar xl = x[j][lk];
        const scalar h  = std::min({1.0e-4, 0.5 * xl, 0.5 * (1.0 - xl)});
        auto ystarAt = [&](scalar xv)
        {
            sVector xp(n, 0.0);
            xp[lk] = xv; xp[1 - lk] = 1.0 - xv;
            const scalar Tb = bubble(xp, T[j]);
            return equilibriumVapour(xp, Tb)[lk];
        };
        const scalar m = (h > 0.0) ? (ystarAt(xl + h) - ystarAt(xl - h)) / (2.0 * h) : 1.0;
        TrayEfficiency::State st;
        st.vapourVolFlow = V[j] * vapourMW(y[j]) / rhoV;
        st.liquidVolFlow = L[j] * MWL / rhoL;
        st.rhoV   = rhoV;
        st.rhoL   = rhoL;
        st.ScV    = muV / (rhoV * DV);
        st.DV     = DV;
        st.DL     = DL;
        st.muL    = muL;
        st.sigma  = thermo.hasSurfaceTension() ? liquidProperty::evaluate(thermo, liquidProperty::Property::surfaceTension, T[j], P, x[j]).value : geo.sigma;
        if (!thermo.hasSurfaceTension())
            PropertySourceLog::instance().useHere("surfaceTension", liquidSource::declaredByCase, "declared", took(geo.sigma, T[j], P));
        st.m      = m;
        st.lambda = m * V[j] / L[j];
        //  Molar densities: c_G = rho_V/M_V, c_L = rho_L/M_L.
        st.cGoverCL = (rhoV / vapourMW(y[j])) / (rhoL / MWL);
        st.GoverL   = (V[j] * vapourMW(y[j])) / (L[j] * MWL);
        st.floodApproach = Phi;
        st.entrainment   = entrainment;
        return TrayEfficiency::evaluate(effModel, tg, st);
    };

    int passes = 0;
    march();
    if (computedE)
    {
        scalar dE = 1.0;
        for (passes = 1; passes <= 100; ++passes)
        {
            std::vector<scalar> Phi(N, -1.0);
            if (entrainment || effModel == TrayEfficiency::Model::ChanFair)
            {
                std::vector<scalar> Vt(V);
                Vt[N-1] = 0.0;
                const auto hr = TrayHydraulics::evaluate(thermo, P, T, x, y, Vt, L, geo, 0);
                for (const auto& s : hr.stages) Phi[s.index - 1] = s.floodApproach;
            }
            dE = 0.0;
            for (std::size_t j = 0; j + 1 < N; ++j)
            {
                eff[j] = trayEfficiency(j, Phi[j]);
                dE = std::max(dE, std::abs(eff[j].EMV - E[j]));
                E[j] = eff[j].EMV;
            }
            march();
            if (dE < 1.0e-10) break;
        }
        if (!(dE < 1.0e-10))
            throw std::runtime_error("DistillationColumn '" + unit + "': the"
                " computed tray efficiencies did not settle in 100 marches"
                " (last change " + std::to_string(dE) + ").");
        if (verbosity >= 2)
            std::cout << "  [totalReflux] efficiency from the internals: " << passes
                      << " march(es) until every tray's E_MV moved by < 1e-10.\n";
    }
    if (!bubbleOk)
        std::cout << "  [totalReflux] " << unit << ": WARNING -- a bubble point"
                     " did not meet its tolerance on at least one stage.\n";
    if (clipped)
        std::cout << "  [totalReflux] " << unit << ": a Murphree vapour had a"
                     " negative mole fraction (E_MV > 1 on a trace component);"
                     " it was clipped to zero and the vapour renormalised.\n";

    //  ---- What the test report would compute (Yanagi & Sakata 1982) ----
    //  The overall tray efficiency from the composition profile: the slope of
    //  ln(x/(1-x)) per tray over ln(alpha) (Fenske at total reflux), between
    //  the liquids leaving the bottom tray and the top tray, alpha the
    //  geometric mean of the two trays' equilibrium relative volatilities.
    const std::size_t nTrays = N - 1;
    const std::size_t hk = (n > 1) ? ((lk == 0) ? 1 : 0) : 0;
    scalar Eo = 0.0, alphaMean = 0.0, Nt = 0.0;
    if (n >= 2)
    {
        auto alphaAt = [&](std::size_t j)
        {
            const sVector K = stageVapourK(thermo, T[j], P, x[j]);
            return K[lk] / K[hk];
        };
        alphaMean = std::sqrt(alphaAt(0) * alphaAt(N - 2));
        auto r = [&](const sVector& v) { return v[lk] / v[hk]; };
        Nt = std::log(r(x[0]) / r(x[N-2])) / std::log(alphaMean);
        Eo = Nt / static_cast<scalar>(nTrays - 1);
    }

    //  ---- Report ------------------------------------------------------
    {
    std::ostringstream rep;
    rep << "\n=================  DistillationColumn (total reflux)  =================\n"
              << "  No feed, no products; " << nTrays << " trays + reboiler at "
              << std::fixed << std::setprecision(3) << P * 1.0e-5 << std::defaultfloat << " bar (pressure drop NOT fed back to the stages).\n"
              << "  Specified: reboiler liquid ";
    for (std::size_t i = 0; i < n; ++i)
        rep << thermo.comp(i).name() << "=" << std::setprecision(5) << xN[i] << " ";
    rep << "; boil-up " << std::setprecision(6) << V[N-1] * 3600.0 << " kmol/h"
              << (hasF ? " (from the declared F-factor)" : "") << "\n"
              << "  Efficiency: " << (!computedE ? std::string("declared E_MV")
                    : effModel == TrayEfficiency::Model::AIChE
                        ? std::string("COMPUTED, AIChE (Treybal 3ed Eqs 6.38, 6.51-6.64)")
                    : effModel == TrayEfficiency::Model::ChanFair
                        ? std::string("COMPUTED, Chan & Fair 1984 (Eqs 9-26) + Barker-Self eddy diffusion")
                        : std::string("COMPUTED, Syeda, Afacan & Chuang 2007 (Eqs 1-35) + Garcia-Fair eddy diffusion"))
              << (computedE && entrainment ? " + Colburn/Fair entrainment (Perry 9ed 14-98, 14-99 median)" : "")
              << "\n\n    stage     T [K]   x(" << thermo.comp(lk).name() << ")   y("
              << thermo.comp(lk).name() << ")    V [kmol/h]   E_MV\n";
    for (std::size_t j = 0; j < N; ++j)
        rep << "    " << std::setw(4) << (j + 1) << "  " << std::fixed
                  << std::setprecision(2) << std::setw(9) << T[j] << "  "
                  << std::setprecision(5) << std::setw(8) << x[j][lk] << "  "
                  << std::setw(8) << y[j][lk] << "  " << std::setprecision(3)
                  << std::setw(11) << V[j] * 3600.0 << "   " << std::setprecision(4)
                  << E[j] << ((j + 1 == N) ? "  (reboiler)" : "") << "\n";
    rep << std::defaultfloat << std::setprecision(6)
              << "\n  Reflux (= overhead vapour) " << thermo.comp(lk).name() << " = " << xD[lk]
              << "\n  Q_reboiler = " << QR << " kW   Q_condenser = " << QC << " kW\n"
              << "  Overall tray efficiency (Fenske slope over the trays, alpha = "
              << alphaMean << "): " << Eo << "\n";
    if (computedE && effModel == TrayEfficiency::Model::AIChE)
        rep << "  NOT SEEN by the AIChE correlations: hole area, hole diameter, tray"
                     " spacing; open area acts only through the hydraulics (flood approach"
                     " -> entrainment, pressure drop).  Weeping is not modelled.\n";
    if (computedE && effModel == TrayEfficiency::Model::ChanFair)
        rep << "  Chan & Fair: open area acts only through the approach to flood f;"
                     " fitted (1984, Table I) on a data bank that INCLUDES the FRI trays of"
                     " Yanagi & Sakata.  Weeping is not modelled.\n";
    if (computedE && effModel == TrayEfficiency::Model::SyedaChuang)
        rep << "  Syeda-Afacan-Chuang: sees the hole velocity, the open area and the"
                     " hole pitch; its constant C'' = 0.16 was FITTED to FRI data that include"
                     " Yanagi & Sakata (in-sample).  Eq 28 read WITH t_GLB, Eq 33 with h_w^0.5"
                     " (see TrayEfficiency.H).  Weeping is not modelled.\n";
    rep << "=======================================================================\n\n";
    std::cout << rep.str();
    }

    //  ---- KPIs, profile, closures --------------------------------------
    produced_.clear();
    kpis_.clear();
    kpis_["nStages"]        = static_cast<scalar>(N);
    kpis_["T_top"]          = T[0];
    kpis_["T_bottom"]       = T[N-1];
    kpis_["T_reflux"]       = TD;
    kpis_["V_boilup"]       = V[N-1];
    kpis_["V_top"]          = V[0];
    kpis_["x_reflux_LK"]    = xD[lk];
    kpis_["x_reboiler_LK"]  = xN[lk];
    kpis_["x_topTray_LK"]   = x[0][lk];
    kpis_["x_bottomTray_LK"]= x[N-2][lk];
    kpis_["Q_reboiler_kW"]  = QR;
    kpis_["Q_condenser_kW"] = QC;
    kpis_["alpha_mean"]     = alphaMean;
    kpis_["theoreticalStages_trays"] = Nt;
    kpis_["overallTrayEfficiency"]   = Eo;
    if (A_T > 0.0)
    {
        auto fOf = [&](std::size_t j)
        {
            const scalar rhoV = thermo.density(T[j], P, y[j], DensityPhase::Vapour);
            return V[j] * vapourMW(y[j]) / (rhoV * A_T) * std::sqrt(rhoV);
        };
        kpis_["fFactor_reboilerVapour"] = fOf(N - 1);
        kpis_["fFactor_topTray"]        = fOf(0);
        //  The superficial velocity of the bottom tray's vapour on the tower
        //  area -- the abscissa of a test report's pressure-drop plot.
        const scalar rhoVb = thermo.density(T[N-2], P, y[N-2], DensityPhase::Vapour);
        kpis_["u_bottomTray"] = V[N-2] * vapourMW(y[N-2]) / (rhoVb * A_T);
    }
    {
        scalar sum = 0.0, lo = 1e300, hi = -1e300;
        for (std::size_t j = 0; j + 1 < N; ++j)
        { sum += E[j]; lo = std::min(lo, E[j]); hi = std::max(hi, E[j]); }
        kpis_["E_MV_mean"] = sum / static_cast<scalar>(nTrays);
        if (computedE)
        {
            kpis_["E_MV_min"] = lo;
            kpis_["E_MV_max"] = hi;
            kpis_["efficiencyMarches"] = static_cast<scalar>(passes);
            scalar sOG = 0.0, sDry = 0.0, sPe = 0.0, sPsi = 0.0;
            for (std::size_t j = 0; j + 1 < N; ++j)
            { sOG += eff[j].EOG; sDry += eff[j].EMVdry; sPe += eff[j].Pe; sPsi += eff[j].psi; }
            const scalar nt = static_cast<scalar>(nTrays);
            kpis_["E_OG_mean"]     = sOG / nt;
            kpis_["E_MV_dry_mean"] = sDry / nt;
            kpis_["Pe_mean"]       = sPe / nt;
            if (entrainment) kpis_["psi_mean"] = sPsi / nt;
            if (effModel == TrayEfficiency::Model::SyedaChuang)
            {
                scalar sF = 0.0, sJ = 0.0, nOut = 0.0;
                for (std::size_t j = 0; j + 1 < N; ++j)
                { sF += eff[j].FSB; sJ += eff[j].fj; nOut += eff[j].ShOutOfRange ? 1.0 : 0.0; }
                kpis_["FSB_mean"] = sF / nt;
                kpis_["fj_mean"]  = sJ / nt;
                kpis_["trays_ShBelowPe40"] = nOut;
            }
            if (effModel == TrayEfficiency::Model::ChanFair)
            {
                scalar nPlug = 0.0;
                for (std::size_t j = 0; j + 1 < N; ++j) nPlug += eff[j].plugFlow ? 1.0 : 0.0;
                kpis_["trays_plugFlowLiquid"] = nPlug;
            }
        }
    }

    profile_ = UnitProfile{};
    profile_.xAxis = "stage";
    for (std::size_t j = 0; j < N; ++j)
    {
        profile_.columns["stage"].push_back(static_cast<scalar>(j + 1));
        profile_.columns["T"].push_back(T[j]);
        profile_.columns["E_MV"].push_back(E[j]);
        profile_.columns["V_kmol_h"].push_back(V[j] * 3600.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            profile_.columns["x_" + thermo.comp(i).name()].push_back(x[j][i]);
            profile_.columns["y_" + thermo.comp(i).name()].push_back(y[j][i]);
        }
        if (computedE && j + 1 < N)
        {
            profile_.columns["E_OG"].push_back(eff[j].EOG);
            profile_.columns["Pe"].push_back(eff[j].Pe);
            profile_.columns["F_active"].push_back(eff[j].Fa);
        }
        else if (computedE)
        {
            profile_.columns["E_OG"].push_back(1.0);
            profile_.columns["Pe"].push_back(0.0);
            profile_.columns["F_active"].push_back(0.0);
        }
    }

    //  THE FIRST LAW HERE IS CONSISTENT BY CONSTRUCTION, NOT VERIFIED (RB-02,
    //  2026-11-12).  This block used to pass the reboiler's own envelope as a
    //  "second route" and print VERIFIED.  It is not one: the march defines
    //  every vapour rate V_j from Q_R (V_j = Q_R / (h_V - h_L) on the cut), so
    //  each cut -- the reboiler's included -- carries Q_R by definition and the
    //  condenser duty -Q_C = Q_R holds identically, for ANY Q_R.  Reviewed by
    //  inflating Q_R 10 %: the envelope was then violated by 64 kW and the
    //  report still said VERIFIED with a gap of 1e-13 kW.  No route that does
    //  not start from the march's own definition exists in this model, so the
    //  closure is published with NO second route and says why; the numbers are
    //  held by the case's golden and by an independent recomputation, never
    //  by this closure (result/ClosureVariable.H: "by construction -- not
    //  verified").
    {
        closures_.clear();
        closures_.push_back(reboilerClosure(-QC, std::nullopt, /*fullMesh=*/true, 0.0,
            "the total-reflux march defines every vapour rate V_j from Q_R, so"
            " every cut carries Q_R and -Q_C = Q_R holds identically; the"
            " reboiler's own envelope on the same traffic is Q_R again, so it"
            " is not a second route (a Q_R inflated by 10 % still closes to"
            " rounding)"));
    }

    //  ---- The hydraulics of the trays (flood approach, pressure drop) ---
    {
        std::vector<scalar> Vt(V);
        Vt[N-1] = 0.0;                          // the reboiler is not a tray
        hydraulicsPass(operDict, unit, thermo, P, T, x, y, Vt, L, 0, verbosity);
    }
    return bubbleOk ? 0 : 1;
}


// ===========================================================================
//   TOTAL REFLUX OVER A PACKED BED (`model totalReflux;` + `packing {}`).
//
//   The same closed column as above, with the trays replaced by a bed of
//   structured packing of height H.  On every cross-section of the bed the
//   component balances give y = x (total reflux), so the vapour composition
//   obeys the transfer-unit equation
//
//       dy/dz = (y*(x = y) - y) / H_OG(z)
//
//   with y* the vapour in equilibrium with the liquid crossing the same
//   section and H_OG from the Rocha-Bravo-Fair model (PackingRBF.H).  The
//   pressure falls up the bed by the bed's own pressure drop, and the TOP
//   pressure is the specification (a test report gives the head pressure),
//   so the bottom pressure is found by a secant on the march.  The vapour
//   molar flow is taken constant up the bed (stated; the two xylenes have
//   latent heats within a few per cent); the reboiler is an equilibrium
//   stage below the bed.  The DOF argument is the one above: boil-up +
//   reboiler liquid.
//
//   What a test report computes is published as the KPI `HETP`: the bed
//   height over the Fenske stages between the liquid at the top of the bed
//   (the reflux) and the liquid leaving its bottom, alpha the geometric mean
//   of the two ends (Schulz et al. 2018, section 2).
// ===========================================================================
int DistillationColumn::solveTotalRefluxPacked(const DictPtr& dict,
                                               const ThermoPackage& thermo,
                                               int verbosity)
{
    auto operDict = dict->subDict("operation");
    const std::string unit = dict->name();
    const std::size_t n = thermo.n();
    for (const char* k : {"feed", "inputStreams", "reaction"})
        if (dict->found(k))
            throw std::runtime_error("DistillationColumn '" + unit + "': a packed"
                " column at total reflux has no feed and no products (found `"
                + std::string(k) + "`).");
    for (const char* k : {"nStages", "feeds", "sideDraws", "refluxRatio", "distillateRate",
                          "feedStage", "murphreeEfficiency", "efficiency", "hydraulics"})
        if (operDict->found(k))
            throw std::runtime_error("DistillationColumn '" + unit + "': `" + k
                + "` belongs to a TRAY column; a packed bed is declared by"
                  " `packing {}` alone.");
    if (n != 2)
        throw std::runtime_error("DistillationColumn '" + unit + "': the packed"
            " total-reflux bed is implemented for a BINARY.");
    const scalar Ptop = operDict->lookupScalar("P", Dims::pressure);
    if (readCondenserType(operDict, unit, verbosity) != CondenserType::total)
        throw std::runtime_error("DistillationColumn '" + unit + "': total reflux"
            " is modelled with a TOTAL condenser.");

    auto tr = operDict->subDict("totalReflux");
    if (tr->lookupWordOrDefault("specifiedAt", "reboiler") != "reboiler")
        throw std::runtime_error("DistillationColumn '" + unit + "': "
            + registryRefusal::message("total-reflux composition location",
                tr->lookupWordOrDefault("specifiedAt", "reboiler"), {"reboiler"}, "Accepted"));
    sVector xN(n, 0.0);
    {
        auto comp = tr->subDict("composition");
        scalar s = 0.0;
        for (const auto& key : comp->keys())
        { const std::size_t i = thermo.indexOf(key); xN[i] = comp->lookupScalar(key); s += xN[i]; }
        if (!(s > 0.0))
            throw std::runtime_error("DistillationColumn '" + unit + "': totalReflux.composition is empty");
        for (auto& v : xN) v /= s;
        //  RB-01: a binary bed needs BOTH components at the reboiler; with
        //  one at zero the relative volatility and the HETP are undefined
        //  (NaN when the heavy key is absent, a meaningless number otherwise).
        for (std::size_t i = 0; i < n; ++i)
            if (!(xN[i] > 0.0))
                throw std::runtime_error("DistillationColumn '" + unit + "': totalReflux.composition has "
                    + thermo.comp(i).name() + " at " + std::to_string(xN[i]) + ": a binary packed bed"
                    " needs BOTH components present at the reboiler (a pure fluid has no relative"
                    " volatility and no HETP).  Give each a positive mole fraction.");
    }
    if (!tr->found("fFactor") || tr->found("boilupRate"))
        throw std::runtime_error("DistillationColumn '" + unit + "': a packed bed"
            " takes the boil-up as `fFactor` (the reboiler vapour on the tower"
            " area), and only that.");
    const scalar Fspec = tr->lookupScalar("fFactor");

    auto pk = operDict->subDict("packing");
    const std::string pmodel = pk->lookupWordOrDefault("model", "RochaBravoFair");
    if (pmodel != "RochaBravoFair" && pmodel != "Delft")
        throw std::runtime_error("DistillationColumn '" + unit + "': "
            + registryRefusal::message("packing model", pmodel, {"RochaBravoFair", "Delft"}, "Accepted"));
    const bool delft = (pmodel == "Delft");
    const scalar Dcol = pk->lookupScalar("diameter", Dims::length);
    const scalar Hbed = pk->lookupScalar("height", Dims::length);
    PackingRBF::Geometry pg;
    PackingDelft::Geometry dg;
    pg.ap    = pk->lookupScalar("specificArea");
    pg.eps   = pk->lookupScalar("voidFraction");
    pg.theta = pk->lookupScalar("corrugationAngle") * constant::pi / 180.0;
    if (delft)
    {
        //  The Delft model reads the corrugation base and height and the
        //  element height (Fair et al. 2000, Table 2); its side follows.
        dg.ap = pg.ap; dg.eps = pg.eps; dg.alpha = pg.theta;
        dg.b   = pk->lookupScalar("corrugationBase", Dims::length);
        dg.h   = pk->lookupScalar("corrugationHeight", Dims::length);
        dg.hpe = pk->lookupScalar("elementHeight", Dims::length);
        dg.hpb = Hbed; dg.dc = Dcol;
        dg.Omega = pk->lookupScalarOrDefault("holeFraction", 0.0);
    }
    else
    {
        pg.S     = pk->lookupScalar("corrugationSide", Dims::length);
        const std::string surf = pk->lookupWordOrDefault("surface", "gauze");
        if (surf != "gauze" && surf != "sheetMetal")
            throw std::runtime_error("DistillationColumn '" + unit + "': "
                + registryRefusal::message("packing surface", surf, {"gauze", "sheetMetal"}, "Accepted"));
        pg.gauze = (surf == "gauze");
        if (!pg.gauze) pg.FSE = pk->lookupScalar("surfaceEnhancement");
    }
    const std::size_t lk = pk->found("lightKey") ? thermo.indexOf(pk->lookupWord("lightKey")) : 0;
    const std::size_t hk = 1 - lk;
    const scalar muLdecl = pk->found("liquidViscosity")
        ? pk->lookupScalar("liquidViscosity", Dims::viscosity) : 0.0;
    if (!(muLdecl > 0.0) && !thermo.hasLiquidViscosity())
        throw std::runtime_error("DistillationColumn '" + unit + "': the packing"
            " model needs a liquid viscosity -- a liquidViscosity model in the"
            " package or a measured `liquidViscosity <Pa s>;` in `packing {}`.");
    if (!thermo.hasTransport() || !thermo.hasDiffusivity() || !thermo.hasSurfaceTension())
        throw std::runtime_error("DistillationColumn '" + unit + "': the packing"
            " model needs the vapour viscosity and diffusivity and the surface"
            " tension from the package (`transport {}`).");
    const int nSeg = static_cast<int>(pk->lookupScalarOrDefault("segments", 200.0));
    const scalar A_T = 0.25 * constant::pi * Dcol * Dcol;
    const WilkeChang wilkeChang(nullptr);

    auto bubbleAt = [&](const sVector& xl, scalar P, scalar Tg)
    { bool ok = true; return bubbleTWithItsVapour(thermo, xl, P, Tg, 1.0e-12, &ok); };
    auto eqVap = [&](const sVector& xl, scalar T, scalar P)
    { return normalisedVapour(stageVapourK(thermo, T, P, xl), xl); };
    auto MWof = [&](const sVector& z)
    { scalar m = 0.0; for (std::size_t i = 0; i < n; ++i) m += z[i] * thermo.comp(i).MW(); return m; };
    auto composition = [&](scalar ylk)
    { sVector v(n, 0.0); v[lk] = ylk; v[hk] = 1.0 - ylk; return v; };

    struct Point { scalar z, y, P, T, ystar, HOG, HETP, dP, hL, beta, F, uL, lambda, flood; };
    std::vector<Point> prof;
    scalar Vmol = 0.0, TN = 0.0;

    //  Local state of the bed at liquid = vapour composition y.
    auto local = [&](scalar y, scalar P, scalar Tg, Point& p)
    {
        const sVector x = composition(y);
        p.y = y; p.P = P;
        p.T = bubbleAt(x, P, Tg);
        const sVector ys = eqVap(x, p.T, P);
        p.ystar = ys[lk];
        //  lambda = m G/L = m at total reflux; m from the local slope.
        const scalar h = std::min({1.0e-4, 0.5 * y, 0.5 * (1.0 - y)});
        auto ystarOf = [&](scalar xv) { const sVector xx = composition(xv);
            return eqVap(xx, bubbleAt(xx, P, p.T), P)[lk]; };
        p.lambda = (h > 0.0) ? (ystarOf(y + h) - ystarOf(y - h)) / (2.0 * h) : 1.0;
        const sVector yv = composition(y);
        const scalar rhoG = thermo.density(p.T, P, yv, DensityPhase::Vapour);
        const scalar rhoL = TrayHydraulics::liquidDensity(thermo, p.T, P, x).rho;
        const scalar MV = MWof(yv), ML = MWof(x);
        PackingRBF::State st;
        st.UGs = Vmol * MV / (rhoG * A_T);
        st.ULs = Vmol * ML / (rhoL * A_T);
        st.rhoG = rhoG; st.rhoL = rhoL;
        st.muG = thermo.viscosityGas(p.T, yv);
        st.muL = (muLdecl > 0.0) ? muLdecl : liquidProperty::evaluate(thermo, liquidProperty::Property::viscosity, p.T, P, x).value;
        st.sigma = liquidProperty::evaluate(thermo, liquidProperty::Property::surfaceTension, p.T, P, x).value;
        st.DG = thermo.diffusivityGas(p.T, P, 0, 1);
        const scalar D01 = wilkeChang.diffusivityLiquidBinary(thermo.comp(0), thermo.comp(1), p.T, st.muL);
        const scalar D10 = wilkeChang.diffusivityLiquidBinary(thermo.comp(1), thermo.comp(0), p.T, st.muL);
        st.DL = x[0] * D10 + x[1] * D01;
        PropertySourceLog::instance().useHere("liquidDiffusivity", liquidSource::ownWilkeChang, "own", took(st.DL, p.T, P));
        if (muLdecl > 0.0)
            PropertySourceLog::instance().useHere("liquidViscosity", liquidSource::declaredByCase, "declared", took(muLdecl));
        st.lambda = p.lambda;
        const PackingRBF::Result r = delft ? PackingDelft::evaluate(dg, st)
                                           : PackingRBF::evaluate(pg, st);
        if (r.flooded)
        {
            std::ostringstream o;
            o << "DistillationColumn '" << unit << "': the packed bed FLOODS (no"
                 " Rocha-Bravo-Fair holdup below " << pg.dPflood << " Pa/m) at F = "
              << st.UGs * std::sqrt(rhoG) << " (m/s)(kg/m3)^0.5, P = " << P * 1.0e-5
              << " bar.";
            throw std::runtime_error(o.str());
        }
        p.HOG = r.HOG; p.HETP = r.HETP; p.dP = r.dP; p.hL = r.hL;
        p.beta = r.ae / pg.ap;
        p.F = st.UGs * std::sqrt(rhoG);
        p.uL = st.ULs * 3600.0;                 // m3/(m2 h)
        p.flood = r.dP / pg.dPflood;
    };

    //  One march from the reboiler up the bed, given the bottom pressure.
    auto march = [&](scalar Pb)
    {
        prof.clear();
        TN = bubbleAt(xN, Pb, 350.0);
        const sVector yb = eqVap(xN, TN, Pb);
        const scalar rhoV = thermo.density(TN, Pb, yb, DensityPhase::Vapour);
        Vmol = Fspec * A_T * std::sqrt(rhoV) / MWof(yb);
        const scalar dz = Hbed / nSeg;
        scalar y = yb[lk], P = Pb, T = TN;
        for (int k = 0; k <= nSeg; ++k)
        {
            Point p; p.z = k * dz;
            local(y, P, T, p);
            prof.push_back(p);
            if (k == nSeg) break;
            //  Midpoint (RK2) on (y, P).
            Point q; q.z = p.z + 0.5 * dz;
            const scalar ym = y + 0.5 * dz * (p.ystar - y) / p.HOG;
            const scalar Pm = P - 0.5 * dz * p.dP;
            local(ym, Pm, p.T, q);
            y += dz * (q.ystar - ym) / q.HOG;
            P -= dz * q.dP;
            T = q.T;
        }
        return prof.back().P;
    };

    //  The bottom pressure is found by BISECTION between the declared top
    //  pressure and the top plus the flooding drop over the whole bed.  The
    //  top pressure a march reaches rises with the bottom one; a trial whose
    //  bed floods is a bottom pressure that is too LOW (lower pressure, faster
    //  vapour), so it is bracketed rather than abandoned.  A secant could step
    //  below the declared top and flood a trial bed the real one never sees.
    scalar Plo = Ptop, Phi = Ptop + pg.dPflood * Hbed;
    auto topGap = [&](scalar Pb, bool& flooded)
    {
        flooded = false;
        try { return march(Pb) - Ptop; }
        catch (const std::exception&) { flooded = true; return -1.0; }
    };
    bool fl = false;
    if (topGap(Phi, fl) < 0.0 || fl)
        throw std::runtime_error("DistillationColumn '" + unit + "': the packed bed"
            " floods at this boil-up even with the flooding pressure drop over its"
            " whole height -- no steady bed exists.");
    int it = 0;
    scalar g1 = 1.0;
    for (; it < 80; ++it)
    {
        const scalar Pm = 0.5 * (Plo + Phi);
        g1 = topGap(Pm, fl);
        if (g1 < 0.0 || fl) Plo = Pm; else Phi = Pm;
        if (!fl && std::abs(g1) <= 1.0e-9 * Ptop) break;
        if (Phi - Plo <= 1.0e-10 * Ptop) break;
    }
    g1 = topGap(Phi, fl);                   // publish a converged, unflooded bed
    if (fl || std::abs(g1) > 1.0e-6 * Ptop)
        throw std::runtime_error("DistillationColumn '" + unit + "': the bed's"
            " bottom pressure did not settle so that its top is at the declared P.");

    //  ---- What the test report computes --------------------------------
    const Point& top = prof.back();
    const Point& bot = prof.front();
    auto alphaAt = [&](const Point& p)
    { const sVector K = stageVapourK(thermo, p.T, p.P, composition(p.y)); return K[lk] / K[hk]; };
    const scalar alpha = std::sqrt(alphaAt(top) * alphaAt(bot));
    const scalar xT = top.y, xB = bot.y;      // reflux; liquid leaving the bed
    const scalar Nt = std::log((xT / (1.0 - xT)) / (xB / (1.0 - xB))) / std::log(alpha);
    const scalar HETP = Hbed / Nt;
    scalar sHETP = 0.0, sdP = 0.0, sBeta = 0.0, sHL = 0.0, sUL = 0.0, maxFlood = 0.0;
    for (const auto& p : prof)
    { sHETP += p.HETP; sdP += p.dP; sBeta += p.beta; sHL += p.hL; sUL += p.uL; maxFlood = std::max(maxFlood, p.flood); }
    const scalar np = static_cast<scalar>(prof.size());

    //  Duties: constant molar boil-up through the bed, total condenser.
    const sVector yb = composition(bot.y);
    const ColumnEnthalpy hs = columnEnthalpySurface(thermo, bot.P, {{TN, xN}});
    const scalar QR = Vmol * (hs.hV(yb, TN) - hs.hL(yb, bubbleAt(yb, bot.P, TN)));

    std::ostringstream rep;
    rep << "\n=============  DistillationColumn (total reflux, packed bed)  =============\n"
        << (delft ? std::string("  Delft model (Olujic et al. 1999; working equations of Fair et al., IECR 39 (2000) 1788, Tables 2 and 4)")
                  : std::string("  Rocha-Bravo-Fair (IECR 32 (1993) 641; 35 (1996) 1660), ")
                    + (pg.gauze ? "gauze area (1996 Eq 14)" : "sheet-metal area (1996 Eq 10)")) << "\n"
        << std::fixed << std::setprecision(4)
        << "  bed " << Hbed << " m, D " << Dcol << " m, a_p " << pg.ap << ", eps " << pg.eps
        << ", theta " << pg.theta * 180.0 / constant::pi << " deg"
        << (delft ? ", b " + std::to_string(dg.b * 1000.0) + " mm, h " + std::to_string(dg.h * 1000.0)
                    + " mm, element " + std::to_string(dg.hpe) + " m"
                  : ", S " + std::to_string(pg.S * 1000.0) + " mm") << "\n"
        << "  top " << top.P * 1.0e-5 << " bar (declared), bottom " << bot.P * 1.0e-5
        << " bar (" << it + 1 << " marches)\n\n"
        << "      z [m]    P [mbar]   T [K]    y(" << thermo.comp(lk).name()
        << ")   F      u_L[m/h]  HETP[m]  dP[mbar/m]  a_e/a_p\n";
    for (std::size_t k = 0; k < prof.size(); k += std::max<std::size_t>(1, prof.size() / 10))
    {
        const auto& p = prof[k];
        rep << "    " << std::setw(7) << std::setprecision(3) << p.z << "  "
            << std::setw(9) << std::setprecision(3) << p.P * 1.0e-2 << "  "
            << std::setw(7) << std::setprecision(2) << p.T << "  "
            << std::setw(8) << std::setprecision(5) << p.y << "  "
            << std::setw(6) << std::setprecision(3) << p.F << "  "
            << std::setw(7) << std::setprecision(3) << p.uL << "  "
            << std::setw(7) << std::setprecision(4) << p.HETP << "  "
            << std::setw(8) << std::setprecision(3) << p.dP * 0.01 << "  "
            << std::setw(7) << std::setprecision(3) << p.beta << "\n";
    }
    rep << std::defaultfloat << std::setprecision(6)
        << "\n  HETP (bed height / Fenske stages, alpha " << alpha << "): " << HETP << " m\n"
        << "  Pressure drop " << (bot.P - top.P) * 1.0e-2 / Hbed << " mbar/m; highest dP/dP_flood "
        << maxFlood << "\n"
        << "  Vapour molar flow taken constant up the bed; liquid in plug flow.\n"
        << "==========================================================================\n\n";
    std::cout << rep.str();

    produced_.clear();
    kpis_.clear();
    kpis_["HETP"] = HETP;
    kpis_["HETP_local_mean"] = sHETP / np;
    kpis_["theoreticalStages_bed"] = Nt;
    kpis_["alpha_mean"] = alpha;
    kpis_["dP_bed_mbar_per_m"] = (bot.P - top.P) * 1.0e-2 / Hbed;
    kpis_["dP_over_dPflood_max"] = maxFlood;
    kpis_["P_bottom_bar"] = bot.P * 1.0e-5;
    kpis_["fFactor_bedBottom"] = bot.F;
    kpis_["fFactor_bedTop"] = top.F;
    kpis_["uL_mean_m3_m2h"] = sUL / np;
    kpis_["holdup_mean"] = sHL / np;
    kpis_["aeOverAp_mean"] = sBeta / np;
    kpis_["T_top"] = top.T;
    kpis_["T_bottom"] = TN;
    kpis_["x_reflux_LK"] = xT;
    kpis_["x_belowBed_LK"] = xB;
    kpis_["x_reboiler_LK"] = xN[lk];
    kpis_["V_boilup"] = Vmol;
    kpis_["Q_reboiler_kW"] = QR;
    kpis_["Q_condenser_kW"] = -QR;

    profile_ = UnitProfile{};
    profile_.xAxis = "z";
    for (const auto& p : prof)
    {
        profile_.columns["z"].push_back(p.z);
        profile_.columns["P"].push_back(p.P);
        profile_.columns["T"].push_back(p.T);
        profile_.columns["y_" + thermo.comp(lk).name()].push_back(p.y);
        profile_.columns["HETP"].push_back(p.HETP);
        profile_.columns["dP_Pa_per_m"].push_back(p.dP);
        profile_.columns["F"].push_back(p.F);
    }
    //  Q_condenser = -Q_reboiler is ASSIGNED above (constant molar vapour up
    //  the bed, stated in the report), so the energy closure holds by
    //  construction here too; the tray path publishes that classification and
    //  the packed bed now does (RB-05, 2026-11-12).  The two duties are not
    //  independent: the real condenser sees latent heats at the top
    //  composition, which differ from the bottom's.
    closures_.clear();
    closures_.push_back(reboilerClosure(QR, std::nullopt, /*fullMesh=*/true, 0.0,
        "the packed bed takes the vapour molar flow constant up the bed and sets"
        " Q_condenser = -Q_reboiler by assignment, so the closure holds for any"
        " Q_reboiler; the condenser's own latent heat at the top composition is"
        " not computed"));
    (void)verbosity;
    return 0;
}


// ===========================================================================
//   A PACKING RECORD (C398 slice (e), PackingRecord.H).
//
//   When `packing {}` names a `record`, both packed solvers (the
//   transfer-unit bed above, the rate-based segments in RateBasedSegment.cpp)
//   read a COPY of this unit's dictionary whose packing block is the resolved
//   inline form, so a record-backed bed and an inline one go through the same
//   lookups and give the same doubles.  The case's own dictionary then
//   carries the copy's reads back, so the unread-key audit of its
//   `operation {}` judges what the solver consulted.  No `record`: the
//   resolver returns nullptr and the column reads the case's dictionary
//   exactly as before.  (Defined here, at the end of the file, so that no
//   line a lesson cites by file:line moves.)
// ===========================================================================
int DistillationColumn::solvePackedReadingRecord(const DictPtr& dict,
                                                 const ThermoPackage& thermo,
                                                 int verbosity,
                                                 bool rateBased)
{
    const DictPtr resolved = packingRecord::resolveUnit(dict, verbosity);
    if (!resolved) packingRecord::checkInlineRanges(dict);
    const DictPtr& use = resolved ? resolved : dict;
    const int rc = rateBased ? solveRateBased(use, thermo, verbosity)
                             : solveTotalReflux(use, thermo, verbosity);
    if (resolved)
    {
        //  The geometry a record-backed bed was solved with is not in the
        //  case's block, so the run publishes it: the GUI's stage sheet draws
        //  the corrugation angle and labels the area and void fraction from
        //  these, never from a block that does not hold them.  (An inline bed
        //  publishes nothing new: its block IS the resolved geometry.)
        auto pk = resolved->subDict("operation")->subDict("packing");
        kpis_["packing_specificArea_m2_m3"]  = pk->lookupScalar("specificArea");
        kpis_["packing_voidFraction"]        = pk->lookupScalar("voidFraction");
        kpis_["packing_corrugationAngle_deg"] = pk->lookupScalar("corrugationAngle");
        packingRecord::transferReads(*resolved, *dict);
    }
    return rc;
}

} // namespace Choupo
