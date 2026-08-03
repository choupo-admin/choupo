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
    Choupo::PinchPass

Description
    Pinch-analysis TARGETS (programme phase P1, approved 2026-08-02) and
    the CANDIDATE-MATCH ANALYSIS TABLE (phase P2, ratified 2026-08-03 --
    an analysis table, never a rewiring; P3 area/cost targets stay
    UNAUTHORISED).

    Declared in the postDict chain:

        pinchPass { dTmin 10 K; }

    From the converged SimulationResult it extracts the hot/cold stream
    population, builds the shifted composite curves and the
    Linnhoff-Flower problem table (printed cascade row by cascade row --
    the glass-box heart of the method), and reports the energy targets:

        KPIs  pinch.Q_H_min_kW  pinch.Q_C_min_kW
              pinch.T_pinch_K (shifted)  pinch.T_pinch_hot_K / _cold_K
              pinch.Q_heat_current_kW / Q_cool_current_kW  (the honest
              current-vs-target line: what the unintegrated duties consume)
        CSV   reports/pinch/compositeCurves.csv  (hot / cold /
              hotShifted / coldShifted polylines the GUI can plot)

    METHOD HYPOTHESES (state them or the students will over-trust it):
      * CP is CONSTANT PER SEGMENT: each duty-carrying unit contributes
        ONE straight segment CP = |Q| / |T_out - T_in| between its inlet
        and outlet temperatures.  A strongly T-dependent cp is therefore
        linearised over the unit; split the unit in the flowsheet to
        refine.
      * A PHASE CHANGE (|dT| below `latentWidth`, default 1 K, with
        Q != 0) is represented as a near-isothermal slice of width
        `latentWidth` centred on the unit temperature -- the standard
        composite-curve treatment of latent duty.
      * The stream population is the units' GENERIC `Q` KPI paired with
        the FIRST non-utility inlet/outlet stream: multi-duty equipment
        (a column's reboiler + condenser) enters as its net unless
        modelled as separate units.
      * The current-vs-target line sums the units' raw heating/cooling
        duties -- heat already recovered through drawn heat-links is
        counted at the units it still touches.
      * `dTmin` here is the PROCESS-process approach of the targeting
        exercise, declared in this pass's own block.  The
        `utilityAllocation` report's `dTmin` is the duty-to-UTILITY
        approach, declared in that report's block; the two are separate
        declarations because they are separate physical approaches
        (same 10 K default).

    P2 -- the candidate-match table (Linnhoff & Hindmarsh 1983, the
    design-method rules applied as ANALYSIS, never synthesis):

        CSV   reports/pinch/candidateMatches.csv
              region,hotStream,coldStream,temperatureFeasible,pinchRule,
              maximumCandidateDuty_kW,limitingReason,recommendation
        KPIs  pinch.candidates_admissible / candidates_total
              pinch.violation_heat_below_pinch_kW
              pinch.violation_cool_above_pinch_kW

    P2 HYPOTHESES (on top of P1's):
      * Segments are CLIPPED at the pinch into the above/below regions;
        every hot x cold pair per region is a row -- the table is
        exhaustive per region, and the author owns the topology (the
        engine says what the physics ADMITS, it recommends no network
        and NEVER writes "optimal": every feasible row is a
        "thermodynamically admissible candidate", nothing more).
      * The maximum candidate duty is the exact counter-current bound of
        two constant-CP segments at the declared dTmin:
        Q_max = min(Q_hot, Q_cold, min(CP_h, CP_c)*(Th_hi - Tc_lo -
        dTmin)) -- for straight segments the approach is monotone along
        the exchanger, so the end constraints are sufficient.  The
        BINDING bound is named per row (limitingReason).
      * The CP rule binds ONLY at the pinch (above: CP_hot <= CP_cold;
        below: CP_hot >= CP_cold).  A pinch match violating it may still
        be admissible AWAY from the pinch -- said so, by name.
      * The violation diagnostics classify the P1 population against the
        pinch: heating demand below it / cooling demand above it are the
        coursework violations (served by recovery in the design method,
        never by a utility), reported per unit with their duties.  With
        the P1 raw-duty hypothesis these sum, together with any
        cross-pinch transfer, to EXACTLY the current-vs-target excess.
    See docs/design/pinch-programme-scope.md and the theory guide.

\*---------------------------------------------------------------------------*/

#pragma once

#include "PostProcessor.H"

namespace Choupo {

class PinchPass : public PostProcessor
{
public:
    explicit PinchPass(const DictPtr& dict);

    const std::string& type() const override { return type_; }
    int                run(SimulationResult& result) override;

private:
    inline static const std::string type_ = "pinchPass";
    scalar dTmin_       = 10.0;   // [K] minimum approach
    scalar latentWidth_ = 1.0;    // [K] near-isothermal slice width
};

} // namespace Choupo
