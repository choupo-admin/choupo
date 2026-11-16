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

#include "CubicEoS.H"

#include "core/Advisory.H"
#include "thermo/ThermoAnnounce.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <stdexcept>
#include <sstream>
#include <utility>

namespace Choupo {

namespace {
    // Cube root with sign preservation.
    scalar cbrt_signed(scalar x)
    {
        return (x >= 0.0) ? std::cbrt(x) : -std::cbrt(-x);
    }
}

CubicEoS::CubicEoS(const std::string& name, const Constants& c,
                   const std::vector<Component>& comps,
                   const std::vector<scalar>& slope,
                   std::unique_ptr<CubicMixingRule> rule,
                   const std::vector<scalar>& volumeShift,
                   const AlphaChoice& alpha)
  : name_(name), c_(c), n_(comps.size()), rule_(std::move(rule)),
    cShift_(volumeShift)
{
    if (!rule_)
        throw std::runtime_error(name_ + ": no mixing rule given");
    if (!cShift_.empty())
    {
        if (cShift_.size() != n_)
            throw std::runtime_error(
                name_ + ": volume-translation shift list size mismatch");
        for (const auto& comp : comps) cNames_.push_back(comp.name());
    }
    pure_.reserve(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const Component& comp = comps[i];
        const scalar Tc    = comp.Tc();
        const scalar Pc_Pa = comp.Pc() * 1.0e5;       // Pc is stored in bar
        if (Tc <= 0.0 || Pc_Pa <= 0.0)
            throw std::runtime_error(
                name_ + ": component '" + comp.name() + "' is missing Tc or Pc");

        PureParams p;
        p.Tc  = Tc;
        p.a_c = c_.omegaA * constant::R * constant::R * Tc * Tc / Pc_Pa;
        p.b   = c_.omegaB * constant::R * Tc / Pc_Pa;
        p.m   = slope.at(i);
        if (alpha.mathiasCopeman)
        {
            p.mc = true;
            p.c1 = alpha.fit.at(i).c1;
            p.c2 = alpha.fit.at(i).c2;
            p.c3 = alpha.fit.at(i).c3;
        }
        pure_.push_back(p);
    }
}

void CubicEoS::mathiasCopemanG(scalar T, scalar Tc, scalar c1, scalar c2,
                               scalar c3, scalar& g, scalar& dgdT,
                               scalar& d2gdT2)
{
    const scalar rt   = std::sqrt(T / Tc);
    const scalar x    = 1.0 - rt;
    const scalar dxdT = -1.0 / (2.0 * std::sqrt(T * Tc));
    //  d2x/dT2 = +1 / (4 sqrt(Tc) T^(3/2))
    const scalar d2xdT2 = 1.0 / (4.0 * std::sqrt(Tc) * T * std::sqrt(T));
    if (T <= Tc)
    {
        g      = 1.0 + x * (c1 + x * (c2 + x * c3));
        const scalar dg_dx   = c1 + x * (2.0 * c2 + 3.0 * c3 * x);
        const scalar d2g_dx2 = 2.0 * c2 + 6.0 * c3 * x;
        dgdT   = dg_dx * dxdT;
        d2gdT2 = d2g_dx2 * dxdT * dxdT + dg_dx * d2xdT2;
    }
    else
    {
        g      = 1.0 + c1 * x;
        dgdT   = c1 * dxdT;
        d2gdT2 = c1 * d2xdT2;
    }
}

CubicEoS::AlphaChoice
CubicEoS::readAlpha(const std::string& model, const DictPtr& eosDict,
                    const std::vector<Component>& comps)
{
    AlphaChoice out;
    const std::string def = (model == "PR") ? "PR78" : "Soave";
    const std::string w = eosDict->found("alphaFunction")
                        ? eosDict->lookupWord("alphaFunction") : def;
    if (w == def) return out;
    if (w != "MathiasCopeman")
        throw std::runtime_error(model + ": alphaFunction '" + w
            + "' -- implemented: " + def + " (default) | MathiasCopeman");

    const std::string cubic = (model == "PR") ? "PengRobinson" : model;
    std::ostringstream fits;
    for (const auto& c : comps)
    {
        const Component::CubicAlphaFit* f = c.cubicAlphaFit(cubic);
        if (!f)
            throw std::runtime_error(model + ": alphaFunction MathiasCopeman"
                " needs the record of component '" + c.name() + "' to carry a"
                " cubicAlpha." + cubic + " block (its constants are fitted to"
                " the record's own vapour-pressure law, never typed); run"
                " `bin/curate/fit_alpha_function.py " + c.name() + " --cubic "
                + cubic + "` and re-seal the case, or keep the default alpha"
                " function (" + def + ").");
        out.fit.push_back(*f);
        fits << "\n[eos]   " << c.name() << ": c1 = " << f->c1 << ", c2 = "
             << f->c2 << ", c3 = " << f->c3 << "  (fitted to its own vapour-"
             << "pressure law over " << f->Tlow << "-" << f->Thigh
             << " K; above Tc the Soave branch with c1 only)";
    }
    out.mathiasCopeman = true;
    const std::string msg = model + " alpha function: MathiasCopeman"
        " (Poling et al., 5th ed., Table 4-7), not " + def + fits.str();
    if (thermoAnnounce()
        && AdvisoryLog::instance().add("thermo", "info",
               model + " alphaFunction MathiasCopeman", msg))
        std::cout << "[eos] " << msg << "\n";
    return out;
}

std::string CubicEoS::alphaFunctionNote() const
{
    for (const auto& p : pure_)
        if (p.mc)
            return "alpha function MathiasCopeman (per-component constants fitted to"
                   " each record's own vapour-pressure law; not the default)";
    return std::string();
}

void CubicEoS::buildAi(scalar T, std::vector<scalar>& a,
                       std::vector<scalar>& dadT,
                       std::vector<scalar>* s, std::vector<scalar>* dsdT) const
{
    a.assign(n_, 0.0);
    dadT.assign(n_, 0.0);
    if (s)    s->assign(n_, 0.0);
    if (dsdT) dsdT->assign(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const auto& p = pure_[i];
        if (p.mc)
        {
            //  Mathias-Copeman: s_i = sqrt(a_c) g, a_i = a_c g^2,
            //  da_i/dT = 2 a_c g g', ds_i/dT = sqrt(a_c) g'.
            scalar g, dg, d2g;
            mathiasCopemanG(T, p.Tc, p.c1, p.c2, p.c3, g, dg, d2g);
            a[i]    = p.a_c * g * g;
            dadT[i] = 2.0 * p.a_c * g * dg;
            if (s)    (*s)[i]    = std::sqrt(p.a_c) * g;
            if (dsdT) (*dsdT)[i] = std::sqrt(p.a_c) * dg;
            continue;
        }
        const scalar sqrt_Tr  = std::sqrt(T / p.Tc);
        const scalar one_plus = 1.0 + p.m * (1.0 - sqrt_Tr);
        const scalar alpha    = one_plus * one_plus;
        a[i] = p.a_c * alpha;

        //   da_i/dT  =  a_c · dα/dT
        //   dα/dT    =  2·(1 + m·(1 − √Tr)) · (−m / (2·√(T·Tc)))
        //            =  −m · (1 + m·(1 − √Tr)) / √(T·Tc)
        dadT[i] = -p.a_c * p.m * one_plus / std::sqrt(T * p.Tc);

        //   the SIGNED root s_i = √a_c·(1 + m(1 − √Tr)), |s_i| = √a_i, and
        //   ds_i/dT = −√a_c · m / (2·√(T·Tc))  -- finite where a_i = 0.
        if (s)    (*s)[i]    = std::sqrt(p.a_c) * one_plus;
        if (dsdT) (*dsdT)[i] = -std::sqrt(p.a_c) * p.m
                               / (2.0 * std::sqrt(T * p.Tc));
    }
}

void CubicEoS::buildMix(scalar T, const sVector& y, CubicMixingRule::Mixed& mx,
                        bool partials, bool temperature) const
{
    CubicMixingRule::Pure pure;
    buildAi(T, pure.a, pure.dadT, &pure.s, &pure.dsdT);
    pure.b.resize(n_);
    for (std::size_t i = 0; i < n_; ++i) pure.b[i] = pure_[i].b;
    rule_->mix(T, y, pure, mx, partials, temperature);
}

bool CubicEoS::mixingLedger(scalar T, const sVector& y, MixingLedger& out) const
{
    const auto* kij = rule_->kij();
    if (!kij) return false;                 // no one-fluid decomposition here
    std::vector<scalar> dadT;
    buildAi(T, out.a, dadT);
    out.b.resize(n_);
    for (std::size_t i = 0; i < n_; ++i) out.b[i] = pure_[i].b;
    out.kij = *kij;
    CubicMixingRule::Mixed mx;
    buildMix(T, y, mx, false, true);
    out.a_mix = mx.a;  out.b_mix = mx.b;  out.dadT_mix = mx.dadT;
    return true;
}

// ---------------------------------------------------------------------------
//  THE ROOT PICKER (header: "THE ROOT PICKER").
// ---------------------------------------------------------------------------
CubicEoS::Root CubicEoS::pickRoot(scalar A, scalar B, scalar eps, scalar sig,
                                  bool liquid)
{
    // Z³ + c2 Z² + c1 Z + c0 = 0 for the generic (ε, σ) cubic.
    const scalar es = eps * sig;
    const scalar ep = eps + sig;
    const scalar c2 = (ep - 1.0) * B - 1.0;
    const scalar c1 = es * B * B - ep * (B * B + B) + A;
    const scalar c0 = -(es * (B * B * B + B * B) + A * B);

    auto f  = [&](scalar Z) { return ((Z + c2) * Z + c1) * Z + c0; };
    auto fp = [&](scalar Z) { return (3.0 * Z + 2.0 * c2) * Z + c1; };

    //  At most two Newton steps on f(Z), each kept only when |f| falls.
    auto polish = [&](scalar Z)
    {
        for (int k = 0; k < 2; ++k)
        {
            const scalar fz = f(Z);
            const scalar d  = fp(Z);
            if (fz == 0.0 || d == 0.0 || !std::isfinite(d)) break;
            const scalar Zn = Z - fz / d;
            if (!(std::abs(f(Zn)) < std::abs(fz))) break;
            Z = Zn;
        }
        return Z;
    };

    // Depressed cubic via Z = w − c2/3 :  w³ + Q w + R = 0
    const scalar shift = -c2 / 3.0;
    const scalar Qd = c1 - c2 * c2 / 3.0;
    const scalar Rd = (2.0 * c2 * c2 * c2) / 27.0 - c1 * c2 / 3.0 + c0;
    const scalar Delta = (Rd * Rd) / 4.0 + (Qd * Qd * Qd) / 27.0;

    if (Delta <= 0.0)
    {
        // Three real roots -- trigonometric form.
        const scalar r3 = std::sqrt(-(Qd * Qd * Qd) / 27.0);
        scalar arg = (r3 > 0.0) ? -Rd / (2.0 * r3) : 0.0;
        if (arg >  1.0) arg =  1.0;
        if (arg < -1.0) arg = -1.0;
        const scalar ph = std::acos(arg);
        const scalar two_cbrt_r3 = 2.0 * std::cbrt(r3);
        const scalar roots[3] = {
            two_cbrt_r3 * std::cos(ph / 3.0) + shift,
            two_cbrt_r3 * std::cos((ph + 2.0 * M_PI) / 3.0) + shift,
            two_cbrt_r3 * std::cos((ph + 4.0 * M_PI) / 3.0) + shift };

        // vapour: LARGEST physical root; liquid: SMALLEST above the co-volume.
        scalar best = liquid ? 1.0e300 : -1.0e300;
        for (auto r : roots)
            if (r > B + 1.0e-12 && (liquid ? r < best : r > best)) best = r;
        if (liquid && best == 1.0e300) best = -1.0e300;
        if (best == -1.0e300)
            for (auto r : roots)                // every root at/below B: take
                if (r > best) best = r;         // the largest (Z ≈ B limit)
        return { polish(best), false };
    }

    // One real root.
    const scalar sqrt_Delta = std::sqrt(Delta);
    const scalar u = cbrt_signed(-Rd / 2.0 + sqrt_Delta);
    const scalar v = cbrt_signed(-Rd / 2.0 - sqrt_Delta);
    const scalar Z1 = polish(u + v + shift);

    //  WHICH SIDE IS THE ONE ROOT ON?  Not a question about f(Z) at fixed
    //  (A, B): f can be monotone in Z for a deeply subcooled LIQUID (large
    //  A), so "f has no extremum" does not mean "supercritical".  It is a
    //  question about the ISOTHERM P(v) at this T and composition, in the
    //  reduced volume u = v/b = Z/B and the reduced attraction
    //  beta = a/(b R T) = A/B.  dP/dv = 0 is
    //      g(u) = (u+eps)^2 (u+sig)^2 - beta (2u+eps+sig)(u-1)^2 = 0,
    //  i.e. beta = h(u) = (u+eps)^2 (u+sig)^2 / ((2u+eps+sig)(u-1)^2).
    //  h has one minimum on u > 1, at (u_c, beta_c) -- the critical point of
    //  this cubic (SRK: beta_c = 4.934 = Omega_a/Omega_b, u_c = 3.847).
    //    beta <= beta_c : the isotherm is monotone, no spinodal, no sides --
    //                     the one root serves both labels, unflagged.
    //    beta >  beta_c : two spinodals u_L < u_c < u_V.  One root means P is
    //                     outside the loop, so the root is LIQUID-like
    //                     (u < u_L) or VAPOUR-like (u > u_V): u_c tells which.
    const scalar es2 = eps + sig;
    auto h = [&](scalar uu)
    {
        const scalar num = (uu + eps) * (uu + eps) * (uu + sig) * (uu + sig);
        return num / ((2.0 * uu + es2) * (uu - 1.0) * (uu - 1.0));
    };
    scalar lo = 1.0 + 1.0e-9, hi = 50.0;                // golden section on h
    const scalar gr = 0.5 * (std::sqrt(5.0) - 1.0);
    scalar x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo);
    scalar h1 = h(x1), h2 = h(x2);
    for (int it = 0; it < 200 && (hi - lo) > 1.0e-12 * hi; ++it)
    {
        if (h1 < h2) { hi = x2; x2 = x1; h2 = h1; x1 = hi - gr * (hi - lo); h1 = h(x1); }
        else         { lo = x1; x1 = x2; h1 = h2; x2 = lo + gr * (hi - lo); h2 = h(x2); }
    }
    const scalar u_c    = 0.5 * (lo + hi);
    const scalar beta_c = h(u_c);
    const scalar beta   = A / B;
    if (!(beta > beta_c)) return { Z1, false };       // no spinodal: no sides

