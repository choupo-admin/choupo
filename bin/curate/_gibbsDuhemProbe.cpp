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
    _gibbsDuhemProbe  (a curation probe, not a shipped binary)

Description
    THE GIBBS-DUHEM CONSISTENCY TEST, applied to every registered molecular
    activity model over the curated binary pairs.

    This asks a question no golden-master test can ask.  A golden proves an
    answer has not MOVED; it cannot say the answer was ever right, and if a
    model was wrong the day its golden was recorded, the golden preserves the
    error forever.  Gibbs-Duhem needs no experimental data and no reference
    answer -- it is a constraint thermodynamics puts on the model itself:

        sum_i  x_i  d(ln gamma_i)  =  0        (constant T, P)

    which for a binary, differentiating along x1, is

        x1 dln(g1)/dx1  +  x2 dln(g2)/dx1  =  0

    Any activity model derived from a valid excess Gibbs energy satisfies this
    IDENTICALLY, at every composition.  A transposed tau, a swapped alpha, an
    i/j mix-up in a pair lookup, a dropped term in a derivative -- all break
    it, and none of them would disturb a single golden.

    THE NUMERICS ARE THE DELICATE PART, and the test is worthless if they are
    not stated.  The derivatives are central differences, so the residual can
    never reach zero: truncation falls as h^2 while round-off in ln(gamma)
    grows as eps/h, and the total error is minimised near h ~ eps^(1/3).  We
    therefore report the residual NORMALISED by the local scale of the
    derivatives themselves,

        R = |x1 g1' + x2 g2'| / (|x1 g1'| + |x2 g2'| + eps)

    which is dimensionless and composition-independent, and we report the raw
    parts too so a reader can see what the normaliser did.  A model that is
    right returns R at the 1e-8..1e-10 level; a model with a structural error
    returns O(0.1..1).  There is no interesting middle ground, which is what
    makes the test decisive rather than a tolerance argument.

    The endpoints are deliberately excluded: ln(gamma) is finite there but its
    derivative is not always, and the dilute limit is where the finite
    difference is least trustworthy.  A test must not report a numerical
    artefact of its own construction as a physical finding.
\*---------------------------------------------------------------------------*/

#include "core/Dictionary.H"
#include "thermo/Component.H"
#include "thermo/Database.H"
#include "thermo/electrolyte/PitzerSingleSalt.H"
#include "thermo/electrolyte/ENRTLSingleSalt.H"
#include "thermo/phase/LiquidPhase.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/activityCoefficient/ActivityModel.H"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

using namespace Choupo;

std::string home()
{
    const char* h = std::getenv("CHOUPO_HOME");
    return std::string(h ? h : ".");
}

Component fromCatalogue(const std::string& name)
{
    Component c;
    c.readFromDict(Dictionary::fromFile(
        home() + "/data/standards/components/" + name + ".dat"));
    return c;
}

//  NOT std::to_string.  It writes SIX DECIMAL PLACES, so every residual
//  below 1e-6 serialises as "0.000000" and reads back as exactly zero.  The
//  first run of this probe reported a Gibbs-Duhem residual of 0.000e+00 for
//  every model and I very nearly wrote that up as machine-precision
//  consistency.  It was the printf format.  A measurement is only as good as
//  the channel it is reported through, and a lossy channel manufactures
//  exactly the clean result an author wants to see.
std::string num(double v)
{
    if (std::isnan(v)) return "NaN";
    if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
    char buf[40];
    std::snprintf(buf, sizeof buf, "%.17g", v);
    return buf;
}

std::string esc(const std::string& s)
{
    std::string o;
    for (char c : s)
    {
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (c == '\n') o += "\\n";
        else o += c;
    }
    return o;
}

