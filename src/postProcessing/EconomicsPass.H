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
        CF_t = (R_t - COM_d,t - S_t - d_t)*(1-tau) + d_t
        timeline: year 0 = END of construction (start-up).  Construction
        year k of Nc (`constructionPeriod`) spends its `capitalSchedule`
        fraction of FCI at t = k - Nc <= 0; -WC at t = 0; operation in
        years 1..projectLife at the `rampUp` production fraction p_t
        (R_t = p_t R, COM_d,t = 0.180 FCI + 2.73 C_OL + 1.23 p_t (C_RM +
        C_UT + C_WT)); the start-up cost S = startupCostFraction x FCI is
        expensed in year 1; +WC (untaxed) and salvage*(1-tau) at
        end-of-life.  One construction year and no ramp-up = the old
        timeline: -FCI - WC at t = 0, full production from year 1.  The
        placement is CAPCOST 2017's (DEV.md 4c C63; see readTimeline).
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

    ONE APPRAISAL, ONE HOME, AND AN OPT-IN SENSITIVITY (DEV.md 4c C68).
    Everything from the annual bills to NPV / IRR / paybacks is computed by
    one function, `appraise`, from one bundle of inputs.  An optional
    `sensitivity { <input> { relative|absolute ( lo hi ); } ... }` block in
    the economics dict prices the plant again with ONE input moved to each
    end (FCI -- `relative accuracyBand;` reads the declared band --,
    price.<stream>, utility.<name>, labourRate, discountRate, taxRate,
    streamFactor), through the same `appraise`, on the same converged pass:
    a one-at-a-time tornado, NOT an uncertainty analysis.  Published as
    `economics.sens_<input>_{NPV,IRR,payback,value}_{low,high}`,
    reports/economics/sensitivity.csv and the result JSON's
    `economics.sensitivity` block (the CSV's rows in its order, which the
    GUI's tornado draws); absent, nothing changes.

    THE LAND (DEV.md 4c C82), opt-in.  `land { price; source; reason; }`
    prices the plot area the layout publishes (or a declared `area` where
    the run has no plot plan -- never both) as NON-DEPRECIABLE capital,
    bought at the START of construction (t = -constructionPeriod, CAPCOST
    2017's year 0) and recovered at its purchase value, untaxed, at the end
    of the last operating year (CAPCOST's 'Cash Flow Analysis'!C49 and I63),
    entering only through `appraise`.  Not in TCI.  `land.price` is a
    sensitivity input.  Absent, nothing changes.

    DEBT FINANCING (DEV.md 4c C110 G4), opt-in.  `financing { debtFraction;
    basis fixedCapital|totalCapital; rate; graceYears; termYears; repayment
    annuity|linear; source; reason; [equityDiscountRate;] }` lends a share
    of the capital as the capital schedule spends it, capitalises the
    interest during construction, deducts the interest paid in operation,
    depreciates the capitalised interest with the plant and repays the
    principal; it publishes the EQUITY (levered) NPV / IRR / discounted
    payback BESIDE the project's, which stay the unlevered ones they always
    were -- the project's merit must not depend on how it is financed.
    Computed inside `appraise` from the project's own cash flow;
    `financing.rate` and `financing.debtFraction` are sensitivity inputs.
    Written to reports/economics/financing.csv and a second .ods sheet;
    cashFlow.csv is unchanged.  Absent, nothing changes.

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
