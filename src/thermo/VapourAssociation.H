/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | SPDX-License-Identifier: GPL-3.0-or-later
        |        O ptimization  |
\*---------------------------------------------------------------------------*/
/**
 * @file   VapourAssociation.H
 * @brief  THE ONE READER of a gas's vapour dimerisation, and the derived
 *         latent heat to the datum's own vapour (DEV.md 4c C201 item 1).
 *
 * A component record carries ONE formation datum, the ideal-gas MONOMER, and
 * a measured latent heat `HvapTb` that is to the real, associated vapour.
 * Bridging the liquid to the datum with the measured heat leaves an
 * associating acid ~25 kJ/mol too high (docs/design/one-record-two-vapours-
 * acetic-acid.md).  The bridge to the datum's own vapour is DERIVED:
 *
 *      Hvap(l -> ideal-gas monomer, 298.15 K)
 *         = Hvap(calorimetric) + xi * (-dH_dim)
 *
 * with xi the moles of dimer per mole of acid vaporised in the SATURATED
 * vapour, from the dimerisation equilibrium the tree already curates in
 * `chemistry/<...>.dat` `vapourDimerisation { logK25; dH; }` (K_dim = pD/pM^2
 * in atm^-1, the unit the reactive VLE path reads the same record in).  The
 * record is the ONE home of K and dH: nothing is copied into the component.
 * The reactive path reads it through the same function (`dimerisationFrom`).
 */
#pragma once

#include "core/Dictionary.H"
#include "thermo/RecordResolver.H"

#include <cmath>
#include <fstream>
#include <map>
#include <optional>
#include <sstream>
#include <string>

namespace Choupo {
namespace vapourAssociation {

struct Dimerisation
{
    double      logK25 = 0.0;      // log10 K_dim at 298.15 K, K = pD/pM^2 [atm^-1]
    double      dH     = 0.0;      // J per mol of dimer formed (negative)
    std::string source = "undeclared";
    std::string record;            // file the pair was read from
};

//  The ONE parse of the `vapourDimerisation {}` block.
inline Dimerisation dimerisationFrom(const DictPtr& vd)
{
    Dimerisation d;
    d.logK25 = vd->lookupScalar("logK25");
    d.dH     = vd->lookupScalarOrDefault("dH", 0.0);
    d.source = vd->lookupWordOrDefault("source", "undeclared");
    return d;
}

//  The dimerisation record of the gas whose formula is `gasSpecies`, from the
//  case's own resolver view of chemistry/ (a sealed case reads its closure
//  alone).  Parsed once per file per process.
inline std::optional<Dimerisation> find(const std::string& gasSpecies)
{
    static std::map<std::string,
        std::optional<std::pair<std::string, Dimerisation>>> cache;
    for (const auto& f : records::scanRecordDir("chemistry"))
    {
        const std::string key = f.string();
        auto it = cache.find(key);
        if (it == cache.end())
        {
            std::optional<std::pair<std::string, Dimerisation>> parsed;
            std::ifstream in(key);
            std::stringstream ss;
            ss << in.rdbuf();
            if (ss.str().find("vapourDimerisation") != std::string::npos)
            {
                auto e = Dictionary::fromFile(key);
                if (e->lookupWordOrDefault("recordType", "")
                        == "gasLiquidEquilibrium"
                    && e->found("vapourDimerisation"))
                {
                    const std::string gas = e->found("gasSpecies")
                        ? e->lookupWord("gasSpecies") : e->lookupWord("gas");
                    Dimerisation d = dimerisationFrom(e->subDict("vapourDimerisation"));
                    d.record = key;
                    parsed = std::make_pair(gas, d);
                }
            }
            it = cache.emplace(key, parsed).first;
        }
        if (it->second && it->second->first == gasSpecies)
            return it->second->second;
    }
    return std::nullopt;
}

struct SaturatedVapour
{
    double pMonoAtm = 0.0;    // monomer partial pressure
    double pDimAtm  = 0.0;    // dimer partial pressure
    double xi       = 0.0;    // mol dimer per mol of acid vaporised
};

//  Saturated vapour at total pressure `Psat_atm` (= pM + pD, the Antoine
//  value): K pM^2 + pM - Psat = 0.
inline SaturatedVapour saturated(const Dimerisation& d, double T_K,
                                 double Psat_atm)
{
    const double K = std::pow(10.0, d.logK25
        - (d.dH / (std::log(10.0) * 8.31446)) * (1.0 / T_K - 1.0 / 298.15));
    SaturatedVapour s;
    s.pMonoAtm = (-1.0 + std::sqrt(1.0 + 4.0 * K * Psat_atm)) / (2.0 * K);
    s.pDimAtm  = K * s.pMonoAtm * s.pMonoAtm;
    s.xi       = s.pDimAtm / (s.pMonoAtm + 2.0 * s.pDimAtm);
    return s;
}

}  // namespace vapourAssociation
}  // namespace Choupo
