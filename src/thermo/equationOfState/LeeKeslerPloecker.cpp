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

#include "LeeKeslerPloecker.H"

#include "core/Advisory.H"
#include "thermo/ThermoAnnounce.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace Choupo {

//  LK Table 1, p. 511, read from the page image.  d1 and d2 are printed
//  "x 10^4"; they are stored here multiplied out.
const LeeKeslerPloecker::Fluid LeeKeslerPloecker::simpleFluid =
{
    0.1181193,  0.265728,   0.154790,   0.030323,     // b1 b2 b3 b4
    0.0236744,  0.0186984,  0.0,        0.042724,     // c1 c2 c3 c4
    0.155488e-4, 0.623689e-4,                         // d1 d2
    0.65392,    0.060167                              // beta gamma
};

const LeeKeslerPloecker::Fluid LeeKeslerPloecker::referenceFluid =
{
    0.2026579,  0.331511,   0.027655,   0.203488,
    0.0313385,  0.0503618,  0.016901,   0.041577,
    0.48736e-4, 0.0740336e-4,
    1.226,      0.03754
};

namespace {

//  Eq. (3): Z of ONE fluid at (T_r, V_r).
scalar zBwr(const LeeKeslerPloecker::Fluid& f, scalar Tr, scalar Vr)
{
    const scalar B = f.b1 - f.b2/Tr - f.b3/(Tr*Tr) - f.b4/(Tr*Tr*Tr);
    const scalar C = f.c1 - f.c2/Tr + f.c3/(Tr*Tr*Tr);
    const scalar D = f.d1 + f.d2/Tr;
    const scalar V2 = Vr*Vr;
    return 1.0 + B/Vr + C/V2 + D/(V2*V2*Vr)
         + f.c4/(Tr*Tr*Tr*V2) * (f.beta + f.gamma/V2) * std::exp(-f.gamma/V2);
}

//  g(V_r) = Z_BWR - P_r V_r/T_r: positive at small V_r (the D/V_r^5 wall),
//  negative at large V_r.  A sign change + to - with growing V_r is a STABLE
//  root; the first such change is the liquid root, the last the vapour root.
struct Gfun
{
    const LeeKeslerPloecker::Fluid& f;
    scalar Tr, Pr;
    scalar operator()(scalar Vr) const { return zBwr(f, Tr, Vr) - Pr*Vr/Tr; }
};

scalar bisect(const Gfun& g, scalar lo, scalar hi)   // g(lo) >= 0 > g(hi)
{
    for (int it = 0; it < 200; ++it)
    {
        const scalar mid = std::sqrt(lo*hi);          // geometric: V_r spans decades
        if (g(mid) >= 0.0) lo = mid; else hi = mid;
        if (hi - lo <= 1.0e-15*hi) break;
    }
    return 0.5*(lo + hi);
}

constexpr scalar scanStep = 1.02;     // ratio of the geometric V_r scan

}  // namespace

void LeeKeslerPloecker::roots(const Fluid& f, scalar Tr, scalar Pr,
                              scalar& VrLiquid, scalar& VrVapour)
{
    const Gfun g{f, Tr, Pr};

    //  liquid: scan UP from the repulsive wall to the first + -> - change
    {
        scalar prev = 1.0e-3;
        if (!(g(prev) > 0.0))
            throw std::runtime_error("LeeKeslerPloecker: eq. (3) is not"
                " positive at V_r = 1e-3 (T_r = " + std::to_string(Tr) + ")");
        scalar cur = prev;
        bool found = false;
        while (cur < 1.0e13)
        {
            cur = prev * scanStep;
            if (g(cur) <= 0.0) { found = true; break; }
            prev = cur;
        }
        if (!found)
            throw std::runtime_error("LeeKeslerPloecker: no volume root of"
                " eq. (3) at T_r = " + std::to_string(Tr) + ", P_r = "
                + std::to_string(Pr));
        VrLiquid = bisect(g, prev, cur);
    }

    //  vapour: scan DOWN from far above the ideal-gas V_r = T_r/P_r
    {
        scalar hi = 4.0 * std::max(Tr/Pr, 1.0e-3);
        for (int k = 0; k < 40 && g(hi) >= 0.0; ++k) hi *= 4.0;
        scalar lo = hi;
        bool found = false;
        while (lo > 1.0e-3)
        {
            lo = hi / scanStep;
            if (g(lo) >= 0.0) { found = true; break; }
            hi = lo;
        }
        if (!found)
            throw std::runtime_error("LeeKeslerPloecker: no vapour root of"
                " eq. (3) at T_r = " + std::to_string(Tr) + ", P_r = "
                + std::to_string(Pr));
        VrVapour = bisect(g, lo, hi);
    }
    if (VrVapour < VrLiquid) VrVapour = VrLiquid;     // round-off at a single root
}