    const bool liquidLike = (Z1 / B) < u_c;
    if (liquid == liquidLike) return { Z1, false };

    //  The requested phase has no root here: the PSEUDO-ROOT is that phase's
    //  SPINODAL volume, u_L for a liquid and u_V for a vapour (the densest
    //  vapour / the lightest liquid this isotherm can hold), Z = B·u.  At
    //  the spinodal pressure it IS the vanishing root, so Z is continuous
    //  there; past it the density is held at the spinodal's.
    auto g = [&](scalar uu) { return beta - h(uu); };   // < 0 outside the loop
    scalar a0 = liquid ? 1.0 + 1.0e-12 : u_c;
    scalar b0 = liquid ? u_c : 2.0 * u_c;
    if (!liquid)
        while (g(b0) > 0.0 && b0 < 1.0e12) b0 *= 2.0;  // h grows ~ u at large u
    for (int it = 0; it < 200 && (b0 - a0) > 1.0e-14 * b0; ++it)
    {
        const scalar m = 0.5 * (a0 + b0);
        // inside the loop (between u_L and u_V) g > 0
        if ((g(m) > 0.0) == liquid) b0 = m; else a0 = m;
    }
    return { B * 0.5 * (a0 + b0), true };
}

CubicEoS::Root CubicEoS::root(scalar T, scalar P, const sVector& y, bool liquid,
                              CubicMixingRule::Mixed& mx, scalar* A_out,
                              scalar* B_out, bool partials,
                              bool temperature) const
{
    buildMix(T, y, mx, partials, temperature);
    const scalar RT = constant::R * T;
    const scalar A = mx.a * P / (RT * RT);
    const scalar B = mx.b * P / RT;
    if (A_out)     *A_out = A;
    if (B_out)     *B_out = B;
    const Root r = pickRoot(A, B, c_.eps, c_.sig, liquid);
    if (r.pseudo) announcePseudo(liquid);
    return r;
}

