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
    Choupo::GibbsReactor

Description
    Constrained Gibbs-energy minimisation reactor for a single-phase
    ideal-gas mixture.  Given a feed, target temperature and pressure,
    and an explicit atom-balance matrix declared in the operation
    block, solves

        min   G(n)  =  Σ_i n_i · μ_i(T, P, y)
         n   subject to   A · n  =  b           (element balance)
                          n_i ≥ 0               (mole numbers)

    via the standard Lagrangian formulation: introduce one multiplier
    π_j (= λ_j / RT) per element, plus ln(N_total), and solve the
    M+1 nonlinear equations

        Σ_i A_{ji} · n_i(π, ln N_total)  =  b_j        j = 1..M
        Σ_i        n_i(π, ln N_total)    =  N_total

    using NewtonND with the existing finite-difference Jacobian.  Each
    n_i comes from the stationarity condition

        n_i  =  exp(ln N_total − ln P − g_i°(T)/RT  +  Σ_k π_k A_{ki}).

    For the ideal-gas reference at P° = 1 bar with φ_i = 1
    assumption, the chemical potential reduces to
        μ_i  =  g_i°(T) + RT ln(y_i · P).

    Inputs (operation block):
        T             reactor temperature  [K]
        P             reactor pressure     [bar]
        elements      list of element names tracked  (C H O )
        species       list-of-dicts, one per participating component:
                          { name <comp>;  atoms (N_e1  N_e2... ); }

    The species' `name` must match a component already registered in
    the thermo package.  Each `atoms` vector lists the count of each
    element (in the order declared by `elements`) for that species.

    The reactor produces a single outlet stream (vapour, vf = 1) with
    the equilibrium composition, and exposes the equilibrium mole
    fractions and N_total as KPIs.

    KPIs:
        T, P, F_out_kmol_h, N_in_mol_s, N_out_mol_s,
        y_<species> for each species in the operation block.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class GibbsReactor : public UnitOperation
{
public:
    GibbsReactor() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "gibbsReactor";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
