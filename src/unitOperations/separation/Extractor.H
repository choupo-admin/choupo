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
    Choupo::Extractor

Description
    Counter-current multistage LIQUID-LIQUID EXTRACTION column (the
    Aspen "Extract" analogue).  A feed enters one end (stage 1); a fresh
    solvent enters the other (stage N).  Over N theoretical stages the
    solute transfers OUT of the feed-derived RAFFINATE phase INTO the
    solvent-derived EXTRACT phase.  The two liquid phases pass each other
    counter-currently --- raffinate 1 -> N, extract N -> 1 --- exactly as
    the trays of a distillation column pass liquid down and vapour up.

    Each theoretical stage is ONE liquid-liquid equilibrium: the two
    streams arriving at the stage are mixed and split into two liquid
    phases by the SHARED Gibbs-energy-minimisation LL flash kernel
    (IsothermalFlash::solveCore with phaseSet = LL).  This is called
    READ-ONLY --- the extractor never re-implements the equilibrium; it
    only links the stages and tears the cascade.

    THE LL-FLASH TRAP (CLAUDE.md sec.9): for a symmetric gamma-model an
    LL flash solved by Newton / successive-substitution on the K = 1
    residual collapses onto the trivial x_alpha = x_beta saddle.  The
    shared kernel sidesteps this by minimising the Gibbs energy of mixing
    directly (Nelder-Mead, multi-start) --- so the Extractor inherits a
    robust per-stage split for free.

    The cascade itself is solved by SUCCESSIVE SUBSTITUTION (Gauss-Seidel
    stage sweeps with under-relaxation), mirroring the bubble-point loop
    of the distillation column: initialise every up-flowing extract with
    the solvent, sweep the stages flashing each one, and iterate the
    stage flows to convergence.  The per-iteration |Delta(flows)| is
    pushed to recordResidual so the convergence plot can show it.

    Credo-pure hardware: the operation block carries `stages` (and the
    optional shared `temperature`).  The solute RECOVERY, the
    distribution ratio, and the extract / raffinate flows are RESULTS.

    EXPLICIT ASSUMPTIONS (glass-box): counter-current, N equilibrium
    stages, isothermal (one temperature for the whole column --- LLE is
    weakly enthalpic and the energy balance is intentionally out of
    scope here, exactly as the absorber/stripper fall back to isothermal
    when Cp data are absent), the two liquids are the two `liquid` phases
    declared in the thermoPackage.

    Inputs  (feed  solvent );      // feed at stage 1, solvent at stage N
    outputs (extract  raffinate );  // extract leaves stage 1, raffinate stage N
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>

namespace Choupo {

class Extractor : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

    //  THE CASCADE STARTS SOMEWHERE, AND THE CASE MAY OWN WHERE.
    //
    //  The stage profile this unit publishes -- the extract and raffinate
    //  flow leaving every stage, with their compositions -- is exactly the
    //  state the Gauss-Seidel sweep starts FROM, so a case may declare a
    //  `stageProfile` block in `0/internalStates/<SECTOR>/<unit>` and the
    //  cascade begins there instead of at the seed this class invents (every
    //  stage holding the fresh solvent and the raw feed).  Declaring the kind
    //  is what makes the file legal: the flowsheet refuses any interior no
    //  unit reads.
    std::vector<std::string> readsInteriorKinds() const override
    { return { "stageProfile" }; }

    //  The seed above, rendered as the profile `choupo-init0` materialises --
    //  built by the SAME two functions the solve uses, so the file and the run
    //  can never describe different starting states.
    std::map<std::string, UnitProfile>
    seedInterior(const DictPtr&                    unitDict,
                 const std::vector<ProcessStream>& inputs,
                 const ThermoPackage&              thermo) const override;

private:
    //  THE SEED, IN ITS ONE HOME.  Every stage's extract is the fresh
    //  solvent and every stage's raffinate is the feed -- honest and
    //  topology-propagated (it is made of the streams the case declares,
    //  never of a universal constant).
    static void seedCascade(const sVector&        feedMol,
                            const sVector&        solvMol,
                            int                   N,
                            std::vector<sVector>& Emol,
                            std::vector<sVector>& Rmol);

    //  THE CASCADE AS A `stageProfile`, in its one home: the profile this
    //  unit publishes at the answer and the one `choupo-init0` writes for
    //  the seed are rendered here, so the round trip is between two
    //  spellings of one object rather than two objects.
    static UnitProfile renderCascade(const std::vector<sVector>& Emol,
                                     const std::vector<sVector>& Rmol,
                                     const std::vector<sVector>& xE,
                                     const std::vector<sVector>& xR,
                                     const ThermoPackage&        thermo);

    //  Start the cascade from the case's DECLARED interior when it declared
    //  one, and from `seedCascade` when it did not.  Returns true when the
    //  declaration was used.  BOTH ROUTES ANNOUNCE (the 2026-05-30 rule); a
    //  declaration that does not describe THIS cascade REFUSES by name.  What
    //  is NOT checked is whether the profile is an ANSWER: a declared profile
    //  that violates the stage balances is a SEED, and the sweeps move off it.
    bool seedFromDeclaredInterior(int                   N,
                                  const ThermoPackage&  thermo,
                                  const sVector&        feedMol,
                                  const sVector&        solvMol,
                                  std::vector<sVector>& Emol,
                                  std::vector<sVector>& Rmol,
                                  int                   verbosity) const;

    inline static const std::string type_ = "extractor";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
