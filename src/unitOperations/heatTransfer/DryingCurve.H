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
    Choupo::DryingCurve

Description
    THE CHARACTERISTIC DRYING CURVE (van Meel, Chem. Eng. Sci. 9 (1958)
    36-44; Keey, Drying of Loose and Particulate Materials, Hemisphere,
    1992): the drying rate of a material, normalised by its constant-rate
    value, is a single function of its normalised free moisture,

        Phi = (X - X_eq) / (X_c - X_eq)          f = R / R_c = f(Phi)

    with f = 1 for Phi >= 1 (the constant-rate period, gas-film controlled)
    and f(0) = 0 (no drying at the equilibrium moisture).  The SHAPE of f
    below Phi = 1 is a property of the material and its internal transport,
    MEASURED, never derived here -- so the case declares it:

        dryingCurve
        {
            shape   linear | power | table;
            exponent  <n>;                   // power only:  f = Phi^n
            phi     ( 0 ... 1 );             // table only: the measured
            f       ( 0 ... 1 );             //   normalised curve, points
            source  "<where the curve comes from>";   // power and table
        }

    Absent block = `linear` (f = Phi), the law the batch dryer has always
    run and announced as a MODELLING CHOICE; a declared `linear` needs no
    source for the same reason.  A `power` or `table` curve is a claim
    about a material, so it must say where it came from -- a hypothetical
    teaching curve says so in those words.  `table` interpolates linearly
    between its points, which must run from (0, 0) to (1, 1) with Phi
    strictly and f non-strictly increasing: a normalised rate that RISES as
    the solid dries is not a characteristic curve, and smoothing a measured
    one is the curator's act, not the engine's.

    ONE HOME.  Every dryer that has a falling-rate period reads its curve
    here, so two dryers cannot run two versions of one idea.

SourceFiles
    DryingCurve.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

class DryingCurve
{
public:
    enum class Shape { linear, power, table };

    //- Read `op.dryingCurve {}` (absent -> linear, not declared).  `who`
    //  prefixes every refusal.
    static DryingCurve read(const DictPtr& op, const std::string& who);

    //- The normalised rate f(Phi); 1 above Phi = 1, 0 at and below 0.
    scalar f(scalar phi) const;

    Shape              shape()    const { return shape_; }
    bool               declared() const { return declared_; }
    scalar             exponent() const { return n_; }
    const std::string& source()   const { return source_; }
    std::string        shapeName() const;

private:
    Shape               shape_    = Shape::linear;
    bool                declared_ = false;
    scalar              n_        = 1.0;
    std::vector<scalar> phi_, f_;
    std::string         source_;
};

} // namespace Choupo
