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
    C361 slice 3).  `model` selects how the cut size, the water split and the
    pressure are obtained:

      declared       the student gives the corrected curve (`partition {}`,
                     with its d50c) and the water recovery to underflow
                     `waterToUnderflow` R_f; the solids bypass is R_f
                     (Kelsall's assumption, Wills & Napier-Munn 2006 eq. 9.15,
                     p. 214).
      nageswararao   the empirical model of Nageswararao (1978) in the form of
                     Nageswararao, Wiseman & Napier-Munn (2004), eqs. 13-15,
                     p. 677, with the Whiten curve of eq. 21, p. 681:
                       eq. 13  Q/(D_c^2 sqrt(P/rho_p)) = K_Q0 D_c^-0.10
                               (D_o/D_c)^0.68 (D_i/D_c)^0.45 (L_c/D_c)^0.20
                               theta^-0.10          -> P from the feed's Q
                       eq. 14  d50c/D_c = K_D0 D_c^-0.65 (D_o/D_c)^0.52
                               (D_u/D_c)^-0.50 (D_i/D_c)^0.20 (L_c/D_c)^0.20
                               theta^0.15 (P/(rho_p g D_c))^-0.22 lambda^0.93
                       eq. 15  R_f = K_W0 (D_o/D_c)^-1.19 (D_u/D_c)^2.40
                               (D_i/D_c)^0.50 (L_c/D_c)^0.22 theta^-0.24
                               (P/(rho_p g D_c))^-0.53 lambda^0.27
                     in the paper's units (footnote 4: lengths m, theta
                     degrees, Q m3/h, P kPa, rho_p t/m3, d50c um).  The three
                     K are MATERIAL constants, declared by the case (p. 679:
                     "it is necessary to source appropriate K values"); the
                     sharpness alpha likewise (p. 681).  The hindered-settling
                     factor is DECLARED: `hinderedSettling original`
                     lambda = C_V/(1 - C_V)^3 (p. 676) or `steinour`
                     lambda = 10^(1.82 C_V)/(1 - C_V)^2, the complete Steinour
                     form unscaled (Castro 1990, p. 684; conclusion 8, p. 685)
                     -- the K_D0 and K_W0 of a case belong to ONE of them.
                     THE PAPER PRINTS eq. 15 TWICE: as eq. 18 (p. 680) the
                     exponent of D_i/D_c is -0.50, not +0.50.  This unit
                     implements eq. 15, the model's statement (section 3.2.4),
                     and says so at run time; within one geometry the
                     difference is absorbed by K_W0, across inlets it is not.
                     R_V (eq. 16) is not built: the paper finds it redundant
                     (conclusion 5).

    THE CORRELATION'S DATA WINDOW IS ENFORCED, by name: feed solids 40-70 %
    by weight (the model-fitting set, pp. 678, 681, 684); cyclone diameter
    0.102-0.381 m (the database's 10.2-38.1 cm cyclones, p. 677); the fluid
    WATER (p. 675: "applicable only when water is the fluid medium").  The
    paper prints no window for the geometric ratios, so none is enforced.

    ONE SOLID POPULATION (docs/design/c361-solids-processing.md 2.3, still
    DEFERRED): every solid component of the feed is classified in the same
    proportion, because one size distribution describes them all.  A
    two-mineral feed is split as one material; a per-species distribution,
    and with it a split that tells minerals apart, is not built.

    MASS: coarse_k = a_k f_k m_s and fine_k = f_k m_s - coarse_k, class by
    class (King 2001 eqs. 4.20-4.29), so the products close on the feed
    exactly; the closure is printed.  The fluid splits by one fraction.
    ENERGY: no work, no heat; both products leave at the feed's T and P.

    REFUSED, by name: a dry feed (no liquid); a feed not on the grid; for
    `nageswararao`, any variable outside the window above, a K, alpha or
    geometry missing, a predicted R_f outside (0, 1).

    Operation (declared):     partition { ... d50c ...; };  waterToUnderflow R_f;
    Operation (nageswararao): geometry { Dc; Do; Du; Di; Lc; coneAngle (deg); }
                              nCyclones; constants { KQ0; KD0; KW0; }
                              alpha; hinderedSettling original|steinour;

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