//  One (model, pair) experiment.  Returns a JSON object.
std::string testPair(const std::string& modelName,
                     const std::string& a,
                     const std::string& b,
                     double T,
                     bool sabotage = false)
{
    //  MARKED, not positional.  The gate used to find this row as rows[-1],
    //  and appending the electrolyte cases after it silently made the gate
    //  read a real model as its own negative -- the same defect as a flash
    //  selecting phases by declaration order.  A row says what it IS.
    std::string head = "{\"model\": \"" + esc(modelName) + "\", \"pair\": \""
                     + esc(a + "/" + b) + "\", \"negative\": "
                     + (sabotage ? "true" : "false") + ", \"T\": " + num(T);
    try
    {
        std::vector<std::string> names{a, b};
        //  push_back, not an initializer_list: Component is move-only, and an
        //  initializer_list copies.
        std::vector<Component> comps;
        comps.push_back(fromCatalogue(a));
        comps.push_back(fromCatalogue(b));

        LiquidPhase liq(Dictionary::fromString(
            //  binaryPairsBase POINTS THE FILE LOOKUP AT THE CATALOGUE.
            //  Without it every pair "defaults to IDEAL" -- announced, loudly,
            //  by the engine -- and NRTL/Wilson return gamma = 1 everywhere.
            //  A consistency test run against gamma = 1 is vacuous: the
            //  residual is 0/0 and passes whatever the model does.
            "name liquid; binaryPairsBase \"" + home() + "/data\";"
            " activity { model " + modelName + "; binaryPairsBase \""
            + home() + "/data\"; }",
            "probe.dict"), names, comps);

        //  h chosen near eps^(1/3) for a central difference on a quantity of
        //  order 1: below this, round-off in ln(gamma) dominates; above it,
        //  truncation does.  Stated because the residual floor IS this choice.
        const double h = 1.0e-5;

        double worst = 0.0, worstX = 0.0, worstRaw = 0.0, worstScale = 0.0;
        std::string rows;
        bool first = true;

        for (double x1 = 0.05; x1 <= 0.951; x1 += 0.05)
        {
            sVector xp{x1 + h, 1.0 - (x1 + h)};
            sVector xm{x1 - h, 1.0 - (x1 - h)};

            const auto gp = liq.activityCoefficients(T, xp);
            const auto gm = liq.activityCoefficients(T, xm);

            //  d ln(gamma_i) / d x1, central
            //  THE SYNTHETIC NEGATIVE.  Substituting gamma_1 for gamma_2
            //  gives a pair that no excess Gibbs energy can produce, so
            //  Gibbs-Duhem must be violated at O(1).  Without this, a test
            //  that silently measured nothing would look identical to a test
            //  that passed -- which is exactly how this probe first reported
            //  a residual of zero for every model.
            const std::size_t j = sabotage ? 0 : 1;
            const double d1 = (std::log(gp[0]) - std::log(gm[0])) / (2.0 * h);
            const double d2 = (std::log(gp[j]) - std::log(gm[j])) / (2.0 * h);

            const double raw   = x1 * d1 + (1.0 - x1) * d2;
            const double scale = std::fabs(x1 * d1)
                               + std::fabs((1.0 - x1) * d2);
            const double R     = std::fabs(raw) / (scale + 1e-30);

            if (R > worst)
            {
                worst = R; worstX = x1; worstRaw = raw; worstScale = scale;
            }
            if (!first) rows += ", ";
            first = false;
            rows += "{\"x1\": " + num(x1) + ", \"R\": " + num(R) + "}";
        }

        //  THE VACUITY GUARD.  A Gibbs-Duhem residual of exactly zero is not
        //  a pass -- it is the signature of gammas that do not vary with
        //  composition at all, which is what happens when a pair lookup
        //  silently falls back to ideal.  Report the composition dependence
        //  so the caller can refuse a test that measured nothing.
        sVector xMid{0.5, 0.5};
        sVector xOff{0.2, 0.8};
        const auto gMid = liq.activityCoefficients(T, xMid);
        const auto gOff = liq.activityCoefficients(T, xOff);
        const double spread = std::fabs(gMid[0] - gOff[0])
                            + std::fabs(gMid[1] - gOff[1]);

        return head
             + ", \"result\": \"ok\""
             + ", \"g1_mid\": " + num(gMid[0])
             + ", \"g2_mid\": " + num(gMid[1])
             + ", \"spread\": " + num(spread)
             + ", \"worstR\": "     + num(worst)
             + ", \"worstX1\": "    + num(worstX)
             + ", \"worstRaw\": "   + num(worstRaw)
             + ", \"worstScale\": " + num(worstScale)
             + ", \"rows\": [" + rows + "]}";
    }
    catch (const std::exception& e)
    {
        return head + ", \"result\": \"" + esc(e.what()) + "\"}";
    }
}

