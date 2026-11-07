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
    Choupo::PetroleumCuts

Description
    `petroleumCuts` -- CUT A TBP CURVE INTO PSEUDO-COMPONENTS (DEV.md 4c
    C228).  Estimation is a CURATION act: this op reads a true-boiling-point
    curve of a petroleum feed, divides it into cuts, characterises each cut
    by (Tb, SG), hands the pair to the registered `RiaziDaubert`
    ConstantEstimator (MW, Tc, Pc, Vc by Riazi-Daubert, omega by Lee-Kesler,
    ideal-gas Cp by Kesler-Lee -- reused, never re-written here) and writes
    ONE ESTIMATE record per cut into the CASE (never data/standards/), marked
    lumped / "NOT a real species" exactly as `estimateComponent` marks one.
    A record is a PROPOSAL the student reviews and promotes.

    Every correlation is cited from Riazi, "Characterization and Properties of
    Petroleum Fractions" (ASTM MNL50, 2005), by equation and PRINTED page:

      Eq. 2.4   API gravity = 141.5/SG - 131.5                       (p. 32)
      Eq. 2.13  Watson K = (1.8 Tb)^(1/3) / SG, Tb in K               (p. 35)
      Eq. 3.3   ABP = sum x_i Tb_i (volume/mole/weight average)       (p. 100)
      Eq. 3.4   CABP = (1/1.8)[sum x_vi (1.8 Tb_i - 459.67)^(1/3)]^3
                       + 255.37                                       (p. 101)
      Eq. 3.5   MeABP = (MABP + CABP)/2                               (p. 101)
      Eq. 3.17  SG = a T10^b T50^c, T in K; TBP row of Table 3.4:
                a = 0.10431, b = 0.12550, c = 0.20862                 (p. 102-103)
      Eq. 3.45  mixing rule theta_m = sum x_i theta_i (volume fraction
                for SG); Eq. 3.46 its weight-fraction form            (p. 119)
      Eq. 2.50, 2.63, 2.64, 2.98   MW, Tc, Pc, Vc of Riazi-Daubert
                                  (p. 55, 60, 60, 62) -- evaluated by
                                  RiaziDaubert.cpp, unchanged.
      Table of recommended methods, footnote a (p. 83): for a narrow boiling
                range fraction a mid-point distillation temperature can be
                used as Tb.

    WHAT THE OP DECIDES, ALOUD:
      * the curve TYPE is TBP and its BASIS (volume | mass) is DECLARED;
        ASTM D86 / D1160 / D2887 / EFV REFUSE by name ("conversion ... not
        implemented"): the book's D86 -> TBP conversion (Eq. 3.14, Table 3.2)
        is legible but is NOT carried here;
      * a cut's Tb is the TBP temperature at the MID-POINT of its distilled
        interval on the declared basis (piecewise-linear T(fraction); a
        mid-point outside the supplied curve REFUSES, nothing is
        extrapolated);
      * the cut SG is ONE declared method: `constantWatsonK` (SG_i =
        (1.8 Tb_i)^(1/3)/Kw with ONE Kw for the whole feed, Eq. 2.13
        rearranged: an ASSUMPTION of this op, not a recommendation of the
        book) or `declared` (SG given per cut).  The bulk Kw of the first is
        Eq. 2.13 at the feed SG and the feed's MeABP (Eq. 3.5), solved by
        fixed point because the mole fractions inside MABP depend on Kw;
      * the closure: the cuts re-blended (Eq. 3.45/3.46) must reproduce the
        declared feed SG within a DECLARED tolerance; a miss is ANNOUNCED and
        published (closure_ok = 0), never adjusted.

    API gravity, SG (60/60 F) and Watson K are published per cut and for the
    blend, in the op's diagnostics and in each record's header.  Taking them
    to the stream report (every case's golden) is a LATER decision, not made
    here.

    Op block:

        { name p; type petroleumCuts;
          curve { type TBP; basis volume|mass;
                  points ( { fraction 0.0; T 10 C; } ... ); }
          feed  { specificGravity 0.7862; }     // or  specificGravityFrom TBP;
          cuts  { boundaries ( 0 0.1 0.3 0.5 0.7 1 ); }    // or  number 5;
          specificGravity { method constantWatsonK; }      // or declared + values ( ... )
          closure { specificGravityTolerance 0.02; }
          output  { proposal auto; prefix petCut; file cuts.csv; } }
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>

namespace Choupo {

class PetroleumCuts : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    {
        return { "mixture_SG", "mixture_API", "mixture_WatsonK",
                 "closure_SGdiff_rel", "closure_ok" };
    }

private:
    inline static const std::string type_ = "petroleumCuts";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
