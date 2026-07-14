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
    Stoichiometric EQUILIBRIUM reactor (the "REquil" of process simulators).
    You give a SET of R independent reactions; the reactor drives them to
    SIMULTANEOUS chemical equilibrium via each reaction's temperature-dependent
    equilibrium constant Kp_j(T), from the species' Gibbs-of-formation data
    (K = exp(-dG deg/RT)) -- NO kinetics, NO residence time.  The R extents are a
    RESULT: the coupled gas-phase (ideal) equilibrium system
        Kp_j = PROD_i (p_i/P deg)^nu_ij,   n_i = n_i0 + SUM_j nu_ij xi_j
    is solved for xi by a multivariate Newton (finite-difference Jacobian), in
    log form for conditioning.  This is the reforming/shift/synthesis workhorse
    (e.g. water-gas-shift + methanation together).  Distinct from
    `conversionReactor` (extent SPECIFIED), `gibbsReactor` (Gibbs minimisation,
    NO reactions given -- cannot restrict which reactions equilibrate), and
    `cstr`/`pfr` (equilibrium reached only KINETICALLY, needing rate data).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class EquilibriumReactor : public UnitOperation
{
public:
    EquilibriumReactor() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "equilibriumReactor";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
