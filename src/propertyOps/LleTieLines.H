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
    Choupo::LleTieLines

Description
    The conjugate-phase curve of a ternary liquid-liquid system at fixed
    (T, P), read from the SAME liquid-liquid flash a `flash` / `extractor`
    unit runs (`IsothermalFlash::solveCore`, PhaseSet::LL).  It exists so
    that measured tie lines can be laid beside the model's: a validation
    reading through the `experimental {}` overlay and its `aad` rows
    (verification-and-validation.md 3b), never a fit.

    The feed walks a straight line in the triangle: the solute's MASS
    fraction sweeps `from` .. `to`, and the rest of the feed is the carrier
    and the extractant in the declared mass ratio.  Every feed that splits
    writes ONE row: the raffinate (the liquid richer in the carrier, by
    mass) and the extract (the other), both in MASS fractions, abscissa
    first:

        wR_<solute>, wR_<carrier>, wR_<extractant>,
        wE_<solute>, wE_<carrier>, wE_<extractant>

    A feed that does not split is NOT written and is counted (`n_single`,
    published beside `n_split`): a model that keeps the system miscible has
    no conjugate curve, and the overlay then reports `noOverlap` -- the
    miss, pinned, never a substituted answer.  A flash that throws is
    counted in `n_refused` and the scan continues.

        {
            name     tie_model;
            type     lleTieLines;
            state    { T 298.15 K;  P 1 bar; }
            solute   aceticAcid;  carrier water;  extractant methylIsobutylKetone;
            feed
            {
                soluteMassFraction { from 0.005;  to 0.36;  n 72; }
                carrierToExtractant 1.0;     // kg carrier per kg extractant
            }
            output   { file tie_model.csv; }
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class LleTieLines : public PropertyOperation
{
public:
    LleTieLines() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    inline static const std::string type_ = "lleTieLines";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
