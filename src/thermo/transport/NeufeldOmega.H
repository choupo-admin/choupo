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
Namespace
    Choupo::neufeld

Description
    THE NEUFELD COLLISION-INTEGRAL FIT, IN ONE HOME.

    Neufeld, Janzen & Aziz (1972) fitted the reduced Lennard-Jones (12-6)
    collision integrals as closed forms in T* = kT/epsilon.  The one this
    engine carries is Omega(2,2)* -- the integral that prices VISCOSITY
    (and, through it, thermal conductivity):

        Omega(2,2)*(T*) = 1.16145 / T*^0.14874
                        + 0.52487 / exp(0.77320 T*)
                        + 2.16178 / exp(2.43787 T*)          0.3 <= T* <= 100

    Until 2026-09-06 this expression lived inside ChungViscosity.cpp, where
    Chung evaluates it at ITS reduced temperature T* = 1.2593 T/Tc.  The
    Chapman-Enskog model evaluates the SAME integral at the Lennard-Jones
    T* = kT/epsilon, so the fit moved here and both call it -- the same
    expression in the same order, so Chung's numbers did not move (every
    Chung golden byte-identical; the transport01 witness among them).

    WHAT IS NOT HERE, said plainly.  Neufeld et al. also fitted Omega(1,1)*,
    the integral binary DIFFUSIVITY needs.  Its eight coefficients are NOT in
    this file, because no source in the tree carries them and a constant
    typed from memory is a number nobody can check (CLAUDE.md section 10).
    So the Chapman-Enskog D_AB is NOT built; the day the coefficients are
    cited with the paper or a secondary in hand, they belong HERE and
    nowhere else.

    PRIMARY: Neufeld, P. D., Janzen, A. R. and Aziz, R. A. (1972), J. Chem.
    Phys. 57(3), 1100-1102.  The coefficients above are the ones Chung
    carried since the engine's first transport slice; the transcription is
    anchored by `omega22(1.0)` against a literal (see ChungViscosity::verify
    and ChapmanEnskog::verify), which is a check of TRANSCRIPTION only.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {
namespace neufeld {

//  The fit's own stated domain in T* = kT/epsilon.
inline constexpr scalar TSTAR_LO = 0.3;
inline constexpr scalar TSTAR_HI = 100.0;

//  Omega(2,2)*(T*), the viscosity collision integral, dimensionless.
scalar omega22(scalar Tstar);

//  The value at T* = 1 as a LITERAL computed once from the printed
//  coefficients -- the transcription anchor both callers check against.
inline constexpr scalar OMEGA22_AT_ONE = 1.592520;

const std::string& citation();

} // namespace neufeld
} // namespace Choupo
