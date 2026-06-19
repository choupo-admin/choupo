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
    Choupo::PureFluidModel

Description
    A PURE-COMPONENT ABSOLUTE-PROPERTY method: given (T, p) for a phase that
    is effectively pure in ONE component, it returns that component's molar
    enthalpy, entropy, volume and heat capacity as ABSOLUTE values measured
    from the model's OWN reference datum (e.g. the IAPWS-IF97 triple-point
    state for water).

    -- Why a NEW model KIND (the "no parallel taxonomy" carve-out) --

    The repo's settled property contract forbids inventing a parallel
    interface taxonomy.  PureFluidModel is the explicit, forum-anticipated
    EXCEPTION: it is a genuinely NEW kind of model, not a re-skin of an
    existing one.  Every existing thermo interface returns something the
    generic Choupo chain already covers:

      * VaporPressureModel  -> Psat(T)                  (a coefficient curve)
      * HeatCapacityModel   -> Cp_ig(T)                 (one channel of h/s)
      * ActivityModel       -> gamma(T,x)               (mixture non-ideality)
      * EquationOfState     -> residuals/phi            (departure from ideal)

    NONE of them returns an ABSOLUTE h/s/v from a single self-contained
    multi-region fundamental equation tied to its own datum.  The generic
    Choupo enthalpy is BUILT UP (ideal-gas Hf + ∫Cp − Δhvap + EoS residual);
    a fundamental-equation property package is the inverse philosophy -- one
    closed thermodynamic surface, already self-consistent, that you read at
    (T,p).  That is a new abstraction, so it earns its own base class rather
    than being bent into VaporPressureModel or EquationOfState.

    -- Datum --

    The returned h/s/v are NOT on the elements (Hf) datum that the generic
    H_*_formation chain uses; they sit on the package's own datum.  In v1
    (this slice) PureFluidModel is therefore valid ONLY for a phase that is
    EFFECTIVELY PURE in the flagged component (x_i >= 0.999), where the
    package datum cancels in h_out − h_in just as the sensible per-component
    zero does in Hliquid/Hvapour.  Mixing two different datums in one stream
    is hard-refused at production time (the x>=0.999 guard in pureFluidRoute).

    A DATUM FLIP across a model boundary -- a per-unit thermo{} override that
    adds/removes a pure-fluid between adjacent units, so a pure-fluid datum
    meets the formation/sensible datum at a junction -- is HARD-REFUSED by the
    model-boundary audit (ModelBoundaryAudit.H: "datum change ... dH
    ill-posed"), because the two absolute-H gauges are incommensurable.  A
    closed single-package loop (e.g. rankine02_water) never triggers it: the
    constant offset cancels around the loop.  NOTE the standing limit -- the
    per-unit pure-fluid override is itself deferred; until it ships, a
    pure-fluid datum and the formation/sensible datum cannot coexist within
    one case, and the audit refuses loudly if they ever do.

    -- Factory --

    Explicit registration only (registerType / New / registerBuiltins),
    mirroring every other Choupo model base.  No auto-registration macros.

SourceFiles
    PureFluidModel.cpp
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

class PureFluidModel
{
public:
    virtual ~PureFluidModel() = default;

    // Selector name as written in the dict (e.g. "IF97").
    virtual std::string type() const = 0;

    // ABSOLUTE molar properties on the model's OWN datum.
    //   h_molar  [J/mol]       T [K], p [Pa]
    //   s_molar  [J/(mol·K)]
    //   v_molar  [m³/mol]
    //   cp_molar [J/(mol·K)]
    virtual scalar h_molar (scalar T_K, scalar p_Pa) const = 0;
    virtual scalar s_molar (scalar T_K, scalar p_Pa) const = 0;
    virtual scalar v_molar (scalar T_K, scalar p_Pa) const = 0;
    virtual scalar cp_molar(scalar T_K, scalar p_Pa) const = 0;

    // Saturation pressure [Pa] at T.  A pure fluid has a saturation line;
    // the sensible-datum Hliquid/Hvapour convenience paths (which carry no
    // pressure) read the SATURATED state here, so ThermoPackage need never
    // reach into a specific kernel.
    virtual scalar p_sat(scalar T_K) const = 0;

    // Saturation TEMPERATURE [K] at p -- the inverse of p_sat.  The dome-
    // crossing phaseChanger needs Tsat(P) directly (the superheat / subcool /
    // saturated-state targets are anchored to it).  Default implementation
    // inverts p_sat by bisection so any kernel works; IF97 overrides it with
    // its frozen, closed-form region-4 quadratic (Release Table 36).  Additive
    // -- existing kernels keep working untouched via the default.
    virtual scalar T_sat(scalar p_Pa) const;

    // ----- Transport properties on the model's OWN formulation -----------
    //
    // A fundamental-equation package usually ships matching transport
    // releases (for water: IAPWS R12-08 viscosity, R15-11 conductivity,
    // R1-76 surface tension).  The CONTRACT here is (T, p) -- never (rho, T):
    // the wrapper fetches its own density from the thermodynamic kernel
    // internally and feeds the (rho, T) transport kernels.  sigma is a
    // saturation-line property and takes only T.
    //
    //   mu     [Pa.s]       dynamic viscosity        T [K], p [Pa]
    //   lambda [W/(m.K)]    thermal conductivity     T [K], p [Pa]
    //   sigma  [N/m]        surface tension          T [K]
    //
    // Default base impls THROW (mirroring the T_sat precedent's additive
    // spirit, but transport has no universal fallback): a kernel that does
    // not ship its own transport releases inherits a clear refusal rather
    // than a silently-wrong number.  IF97WaterFluid overrides all three.
    virtual scalar mu    (scalar T_K, scalar p_Pa) const;
    virtual scalar lambda(scalar T_K, scalar p_Pa) const;
    virtual scalar sigma (scalar T_K) const;

    // Self-check: maximum relative deviation against the underlying
    // formulation's published verification states.  Delegates to the frozen
    // kernel(s) where one exists.  For the thermodynamic + viscosity +
    // conductivity releases <= 1e-8 means the transcription is intact; a
    // bundled surface-tension table carries fewer digits, so the folded
    // figure is table-grade (~1e-5) when sigma dominates.
    virtual double verify() const = 0;

    // ----- Explicit factory (no auto-registration macros) ----------------
    // The factory takes the dict naming the method and the molar mass of the
    // component the model serves [g/mol] -- a pure-fluid kernel speaks per
    // unit MASS, so the wrapper needs MW to bridge to per-mole.
    using Factory =
        std::function<std::unique_ptr<PureFluidModel>(const DictPtr&, scalar /*MW_g_per_mol*/)>;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<PureFluidModel> New(const DictPtr& dict,
                                               scalar MW_g_per_mol);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