void CubicEoS::announcePseudo(bool liquid) const
{
    const std::string key = name_ + (liquid ? " liquid" : " vapour")
                          + " pseudo-root";
    auto& log = AdvisoryLog::instance();
    if (log.passHas(key)) return;               // hot-path early exit
    const std::string msg = name_ + ": the " + (liquid ? "LIQUID" : "VAPOUR")
        + " root was asked for at a state where the cubic has no root of that"
          " kind (past the " + (liquid ? "liquid" : "vapour") + " spinodal);"
          " a PSEUDO-ROOT (that phase's spinodal volume, continuous at the"
          " spinodal) was used instead of the other phase's root.  Any"
          " K or property evaluated there is an extrapolation, not a state of"
          " that phase.";
    if (log.addAnnouncedOnce(key, "thermo", "info", key, msg)
        && thermoAnnounce())
        std::cout << "[eos] " << msg << "\n";
}

//  VOLUME TRANSLATION, the one place it enters (Peneloux, Rauzy & Freze 1982,
//  Fluid Phase Equilib. 8, 7-23).  The EoS volume is a "pseudo volume" v~
//  (Eq. 3, p. 8) and the TRUE volume is
//      v = v~ - c ,   c = sum_i x_i c_i                       (Eq. 6, p. 9)
//  Fugacity coefficients carry the factor exp(-c_i P/RT) (see phiAt): the
//  same factor in both phases at equal (T, P), so every K-value, flash and
//  equilibrium is the untranslated EoS's (Eq. 2 and the unnumbered result
//  p. 9), while reactions and Gibbs minimisation see ONE translated fluid.  Z follows the volume (Z = P v / RT), so Z, molarVolume and
//  H_residual stay ONE coherent state.
scalar CubicEoS::volumeShift(const sVector& y) const
{
    if (cShift_.empty()) return 0.0;
    scalar c = 0.0;
    for (std::size_t i = 0; i < n_ && i < y.size(); ++i) c += y[i] * cShift_[i];
    return c;
}

