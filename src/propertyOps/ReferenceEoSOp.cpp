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

#include "ReferenceEoSOp.H"

#include "core/Dimensions.H"
#include "thermo/RecordResolver.H"
#include "thermo/equationOfState/ReferenceFluid.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <algorithm>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {

using helmholtz::ReferenceFluid;
using helmholtz::State;

namespace {

// The equation, its primary, its window and its check values: once per
// equation per run (N identical paragraphs teach nothing).
void announceOnce(const ReferenceFluid& f, int verbosity)
{
    static std::set<std::string> done;
    if (!done.insert(f.equation()).second) return;
    const auto checks = f.verify();
    std::size_t ok = 0;
    double worst = 0.0;
    for (const auto& c : checks) { ok += c.ok; worst = std::max(worst, c.relDev); }
    std::ostringstream os;
    os << "[referenceEoS] " << f.equation() << " -- reference equation of state of "
       << f.fluid() << " (" << f.alpha().nResidualTerms() << " residual terms)\n"
       << "[referenceEoS]   primary: " << f.citation() << "\n"
       << "[referenceEoS]   record:  " << f.recordPath() << "\n"
       << "[referenceEoS]   window:  " << f.windowSentence() << "\n"
       << "[referenceEoS]   uncertainty: " << f.uncertainty() << "\n"
       << "[referenceEoS]   check values of the publication reproduced at the "
          "printed precision: " << ok << " / " << checks.size()
       << " (worst relative deviation " << std::scientific << std::setprecision(2)
       << worst << ")\n";
    if (verbosity >= 3)
    {
        os << std::defaultfloat;
        for (const auto& c : checks)
            os << "[referenceEoS]     " << (c.ok ? "ok  " : "FAIL") << "  "
               << c.table << "  " << c.label << ": published "
               << std::setprecision(10) << c.published << ", computed "
               << std::setprecision(12) << c.computed
               << " (digits " << c.digits << ", tolerance " << std::setprecision(4)
               << c.tolerance << ", conditioning " << c.conditioning << ")\n";
    }
    std::cout << os.str();
}

void printState(std::ostream& os, const State& s)
{
    os << std::setprecision(10)
       << "    rho = " << s.rho << " kg/m3      p  = " << s.p << " Pa\n"
       << "    h   = " << s.h   << " J/kg       u  = " << s.u << " J/kg\n"
       << "    s   = " << s.s   << " J/(kg K)   g  = " << s.g << " J/kg\n"
       << "    cp  = " << s.cp  << " J/(kg K)   cv = " << s.cv << " J/(kg K)\n"
       << "    w   = " << s.w   << " m/s        phi = " << std::exp(s.lnPhi)
       << " (fugacity coefficient)\n";
}

// The glass box: each term of alpha and what it contributes.
void printTerms(std::ostream& os, const ReferenceFluid& f, const State& s)
{
    os << "    reduced state: delta = rho/rho_c = " << std::setprecision(10)
       << s.delta << ", tau = T_c/T = " << s.tau << "\n"
       << "    term-by-term (alpha, delta*alpha_d, tau*alpha_t):\n"
       << "      ideal  ln(delta)" << std::setw(24) << std::log(s.delta) << "\n";
    // numbered as the publication numbers them: the ideal and the
    // residual terms each from 1, in the record's order
    int ki = 0, kr = 0;
    for (const auto& g : f.alpha().groups())
        for (std::size_t i = 0; i < g.size(); ++i)
        {
            const helmholtz::Derivs d = g.term(i, s.delta, s.tau);
            os << "      " << (g.ideal ? "ideal  " : "resid  ")
               << std::left << std::setw(15) << g.type << std::right
               << " #" << std::setw(2) << (g.ideal ? ++ki : ++kr)
               << std::scientific << std::setprecision(6)
               << std::setw(16) << d.a << std::setw(16) << s.delta * d.a_d
               << std::setw(16) << s.tau * d.a_t << std::defaultfloat << "\n";
        }
    os << "    sums: alpha0 = " << std::setprecision(10) << s.a0.a
       << ", alphar = " << s.ar.a << ", delta*alphar_d = " << s.delta * s.ar.a_d
       << " (so p/(rho R T) = " << 1.0 + s.delta * s.ar.a_d << ")\n";
}

void putState(std::map<std::string, scalar>& d, const std::string& pre, const State& s)
{
    d[pre + "rho"] = s.rho; d[pre + "p"] = s.p;  d[pre + "h"] = s.h;
    d[pre + "u"]   = s.u;   d[pre + "s"] = s.s;  d[pre + "g"] = s.g;
    d[pre + "cp"]  = s.cp;  d[pre + "cv"] = s.cv; d[pre + "w"] = s.w;
    d[pre + "phi"] = std::exp(s.lnPhi);
}

} // namespace

