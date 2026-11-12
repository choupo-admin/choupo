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
    Choupo::Classifier

Description
    A SIZE CLASSIFIER DEFINED BY ITS PARTITION CURVE ALONE (DEV.md 4c C361
    slice 3).  The classifier of Herbst & Fuerstenau (1980, p. 18) and of
    King's section 4.2 (2001, pp. 86-87): nothing about the device is
    modelled, only the fraction of each size class that reports to the
    coarse product,

        a_k = R + (1 - R) c_k

    c_k the CORRECTED partition (a `partition {}` curve object:
    whiten | rosinRammler | tabulated, PartitionCurves.H) and R the BYPASS,
    the fraction of every class short-circuited to the coarse product
    (H&F's design classifier "bypasses 30 % of the particles finer than
    150-mesh into the oversize product": R = 0.3 on a step c_k).

    ONE SOLID POPULATION (docs/design/c361-solids-processing.md 2.3, still
    DEFERRED): every solid component of the feed is classified in the same
    proportion, because one size distribution describes them all.  A
    two-mineral feed is split as one material; a per-species distribution,
    and with it a split that tells minerals apart, is not built.

    MASS: coarse_k = a_k f_k m_s and fine_k = f_k m_s - coarse_k, class by
    class (King 2001 eqs. 4.20-4.29), so the products close on the feed
    exactly; the closure is printed.  The fluid splits by one fraction.
    ENERGY: no work, no heat; both products leave at the feed's T and P.

    REFUSED, by name: a feed not on the case's size grid; a feed with no
    solids; a vapour-bearing fluid; a bypass outside [0, 1); a fluid-bearing
    feed without `fluidToCoarse` (the split of the liquid is the case's
    declaration, never a default).

    Operation:
        partition { model whiten|rosinRammler|tabulated; ...its parameters... }
        bypass         R                  (fraction to coarse, every class)
        fluidToCoarse  R_fl               (only when the feed carries a fluid)

    Inputs ( feed );   outputs ( coarse fine );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Classifier : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    std::string                   type_ = "classifier";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