std::string CubicEoS::volumeTranslationNote() const
{
    if (cShift_.empty()) return "";
    std::ostringstream o;
    o << "volumeTranslation " << (name_ == "PR" ? "JhaveriYoungren" : "Peneloux")
      << ": v = v_" << name_
      << " - sum x_i c_i; c_i [cm3/mol] =";
    for (std::size_t i = 0; i < n_; ++i)
        o << (i ? ", " : " ") << cNames_[i] << " " << std::setprecision(5)
          << cShift_[i] * 1.0e6;
    o << "; ln phi_i lowered by c_i P/RT in both phases (K-values and flashes"
         " unchanged); the vapour-root H^R lowered by P c (the liquid-phase"
         " enthalpy of a phiPhi package is not the EoS's: DEV.md 4c C410)";
    return o.str();
}

scalar CubicEoS::Z(scalar T, scalar P, const sVector& y) const
{
    CubicMixingRule::Mixed mx;
    const scalar Zr = root(T, P, y, /*liquid*/false, mx).Z;
    if (cShift_.empty()) return Zr;
    return Zr - P * volumeShift(y) / (constant::R * T);
}

scalar CubicEoS::molarVolume(scalar T, scalar P, const sVector& y) const
{
    if (cShift_.empty()) return Z(T, P, y) * constant::R * T / P;  // unchanged path
    CubicMixingRule::Mixed mx;
    return root(T, P, y, /*liquid*/false, mx).Z * constant::R * T / P - volumeShift(y);
}

// Labelled liquid-root access (the vapour-root family above never swaps root).
scalar CubicEoS::molarVolumeLiquid(scalar T, scalar P, const sVector& y) const
{
    CubicMixingRule::Mixed mx;
    const scalar v = root(T, P, y, /*liquid*/true, mx).Z * constant::R * T / P;
    return cShift_.empty() ? v : v - volumeShift(y);
}

bool CubicEoS::vapourRootIsPseudo(scalar T, scalar P, const sVector& y) const
{
    CubicMixingRule::Mixed mx;
    buildMix(T, y, mx, false, false);
    const scalar RT = constant::R * T;
    return pickRoot(mx.a * P / (RT * RT), mx.b * P / RT,
                    c_.eps, c_.sig, false).pseudo;
}

bool CubicEoS::liquidRootIsPseudo(scalar T, scalar P, const sVector& y) const
{
    CubicMixingRule::Mixed mx;
    buildMix(T, y, mx, false, false);
    const scalar RT = constant::R * T;
    return pickRoot(mx.a * P / (RT * RT), mx.b * P / RT,
                    c_.eps, c_.sig, true).pseudo;
}

sVector CubicEoS::phiAt(scalar T, scalar P, const sVector& y, bool liquid) const
{
    scalar A, B;
    CubicMixingRule::Mixed mx;
    const scalar Zr = root(T, P, y, liquid, mx, &A, &B, /*partials*/ true,
                           /*temperature*/ false).Z;
    const scalar ln_ZmB = std::log(std::max(Zr - B, 1.0e-30));
    //  I·(σ − ε) = ln[(Z + σB)/(Z + εB)]
    const scalar lnI  = std::log((Zr + c_.sig * B) / (Zr + c_.eps * B));
    const scalar SmE  = c_.sig - c_.eps;

    sVector phi(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        //  ln phi_i = (bbar_i/b)(Z - 1) - ln(Z - B)
        //             - (A/(B (sig - eps))) X_i ln[(Z + sig B)/(Z + eps B)],
        //  X_i = betabar_i/beta = abar_i/a - bbar_i/b, supplied by the mixing
        //  rule (CubicMixingRule.H, eq. (1)); for the one-fluid rule
        //  bbar_i = b_i and X_i = 2 sum_j y_j a_ij / a - b_i/b -- today's
        //  expression, term for term.
        const scalar bi_over_b = mx.bbar[i] / mx.b;
        scalar lnphi = bi_over_b * (Zr - 1.0)
                           - ln_ZmB
                           - (A / (SmE * B)) * mx.X[i]
                             * lnI;
        //  THE TRANSLATED FLUID IS ONE FLUID (C408 (a), round 2, VT-08):
        //  ln phi_i(translated) = ln phi_i - c_i P/RT, in BOTH roots
        //  (Peneloux 1982 p. 8, read the other way; Jhaveri & Youngren 1988
        //  Eq. 13: phi~ = phi exp(-c P/RT)).  The term is component-wise and
        //  equal in the two phases at equal (T, P), so K = phi_L/phi_V and
        //  every flash are unchanged (to round-off); a reaction's K sees
        //  exp(-sum nu_i c_i P/RT), and G = H - T S closes with the shifted
        //  H^R below.
        if (!cShift_.empty())
            lnphi -= cShift_[i] * P / (constant::R * T);
        phi[i] = std::exp(lnphi);
    }
    return phi;
}

