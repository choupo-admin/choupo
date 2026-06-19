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
-------------------------------------------------------------------------------
    IAPWS-IF97 kernel.  Every coefficient table below is transcribed from
    IAPWS R7-97(2012) with the release table number cited above it -- full
    published precision, no rounding.  verify() cross-checks the lot against
    the release's computer-program verification tables.
\*---------------------------------------------------------------------------*/

#include "IF97.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo
{
namespace IF97
{

namespace
{

// R in J/(kg K) for the SI-valued quantities (v from Pa, w in m/s).
constexpr double R_J = Rspec * 1.0e3;   // 461.526 J/(kg K)

// ============================================================================
// Region 1 -- basic equation g(p,T)/(RT) = sum n_i (7.1-pi)^I_i (tau-1.222)^J_i
// pi = p / 16.53 MPa, tau = 1386 K / T.    (release eq. 7)
// Coefficients: IAPWS R7-97(2012), Table 2 (34 terms).
// ============================================================================
constexpr int    I1[34] =
{
     0,  0,  0,  0,  0,  0,  0,  0,
     1,  1,  1,  1,  1,  1,
     2,  2,  2,  2,  2,
     3,  3,  3,
     4,  4,  4,
     5,
     8,  8,
    21, 23, 29, 30, 31, 32
};
constexpr int    J1[34] =
{
     -2,  -1,   0,   1,   2,   3,   4,   5,
     -9,  -7,  -1,   0,   1,   3,
     -3,   0,   1,   3,  17,
     -4,   0,   6,
     -5,  -2,  10,
     -8,
    -11,  -6,
    -29, -31, -38, -39, -40, -41
};
constexpr double n1[34] =
{
     0.14632971213167,      -0.84548187169114,      -0.37563603672040e1,
     0.33855169168385e1,    -0.95791963387872,       0.15772038513228,
    -0.16616417199501e-1,    0.81214629983568e-3,    0.28319080123804e-3,
    -0.60706301565874e-3,   -0.18990068218419e-1,   -0.32529748770505e-1,
    -0.21841717175414e-1,   -0.52838357969930e-4,   -0.47184321073267e-3,
    -0.30001780793026e-3,    0.47661393906987e-4,   -0.44141845330846e-5,
    -0.72694996297594e-15,  -0.31679644845054e-4,   -0.28270797985312e-5,
    -0.85205128120103e-9,   -0.22425281908000e-5,   -0.65171222895601e-6,
    -0.14341729937924e-12,  -0.40516996860117e-6,   -0.12734301741641e-8,
    -0.17424871230634e-9,   -0.68762131295531e-18,   0.14478307828521e-19,
     0.26335781662795e-22,  -0.11947622640071e-22,   0.18228094581404e-23,
    -0.93537087292458e-25
};

// ============================================================================
// Region 2 -- ideal-gas part gamma0 = ln pi + sum n0_i tau^J0_i
// pi = p / 1 MPa, tau = 540 K / T.          (release eq. 16)
// Coefficients: IAPWS R7-97(2012), Table 10 (9 terms).
// ============================================================================
constexpr int    J0[9] = { 0, 1, -5, -4, -3, -2, -1, 2, 3 };
constexpr double n0[9] =
{
    -0.96927686500217e1,     0.10086655968018e2,    -0.56087911283020e-2,
     0.71452738081455e-1,   -0.40710498223928,       0.14240819171444e1,
    -0.43839511319450e1,    -0.28408632460772,       0.21268463753307e-1
};

// ============================================================================
// Region 2 -- residual part gammar = sum n_i pi^I_i (tau-0.5)^J_i
//                                            (release eq. 17)
// Coefficients: IAPWS R7-97(2012), Table 11 (43 terms).
// ============================================================================
constexpr int    I2[43] =
{
     1,  1,  1,  1,  1,
     2,  2,  2,  2,  2,
     3,  3,  3,  3,  3,
     4,  4,  4,
     5,
     6,  6,  6,
     7,  7,  7,
     8,  8,
     9,
    10, 10, 10,
    16, 16,
    18,
    20, 20, 20,
    21, 22, 23,
    24, 24, 24
};
constexpr int    J2[43] =
{
     0,  1,  2,  3,  6,
     1,  2,  4,  7, 36,
     0,  1,  3,  6, 35,
     1,  2,  3,
     7,
     3, 16, 35,
     0, 11, 25,
     8, 36,
    13,
     4, 10, 14,
    29, 50,
    57,
    20, 35, 48,
    21, 53, 39,
    26, 40, 58
};
constexpr double n2[43] =
{
    -0.17731742473213e-2,   -0.17834862292358e-1,   -0.45996013696365e-1,
    -0.57581259083432e-1,   -0.50325278727930e-1,   -0.33032641670203e-4,
    -0.18948987516315e-3,   -0.39392777243355e-2,   -0.43797295650573e-1,
    -0.26674547914087e-4,    0.20481737692309e-7,    0.43870667284435e-6,
    -0.32277677238570e-4,   -0.15033924542148e-2,   -0.40668253562649e-1,
    -0.78847309559367e-9,    0.12790717852285e-7,    0.48225372718507e-6,
     0.22922076337661e-5,   -0.16714766451061e-10,  -0.21171472321355e-2,
    -0.23895741934104e2,    -0.59059564324270e-17,  -0.12621808899101e-5,
    -0.38946842435739e-1,    0.11256211360459e-10,  -0.82311340897998e1,
     0.19809712802088e-7,    0.10406965210174e-18,  -0.10234747095929e-12,
    -0.10018179379511e-8,   -0.80882908646985e-10,   0.10693031879409,
    -0.33662250574171,       0.89185845355421e-24,   0.30629316876232e-12,
    -0.42002467698208e-5,   -0.59056029685639e-25,   0.37826947613457e-5,
    -0.12768608934681e-14,   0.73087610595061e-28,   0.55414715350778e-16,
    -0.94369707241210e-6
};

// ============================================================================
// Region 4 -- saturation line (the explicit quadratic, release eq. 30/31).
// Coefficients: IAPWS R7-97(2012), Table 34 (10 terms).
// ============================================================================
constexpr double n4[10] =
{
     0.11670521452767e4,    -0.72421316703206e6,    -0.17073846940092e2,
     0.12020824702470e5,    -0.32325550322333e7,     0.14915108613530e2,
    -0.48232657361591e4,     0.40511340542057e6,    -0.23855557567849,
     0.65017534844798e3
};

// ============================================================================
// B23 boundary between regions 2 and 3 (release eq. 5/6).
// Coefficients: IAPWS R7-97(2012), Table 1 (5 terms).
// ============================================================================
constexpr double nB[5] =
{
     0.34805185628969e3,    -0.11671859879975e1,     0.10192970039326e-2,
     0.57254459862746e3,     0.13918839778870e2
};

// Crystal-clear refusal text helper: state names the input, message the box.
[[noreturn]] void refuse(const std::string& what, double p, double T,
                         const std::string& box)
{
    std::ostringstream os;
    os << "IF97: " << what << " at p = " << p / 1.0e6 << " MPa, T = " << T
       << " K -- " << box;
    throw std::runtime_error(os.str());
}

} // anonymous namespace

// ----------------------------------------------------------------------------
double psat(double T)
{
    if (!(T >= Tmin && T <= Tcrit))
    {
        std::ostringstream os;
        os << "IF97 region 4: psat(T) called at T = " << T
           << " K -- the saturation equation is valid for 273.15 K <= T <= "
              "647.096 K only (no extrapolation)";
        throw std::runtime_error(os.str());
    }
    // release eq. 29a + 30: theta = T + n9/(T - n10); psat from the quartic root
    const double th = T + n4[8] / (T - n4[9]);
    const double A  =        th * th + n4[0] * th + n4[1];
    const double B  = n4[2] * th * th + n4[3] * th + n4[4];
    const double C  = n4[5] * th * th + n4[6] * th + n4[7];
    const double x  = 2.0 * C / (-B + std::sqrt(B * B - 4.0 * A * C));
    return 1.0e6 * x * x * x * x;             // (.)^4 MPa -> Pa
}

// ----------------------------------------------------------------------------
double Tsat(double p)
{
    if (!(p >= psatTriple && p <= pcrit))
    {
        std::ostringstream os;
        os << "IF97 region 4: Tsat(p) called at p = " << p / 1.0e6
           << " MPa -- the backward saturation equation is valid for "
              "611.213 Pa <= p <= 22.064 MPa only (no extrapolation)";
        throw std::runtime_error(os.str());
    }
    // release eq. 29b + 31
    const double beta = std::pow(p / 1.0e6, 0.25);
    const double E    =        beta * beta + n4[2] * beta + n4[5];
    const double F    = n4[0] * beta * beta + n4[3] * beta + n4[6];
    const double G    = n4[1] * beta * beta + n4[4] * beta + n4[7];
    const double D    = 2.0 * G / (-F - std::sqrt(F * F - 4.0 * E * G));
    const double t    = n4[9] + D;
    return 0.5 * (t - std::sqrt(t * t - 4.0 * (n4[8] + n4[9] * D)));
}

// ----------------------------------------------------------------------------
double pB23(double T)
{
    if (!(T >= Tmax1 && T <= 863.15))
    {
        std::ostringstream os;
        os << "IF97 B23: pB23(T) called at T = " << T
           << " K -- the boundary equation is defined for 623.15 K <= T <= "
              "863.15 K only";
        throw std::runtime_error(os.str());
    }
    return 1.0e6 * (nB[0] + nB[1] * T + nB[2] * T * T);   // release eq. 5
}

// ----------------------------------------------------------------------------
double TB23(double p)
{
    const double piMPa = p / 1.0e6;
    // Floor = the boundary pressure at 623.15 K (~16.5291643 MPa), evaluated
    // from eq. 5 itself so the two directions agree to machine precision.
    const double piMin = nB[0] + nB[1] * Tmax1 + nB[2] * Tmax1 * Tmax1;
    if (!(piMPa >= piMin * (1.0 - 1.0e-12) && piMPa <= 100.0))
    {
        std::ostringstream os;
        os << "IF97 B23: TB23(p) called at p = " << piMPa
           << " MPa -- the boundary equation is defined for 16.5291643 MPa "
              "<= p <= 100 MPa only";
        throw std::runtime_error(os.str());
    }
    return nB[3] + std::sqrt((piMPa - nB[4]) / nB[2]);    // release eq. 6
}

// ----------------------------------------------------------------------------
int pT_region(double p, double T)
{
    static const std::string validBox =
        "valid regions in this slice: region 1 (273.15 K <= T <= 623.15 K, "
        "psat(T) <= p <= 100 MPa), region 2 (273.15 K <= T <= 623.15 K with "
        "p <= psat(T); 623.15 K < T <= 863.15 K with p <= pB23(T); up to "
        "1073.15 K with p <= 100 MPa), region 4 (the saturation line)";

    if (!(p > 0.0 && p <= pmax))
        refuse("pressure outside the IF97 box (0 < p <= 100 MPa)", p, T,
               validBox);
    if (T < Tmin)
        refuse("temperature below the IF97 box (T >= 273.15 K)", p, T,
               validBox);
    if (T > Tmax12)
    {
        if (T <= 2273.15 && p <= 50.0e6)
            refuse("IF97 region 5 (1073.15 K < T <= 2273.15 K, p <= 50 MPa) "
                   "not implemented in this slice", p, T, validBox);
        refuse("temperature above the IF97 box (T <= 2273.15 K, and p <= "
               "50 MPa above 1073.15 K)", p, T, validBox);
    }

    if (T <= Tmax1)
        return p >= psat(T) ? 1 : 2;          // saturation line -> liquid side

    // 623.15 K < T <= 1073.15 K: region 2 below B23, region 3 above it.
    if (T <= 863.15 && p > pB23(T))
        refuse("IF97 region 3 (623.15 K < T < T_B23, near-critical) not "
               "implemented in this slice", p, T, validBox);
    return 2;
}

// ----------------------------------------------------------------------------
Props region1(double p, double T)
{
    const double pi  = p / 16.53e6;           // release eq. 7
    const double tau = 1386.0 / T;
    const double a   = 7.1 - pi;              // both > 0 inside the region
    const double b   = tau - 1.222;

    double g = 0, gp = 0, gpp = 0, gt = 0, gtt = 0, gpt = 0;
    for (int i = 0; i < 34; ++i)
    {
        const double Ii = I1[i], Ji = J1[i];
        const double pa  = std::pow(a, Ii);
        const double tb  = std::pow(b, Ji);
        const double pa1 = std::pow(a, Ii - 1.0);
        const double tb1 = std::pow(b, Ji - 1.0);
        g   += n1[i] * pa * tb;
        gp  -= n1[i] * Ii * pa1 * tb;                          // d/dpi: chain on (7.1-pi)
        gpp += n1[i] * Ii * (Ii - 1.0) * std::pow(a, Ii - 2.0) * tb;
        gt  += n1[i] * pa * Ji * tb1;
        gtt += n1[i] * pa * Ji * (Ji - 1.0) * std::pow(b, Ji - 2.0);
        gpt -= n1[i] * Ii * pa1 * Ji * tb1;
    }

    // release Table 3: the property relations for a Gibbs-form region
    Props r;
    r.region = 1;
    r.v   = R_J * T * pi * gp / p;
    r.rho = 1.0 / r.v;
    r.h   = Rspec * T * tau * gt;
    r.u   = Rspec * T * (tau * gt - pi * gp);
    r.s   = Rspec * (tau * gt - g);
    r.cp  = -Rspec * tau * tau * gtt;
    const double d = gp - tau * gpt;          // (gamma_pi - tau gamma_pitau)
    r.cv  = Rspec * (-tau * tau * gtt + d * d / gpp);
    r.w   = std::sqrt(R_J * T * gp * gp
                      / (d * d / (tau * tau * gtt) - gpp));
    return r;
}

// ----------------------------------------------------------------------------
Props region2(double p, double T)
{
    const double pi  = p / 1.0e6;             // release eq. 15-17
    const double tau = 540.0 / T;

    // ideal-gas part (eq. 16): gamma0 = ln pi + sum n0 tau^J0
    double g0 = std::log(pi), g0t = 0, g0tt = 0;
    for (int i = 0; i < 9; ++i)
    {
        const double Ji = J0[i];
        g0   += n0[i] * std::pow(tau, Ji);
        g0t  += n0[i] * Ji * std::pow(tau, Ji - 1.0);
        g0tt += n0[i] * Ji * (Ji - 1.0) * std::pow(tau, Ji - 2.0);
    }
    // gamma0_pi = 1/pi, gamma0_pipi = -1/pi^2, gamma0_pitau = 0  (Table 13)

    // residual part (eq. 17), in (tau - 0.5)
    const double b = tau - 0.5;
    double gr = 0, grp = 0, grpp = 0, grt = 0, grtt = 0, grpt = 0;
    for (int i = 0; i < 43; ++i)
    {
        const double Ii = I2[i], Ji = J2[i];
        const double pp  = std::pow(pi, Ii);
        const double tb  = std::pow(b, Ji);
        const double pp1 = std::pow(pi, Ii - 1.0);
        const double tb1 = std::pow(b, Ji - 1.0);
        gr   += n2[i] * pp * tb;
        grp  += n2[i] * Ii * pp1 * tb;
        grpp += n2[i] * Ii * (Ii - 1.0) * std::pow(pi, Ii - 2.0) * tb;
        grt  += n2[i] * pp * Ji * tb1;
        grtt += n2[i] * pp * Ji * (Ji - 1.0) * std::pow(b, Ji - 2.0);
        grpt += n2[i] * Ii * pp1 * Ji * tb1;
    }

    // release Table 12/13: properties from gamma = gamma0 + gammar
    Props r;
    r.region = 2;
    r.v   = R_J * T / p * (1.0 + pi * grp);   // pi*gamma0_pi = 1
    r.rho = 1.0 / r.v;
    r.h   = Rspec * T * tau * (g0t + grt);
    r.u   = Rspec * T * (tau * (g0t + grt) - (1.0 + pi * grp));
    r.s   = Rspec * (tau * (g0t + grt) - (g0 + gr));
    r.cp  = -Rspec * tau * tau * (g0tt + grtt);
    const double d = 1.0 + pi * grp - tau * pi * grpt;
    r.cv  = Rspec * (-tau * tau * (g0tt + grtt)
                     - d * d / (1.0 - pi * pi * grpp));
    r.w   = std::sqrt(R_J * T * (1.0 + 2.0 * pi * grp + pi * pi * grp * grp)
                      / ((1.0 - pi * pi * grpp)
                         + d * d / (tau * tau * (g0tt + grtt))));
    return r;
}

// ----------------------------------------------------------------------------
Props props(double p, double T)
{
    return pT_region(p, T) == 1 ? region1(p, T) : region2(p, T);
}

// ----------------------------------------------------------------------------
double verify()
{
    double maxDev = 0.0;
    auto dev = [&maxDev](double computed, double published)
    {
        const double d = std::fabs(computed - published) / std::fabs(published);
        if (d > maxDev) maxDev = d;
    };
    auto state = [&dev](const Props& r, double v, double h, double u,
                        double s, double cp, double w)
    {
        dev(r.v, v); dev(r.h, h); dev(r.u, u);
        dev(r.s, s); dev(r.cp, cp); dev(r.w, w);
    };

    // Region 1 -- release Table 5 (v, h, u, s, cp, w at three states)
    state(region1(3.0e6, 300.0),
          0.100215168e-2, 0.115331273e3, 0.112324818e3,
          0.392294792,    0.417301218e1, 0.150773921e4);
    state(region1(80.0e6, 300.0),
          0.971180894e-3, 0.184142828e3, 0.106448356e3,
          0.368563852,    0.401008987e1, 0.163469054e4);
    state(region1(3.0e6, 500.0),
          0.120241800e-2, 0.975542239e3, 0.971934985e3,
          0.258041912e1,  0.465580682e1, 0.124071337e4);

    // Region 2 -- release Table 15
    state(region2(0.0035e6, 300.0),
          0.394913866e2,  0.254991145e4, 0.241169160e4,
          0.852238967e1,  0.191300162e1, 0.427920172e3);
    state(region2(0.0035e6, 700.0),
          0.923015898e2,  0.333568375e4, 0.301262819e4,
          0.101749996e2,  0.208141274e1, 0.644289068e3);
    state(region2(30.0e6, 700.0),
          0.542946619e-2, 0.263149474e4, 0.246861076e4,
          0.517540298e1,  0.103505092e2, 0.480386523e3);

    // Region 4 forward -- release Table 35 (psat in MPa)
    dev(psat(300.0) / 1.0e6, 0.353658941e-2);
    dev(psat(500.0) / 1.0e6, 0.263889776e1);
    dev(psat(600.0) / 1.0e6, 0.123443146e2);

    // Region 4 backward -- release Table 36 (Tsat in K)
    dev(Tsat(0.1e6),  0.372755919e3);
    dev(Tsat(1.0e6),  0.453035632e3);
    dev(Tsat(10.0e6), 0.584149488e3);

    // B23 -- release section 4 verification point (both directions)
    dev(pB23(0.623150000e3) / 1.0e6, 0.165291643e2);
    dev(TB23(0.165291643e2 * 1.0e6), 0.623150000e3);

    return maxDev;
}

} // namespace IF97
} // namespace Choupo
