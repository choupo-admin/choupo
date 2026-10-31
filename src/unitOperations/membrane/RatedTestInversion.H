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

    WHAT IT REFUSES, by name: no `module` record, a record with no
    `ratedTest {}`, a solute that is not the rated one, a solute that is not
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

#include <string>

namespace Choupo {

class ThermoPackage;
class MembraneModule;

namespace membrane {

//- The rated test as the probe runs it (SI).
struct RatedTestConditions
{
    std::string module;
    std::string solute;
    scalar feedMassFraction = 0.0;   // kg/kg
    scalar P                = 0.0;   // Pa, feed
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

//- The module of `unitDict` (a spiralWoundModule's augmented dict) run at
//  the record's rated test with `solute` given intrinsic rejection R_int;
//  every other declared R kept.  Console output of the probe is silenced
//  and its advisories are filed as TRIAL ones.
RatedTestPoint rateAtRatedTest(const DictPtr& unitDict,
                               const ThermoPackage& thermo,
                               const MembraneModule& record,
                               const std::string& solute,
                               scalar R_int,
                               const std::string& unitLabel);

//- R_int for `solute` such that the module's predicted OBSERVED rejection
//  at the rated test equals the record's.  Refuses as stated above.
RatedTestInversion invertRatedRejection(const DictPtr& unitDict,
                                        const ThermoPackage& thermo,
                                        const MembraneModule* record,
                                        const std::string& solute,
                                        const std::string& unitLabel);

} // namespace membrane
} // namespace Choupo
