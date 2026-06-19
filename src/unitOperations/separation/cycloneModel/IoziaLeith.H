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
    Choupo::IoziaLeith

Description
    Iozia & Leith (1989/1990) logistic grade-efficiency model --- the
    data-fitted one:

        η(d) = 1 / (1 + (d50/d)^β)

    Same hyperbolic family as Lapple, but the SLOPE β is NOT fixed at 2:
    Iozia & Leith fitted β (and d50) to a large body of experimental
    cyclone data and found β ≈ 2.5–5 (sharper cut than Lapple's β = 2).
    Here β is the empirical knob (default 3.5, a typical fitted value),
    overridable with `beta <value>;` --- exactly what a FitParameters
    calibration to the student's own efficiency data would tune.  d50 uses
    the same semi-empirical Lapple form.
\*---------------------------------------------------------------------------*/

#pragma once

#include "CycloneModel.H"

namespace Choupo {

class IoziaLeith : public CycloneModel
{
public:
    const std::string& type() const override { return type_; }
    void   readParameters(const DictPtr& oper) override;
    scalar gradeEfficiency(scalar d, const CycloneContext& c) const override;
    scalar cutDiameter(const CycloneContext& c) const override;
private:
    inline static const std::string type_ = "IoziaLeith";
    scalar beta_ = 3.5;          // logistic slope (data-fitted, ~2.5–5)
};

} // namespace Choupo
