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
    Choupo::CycloneModel

Description
    Selectable sub-model for the gas-solid cyclone's collection efficiency
    --- the same explicit-factory pattern as ActivityModel / EquationOfState
    / TransportModel.  A cyclone case picks one with `model <name>;` in its
    operation block and can swap freely to compare.

    These are SIMPLE empirical / semi-empirical correlations anchored in
    data (Box: "all models are wrong, but some are useful").  NOT CFD ---
    CFD is out of Choupo's scope (a job for a CFD solver).  Several wrong-but-useful correlations,
    side by side, so the student sees which one fits THEIR data.

    Interface: given a CycloneContext (geometry + gas/particle properties),
    a model returns the grade efficiency η(d) for any particle size and a
    cut diameter d50 (the size at η = 0.5).  Model-specific empirical
    parameters (Leith-Licht's geometric constant C, Iozia-Leith's slope β)
    are read from the operation dict by `readParameters` --- and are exactly
    what a `FitParameters` calibration to experimental data would tune.

    Built-ins:
        Lapple       --  classic d50 + η = 1/(1+(d50/d)^2)        [default]
        LeithLicht   --  back-mixing: η = 1−exp(−2(Cψ)^(1/(2n+2)))
        IoziaLeith   --  data-fitted logistic: η = 1/(1+(d50/d)^β)
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

// Everything a cyclone sub-model needs, in canonical SI.
struct CycloneContext
{
    scalar Dc    = 0.0;    // body diameter [m]
    scalar Ne    = 5.0;    // effective number of turns [-]
    scalar Q     = 0.0;    // volumetric gas flow [m^3/s]
    scalar vi    = 0.0;    // inlet velocity [m/s]
    scalar mu    = 0.0;    // gas viscosity [Pa.s]
    scalar rho_g = 0.0;    // gas density [kg/m^3]
    scalar rho_p = 0.0;    // particle density [kg/m^3]
    scalar T     = 298.15; // temperature [K]
    scalar loading = 0.0;  // inlet solids loading [kg solid / kg gas]
};

class CycloneModel
{
public:
    using Factory = std::function<std::unique_ptr<CycloneModel>()>;

    virtual ~CycloneModel() = default;

    virtual const std::string& type() const = 0;

    // Read model-specific empirical parameters from the operation dict.
    // Default: nothing (Lapple has no free parameters).
    virtual void readParameters(const DictPtr& /*oper*/) {}

    // Grade efficiency η(d) in [0,1] for a particle of diameter d [m].
    virtual scalar gradeEfficiency(scalar d, const CycloneContext& c) const = 0;

    // Cut diameter d50 [m] (size at η = 0.5).  Default: bisection on
    // gradeEfficiency; models with a closed-form d50 override this.
    virtual scalar cutDiameter(const CycloneContext& c) const;

    // Pressure drop [Pa].  Default: Shepherd-Lapple (ΔP = N_H ρ_g v_i²/2,
    // N_H = 8 velocity heads for the Lapple standard geometry); models with
    // their own ΔP correlation (Barth) override this.
    virtual scalar pressureDrop(const CycloneContext& c) const;

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<CycloneModel> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
