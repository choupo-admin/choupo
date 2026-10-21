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

#include "HansenMixture.H"
#include "core/Advisory.H"
#include "solver/StabilityTest.H"
#include "thermo/ApproximationAuthorisation.H"
#include "thermo/Database.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/phase/Phase.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

std::string fmt(scalar v, int prec = 4)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(prec) << v;
    return os.str();
}

std::string jnum(scalar v)
{
    if (!std::isfinite(v)) return "null";
    char buf[40];
    std::snprintf(buf, sizeof buf, "%.12g", static_cast<double>(v));
    return buf;
}

std::string jstr(const std::string& s)
{
    std::string o = "\"";
    for (char ch : s)
    {
        switch (ch)
        {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            default:   o += ch;
        }
    }
    return o + "\"";
}

//  One solvent as the op reads it: the record's triple, its reference
//  temperature, and the two bulk constants the basis conversion needs.
struct Solvent
{
    std::string name;
    std::size_t index = 0;       // in the package
    scalar dD = 0, dP = 0, dH = 0, Tref = 0;   // Pa^0.5, K
    scalar Vliq = 0;             // m3/mol
    scalar MW   = 0;             // kg/kmol
};

//  One row of the answer.
struct Point
{
    std::string label;
    bool   sweep = false;        // a blend point (s is meaningful)
    scalar s = 0;                // the SECOND solvent's fraction, declared basis
    std::vector<scalar> phi;     // volume fractions, one per declared solvent
    std::vector<scalar> z;       // mole fractions, same order (the phase check)
    scalar dD = 0, dP = 0, dH = 0;   // the mixed triple, Pa^0.5
    scalar Ra = 0;               // Pa^0.5
    bool   hasRa = false;        // false on a twoPhase point (refused)
    std::string phase;           // pure | homogeneous | twoPhase | notVerified
    scalar tm = 0;               // TPD tm_min, where the test ran
    bool   hasTm = false;
};

constexpr scalar MPA = 1.0e3;    // 1 MPa^0.5 = 1000 Pa^0.5

//  HANSEN'S DISTANCE, the one arithmetic of this op.  The factor 4 is the
//  thesis's Eq. 8.2 ("the unit distance for dD is taken as twice that for
//  dP and dH" -- Hansen 1967, p. 90); it is a statement about how the
//  solubility volumes were found to be spherical, not a derivation.
scalar hansenDistance(scalar dD, scalar dP, scalar dH,
                      const Component::HansenBlock& t)
{
    const scalar a = dD - t.dD, b = dP - t.dP, c = dH - t.dH;
    return std::sqrt(4.0 * a * a + b * b + c * c);
}

} // namespace