LeeKeslerPloecker::Reduced
LeeKeslerPloecker::reduced(const Fluid& f, scalar Tr, scalar Pr, bool liquidRoot)
{
    if (!(Tr > 0.0) || !(Pr > 0.0))
        throw std::runtime_error("LeeKeslerPloecker: T_r and P_r must be"
            " positive (T_r = " + std::to_string(Tr) + ", P_r = "
            + std::to_string(Pr) + ")");
    scalar Vl, Vv;
    roots(f, Tr, Pr, Vl, Vv);
    Reduced r;
    r.Vr = liquidRoot ? Vl : Vv;
    const scalar Vr = r.Vr;
    r.Z = Pr * Vr / Tr;

    const scalar T2 = Tr*Tr, T3 = T2*Tr;
    const scalar V2 = Vr*Vr, V5 = V2*V2*Vr;
    const scalar B = f.b1 - f.b2/Tr - f.b3/T2 - f.b4/T3;
    const scalar C = f.c1 - f.c2/Tr + f.c3/T3;
    const scalar D = f.d1 + f.d2/Tr;
    const scalar ex = std::exp(-f.gamma/V2);
    const scalar E = f.c4/(2.0*T3*f.gamma)
                   * (f.beta + 1.0 - (f.beta + 1.0 + f.gamma/V2) * ex);   // (10)

    r.lnPhi = r.Z - 1.0 - std::log(r.Z) + B/Vr + C/(2.0*V2) + D/(5.0*V5) + E;   // (9)
    r.hOverRT = r.Z - 1.0
              - (f.b2 + 2.0*f.b3/Tr + 3.0*f.b4/T2)/(Tr*Vr)
              - (f.c2 - 3.0*f.c3/T2)/(2.0*Tr*V2)
              + f.d2/(5.0*Tr*V5) + 3.0*E;                                  // (11)
    r.sOverR = std::log(r.Z)
             - (f.b1 + f.b3/T2 + 2.0*f.b4/T3)/Vr
             - (f.c1 - 2.0*f.c3/T3)/(2.0*V2)
             - f.d1/(5.0*V5) + 2.0*E;                                      // (12)
    return r;
}

LeeKeslerPloecker::Blend
LeeKeslerPloecker::blend(scalar Tr, scalar Pr, scalar omega, bool liquidRoot)
{
    Blend b;
    b.simple    = reduced(simpleFluid,    Tr, Pr, liquidRoot);
    b.reference = reduced(referenceFluid, Tr, Pr, liquidRoot);
    const scalar w = omega / omegaRef;                                     // (2)
    auto mix = [w](scalar q0, scalar qr) { return q0 + w*(qr - q0); };
    b.Z       = mix(b.simple.Z,       b.reference.Z);
    b.lnPhi   = mix(b.simple.lnPhi,   b.reference.lnPhi);
    b.hOverRT = mix(b.simple.hOverRT, b.reference.hOverRT);
    b.sOverR  = mix(b.simple.sOverR,  b.reference.sOverR);
    b.dLnPhiDomega = (b.reference.lnPhi - b.simple.lnPhi) / omegaRef;      // (A8)
    return b;
}

// ---- construction -----------------------------------------------------------

