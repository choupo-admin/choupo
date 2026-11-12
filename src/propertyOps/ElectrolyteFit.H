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
    Choupo::ElectrolyteFit

Description
    electrolyteFit -- regress the parameters of ONE fully dissociated salt in
    water against its mean ionic activity coefficient gamma_pm and its osmotic
    coefficient phi at one temperature (DEV.md 4c C311).

        {
            name     fit_pitzer;
            type     electrolyteFit;
            cation   Na;   anion NO3;          // charges from species/<name>.dat
            model    pitzer;                   // pitzer | eNRTL
            dataset  "constant/experiments/Na-NO3.dat";
            heldOut  { every 4; offset 3; }    // optional; see below
            pitzer   { alpha1 2.0; alpha2 12.0; fitBeta2 false; }
            eNRTL    { alpha 0.2; }
            grade    { limits_pct ( 2 5 10 ); }
            proposal { file "Na-NO3.pitzer.proposal.dat"; }
        }

    THE MODELS ARE THE ENGINE'S OWN.  The residual is computed with the very
    closed forms the engine evaluates a salt with -- PitzerSingleSalt.H (the
    HMW form: beta0, beta1, Cphi, and beta2 for a 2:2 salt, alpha1 / alpha2
    and b = 1.2 fixed) and ENRTLSingleSalt.H (tau_m_ca, tau_ca_m; alpha fixed,
    0.2 by the project's eNRTL convention, Chen & Evans 1986) -- so a record
    written from this fit reproduces, in a case, the numbers it was fitted to.

    THE RESIDUAL.  Per point, two rows, equal weight, both dimensionless:
    ln gamma_model - ln gamma_measured and phi_model - phi_measured.  The
    Pitzer residual is linear in its parameters, so the search below lands in
    one step; the eNRTL one is not, and is started from four points of a
    stated grid, keeping the best.

    THE SEARCH is the fitter's own Levenberg-Marquardt step
    (fitAlgebra::solveDamped, the same normal equations fitParameters uses).

    THE DATASET is read by the ONE evidence loader (EvidencePartition::
    loadTable): `columns ( { name m; unit mol/kg; } { name gamma; unit -; }
    { name phi; unit -; } )`, `data ( ... )` and a held-constant
    `temperature <T> K;`.

    `heldOut { every N; offset k; }` sets aside the points whose position in
    the file (0-based, as listed) satisfies index % N == k -- never the first
    or the last row, so the fitted window is the dataset's.  The fitter is
    never handed them; their errors are printed and published beside the
    in-sample ones.  They are INTERLEAVED POINTS OF THE SAME SOURCE: they can
    show that the model does not merely pass through the points it saw, and
    they cannot contradict the source itself.  The op says so, and never calls
    them a validation (the contract that can is EvidencePartition's, and it
    refuses one identity in both roles).

    THE GRADE, when `grade { limits_pct ( c w s ); }` is declared: the
    largest relative error over the fitted points, of gamma_pm and of phi,
    in per cent, is clean <= c < warning <= w < severe <= s < refused.  It is
    IN-SAMPLE and labelled so; the same rule applied to the held-out points is
    published beside it.

    The proposal file carries the fitted parameters and the numbers above, so
    a catalogue record can be held equal to what its case regresses
    (bin/curate/check_regressed_electrolytes.py).

\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo
{

class ElectrolyteFit : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "electrolyteFit"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    {
        std::vector<std::string> h;
        for (const char* k : { "inSample_max_pct", "heldOut_max_pct" })
            if (diag_.count(k)) h.push_back(k);
        return h;
    }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
