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

#include "SolubilityParameter.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

//  A substance's derived Hildebrand parameter, plus everything a reader needs
//  to see WHERE it came from.  Kept together deliberately: a delta printed
//  without its latent heat and molar volume is a number nobody can check.
struct Derived
{
    std::string name;
    scalar      dHvap = 0;      // J/mol at T
    scalar      Vm    = 0;      // m3/mol
    scalar      delta = 0;      // Pa^0.5
    scalar      ref   = 0;      // the record's declared value, 0 if none
    bool        hasRef = false;
};

std::string fmt(scalar v, int prec = 4)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(prec) << v;
    return os.str();
}

} // namespace


int SolubilityParameter::run(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    diag_.clear();

    //  THE TEMPERATURE IS PART OF THE ANSWER, not a detail.  Cohesive energy
    //  density falls as a liquid approaches its critical point -- delta goes
    //  to ZERO at Tc, because there is no longer a liquid to pull apart.  A
    //  table of deltas with no temperature beside it is a table of numbers
    //  from unrelated states, so the default is stated and announced rather
    //  than assumed: 25 C, which is what every published compilation uses.
    const scalar T = dict->lookupScalarOrDefault("T", 298.15);
    const bool   Tdefaulted = !dict->found("T");

    if (verbosity >= 2)
    {
        std::cout << "\n  [solubilityParameter]  delta = sqrt( (dHvap(T) - R T)"
                     " / V_m )   at T = " << fmt(T, 2) << " K"
                  << (Tdefaulted ? "   (DEFAULTED -- 25 C, the reference"
                                   " temperature of the published"
                                   " compilations)" : "") << "\n"
                     "                         Hildebrand (1950); the latent"
                     " heat is Component::Hvap_latent, the Watson correlation\n"
                     "                         the enthalpy legs already use"
                     " -- not a second copy of it.\n\n";
    }

    std::vector<Derived> out;
    std::vector<std::string> refused;

    for (const auto& c : thermo.components())
    {
        //  EACH REFUSAL NAMES ITS OWN DATUM.  A component missing one of the
        //  three cannot be given a delta from the other two plus a guess: the
        //  result would be indistinguishable, in the output, from one that
        //  rests on three real numbers.
        if (c.Tc() <= 0)
        {
            refused.push_back(c.name() + ": no critical temperature (Tc) --"
                              " the Watson correlation needs it");
            continue;
        }
        if (c.Hvap_Tb() <= 0)
        {
            refused.push_back(c.name() + ": no latent heat at the normal"
                              " boiling point (HvapTb) -- there is no cohesive"
                              " energy to take the square root of");
            continue;
        }
        if (c.Vliq() <= 0)
        {
            refused.push_back(c.name() + ": no liquid molar volume (Vliq) --"
                              " a cohesive energy DENSITY needs a volume");
            continue;
        }
        if (T >= c.Tc())
        {
            refused.push_back(c.name() + ": T = " + fmt(T, 2) + " K is at or"
                              " above its critical temperature ("
                              + fmt(c.Tc(), 2) + " K) -- there is no liquid"
                              " there, and delta is not defined");
            continue;
        }

        Derived d;
        d.name  = c.name();
        d.dHvap = c.Hvap_latent(T);              // J/mol, Watson
        d.Vm    = c.Vliq();                      // m3/mol at 25 C

        //  R T is the vaporisation work against the surroundings: what is
        //  left after subtracting it is the ENERGY OF VAPORISATION, which is
        //  the cohesive energy.  Dropping the term is the commonest way to
        //  get a delta that is a few per cent high and looks fine.
        const scalar eCoh = d.dHvap - constant::R * T;
        if (eCoh <= 0)
        {
            refused.push_back(c.name() + ": the cohesive energy dHvap - R T is"
                              " not positive at " + fmt(T, 2) + " K --"
                              " the record's latent heat cannot be right there");
            continue;
        }
        d.delta = std::sqrt(eCoh / d.Vm);        // sqrt(J/m3) = Pa^0.5

        //  The record's own declared value, when it has one.  NOT used in the
        //  derivation -- only compared against it.
        if (c.hasSolubilityParameter())
        {
            d.ref    = c.solubilityParameter();
            d.hasRef = true;
        }
        out.push_back(d);
    }

    if (out.empty())
    {
        std::cout << "  [solubilityParameter] REFUSED: no component in this"
                     " case carries the three data a Hildebrand parameter is"
                     " derived from.\n";
        for (const auto& r : refused) std::cout << "      - " << r << "\n";
        throw std::runtime_error(
            "solubilityParameter: not one component could be priced."
            "  Each needs Tc, HvapTb and Vliq; the list above says which is"
            " missing where.");
    }

    // ---- the per-substance table ------------------------------------------
    std::cout << "  substance            dHvap(T)      V_m       delta"
                 "      published    dev\n"
                 "                         J/mol    cm3/mol     MPa^0.5"
                 "     MPa^0.5\n"
                 "  ----------------------------------------------------"
                 "----------------------\n";
    scalar worstDev = 0;
    std::size_t nChecked = 0;
    for (const auto& d : out)
    {
        //  MPa^0.5 is the unit every compilation prints, and 1 MPa^0.5 =
        //  1000 Pa^0.5.  Choupo works in SI; the REPORT converts, and the
        //  header says so, because a delta quoted in the wrong one is off by
        //  a factor of 31.6 and still looks like a solubility parameter.
        std::cout << "  " << std::left << std::setw(20) << d.name << std::right
                  << std::setw(10) << fmt(d.dHvap, 0)
                  << std::setw(10) << fmt(d.Vm * 1.0e6, 2)
                  << std::setw(12) << fmt(d.delta / 1.0e3, 4);
        if (d.hasRef)
        {
            const scalar dev = std::fabs(d.delta - d.ref) / d.ref;
            worstDev = std::max(worstDev, dev);
            ++nChecked;
            std::cout << std::setw(12) << fmt(d.ref / 1.0e3, 4)
                      << std::setw(9) << fmt(dev * 100.0, 2) + " %";
            diag_["dev_" + d.name] = dev;
        }
        else
        {
            std::cout << std::setw(12) << "--" << std::setw(9) << "--";
        }
        std::cout << "\n";
        diag_["delta_" + d.name] = d.delta;
    }

    if (nChecked)
    {
        std::cout << "\n  " << nChecked << " of " << out.size()
                  << " carry an independently published delta; worst"
                     " deviation " << fmt(worstDev * 100.0, 2) << " %."
                     "  That column is a CHECK ON THE DERIVATION, not an"
                     " input to it.\n";
        diag_["dev_worst"] = worstDev;
        diag_["n_checked"] = static_cast<scalar>(nChecked);
    }
    else
    {
        std::cout << "\n  No component here declares a published delta, so"
                     " nothing checks this derivation.  The arithmetic is"
                     " visible above; its agreement with a compilation is"
                     " not established for these substances.\n";
    }
    diag_["n_derived"] = static_cast<scalar>(out.size());

    //  OPTIONAL CSV.  The console table is the glass-box surface; this is the
    //  machine-readable one, and the GUI's Explore panel is its consumer.
    //  MPa^0.5 in the file as well as on screen, because that is the unit
    //  every compilation prints and a reader comparing the two must not have
    //  to convert.  `published` and `dev` are EMPTY where no anchor exists --
    //  an empty cell says "nothing checks this", which a 0 would not.
    if (dict->found("output"))
    {
        const std::string file = dict->subDict("output")->lookupWord("file");
        std::ofstream csv(file);
        if (!csv.is_open())
            throw std::runtime_error("solubilityParameter: cannot open output"
                                     " file '" + file + "'");
        csv << "substance,delta_MPa05,dHvap_J_per_mol,Vm_cm3_per_mol,"
               "published_MPa05,dev_pct\n";
        for (const auto& d : out)
        {
            csv << d.name << ',' << d.delta / 1.0e3 << ',' << d.dHvap << ','
                << d.Vm * 1.0e6 << ',';
            if (d.hasRef)
                csv << d.ref / 1.0e3 << ','
                    << std::fabs(d.delta - d.ref) / d.ref * 100.0;
            else
                csv << ',';
            csv << '\n';
        }
    }

    // ---- the pairwise table, which is what the question actually is -------
    if (out.size() >= 2)
    {
        std::cout << "\n  PAIRWISE |delta_i - delta_j|, MPa^0.5 -- the smaller,"
                     " the more likely to mix\n\n      ";
        for (const auto& d : out)
            std::cout << std::setw(11) << d.name.substr(0, 10);
        std::cout << "\n";
        for (const auto& a : out)
        {
            std::cout << "  " << std::left << std::setw(12)
                      << a.name.substr(0, 11) << std::right;
            for (const auto& b : out)
                std::cout << std::setw(11)
                          << fmt(std::fabs(a.delta - b.delta) / 1.0e3, 2);
            std::cout << "\n";
        }
        //  The widest and narrowest gaps, so the table has a headline that is
        //  recomputed rather than eyeballed.
        scalar lo = 1e30, hi = 0;
        std::string loPair, hiPair;
        for (std::size_t i = 0; i < out.size(); ++i)
            for (std::size_t j = i + 1; j < out.size(); ++j)
            {
                const scalar g = std::fabs(out[i].delta - out[j].delta) / 1.0e3;
                if (g < lo) { lo = g; loPair = out[i].name + "/" + out[j].name; }
                if (g > hi) { hi = g; hiPair = out[i].name + "/" + out[j].name; }
            }
        std::cout << "\n  closest  " << loPair << "  " << fmt(lo, 2)
                  << " MPa^0.5      widest  " << hiPair << "  " << fmt(hi, 2)
                  << " MPa^0.5\n";
        diag_["gap_min"] = lo;
        diag_["gap_max"] = hi;
    }

    // ---- what one number cannot say ---------------------------------------
    //  PRINTED ALWAYS, not only when it goes wrong.  A single-parameter theory
    //  that is right most of the time is exactly the kind that gets trusted
    //  where it is wrong, and the failure is silent: two liquids with equal
    //  delta that do not mix produce a confident, wrong recommendation.
    std::cout << "\n  HILDEBRAND IS ONE NUMBER, and it carries no hydrogen"
                 " bonding.  It cannot tell a\n"
                 "  polar solvent from a hydrogen-bonding one of the same"
                 " cohesive energy density,\n"
                 "  so a close pair here is a CANDIDATE and never a verdict."
                 "  The three-parameter\n"
                 "  Hansen split is what that needs; it is not implemented"
                 " -- its parameters are a\n"
                 "  separate dataset this repository does not hold.\n";

    if (!refused.empty())
    {
        std::cout << "\n  NOT PRICED (" << refused.size() << "), each naming"
                     " its own missing datum:\n";
        for (const auto& r : refused) std::cout << "      - " << r << "\n";
    }

    (void)verbosity;
    return 0;
}

} // namespace Choupo
