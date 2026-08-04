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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
\*---------------------------------------------------------------------------*/

#include "EdwardsCatalogue.H"

#include "thermo/RecordResolver.H"

#include "core/Advisory.H"

#include <cmath>
#include <iomanip>
#include <map>
#include <optional>
#include <stdexcept>
#include <iostream>
#include <ostream>
#include <sstream>

namespace Choupo {
namespace electrolyte {

namespace fs = std::filesystem;

namespace {

//  Eq 24 (Pitzer & Mayorga), the ONLY route to a beta1 in this model.  It is a
//  correlation of beta0, never an independent datum -- which is exactly what
//  makes the multisolute calculation tractable at all.
constexpr double kEq24Intercept = 0.018;
constexpr double kEq24Slope     = 3.06;

double eq24Beta1(double beta0)
{
    return kEq24Intercept + kEq24Slope * beta0;
}

//  Read one record under parameters/EdwardsPitzer/, or nullptr when the
//  catalogue does not carry it.  Absence is a legitimate answer here: the
//  paper tabulates a minority of the pairs and estimates the rest.
const DictPtr* record(const std::string& stem)
{
    static std::map<std::string, DictPtr> cache;
    auto it = cache.find(stem);
    if (it == cache.end())
    {
        const fs::path p = records::resolveRecord(
            "parameters/EdwardsPitzer/" + stem + ".dat");
        DictPtr d = (!p.empty() && fs::exists(p))
                  ? Dictionary::fromFile(p.string()) : nullptr;
        it = cache.emplace(stem, std::move(d)).first;
    }
    return it->second ? &it->second : nullptr;
}

//  VALIDITY, checked where the record is READ.  Most of these records carry a
//  `Trange ( Tlo Thi )` copied from the table they came from, and a range
//  nobody checks is decoration.  Evaluating outside it is ANNOUNCED and the run
//  continues -- the professor extrapolates on purpose, but knows he did.  This
//  is the PitzerActivity pattern, and the same reason its silence band was
//  narrowed: a quotable number with no caveat is the failure mode.
void checkTrange(const DictPtr& d, const std::string& stem, double T)
{
    if (!d->found("Trange")) return;
    const auto r = d->lookupList("Trange");
    if (r.size() < 2 || (T >= r[0] && T <= r[1])) return;
    std::ostringstream msg;
    msg << "EdwardsPitzer parameter " << stem << " evaluated at T = "
        << std::fixed << std::setprecision(2) << T << " K, outside its declared"
        << " validity " << r[0] << "-" << r[1] << " K -- extrapolated";
    if (AdvisoryLog::instance().add("model", "warning",
                                    "edwardsPitzer", msg.str()))
        std::cout << "  [advisory] " << msg.str() << "\n";
}

//  Eq 14: the measured molecular self-interaction, beta0_aa = E + F/T.
//  T IS KELVIN -- see the mi-* record headers for the paper's own arithmetic
//  settling that, which cost a transcription error to establish.
std::optional<double> beta0MoleculeSelf(const std::string& m, double T)
{
    const DictPtr* d = record(m);
    if (!d) return std::nullopt;
    checkTrange(*d, m, T);
    auto par = (*d)->subDict("parameters");
    return par->lookupScalar("E") + par->lookupScalar("F") / T;
}

//  Table 5: the single-ion contribution feeding Bromley's Eq 22.
std::optional<double> beta0IonSingle(const std::string& ion)
{
    const DictPtr* d = record("ion-" + ion);
    if (!d) return std::nullopt;
    return (*d)->subDict("parameters")->lookupScalar("beta0_ion");
}

//  Table 6: the tabulated molecule-ion term, where the paper has one.
//
//  TWO FORMS, because Table 6 has two.  Most entries are a single
//  T-independent number; the rest are the quadratic beta0 = a0 + a1 T + a2 T^2,
//  T in KELVIN.  (The kelvin reading is not a guess: the paper settles it
//  itself in Table 7's column II, whose published beta0(NH3,NH4+) = 0.051
//  evaluates to 0.0504 in kelvin and 0.0582 in Celsius.  The "0 to 170 degC"
//  in the table's heading is the range of VALIDITY, exactly as in Tables 1
//  and 3.  Each record's header carries that arithmetic.)
//
//  A record carrying NEITHER form is a broken record, and says so by name
//  rather than being read as an absent pair -- an absent pair is estimated by
//  Eq 23, which would silently paper over a typo in the catalogue.
std::optional<double> beta0MoleculeIonTabulated(const std::string& m,
                                                const std::string& ion,
                                                double T)
{
    const DictPtr* d = record("mi-" + m + "-" + ion);
    if (!d) return std::nullopt;
    checkTrange(*d, "mi-" + m + "-" + ion, T);
    auto par = (*d)->subDict("parameters");
    if (par->found("beta0")) return par->lookupScalar("beta0");
    if (par->found("a0"))
        return par->lookupScalar("a0")
             + par->lookupScalar("a1") * T
             + par->lookupScalar("a2") * T * T;
    throw std::runtime_error(
        "parameters/EdwardsPitzer/mi-" + m + "-" + ion + ".dat declares neither"
        " `beta0` (the T-independent form) nor `a0`/`a1`/`a2` (the quadratic"
        " form) -- Table 6 has both and a record must be one of them.");
}

} // namespace

EdwardsParameters assembleEdwardsParameters(const std::vector<std::string>& names,
                                            const std::vector<double>& charges,
                                            double T,
                                            std::ostream* announce)
{
    EdwardsParameters p;
    p.source = "Edwards, Maurer, Newman & Prausnitz, AIChE J. 24(6):966-976 "
               "(1978), Tables 4-6 + the Eq 21/22/23/24 estimation rules";

    const std::size_t n = names.size();
    std::vector<std::string> unreached;

    //  The measured molecular self-terms first: Eqs 21 and 23 are written in
    //  terms of them, so they must exist before any pair that borrows one.
    std::map<std::string, double> selfBeta0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (charges[i] != 0.0) continue;
        if (auto b = beta0MoleculeSelf(names[i], T)) selfBeta0[names[i]] = *b;
    }

