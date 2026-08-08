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
Application
    _ionGibbsDuhemProbe  (a curation probe, not a shipped binary)

Description
    GIBBS-DUHEM FOR THE PER-ION AQUEOUS MODELS.

    The molecular test ties two gammas to each other.  The salt-level test ties
    the water side to the ion side.  This one does the same for a MULTI-ION
    solution, where the constraint is

        (1000/M_w) dln(a_w)  +  SUM_i m_i dln(gamma_i)  +  SUM_i dm_i  =  0

    Evaluated along a scaling path m_i(s) = s * m_i0, so dm_i/ds = m_i0:

        (1000/M_w) dln(a_w)/ds  +  SUM_i m_i dln(gamma_i)/ds  +  SUM_i m_i0 = 0

    with ln a_w = -(M_w/1000) * phi * SUM_i m_i.

    WHY THE MODELS MUST BE JUDGED DIFFERENTLY, and this is the whole reason the
    probe reports a KIND rather than a pass/fail.  `ActivityResult::osmotic` is
    OPTIONAL.  PitzerHMW fills it with the rigorous HMW osmotic sum computed on
    the SAME virial parameters as its gammas, so its solvent and solute sides
    come from one excess Gibbs energy and the constraint is a real test of the
    implementation.  Davies leaves it null and the solver keeps phi = 1 -- the
    dilute limit -- which is a DECLARED approximation, stated in
    AqueousActivity.H, and consistent with Davies being an indicative model.

    A test that ran the same arithmetic over both and reported Davies as a
    violation would be manufacturing a bug out of a documented modelling
    choice.  A test that quietly skipped Davies would be hiding that its water
    activity is not thermodynamically tied to its ion activities at all.  So
    the probe reports, per model, whether phi was SUPPLIED -- and the gate
    turns that into two different questions.
\*---------------------------------------------------------------------------*/

#include "thermo/electrolyte/AqueousActivity.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <string>
#include <vector>

using namespace Choupo;
using namespace Choupo::electrolyte;

static const double MW_WATER = 18.015;         // g/mol
static const double NW       = 1000.0 / MW_WATER;   // mol water per kg

std::string num(double v)
{
    if (std::isnan(v)) return "NaN";
    if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
    char b[40];
    std::snprintf(b, sizeof b, "%.17g", v);
    return b;
}

std::string esc(const std::string& s)
{
    std::string o;
    for (char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else o += c; }
    return o;
}

//  A seawater-like multi-ion state, scaled by s.
IonState stateAt(double s)
{
    IonState st;
    st.name     = {"Na",  "Cl",  "Mg",  "SO4", "K"};
    st.charge   = { 1.0, -1.0,   2.0,  -2.0,  1.0};
    const std::vector<double> m0 = {0.50, 0.60, 0.05, 0.03, 0.01};
    st.molality.resize(m0.size());
    double I = 0.0;
    for (std::size_t i = 0; i < m0.size(); ++i)
    {
        st.molality[i] = s * m0[i];
        I += 0.5 * st.molality[i] * st.charge[i] * st.charge[i];
    }
    st.I = I;
    st.T = 298.15;
    return st;
}

double lnGamma(const ActivityResult& r, const IonState& st, std::size_t i)
{
    const double g = r.gammaNamed ? r.gammaNamed(st.name[i], st.charge[i])
                                  : r.gamma(st.charge[i]);
    return std::log(g);
}

std::string testModel(const std::string& name, double s0)
{
    std::string head = "{\"model\": \"" + esc(name) + "\", \"s\": " + num(s0);
    try
    {
        auto model = AqueousActivity::New(name);
        const double h = 1.0e-6;

        auto stM = stateAt(s0 - h), st0 = stateAt(s0), stP = stateAt(s0 + h);
        auto rM = model->evaluate(stM, stM.T);
        auto r0 = model->evaluate(st0, st0.T);
        auto rP = model->evaluate(stP, stP.T);

        const bool hasPhi = static_cast<bool>(r0.osmotic);

        //  ln a_w = -(M_w/1000) phi sum m_i.  With no phi the solver uses 1.
        auto lnAw = [&](const ActivityResult& r, const IonState& st)
        {
            double sum = 0.0;
            for (double m : st.molality) sum += m;
            const double phi = r.osmotic ? r.osmotic() : 1.0;
            return -(MW_WATER / 1000.0) * phi * sum;
        };

        const double dlnAw = (lnAw(rP, stP) - lnAw(rM, stM)) / (2.0 * h);

        double ionTerm = 0.0, sumM0 = 0.0;
        for (std::size_t i = 0; i < st0.molality.size(); ++i)
        {
            const double dlng = (lnGamma(rP, stP, i) - lnGamma(rM, stM, i))
                              / (2.0 * h);
            ionTerm += st0.molality[i] * dlng;
            sumM0   += st0.molality[i] / s0;      // m_i0
        }

        const double raw   = NW * dlnAw + ionTerm + sumM0;
        const double scale = std::fabs(NW * dlnAw) + std::fabs(ionTerm)
                           + std::fabs(sumM0);
        const double R     = std::fabs(raw) / (scale + 1e-30);

        return head + ", \"result\": \"ok\", \"hasPhi\": "
             + (hasPhi ? "true" : "false")
             + ", \"phi\": " + num(r0.osmotic ? r0.osmotic() : 1.0)
             + ", \"I\": " + num(st0.I)
             + ", \"R\": " + num(R)
             + ", \"solventTerm\": " + num(NW * dlnAw)
             + ", \"ionTerm\": " + num(ionTerm)
             + ", \"dmTerm\": " + num(sumM0) + "}";
    }
    catch (const std::exception& e)
    { return head + ", \"result\": \"" + esc(e.what()) + "\"}"; }
}

int main()
{
    AqueousActivity::registerBuiltins();

    std::string out;
    bool first = true;
    auto add = [&](const std::string& s)
    { if (!first) out += ",\n  "; first = false; out += s; };

    for (const char* m : {"davies", "pitzerHMW", "edwardsPitzer"})
    {
        add(testModel(m, 0.6));
        add(testModel(m, 1.0));
    }

    std::cout << "<<<JSON\n[\n  " << out << "\n]\nJSON>>>\n";
    return 0;
}