LeeKeslerPloecker::LeeKeslerPloecker(const DictPtr& dict,
                                     const std::vector<Component>& comps)
  : n_(comps.size())
{
    Tc_.resize(n_); Vc_.resize(n_); omega_.resize(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const Component& c = comps[i];
        const scalar Tc = c.Tc(), Pc = c.Pc() * 1.0e5, om = c.omega();
        if (!(Tc > 0.0) || !(Pc > 0.0))
            throw std::runtime_error("LeeKeslerPloecker: component '" + c.name()
                + "' has no critical constants (Tc, Pc) -- the correlation is"
                  " written in them");
        //  PKP p. 325: hydrogen and helium carry temperature-dependent
        //  EFFECTIVE critical constants (Gunn, Chueh & Prausnitz 1966) that
        //  this model does not carry.  Refuse by name rather than price them
        //  with their true constants.
        if (Tc < 35.0)
            throw std::runtime_error("LeeKeslerPloecker: component '" + c.name()
                + "' (Tc = " + std::to_string(Tc) + " K) is a quantum gas;"
                  " Ploecker, Knapp & Prausnitz (1978, p. 325) price hydrogen"
                  " and helium with temperature-dependent effective critical"
                  " constants (Gunn et al. 1966), which this model does not"
                  " carry.  Use SRK or PengRobinson, or declare the effective"
                  " constants as a component of their own.");
        Tc_[i]    = Tc;
        omega_[i] = om;
        Vc_[i]    = (0.2905 - 0.085*om) * constant::R * Tc / Pc;   // LK (20),(21)
    }

    kappa_.assign(n_*n_, 1.0);
    std::set<std::pair<std::size_t, std::size_t>> declared;
    if (dict && dict->found("binaryInteractions"))
    {
        for (const auto& entry : dict->lookupDictList("binaryInteractions"))
        {
            const std::string iName = entry->lookupWord("i");
            const std::string jName = entry->lookupWord("j");
            const scalar k = entry->lookupScalar("kij");
            std::size_t a = n_, b = n_;
            for (std::size_t m = 0; m < n_; ++m)
            {
                if (comps[m].name() == iName) a = m;
                if (comps[m].name() == jName) b = m;
            }
            if (a == n_ || b == n_)
                throw std::runtime_error("LeeKeslerPloecker: binaryInteractions"
                    " references unknown component '"
                    + (a == n_ ? iName : jName) + "'");
            if (a == b)
                throw std::runtime_error("LeeKeslerPloecker: kappa_" + iName
                    + "," + jName + " names one component twice");
            if (!(k > 0.0))
                throw std::runtime_error("LeeKeslerPloecker: kappa(" + iName
                    + "," + jName + ") = " + std::to_string(k) + " -- kappa is"
                      " the MULTIPLIER of the geometric-mean T_c (PKP Eq. 12),"
                      " 1 = none; a value that is not positive is a k_ij of the"
                      " cubic's convention, which this model does not use");
            kappa_[a*n_ + b] = k;
            kappa_[b*n_ + a] = k;
            declared.insert({std::min(a, b), std::max(a, b)});
            if (thermoAnnounce()
                && AdvisoryLog::instance().add("thermo", "info",
                       "kappa(" + iName + "," + jName + ")",
                       name_ + " kappa(" + iName + "," + jName + ") = "
                       + std::to_string(k)))
                std::cout << "[eos] kappa(" << iName << "," << jName << ") = "
                          << k << "  (Ploecker, Knapp & Prausnitz 1978, Eq. 12)\n";
        }
    }
    std::string undeclared, declaredList;
    std::size_t nUndeclared = 0;
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = i + 1; j < n_; ++j)
            if (declared.count({i, j}))
            {
                std::ostringstream k;
                k << comps[i].name() << "-" << comps[j].name() << " "
                  << kappa_[i*n_ + j];
                declaredList += (declaredList.empty() ? "" : ", ") + k.str();
            }
            else
            {
                undeclared += (undeclared.empty() ? "" : ", ")
                            + comps[i].name() + "-" + comps[j].name();
                ++nUndeclared;
            }
    if (nUndeclared > 0)
    {
        std::ostringstream msg;
        msg << name_ << ": no kappa declared for " << nUndeclared
            << " pair(s) (" << undeclared << ") -- each runs kappa = 1, the"
               " geometric-mean T_c that PKP's Eq. 12 reduces to for a symmetric"
               " pair (predictive-degraded for an asymmetric one: methane"
               " against a heavy alkane has kappa 1.2-1.5 in PKP Table I,"
               " p. 327, and PKP Figures 10-13 estimate an unlisted pair from"
               " a graph that is not read here); curated pairs live in"
               " parameters/LKP/ and are declared in the case's"
               " binaryInteractions block";
        if (thermoAnnounce()
            && AdvisoryLog::instance().add("thermo", "warning",
                   name_ + " kappa default", msg.str()))
            std::cout << "[eos] " << msg.str() << "\n";
    }

    mixingNote_ = "mixing rule Ploecker-Knapp-Prausnitz (one fluid, eta = 0.25,"
                  " V_c from LK Eq. 20-21): kappa declared: "
                + (declaredList.empty() ? std::string("none") : declaredList)
                + "; kappa = 1 (UNDECLARED default, announced): "
                + (undeclared.empty() ? std::string("none") : undeclared);

    Tcjk_.resize(n_*n_); Vcjk_.resize(n_*n_);
    for (std::size_t j = 0; j < n_; ++j)
        for (std::size_t k = 0; k < n_; ++k)
        {
            const scalar vj = std::cbrt(Vc_[j]), vk = std::cbrt(Vc_[k]);
            Vcjk_[j*n_ + k] = 0.125 * (vj + vk) * (vj + vk) * (vj + vk);   // (13)
            Tcjk_[j*n_ + k] = std::sqrt(Tc_[j]*Tc_[k]) * kappa_[j*n_ + k]; // (12)
        }
}

