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
    Choupo::Hydrocyclone

Description
    A HYDROCYCLONE CLASSIFYING A SLURRY ON THE CASE'S SIZE GRID (DEV.md 4c
    C361 slice 3).  One model:

      declared       the student gives the corrected curve (`partition {}`,
                     with its d50c) and the water recovery to underflow
                     `waterToUnderflow` R_f; the solids bypass is R_f
                     (Kelsall's assumption, Wills & Napier-Munn 2006 eq. 9.15,
                     p. 214), a_k = R_f + (1 - R_f) c_k.

    THE EMPIRICAL CORRELATION IS NOT BUILT.  Nageswararao, Wiseman &
    Napier-Munn (2004, eqs. 13-15) would give the cut size, the water split
    and the pressure from the cyclone's geometry, but the paper prints no
    value of its material constants K_Q0, K_D0, K_W0 for any material and no
    worked example, and prints its water-split equation with opposite signs on
    the inlet-diameter exponent (eq. 15 +0.50, p. 677; its repetition eq. 18
    -0.50, p. 680); neither King (2001) nor Wills & Napier-Munn (2006) prints a
    worked example or the constants.  A model no case exercises and no number
    holds does not ship: it waits for a source with the constants and a worked
    example (docs/design/c361-solids-processing.md 7.5).

    ONE SOLID POPULATION (docs/design/c361-solids-processing.md 2.3, still
    DEFERRED): every solid component of the feed is classified in the same
    proportion, because one size distribution describes them all.  A
    two-mineral feed is split as one material; a per-species distribution,
    and with it a split that tells minerals apart, is not built.

    MASS: coarse_k = a_k f_k m_s and fine_k = f_k m_s - coarse_k, class by
    class (King 2001 eqs. 4.20-4.29), so the products close on the feed
    exactly; the closure is printed.  The fluid splits by one fraction.
    ENERGY: no work, no heat; both products leave at the feed's T and P.

    REFUSED, by name: a dry feed (no liquid); a feed not on the grid; a
    `model` other than `declared`; a partition with no cut size; a missing or
    out-of-range `waterToUnderflow`.

    Operation:  partition { ... d50c ...; };  waterToUnderflow R_f;

    Inputs ( feed );   outputs ( underflow overflow );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Hydrocyclone : public UnitOperation
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
    std::string                   type_ = "hydrocyclone";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