int HansenMixture::run(const DictPtr& dict,
                       const ThermoPackage& thermo,
                       int verbosity)
{
    diag_.clear();
    head_.clear();
    block_.clear();

    const std::string opName = dict->lookupWordOrDefault("name", "hansenMixture");
    auto refuse = [&](const std::string& why) -> void
    {
        throw std::runtime_error("hansenMixture '" + opName + "': " + why);
    };

    // ---- THE TARGET: a record with a `hansen {}` block, loaded by name ----
    //  Through the Database's own resolver (case-local first, then the
    //  catalogue), NOT through the package: a polymer or resin has no MW a
    //  flash could use and is never a component of a thermophysical system.
    //  It may also BE a package component (a small-molecule solute); the
    //  record is the same file either way.
    if (!dict->found("target"))
        refuse("declares no `target` -- the substance to be dissolved, a"
               " record carrying `hansen { dD; dP; dH; Tref; [R0]; }`."
               "  Nothing is averaged for its own sake: without a target"
               " there is no distance to compute.");
    const std::string targetName = dict->lookupWord("target");
    if (!database())
        refuse("no component Database is available to resolve the target"
               " record (the props main hands one to every op; this is a"
               " wiring defect, not a case defect).");
    DictPtr targetDict = database()->componentDict(targetName);
    if (!targetDict->found("hansen"))
        refuse("the target record '" + targetName + "' declares no"
               " `hansen {}` block.  A target IS its triple here; declare"
               " `hansen { dD; dP; dH; Tref; R0; }` (Pa^0.5, K) with the"
               " source of each value, or choose a record that carries one.");
    const Component::HansenBlock target =
        Component::readHansenBlock(targetDict->subDict("hansen"), targetName);

    // ---- THE SOLVENTS: package components carrying a triple ---------------
    if (!dict->found("solvents"))
        refuse("declares no `solvents ( ... )` list.");
    const std::vector<std::string> solventNames = dict->lookupWordList("solvents");
    if (solventNames.empty())
        refuse("`solvents ( )` is empty -- name at least one.");
    std::vector<Solvent> solvents;
    for (const auto& nm : solventNames)
    {
        const Component* c = nullptr;
        std::size_t idx = 0;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).name() == nm) { c = &thermo.comp(i); idx = i; }
        if (!c)
        {
            std::string have;
            for (std::size_t i = 0; i < thermo.n(); ++i)
                have += (i ? ", " : "") + thermo.comp(i).name();
            refuse("solvent '" + nm + "' is not a component of this case's"
                   " thermophysical system (components: " + have + ")."
                   "  The phase check asks the case's own activity model"
                   " about the pair, so every solvent must be declared in"
                   " constant/thermoPhysPropDict.");
        }
        if (!c->hasHansen())
            refuse("solvent '" + nm + "' declares no `hansen {}` block --"
                   " its dispersion / polar / hydrogen-bonding split is not"
                   " derivable from anything the record holds.  Declare"
                   " `hansen { dD; dP; dH; Tref; }` (Pa^0.5, K) with the"
                   " primary source of each value, case-locally or in the"
                   " record; nothing is estimated here.");
        if (!(c->Vliq() > 0))
            refuse("solvent '" + nm + "' declares no liquid molar volume"
                   " (Vliq) -- the volume-fraction rule and the mole"
                   " fractions of the phase check both need it.");
        Solvent s;
        s.name = nm; s.index = idx;
        s.dD = c->hansenD(); s.dP = c->hansenP(); s.dH = c->hansenH();
        s.Tref = c->hansenTref();
        s.Vliq = c->Vliq();
        s.MW   = c->MW();
        solvents.push_back(s);
    }
    for (std::size_t i = 0; i < solvents.size(); ++i)
        for (std::size_t j = i + 1; j < solvents.size(); ++j)
            if (solvents[i].name == solvents[j].name)
                refuse("solvent '" + solvents[i].name + "' is listed twice.");

    // ---- T, P, and what T is used for -------------------------------------
    if (!dict->found("T"))
        refuse("declares no `T`.  The temperature is not decorative: it is"
               " stated beside the parameters' reference temperature and it"
               " decides the phase check.  Declare `T 298.15 K;` (or the"
               " temperature the solvent is to be used at).");
    const scalar T = dict->lookupScalar("T");
    const bool   Pdefaulted = !dict->found("P");
    const scalar P = dict->lookupScalarOrDefault("P", 101325.0);

    // ---- the composition sweep, or the pure screen -------------------------
    const bool sweep = dict->found("composition");
    std::string basis = "volume";
    std::size_t nPts = 0;
    if (sweep)
    {
        if (solvents.size() != 2)
            refuse("a `composition {}` sweep runs along the LINE between"
                   " exactly TWO solvents, and " + std::to_string(solvents.size())
                   + " are declared.  Three or more make a triangle this op"
                   " does not draw; list two, or drop the block to screen"
                   " each solvent pure.");
        auto comp = dict->subDict("composition");
        if (!comp->found("basis"))
            refuse("`composition {}` declares no `basis` -- `volume`, `mass`"
                   " or `mole`, the basis the sweep's fraction is written"
                   " in.  A fraction with no basis is a number that will be"
                   " read as whichever one the reader expects.");
        basis = comp->lookupWord("basis");
        if (basis != "volume" && basis != "mass" && basis != "mole")
            refuse("`composition.basis " + basis + "` is not a basis this op"
                   " knows.  Accepted: volume | mass | mole.");
        const scalar nRaw = comp->lookupScalarOrDefault("n", 21);
        if (nRaw < 2 || nRaw != std::floor(nRaw))
            refuse("`composition.n` must be an integer >= 2 (the number of"
                   " points from pure " + solvents[0].name + " to pure "
                   + solvents[1].name + ").");
        nPts = static_cast<std::size_t>(nRaw);
        if (basis == "mass")
            for (const auto& s : solvents)
                if (!(s.MW > 0))
                    refuse("solvent '" + s.name + "' declares no MW, and a"
                           " mass basis cannot be converted to volume"
                           " fractions without it.");
    }

    // ---- output -------------------------------------------------------------
    if (!dict->found("output"))
        refuse("declares no `output { file ...; }` -- the CSV is the one"
               " surface a golden row and the GUI read every number from.");
    const std::string outFile = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("hansenMixture", "file", outFile);

    // ---- the reference temperatures, stated ------------------------------
    //  NO CORRECTION EXISTS, and the run says so rather than letting `T`
    //  read as the temperature of the parameters.  A triple at Tref used at
    //  another T is an approximation the reader must see, so it is raised
    //  into the caveat block, not only printed here.
    std::vector<scalar> trefs{ target.Tref };
    for (const auto& s : solvents) trefs.push_back(s.Tref);
    bool anyAway = false;
    for (scalar tr : trefs) if (std::fabs(tr - T) > 0.5) anyAway = true;
    if (anyAway)
        AdvisoryLog::instance().add("extrapolation", "warning",
            "hansenMixture '" + opName + "'",
            "the Hansen parameters are held constant at their reference"
            " temperature(s) and used at T = " + fmt(T, 2) + " K -- no"
            " temperature correction exists in this engine; T decides the"
            " phase check only");

    if (verbosity >= 2)
    {
        std::cout << "\n  [hansenMixture]  Ra^2 = 4 (dD - dD,t)^2 + (dP - dP,t)^2"
                     " + (dH - dH,t)^2      Hansen (1967), Eq. 8.2\n"
                     "                   delta_k,mix = sum_i phi_i delta_k,i"
                     " (k = D, P, H) -- the VOLUME-FRACTION RULE, an\n"
                     "                   approximation: each solvent keeps its"
                     " own split when mixed, and the mixture's volume\n"
                     "                   is the sum of the parts.\n"
                  << "  target   " << targetName << "   dD " << fmt(target.dD / MPA, 2)
                  << "  dP " << fmt(target.dP / MPA, 2) << "  dH "
                  << fmt(target.dH / MPA, 2) << " MPa^0.5   at Tref "
                  << fmt(target.Tref, 2) << " K";
        if (target.hasR0)
            std::cout << "   R0 " << fmt(target.R0 / MPA, 2) << " MPa^0.5";
        else
            std::cout << "   (no R0 declared: Ra is published alone, no RED --"
                         " a cut-off the record did not measure is not invented)";
        std::cout << "\n";
        for (const auto& s : solvents)
            std::cout << "  solvent  " << std::left << std::setw(16) << s.name
                      << std::right << "dD " << fmt(s.dD / MPA, 2) << "  dP "
                      << fmt(s.dP / MPA, 2) << "  dH " << fmt(s.dH / MPA, 2)
                      << " MPa^0.5   at Tref " << fmt(s.Tref, 2) << " K   Vliq "
                      << fmt(s.Vliq * 1.0e6, 2) << " cm3/mol\n";
        std::cout << "  T = " << fmt(T, 2) << " K: the parameters are HELD"
                     " CONSTANT at their reference temperature(s) as an"
                     " approximation -- no\n  temperature correction exists"
                     " here; the declared T is used only for the phase check"
                     " (P = " << fmt(P / 1.0e5, 3) << " bar"
                  << (Pdefaulted ? ", DEFAULTED to 1 atm -- a liquid activity"
                                   " model barely sees it" : "") << ").\n";
        if (sweep)
            std::cout << "  composition: " << nPts << " points from pure "
                      << solvents[0].name << " to pure " << solvents[1].name
                      << ", the fraction of " << solvents[1].name
                      << " declared in the " << basis << " basis"
                      << (basis == "volume" ? "" : " and converted to volume"
                         " fractions through Vliq" + std::string(basis == "mass"
                         ? " and MW" : "") + " (the record's 25 C volume --"
                         " ideal mixing volume assumed)") << ".\n";
        else
            std::cout << "  no `composition {}`: each solvent is evaluated"
                         " PURE (a screen; the phase word is `pure`).\n";
    }

    // ---- the phase check, ONE decision for every point --------------------
    //  Asked of the FIRST declared liquid phase's activity model.  What can
    //  decide, decides (Michelsen's TPD); what cannot says so and the point
    //  is marked, never silently averaged.
    std::string checkModel = "none", checkReason;
    bool canCheck = false;
    std::size_t liqIdx = 0;
    {
        const auto liquids = thermo.phasesOfType("liquid");
        if (!thermo.hasActivity() || liquids.empty())
            checkReason = "the thermophysical system declares no liquid"
                          " activity model, so no stability test can be asked";
        else
        {
            checkModel = thermo.activity().modelName();
            liqIdx = liquids.front();
            if (checkModel == "ideal")
                checkReason = "the liquid is declared `ideal`: gamma = 1 has"
                              " no excess Gibbs energy and can never demix,"
                              " so its answer would be `homogeneous` for"
                              " every pair ever asked -- not a verification";
            else if (solvents.size() == 2
                     && ApproximationAuthorisation::instance().authorisesIdealPair(
                            solvents[0].name, solvents[1].name))
                checkReason = "the pair " + solvents[0].name + "-"
                            + solvents[1].name + " runs on the AUTHORISED"
                              " ideal default (no parameters), which cannot"
                              " demix either";
            else
                canCheck = true;
        }
    }
    if (verbosity >= 2)
    {
        if (canCheck)
            std::cout << "  phase check: Michelsen tangent-plane distance on"
                         " the " << checkModel << " liquid at every blend"
                         " point (solver::michelsenTPD, the test the flash's"
                         " `phaseSet auto` runs).\n";
        else
            std::cout << "  phase check: NOT VERIFIED -- " << checkReason
                      << ".  Blend points are marked `notVerified`.\n";
    }

    // ---- the points -----------------------------------------------------------
    std::vector<Point> pts;
    const std::size_t nS = solvents.size();
    auto makePoint = [&](const std::vector<scalar>& phi) -> Point
    {
        Point p;
        p.phi = phi;
        //  Mole fractions from volume fractions: n_i = phi_i / Vliq_i.
        p.z.assign(nS, 0.0);
        scalar nsum = 0;
        for (std::size_t i = 0; i < nS; ++i)
        {
            p.z[i] = phi[i] / solvents[i].Vliq;
            nsum += p.z[i];
        }
        for (auto& v : p.z) v /= nsum;
        p.dD = p.dP = p.dH = 0;
        for (std::size_t i = 0; i < nS; ++i)
        {
            p.dD += phi[i] * solvents[i].dD;
            p.dP += phi[i] * solvents[i].dP;
            p.dH += phi[i] * solvents[i].dH;
        }
        //  Which solvents are present decides whether there is a pair to
        //  test at all.
        std::size_t present = 0;
        for (scalar f : phi) if (f > 0) ++present;
        if (present < 2)      p.phase = "pure";
        else if (!canCheck)   p.phase = "notVerified";
        else
        {
            sVector z(thermo.n(), 0.0);
            for (std::size_t i = 0; i < nS; ++i) z[solvents[i].index] = p.z[i];
            const auto st = solver::michelsenTPD(thermo.phase(liqIdx), T, P, z);
            p.tm = st.tmMin; p.hasTm = true;
            p.phase = st.unstable ? "twoPhase" : "homogeneous";
        }
        //  THE REFUSAL: a two-phase pair is not represented as one solvent.
        if (p.phase != "twoPhase")
        {
            p.Ra = hansenDistance(p.dD, p.dP, p.dH, target);
            p.hasRa = true;
        }
        return p;
    };

    if (sweep)
    {
        for (std::size_t k = 0; k < nPts; ++k)
        {
            const scalar s = static_cast<scalar>(k) / static_cast<scalar>(nPts - 1);
            std::vector<scalar> phi(2, 0.0);
            if (basis == "volume") { phi[0] = 1.0 - s; phi[1] = s; }
            else
            {
                //  mass: n_i = w_i / MW_i;  mole: n_i = x_i;  V_i = n_i Vliq_i.
                const scalar f0 = 1.0 - s, f1 = s;
                const scalar n0 = basis == "mass" ? f0 / solvents[0].MW : f0;
                const scalar n1 = basis == "mass" ? f1 / solvents[1].MW : f1;
                const scalar V0 = n0 * solvents[0].Vliq, V1 = n1 * solvents[1].Vliq;
                phi[0] = V0 / (V0 + V1);
                phi[1] = V1 / (V0 + V1);
            }
            Point p = makePoint(phi);
            p.sweep = true;
            p.s = s;
            p.label = k == 0 ? solvents[0].name
                    : k == nPts - 1 ? solvents[1].name
                    : solvents[0].name + "+" + solvents[1].name;
            pts.push_back(std::move(p));
        }
    }
    else
    {
        for (std::size_t i = 0; i < nS; ++i)
        {
            std::vector<scalar> phi(nS, 0.0);
            phi[i] = 1.0;
            Point p = makePoint(phi);
            p.label = solvents[i].name;
            pts.push_back(std::move(p));
        }
    }

    // ---- the table ----------------------------------------------------------
    std::size_t nHom = 0, nTwo = 0, nNot = 0, nPure = 0;
    for (const auto& p : pts)
    {
        if (p.phase == "homogeneous") ++nHom;
        else if (p.phase == "twoPhase") ++nTwo;
        else if (p.phase == "notVerified") ++nNot;
        else ++nPure;
    }
    std::cout << "\n  " << std::left << std::setw(22) << "point";
    if (sweep) std::cout << std::setw(9) << ("s_" + basis);
    for (const auto& s : solvents) std::cout << std::setw(9) << ("phi_" + s.name).substr(0, 8);
    std::cout << std::right << std::setw(8) << "dD" << std::setw(8) << "dP"
              << std::setw(8) << "dH" << std::setw(9) << "Ra";
    if (target.hasR0) std::cout << std::setw(8) << "RED";
    std::cout << "  phase\n  " << std::string(22, ' ') << (sweep ? "         " : "")
              << std::string(9 * nS, ' ') << "   MPa^0.5 MPa^0.5 MPa^0.5  MPa^0.5\n";
    for (const auto& p : pts)
    {
        std::cout << "  " << std::left << std::setw(22) << p.label.substr(0, 21);
        if (sweep) std::cout << std::setw(9) << fmt(p.s, 3);
        for (scalar f : p.phi) std::cout << std::setw(9) << fmt(f, 4);
        std::cout << std::right;
        if (p.phase == "twoPhase")
            std::cout << std::setw(8) << "--" << std::setw(8) << "--"
                      << std::setw(8) << "--" << std::setw(9) << "--";
        else
            std::cout << std::setw(8) << fmt(p.dD / MPA, 2)
                      << std::setw(8) << fmt(p.dP / MPA, 2)
                      << std::setw(8) << fmt(p.dH / MPA, 2)
                      << std::setw(9) << fmt(p.Ra / MPA, 3);
        if (target.hasR0)
            std::cout << std::setw(8) << (p.hasRa ? fmt(p.Ra / target.R0, 3) : "--");
        std::cout << "  " << p.phase;
        if (p.hasTm) std::cout << "  (tm " << std::scientific << std::setprecision(2)
                               << p.tm << std::defaultfloat << ")";
        std::cout << "\n";
    }

    // ---- the minimum ----------------------------------------------------------
    //  Over the points that HAVE an Ra: a refused point is not a candidate.
    const Point* best = nullptr;
    for (const auto& p : pts)
        if (p.hasRa && (!best || p.Ra < best->Ra)) best = &p;
    if (!best)
        refuse("every point was refused as two-phase, so no composition has"
               " an Ra -- the declared pair is not one solvent anywhere"
               " along the line.");
    std::cout << "\n  minimum Ra = " << fmt(best->Ra / MPA, 3) << " MPa^0.5 at "
              << best->label;
    if (sweep)
        std::cout << " (s = " << fmt(best->s, 3) << " " << basis << " fraction of "
                  << solvents[1].name << ", phi_" << solvents[1].name << " = "
                  << fmt(best->phi[1], 4) << ")";
    if (target.hasR0)
        std::cout << ", RED = " << fmt(best->Ra / target.R0, 3)
                  << (best->Ra < target.R0 ? " -- inside the solute's sphere"
                                           : " -- outside the solute's sphere");
    std::cout << "\n";
    if (sweep && best->sweep && best->s > 0 && best->s < 1)
        std::cout << "  The blend is closer to the target than either pure"
                     " solvent (pure " << solvents[0].name << " Ra "
                  << fmt(pts.front().hasRa ? pts.front().Ra / MPA : NAN, 3)
                  << ", pure " << solvents[1].name << " Ra "
                  << fmt(pts.back().hasRa ? pts.back().Ra / MPA : NAN, 3)
                  << " MPa^0.5): the mixture rule lets two solvents each on"
                     " one side of the target\n  meet it between them, which"
                     " is the observation Hansen's placements were checked"
                     " against (thesis, Sections 2.5 and 4.4).\n";
    if (nTwo)
        std::cout << "  " << nTwo << " point(s) REFUSED as `twoPhase`: the"
                     " case's " << checkModel << " model finds the pair as two"
                     " liquids there, and two liquids are not\n  one solvent"
                     " -- no average triple, no Ra and no RED were published"
                     " for them.  A two-phase pair is not useless (it may"
                     " serve an\n  extraction); it is only not a homogeneous"
                     " solvent at that composition.\n";
    if (nNot)
        std::cout << "  " << nNot << " point(s) marked `notVerified`: "
                  << checkReason << ".  Their Ra assumes ONE liquid\n  and"
                     " nothing in this case checked it.\n";
    if (anyAway)
        std::cout << "  NOTE: T = " << fmt(T, 2) << " K is not the parameters'"
                     " reference temperature; they were held constant at Tref"
                     " (an approximation, raised into the caveat block).\n";

    //  SAID EVERY TIME.  A small Ra reads like a solubility to a reader who
    //  is not told otherwise, and the number carries no concentration.
    std::cout << "\n  Ra IS AN AFFINITY, NOT A SOLUBILITY.  In this approach a"
                 " small distance (RED < 1 where R0 is declared) says the\n"
                 "  solvent lies inside the region where this target was"
                 " observed to dissolve or swell -- a compatibility indicator"
                 " fitted\n  to dissolves / does-not-dissolve tests.  No"
                 " saturation concentration (g/L) follows from it, and none"
                 " is published here.\n";

    // ---- diagnostics (published implies pinned) -------------------------------
    diag_["n_points"]       = static_cast<scalar>(pts.size());
    diag_["Ra_min_MPa05"]   = best->Ra / MPA;
    diag_["T_K"]            = T;
    diag_["Tref_target_K"]  = target.Tref;
    diag_["n_homogeneous"]  = static_cast<scalar>(nHom);
    diag_["n_twoPhase"]     = static_cast<scalar>(nTwo);
    diag_["n_notVerified"]  = static_cast<scalar>(nNot);
    diag_["n_pure"]         = static_cast<scalar>(nPure);
    if (target.hasR0)
    {
        diag_["R0_MPa05"] = target.R0 / MPA;
        diag_["RED_min"]  = best->Ra / target.R0;
    }
    if (sweep)
    {
        diag_["s_at_min"]    = best->s;
        diag_["phiB_at_min"] = best->phi[1];
        if (pts.front().hasRa) diag_["Ra_pure_" + solvents[0].name] = pts.front().Ra / MPA;
        if (pts.back().hasRa)  diag_["Ra_pure_" + solvents[1].name] = pts.back().Ra / MPA;
        head_ = { "Ra_min_MPa05", "s_at_min" };
    }
    else
    {
        for (const auto& p : pts)
            if (p.hasRa) diag_["Ra_pure_" + p.label] = p.Ra / MPA;
        head_ = { "Ra_min_MPa05" };
    }

    // ---- the CSV: the machine-readable surface, MPa^0.5 like every compilation
    {
        std::ofstream csv(outFile);
        if (!csv.is_open())
            refuse("cannot open output file '" + outFile + "'");
        csv << "point,label,s_declared,basis";
        for (const auto& s : solvents) csv << ",phi_" << s.name;
        csv << ",dD_mix_MPa05,dP_mix_MPa05,dH_mix_MPa05,fd,fp,fh,Ra_MPa05,RED,phase,tm"
               ",fd_target,fp_target,fh_target\n";
        //  The target's own Teas point, repeated on every row so a reader of
        //  the CSV (the GUI draws the triangle from this file alone) has the
        //  corner to measure the path against without computing it.
        const scalar tsum = target.dD + target.dP + target.dH;
        const scalar fdT = tsum > 0 ? target.dD / tsum : 0.0,
                     fpT = tsum > 0 ? target.dP / tsum : 0.0,
                     fhT = tsum > 0 ? target.dH / tsum : 0.0;
        csv << std::setprecision(10);
        for (std::size_t k = 0; k < pts.size(); ++k)
        {
            const Point& p = pts[k];
            csv << k << ',' << p.label << ',';
            if (p.sweep) csv << p.s;
            csv << ',' << (sweep ? basis : "pure");
            for (scalar f : p.phi) csv << ',' << f;
            if (p.phase == "twoPhase")
                csv << ",,,,,,,,";
            else
            {
                const scalar sum = p.dD + p.dP + p.dH;
                csv << ',' << p.dD / MPA << ',' << p.dP / MPA << ',' << p.dH / MPA
                    << ',' << (sum > 0 ? p.dD / sum : 0.0)
                    << ',' << (sum > 0 ? p.dP / sum : 0.0)
                    << ',' << (sum > 0 ? p.dH / sum : 0.0)
                    << ',' << p.Ra / MPA << ',';
                if (target.hasR0) csv << p.Ra / target.R0;
            }
            csv << ',' << p.phase << ',';
            if (p.hasTm) csv << p.tm;
            csv << ',' << fdT << ',' << fpT << ',' << fhT << '\n';
        }
    }

    // ---- the result block -------------------------------------------------------
    {
        std::ostringstream j;
        j << "{ \"op\": " << jstr(opName)
          << ", \"target\": { \"name\": " << jstr(targetName)
          << ", \"dD_Pa05\": " << jnum(target.dD) << ", \"dP_Pa05\": " << jnum(target.dP)
          << ", \"dH_Pa05\": " << jnum(target.dH) << ", \"Tref_K\": " << jnum(target.Tref)
          << ", \"R0_Pa05\": " << (target.hasR0 ? jnum(target.R0) : "null") << " }"
          << ", \"solvents\": [";
        for (std::size_t i = 0; i < nS; ++i)
        {
            const auto& s = solvents[i];
            j << (i ? ", " : "") << "{ \"name\": " << jstr(s.name)
              << ", \"dD_Pa05\": " << jnum(s.dD) << ", \"dP_Pa05\": " << jnum(s.dP)
              << ", \"dH_Pa05\": " << jnum(s.dH) << ", \"Tref_K\": " << jnum(s.Tref)
              << ", \"Vliq_m3_per_mol\": " << jnum(s.Vliq) << ", \"MW\": " << jnum(s.MW)
              << " }";
        }
        j << "], \"mode\": " << jstr(sweep ? "sweep" : "screen")
          << ", \"basis\": " << jstr(sweep ? basis : "pure")
          << ", \"T_K\": " << jnum(T) << ", \"P_Pa\": " << jnum(P)
          << ", \"parametersHeldAtTref\": true"
          << ", \"phaseCheck\": { \"model\": " << jstr(checkModel)
          << ", \"verified\": " << (canCheck ? "true" : "false")
          << ", \"reason\": " << jstr(canCheck ? "Michelsen tangent-plane distance"
                                                 " on the first declared liquid" : checkReason)
          << " }, \"approximations\": ["
             "\"mixture rule: volume-fraction average of each parameter (no excess"
             " volume, each solvent keeps its own split)\", "
             "\"parameters held constant at each record's Tref; no temperature"
             " correction; T decides the phase check only\", "
             "\"mass and mole bases converted to volume fractions through the"
             " records' Vliq (25 C) and MW, ideal mixing volume\", "
             "\"Ra is a compatibility indicator, never a saturation concentration\"]"
          << ", \"csv\": " << jstr(outFile)
          << ", \"minimum\": { \"label\": " << jstr(best->label)
          << ", \"Ra_Pa05\": " << jnum(best->Ra)
          << ", \"RED\": " << (target.hasR0 ? jnum(best->Ra / target.R0) : "null")
          << ", \"s\": " << (best->sweep ? jnum(best->s) : "null") << " }"
          << ", \"points\": [";
        for (std::size_t k = 0; k < pts.size(); ++k)
        {
            const Point& p = pts[k];
            j << (k ? ",\n        " : "\n        ") << "{ \"label\": " << jstr(p.label)
              << ", \"s\": " << (p.sweep ? jnum(p.s) : "null") << ", \"phi\": [";
            for (std::size_t i = 0; i < nS; ++i) j << (i ? ", " : "") << jnum(p.phi[i]);
            j << "], \"phase\": " << jstr(p.phase);
            if (p.phase != "twoPhase")
                j << ", \"dD_Pa05\": " << jnum(p.dD) << ", \"dP_Pa05\": " << jnum(p.dP)
                  << ", \"dH_Pa05\": " << jnum(p.dH) << ", \"Ra_Pa05\": " << jnum(p.Ra)
                  << ", \"RED\": " << (target.hasR0 ? jnum(p.Ra / target.R0) : "null");
            if (p.hasTm) j << ", \"tm\": " << jnum(p.tm);
            j << " }";
        }
        j << "\n      ] }";
        block_ = j.str();
    }

    (void)verbosity;
    return 0;
}

} // namespace Choupo