std::string ReferenceEoSOp::diagnosticUnit(const std::string& key) const
{
    static const std::map<std::string, std::string> u = {
        { "T", "K" }, { "rho", "kg/m3" }, { "p", "Pa" }, { "psat", "Pa" },
        { "h", "J/kg" }, { "u", "J/kg" }, { "g", "J/kg" }, { "hL", "J/kg" },
        { "hV", "J/kg" }, { "hLV", "J/kg" }, { "s", "J/(kg K)" }, { "sL", "J/(kg K)" },
        { "sV", "J/(kg K)" }, { "cp", "J/(kg K)" }, { "cv", "J/(kg K)" },
        { "w", "m/s" }, { "phi", "-" }, { "rhoL", "kg/m3" }, { "rhoV", "kg/m3" },
        { "checkValues", "-" }, { "checksReproduced", "-" },
        { "worstCheckRelDev", "-" }, { "nRoots", "-" } };
    const auto it = u.find(key);
    return it == u.end() ? "" : it->second;
}

int ReferenceEoSOp::run(const DictPtr& dict, const ThermoPackage& /*thermo*/,
                        int verbosity)
{
    diag_.clear();
    const std::string eq = dict->lookupWord("equation");
    const ReferenceFluid& f = ReferenceFluid::load(eq);
    announceOnce(f, verbosity);

    const auto checks = f.verify();
    std::size_t ok = 0; double worst = 0.0;
    for (const auto& c : checks) { ok += c.ok; worst = std::max(worst, c.relDev); }
    diag_["checkValues"] = scalar(checks.size());
    diag_["checksReproduced"] = scalar(ok);
    diag_["worstCheckRelDev"] = worst;

    const bool hasState = dict->found("state");
    const bool hasSat   = dict->found("saturation");
    if (hasState == hasSat)
        throw std::runtime_error("referenceEoS: give exactly ONE mode block -- "
            "state { T ...; p ...; } | state { T ...; rho ...; } | "
            "saturation { T ...; }");

    std::ostringstream os;
    std::string csvHead, csvRow;
    if (hasSat)
    {
        const DictPtr sd = dict->subDict("saturation");
        const scalar T = sd->lookupScalar("T", Dims::temperature);
        f.announceIfOutside(T, 0.0);
        const helmholtz::Saturation s = f.saturation(T);
        diag_["T"] = T;
        diag_["psat"] = s.psat;
        diag_["rhoL"] = s.rhoL; diag_["rhoV"] = s.rhoV;
        diag_["hL"] = s.liquid.h; diag_["hV"] = s.vapour.h;
        diag_["sL"] = s.liquid.s; diag_["sV"] = s.vapour.s;
        diag_["hLV"] = s.vapour.h - s.liquid.h;
        if (verbosity >= 2)
        {
            os << "referenceEoS: " << eq << " saturation at T = "
               << std::setprecision(10) << T << " K by the Maxwell criterion "
                  "(equal p and g; " << s.iterations << " Newton steps on p "
                  "inside the spinodal bracket)\n"
               << "    psat = " << s.psat << " Pa\n"
               << "  saturated liquid:\n";
            printState(os, s.liquid);
            os << "  saturated vapour:\n";
            printState(os, s.vapour);
            os << "    hLV  = " << s.vapour.h - s.liquid.h << " J/kg\n";
            if (verbosity >= 3) { os << "  liquid "; printTerms(os, f, s.liquid);
                                  os << "  vapour "; printTerms(os, f, s.vapour); }
        }
        csvHead = "T,psat,rhoL,rhoV,hL,hV,sL,sV";
        std::ostringstream r;
        r << std::scientific << std::setprecision(12) << T << "," << s.psat << ","
          << s.rhoL << "," << s.rhoV << "," << s.liquid.h << "," << s.vapour.h
          << "," << s.liquid.s << "," << s.vapour.s;
        csvRow = r.str();
    }
    else
    {
        const DictPtr sd = dict->subDict("state");
        const scalar T = sd->lookupScalar("T", Dims::temperature);
        const bool hasP = sd->found("p"), hasRho = sd->found("rho");
        if (hasP == hasRho)
            throw std::runtime_error("referenceEoS.state: give exactly ONE of "
                "p (the density is then solved) or rho (the variable the "
                "equation is written in) beside T");
        scalar rho = 0.0;
        if (hasRho)
        {
            if (sd->found("branch"))
                throw std::runtime_error("referenceEoS.state: `branch` names a "
                    "root of (T, p); a (T, rho) state has no root to choose");
            rho = sd->lookupScalar("rho", Dims::density);
        }
        else
        {
            const scalar p = sd->lookupScalar("p", Dims::pressure);
            f.announceIfOutside(T, p);
            int unstable = 0;
            const auto rs = f.roots(T, p, &unstable);
            diag_["nRoots"] = scalar(rs.size());
            if (verbosity >= 2)
            {
                os << "referenceEoS: " << eq << " at T = " << std::setprecision(10)
                   << T << " K, p = " << p << " Pa -- the isotherm has "
                   << rs.size() << " density root(s):\n";
                for (const auto& r : rs)
                    os << "    rho = " << r.rho << " kg/m3 (" << r.branch << "), "
                       << (r.mechanicallyStable ? "mechanically stable"
                                                : "mechanically UNSTABLE")
                       << ", g = " << r.g << " J/kg\n";
                if (unstable > 0)
                    os << "    (the equation also crosses this pressure " << unstable
                       << " time(s) between the spinodals -- the unstable "
                          "region, where its terms are not fitted to anything; "
                          "those crossings are not states)\n";
            }
            std::string why;
            if (sd->found("branch"))
            {
                const std::string b = sd->lookupWord("branch");
                if (b != "liquid" && b != "vapour")
                    throw std::runtime_error("referenceEoS.state: branch '" + b
                        + "' -- Accepted: liquid, vapour");
                rho = f.densityOnBranch(T, p, b == "liquid");
                why = "the " + b + " branch, as DECLARED (it may be metastable)";
            }
            else
            {
                std::string branch;
                rho = f.density(T, p, &branch);
                why = "the stable root (lowest Gibbs energy; " + branch + ")";
            }
            if (verbosity >= 2) os << "  taken: " << why << "\n";
        }
        const State s = f.at(T, rho);
        if (hasRho) f.announceIfOutside(T, s.p);
        diag_["T"] = T;
        putState(diag_, "", s);
        if (verbosity >= 2)
        {
            if (hasRho)
                os << "referenceEoS: " << eq << " at T = " << std::setprecision(10)
                   << T << " K, rho = " << rho << " kg/m3\n";
            printState(os, s);
            if (verbosity >= 3) printTerms(os, f, s);
        }
        csvHead = "T,rho,p,h,u,s,g,cp,cv,w,phi";
        std::ostringstream r;
        r << std::scientific << std::setprecision(12) << T << "," << s.rho << ","
          << s.p << "," << s.h << "," << s.u << "," << s.s << "," << s.g << ","
          << s.cp << "," << s.cv << "," << s.w << "," << std::exp(s.lnPhi);
        csvRow = r.str();
    }
    std::cout << os.str();

    if (dict->found("output"))
    {
        const std::string file = dict->subDict("output")->lookupWord("file");
        records::refuseStandardsWrite("referenceEoS", "file", file);
        std::ofstream csv(file);
        if (!csv.is_open())
            throw std::runtime_error("referenceEoS: cannot open output file '"
                                     + file + "'");
        csv << csvHead << "\n" << csvRow << "\n";
    }
    return 0;
}

} // namespace Choupo