sVector CubicEoS::phi(scalar T, scalar P, const sVector& y) const
{
    return phiAt(T, P, y, /*liquid*/false);
}

// phi of the LIQUID root -- the other half of the phi-phi K-value.
sVector CubicEoS::phiLiquid(scalar T, scalar P, const sVector& y) const
{
    return phiAt(T, P, y, /*liquid*/true);
}

scalar CubicEoS::H_residual(scalar T, scalar P, const sVector& y) const
{
    scalar B;
    CubicMixingRule::Mixed mx;
    const scalar Zv = root(T, P, y, false, mx, nullptr, &B, false, true).Z;
    // Sandler 4th ed eq. 6.4-30, generalised cubic.  a and da/dT are the
    // mixing rule's (CubicMixingRule.H: for an excess-Gibbs rule
    // da/dT = R b (beta + T dbeta/dT), so this IS Dahl & Michelsen's surface).
    const scalar lnI = std::log((Zv + c_.sig * B) / (Zv + c_.eps * B));
    const scalar HR = constant::R * T * (Zv - 1.0)
         + (T * mx.dadT - mx.a) / ((c_.sig - c_.eps) * mx.b) * lnI;
    //  The translated fluid's phi is phi_EoS exp(-c P/RT) (Peneloux p. 8
    //  read the other way), so H^R = -RT^2 d(ln phi)/dT moves by -P c for a
    //  T-independent c; equivalently h = u + P v with u unchanged and v
    //  lowered by c.  The paper prints no enthalpy equation; this is derived
    //  from its fugacity relation.  Entropy (and phi) are unchanged.
    if (cShift_.empty()) return HR;
    return HR - P * volumeShift(y);
}

scalar CubicEoS::S_residual(scalar T, scalar P, const sVector& y) const
{
    scalar B;
    CubicMixingRule::Mixed mx;
    const scalar Zv = root(T, P, y, false, mx, nullptr, &B, false, true).Z;
    // Sandler 4th ed eq. 6.4-31, generalised cubic.
    const scalar lnI = std::log((Zv + c_.sig * B) / (Zv + c_.eps * B));
    return constant::R * std::log(std::max(Zv - B, 1.0e-30))
         + (mx.dadT / ((c_.sig - c_.eps) * mx.b)) * lnI;
}

