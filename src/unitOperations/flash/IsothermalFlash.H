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
    Choupo::IsothermalFlash

Description
    Isothermal (T,P) flash of a multicomponent mixture using K-values
    from the supplied ThermoPackage.  Solves the Rachford-Rice equation

        g(V) = Σ_i  z_i (K_i - 1) / [ 1 + V (K_i - 1) ]  =  0

    by a 1-D Newton-Raphson with bisection fall-back (delegated to
    Choupo::solver::newton1D).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <functional>
#include <string>

namespace Choupo {

struct FlashInput
{
    scalar  F  = 0.0;    // total molar feed flow [kmol/h]
    scalar  T  = 0.0;    // operating temperature [K]
    scalar  P  = 0.0;    // operating pressure    [Pa] (SI)
    sVector z;           // feed mole fractions  (Σ z_i = 1)
};

struct FlashSolution
{
    scalar  V_over_F   = 0.0;
    sVector x;
    sVector y;
    sVector K;
    int     iterations = 0;
    scalar  residual   = 0.0;
    bool    converged  = false;
    std::string regime;   // "subcooled liquid" | "two-phase" | "superheated vapor"

    // VLLE extension: when threePhase == true, x / y still
    // carry the two liquid compositions (α, β) and V_over_F carries
    // β_α; the vapour phase appears in `xVapor` with fraction
    // `betaVapor`.  betaBeta = 1 - betaVapor - V_over_F.
    bool    threePhase = false;
    scalar  betaVapor  = 0.0;
    sVector xVapor;
};

enum class OuterAccelerator { DirectSubstitution, Wegstein };

// Phase-set selection for the flash:
//   VL    — vapour / liquid          (the legacy mode)
//   LL    — liquid / liquid          (ternary extraction, decanters)
//   VLLE  — vapour + 2 liquids       (heterazeotropic distillation)
enum class PhaseSet { VL, LL, VLLE };

struct FlashOptions
{
    scalar           tolerance      = 1.0e-8;
    int              maxIter        = 50;
    int              verbosity      = 3;
    OuterAccelerator accelerator    = OuterAccelerator::Wegstein;
    scalar           wegsteinQmin   = -5.0;
    scalar           wegsteinQmax   =  0.0;
    scalar           compositionTol = 1.0e-6;
    int              maxOuterIter   = 100;
    PhaseSet         phaseSet       = PhaseSet::VL;

    // LL-only: which component is biased into phase α (or β) for the
    // initial guess.  Breaks the trivial K=1 fixed point at x_α=x_β=z.
    // SIZE_MAX = use first / last component by default.
    std::size_t      llAlphaRichComp = static_cast<std::size_t>(-1);
    std::size_t      llBetaRichComp  = static_cast<std::size_t>(-1);

    // Optional sink for the per-iteration composition residual |Δx|.
    // The unit-op layer wires this to UnitOperation::recordResidual so
    // the GUI's convergence plot can show the outer-loop history.
    std::function<void(scalar)> residualSink;
};

class IsothermalFlash : public UnitOperation
{
public:
    explicit IsothermalFlash() {}

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

    // Lower-level call for use without a controlDict (e.g. unit tests).
    static FlashSolution solveCore(const FlashInput& in,
                                   const ThermoPackage& thermo,
                                   const FlashOptions& opts);

private:
    inline static const std::string type_ = "isothermalFlash";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

void printFlashResult(const FlashSolution& sol,
                      const ThermoPackage& thermo,
                      const FlashInput&    in);

} // namespace Choupo
