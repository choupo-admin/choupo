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

#include "RiaziDaubert.H"
#include "DerivedClosures.H"

#include <cmath>

namespace Choupo {

namespace {

// Riazi-Daubert (1987) two-parameter form:  theta = a * Tb^b * SG^c
//   SG = specific gravity at 60/60 degF (dimensionless).
// Constants from Riazi & Daubert, Ind. Eng. Chem. Res. 26 (1987) 755-759
// (reproduced in Riazi, ASTM MNL50, 2005, Table 2.4).  MW/Tc/Pc use the
// English-unit set (Tb in degrees RANKINE; theta in degR / psia), then
// converted to SI; Vc uses the metric-unit set (Tb in K; theta in cm^3/mol)
// directly -- both forms are tabulated, and we pick the one that is
// numerically verified against pure-species constants:
//   property   a            b         c          Tb unit   theta unit
//   MW         4.5673e-5    2.1962   -1.0164     degR       g/mol
//   Tc         24.2787      0.58848   0.3596     degR       degR
//   Pc         3.12281e9   -2.3125    2.3201     degR       psia
//   Vc         1.7842e-4    2.3829   -1.683      K          cm^3/mol
inline double rd(double a, double b, double c, double Tb, double SG)
{
    return a * std::pow(Tb, b) * std::pow(SG, c);
}

constexpr double R_per_K   = 1.8;          // degR per K
constexpr double psia_per_bar = 14.503773773;

} // namespace

ConstantEstimate RiaziDaubert::estimateFromScalars(
    const std::map<std::string, double>& anchors,
    bool& ok, std::string& error) const
{
    ok = true; error.clear();
    ConstantEstimate r;

    auto get = [&](const char* k, double& out) -> bool
    {
        auto it = anchors.find(k);
        if (it == anchors.end()) return false;
        out = it->second; return true;
    };

    double Tb_K = 0.0, SG = 0.0;
    if (!get("Tb", Tb_K) || !get("SG", SG))
    {
        ok = false;
        error = "Riazi-Daubert needs both `Tb` (normal boiling point) and `SG`"
                " (specific gravity 60/60) in the anchors block.";
        return r;
    }
    if (Tb_K <= 0.0 || SG <= 0.0)
    {
        ok = false;
        error = "Riazi-Daubert: Tb and SG must be positive (Tb in K, SG > 0).";
        return r;
    }

    const double Tb_R = Tb_K * R_per_K;

    // ---- the four Riazi-Daubert correlations -----------------------------
    const double MW    = rd(4.5673e-5, 2.1962, -1.0164, Tb_R, SG);   // g/mol  (degR)
    const double Tc_R  = rd(24.2787,   0.58848, 0.3596, Tb_R, SG);   // degR
    const double Pc_ps = rd(3.12281e9, -2.3125, 2.3201, Tb_R, SG);   // psia
    const double Vc    = rd(1.7842e-4, 2.3829, -1.683,  Tb_K, SG);   // cm^3/mol (K)

    r.MW     = MW;
    r.Tb     = Tb_K;                          // K   (the anchor, echoed)
    r.Tc     = Tc_R / R_per_K;                // degR -> K
    r.Pc_bar = Pc_ps / psia_per_bar;          // psia -> bar
    r.Vc     = Vc;                            // cm^3/mol (metric RD form)

    // omega by Lee-Kesler from (Tb, Tc, Pc) -- ONE shared closure, exactly as
    // the Joback path uses (Pc in atm).
    r.omega  = closures::leeKeslerOmega(r.Tb, r.Tc, r.Pc_bar / 1.01325);

    // ---- ideal-gas Cp by Kesler-Lee (1976) for petroleum fractions --------
    // The petroleum-characterisation companion of the Riazi-Daubert constants
    // (Kesler & Lee, Hydrocarbon Process. 55(3) 1976; Riazi MNL50 eq. 2.66).
    // It returns Cp_ig [Btu/(lb degF) = cal/(g degC)] as a quadratic in T[degR]:
    //   Cp = A + B*T + C*T^2     [per UNIT MASS]
    // We multiply by MW (g/mol) to get J/(mol K), absorbing degR->K (factor
    // 1.8 on each T power) and cal->J (4.184), so the stored polynomial is the
    // molar Cp_ig(T[K]) Choupo's heatCapacity{polynomial} consumes directly.
    const double Kw = std::pow(Tb_R, 1.0 / 3.0) / SG;    // Watson K factor
    const double cf = (12.8 - Kw) * (10.0 - Kw) / (10.0 * SG);
    // Per-mass coefficients in T[degR] (Btu/lb/degF):
    const double Am = -0.33886 + 0.02827 * Kw - 0.26105 * cf + 0.59332 * SG * cf;
    const double Bm = (-(0.9291 - 1.1543 * Kw + 0.0368 * Kw * Kw) * 1.0e-4
                       + cf * (4.56 - 9.48 * SG) * 1.0e-4);
    const double Cm = (-1.6658e-7 + cf * (0.536 - 0.6828 * SG) * 1.0e-7);
    // Convert per-mass-in-degR  ->  per-mole-in-K:
    //   Cp_molar[J/molK] = MW[g/mol] * 4.184 * (A + B*(1.8 T) + C*(1.8 T)^2)
    //   absorb cal->J (4.184) AND degR->K (T_R = 1.8 T_K) into the coeffs.
    const double J_per_cal = 4.184;
    r.cpa = MW * J_per_cal * Am;
    r.cpb = MW * J_per_cal * Bm * R_per_K;
    r.cpc = MW * J_per_cal * Cm * R_per_K * R_per_K;
    r.cpd = 0.0;            // Kesler-Lee is quadratic in T

    // A petroleum lump carries no group decomposition and no formation
    // chemistry (no stoichiometric reaction) -- Hf/Gf stay zero (gaps in the
    // proposal).  The Cp polynomial above closes the energy-balance leg.
    return r;
}

} // namespace Choupo