// ---- the one-fluid pseudo-critical constants and their derivatives ------------

LeeKeslerPloecker::Pseudo
LeeKeslerPloecker::pseudo(const sVector& z, std::size_t dep) const
{
    Pseudo p;
    scalar vc = 0.0, s = 0.0, om = 0.0;
    for (std::size_t j = 0; j < n_; ++j)
    {
        om += z[j] * omega_[j];
        for (std::size_t k = 0; k < n_; ++k)
        {
            const scalar zz = z[j]*z[k];
            vc += zz * Vcjk_[j*n_ + k];                                    // (10)
            s  += zz * std::pow(Vcjk_[j*n_ + k], eta) * Tcjk_[j*n_ + k];
        }
    }
    p.Vc    = vc;
    p.Tc    = s / std::pow(vc, eta);                                       // (9)
    p.omega = om;                                                          // (11)
    const scalar zc = 0.2905 - 0.085*om;
    p.Pc    = zc * constant::R * p.Tc / p.Vc;                              // (14)

    p.dTc.assign(n_, 0.0); p.dVc.assign(n_, 0.0);
    p.dPc.assign(n_, 0.0); p.dOmega.assign(n_, 0.0);
    if (dep >= n_) return p;
    const std::size_t i = dep;
    for (std::size_t j = 0; j < n_; ++j)
    {
        if (j == i) continue;
        scalar dV = 0.0, dS = 0.0;
        for (std::size_t l = 0; l < n_; ++l)
        {
            dV += z[l] * (Vcjk_[l*n_ + j] - Vcjk_[l*n_ + i]);              // (A10)
            dS += z[l] * (std::pow(Vcjk_[l*n_ + j], eta) * Tcjk_[l*n_ + j]
                        - std::pow(Vcjk_[l*n_ + i], eta) * Tcjk_[l*n_ + i]);
        }
        dV *= 2.0; dS *= 2.0;
        const scalar dT = (dS - eta*std::pow(p.Vc, eta - 1.0)*dV*p.Tc)
                        / std::pow(p.Vc, eta);                             // (A9)
        const scalar dOm = omega_[j] - omega_[i];                          // (A13)
        const scalar dzc = -0.085*dOm;                                     // (A12)
        p.dVc[j] = dV; p.dTc[j] = dT; p.dOmega[j] = dOm;
        p.dPc[j] = p.Pc * (dzc/zc + dT/p.Tc - dV/p.Vc);                    // (A11)
    }
    return p;
}

void LeeKeslerPloecker::warnWindow(scalar Tr, scalar Pr) const
{
    if (Tr >= 0.3 && Tr <= 4.0 && Pr <= 10.0) return;
    if (!thermoAnnounce()) return;
    std::ostringstream msg;
    msg << name_ << ": T_r = " << Tr << ", P_r = " << Pr << " lies outside the"
           " window the correlation was fitted on (Lee & Kesler 1975, p. 510:"
           " T_r 0.3-4, P_r 0-10); the value is an EXTRAPOLATION of eq. (3)";
    if (AdvisoryLog::instance().add("thermo", "warning",
            name_ + " window", msg.str()))
        std::cout << "[eos] " << msg.str() << "\n";
}

