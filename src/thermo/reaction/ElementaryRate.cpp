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

#include "ElementaryRate.H"

#include "thermo/ThermoPackage.H"
#include "thermo/reaction/Reaction.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace Choupo
{

namespace
{

bool isCm(const DictPtr& d, const std::string& who)
{
    if (!d->found("units")) return false;
    const std::string u = d->subDict("units")->lookupWordOrDefault("A", "");
    if (u.empty() || u == "1/s" || u == "s-1") return false;   // no amount dimension: nothing to convert
    if (u.find("cm") == std::string::npos)
        throw std::runtime_error(who + ": `units { A \"" + u + "\"; }` -- only a"
            " cm-mol-s unit (cm3/mol/s and its powers) is converted.  Omit `units`"
            " to give A already in the reactor's amount unit.");
    return true;
}

scalar eaJoulePerMol(const DictPtr& d, scalar Ea, const std::string& who)
{
    if (!d->found("units")) return Ea;
    const std::string u = d->subDict("units")->lookupWordOrDefault("Ea", "");
    if (u.empty()) return Ea;
    if      (u.find("kcal") != std::string::npos) return Ea * 4184.0;
    else if (u.find("cal")  != std::string::npos) return Ea * 4.184;
    else if (u.find("kJ")   != std::string::npos) return Ea * 1000.0;
    else if (u.find("J")    != std::string::npos) return Ea;
    throw std::runtime_error(who + ": `units { Ea \"" + u + "\"; }` is not one of"
        " kcal/mol, cal/mol, kJ/mol, J/mol.");
}

} // namespace

ElementaryRate ElementaryRate::fromDict(const DictPtr&       rxn,
                                        const ThermoPackage& thermo,
                                        const std::string&   who,
                                        const RateOffer&     offer)
{
    const std::size_t n = thermo.n();
    ElementaryRate law;
    law.who_ = who;
    law.nu_.assign(n, 0.0);
    law.order_.assign(n, 0.0);
    std::vector<scalar> orders;

    for (const auto& s : rxn->lookupDictList("stoichiometry"))
    {
        const std::size_t i = thermo.indexOf(s->lookupWord("component"));
        law.nu_[i]    = s->lookupScalar("nu");
        law.order_[i] = Reaction::forwardOrder(
            *s, law.nu_[i], s->lookupWord("component"), who);
        orders.push_back(law.order_[i]);
    }

    auto kin = rxn->subDict("kinetics");
    const std::string word = kin->lookupWord("type");
    law.type_ = word;
    if      (word == "modifiedArrhenius") law.form_ = Form::modifiedArrhenius;
    else if (word == "thirdBody")         law.form_ = Form::thirdBody;
    else if (word == "falloff")           law.form_ = Form::falloff;
    else if (word == "plog")              law.form_ = Form::plog;
    else throw std::runtime_error(who + ": ElementaryRate does not read `type "
        + word + "`.");

    if (kin->found("adsorption")
        || kin->lookupWordOrDefault("basis", "concentration") != "concentration")
        throw std::runtime_error(who + ": `" + word + "` is a mass-action,"
            " concentration-basis law; `adsorption` and `basis activity` belong to"
            " `type LHHW`.");
    if (kin->found("A_rev") || kin->found("Ea_rev"))
        throw std::runtime_error(who + ": `" + word + "` has no explicit reverse"
            " leg (`A_rev`/`Ea_rev`); say `reversible true;` for detailed balance.");

    law.reversible_ = (rxn->lookupWordOrDefault("reversible", "false") == "true");
    if (law.reversible_)
        Reaction::refuseNonMassActionDetailedBalance(*rxn, rxn->name(), who);

    // Molecularity, decided only when a cm unit asks for it.  SUM first.
    law.cmA_ = isCm(kin, who);
    if (law.form_ == Form::falloff && kin->found("low"))
        law.cmALow_ = isCm(kin->subDict("low"), who);
    if (law.cmA_ || law.cmALow_)
        law.molec_ = Reaction::chemkinMolecularity(orders, rxn->name(), who);

    if (law.form_ == Form::plog)
    {
        if (!offer.pressure)
            throw std::runtime_error(who + ": `type plog` reads the pressure, and "
                + (offer.pressureAbsent.empty()
                       ? std::string("this vessel carries none a rate law can read.")
                       : offer.pressureAbsent));
        if (kin->found("thirdBody") || kin->found("low") || kin->found("troe"))
            throw std::runtime_error(who + ": `type plog` takes no `thirdBody` / `low` / `troe`.");
        if (!kin->found("plog"))
            throw std::runtime_error(who + ": `type plog` needs `plog ( { P 1 atm; A; b; Ea; } ... );`.");
        for (const auto& e : kin->lookupDictList("plog"))
        {
            const scalar P = e->lookupScalar("P");
            if (!(P > 0.0))
                throw std::runtime_error(who + ": a `plog` line has P <= 0.");
            PlogArr a;
            a.A  = e->lookupScalar("A");
            a.b  = e->lookupScalarOrDefault("b", 0.0);
            a.Ea = eaJoulePerMol(kin, e->lookupScalar("Ea"), who);
            auto it = std::find_if(law.plog_.begin(), law.plog_.end(),
                [&](const PlogRow& r) { return r.P == P; });
            if (it == law.plog_.end()) { law.plog_.push_back(PlogRow{P, {a}}); }
            else it->arr.push_back(a);
        }
        if (law.plog_.empty())
            throw std::runtime_error(who + ": `plog ( ... )` is empty.");
        std::sort(law.plog_.begin(), law.plog_.end(),
                  [](const PlogRow& x, const PlogRow& y) { return x.P < y.P; });
        return law;
    }

    law.A_  = kin->lookupScalar("A");
    law.b_  = (law.form_ == Form::modifiedArrhenius) ? kin->lookupScalar("b")
                                                      : kin->lookupScalarOrDefault("b", 0.0);
    law.Ea_ = eaJoulePerMol(kin, kin->lookupScalar("Ea"), who);

    // third-body efficiencies: unlisted species 1.0
    law.eff_.assign(n, 1.0);
    const bool tbBlock = kin->found("thirdBody");
    if (law.form_ == Form::thirdBody && !tbBlock)
        throw std::runtime_error(who + ": `type thirdBody` needs a `thirdBody"
            " { species efficiency; }` block (an empty block means all 1).");
    if (tbBlock)
    {
        auto tb = kin->subDict("thirdBody");
        for (const auto& sp : tb->keys())
            law.eff_[thermo.indexOf(sp)] = tb->lookupScalar(sp);
    }

    if (law.form_ == Form::falloff)
    {
        if (!kin->found("low"))
            throw std::runtime_error(who + ": `type falloff` needs a `low { A; b; Ea; }`"
                " block (the low-pressure limit); `A b Ea` on `kinetics` are the"
                " HIGH-pressure limit.");
        auto low = kin->subDict("low");
        law.ALow_  = low->lookupScalar("A");
        law.bLow_  = low->lookupScalarOrDefault("b", 0.0);
        law.EaLow_ = eaJoulePerMol(low, low->lookupScalar("Ea"), who);
        if (kin->found("troe")) law.troe_ = kin->lookupList("troe");
    }
    else if (kin->found("low") || kin->found("troe"))
        throw std::runtime_error(who + ": `low` / `troe` belong to `type falloff`.");

    return law;
}

scalar ElementaryRate::plogK(const PlogRow& row, scalar T) const
{
    scalar k = 0.0;
    for (const auto& a : row.arr)
        k += Reaction::modifiedArrheniusRate(a.A, a.b, a.Ea, T);
    return k;
}

scalar ElementaryRate::kEff(const RateState& s) const
{
    //  CHEMKIN cm3/mol/s -> the caller's amount unit: 1e-6 m3/cm3 per order
    //  beyond the first, and 1000/amountPerKmol turns mol into the caller's unit.
    const scalar perOrder = 1.0e-6 * (1000.0 / s.amountPerKmol);
    const auto conv = [&](bool cm, scalar A, int extra)
    { return cm ? A * std::pow(perOrder, molec_ + extra - 1) : A; };

    if (form_ == Form::plog)
    {
        //  The A of each line is converted to the caller's unit here (below),
        //  by scaling the summed k: every line has the same molecularity.
        const scalar f = cmA_ ? std::pow(perOrder, molec_ - 1) : 1.0;
        const scalar P = s.P;
        if (std::isnan(P))
            throw std::runtime_error(who_ + ": `type plog` was handed no pressure (an empty vessel?).");
        if (!(P > plog_.front().P)) return f * plogK(plog_.front(), s.T);
        if (!(P < plog_.back().P))  return f * plogK(plog_.back(),  s.T);
        std::size_t j = 1;                       // plog_[j-1].P < P < plog_[j].P (or equal: j-1)
        while (j + 1 < plog_.size() && plog_[j].P < P) ++j;
        const scalar k1 = plogK(plog_[j - 1], s.T), k2 = plogK(plog_[j], s.T);
        const scalar w  = std::log(P / plog_[j - 1].P) / std::log(plog_[j].P / plog_[j - 1].P);
        if (!(k1 > 0.0) || !(k2 > 0.0))          // ln k undefined: linear in ln P of k itself
            return f * (k1 + w * (k2 - k1));
        return f * std::exp(std::log(k1) + w * (std::log(k2) - std::log(k1)));
    }

    const scalar kInf = Reaction::modifiedArrheniusRate(
        conv(cmA_, A_, form_ == Form::thirdBody ? 1 : 0), b_, Ea_, s.T);
    if (form_ == Form::modifiedArrhenius) return kInf;

    const scalar M = Reaction::thirdBodyConcentration(*s.conc, eff_);
    if (form_ == Form::thirdBody) return kInf * M;

    const scalar kLow = Reaction::modifiedArrheniusRate(
        conv(cmALow_, ALow_, 1), bLow_, EaLow_, s.T);
    return Reaction::falloffRate(kLow, kInf, M, s.T, troe_);
}

scalar ElementaryRate::netRate(const ThermoPackage& thermo, const RateState& s) const
{
    const std::size_t n = nu_.size();
    const sVector& conc = *s.conc;
    const scalar k = kEff(s);

    scalar rf = k;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (order_[i] == 0.0) continue;
        rf *= Reaction::powerLawFactor(order_[i] > 0.0 ? std::max<scalar>(conc[i], 0.0) : conc[i],
                                       order_[i], thermo.comp(i).name(), who_);
    }
    if (!reversible_) return rf;

    //  equilibriumKc is on kmol/m3; the caller's concentrations are in its own
    //  amount unit, so Kc scales by amountPerKmol^sum(nu).
    scalar sumNu = 0.0;
    for (std::size_t i = 0; i < n; ++i) sumNu += nu_[i];
    const scalar Kc = (s.gibbs ? Reaction::equilibriumKc(nu_, s.T, *s.gibbs)
                               : Reaction::equilibriumKc(thermo, nu_, s.T))
                    * std::pow(s.amountPerKmol, sumNu);
    scalar rr = (Kc > 0.0) ? k / Kc : 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (nu_[i] > 0.0) rr *= std::pow(std::max<scalar>(conc[i], 0.0), nu_[i]);
    return rf - rr;
}

} // namespace Choupo
