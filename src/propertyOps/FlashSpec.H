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
    Choupo::FlashSpec

Description
    A flash SPECIFIED by a pair other than (T, P), on the props bench:
    (P, H), (P, S), (T, V/F) or (P, V/F) (DEV.md 4c C214 W1).  The op is a
    reader and a printer; the state is `flashState::specifiedFlash`'s, the
    one home every unit that needs such a state will call
    (src/unitOperations/flash/SpecifiedFlash.H).

    Dictionary form:

        {
            name          expansion;
            type          flashSpec;
            composition   { water 1; }          // moles, normalised
            spec
            {
                pair      PS;                   // PH | PS | TVF | PVF
                P         0.1 bar;              // held: P (PH, PS, PVF) / T (TVF)
                //  the specified value, ONE of:
                //    H  <J/mol>;   S  <J/(mol K)>;   vaporFraction <0..1>;
                //  or, for PH / PS, the H or S OF A STATE of the same feed
                //  (priced on the same surface -- an isentropic expansion's
                //  inlet, an adiabatic flash's feed):
                targetFrom { T 773.15 K;  P 80 bar; }
                seed      320 K;                // optional start of the unknown
            }
            window        { Tmin 250 K;  Tmax 900 K; }        // optional
            convergence   { tolerance 1e-9; relTol 0; maxIter 100; }  // optional
        }

    H and S are per mole of feed, on the surface the energy report prices
    (`hOfState`, `sOfState`); a `pureFluids {}` method (IF97) prices them on
    its own datum, which is why a steam case reads the steam table directly
    (the per-mass columns are J/g = kJ/kg).

    Published diagnostics: T, P, vaporFraction, H, S, H_per_mass,
    S_per_mass, onSaturationPlateau, flashes, iterations, residual, and per
    present component x_<c> / y_<c>; with `targetFrom`, ref_T, ref_P,
    ref_vaporFraction, ref_H, ref_S and dH_fromReference (H - ref_H: the
    isentropic work per mole of an expansion).

SourceFiles
    FlashSpec.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class FlashSpec : public PropertyOperation
{
public:
    FlashSpec() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

    //  Derived from what THIS run published (S is absent where the package
    //  has no entropy for the state).
    std::vector<std::string> headline() const override { return headline_; }

private:
    inline static const std::string type_ = "flashSpec";
    std::map<std::string, scalar>   diag_;
    std::vector<std::string>        headline_;
};

} // namespace Choupo