    std::map<std::string, double> singleIon;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (charges[i] == 0.0) continue;
        if (auto b = beta0IonSingle(names[i])) singleIon[names[i]] = *b;
    }

    auto note = [&](const std::string& a, const std::string& b,
                    const char* rule, double b0, double b1)
    {
        if (!announce) return;
        *announce << "      " << std::setw(10) << a << " - " << std::setw(10) << b
                  << "   beta0 = " << std::setw(11) << std::setprecision(6)
                  << std::fixed << b0
                  << "   beta1 = " << std::setw(11) << b1
                  << "   [" << rule << "]\n";
    };

    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = i; j < n; ++j)
        {
            const std::string& a = names[i];
            const std::string& b = names[j];
            const bool aIon = (charges[i] != 0.0);
            const bool bIon = (charges[j] != 0.0);

            std::optional<double> b0;
            std::optional<double> b1;
            const char* rule = nullptr;

            if (!aIon && !bIon)
            {
                if (i == j)
                {
                    //  Eq 14 -- the only MEASURED family in the whole matrix.
                    if (auto s = selfBeta0.find(a); s != selfBeta0.end())
                    { b0 = s->second; rule = "Eq 14, measured"; }
                }
                else
                {
                    //  Eq 21 -- unlike molecules, the mean of the two like terms.
                    auto sa = selfBeta0.find(a), sb = selfBeta0.find(b);
                    if (sa != selfBeta0.end() && sb != selfBeta0.end())
                    { b0 = 0.5 * (sa->second + sb->second); rule = "Eq 21, estimated"; }
                }
                b1 = 0.0;                       // molecular pair: the paper's rule
            }
            else if (aIon && bIon)
            {
                if (charges[i] * charges[j] > 0.0)
                {
                    //  Bronsted 1922/1923.  A STATED assumption, not an absence:
                    //  it is written into the set so the announcement shows it
                    //  was applied rather than leaving the reader to infer a gap.
                    b0 = 0.0; b1 = 0.0; rule = "Bronsted, like signs -> 0";
                }
                else
                {
                    //  Eq 22 (Bromley 1972), then Eq 24 for beta1.
                    auto sa = singleIon.find(a), sb = singleIon.find(b);
                    if (sa != singleIon.end() && sb != singleIon.end())
                    {
                        b0 = sa->second + sb->second;
                        b1 = eq24Beta1(*b0);
                        rule = "Eq 22 + Eq 24, estimated";
                    }
                }
            }
            else
            {
                const std::string& mol = aIon ? b : a;
                const std::string& ion = aIon ? a : b;
                if (auto tab = beta0MoleculeIonTabulated(mol, ion, T))
                { b0 = *tab; rule = "Table 6, tabulated"; }
                else
                {
                    //  Eq 23 (Edwards et al. 1975): molecule + ion contributions.
                    auto sm = selfBeta0.find(mol), si = singleIon.find(ion);
                    if (sm != selfBeta0.end() && si != singleIon.end())
                    { b0 = sm->second + si->second; rule = "Eq 23, estimated"; }
                }
                b1 = 0.0;                       // any pair with a molecule
            }

            if (!b0)
            {
                //  No rule reached it.  Eq 8 reads an absent pair as zero -- the
                //  paper's own default -- but the reader is TOLD, because an
                //  unreached pair and a measured zero are not the same fact.
                unreached.push_back(a + "-" + b);
                continue;
            }

            const auto key = EdwardsParameters::key(a, b);
            p.b0[key] = *b0;
            p.b1[key] = b1.value_or(0.0);
            note(a, b, rule, *b0, b1.value_or(0.0));
        }

    if (announce && !unreached.empty())
    {
        *announce << "      no rule reaches " << unreached.size()
                  << " pair(s); Eq 8 reads them as zero:";
        for (const auto& u : unreached) *announce << " " << u;
        *announce << "\n";
    }
    return p;
}

const std::string& EdwardsPitzerModel::modelName() const
{
    static const std::string n = "edwardsPitzer";
    return n;
}

const std::string& EdwardsPitzerModel::pHScale() const
{
    //  Delegated to the kernel so the two can never state different
    //  conventions for the same numbers.
    static const EdwardsPitzer probe{EdwardsParameters{}};
    return probe.pHScale();
}

ActivityResult EdwardsPitzerModel::evaluate(const IonState& st, double T) const
{
    return EdwardsPitzer(assembleEdwardsParameters(st.name, st.charge, T))
           .evaluate(st, T);
}

void EdwardsPitzerModel::announceParameters(const IonState& st,
                                            std::ostream& os) const
{
    //  The announcement is the ASSEMBLY's, not the kernel's: what a student
    //  needs to see here is WHICH RULE produced each number -- one measured
    //  family and four estimation routes -- and the kernel, being handed a
    //  finished set, cannot know.
    os << "  [edwardsPitzer] Edwards et al. (1978) truncated Pitzer expansion;"
       << " one measured family (Eq 14), the rest estimated by Eqs 21-24\n"
       << "  [edwardsPitzer] pair parameters at T = "
       << std::fixed << std::setprecision(2) << st.T << " K, I = "
       << std::setprecision(4) << st.I << " mol/kg:\n";
    assembleEdwardsParameters(st.name, st.charge, st.T, &os);
}

} // namespace electrolyte
} // namespace Choupo
