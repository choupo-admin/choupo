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
    Choupo::EconomicsPass

Description
    PostProcessor that turns the per-unit CAPEX (result.costs, produced by
    CostingPass) plus market prices (case-scoped constant/economics tier) into
    a discounted-cash-flow economic appraisal: OPEX (Turton cost-of-
    manufacture COM_d), revenue, straight-line-depreciation DCF, NPV, IRR
    (bisection bracket + Newton polish), and discounted + simple payback.

    Method (all Turton 5th ed., Ch. 7-8 + §10):
      CAPEX ladder ----------------------------------------------------
        C_BM,i   = per-unit bare-module cost (result.costs)
        C_BM°,i  = Cp,i * (B1 + B2)         base CS/P=1 module (recovered
                                            from the stored cost factors)
        FCI      = 1.18 * SC_BM + 0.50 * SC_BM°    (Turton Eq. 7.5)
        WC       = workingCapital * FCI            (Turton §10)
        TCI      = FCI + WC
      OPEX ------------------------------------------------------------
        COM_d = 0.180*FCI + 2.73*C_OL + 1.23*(C_RM + C_UT + C_WT)
                                                   (Turton Eq. 8.1)
        depreciation is NOT in COM_d (the classic double-count trap).
      DCF -------------------------------------------------------------
        d_t  = FCI / depreciableLife               (straight line)
        CF_t = (R - COM_d - d_t)*(1-tau) + d_t
        timeline: -FCI at year 0; -WC at startup; +WC (untaxed) and
        salvage*(1-tau) at end-of-life.
        NPV(i) = S CF_t/(1+i)^t ;  IRR = root of NPV(i)=0.

    Glass-box / numerical-honesty credo:
      * every factor and coefficient is printed and dict-owned;
      * prices live ONLY in constant/economics (dated, primary-cited);
      * the pass REFUSES to run if a required price is absent
        (refuseOnMissingPrice, default true) -- one flag-flip to
        "defaulted-but-loud";
      * validity / ambiguity conditions WARN (multiple-IRR guard), they
        do not silently clamp;
      * an AACE Class banner states the -30%/+50% accuracy up front.

    Publishes headline scalars into result.kpis["economics"] (IRR, NPV,
    paybackYears, FCI, TCI, COM_d) so an outer driver (sweep / optimisation)
    resolves "economics.IRR" as an ordinary unit.kpi lookup.

    Must run after SizingPass + CostingPass.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PostProcessor.H"

#include <string>

namespace Choupo {

class EconomicsPass : public PostProcessor
{
public:
    explicit EconomicsPass(const DictPtr& economicsDict);

    const std::string& type() const override { return type_; }
    int                run(SimulationResult& result) override;

private:
    inline static const std::string type_ = "economics";
    DictPtr econDict_;     // the `economics { ... }` sub-dict (knobs)
};

} // namespace Choupo