// --- Peneloux volume translation: the declaration -------------------------
//
//  volumeTranslation
//  {
//      model Peneloux;                     // the one registered shift
//      components
//      {
//          nHexane { ZRA 0.2636; source "Peneloux 1982, Table 1, p. 10"; }
//          other   { cShift 1.2e-5; source "..."; }   // m3/mol, SRK or PR
//      }
//      missingZRA YamadaGunn;              // OPT-IN estimate, announced (SRK)
//  }
//
//  PENG-ROBINSON takes the shift of Jhaveri & Youngren (SPE Reservoir Eng. 3
//  (1988) 1033-1040): c_i = s_i b_i (Eq. 17, p. 1034), b_i the PR co-volume,
//  the dimensionless s_i declared per component as one of
//      s <value>;                  a declared s (with its source),
//      shiftTable1 <row>;          Table 1 (p. 1035): methane ethane propane
//                                  isobutane nButane isopentane nPentane
//                                  nHexane,
//      family <nAlkane|nAlkylcyclohexane|nAlkylbenzene>;
//                                  Eq. 18, s = 1 - d/M^e, Table 2 (p. 1035),
//                                  M the record's MW; heavier than hexane only,
//      cShift <m3/mol>;            declared directly.
//  The family choice is the case's: a record carries no hydrocarbon family.
//  The Z_RA route of Eq. 8 is the RKS correlation and is refused for PR.
//
//  The shift of Eq. 8 (p. 10):  c = 0.40768 (R Tc/Pc) (0.29441 - Z_RA),
//  fitted by the paper to saturated n-alkane liquid densities at Tr = 0.7
//  FOR THE RKS EQUATION.  The standard records carry no Z_RA, so a component
//  with neither a declared Z_RA nor a declared shift is REFUSED by name
//  (never read as 0.29056 - 0.08775 w in silence); that Yamada-Gunn form is
//  the paper's own p. 11 (RKSc3, normal alkanes only) and is taken ONLY on
//  `missingZRA YamadaGunn;`, announced per component as an estimate.
std::vector<scalar>
CubicEoS::readVolumeTranslation(const std::string& model, const DictPtr& eosDict,
                                const std::vector<Component>& comps,
                                bool pengRobinson)
{
    if (!eosDict->found("volumeTranslation")) return {};

    const std::string head = model + " volumeTranslation: ";
    const std::string remedy =
        "declare `volumeTranslation { model Peneloux; components { <name> {"
        " ZRA <value>; source \"<where Z_RA was read>\"; } } }` (Z_RA of"
        " Spencer & Danner 1973, or the adjusted values of Peneloux et al."
        " 1982 Table 1, p. 10), or a shift in m3/mol with its source"
        " `{ cShift <value>; source \"...\"; }`, or opt in to the estimate"
        " `missingZRA YamadaGunn;` (Z_RA = 0.29056 - 0.08775 w, announced)";

    const std::string remedyPR =
        "`volumeTranslation { model JhaveriYoungren; components { <name> { s <value>; | shiftTable1 <row>; | family"
        " <nAlkane|nAlkylcyclohexane|nAlkylbenzene>; | cShift <m3/mol>;"
        " source \"...\"; } } }` (Jhaveri & Youngren 1988, Eq. 17-18, Tables"
        " 1-2: Table 1 covers methane to n-hexane, Eq. 18 the n-alkanes,"
        " n-alkylcyclohexanes and n-alkylbenzenes heavier than n-hexane)";

    DictPtr vt;
    try { vt = eosDict->subDict("volumeTranslation"); }
    catch (const std::exception&)
    {
        throw std::runtime_error(head + "written as a bare word -- the shift"
            " needs data the standard records do not carry (no Z_RA); " + remedy);
    }
    //  Each shift under its OWN name (VT-14): Peneloux for SRK (Eq. 8),
    //  JhaveriYoungren for PR (c = s b, Eq. 17); the wrong one is refused.
    const std::string vtModel = vt->lookupWordOrDefault("model", "");
    const std::string want = pengRobinson ? "JhaveriYoungren" : "Peneloux";
    const std::string other = pengRobinson ? "Peneloux" : "JhaveriYoungren";
    if (vtModel == other)
        throw std::runtime_error(head + "model '" + vtModel + "' is the shift"
            " of the " + (pengRobinson ? "Redlich-Kwong-Soave" : "Peng-Robinson")
            + " cubic; " + model + " takes `model " + want + ";`");
    if (vtModel != want)
        throw std::runtime_error(head + "model '" + vtModel + "' is not"
            " implemented -- " + model + " takes `model " + want + ";` ("
            + (pengRobinson ? "Jhaveri & Youngren 1988" :
                              "Peneloux, Rauzy & Freze 1982") + ")");
    const std::string lbl = want;

    const std::string miss = vt->lookupWordOrDefault("missingZRA", "");
    if (!miss.empty() && miss != "YamadaGunn")
        throw std::runtime_error(head + "missingZRA '" + miss + "' is not"
            " implemented -- registered: YamadaGunn");
    if (pengRobinson && !miss.empty())
        throw std::runtime_error(head + "`missingZRA` is the Redlich-Kwong-"
            "Soave estimate of Eq. 8 and is refused for PR; declare each"
            " component's Jhaveri-Youngren shift: " + remedyPR);

    DictPtr cd;
    if (vt->found("components")) cd = vt->subDict("components");

    const std::size_t n = comps.size();
    if (cd)
        for (const auto& key : cd->keys())
        {
            bool known = false;
            for (const auto& cp : comps) known = known || cp.name() == key;
            if (!known)
                throw std::runtime_error(head + "`components` declares '" + key
                    + "', which is not a component of this system -- a shift"
                      " for a component that is absent would be ignored in"
                      " silence; remove it or add the component");
        }
    std::vector<scalar> c(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        const Component& comp = comps[i];
        const std::string nm = comp.name();
        std::ostringstream msg;
        msg << std::setprecision(5);
        if (cd && cd->found(nm))
        {
            DictPtr e = cd->subDict(nm);
            if (!e->found("source"))
                throw std::runtime_error(head + "component '" + nm + "' is"
                    " declared without `source` -- a value is never entered"
                    " without where it was read");
            const bool hasZ = e->found("ZRA"), hasC = e->found("cShift"),
                       hasS = e->found("s"), hasT = e->found("shiftTable1"),
                       hasF = e->found("family");
            if (int(hasZ) + int(hasC) + int(hasS) + int(hasT) + int(hasF) != 1)
                throw std::runtime_error(head + "component '" + nm + "' must"
                    " declare exactly one of " + (pengRobinson
                    ? std::string("`s`, `shiftTable1`, `family` or `cShift`")
                    : std::string("`ZRA` or `cShift`")));
            if (hasC)
            {
                c[i] = e->lookupScalar("cShift");
                msg << nm << " c = " << c[i] * 1.0e6 << " cm3/mol (declared)";
            }
            else if (!pengRobinson)
            {
                if (!hasZ)
                    throw std::runtime_error(head + "component '" + nm
                        + "': `s`, `shiftTable1` and `family` are the"
                          " Jhaveri-Youngren shift of Peng-Robinson; SRK takes"
                          " `ZRA` (Peneloux Eq. 8) or `cShift`");
                const scalar Z = e->lookupScalar("ZRA");
                if (!(Z > 0.2 && Z < 0.35))
                    throw std::runtime_error(head + "component '" + nm
                        + "': ZRA = " + std::to_string(Z) + " is outside the"
                          " physical window 0.2-0.35 of a Rackett factor");
                c[i] = 0.40768 * constant::R * comp.Tc()
                     / (comp.Pc() * 1.0e5) * (0.29441 - Z);
                msg << nm << " c = " << c[i] * 1.0e6 << " cm3/mol (Z_RA = "
                    << Z << " declared, Eq. 8)";
            }
            else
            {
                if (hasZ)
                    throw std::runtime_error(head + "component '" + nm
                        + "': a Z_RA shift is the RKS correlation (Eq. 8) and"
                          " is refused for PR; declare " + remedyPR);
                //  Jhaveri & Youngren 1988: c = s b (Eq. 17), b the PR
                //  co-volume Omega_b R Tc / Pc (Omega_b = 0.07780, PR.cpp).
                const scalar b = 0.07780 * constant::R * comp.Tc()
                               / (comp.Pc() * 1.0e5);
                scalar sv = 0.0;
                std::string how;
                if (hasS)
                {
                    sv = e->lookupScalar("s");
                    how = "s = " + std::to_string(sv) + " declared";
                }
                else if (hasT)
                {
                    //  Table 1, p. 1035: shift parameter of well-defined
                    //  hydrocarbons lighter than n-heptane.
                    static const std::map<std::string, scalar> T1 = {
                        {"methane", -0.1540}, {"ethane", -0.1002},
                        {"propane", -0.08501}, {"isobutane", -0.07935},
                        {"nButane", -0.06413}, {"isopentane", -0.04350},
                        {"nPentane", -0.04183}, {"nHexane", -0.01478} };
                    const std::string row = e->lookupWord("shiftTable1");
                    auto it = T1.find(row);
                    if (it == T1.end())
                    {
                        std::string rows;
                        for (const auto& kv : T1) rows += " " + kv.first;
                        throw std::runtime_error(head + "component '" + nm
                            + "': shiftTable1 '" + row + "' is not a row of"
                              " Jhaveri & Youngren Table 1 (rows:" + rows
                            + "); heavier hydrocarbons take `family` (Eq. 18)");
                    }
                    sv = it->second;
                    how = "s = " + std::to_string(sv) + " (Table 1 row " + row + ")";
                }
                else
                {
                    //  Eq. 18 with Table 2 (p. 1035), M in kg/kmol.
                    static const std::map<std::string, std::pair<scalar, scalar>> T2 = {
                        {"nAlkane", {2.258, 0.1823}},
                        {"nAlkylcyclohexane", {3.004, 0.2324}},
                        {"nAlkylbenzene", {2.516, 0.2008}} };
                    const std::string fam = e->lookupWord("family");
                    auto it = T2.find(fam);
                    if (it == T2.end())
                        throw std::runtime_error(head + "component '" + nm
                            + "': family '" + fam + "' is not a row of"
                              " Jhaveri & Youngren Table 2 (nAlkane,"
                              " nAlkylcyclohexane, nAlkylbenzene)");
                    //  "Heavier than n-hexane" (Table 2 title): M of C6H14 is
                    //  86.17536 kg/kmol (Perry 9th ed., Table 2-32, p. 2-96);
                    //  the next hydrocarbon above it is >= 14 heavier, so a
                    //  margin of 1 absorbs a record's rounding of hexane
                    //  itself (the catalogue's n-hexane is 86.178).
                    constexpr scalar M_NHEXANE = 86.17536;
                    const scalar M = comp.MW();
                    if (!(M > M_NHEXANE + 1.0))
                        throw std::runtime_error(head + "component '" + nm
                            + "': MW = " + std::to_string(M) + " is not"
                              " heavier than n-hexane (86.17536); Table 2 covers"
                              " only the hydrocarbons heavier than hexane --"
                              " use `shiftTable1` or a declared `s`");
                    sv = 1.0 - it->second.first / std::pow(M, it->second.second);
                    how = "s = " + std::to_string(sv) + " (Eq. 18, family "
                        + fam + ", M = " + std::to_string(M) + ")";
                }
                c[i] = sv * b;
                msg << nm << " c = " << c[i] * 1.0e6 << " cm3/mol (" << how
                    << ", c = s b, b = " << b * 1.0e6
                    << " cm3/mol, Jhaveri-Youngren Eq. 17)";
            }
            msg << "; source: " << e->lookupWord("source");
        }
        else if (miss == "YamadaGunn")
        {
            const scalar Z = 0.29056 - 0.08775 * comp.omega();
            c[i] = 0.40768 * constant::R * comp.Tc()
                 / (comp.Pc() * 1.0e5) * (0.29441 - Z);
            msg << nm << " c = " << c[i] * 1.0e6 << " cm3/mol (ESTIMATE:"
                   " Z_RA = 0.29056 - 0.08775 w = " << Z << ", Yamada-Gunn as"
                   " printed in Peneloux 1982 p. 11, normal alkanes only)";
        }
        else if (pengRobinson)
            throw std::runtime_error(head + "component '" + nm + "' has no"
                " Jhaveri-Youngren shift declared (a record carries no"
                " hydrocarbon family and the table covers only listed"
                " hydrocarbons); " + remedyPR);
        else
            throw std::runtime_error(head + "component '" + nm + "' has no"
                " Z_RA (the standard records carry none) and no declared"
                " shift; " + remedy);
        if (thermoAnnounce()
            && AdvisoryLog::instance().add("thermo", "info",
                   model + " volumeTranslation " + nm, msg.str()))
            std::cout << "[eos] " << model << " volumeTranslation " << lbl << ": "
                      << msg.str() << "\n";
    }
    const std::string gen = model + " volumeTranslation " + lbl + " is ON ("
        + std::string(pengRobinson ? "Jhaveri & Youngren 1988 shift for PR"
                                   : "Peneloux 1982 shift for SRK")
        + "): v = v_" + model + " - sum x_i c_i; ONE translated fluid: ln phi_i"
          " lowered by c_i P/RT in both phases (K-values and every flash are"
          " the untranslated " + model + "'s, to round-off; a reaction sees"
          " exp(-sum nu_i c_i P/RT)); the vapour-root H^R is lowered by P c, S^R"
          " unchanged (the liquid-phase enthalpy of a phiPhi package is not the"
          " EoS's: DEV.md 4c C410)";
    if (thermoAnnounce()
        && AdvisoryLog::instance().add("thermo", "info",
               model + " volumeTranslation", gen))
        std::cout << "[eos] " << gen << "\n";
    return c;
}

