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

#include "Joback.H"
#include "DerivedClosures.H"

#include "core/Dictionary.H"
#include "thermo/Database.H"

#include <cmath>
#include <filesystem>
#include <map>

namespace Choupo {

namespace {

// One Joback first-order group: molecular weight + atom count (for Pc) +
// the tabulated contributions.  Values from Joback & Reid (1987), as
// tabulated in Poling, Prausnitz & O'Connell, "The Properties of Gases and
// Liquids", 5th ed., Table 2-2.  Cp coefficients give Cp_ig in J/(mol K)
// with T in K; dHf / dGf in kJ/mol; dHv (vaporisation at Tb) in kJ/mol;
// dVc in cm^3/mol; dTb / dTc dimensionless contributions per the formulas.
struct Group
{
    double MW;   int nA;
    double dTc, dPc, dVc, dTb, dHf, dGf;
    double a, b, c, d;     // ideal-gas Cp polynomial contributions
    double dHv;            // heat of vaporisation at Tb
};

// A readable, tokenizer-safe key per group (no special chars).  Alkene sp2
// carbons use an `e` prefix (ene); alkyne sp carbons a `yne` prefix; aromatic
// ring atoms an `ar` prefix; saturated-ring atoms an `r` prefix.  The full
// Joback Table 2-2 (41 groups) is covered: hydrocarbons (incl. alkynes and
// ring carbons), halogens (F/Cl/Br/I), O families (alcohol/phenol/ether/ring-
// ether/ketone/ring-ketone/aldehyde/acid/ester/=O), N families (amines, ring-
// NH, =N-, nitrile, nitro) and S families (thiol, sulfide, ring-sulfide).
// Loaded ONCE from data/standards/joback/groups.dat (resolved via
// Database::currentRoot()), replacing the former hard-coded table -- the
// parameters now live as curated DATA alongside UNIFAC/Henry, visible + editable.
// Values are unchanged (the .dat was generated from the old table verbatim).
// The table's stable identity (`tableId` in groups.dat) -- the ONE source the
// structured provenance's methodVersion and the drift checker both read.
const std::string& tableId()
{
    static const std::string id = [] {
        namespace fs = std::filesystem;
        const fs::path p = fs::path(Database::currentRoot()) / "standards" / "joback" / "groups.dat";
        return Dictionary::fromFile(p.string())->lookupWordOrDefault("tableId", "");
    }();
    return id;
}

const std::map<std::string, Group>& table()
{
    static const std::map<std::string, Group> t = [] {
        namespace fs = std::filesystem;
        const fs::path p = fs::path(Database::currentRoot()) / "standards" / "joback" / "groups.dat";
        const auto d = Dictionary::fromFile(p.string());
        std::map<std::string, Group> m;
        for (const auto& g : d->lookupDictList("groups"))
            m[g->lookupWord("name")] = Group{
                g->lookupScalar("MW"),  static_cast<int>(g->lookupScalar("nA")),
                g->lookupScalar("dTc"), g->lookupScalar("dPc"), g->lookupScalar("dVc"),
                g->lookupScalar("dTb"), g->lookupScalar("dHf"), g->lookupScalar("dGf"),
                g->lookupScalar("cpa"), g->lookupScalar("cpb"), g->lookupScalar("cpc"),
                g->lookupScalar("cpd"), g->lookupScalar("dHv") };
        return m;
    }();
    return t;
}
#if 0  // ---- former hard-coded table (now in data/standards/joback/groups.dat) ----
static const std::map<std::string, Group> t_unused = {
        //                MW      nA    dTc      dPc      dVc   dTb     dHf      dGf      a        b         c          d          dHv
        { "CH3",      { 15.035,  4,  0.0141, -0.0012,  65, 23.58, -76.45, -43.96,  19.50, -8.08e-3,  1.53e-4, -9.67e-8,  2.373 } },
        { "CH2",      { 14.027,  3,  0.0189,  0.0000,  56, 22.88, -20.64,   8.42,  -0.909, 9.50e-2, -5.44e-5,  1.19e-8,  2.226 } },
        { "CH",       { 13.019,  2,  0.0164,  0.0020,  41, 21.74,  29.89,  58.36, -23.0,   2.04e-1, -2.65e-4,  1.20e-7,  1.691 } },
        { "C",        { 12.011,  1,  0.0067,  0.0043,  27, 18.25,  82.23, 116.02, -66.2,   4.27e-1, -6.41e-4,  3.01e-7,  0.636 } },
        { "eCH2",     { 14.027,  3,  0.0113, -0.0028,  56, 18.18,  -9.630,  3.77,  23.6,  -3.81e-2,  1.72e-4, -1.03e-7,  1.724 } },
        { "eCH",      { 13.019,  2,  0.0129, -0.0006,  46, 24.96,  37.97,  48.53,  -8.00,  1.05e-1, -9.63e-5,  3.56e-8,  2.205 } },
        { "eC",       { 12.011,  1,  0.0117,  0.0011,  38, 24.14,  83.99,  92.36, -28.1,   2.08e-1, -3.06e-4,  1.46e-7,  2.138 } },
        { "OH",       { 17.007,  2,  0.0741,  0.0112,  28, 92.88,-208.04,-189.20,  25.7,  -6.91e-2,  1.77e-4, -9.88e-8, 16.826 } },  // alcohol
        { "ether",    { 15.999,  1,  0.0168,  0.0015,  18, 22.42,-132.22,-105.00,  25.5,  -6.32e-2,  1.11e-4, -5.48e-8,  2.406 } },  // -O- non-ring
        { "ketone",   { 28.010,  2,  0.0380,  0.0031,  62, 76.75,-133.22,-120.50,   6.45,  6.70e-2, -3.57e-5,  2.86e-9,  7.488 } },  // >C=O non-ring
        { "aldehyde", { 29.018,  3,  0.0379,  0.0030,  82, 72.24,-162.03,-143.48,  30.9,  -3.36e-2,  1.60e-4, -9.88e-8,  6.002 } },  // -CHO
        { "acid",     { 45.018,  4,  0.0791,  0.0077,  89,169.09,-426.72,-387.87,  24.1,   4.27e-2,  8.04e-5, -6.87e-8, 19.20  } },  // -COOH
        { "ester",    { 44.010,  3,  0.0481,  0.0005,  82, 81.10,-337.92,-301.95,  24.5,   4.02e-2,  4.02e-5, -4.52e-8,  6.930 } },  // -COO-
        { "arCH",     { 13.019,  2,  0.0082,  0.0011,  41, 26.73,   2.09,  11.30,  -2.14,  5.74e-2, -1.64e-6, -1.59e-8,  2.544 } },  // aromatic =CH-
        { "arC",      { 12.011,  1,  0.0143,  0.0008,  32, 31.01,  46.43,  54.05,  -8.25,  1.01e-1, -1.42e-4,  6.78e-8,  3.059 } },  // aromatic =C<

        // ---- Extended coverage: the rest of Joback & Reid (1987) Table 2-2 ----
        //   alkynes, ring carbons, halogens, phenol/ring O, ring carbonyl, amines,
        //   imines, nitrile, nitro, thiol, sulfides.  Values from Joback & Reid
        //   (1987) as tabulated in Poling, Prausnitz & O'Connell 5th ed. Table 2-2.
        //   (Same MW, nA, dTc, dPc, dVc, dTb, dHf, dGf, Cp(a..d), dHv order as above.)
        { "alleneC",   {  12.011,  1,  0.0026,   0.0028,   36,  26.15,   142.14,    136.7,    27.4,   -0.0557,  0.000101,  -5.02e-08,   2.661 } },  // cumulated =C=
        { "yneCH",     {  13.019,  2,  0.0027,  -0.0008,   46,    9.2,     79.3,    77.71,    24.5,   -0.0271,  0.000111,  -6.78e-08,   1.155 } },  // alkyne tripleCH
        { "yneC",      {  12.011,  1,   0.002,   0.0016,   37,  27.38,   115.51,   109.82,    7.87,    0.0201, -8.33e-06,   1.39e-09,   3.302 } },  // alkyne tripleC
        { "rCH2",      {  14.027,  3,    0.01,   0.0025,   48,  27.15,    -26.8,    -3.68,   -6.03,    0.0854,    -8e-06,   -1.8e-08,   2.398 } },  // ring -CH2-
        { "rCH",       {  13.019,  2,  0.0122,   0.0004,   38,  21.78,     8.67,    40.99,   -20.5,     0.162,  -0.00016,   6.24e-08,   1.942 } },  // ring >CH-
        { "rC",        {  12.011,  1,  0.0042,   0.0061,   27,  21.32,    79.72,    87.88,   -90.9,     0.557,   -0.0009,   4.69e-07,   0.644 } },  // ring >C<
        { "F",         {  18.998,  1,  0.0111,  -0.0057,   27,  -0.03,  -251.92,  -247.19,    26.5,   -0.0913,  0.000191,  -1.03e-07,   -0.67 } },  // fluorine
        { "Cl",        {  35.453,  1,  0.0105,  -0.0049,   58,  38.13,   -71.55,   -64.31,    33.3,   -0.0963,  0.000187,  -9.96e-08,   4.532 } },  // chlorine
        { "Br",        {  79.904,  1,  0.0133,   0.0057,   71,  66.86,   -29.48,   -38.06,    28.6,   -0.0649,  0.000136,  -7.45e-08,   6.582 } },  // bromine
        { "I",         { 126.904,  1,  0.0068,  -0.0034,   97,  93.84,    21.06,     5.74,    32.1,   -0.0641,  0.000126,  -6.87e-08,    9.52 } },  // iodine
        { "OHar",      {  17.007,  2,   0.024,   0.0184,  -25,  76.34,  -221.65,  -197.37,   -2.81,     0.111, -0.000116,   4.94e-08,  12.499 } },  // phenolic -OH
        { "etherRing", {  15.999,  1,  0.0098,   0.0048,   13,  31.22,  -138.16,   -98.22,    12.2,   -0.0126,  6.03e-05,  -3.86e-08,   4.682 } },  // ring -O-
        { "ketoneRing",{  28.010,  2,  0.0284,   0.0028,   55,  94.97,   -164.5,  -126.27,    30.4,   -0.0829,  0.000236,  -1.31e-07,   6.645 } },  // ring >C=O
        { "Oother",    {  15.999,  1,  0.0143,   0.0101,   36,  -10.5,  -247.61,  -250.83,    6.82,    0.0196,  1.27e-05,  -1.78e-08,   5.909 } },  // =O other
        { "NH2",       {  16.023,  3,  0.0243,   0.0109,   38,  73.23,   -22.02,    14.07,    26.9,   -0.0412,  0.000164,  -9.76e-08,  10.788 } },  // primary amine
        { "NH",        {  15.015,  2,  0.0295,   0.0077,   35,  50.17,    53.47,    89.39,   -1.21,    0.0762, -4.86e-05,   1.05e-08,   6.436 } },  // secondary amine
        { "rNH",       {  15.015,  2,   0.013,   0.0114,   29,  52.82,    31.65,    75.61,    11.8,    -0.023,  0.000107,  -6.28e-08,    6.93 } },  // ring >NH
        { "N",         {  14.007,  1,  0.0169,   0.0074,    9,  11.74,   123.34,   163.16,   -31.1,     0.227,  -0.00032,   1.46e-07,   1.896 } },  // tertiary amine
        { "eN",        {  14.007,  1,  0.0255,  -0.0099,    0,   74.6,    23.61,        0,       0,         0,         0,          0,   3.335 } },  // =N- nonring (thermo lacks Vc/Cp/dGf -> 0; Gf/Cp unreliable for this group)
        { "reN",       {  14.007,  1,  0.0085,   0.0076,   34,  57.55,    55.52,    79.93,    8.83,  -0.00384,  4.35e-05,   -2.6e-08,   6.528 } },  // ring =N-
        { "CN",        {  26.018,  2,  0.0496,  -0.0101,   91, 125.66,    88.43,    89.22,    36.5,   -0.0733,  0.000184,  -1.03e-07,  12.851 } },  // nitrile
        { "NO2",       {  46.005,  3,  0.0437,   0.0064,   91, 152.54,   -66.57,   -16.83,    25.9,  -0.00374,  0.000129,  -8.88e-08,  16.738 } },  // nitro
        { "SH",        {  33.068,  2,  0.0031,   0.0084,   63,  63.56,   -17.33,   -22.99,    35.3,   -0.0758,  0.000185,  -1.03e-07,   6.884 } },  // thiol
        { "S",         {  32.060,  1,  0.0119,   0.0049,   54,  68.78,    41.87,    33.12,    19.6,  -0.00561,  4.02e-05,  -2.76e-08,   6.817 } },  // sulfide -S-
        { "rS",        {  32.060,  1,  0.0019,   0.0051,   38,   52.1,     39.1,    27.76,    16.7,   0.00481,  2.77e-05,  -2.11e-08,   5.984 } },  // ring -S-
    };
#endif  // former hard-coded table (now data/standards/joback/groups.dat)

// Lee-Kesler acentric factor from (Tb, Tc, Pc) -- Poling et al. eq. 2-3.4.
// Pc in atm; Tbr = Tb/Tc.

} // namespace

std::string Joback::version() const
{
    return tableId();
}

std::vector<std::string> Joback::knownGroups() const
{
    std::vector<std::string> out;
    for (const auto& kv : table()) out.push_back(kv.first);
    return out;
}

ConstantEstimate Joback::estimate(const std::vector<GroupSpec>& groups,
                                  bool& ok, std::string& error) const
{
    ok = true; error.clear();
    ConstantEstimate r;

    int nA = 0;
    double sTc = 0, sPc = 0, sVc = 0, sTb = 0, sHf = 0, sGf = 0, sHv = 0;
    double sa = 0, sb = 0, sc = 0, sd = 0, MW = 0;

    for (const auto& gs : groups)
    {
        auto it = table().find(gs.first);
        if (it == table().end())
        {
            ok = false;
            error = "unknown group '" + gs.first + "'.  Known groups: ";
            for (const auto& kv : table()) error += kv.first + " ";
            return r;
        }
        const Group& g = it->second;
        const int n = gs.second;
        nA += n * g.nA;  MW += n * g.MW;
        sTc += n * g.dTc;  sPc += n * g.dPc;  sVc += n * g.dVc;  sTb += n * g.dTb;
        sHf += n * g.dHf;  sGf += n * g.dGf;  sHv += n * g.dHv;
        sa  += n * g.a;    sb  += n * g.b;    sc  += n * g.c;    sd  += n * g.d;
        r.breakdown.push_back({ gs.first, n, g.dTb, g.dTc, g.dHf });
    }

    // ---- Joback correlations (identical to the historical inline version) ----
    r.MW     = MW;
    r.nA     = nA;
    r.Tb     = 198.2 + sTb;                                       // K
    r.Tc     = r.Tb / (0.584 + 0.965 * sTc - sTc * sTc);         // K
    r.Pc_bar = 1.0 / std::pow(0.113 + 0.0032 * nA - sPc, 2);     // bar
    r.Vc     = 17.5 + sVc;                                        // cm^3/mol
    r.Hf     = 68.29 + sHf;                                       // kJ/mol (ig)
    r.Gf     = 53.88 + sGf;                                       // kJ/mol (ig)
    r.Hvap   = 15.30 + sHv;                                       // kJ/mol at Tb
    r.cpa = sa - 37.93;  r.cpb = sb + 0.210;
    r.cpc = sc - 3.91e-4;  r.cpd = sd + 2.06e-7;
    r.omega  = closures::leeKeslerOmega(r.Tb, r.Tc, r.Pc_bar / 1.01325);

    return r;
}

} // namespace Choupo
