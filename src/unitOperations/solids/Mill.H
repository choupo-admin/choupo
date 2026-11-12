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
    Choupo::Mill

Description
    SIZE REDUCTION AS A BREAKAGE POPULATION BALANCE ON THE CASE'S SIZE GRID
    (DEV.md 4c C361 slice 2; docs/design/c361-solids-processing.md).

    The feed's mass fractions f_i on the case's classes (`sizeGrid {}`) are
    ground by the first-order law of Austin (1971, eq. 37),

        dw_i/dtheta = - kappa_i w_i + SUM_{j > i} b_ij kappa_j w_j,

    over one pass (theta from 0 to 1), kappa_i the breakage EXTENT of class i
    the selection function returns (S_i tau, or S_i^E E for the
    energy-specific model) and b_ij the breakage function's share of class j's
    fragments that land in class i.  Two residence-time limits, both in Austin
    (1971) and both exact on the grid:

        residence plugFlow;        p = exp(M) f               (eq. 49: a batch
                                   mill ground for t = tau), M_ij = b_ij kappa_j,
                                   M_jj = - kappa_j
        residence perfectlyMixed;  p_i (1 + kappa_i) = f_i + SUM_{j>i} b_ij kappa_j p_j
                                                               (eq. 44a)

    MASS IS CONSERVED CLASS BY CLASS BY CONSTRUCTION: b_ij is a difference of
    the cumulative B, so SUM_{i<j} b_ij = B(1) - B(0) = 1 and every column of
    M sums to zero -- and so does every power of M, so the matrix exponential
    keeps SUM p = SUM f to round-off, and the closure is printed.  The pan
    (class 0) does not break.  The chemistry does not change: each solid
    component's flow passes through, only the distribution moves.

    ENERGY (the rotating-equipment rule: the shaft work is declared, never a
    hidden result).  Exactly one of

        W_shaft          the net shaft power drawn [W]
        specificEnergy   E = W_shaft / solids mass flow [J/kg, or kWh/t]

    and the other follows.  Comminution turns essentially all of it into heat
    (Wills p. 110: "most of the energy input ... is absorbed by the machine
    itself"), so the outlet temperature is the RESULT of
    H(out, T_out) = H(in) + W_shaft on the elements datum (fluid by
    `flashState::priceState`, solid by `priceSolids`) -- the mill is adiabatic
    and its shaft work is published as `W_shaft_kW`, the energy report's work
    item.  For `herbstFuerstenau` the same E is what breaks the particles; for
    the rate models it is only priced, and the run says so.

    BOND, BESIDE IT, NEVER INSTEAD (`bond { workIndex ...; }`, optional):
    W_Bond = 10 Wi (1/sqrt(P80) - 1/sqrt(F80)) on the run's OWN F80 and P80,
    printed beside E with their ratio and the operating work index
    Wio = Wi E / W_Bond (Wills p. 112) -- a cross-check of two theories.

    REFUSED, by name: a feed whose distribution is not on the case's size
    grid; a time-basis model with no residence time (or two of them); an
    energy model with no energy; a shaft power and a specific energy both
    declared; a feed with no solids.

    Operation:
        W_shaft | specificEnergy                    (exactly one)
        residence      plugFlow | perfectlyMixed    (default plugFlow, said)
        residenceTime | holdup                      (time-basis models only)
        selection { ...the model's parameters... }  (`model` word selects it)
        breakage  { model austin; phi; gamma; beta; }
        bond      { workIndex 12.74 kWh/shortTon; } (optional)

    Inputs ( feed );   outputs ( product );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Mill : public UnitOperation
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
    std::string                   type_ = "mill";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