//  THE ELECTROLYTE FORM OF GIBBS-DUHEM, and it is a STRONGER statement.
//
//  For a single salt in water the solvent and solute activities are not
//  independent.  With phi the osmotic coefficient and g the mean ionic
//  activity coefficient,
//
//      ln g(m) = (phi - 1) + INT_0^m (phi - 1)/m' dm'
//
//  so, differentiating,
//
//      dln(g)/dm  =  dphi/dm  +  (phi - 1)/m
//
//  The molecular test ties two gammas to each other.  This ties the WATER side
//  of the model to the ION side.  A package computing phi from one expression
//  and g from another -- rather than both from one excess Gibbs energy -- fails
//  here while every golden it ever recorded stays green.
//
//  DELIBERATELY NOT TESTED: a_w against phi.  PitzerSingleSalt DEFINES
//  ln a_w = -phi*nu*m*M_w/1000, so comparing them checks an identity the code
//  asserts, not a constraint physics imposes.  Reported, never counted -- the
//  same rule that makes gamma = 1 a vacuous pass above.
template <class Kernel>
std::string testElectrolyte(const std::string& label, const Kernel& k, double T)
{
    std::string head = "{\"model\": \"" + esc(label)
                     + "\", \"pair\": \"single salt in water\""
                       ", \"negative\": false, \"T\": " + num(T);
    try
    {
        const double h = 1.0e-6;
        double worst = 0.0, worstM = 0.0;
        const double spread = std::fabs(k.gammaPM(0.5, T) - k.gammaPM(2.0, T));

        for (double m = 0.2; m <= 3.01; m += 0.2)
        {
            const double dlng = (std::log(k.gammaPM(m + h, T))
                               - std::log(k.gammaPM(m - h, T))) / (2.0 * h);
            const double dphi = (k.osmoticCoefficient(m + h, T)
                               - k.osmoticCoefficient(m - h, T)) / (2.0 * h);
            const double phi  = k.osmoticCoefficient(m, T);

            const double raw   = dlng - dphi - (phi - 1.0) / m;
            const double scale = std::fabs(dlng) + std::fabs(dphi)
                               + std::fabs((phi - 1.0) / m);
            const double R     = std::fabs(raw) / (scale + 1e-30);
            if (R > worst) { worst = R; worstM = m; }
        }
        return head + ", \"result\": \"ok\", \"spread\": " + num(spread)
             + ", \"worstR\": " + num(worst) + ", \"worstX1\": " + num(worstM)
             + ", \"g1_mid\": " + num(k.gammaPM(1.0, T))
             + ", \"g2_mid\": " + num(k.osmoticCoefficient(1.0, T))
             + ", \"rows\": []}";
    }
    catch (const std::exception& e)
    { return head + ", \"result\": \"" + esc(e.what()) + "\"}"; }
}

int main()
{
    //  EXPLICIT, as the project requires -- no auto-registration.  A probe
    //  that forgets these gets "Available: (none)", which is the factory
    //  refusal doing exactly its job.
    VaporPressureModel::registerBuiltins();
    HeatCapacityModel::registerBuiltins();
    ActivityModel::registerBuiltins();

    //  Constructing a Database sets Database::currentRoot(), which is how the
    //  pair-file lookup reaches standards/parameters/<model>/.  Without it the
    //  tier-3 path is relative and every pair "defaults to IDEAL" -- announced
    //  by the engine, which is how I found this.
    Database db(home() + "/data");
    (void)db;

    std::string out;
    bool first = true;
    auto add = [&](const std::string& s)
    { if (!first) out += ",\n  "; first = false; out += s; };

    //  The curated binaries, each with the models that can price it.
    //  NRTL and UNIQUAC need a curated pair file; UNIFAC needs group
    //  assignments on the components and needs no pair at all; `ideal` is the
    //  CONTROL -- it returns gamma = 1 everywhere, so both derivatives are
    //  zero and the residual is 0/0.  That is reported, not hidden: a model
    //  with no composition dependence passes this test trivially, and a test
    //  that counted it as evidence would be inflating its own coverage.
    add(testPair("NRTL",    "ethanol",     "water",         328.15));
    add(testPair("NRTL",    "benzene",     "toluene",       365.00));
    add(testPair("UNIQUAC", "methanol",    "methylAcetate", 330.00));
    add(testPair("UNIQUAC", "methylAcetate", "water",       340.00));
    add(testPair("UNIQUAC", "aceticAcid",  "methylAcetate", 350.00));
    add(testPair("UNIFAC",  "ethanol",     "water",         328.15));
    add(testPair("UNIFAC",  "benzene",     "toluene",       365.00));
    add(testPair("ideal",   "ethanol",     "water",         328.15));

    //  Wilson and cosmoSAC are attempted so the probe REPORTS why they are
    //  absent rather than leaving a reader to assume they were covered.
    add(testPair("Wilson",   "ethanol", "water", 328.15));
    add(testPair("cosmoSAC", "ethanol", "water", 328.15));

    //  The negative: the SAME model and pair, with gamma_2 replaced by
    //  gamma_1.  Must come back O(1), or this whole probe proves nothing.
    add(testPair("NRTL", "ethanol", "water", 328.15, true));

    //  The electrolyte kernels on their own DEFAULT parameters.  A structural
    //  test of the EQUATIONS' mutual consistency; it says nothing about any
    //  particular salt's fitted numbers, and the gate says so.
    {
        PitzerSingleSalt salt;
        add(testElectrolyte("pitzerSalt", salt, 298.15));
        ENRTLSingleSalt en;
        add(testElectrolyte("eNRTLsalt", en, 298.15));
    }

    std::cout << "<<<JSON\n[\n  " << out << "\n]\nJSON>>>\n";
    return 0;
}
