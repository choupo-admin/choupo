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
    Choupo::ChemSepCp16

Description
    The ideal-gas heat capacity in ChemSep's equation form 16:

        Cp(T) = A + exp( B/T + C + D T + E T^2 )        [J/(mol.K)]

    WHY A MODEL AND NOT A REFIT.  356 catalogue records were imported from a
    databank that states Cp in this form.  Fitting each one to Choupo's cubic
    `polynomial` would have stored a DERIVATIVE OF A DERIVATIVE -- an
    approximation to somebody else's correlation, carrying its own residual,
    with the original discarded and nothing left to check it against.  Reading
    the published form keeps the record saying exactly what its source says.

    THE FORM IS NOT TAKEN FROM MEMORY.  A wrong equation form does not raise;
    it returns a plausible heat capacity.  Two independent confirmations were
    made before this class was written (2026-08-26, over the 431-record
    databank):

      * the SMALLEST Cp(298.15) in the whole databank comes out at
        20.75 J/(mol.K), which is 5R/2 to three figures -- the exact
        ideal-gas value for a monatomic gas.  That pins the form AND the
        J/kmol -> J/mol conversion at once, because a wrong unit could not
        land on a physical constant.
      * across the 11 substances where Choupo already carried an
        independently curated cubic, the two agree to 0.19 % median over
        300/400/500 K.  The tail is wider (p90 5 %, worst 26 %) and that is
        compilation disagreement rather than a form error: a wrong form
        would not produce a 0.19 % median.

    H and S are integrated NUMERICALLY -- Simpson over the interval -- because
    this form has no elementary antiderivative.  That is stated rather than
    hidden: the alternative was to fit a polynomial in order to integrate it
    analytically, which is the refit this class exists to avoid.

SourceFiles
    ChemSepCp16.cpp

\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatCapacityModel.H"

#include <string>

namespace Choupo {

class ChemSepCp16 : public HeatCapacityModel
{
public:
    explicit ChemSepCp16(const DictPtr& dict);

    scalar Cp(scalar T) const override;
    scalar H (scalar T, scalar Tref) const override;
    scalar S (scalar T, scalar Tref) const override;
    const std::string& modelName() const override { return name_; }

private:
    void noteRange(scalar T) const;

    scalar A_ = 0, B_ = 0, C_ = 0, D_ = 0, E_ = 0;
    scalar Tmin_ = 0.0, Tmax_ = 0.0;
    bool   rangeUnknown_ = false;
    mutable bool announcedOutside_ = false;
    std::string owner_;
    std::string name_ = "chemsepCp16";
};

} // namespace Choupo