// --- the binaryInteractions list, shared by both cubics ---------------------
std::vector<std::vector<scalar>>
CubicEoS::readKij(const std::string& model, const DictPtr& eosDict,
                  const std::vector<Component>& comps)
{
    const std::size_t n = comps.size();
    std::vector<std::vector<scalar>> kij(n, std::vector<scalar>(n, 0.0));

    //  THE ABSENT LIST IS ANNOUNCED, not only the declared entries.  The
    //  per-entry announcement below fires once per DECLARED kij -- so a case
    //  with NO binaryInteractions block ran every pair at kij = 0 in silence,
    //  while the authoring kit promised "kij = 0, announced".  The 2026-08-23
    //  LLM benchmark (case E, natural gas on SRK) read that promise,
    //  found no line in the log, and reported the kit as overselling; the
    //  kit was right about what SHOULD happen.  kij = 0 is a legitimate
    //  predictive default, but predictive-degraded is a fact the reader
    //  needs, with the remedy named.  One line for the whole mixture, never
    //  one per pair -- N(N-1)/2 identical lines teach nothing.
    if (n > 1 && !eosDict->found("binaryInteractions"))
    {
        std::ostringstream msg;
        msg << model << ": no binaryInteractions declared -- all "
            << (n * (n - 1) / 2) << " binary pair(s) run kij = 0"
               " (predictive-degraded; curated pairs, where they exist, live"
               " in parameters/" << model << "/ and are declared via the"
               " case's binaryInteractions block)";
        if (thermoAnnounce()
            && AdvisoryLog::instance().add("thermo", "info",
                   model + " kij", msg.str()))
            std::cout << "[eos] " << msg.str() << "\n";
    }

    if (eosDict->found("binaryInteractions"))
    {
        std::set<std::pair<std::size_t, std::size_t>> declared;
        for (const auto& entry : eosDict->lookupDictList("binaryInteractions"))
        {
            const std::string i_name = entry->lookupWord("i");
            const std::string j_name = entry->lookupWord("j");
            const scalar      k      = entry->lookupScalar("kij");
            std::size_t idx_i = n, idx_j = n;
            for (std::size_t k_idx = 0; k_idx < n; ++k_idx)
            {
                if (comps[k_idx].name() == i_name) idx_i = k_idx;
                if (comps[k_idx].name() == j_name) idx_j = k_idx;
            }
            if (idx_i == n || idx_j == n)
                throw std::runtime_error(
                    model + ": binaryInteractions references unknown component '"
                    + (idx_i == n ? i_name : j_name) + "'");
            kij[idx_i][idx_j] = k;
            kij[idx_j][idx_i] = k;
            declared.insert({ std::min(idx_i, idx_j),
                              std::max(idx_i, idx_j) });
            // Announce the fitted constant WHERE IT IS CONSUMED, so BOTH entry
            // paths -- a propertyPackage's parameters.kijPairs record (inlined
            // by the builder) AND a legacy inline binaryInteractions list --
            // pass through this one announcement point.  The builder's own
            // line keeps only the citation (which record file).  Deduped via
            // AdvisoryLog (the package constructs the cubic once per phase).
            if (thermoAnnounce()
                && AdvisoryLog::instance().add("thermo", "info",
                       "kij(" + i_name + "," + j_name + ")",
                       model + " kij(" + i_name + "," + j_name + ") = "
                       + std::to_string(k)))
            {
                std::ostringstream kijText;     // default precision, whatever std::cout holds now
                kijText << k;
                std::cout << "[eos] kij(" << i_name << "," << j_name
                          << ") = " << kijText.str() << "\n";
            }
        }

        //  A PARTIALLY declared block: the absent-block line above cannot
        //  fire, yet the pairs the block does not name run kij = 0 exactly
        //  as silently as the all-absent case did before 2026-08-23.  Same
        //  aggregate posture -- one line for the mixture, never one per pair.
        const std::size_t all = n * (n - 1) / 2;
        if (declared.size() < all)
        {
            std::ostringstream msg;
            msg << model << ": " << (all - declared.size()) << " of " << all
                << " binary pair(s) undeclared -- those pairs run kij = 0"
                   " (predictive-degraded; curated pairs, where they exist,"
                   " live in parameters/" << model << "/)";
            if (thermoAnnounce()
                && AdvisoryLog::instance().add("thermo", "info",
                       model + " kij coverage", msg.str()))
                std::cout << "[eos] " << msg.str() << "\n";
        }
    }
    return kij;
}

// --- the mixing rule the block declares, shared by both cubics --------------
std::unique_ptr<CubicMixingRule>
CubicEoS::readMixingRule(const std::string& model, const DictPtr& eosDict,
                         const std::vector<Component>& comps)
{
    const std::string word = eosDict->lookupWordOrDefault(
        "mixingRule", "vanDerWaalsOneFluid");
    CubicMixingRule::Context ctx;
    ctx.eosModel = model;
    ctx.comps    = &comps;
    ctx.eosDict  = eosDict;
    //  The kij list belongs to the one-fluid rule alone: reading it (and its
    //  "all pairs run kij = 0" announcements) under an excess-Gibbs rule would
    //  print a statement about a quantity that rule does not have.
    if (word == "vanDerWaalsOneFluid")
        ctx.kij = readKij(model, eosDict, comps);
    return CubicMixingRule::New(word, ctx);
}

} // namespace Choupo
