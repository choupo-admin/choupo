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
Functions
    Choupo::membrane::selectRatedTest
    Choupo::membrane::rateAtRatedTest
    Choupo::membrane::invertRatedRejection

Description
    ONE home for turning a data sheet's OBSERVED rejection into the
    INTRINSIC rejection the `constantRejection` transport law takes
    (DEV.md 4c C189, slice 1).

    OBSERVED IS NOT INTRINSIC.  A data sheet quotes the salt rejection of
    its standard test against the FEED, 1 - c_p/c_f.  The law's R_int is
    measured against the WALL, 1 - c_p/c_m, and the wall is richer than the
    feed twice over: the film polarises it (c_m/c_b > 1), and the bulk
    concentrates along the leaf as water leaves.  Pasting the sheet's 0.97
    as R_int therefore passes MORE salt than the sheet measured, by exactly
    those two factors.

    THE INVERSION.  The module itself is run at the rated test -- the same
    SpiralWoundModule::solve, on a deep copy of the unit's own dict, so the
    film, the spacer, the leaf, the osmotic model and the friction are the
    ones the case runs with -- and R_int is found such that the module's
    predicted OBSERVED rejection (its R_obs_<solute> KPI, 1 - c_p/c_feed,
    the sheet's definition) equals the sheet's, by a bracketed 1-D solve
    (Illinois regula falsi on [0, 1]; the predicted R_obs rises
    monotonically with R_int).  The probe is ONE element in ONE vessel
    (a data sheet rates one element) fed with
        water + the rated solute at feedMassFraction, at the rated P and T,
        permeate at the case's own P_permeate,
        volumetric feed = permeateFlow / recovery (the sheet's own figures).
    WHY THAT FEED FLOW.  The sheet's permeate and recovery together give
    the feed the element was tested at, and the feed flow is what fixes the
    crossflow and so the film coefficient k -- the number the polarisation
    depends on.  Matching the sheet's recovery instead would need a feed
    the sheet never ran, scaled by however far the membrane record's A_w is
    from the element's.  So the hydrodynamics are the test's, and the flux
    is the record's: the engine's permeate and recovery AT the rated test
    are published beside the sheet's, never hidden.  It is also the rule
    bin/curate/check_membrane_modules.py arm (f) runs the rated test with.

    WHICH TEST (C189 slice 2).  A record may carry several rated tests
    (`ratedTests ( ... )`).  The test whose solute is the asked one is
    taken; when two share that solute the case names one by its id,
    `rejection { MgSO4 ( fromRatedTest <id> ); }`, and an unnamed request
    refuses listing the ids.  The test's optional facts are read here and
    nowhere else: an absent rejection value type, pressure meaning or
    permeate-flow basis is ANNOUNCED with the reading taken (one
    `[ratedTest]` line, stdout + stderr + a provenance advisory); a range,
    a net driving pressure, a permeate flow from a separate test and a
    solute stated on another formula REFUSE (each leaves the probe without
    the number it needs); a gauge pressure is made absolute with the
    standard atmosphere, announced.

    WHAT IT REFUSES, by name: no `module` record, a record with no
    rated test, a solute that is not a rated one, a solute that is not
    a component of the case, a case whose solutes are declared ION BY ION
    (a salt test is not an ion rejection -- that split is SDEM's or
    DSPM-DE's), and a rated rejection the film model cannot reach (the
    predicted R_obs at R_int = 0 and 1 does not bracket it strictly).

    WHAT IT DOES NOT DO.  It does not correct the record's A_w (the rated
    permeate is printed beside the engine's, a finding, never tuned); it
    does not make R_int move with flux or concentration -- a constant R is
    still a constant R away from the test; and it inverts ONE solute, the
    one the sheet tested.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <limits>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;
class MembraneModule;
struct RatedTest;

namespace membrane {

//- The rated test as the probe runs it (SI).
struct RatedTestConditions
{
    std::string module;
    std::string test;                // "the rated test" or "test '<id>'"
    std::string caveats;             // what was announced about absent facts
    std::string solute;
    scalar feedMassFraction = 0.0;   // kg/kg
    scalar P                = 0.0;   // Pa, feed (absolute)
    scalar P_permeate       = 0.0;   // Pa, the case's own
    scalar T                = 0.0;   // K
    scalar recoverySheet    = 0.0;   // permeate/feed, the sheet's
    scalar permeateSheet    = 0.0;   // m3/s, the sheet's
    scalar rejectionSheet   = 0.0;   // OBSERVED, the sheet's
    scalar feedFlow         = 0.0;   // m3/s = permeateSheet / recoverySheet
};

//- What the module predicts at the rated test for one R_int.
struct RatedTestPoint
{
    scalar R_int        = 0.0;
    scalar R_obs        = 0.0;   // 1 - c_p/c_feed, the module's KPI
    scalar cmOverCb     = 1.0;   // channel average of c_m/c_b (1 + Gamma_avg)
    scalar recovery     = 0.0;   // the engine's, volumetric
    scalar permeateFlow = 0.0;   // m3/s, the engine's
};

//- What the module predicts at ANY stated conditions (SI), one element in
//  one vessel (the shortlist's probe, C189 slice 5; the rated test's too).
struct ModuleAtConditions
{
    scalar R_int        = 0.0;
    scalar R_obs        = 0.0;   // 1 - c_p/c_feed
    scalar cmOverCb     = 1.0;
    scalar recovery     = 0.0;   // volumetric, the engine's
    scalar flux         = 0.0;   // m3/m2/s, channel average
    scalar permeateFlow = 0.0;   // m3/s = flux x the record's active area
    scalar dP           = 0.0;   // Pa, feed-channel drop of the element
};

//- The module of `unitDict` run for ONE element at the conditions given
//  (water + `solute` at `feedMassFraction`, `feedFlow` m3/s, T, absolute P),
//  `solute` given intrinsic rejection R_int.  The one probe both the rated
//  test and the shortlist use.
ModuleAtConditions runModuleAt(const DictPtr& unitDict,
                               const ThermoPackage& thermo,
                               const MembraneModule& record,
                               const std::string& solute,
                               scalar R_int,
                               scalar feedMassFraction,
                               scalar feedFlow,
                               scalar T,
                               scalar P,
                               const std::string& unitLabel,
                               const std::string& probeName,
                               scalar A_w_override = std::numeric_limits<scalar>::quiet_NaN());

//- The inversion's answer.
struct RatedTestInversion
{
    RatedTestConditions conditions;
    RatedTestPoint      atRoot;           // the module at the derived R_int
    scalar R_int        = 0.0;
    scalar residual     = 0.0;            // R_obs(R_int) - rejectionSheet
    int    iterations   = 0;              // probe solves after the bracket
    scalar R_obs_at0    = 0.0;            // the bracket's ends
    scalar R_obs_at1    = 0.0;
};

//- The tolerance the bracketed solve stops at, on R_obs.
constexpr scalar ratedInversionTolerance = 1.0e-10;

//- The rated test `solute` asks for: the one test of that solute, or the
//  test named `testId` (empty: not named).  Refuses by name: no test, no
//  test of that solute, an unknown id, an id naming another solute's test,
//  two tests of the solute and no id.  `who` opens every refusal.
const RatedTest& selectRatedTest(const MembraneModule& record,
                                 const std::string& solute,
                                 const std::string& testId,
                                 const std::string& who);

//- The module of `unitDict` (a spiralWoundModule's augmented dict) run at
//  the rated test `test` of `record` with `solute` given intrinsic
//  rejection R_int; every other declared R kept.  Console output of the
//  probe is silenced and its advisories are filed as TRIAL ones.
RatedTestPoint rateAtRatedTest(const DictPtr& unitDict,
                               const ThermoPackage& thermo,
                               const MembraneModule& record,
                               const RatedTest& test,
                               const std::string& solute,
                               scalar R_int,
                               const std::string& unitLabel,
                               scalar A_w_override = std::numeric_limits<scalar>::quiet_NaN());

//- R_int for `solute` such that the module's predicted OBSERVED rejection
//  at the chosen rated test (selectRatedTest) equals the record's.
//  Refuses as stated above.
RatedTestInversion invertRatedRejection(const DictPtr& unitDict,
                                        const ThermoPackage& thermo,
                                        const MembraneModule* record,
                                        const std::string& solute,
                                        const std::string& testId,
                                        const std::string& unitLabel,
                                        scalar A_w_override = std::numeric_limits<scalar>::quiet_NaN(),
                                        bool announce = true,
                                        const std::string& pHNote = std::string());

//- THE SPLIT FORM (DEV.md 4c C198, Stage 1; membrane/AqueousSplit.H).  An
//  apparent component carried by an acid and its conjugate base has two
//  intrinsic rejections.  Each rated test of the component, at ITS OWN pH,
//  is inverted by the module's own film into the component's effective
//  rejection R_eff,t (the one-test inversion above, run per test), and
//
//        1 - R_eff,t = (1 - alpha_t)(1 - R_acid) + alpha_t (1 - R_base)
//
//  with alpha_t the base fraction at the test's pH and T (the package's, given
//  by the caller).  TWO tests at two pH are a 2x2 linear problem for the two
//  passages; ONE test determines the acid when the base is given.  Refuses by
//  name: a test with no stated pH, two tests at the same pH (alpha_1 ~ alpha_2:
//  unidentifiable), a solution with a negative passage or a rejection below
//  zero.
struct SplitRejections
{
    scalar R_acid = 0.0, R_base = 0.0;
    int    nTests = 0;
    std::vector<RatedTestInversion> inversions;  // per test, the one-test inversion
    std::vector<scalar>             alphas;      // per test
    std::vector<scalar>             pHs;
    std::vector<scalar>             R_eff;       // per test (the inversions' R_int)
};

//- The base fraction at a rated test: the caller's closure over the package.
using AlphaAtTest = std::function<scalar(const RatedTest&)>;

SplitRejections invertSplitFromTwoTests(const DictPtr& unitDict,
                                        const ThermoPackage& thermo,
                                        const MembraneModule* record,
                                        const std::string& component,
                                        const std::string& id1,
                                        const std::string& id2,
                                        const AlphaAtTest& alphaAt,
                                        const std::string& unitLabel,
                                        scalar A_w_override = std::numeric_limits<scalar>::quiet_NaN());

//- One test, the base's R_base given (declared or tied to another solute).
SplitRejections invertSplitFromOneTest(const DictPtr& unitDict,
                                       const ThermoPackage& thermo,
                                       const MembraneModule* record,
                                       const std::string& component,
                                       const std::string& id,
                                       scalar R_base,
                                       const AlphaAtTest& alphaAt,
                                       const std::string& unitLabel,
                                       scalar A_w_override = std::numeric_limits<scalar>::quiet_NaN());

//- The pure algebra, exposed for the gate: passages from two (alpha, R_eff)
//  pairs; refuses an unidentifiable pair or a negative passage.
void solveSplitPassages(scalar alpha1, scalar Reff1, scalar alpha2, scalar Reff2,
                        scalar& R_acid, scalar& R_base, const std::string& who);

//- The water permeance AND the intrinsic rejection that BOTH reproduce a
//  rated test (C189 slice 5b).  The record's A_w is a teaching fit to some
//  other case (the NF270 and SW30HR records say so); the data sheet's
//  permeate flow at its rated test is a MEASUREMENT of the element, and the
//  module's flux law J_w = A_w (dP - dpi) turns it into A_w the way the
//  observed rejection turns into R_int.  The two are coupled (the wall
//  concentration depends on the flux, the osmotic pressure on the
//  rejection), so they are found together by alternating the two bracketed
//  1-D solves until A_w is stationary.  The record's A_w is the start and is
//  returned beside the derived one.
struct WaterPermeanceDerivation
{
    scalar A_w          = 0.0;    // m/(s.Pa), derived
    scalar A_w_record   = 0.0;    // m/(s.Pa), the membrane record's
    int    rounds       = 0;      // alternations
    scalar permeateGap  = 0.0;    // relative: (engine - sheet)/sheet at the answer
    RatedTestInversion inv;       // the R_int at the derived A_w
};

WaterPermeanceDerivation deriveWaterPermeance(const DictPtr& unitDict,
                                              const ThermoPackage& thermo,
                                              const MembraneModule& record,
                                              scalar A_w_record,
                                              const std::string& solute,
                                              const std::string& testId,
                                              const std::string& unitLabel);

} // namespace membrane
} // namespace Choupo
