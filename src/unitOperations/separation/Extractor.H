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

private:
    inline static const std::string type_ = "extractor";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
