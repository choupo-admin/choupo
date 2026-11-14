/*---------------------------------------------------------------------------*\
  ElectrolytePackageActivity -- see ElectrolytePackageActivity.H.
  Copyright (C) 2026 Vítor Geraldes
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "propertyOps/ElectrolytePackageActivity.H"

#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/ElectrolyteModel.H"

#include "thermo/RecordResolver.H"
#include "thermo/electrolyte/BoilingPointRise.H"
#include "core/Constants.H"
#include <cmath>
#include <cstdio>
#include <algorithm>
#include <fstream>
#include <iomanip>
#include <stdexcept>

namespace Choupo {

int ElectrolytePackageActivity::run(const DictPtr& dict,
                                    const ThermoPackage& thermo, int /*verbosity*/)
{
    diag_.clear();

    if (!thermo.hasElectrolyte())
        throw std::runtime_error("electrolyteActivity: the property package assembled "
            "no electrolyte model -- select an electrolyte propertyMethod (e.g. pitzer).");
    const ElectrolyteModel& e = thermo.electrolyte();

    // Isothermal; the model is T-dependent and defaults to 25 C.
    const scalar T = dict->lookupScalarOrDefault("temperature", 298.15);

    // -- molality grid --------------------------------------------------------
    scalar mFrom = 0.1, mTo = 6.0;
    std::size_t n = 30;
    if (dict->found("molality"))
    {
        auto md = dict->subDict("molality");
        mFrom = md->lookupScalarOrDefault("from", mFrom);
        mTo   = md->lookupScalarOrDefault("to",   mTo);
        if (md->found("n"))
            n = std::max<std::size_t>(2, static_cast<std::size_t>(md->lookupScalar("n")));
    }

    // -- output ---------------------------------------------------------------
    const std::string outFile_ = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("electrolyteActivity", "file", outFile_);
    std::ofstream csv(outFile_);
    if (!csv.is_open())
        throw std::runtime_error("electrolyteActivity: cannot open output file");
    csv << "m,gamma_pm,phi,a_w\n";
    csv << std::scientific << std::setprecision(8);
    const scalar dm = (n > 1) ? (mTo - mFrom) / static_cast<scalar>(n - 1) : 0.0;
    for (std::size_t k = 0; k < n; ++k)
    {
        const scalar m = mFrom + dm * static_cast<scalar>(k);
        csv << m << "," << e.gammaPM(m, T) << "," << e.osmotic(m, T)
            << "," << e.waterActivity(m, T) << "\n";
    }

    // -- diagnostics (same KPIs as pitzerActivity) ----------------------------
    diag_["gamma_pm_1m"] = e.gammaPM(1.0, T);
    diag_["gamma_pm_3m"] = e.gammaPM(3.0, T);
    diag_["phi_1m"]      = e.osmotic(1.0, T);
    diag_["aw_1m"]       = e.waterActivity(1.0, T);

    // -- optional TABLE over mass fraction x temperature (C377 b) ---------------
    //  table { massFractions ( 0.1 0.3 0.5 ); temperatures ( 373.15 423.15 );
    //          file naoh_table.csv; }
    //  For each (w, T): the molality, a_w, the boiling-point rise at T as the
    //  boiling temperature -- EXACT (a_w Psat(T) = Psat(T - BPE), the
    //  evaporator's own relation, thermo/electrolyte/BoilingPointRise.H) and
    //  LINEARISED (-(R T^2/dHvap) ln a_w), the relative apparent molar enthalpy
    //  L_phi, and the solution's specific enthalpy on the classical chart datum
    //  (liquid water at 0 C, the salt at infinite dilution at 20 C), priced on
    //  the package's own liquid surface, and -- for a model built from separate
    //  activity and enthalpy correlations -- its Gibbs-Helmholtz gap [kJ/kg]
    //  (ElectrolyteModel::lphiConsistencyGap).  w is the SALT mass fraction; T in K.
    //  `molalities ( ... )` may stand in place of `massFractions` (a dataset
    //  printed on the molality scale); the diagnostics are then tagged _m<m>.
    if (dict->found("table"))
    {
        auto td = dict->subDict("table");
        const bool byMolality = td->found("molalities");
        const auto ws = byMolality ? td->lookupList("molalities")
                                   : td->lookupList("massFractions");
        const auto Ts = td->lookupList("temperatures");
        const std::string tf = td->lookupWord("file");
        records::refuseStandardsWrite("electrolyteActivity", "table.file", tf);
        std::ofstream tcsv(tf);
        if (!tcsv.is_open())
            throw std::runtime_error("electrolyteActivity: cannot open table file");
        const std::size_t is = e.soluteIndex(), iw = e.solventIndex();
        const scalar Ms = thermo.comp(is).MW(), Mw = thermo.comp(iw).MW();   // g/mol
        tcsv << "w_salt,T_K,m,a_w,BPE_exact_K,BPE_linear_K,L_phi_J_mol,H_chart_kJ_kg,GH_gap_kJ_kg\n";
        tcsv << std::setprecision(8);
        auto hPerKg = [&](scalar TT, scalar w) -> scalar
        {
            //  mole fractions of the (w, 1-w) solution -> J/mol -> kJ/kg
            sVector x(thermo.n(), 0.0);
            const scalar ns = w / Ms, nw = (1.0 - w) / Mw;
            x[is] = ns / (ns + nw);  x[iw] = nw / (ns + nw);
            const scalar Mbar = x[is] * Ms + x[iw] * Mw;               // g/mol
            return thermo.H_liquid_formation(TT, x) / Mbar;            // J/g = kJ/kg
        };
        sVector xw(thermo.n(), 0.0);  xw[iw] = 1.0;
        const scalar hw0  = thermo.H_liquid_formation(273.15, xw) / Mw;  // kJ/kg
        const scalar hs20 = e.aqueousSaltEnthalpy(0.0, 293.15) / Ms;     // kJ/kg salt
        for (scalar v : ws)
            for (scalar TT : Ts)
            {
                const scalar w = byMolality ? v * Ms / (1000.0 + v * Ms) : v;
                const scalar m = byMolality ? v : 1000.0 * w / (Ms * (1.0 - w));
                const scalar aw = e.waterActivity(m, TT);
                const scalar dHv = thermo.comp(iw).Hvap_latent(TT);
                const scalar lin = -(constant::R * TT * TT / dHv) * std::log(aw);
                const scalar ex = exactBoilingPointRise(
                    [&](scalar T2) { return thermo.Psat(iw, T2); }, aw, TT, lin);
                const scalar L = e.apparentMolarEnthalpy(m, TT);
                const scalar Hc = hPerKg(TT, w) - (1.0 - w) * hw0 - w * hs20;
                const scalar gap = e.lphiConsistencyGap(m, TT);
                tcsv << w << "," << TT << "," << m << "," << aw << "," << ex
                     << "," << lin << "," << L << "," << Hc << "," << gap << "\n";
                char tag[48];
                if (byMolality)
                    std::snprintf(tag, sizeof tag, "_m%g_T%03d", v,
                                  static_cast<int>(std::lround(TT - 273.15)));
                else
                    std::snprintf(tag, sizeof tag, "_w%02d_T%03d",
                                  static_cast<int>(std::lround(100.0 * w)),
                                  static_cast<int>(std::lround(TT - 273.15)));
                diag_[std::string("aw") + tag]         = aw;
                diag_[std::string("BPE_exact") + tag]  = ex;
                diag_[std::string("BPE_linear") + tag] = lin;
                diag_[std::string("Lphi") + tag]       = L;
                diag_[std::string("Hchart") + tag]     = Hc;
                if (e.lphiConsistencyTolerance() > 0.0)
                    diag_[std::string("GHgap") + tag]  = gap;
            }
    }
    return 0;
}

} // namespace Choupo
