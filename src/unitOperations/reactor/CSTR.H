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
    Choupo::CSTR

Description
    Continuous Stirred-Tank Reactor (CSTR) operating in:
        * single liquid phase
        * isothermal regime at T_op
        * steady state
        * single reaction with power-law kinetics

    Reaction:    Σ ν_i M_i  =  0       (signs:  ν<0 for reactants)
    Rate law:    r [mol/(m³·s)] = k(T) · Π C_j^β_j
                 k(T) = A_pre · exp(-E_a / R T)        (Arrhenius)

    Mole-balance on the CSTR (per component i):

         F_i,out  =  F_i,in  +  ν_i · ξ

    with the molar extent  ξ [mol/s] = r · V_R.  We close this system
    by computing  C_j = F_j,out / Q  where Q is the outlet volumetric
    flow.  Assuming additive liquid volumes,

         V_mol(x_out) = Σ x_j,out · Vliq_j         [m³/mol]
         Q            = F_total,out · V_mol(x_out)  [m³/s]

    The single nonlinear equation in ξ is solved by 1-D Newton-Raphson
    with bracket bisection fall-back on  ξ ∈ [0, F_A,in / |ν_A|].

Dictionary form:

        cstr
        {
            feed
            {
                F          1.0;             // kmol/h
                T          350.0;           // K
            }
            operation
            {
                V_R        0.05;            // m³  (reactor volume)
            }
            composition
            {
                ethanol    1.0;
                water      0.0;
            }
            reaction
            {
                limitingReactant   ethanol;
                stoichiometry
                (
                    { component  ethanol;  nu -1; order 1; }
                    { component  water;    nu  1; order 0; }
                );
                kinetics
                {
                    type   Arrhenius;
                    A      1.0e8;          // s^-1   (1st order)
                    Ea     8.0e4;          // J/mol
                }
            }
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <string>

namespace Choupo {

class CSTR : public UnitOperation
{
public:
    CSTR() = default;

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

private:
    inline static const std::string type_ = "cstr";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
