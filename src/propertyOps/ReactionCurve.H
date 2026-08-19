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
    Choupo::ReactionCurve

Description
    THE PROCESS REACTION CURVE, and the FOPDT model identified from it.

    A student draws the open-loop step response by hand, reads a gain, a time
    constant and an apparent dead time off it, and turns those three numbers
    into controller settings with a published rule.  That is the control
    curriculum's McCabe-Thiele: a graphical construction the student owns,
    laid over a plant the engine actually integrated.

    THE IDENTIFICATION IS ENGINE-SIDE BECAUSE IT IS A REGRESSION.  Fitting

        y(t) = y0 + K du [ 1 - exp( -(t - t_step - theta) / tau ) ],
               t >= t_step + theta,     y = y0 before that

    to a measured response is physics with a residual, not a view.  A drawing
    layer that did its own fit would be a second implementation of one model,
    and the number a reader acts on would live in two places.  So the engine
    identifies, publishes (K, tau, theta) WITH the fit's own quality beside
    them, and a tool draws what is published.

    WHY THIS IS A PROPERTY OPERATION AND NOT AN OuterDriver.  An OuterDriver
    receives a `SimulationResult`, and choupoCtrl's campaign functor puts the
    FINAL state into it -- the response curve is not there, and the artefact
    that carries it (`trajectory.csv`) is written only on the outer-most,
    non-driver pass (`runCampaign(dict, writeOutputs=false, ...)` inside
    `driver->setSimulator`).  A driver therefore cannot see a step response
    without changing the result record or the application.  The props BENCH
    already has the right shape for this: `kinetics1D`, `vaporPressureFit` and
    `heatCapacityFit` are all regressions of a model onto published data, and
    this is one more.

    THE EXPERIMENT IS SEPARATE FROM ITS ANALYSIS, deliberately.  This op reads
    a trajectory the dynamic binary WROTE; it does not run the plant.  Running
    it here would be a second time loop beside choupoCtrl's, which is the
    defect this project keeps paying for.  The consequence is a two-command
    workflow in one case directory, and a REFUSAL by name when the trajectory
    is not there yet.

    WHAT AN FOPDT MODEL IS, said in the engine's own voice and not only here.
    Nothing about a real plant is first order with a transport delay; the
    model is a SURROGATE, valid over the step it was shown and over nothing
    else.  This op cannot inspect the plant -- it sees a trajectory -- so it
    does not assert what order the plant is.  It states what it did (fit the
    best FOPDT description of THIS response to THIS step) and publishes the
    size of the difference (`fit_rmse_relative`), which is the falsifiable
    half of the same sentence.

    WHY AdvisoryLog AND NOT ProblemDivergence.  `ProblemDivergence` records
    that the engine solved a DIFFERENT problem from the one posed -- a
    rigorous column silently run as a shortcut, a declared NRTL pair run
    ideal.  Here the problem posed IS "what is the best FOPDT surrogate of
    this response", and that is exactly what is delivered: nothing was
    substituted, nothing was downgraded, and the answer is not to another
    question.  What it IS is a QUALIFIED answer -- the surrogate is not the
    plant -- and a qualified answer is what `AdvisoryLog` carries.  Filing it
    as a divergence would put a routine, always-present statement into the
    channel whose whole value is that it is normally empty.

    THE OPERATION DICT

        {
            name        fopdt_jacket_to_compB;
            type        reactionCurve;

            trajectory  trajectory.csv;      // written by choupoCtrl

            manipulated JacketStep.MV;       // the driven column
            measured    reactor.n_compB;     // the response column

            settling
            {
                tolerance  0.005;   // of the segment's own step change
                window     0.15;    // final fraction of the segment tested
            }

            reference   3;          // which segment the headline reports

            tuning
            {
                rules  ( zieglerNichols cohenCoon imcLambda );
                forms  ( PI PID );
                lambda { relativeToTau 1.0; }    // or  { value 300 s; }
            }

            output
            {
                segments  reactionCurveSegments.csv;
                curve     reactionCurve.csv;
                tuning    reactionCurveTuning.csv;
            }
        }

    THE PUBLISHED CSV COLUMNS, stated here because a second author draws them.

      segments   segment, tStepLower, tStepUpper, tEnd, nPoints, sampleInterval,
                 u_before, u_after, du, y_before, y_end, dy,
                 preStepSteadyMetric, settleMetric, settleTolerance,
                 K, tau, theta, thetaAtLowerBound, thetaSampleUncertainty,
                 K_steadyState, K_relativeDeviation,
                 rmse, rmse_relative, maxAbsResidual, maxAbsResidual_relative,
                 R2, tau_twoPoint, theta_twoPoint, nmIterations, nmRestarts,
                 nmConverged

      curve      segment, t, tRelative, u, y, yFit, residual, yNormalised,
                 yFitNormalised

      tuning     segment, du, rule, source, form, Kc, Ti, Td, KcK, thetaOverTau

    `tRelative` is t - tStepLower: the reaction curve's own clock, which is
    what a student draws against.  `yNormalised` is (y - y_before)/dy, so
    every segment's curve is comparable on one axis whatever its step size --
    and where those normalised curves do NOT superpose is exactly where the
    plant is nonlinear.

    THE THREE TUNING RULES, each attributed in the published `source` column
    and never quoted without it, because they disagree and the disagreement is
    the lesson.  A rule this file cannot cite to a primary is not shipped.

      zieglerNichols   Ziegler, J.G. & Nichols, N.B., "Optimum Settings for
                       Automatic Controllers", Trans. ASME 64 (1942) 759-768.
                       The open-loop (process reaction curve) settings, in
                       which the curve's reaction rate R and lag L become
                       R = K/tau and L = theta for an FOPDT model.
      cohenCoon        Cohen, G.H. & Coon, G.A., "Theoretical Consideration of
                       Retarded Control", Trans. ASME 75 (1953) 827-834.
      imcLambda        Rivera, D.E., Morari, M. & Skogestad, S., "Internal
                       Model Control: 4. PID Controller Design", Ind. Eng.
                       Chem. Process Des. Dev. 25 (1986) 252-265.  The FOPDT
                       entry with a first-order Pade approximation of the
                       delay; the closed-loop speed lambda is the ENGINEER'S
                       choice and this op refuses to invent one.

    The independent two-point construction published beside the regression is

      Sundaresan, K.R. & Krishnaswamy, P.R., "Estimation of time delay, time
      constant parameters in time, frequency, and Laplace domains", Can. J.
      Chem. Eng. 56 (1978) 257-262:   tau = 0.67 (t_85.3 - t_35.3),
                                      theta = 1.3 t_35.3 - 0.29 t_85.3.

    It is NOT the answer -- it uses two points where the regression uses every
    one of them -- but it is arithmetic a student can repeat with a ruler, and
    a regression nobody can check by hand is a black box with a residual.

    WHAT THIS OP REFUSES, each by name and with the remedy:

      * a trajectory file that is not there (the experiment has not been run);
      * a `manipulated` or `measured` column the trajectory does not carry;
      * a trajectory in which the input never steps;
      * a segment with too few samples to regress three parameters;
      * a segment whose response HAS NOT SETTLED -- a time constant read off a
        curve still moving is a fiction, and this is the refusal the whole op
        is built around;
      * a segment whose PRE-step window is not steady -- a gain measured while
        the plant was already moving is not a gain;
      * a response too small to identify (dy indistinguishable from zero);
      * `imcLambda` requested with no `lambda {}` declared;
      * every tuning rule that divides by theta, when theta sits at its lower
        bound of zero -- announced, and the identification itself still
        stands.

    WHAT IT DOES NOT DO.  It does not judge whether the FOPDT surrogate is
    good enough for the reader's purpose, does not simulate the tuned loop,
    and does not recommend a rule.  It publishes three rules' disagreement and
    the residual that produced them.  Judging is the reader's, exactly as with
    the Weisz-Prater modulus in `thielePellet`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class ReactionCurve : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    {
        return { "K", "tau_s", "theta_s", "fit_rmse_relative",
                 "K_spread_relative", "tau_spread_relative",
                 "theta_spread_relative" };
    }

private:
    inline static const std::string type_ = "reactionCurve";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
