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
    Choupo::Fuller

Description
    Fuller-Schettler-Giddings (1966) correlation for low-pressure binary
    gas diffusivity:

        D_AB = 1.43e-7 T^1.75
               ------------------------------------------------      [m²/s]
               P M_AB^0.5 ( Σv_A^(1/3) + Σv_B^(1/3) )²

        M_AB = 2 / (1/M_A + 1/M_B)   [g/mol],   P in bar,   T in K,
        Σv   = diffusion volume [-], the sum of tabulated atomic increments,
               carried on each Component as `diffusionVolume`.

    PRIMARY: Fuller, E. N., Schettler, P. D. and Giddings, J. C. (1966),
    Ind. Eng. Chem. 58(5), 18-27.  Transcribed from Reid, Prausnitz &
    Poling, 4th ed. (1987), eq. 11-4.4 (the route).

    THE ANCHOR IS ARITHMETIC, and says so.  The 1966 paper compares its fit
    against measured pairs; none of those numbers is transcribed here, so
    the only anchor this code can honestly claim is its own closed form at a
    stated point -- which checks the transcription and the unit chain
    (cm² -> m², bar), and nothing about the physics.  (Chapman-Enskog,
    needing Lennard-Jones σ and ε/k that no record carries, is the named
    next model; see docs/design/transport-correlations-as-objects.md.)
\*---------------------------------------------------------------------------*/

#pragma once

#include "DiffusivityModel.H"

namespace Choupo {

class Fuller : public DiffusivityModel
{
public:
    explicit Fuller(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }
    scalar diffusivityGasBinary(const Component& a, const Component& b,
                                scalar T_K, scalar P_Pa) const override;
    CorrelationVerify verify() const override;

    //  The kernel, public and static: one home for the formula.
    static scalar kernel(scalar Ma_g_per_mol, scalar Mb_g_per_mol,
                         scalar sumVa, scalar sumVb,
                         scalar T_K, scalar P_Pa);           // m²/s

private:
    inline static const std::string name_ = "Fuller";
    inline static const std::string window_ =
        "dilute binary gas at pressures where D_AB scales as 1/P (ideal-gas "
        "density); the exponent 1.75 and the atomic diffusion volumes were "
        "fitted to low-pressure data -- the correlation declares no explicit "
        "temperature window and this engine announces none, said here so "
        "the silence is not read as coverage";
    inline static const std::string cite_ =
        "Fuller, E. N., Schettler, P. D. and Giddings, J. C. (1966), Ind. "
        "Eng. Chem. 58(5), 18-27 [primary]; transcribed via Reid, Prausnitz "
        "& Poling, 4th ed. (1987), eq. 11-4.4";
};

} // namespace Choupo
