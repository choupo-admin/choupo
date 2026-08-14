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
Description
    ONE home for the lumped-Cp column energy note.

    `Absorber` and `Stripper` carry the SAME stage energy balance -- the
    textbook one: the liquid's heat capacity is the SOLVENT's alone, the
    vapour's is the FEED gas at feed composition, both evaluated once at the
    inlet temperature and held constant across the column, with the per-solute
    heat of absorption as the only source term.  It is a perfectly respectable
    teaching model and it is NOT the canonical enthalpy the energy report
    prices (elements / formation datum, full mixture, T-dependent Cp).

    So the converged temperature profile does not conserve canonical H, and
    the unit's own streams carry a first-law residual.  Measured 2026-08-14:
    -19.87 kW on `stripper01_NH3_water`, -11.25 kW on the acetone plant's
    absorber.  Both had read `n/a` in the model-boundary ledger until the
    audit was extended to units declaring no duty -- the residual is not new,
    it was unlit.

    `absorber01_NH3_water` shows +82.93 kW and only ~28 kW of that is THIS
    model: the rest is its gas feed priced as a LIQUID, because N2's vapour
    pressure extrapolated above its critical temperature makes the phase
    resolution return all-liquid for the mixture.  A residual on a column is
    not automatically this approximation -- check how the inlets were priced
    before attributing it here.

    This is the choupoCtrl dynamicCSTR situation one field away (a Cp /
    convective energy equation is not the derivative of the canonical U), and
    it takes the same posture: ANNOUNCE the approximation, do not present the
    residual as a first-law failure, and do not quietly reformulate a model
    the corpus is pinned to.

    The SIZE is deliberately not recomputed here.  The energy report already
    publishes it (`raw_imbalance_kW`), and a second arithmetic home for one
    number is the sin most of this project's gates exist to prevent.  The
    sentence itself has one home for the same reason: two columns sharing an
    energy model must not drift into two descriptions of it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Advisory.H"

#include <iostream>
#include <string>

namespace Choupo {

//  Announce the lumped-Cp energy model of a rate-based column.  Call ONLY on
//  the non-isothermal branch: an isothermal column makes no temperature claim
//  and has no approximation of this kind to confess.  Prints at its site when
//  the advisory was new, exactly as the other "no silent crutch" events do.
inline void announceLumpedCpColumnEnergy(const std::string& unitType,
                                         int                verbosity)
{
    const std::string msg =
        "the column energy balance is a LUMPED-Cp model: liquid Cp is the "
        "solvent's alone, vapour Cp is the feed gas at feed composition, both "
        "constant across the column, source term = heat of absorption.  It is "
        "NOT the canonical (formation-datum, full mixture, T-dependent) "
        "enthalpy the energy report prices, so the converged temperature "
        "profile leaves a first-law residual on this unit's streams.  Read it "
        "in reports/balances/energyBalance_byUnit.csv (raw_imbalance_kW): it "
        "is the size of the approximation, not a solver failure.";

    if (AdvisoryLog::instance().add("model", "warning", unitType, msg)
        && verbosity >= 1)
        std::cout << "  [model] " << msg << "\n";
}

} // namespace Choupo
