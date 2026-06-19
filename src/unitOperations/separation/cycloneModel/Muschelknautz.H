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
    Choupo::Muschelknautz

Description
    Muschelknautz Method (MM) --- the engineering gold-standard (Hoffmann
    & Stein, "Gas Cyclones and Swirl Tubes", 2008).  Its defining feature
    is the SOLIDS-LOADING EFFECT that all the simpler models ignore: above
    a limit loading c_lim the vortex cannot keep the excess in suspension,
    so the surplus is separated almost completely at the inlet ("mass
    loading"), and only the fraction c_lim/c_in goes through the internal
    size-classification.  This is why real cyclones are far MORE efficient
    than Lapple predicts at high dust loads.

        η(d) = η_load + (1 − η_load) · η_internal(d)
        η_load = max(0, 1 − c_lim/c_in)          (c_in = inlet loading)
        η_internal(d) = 1 / (1 + (d50/d)^β)      (force-balance d50)

    The limit loading c_lim [kg solid / kg gas] is the empirical knob
    (default 0.05, calibratable via `cLimit`), exactly what a FitParameters
    fit to loading-vs-efficiency data would tune.  At low loading
    (c_in < c_lim) the MM reduces to the plain internal classification.
\*---------------------------------------------------------------------------*/

#pragma once

#include "CycloneModel.H"

namespace Choupo {

class Muschelknautz : public CycloneModel
{
public:
    const std::string& type() const override { return type_; }
    void   readParameters(const DictPtr& oper) override;
    scalar gradeEfficiency(scalar d, const CycloneContext& c) const override;
    // Internal (size-classification) cut diameter, ignoring loading.
    scalar internalCutDiameter(const CycloneContext& c) const;
    // Loading-boost fraction η_load for the current context.
    scalar loadingEfficiency(const CycloneContext& c) const;
private:
    inline static const std::string type_ = "Muschelknautz";
    scalar cLimit_ = 0.05;       // limit loading [kg solid / kg gas]
    scalar beta_   = 3.0;        // internal logistic slope
};

} // namespace Choupo
