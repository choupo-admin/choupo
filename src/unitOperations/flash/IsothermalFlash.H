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
#include "streams/ProcessStream.H"

#include <functional>
#include <map>
#include <string>
#include <memory>
#include <optional>

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

    // THE KIND OF THE SPLIT, as a FACT the engine reads (2026-10-05).  true
    // when the two phases this solution carries are both LIQUIDS: `x` is
    // liquid alpha, `y` is liquid beta and `V_over_F` is the beta LIQUID
    // fraction, not a vapour fraction.  Set at the sites that produce such
    // a split (the LL Gibbs minimisation, and the VLLE search that finds no
    // vapour) and read by every caller that must tell a second liquid from
    // a vapour.  `regime` is prose for a human and is NEVER parsed for this:
    // the VLLE fallback's own string, "two-phase liquid (LL, VLLE attempt
    // ...)", contains "VL", and a substring test sent its beta liquid out
    // on the vapour port with vf = 1.
    bool    liquidLiquid = false;

    // VLLE extension: when threePhase == true, x / y still
    // carry the two liquid compositions (α, β) and V_over_F carries
    // β_α; the vapour phase appears in `xVapor` with fraction
    // `betaVapor`.  betaBeta = 1 - betaVapor - V_over_F.
    bool    threePhase = false;
    scalar  betaVapor  = 0.0;
    sVector xVapor;

    // Path-specific observables published verbatim as unit KPIs (the
    // reactive package adds pH / p_eq_sum_atm / p_mono_atm / p_dimer_atm
    // so sweeps and outer drivers can read the chemistry acting with T).
    std::map<std::string, scalar> extraKpis;

    // Vapour-dimerisation enthalpy correction [J per mol FEED]: the
    // apparent (monomer-basis) vapour enthalpy plus this term is the TRUE
    // vapour enthalpy (h_dim = 2 h_mono + dH exactly) -- added to the duty,
    // announced, never silently monomer-priced.
    scalar dimerHeat_J_per_molFeed = 0.0;

    // The reactive package's SOLVED speciation of the liquid, as species
    // FLOWS -- attached to the liquid outlet as a report-only decomposition
    // (never state; see ProcessStream::Speciation).  Null on every other path.
    std::shared_ptr<const ProcessStream::Speciation> speciation;

    // The reactive package's SECOND LIQUID at the answer, per component
    // [kmol/s] -- report-only: the two liquids leave through ONE nozzle, so
    // this decomposes that stream, it does not add another.  Null when one
    // liquid.  Only the ORGANIC side; the aqueous is the liquid minus it, so
    // the pair closes by subtraction instead of by two roundings agreeing.
    std::shared_ptr<const sVector> organicLiquid;

    // The PRECIPITATED solid, per component [kmol/s].  Unlike the two above
    // this is NOT report-only: it becomes the stream's solid material, so the
    // liquid left behind is the liquid actually in solution.  Empty when
    // nothing precipitated, or when no component declares the mineral's
    // owning solid phase (that mineral stays in the speciation report).
    sVector solidFlows;

    // TRUE on the LIQUID+SOLID (SLE) branch (migration S4b): the answer came
    // from the crystallizing-solid complementarity, not from a fluid-fluid
    // split.  The duty block reads it: an SLE duty must price the crystal on
    // the SOLID formation rung, which h_formation cannot yet serve for a
    // gas-natural record (no gas -> solid leg) -- so when a crystal formed,
    // Q is withheld as a NAMED gap, never computed fluid-only (a fluid-only
    // number silently omits the heat of fusion, which is the whole duty of
    // a freezer).
    bool sleBranch = false;
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

    //  THE OPTIONS A UNIT DICT DECLARES, read in ONE place (2026-10-05,
    //  DEV.md C35 item 4).  `solve()` reads them here, and so does
    //  `inletEquilibriumOptions` below, so the search the unit runs and the
    //  search the energy report runs on the unit's feed are one parse, not
    //  two that happen to agree.  `in` is the operating state the
    //  `phaseSet auto` decision is taken at (T, P and the feed z).
    static FlashOptions readOptions(const DictPtr&       unitDict,
                                    const ThermoPackage& thermo,
                                    const FlashInput&    in,
                                    int                  verbosity);

    //  THE SEARCH THIS UNIT RESOLVES ITS FEED WITH, when it is richer than
    //  the vapour-liquid default every other reader applies -- i.e. when the
    //  unit's phase set is (or `auto` resolves to) VLLE.  Nothing otherwise.
    //  An unpinned feed MEANS its own equilibrium (R-E2), and for a unit
    //  that admits two liquids and a vapour, that equilibrium is the
    //  three-phase one: the energy report must resolve the stream with THIS
    //  search or it prices a different state from the one the unit
    //  consumed (vlle03 on a datum: 186.48 kW of "duty" for an identity
    //  operation).  `T`, `P`, `z` are the stream's; the operating T and P
    //  are the unit's declared ones when it declares them, as in `solve()`.
    //  Quiet (verbosity 0) and with no residual sink.
    static std::optional<FlashOptions>
    inletEquilibriumOptions(const DictPtr&       unitDict,
                            const ThermoPackage& thermo,
                            scalar               T,
                            scalar               P,
                            const sVector&       z);

private:
    inline static const std::string type_ = "isothermalFlash";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

//  ---- WHICH PHASE A VLLE ANSWER PUTS ON WHICH PORT (2026-10-05) -----------
//
//  A `phaseSet VLLE` flash always emits three ports (vapour, liquid alpha,
//  liquid beta), and its solution packs them differently by KIND: a genuine
//  three-phase answer carries the vapour in `xVapor` / `betaVapor` and the
//  ALPHA fraction in `V_over_F`; a VL fallback carries the vapour in `y` /
//  `V_over_F`; an LL fallback carries the beta LIQUID there.  ONE home for
//  the unpacking: the unit's ports, its duty and its KPIs read it, and so
//  does `flashState::hOfState` when the energy report prices a feed it
//  resolved with the unit's own VLLE search (C35 item 4) -- which is why it
//  left the .cpp's anonymous namespace.
struct VllePhase
{
    scalar  beta = 0.0;   //  fraction of the feed on this port
    sVector z;            //  its composition
    scalar  vf   = 0.0;   //  1 for the vapour port, 0 for a liquid one
};
struct VllePorts { VllePhase vapour, alpha, beta; };

VllePorts vllePorts(const FlashSolution& sol, std::size_t n);

void printFlashResult(const FlashSolution& sol,
                      const ThermoPackage& thermo,
                      const FlashInput&    in);

} // namespace Choupo
