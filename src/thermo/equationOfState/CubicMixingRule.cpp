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
\*---------------------------------------------------------------------------*/

#include "CubicMixingRule.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/RegistryRefusal.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/activityCoefficient/UNIFAC.H"
#include "thermo/activityCoefficient/UNIQUAC.H"

#include <algorithm>
#include <map>
#include <memory>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

    scalar sgn(scalar x) { return (x < 0.0) ? -1.0 : 1.0; }

    //  An announcement made once per run (the cubic is built once per phase
    //  of the package, so the same line would print three times).
    void announceOnce(const std::string& key, const std::string& level,
                      const std::string& msg)
    {
        if (AdvisoryLog::instance().addAnnouncedOnce(key, "thermo", level, key, msg)
            && thermoAnnounce())
            std::cout << "[eos] " << msg << "\n";
    }

    // ---------------------------------------------------------------------
    //  THE CONSTANTS, each with the page it was READ at (never recalled).
    //
    //  q1, q2 are the coefficients of the polynomial that stands in for the
    //  function q(alpha) of the zero-pressure matching, FITTED PER EQUATION
    //  OF STATE.  The values below are SRK's:
    //    MHV1  q1 = -0.593   Michelsen, Fluid Phase Equilib. 60 (1990) 213,
    //                        p. 216 ("Our recommended value of q1 for use
    //                        with the SRK equation is q1 = -0.593"; q(alpha)
    //                        = q0 + q1 alpha fitted on 10 < alpha < 13,
    //                        Eq. 10, p. 215); Poling, Prausnitz & O'Connell,
    //                        5th ed., Table 5-1, p. 5.17 (MHV1: P match 0,
    //                        u match 1.235, C_SRK = -0.593).
    //    MHV2  q1 = -0.478   Dahl & Michelsen, AIChE J. 36 (1990) 1829, p.
    //          q2 = -0.0047  1831 ("The recommended values of q1 and q2 are
    //                        -0.478 and -0.0047"; Eq. 13); Poling Table 5-1,
    //                        p. 5.17, MHV2 row (u match 1.632, C_SRK =
    //                        -0.478) and footnote a (A2 = -0.0047).
    //  Michelsen p. 216 prints q1 = -0.53 for Peng-Robinson as well; neither
    //  paper prints a PR constant for MHV2, and no equation reaches the
    //  engine before it is read in a primary (ruling 5 of the record): both
    //  rules are SRK-only here and refuse PR by name.
    // ---------------------------------------------------------------------
    struct GeRow
    {
        const char* name;
        scalar      q1;
        scalar      q2;          // 0 = MHV1 (a linear q)
        const char* source;
        const char* equation;    // the matching condition, for the printed line
    };
    const GeRow GE_ROWS[] = {
        { "MHV1", -0.593, 0.0,
          "Michelsen 1990 (Fluid Phase Equilib. 60, 213) Eq. 12 p. 215, q1 p. 216;"
          " Poling et al. 5th ed. Table 5-1 p. 5.17",
          "q1 (beta - sum y_i beta_i) = G^E/RT + sum y_i ln(b/b_i)" },
        { "MHV2", -0.478, -0.0047,
          "Dahl & Michelsen 1990 (AIChE J. 36, 1829) Eq. 13 and q1, q2 p. 1831,"
          " Eq. A3 p. 1835; Poling et al. 5th ed. Table 5-1 p. 5.17 and its"
          " footnote a",
          "q1 (beta - sum y_i beta_i) + q2 (beta^2 - sum y_i beta_i^2)"
          " = G^E/RT + sum y_i ln(b/b_i)" },
    };

    //  The interval of beta = a/(bRT) on which the polynomial q(beta) was
    //  fitted (Michelsen 1990 p. 215: 10 < alpha < 13; Dahl & Michelsen 1990
    //  p. 1831: "matching Eq. 9 in the range 10 < alpha < 13").
    constexpr scalar BETA_FIT_LO = 10.0;
    constexpr scalar BETA_FIT_HI = 13.0;

    // =====================================================================
    //  vanDerWaalsOneFluid -- today's arithmetic, moved intact.
    // =====================================================================
    class VanDerWaalsOneFluid : public CubicMixingRule
    {
    public:
        VanDerWaalsOneFluid(std::size_t n,
                            const std::vector<std::vector<scalar>>& kij)
          : n_(n)
        {
            if (kij.empty())
            {
                kij_.assign(n_, std::vector<scalar>(n_, 0.0));
            }
            else
            {
                if (kij.size() != n_ || kij[0].size() != n_)
                    throw std::runtime_error(
                        "cubic: kij matrix size mismatch (expected n x n)");
                kij_ = kij;
                // Enforce symmetry and zero diagonal (defensive).
                for (std::size_t i = 0; i < n_; ++i)
                {
                    kij_[i][i] = 0.0;
                    for (std::size_t j = i + 1; j < n_; ++j)
                        kij_[j][i] = kij_[i][j];
                }
            }
        }

        const std::string& name() const override { return name_; }
        const std::vector<std::vector<scalar>>* kij() const override
        {
            return &kij_;
        }

        void mix(scalar /*T*/, const sVector& y, const Pure& pure,
                 Mixed& out, bool partials, bool /*temperature*/) const override
        {
            //  THE ARITHMETIC OF CubicEoS::buildMix, order intact (the
            //  acceptance of this move is byte identity of every phiPhi and
            //  real-gas case).
            const auto& a    = pure.a;
            const auto& s    = pure.s;
            const auto& dsdT = pure.dsdT;

            scalar b_mix = 0.0;
            for (std::size_t i = 0; i < n_; ++i) b_mix += y[i] * pure.b[i];

            scalar a_mix    = 0.0;
            scalar dadT_mix = 0.0;
            std::vector<std::vector<scalar>> aij;
            if (partials) aij.assign(n_, std::vector<scalar>(n_, 0.0));

            for (std::size_t i = 0; i < n_; ++i)
            {
                const scalar sqrt_ai = std::sqrt(a[i]);
                for (std::size_t j = 0; j < n_; ++j)
                {
                    const scalar sqrt_aj = std::sqrt(a[j]);
                    const scalar one_kij = 1.0 - kij_[i][j];
                    const scalar aij_val = one_kij * sqrt_ai * sqrt_aj;
                    a_mix += y[i] * y[j] * aij_val;
                    if (partials) aij[i][j] = aij_val;

                    // d(|s_i|·|s_j|)/dT = sgn(s_i)·s_i'·|s_j| + |s_i|·sgn(s_j)·s_j'
                    // (CubicEoS.H: the old form was 0/0 at a_i = 0).
                    const scalar daij_dT =
                        one_kij * ( sgn(s[i]) * dsdT[i] * sqrt_aj
                                  + sqrt_ai * sgn(s[j]) * dsdT[j] );
                    dadT_mix += y[i] * y[j] * daij_dT;
                }
            }

            out.a = a_mix;  out.b = b_mix;  out.dadT = dadT_mix;
            if (partials)
            {
                out.bbar.assign(n_, 0.0);
                out.X.assign(n_, 0.0);
                for (std::size_t i = 0; i < n_; ++i)
                {
                    // Σ_j y_j a_ij  --  the inner sum entering ln φ_i.
                    scalar sumA = 0.0;
                    for (std::size_t j = 0; j < n_; ++j)
                        sumA += y[j] * aij[i][j];
                    const scalar bi_over_b = pure.b[i] / b_mix;
                    out.bbar[i] = pure.b[i];                      // bbar_i = b_i
                    out.X[i]    = 2.0 * sumA / a_mix - bi_over_b;
                }
                out.aij = std::move(aij);
            }
        }

        //  The one-fluid rule adds NO row to the resolved view: it is what every
        //  cubic ran until C408 (b), and a row that said so on every phiPhi and
        //  real-gas case would move the printed text of cases whose results
        //  have not moved.  An excess-Gibbs rule lists itself and its pairs.
        std::vector<std::string> viewLines() const override { return {}; }

    private:
        std::size_t                      n_;
        std::vector<std::vector<scalar>> kij_;
        std::string                      name_ = "vanDerWaalsOneFluid";
    };

    // =====================================================================
    //  MHV1, MHV2: the zero-pressure excess-Gibbs rules on SRK.
    // =====================================================================
    class ExcessGibbsRule : public CubicMixingRule
    {
    public:
        ExcessGibbsRule(const GeRow& row, std::size_t n,
                        std::unique_ptr<ActivityModel> act, bool declared)
          : row_(row), n_(n), act_(std::move(act)), declared_(declared),
            name_(row.name)
        {}

        const std::string& name() const override { return name_; }
        const ActivityModel* activity() const override { return act_.get(); }

        void mix(scalar T, const sVector& y, const Pure& pure,
                 Mixed& out, bool partials, bool temperature) const override
        {
            const scalar RT = constant::R * T;
            const scalar q1 = row_.q1, q2 = row_.q2;
            const bool   two = (q2 != 0.0);

            //  Mixture quantities are intensive: use the normalised
            //  composition, as the activity model does (a flash passes an
            //  unnormalised y between iterations).
            scalar ysum = 0.0;
            for (std::size_t i = 0; i < n_; ++i) ysum += y[i];
            if (!(ysum > 0.0))
                throw std::runtime_error(name_ + ": composition sums to "
                    + std::to_string(ysum) + " -- no mixture to price");
            sVector z(n_);
            for (std::size_t i = 0; i < n_; ++i) z[i] = y[i] / ysum;

            //  The pure reduced attractions beta_i = a_i/(b_i R T) and their
            //  T derivative (T a_i' - a_i)/(b_i R T^2).
            std::vector<scalar> beta_i(n_), dbeta_i(n_);
            scalar bm = 0.0;
            for (std::size_t i = 0; i < n_; ++i)
            {
                bm += z[i] * pure.b[i];
                beta_i[i]  = pure.a[i] / (pure.b[i] * RT);
                dbeta_i[i] = (T * pure.dadT[i] - pure.a[i])
                           / (pure.b[i] * RT * T);
            }
            noteWindow(beta_i);

            //  G^E/RT and ln gamma_i from the model, at THIS composition.
            const sVector gam = act_->gamma(T, z);
            std::vector<scalar> lng(n_, 0.0);
            scalar gE = 0.0, lnbb = 0.0, sumBeta = 0.0, sumBeta2 = 0.0;
            for (std::size_t i = 0; i < n_; ++i)
            {
                if (!(gam[i] > 0.0) || !std::isfinite(gam[i]))
                    throw std::runtime_error(name_ + ": the G^E model "
                        + act_->modelName() + " returned gamma = "
                        + std::to_string(gam[i]) + " for component " + std::to_string(i)
                        + " at T = " + std::to_string(T) + " K -- no mixing rule can be"
                          " built on it");
                lng[i]   = std::log(gam[i]);
                gE      += z[i] * lng[i];
                lnbb    += z[i] * std::log(bm / pure.b[i]);
                sumBeta += z[i] * beta_i[i];
                sumBeta2 += z[i] * beta_i[i] * beta_i[i];
            }
            const scalar rhs = gE + lnbb;      // G^E/RT + sum y_i ln(b/b_i)

            //  beta of the mixture.
            scalar beta;
            if (!two)
                beta = sumBeta + rhs / q1;                       // Eq. 12
            else
            {
                //  q1 (beta - S1) + q2 (beta^2 - S2) = rhs, i.e.
                //  q2 beta^2 + q1 beta - r = 0 with r = rhs + q1 S1 + q2 S2.
                //  The root that tends to MHV1's as q2 -> 0 ("the larger
                //  root", Dahl & Michelsen p. 1835), in the form
                //  2 r / (q1 - sqrt(q1^2 + 4 q2 r)) -- no cancellation.
                const scalar r    = rhs + q1 * sumBeta + q2 * sumBeta2;
                const scalar disc = q1 * q1 + 4.0 * q2 * r;
                if (!(disc >= 0.0))
                    throw std::runtime_error(name_ + ": the quadratic of Dahl &"
                        " Michelsen Eq. 13 has no real root at T = "
                        + std::to_string(T) + " K (discriminant "
                        + std::to_string(disc) + "): the G^E model asks for"
                          " an attraction beyond the reach of the fitted q(beta)."
                          "  Use MHV1, or a state nearer the data the pair was"
                          " fitted on.");
                beta = 2.0 * r / (q1 - std::sqrt(disc));
            }
            if (!(beta > 0.0) || !std::isfinite(beta))
                throw std::runtime_error(name_ + ": the mixture's reduced"
                    " attraction beta = a/(bRT) came out " + std::to_string(beta)
                    + " at T = " + std::to_string(T) + " K -- the cubic has no"
                      " meaning there (the rule is a fit of q(beta) on 10 <"
                      " beta < 13, Michelsen 1990 p. 215)");

            out.b = bm;
            out.a = beta * bm * RT;

            if (partials)
            {
                out.bbar.assign(n_, 0.0);
                out.X.assign(n_, 0.0);
                for (std::size_t i = 0; i < n_; ++i)
                {
                    //  d(n beta)/dn_i from Dahl & Michelsen Eq. A3 (MHV1: q2 = 0):
                    //  (q1 + 2 q2 beta) betabar_i = q1 beta_i
                    //     + q2 (beta^2 + beta_i^2) + ln gamma_i + ln(b/b_i)
                    //     + b_i/b - 1
                    const scalar lnTerm = lng[i] + std::log(bm / pure.b[i])
                                        + pure.b[i] / bm - 1.0;
                    const scalar betabar =
                        (q1 * beta_i[i] + q2 * (beta * beta + beta_i[i] * beta_i[i])
                         + lnTerm) / (q1 + 2.0 * q2 * beta);
                    out.bbar[i] = pure.b[i];       // the co-volume is linear
                    out.X[i]    = betabar / beta;
                }
            }

            if (temperature)
            {
                //  Differentiate the matching condition at constant b:
                //  (q1 + 2 q2 beta) beta_T = sum y_i (q1 + 2 q2 beta_i) beta_i,T
                //                            + d(G^E/RT)/dT,
                //  d(G^E/RT)/dT = -H^E/(R T^2), H^E the model's own.
                const scalar HE  = act_->excessEnthalpy(T, z);
                const scalar dGE = -HE / (constant::R * T * T);
                scalar num = dGE;
                for (std::size_t i = 0; i < n_; ++i)
                    num += z[i] * (q1 + 2.0 * q2 * beta_i[i]) * dbeta_i[i];
                const scalar beta_T = num / (q1 + 2.0 * q2 * beta);
                out.dadT = constant::R * bm * (beta + T * beta_T);
            }
        }

        std::vector<std::string> viewLines() const override
        {
            std::vector<std::string> d;
            d.push_back("cubic mixing rule: " + name_
                        + (declared_ ? " (declared)" : " (default)")
                        + " -- zero-pressure excess-Gibbs rule on SRK, q1 = "
                        + num(row_.q1) + (row_.q2 != 0.0
                            ? ", q2 = " + num(row_.q2) : std::string()));
            d.push_back(std::string("  ") + row_.equation + "; b = sum y_i b_i");
            d.push_back(std::string("  source: ") + row_.source);
            d.push_back("  G^E model: " + act_->modelName()
                        + ", called at the composition of the phase being priced;"
                          " the pressure never reaches it");
            for (const auto& e : act_->resolvedPairs())
                d.push_back("  pair " + e.i + "-" + e.j + ": " + e.status
                            + (e.source.empty() ? "" : " (" + e.source + ")")
                            + validityText(e));
            return d;
        }

        static std::string num(scalar v)
        {
            std::ostringstream o;
            o << std::setprecision(4) << v;
            return o.str();
        }

        static std::string validityText(const PairResolution& e)
        {
            std::ostringstream o;
            if (e.validity.temperature)
                o << "; fitted T " << e.validity.temperature->lo << "-"
                  << e.validity.temperature->hi << " K";
            if (e.validity.pressure)
                o << ", P " << e.validity.pressure->lo << "-"
                  << e.validity.pressure->hi << " Pa";
            return o.str();
        }

    private:
        //  Announce, once, that a pure beta_i left the interval q(beta) was
        //  fitted on.  An announcement, never a refusal: the rule is defined
        //  there, and a flash that wanders through a hot state must not die.
        void noteWindow(const std::vector<scalar>& beta_i) const
        {
            const std::string key = name_ + " beta window";
            if (AdvisoryLog::instance().passHas(key)) return;   // hot-path exit
            for (std::size_t i = 0; i < n_; ++i)
            {
                if (beta_i[i] >= BETA_FIT_LO && beta_i[i] <= BETA_FIT_HI) continue;
                std::ostringstream m;
                m << name_ << ": a pure reduced attraction beta_i = a_i/(b_i R T)"
                  << " = " << std::setprecision(4) << beta_i[i]
                  << " lies outside 10 < beta < 13, the interval on which the"
                     " polynomial q(beta) of the zero-pressure matching was"
                     " fitted (Michelsen 1990 p. 215; Dahl & Michelsen 1990"
                     " p. 1831) -- the rule is an extrapolation of that fit at"
                     " this temperature";
                announceOnce(key, "warning", m.str());
                return;
            }
        }

        GeRow                          row_;
        std::size_t                    n_;
        std::unique_ptr<ActivityModel> act_;
        bool                           declared_;
        std::string                    name_;
    };

    std::string namesOf(const std::vector<Component>& comps)
    {
        std::string s;
        for (const auto& c : comps) s += (s.empty() ? "" : ", ") + c.name();
        return s;
    }

    // ---- the factories ----
    std::unique_ptr<CubicMixingRule> makeOneFluid(const CubicMixingRule::Context& c)
    {
        if (c.eosDict->found("activityModel"))
            throw std::runtime_error(c.eosModel + " mixingRule"
                " vanDerWaalsOneFluid: an `activityModel` block is declared,"
                " and the one-fluid rule has no G^E to give it to -- either"
                " drop the block, or choose an excess-Gibbs rule ("
                "MHV1 | MHV2) for it to feed");
        return std::make_unique<VanDerWaalsOneFluid>(c.comps->size(), c.kij);
    }

    std::unique_ptr<CubicMixingRule> makeGe(const GeRow& row,
                                            const CubicMixingRule::Context& c)
    {
        const std::string head = c.eosModel + " mixingRule " + row.name + ": ";
        if (c.eosModel != "SRK")
            throw std::runtime_error(head + "the constants q1"
                + std::string(row.q2 != 0.0 ? ", q2" : "") + " of this rule are"
                " fitted PER EQUATION OF STATE and only SRK's are read in a"
                " primary here (Michelsen 1990 p. 216 prints q1 = -0.53 for"
                " Peng-Robinson; neither paper prints a Peng-Robinson MHV2"
                " constant) -- declare `model SRK;`.  A Peng-Robinson"
                " excess-Gibbs rule waits for its constants to be read.");
        if (c.eosDict->found("binaryInteractions"))
            throw std::runtime_error(head + "`binaryInteractions` is declared,"
                " and a zero-pressure excess-Gibbs rule has no kij: the G^E"
                " model's own pair parameters carry the interaction.  Remove"
                " the kij block, or use `mixingRule vanDerWaalsOneFluid;`.");
        if (!c.eosDict->found("activityModel"))
            throw std::runtime_error(head + "needs the G^E model it is built"
                " on: write `activityModel { model NRTL; binaryParameters {"
                " <i>-<j> { source \"...\"; } } }` inside the equationOfState"
                " block (the same block a gammaPhi liquid takes).");
        if (c.eosDict->found("volumeTranslation"))
        {
            //  Allowed: the shift composes after the rule (it moves v, not
            //  the fugacity ratios).  Nothing to refuse.
        }

        const std::vector<Component>& comps = *c.comps;
        std::vector<std::string> names;
        for (const auto& k : comps) names.push_back(k.name());
        DictPtr actDict = c.eosDict->subDict("activityModel");
        if (actDict->lookupWordOrDefault("model", "") == "ideal")
            throw std::runtime_error(head + "the G^E model is `ideal`, which"
                " makes G^E = 0 -- and with G^E = 0 this rule is NOT the"
                " one-fluid rule (Huron-Vidal's a/b = sum y_i a_i/b_i), so it"
                " is the wrong tool for a mixture with no excess Gibbs energy."
                "  Use `mixingRule vanDerWaalsOneFluid;`.");
        DictPtr ref = injectUnifacGroups(actDict, names, comps);
        injectUniquacRQ(ref, names, comps);
        auto act = ActivityModel::New(ref, comps);

        //  A PAIR WITH NO RECORD IS REFUSED (record D1.5).  Under gammaPhi it
        //  is an announced ideal assumption; here a zero G^E is a definite
        //  claim about the attraction with no kij to correct it.
        for (const auto& p : act->resolvedPairs())
            if (p.status == "idealDefault")
                throw std::runtime_error(head + "the pair " + p.i + "-" + p.j
                    + " has no " + p.model + " record (it resolved to the"
                      " ideal default).  Inside an equation of state a missing"
                      " pair is not an ideal assumption: G^E = 0 for that"
                      " pair makes its attraction the Huron-Vidal value, which"
                      " is not the one-fluid rule and has no kij to correct it."
                      "  Declare the pair's record in the `activityModel`"
                      " block (`binaryParameters { " + p.i + "-" + p.j
                    + " { source \"...\"; } }`), or use"
                      " `mixingRule vanDerWaalsOneFluid;`.");

        auto rule = std::make_unique<ExcessGibbsRule>(
            row, comps.size(), std::move(act), c.eosDict->found("mixingRule"));

        //  THE CHOICE, PRINTED (record section 5): the rule, its reference
        //  pressure, the G^E model, each pair with its tier and its span.
        std::ostringstream m;
        m << c.eosModel << " mixing rule " << row.name << ": " << row.equation
          << "; the cubic is matched to G^E at ZERO pressure; q1 = " << row.q1;
        if (row.q2 != 0.0) m << ", q2 = " << row.q2;
        m << " (" << row.source << ").  G^E model " << rule->activity()->modelName()
          << " over (" << namesOf(comps) << ")";
        for (const auto& e : rule->activity()->resolvedPairs())
            m << "; pair " << e.i << "-" << e.j << " " << e.status
              << ExcessGibbsRule::validityText(e);
        announceOnce(c.eosModel + " " + row.name + " rule", "info", m.str());
        announceOnce(c.eosModel + " " + row.name + " energy", "info",
            std::string(row.name) + ": the departure enthalpy and entropy of"
            " this cubic carry the temperature slope of the G^E model"
            " (H^E = -R T^2 d(G^E/RT)/dT from " + rule->activity()->modelName()
            + "), as the identity H^R = -R T^2 d(sum y_i ln phi_i)/dT"
            " requires; a pair fitted to phase equilibrium only gives that"
            " slope from the same numbers that fix G^E, never from a heat of"
            " mixing.  They reach the VAPOUR's enthalpy and entropy: a liquid"
            " stream of a phiPhi package is priced on H_liquid_formation, not"
            " on the cubic (DEV.md 4c C410)");
        return rule;
    }

} // namespace

// ---------------------------------------------------------------------------
//  The factory.
// ---------------------------------------------------------------------------
std::map<std::string, CubicMixingRule::Factory>& CubicMixingRule::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void CubicMixingRule::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

bool CubicMixingRule::isRegistered(const std::string& name)
{
    return registry().count(name) > 0;
}

std::vector<std::string> CubicMixingRule::registeredNames()
{
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

std::unique_ptr<CubicMixingRule>
CubicMixingRule::New(const std::string& name, const Context& ctx)
{
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error(registryRefusal::message(
            "cubic mixing rule", name, registryRefusal::keysOf(registry())));
    return it->second(ctx);
}

void CubicMixingRule::registerBuiltins()
{
    registerType("vanDerWaalsOneFluid", makeOneFluid);
    for (const GeRow& row : GE_ROWS)
    {
        const GeRow r = row;
        registerType(r.name,
            [r](const Context& c) { return makeGe(r, c); });
    }
}

} // namespace Choupo