LeeKeslerPloecker::State
LeeKeslerPloecker::state(scalar T, scalar P, const sVector& y, bool liquidRoot) const
{
    if (y.size() != n_)
        throw std::runtime_error("LeeKeslerPloecker: composition size mismatch");
    scalar s = 0.0;
    for (scalar v : y) s += v;
    if (!(s > 0.0))
        throw std::runtime_error("LeeKeslerPloecker: composition sums to zero");
    sVector z(n_);
    for (std::size_t i = 0; i < n_; ++i) z[i] = y[i] / s;

    State st;
    st.p  = pseudo(z, n_);
    st.Tr = T / st.p.Tc;
    st.Pr = P / st.p.Pc;
    warnWindow(st.Tr, st.Pr);
    st.b  = blend(st.Tr, st.Pr, st.p.omega, liquidRoot);
    return st;
}

// ---- the EquationOfState surface ---------------------------------------------

namespace {
sVector normalised(const sVector& y)
{
    scalar s = 0.0;
    for (scalar v : y) s += v;
    sVector z(y.size());
    for (std::size_t i = 0; i < y.size(); ++i) z[i] = (s > 0.0) ? y[i]/s : 0.0;
    return z;
}
}

//  ln phi_i of every component on the requested root (A7).
sVector LeeKeslerPloecker::phiAt(scalar T, scalar P, const sVector& y,
                                 bool liquidRoot) const
{
    const State st = state(T, P, y, liquidRoot);
    const sVector z = normalised(y);
    const scalar hT  = st.b.hOverRT / st.p.Tc;
    const scalar zm1 = (st.b.Z - 1.0) / st.p.Pc;
    sVector out(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const Pseudo pi = pseudo(z, i);
        scalar sum = 0.0;
        for (std::size_t j = 0; j < n_; ++j)
        {
            if (j == i) continue;
            sum += z[j] * ( hT * pi.dTc[j] - zm1 * pi.dPc[j]
                          + st.b.dLnPhiDomega * pi.dOmega[j] );
        }
        out[i] = std::exp(st.b.lnPhi - sum);
    }
    return out;
}

sVector LeeKeslerPloecker::phi(scalar T, scalar P, const sVector& y) const
{
    return phiAt(T, P, y, false);
}

sVector LeeKeslerPloecker::phiLiquid(scalar T, scalar P, const sVector& y) const
{
    return phiAt(T, P, y, true);
}

scalar LeeKeslerPloecker::Z(scalar T, scalar P, const sVector& y) const
{
    return state(T, P, y, false).b.Z;
}

scalar LeeKeslerPloecker::molarVolume(scalar T, scalar P, const sVector& y) const
{
    return Z(T, P, y) * constant::R * T / P;
}

scalar LeeKeslerPloecker::molarVolumeLiquid(scalar T, scalar P, const sVector& y) const
{
    return state(T, P, y, true).b.Z * constant::R * T / P;
}

//  Vapour root, the family contract.  Eq. (11) is the departure at (T, P).
scalar LeeKeslerPloecker::H_residual(scalar T, scalar P, const sVector& y) const
{
    return constant::R * T * state(T, P, y, false).b.hOverRT;
}

//  Eq. (12) is already the (T, P) departure against the ideal gas at the same P.
scalar LeeKeslerPloecker::S_residual(scalar T, scalar P, const sVector& y) const
{
    return constant::R * state(T, P, y, false).b.sOverR;
}

//  PSEUDO-ROOT flags: eq. (3) has ONE root for either fluid; the root belongs
//  to the phase its V_r says (0.29 = the simple fluid's P_c V/(R T_c) at the
//  critical point).  A classification only -- the value never changes.
bool LeeKeslerPloecker::vapourRootIsPseudo(scalar T, scalar P, const sVector& y) const
{
    const State st = state(T, P, y, false);
    for (const Fluid* f : { &simpleFluid, &referenceFluid })
    {
        scalar Vl, Vv;
        roots(*f, st.Tr, st.Pr, Vl, Vv);
        if (std::abs(Vv - Vl) <= 1.0e-9*Vv && Vv < 0.29) return true;
    }
    return false;
}

bool LeeKeslerPloecker::liquidRootIsPseudo(scalar T, scalar P, const sVector& y) const
{
    const State st = state(T, P, y, true);
    for (const Fluid* f : { &simpleFluid, &referenceFluid })
    {
        scalar Vl, Vv;
        roots(*f, st.Tr, st.Pr, Vl, Vv);
        if (std::abs(Vv - Vl) <= 1.0e-9*Vv && Vv >= 0.29) return true;
    }
    return false;
}

} // namespace Choupo
