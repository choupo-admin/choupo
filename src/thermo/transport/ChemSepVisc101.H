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
    Choupo::ChemSepVisc101

Description
    Liquid viscosity in the DIPPR/ChemSep equation form 101:

        mu(T) = exp( A + B/T + C ln T + D T^E )          [Pa.s]

    read from the component's own
    `liquidViscosity { chemsepEq101 { A; B; C; D; E; Tmin; Tmax; } }`
    block -- the same per-component shape Andrade and Vogel already use, and
    the reason Component exposes that block raw: "so a new model can be added
    without touching Component".  It was right.

    WHY A MODEL RATHER THAN A REFIT TO ANDRADE.  414 of 431 imported records
    state their liquid viscosity in this form.  Andrade is exp(A + B/T), two
    parameters against five; forcing this correlation into it would discard
    the ln T and power terms and replace a published fit with an
    approximation to it, carrying a residual nobody could see.

    THE FORM IS CONFIRMED, not assumed.  No curated Choupo component carries
    an Andrade block for a substance ChemSep also lists, so there was no
    internal oracle; the check was made against handbook viscosities at
    25 C (2026-08-26):

        water      0.897 vs 0.890 mPa.s     0.8 %
        benzene    0.601 vs 0.604           0.4 %
        ethanol    1.078 vs 1.074           0.3 %
        methanol   0.543 vs 0.544           0.1 %
        n-hexane   0.299 vs 0.300           0.4 %
        toluene    0.554 vs 0.560           1.0 %

    Six substances spanning a factor of 3.6 in viscosity, worst 1.0 %.  A
    wrong form or a wrong unit could not land there.

SourceFiles
    ChemSepVisc101.cpp

\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidViscosityModel.H"

namespace Choupo {

class ChemSepVisc101 : public LiquidViscosityModel
{
public:
    explicit ChemSepVisc101(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar viscosityLiquidPure(const Component& c, scalar T_K) const override;

private:
    inline static const std::string name_ = "chemsepEq101";
};

} // namespace Choupo
