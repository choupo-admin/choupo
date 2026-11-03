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

#include "core/Constants.H"
#include "core/Dictionary.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
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

//  K_dim(T) = pD / pM^2 [atm^-1], van't Hoff from the record's 298.15 K value.
//  THE ONE copy of the expression: the reactive VLE, the bridge and the
//  ideal-gas vapour below all evaluate it here.
inline double Kdim(const Dimerisation& d, double T_K)
{
    return std::pow(10.0, d.logK25
        - (d.dH / (std::log(10.0) * 8.31446)) * (1.0 / T_K - 1.0 / 298.15));
}
inline double Kdim(double logK25, double dH, double T_K)
{
    Dimerisation d; d.logK25 = logK25; d.dH = dH;
    return Kdim(d, T_K);
}

struct SaturatedVapour
{
    double pMonoAtm = 0.0;    // monomer partial pressure
    double pDimAtm  = 0.0;    // dimer partial pressure
    double xi       = 0.0;    // mol dimer per mol of acid vaporised
};

//  Saturated vapour at total pressure `Psat_atm` (= pM + pD, the Antoine
//  value): K pM^2 + pM - Psat = 0.  `pMonoAtm` is also the MONOMER's
//  saturation pressure, the liquid side's pure-component reference in the
//  chemical theory (the pure limit p_m + p_d = Psat_apparent is exact).
inline SaturatedVapour saturated(const Dimerisation& d, double T_K,
                                 double Psat_atm)
{
    const double K = Kdim(d, T_K);
    SaturatedVapour s;
    s.pMonoAtm = (-1.0 + std::sqrt(1.0 + 4.0 * K * Psat_atm)) / (2.0 * K);
    s.pDimAtm  = K * s.pMonoAtm * s.pMonoAtm;
    s.xi       = s.pDimAtm / (s.pMonoAtm + 2.0 * s.pDimAtm);
    return s;
}

//  THE TRUE VAPOUR of an associating mixture (DEV.md 4c C201 item 1, piece 2;
//  moved here VERBATIM from the reactive VLE, its first reader).  The apparent
//  moles `vd` of the dimerising volatile split as vd = t_mono + 2 t_dim, with
//  the vapour-phase equilibrium p_dim = K_dim p_mono^2 over the TRUE mole
//  count tau = S + t_mono + t_dim, S the other species' moles.
//  g(t_mono) = (vd - t_mono)/2 - K_dim P t_mono^2 / tau is monotone with a
//  bracketed sign change -- bisection is exact enough and never escapes
//  (0, vd].
struct TrueVapour { double tMono, tDim, tau; };

inline TrueVapour trueVapour(double vd, double S, double Kd, double Patm)
{
    if (vd <= 0.0) return { 0.0, 0.0, S };
    auto g = [&](double tm)
    {
        const double tau = S + tm + (vd - tm)/2.0;
        return (vd - tm)/2.0 - Kd * Patm * tm*tm / std::max(tau, 1e-300);
    };
    double lo = 0.0, hi = vd;
    for (int b = 0; b < 80; ++b)
    {
        const double mid = 0.5*(lo + hi);
        (g(mid) > 0.0 ? lo : hi) = mid;
    }
    const double tm = 0.5*(lo + hi);
    const double td = (vd - tm)/2.0;
    return { tm, td, S + tm + td };
}

//  THE ASSOCIATED IDEAL-GAS VAPOUR, per mole of APPARENT vapour (the chemical
//  theory of vapour imperfection).  For a normalised apparent composition y
//  with ONE dimerising component a:
//    fugacity of a     = p_mono      = (t_m / tau) P   -> phi_a = t_m/(tau y_a)
//    fugacity of j != a = (y_j/tau) P                 -> phi_j = 1/tau
//    H - H_ig          = t_d dH                        (h_dim = 2 h_mono + dH)
//    G - G_ig          = RT sum_i y_i ln phi_i         (2 mu_mono = mu_dim)
//    S - S_ig          = (H_res - G_res) / T
//  These are exactly the residuals of an equation of state, which is the
//  point: association is a property of the VAPOUR MODEL.
struct AssociationResidual
{
    double tMono = 0.0, tDim = 0.0, tau = 1.0;
    double lnPhiA = 0.0;      // the associating component
    double lnPhiOther = 0.0;  // every other component (= -ln tau)
    double H = 0.0;           // J per mol apparent
    double S = 0.0;           // J/(mol K) per mol apparent
};

inline AssociationResidual idealGasResidual(const Dimerisation& d, double T_K,
                                            double P_Pa, double yA)
{
    AssociationResidual r;
    const double Kd = Kdim(d, T_K);
    const TrueVapour tv = trueVapour(yA, 1.0 - yA, Kd, P_Pa / 101325.0);
    r.tMono = tv.tMono; r.tDim = tv.tDim; r.tau = tv.tau;
    if (!(tv.tau > 0.0)) return r;
    r.lnPhiOther = -std::log(tv.tau);
    r.lnPhiA = (yA > 0.0 && tv.tMono > 0.0)
             ? std::log(tv.tMono / (tv.tau * yA)) : r.lnPhiOther;
    r.H = tv.tDim * d.dH;
    const double gRes_RT = yA * r.lnPhiA + (1.0 - yA) * r.lnPhiOther;
    r.S = r.H / T_K - constant::R * gRes_RT;
    return r;
}

}  // namespace vapourAssociation
}  // namespace Choupo
