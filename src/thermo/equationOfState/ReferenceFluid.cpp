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

#include "ReferenceFluid.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo {
namespace helmholtz {

namespace {

std::string g9(scalar v, int prec = 9)
{
    std::ostringstream os;
    os << std::setprecision(prec) << v;
    return os.str();
}

} // namespace

// ===========================================================================
//  Loading
// ===========================================================================
const ReferenceFluid& ReferenceFluid::load(const std::string& equation)
{
    static std::map<std::string, std::unique_ptr<ReferenceFluid>> cache;
    auto it = cache.find(equation);
    if (it != cache.end()) return *it->second;
    auto f = std::make_unique<ReferenceFluid>();
    f->read(equation);
    return *cache.emplace(equation, std::move(f)).first->second;
}

void ReferenceFluid::read(const std::string& equation)
{
    const std::string sub = "parameters/Helmholtz/" + equation + ".dat";
    const fs::path p = records::resolveRequired(sub,
        "the reference equation of state '" + equation + "'");
    if (p.empty() || !fs::exists(p))
        throw std::runtime_error("reference equation of state '" + equation
            + "': no record " + sub + " (case-local constant/" + sub
            + " or the catalogue).  The equations shipped are the records "
              "in data/standards/parameters/Helmholtz/.");
    path_ = p.string();
    const DictPtr r = Dictionary::fromFile(path_);

    const std::string rt = r->lookupWordOrDefault("recordType", "");
    if (rt != "helmholtzEquationOfState")
        throw std::runtime_error(path_ + ": recordType '" + rt + "' -- a "
            "reference equation record declares recordType "
            "helmholtzEquationOfState");
    equation_ = r->lookupWord("equation");
    if (equation_ != equation)
        throw std::runtime_error(path_ + ": declares `equation " + equation_
            + ";` but sits in the slot of '" + equation + "'.  A mislabelled "
              "record is refused, not re-homed.");
    fluid_       = r->lookupWord("fluid");
    citation_    = r->lookupWord("citation");
    url_         = r->lookupWord("url");
    uncertainty_ = r->lookupWord("uncertainty");

    const DictPtr red = r->subDict("reducing");
    Tc_   = red->lookupScalar("Tc",   Dims::temperature);
    rhoc_ = red->lookupScalar("rhoc", Dims::density);
    R_    = r->lookupScalar("R", Dims::heatCapacity);
    Ttriple_ = r->subDict("triplePoint")->lookupScalar("T", Dims::temperature);

    const DictPtr v = r->subDict("validity");
    Tmin_ = v->lookupScalar("Tmin", Dims::temperature);
    Tmax_ = v->lookupScalar("Tmax", Dims::temperature);
    pMax_ = v->lookupScalar("pMax", Dims::pressure);
    extrapolation_ = v->lookupWord("extrapolation");

    alpha_.read(r->subDict("ideal"), r->subDict("residual"), path_);
    checks_ = r->subDict("checkValues");

    // A record whose own check values are not reproduced is REFUSED.
    for (const auto& c : verify())
        if (!c.ok)
            throw std::runtime_error(path_ + ": check value NOT reproduced -- "
                + c.table + ", " + c.label + ": published " + g9(c.published, 12)
                + ", computed " + g9(c.computed, 12) + " (" + std::to_string(c.digits)
                + " significant digits printed).  A coefficient is mistranscribed "
                  "or a term is wrong; fix it, do not loosen the comparison.");
}

// ===========================================================================
//  Properties at (T, rho)
// ===========================================================================
State ReferenceFluid::at(scalar T, scalar rho) const
{
    State s;
    s.T = T; s.rho = rho;
    s.delta = rho / rhoc_;
    s.tau   = Tc_ / T;
    s.a0 = alpha_.ideal(s.delta, s.tau);
    s.ar = alpha_.residual(s.delta, s.tau);
    const scalar d = s.delta, t = s.tau;
    const Derivs& o = s.a0;
    const Derivs& r = s.ar;
    const scalar RT = R_ * T;

    s.p  = rho * RT * (1.0 + d * r.a_d);
    s.u  = RT * t * (o.a_t + r.a_t);
    s.h  = RT * (1.0 + t * (o.a_t + r.a_t) + d * r.a_d);
    s.s  = R_ * (t * (o.a_t + r.a_t) - o.a - r.a);
    s.g  = RT * (1.0 + o.a + r.a + d * r.a_d);
    s.cv = -R_ * t * t * (o.a_tt + r.a_tt);
    const scalar num = 1.0 + d * r.a_d - d * t * r.a_dt;
    const scalar den = 1.0 + 2.0 * d * r.a_d + d * d * r.a_dd;
    s.cp = s.cv + R_ * num * num / den;
    s.w  = std::sqrt(RT * (den - num * num / (t * t * (o.a_tt + r.a_tt))));
    s.lnPhi  = r.a + d * r.a_d - std::log(1.0 + d * r.a_d);
    s.dpdrho = RT * den;
    return s;
}

scalar ReferenceFluid::pressure(scalar T, scalar delta) const
{
    const Derivs r = alpha_.residual(delta, Tc_ / T);
    return delta * rhoc_ * R_ * T * (1.0 + delta * r.a_d);
}

scalar ReferenceFluid::dpdDelta(scalar T, scalar delta) const
{
    const Derivs r = alpha_.residual(delta, Tc_ / T);
    return rhoc_ * R_ * T * (1.0 + 2.0 * delta * r.a_d + delta * delta * r.a_dd);
}

// ===========================================================================
//  Density from (T, p)
// ===========================================================================
//  rootOn: p(delta) - p on a branch where p is MONOTONE INCREASING in delta,
//  bracketed [dlo, dhi] with p(dlo) <= p <= p(dhi).  Safeguarded Newton: the
//  Newton step is taken when it stays inside the bracket, a bisection
//  otherwise; the bracket shrinks every step either way.
scalar ReferenceFluid::rootOn(scalar T, scalar p, scalar dlo, scalar dhi) const
{
    scalar flo = pressure(T, dlo) - p;
    scalar fhi = pressure(T, dhi) - p;
    if (flo == 0.0) return dlo;
    if (fhi == 0.0) return dhi;
    if (flo > 0.0 || fhi < 0.0)
        throw std::logic_error("helmholtz::rootOn: not a bracket");
    scalar x = 0.5 * (dlo + dhi);
    for (int it = 0; it < 200; ++it)
    {
        const scalar f  = pressure(T, x) - p;
        if (f == 0.0) return x;
        if (f < 0.0) dlo = x; else dhi = x;
        const scalar fp = dpdDelta(T, x);
        scalar xn = fp > 0.0 ? x - f / fp : 0.5 * (dlo + dhi);
        if (!(xn > dlo && xn < dhi)) xn = 0.5 * (dlo + dhi);
        if (std::fabs(xn - x) <= 4.0 * std::numeric_limits<scalar>::epsilon() * x
            || dhi - dlo <= 4.0 * std::numeric_limits<scalar>::epsilon() * x)
            return xn;
        x = xn;
    }
    return x;
}

//  Every root of p(T, rho) = p along the isotherm.
//
//  BELOW T_c the isotherm has a vapour branch (0, delta_V] and a liquid
//  branch [delta_L, ...), each monotone, and between the spinodals an
//  UNSTABLE stretch on which a multiparameter equation may oscillate
//  through enormous pressures of either sign (IAPWS-95 at 300 K: +-1e25 Pa).
//  The crossings there are not states; they are COUNTED (`unstableCrossings`)
//  and never returned as roots.  Each branch has at most one root.
//
//  ABOVE T_c the isotherm is scanned (log-spaced in delta to 1, linear above
//  it, out to where p has risen past the target) and every crossing refined.
std::vector<DensityRoot> ReferenceFluid::roots(scalar T, scalar p,
                                               int* unstableCrossings) const
{
    std::vector<DensityRoot> out;
    auto add = [&](scalar rho, const char* branch)
    {
        DensityRoot r;
        r.rho = rho;
        const State s = at(T, rho);
        r.mechanicallyStable = s.dpdrho > 0.0;
        r.g = s.g;
        r.branch = branch;
        out.push_back(r);
    };
    if (unstableCrossings) *unstableCrossings = 0;

    if (T < Tc_)
    {
        scalar dV = 0.0, dL = 0.0;
        spinodals(T, dV, dL);
        if (p <= pressure(T, dV)) add(branchRoot(T, p, false, dV, dL), "vapour");
        if (p >= pressure(T, dL)) add(branchRoot(T, p, true,  dV, dL), "liquid");
        if (unstableCrossings)
        {
            const int n = 2000;
            scalar fPrev = pressure(T, dV) - p;
            for (int i = 1; i <= n; ++i)
            {
                const scalar f = pressure(T, dV + (dL - dV) * scalar(i) / n) - p;
                if ((fPrev < 0.0) != (f < 0.0)) ++*unstableCrossings;
                fPrev = f;
            }
        }
        return out;
    }

    std::vector<scalar> grid;
    const scalar dIdeal = p / (rhoc_ * R_ * T);
    const scalar d0 = std::min(1.0e-9, 1.0e-3 * dIdeal);
    const int nLog = 600, nLin = 2000;
    for (int i = 0; i < nLog; ++i)
        grid.push_back(d0 * std::pow(1.0 / d0, scalar(i) / nLog));
    scalar dTop = 4.0;
    for (int k = 0; k < 60 && pressure(T, dTop) <= p; ++k) dTop *= 1.25;
    for (int i = 0; i <= nLin; ++i)
        grid.push_back(1.0 + (dTop - 1.0) * scalar(i) / nLin);

    scalar fPrev = pressure(T, grid[0]) - p;
    for (std::size_t i = 1; i < grid.size(); ++i)
    {
        const scalar f = pressure(T, grid[i]) - p;
        if ((fPrev < 0.0) != (f < 0.0))
        {
            scalar a = grid[i - 1], b = grid[i], fa = fPrev;
            for (int it = 0; it < 200 && (b - a) > 4.0e-16 * b; ++it)
            {
                const scalar m = 0.5 * (a + b);
                const scalar fm = pressure(T, m) - p;
                if ((fm < 0.0) == (fa < 0.0)) { a = m; fa = fm; } else b = m;
            }
            add(0.5 * (a + b) * rhoc_, "supercritical");
        }
        fPrev = f;
    }
    return out;
}

scalar ReferenceFluid::density(scalar T, scalar p, std::string* branch) const
{
    if (T < Tc_ && T >= Ttriple_)
    {
        // on a subcritical isotherm the stable branch is the one the
        // saturation pressure names (equal-g is the definition of psat)
        const Saturation sat = saturation(T);
        const bool liquid = p >= sat.psat;
        if (branch) *branch = liquid ? "liquid" : "vapour";
        return densityOnBranch(T, p, liquid);
    }
    // supercritical, or below the triple point: the lowest Gibbs energy
    // among the mechanically stable roots
    const std::vector<DensityRoot> rs = roots(T, p);
    const DensityRoot* best = nullptr;
    for (const auto& r : rs)
        if (r.mechanicallyStable && (!best || r.g < best->g)) best = &r;
    if (!best)
        throw std::runtime_error("reference equation " + equation_
            + ": no mechanically stable density at T = " + g9(T) + " K, p = "
            + g9(p) + " Pa");
    if (branch) *branch = best->branch;
    return best->rho;
}

scalar ReferenceFluid::densityOnBranch(scalar T, scalar p, bool liquid) const
{
    if (!(T < Tc_))
        throw std::runtime_error("reference equation " + equation_
            + ": no liquid/vapour branch above T_c = " + g9(Tc_) + " K");
    scalar dV = 0.0, dL = 0.0;
    spinodals(T, dV, dL);
    const scalar rho = branchRoot(T, p, liquid, dV, dL);
    // A root that is mechanically stable (dp/drho > 0) but thermally not
    // (cv <= 0, or w^2 < 0) sits on a stretch of the isotherm the equation
    // was never fitted to (nitrogen at 120 K has one between its spinodals):
    // it is not a state, metastable or otherwise.
    const State s = at(T, rho);
    if (!(s.cv > 0.0) || !std::isfinite(s.w))
        throw std::runtime_error("reference equation " + equation_ + ": the "
            + std::string(liquid ? "liquid" : "vapour") + " root at T = " + g9(T)
            + " K, p = " + g9(p) + " Pa (rho = " + g9(rho) + " kg/m3) is not a "
              "thermally stable state (cv = " + g9(s.cv) + " J/(kg K)) -- the "
              "isotherm there is outside anything the equation was fitted to");
    return rho;
}

scalar ReferenceFluid::branchRoot(scalar T, scalar p, bool liquid,
                                  scalar dV, scalar dL) const
{
    if (!liquid)
    {
        const scalar pTop = pressure(T, dV);
        if (p > pTop)
            throw std::runtime_error("reference equation " + equation_
                + ": no VAPOUR root at T = " + g9(T) + " K, p = " + g9(p)
                + " Pa -- above the vapour spinodal pressure " + g9(pTop)
                + " Pa");
        scalar dlo = std::min(1.0e-3 * p / (rhoc_ * R_ * T), dV);
        while (pressure(T, dlo) > p) dlo *= 1.0e-3;
        return rootOn(T, p, dlo, dV) * rhoc_;
    }
    const scalar pBot = pressure(T, dL);
    if (p < pBot)
        throw std::runtime_error("reference equation " + equation_
            + ": no LIQUID root at T = " + g9(T) + " K, p = " + g9(p)
            + " Pa -- below the liquid spinodal pressure " + g9(pBot) + " Pa");
    scalar dhi = dL * 1.05;
    for (int k = 0; k < 80 && pressure(T, dhi) < p; ++k) dhi *= 1.05;
    return rootOn(T, p, dL, dhi) * rhoc_;
}

// ===========================================================================
//  The spinodals of a subcritical isotherm: the first maximum of p on the
//  vapour side (dV) and the last minimum before the liquid branch (dL).
// ===========================================================================
void ReferenceFluid::spinodals(scalar T, scalar& dV, scalar& dL) const
{
    // a pure function of T: cached (a flowsheet asks the same isotherm many times)
    const auto hit = spinCache_.find(T);
    if (hit != spinCache_.end()) { dV = hit->second.first; dL = hit->second.second; return; }
    // A scan in delta over (0, 4]: the loop of a subcritical isotherm of
    // every fluid lies between the gas and ~3x the critical density.
    // dV = the FIRST maximum (the vapour branch rises from delta = 0 to it).
    // dL = the LAST minimum: the liquid branch rises from it to the top of
    // the scan.  Between the two a multiparameter equation is free to
    // oscillate wildly (IAPWS-95 at 275 K swings through +-1e25 Pa there:
    // terms with tau^50 are fitted to the stable region and say nothing
    // about the unstable one), so nothing between them is read.
    // The grid: log-spaced from delta = 1e-10 to 0.05 (a cold isotherm's
    // vapour spinodal sits at a tiny density), linear from 0.05 to 4.
    std::vector<scalar> grid;
    for (int i = 0; i < 200; ++i)
        grid.push_back(1.0e-10 * std::pow(0.05 / 1.0e-10, scalar(i) / 200));
    for (int i = 0; i <= 1000; ++i)
        grid.push_back(0.05 + (4.0 - 0.05) * scalar(i) / 1000);
    auto slope = [&](scalar d) { return dpdDelta(T, d); };
    std::vector<std::pair<scalar, scalar>> downs, ups;   // bracketing nodes
    scalar prevS = slope(grid[0]);
    for (std::size_t i = 1; i < grid.size(); ++i)
    {
        const scalar s = slope(grid[i]);
        if (prevS > 0.0 && s <= 0.0) downs.emplace_back(grid[i - 1], grid[i]);
        if (prevS <= 0.0 && s > 0.0) ups.emplace_back(grid[i - 1], grid[i]);
        prevS = s;
    }
    const bool haveDown = !downs.empty();
    std::pair<scalar, scalar> upBracket { -1.0, -1.0 };
    if (haveDown && !ups.empty() && ups.back().first > downs.front().first)
        upBracket = ups.back();
    if (!haveDown || upBracket.first < 0.0)
        throw std::runtime_error("reference equation " + equation_
            + ": no van der Waals loop resolved on the isotherm T = " + g9(T)
            + " K (T_c = " + g9(Tc_) + " K) -- too close to the critical "
              "point for the spinodal scan");
    // refine each crossing of dp/ddelta = 0 by bisection
    auto refine = [&](scalar a, scalar b)
    {
        scalar sa = slope(a);
        for (int it = 0; it < 200 && b - a > 1.0e-15 * b; ++it)
        {
            const scalar m = 0.5 * (a + b), sm = slope(m);
            if ((sm > 0.0) == (sa > 0.0)) { a = m; sa = sm; } else b = m;
        }
        return 0.5 * (a + b);
    };
    dV = refine(downs.front().first, downs.front().second);
    dL = refine(upBracket.first, upBracket.second);
    // the vapour branch ends a hair BELOW the maximum, the liquid one starts
    // a hair ABOVE the minimum (both monotone strictly inside)
    dV *= (1.0 - 1.0e-12);
    dL *= (1.0 + 1.0e-12);
    if (spinCache_.size() > 4096) spinCache_.clear();
    spinCache_.emplace(T, std::make_pair(dV, dL));
}

// ===========================================================================
//  Saturation: Maxwell (equal p, equal g), Newton on p inside the spinodals
// ===========================================================================
Saturation ReferenceFluid::saturation(scalar T) const
{
    const auto hit = satCache_.find(T);
    if (hit != satCache_.end()) return hit->second;

    if (T == Tc_)
    {
        // the saturation curve ENDS at the critical point: both phases are
        // the critical state of the equation itself
        Saturation c;
        c.T = T; c.rhoL = c.rhoV = rhoc_;
        c.liquid = c.vapour = at(T, rhoc_);
        c.psat = c.liquid.p;
        return c;
    }
    if (!(T >= Ttriple_ && T < Tc_))
        throw std::runtime_error("reference equation " + equation_
            + ": saturation is defined from the triple point " + g9(Ttriple_)
            + " K up to the critical point " + g9(Tc_) + " K; asked at T = "
            + g9(T) + " K");

    scalar dV = 0.0, dL = 0.0;
    spinodals(T, dV, dL);
    scalar pHi = pressure(T, dV);                       // vapour spinodal p
    scalar pLo = std::max(pressure(T, dL), 1.0e-12 * pHi);
    if (!(pHi > pLo))
        throw std::runtime_error("reference equation " + equation_
            + ": the spinodals at T = " + g9(T) + " K give no pressure window");

    // Seed: the geometric mean of the window.  Newton on p:
    //   d(g_L - g_V)/dp = 1/rho_L - 1/rho_V      (Gibbs-Duhem at fixed T)
    // safeguarded to the window, bisected (geometrically) when it leaves it.
    scalar p = std::sqrt(pLo * pHi);
    Saturation out;
    out.T = T;
    for (int it = 0; it < 200; ++it)
    {
        const scalar rL = branchRoot(T, p, true,  dV, dL);
        const scalar rV = branchRoot(T, p, false, dV, dL);
        const State L = at(T, rL), V = at(T, rV);
        const scalar dg = L.g - V.g;
        // below psat the vapour is the stable phase (g_L > g_V): dg falls with p
        if (dg > 0.0) pLo = p; else pHi = p;
        const scalar slope = 1.0 / rL - 1.0 / rV;   // < 0
        scalar pn = p - dg / slope;
        if (!(pn > pLo && pn < pHi)) pn = std::sqrt(pLo * pHi);
        out.iterations = it + 1;
        if (std::fabs(pn - p) <= 1.0e-15 * p || std::fabs(dg) <= 1.0e-15 * R_ * T)
        {
            out.psat = p; out.rhoL = rL; out.rhoV = rV;
            out.liquid = L; out.vapour = V;
            if (satCache_.size() > 4096) satCache_.clear();
            satCache_.emplace(T, out);
            return out;
        }
        p = pn;
    }
    throw std::runtime_error("reference equation " + equation_
        + ": the Maxwell saturation did not converge at T = " + g9(T) + " K");
}

// ===========================================================================
//  Virial coefficients: the zero-density limits of the residual part,
//      B rho_c = lim ar_d,   C rho_c^2 = lim ar_dd   (delta -> 0)
//  taken at delta = 1e-14 (every term is analytic there; the error is
//  O(delta) times the third derivative -- measured on IAPWS-95 at 600 K, C
//  moves in its 9th digit between delta = 1e-10 and 1e-12 and is converged
//  to 12 digits by 1e-14).
// ===========================================================================
scalar ReferenceFluid::B(scalar T) const
{
    return alpha_.residual(1.0e-14, Tc_ / T).a_d / rhoc_;
}

scalar ReferenceFluid::C(scalar T) const
{
    return alpha_.residual(1.0e-14, Tc_ / T).a_dd / (rhoc_ * rhoc_);
}

// ===========================================================================
//  The publication's check values
// ===========================================================================
namespace {

// Pass when |computed - published| is within half a unit in the last
// printed significant digit (a published exact zero must come out exactly
// zero to round-off).
//  `scale`: a value converted from the unit the publication printed it in
//  (a molar-basis paper: rho x M, h x 1000/M) is judged on the PRINTED
//  number's last digit -- the record states the factor as `printedScale`,
//  so pub/scale is the number on the page.
CheckResult judge(const std::string& table, const std::string& label,
                  scalar pub, scalar calc, int digits, scalar scale = 1.0)
{
    CheckResult c;
    c.table = table; c.label = label;
    c.published = pub; c.computed = calc; c.digits = digits;
    if (pub == 0.0)
    {
        c.relDev = std::fabs(calc);
        c.ok = std::fabs(calc) < 1.0e-12;
        return c;
    }
    c.relDev = std::fabs(calc - pub) / std::fabs(pub);
    const scalar e   = std::floor(std::log10(std::fabs(pub / scale)));
    const scalar ulp = std::pow(10.0, e - digits + 1) * std::fabs(scale);
    c.ok = std::fabs(calc - pub) <= 0.5 * ulp * (1.0 + 1.0e-9);
    return c;
}

} // namespace

std::vector<CheckResult> ReferenceFluid::verify() const
{
    std::vector<CheckResult> out;
    const DictPtr& cv = checks_;

    if (cv->found("reducedHelmholtz"))
        for (const DictPtr& e : cv->lookupDictList("reducedHelmholtz"))
        {
            const std::string tab = e->lookupWord("table");
            const scalar T   = e->lookupScalar("T", Dims::temperature);
            const scalar rho = e->lookupScalar("rho", Dims::density);
            const int dig = int(e->lookupScalar("digits"));
            const scalar sc = e->lookupScalarOrDefault("printedScale", 1.0);
            const State s = at(T, rho);
            const std::string at_ = "T = " + g9(T) + " K, rho = " + g9(rho) + " kg/m3: ";
            const std::pair<const char*, scalar> v[] = {
                { "a0", s.a0.a }, { "a0_d", s.a0.a_d }, { "a0_dd", s.a0.a_dd },
                { "a0_t", s.a0.a_t }, { "a0_tt", s.a0.a_tt }, { "a0_dt", s.a0.a_dt },
                { "ar", s.ar.a }, { "ar_d", s.ar.a_d }, { "ar_dd", s.ar.a_dd },
                { "ar_t", s.ar.a_t }, { "ar_tt", s.ar.a_tt }, { "ar_dt", s.ar.a_dt } };
            for (const auto& kv : v)
                if (e->found(kv.first))
                    out.push_back(judge(tab, at_ + kv.first,
                        e->lookupScalar(kv.first), kv.second, dig, sc));
        }

    if (cv->found("singlePhase"))
        for (const DictPtr& e : cv->lookupDictList("singlePhase"))
        {
            const std::string tab = e->lookupWord("table");
            const scalar T   = e->lookupScalar("T", Dims::temperature);
            const scalar rho = e->lookupScalar("rho", Dims::density);
            const int dig = int(e->lookupScalar("digits"));
            const scalar sc = e->lookupScalarOrDefault("printedScale", 1.0);
            const State s = at(T, rho);
            const std::string at_ = "T = " + g9(T) + " K, rho = " + g9(rho) + " kg/m3: ";
            if (e->found("p"))  out.push_back(judge(tab, at_ + "p",  e->lookupScalar("p",  Dims::pressure),     s.p, dig, sc));
            if (e->found("cv")) out.push_back(judge(tab, at_ + "cv", e->lookupScalar("cv", Dims::heatCapacity), s.cv, dig, sc));
            if (e->found("cp")) out.push_back(judge(tab, at_ + "cp", e->lookupScalar("cp", Dims::heatCapacity), s.cp, dig, sc));
            if (e->found("w"))  out.push_back(judge(tab, at_ + "w",  e->lookupScalar("w",  Dims::velocity),     s.w, dig, sc));
            if (e->found("s"))  out.push_back(judge(tab, at_ + "s",  e->lookupScalar("s",  Dims::heatCapacity), s.s, dig, sc));
            if (e->found("h"))  out.push_back(judge(tab, at_ + "h",  e->lookupScalar("h",  Dims::specificEnergy), s.h, dig, sc));
            if (e->found("u"))  out.push_back(judge(tab, at_ + "u",  e->lookupScalar("u",  Dims::specificEnergy), s.u, dig, sc));
        }

    if (cv->found("saturation"))
        for (const DictPtr& e : cv->lookupDictList("saturation"))
        {
            const std::string tab = e->lookupWord("table");
            const scalar T = e->lookupScalar("T", Dims::temperature);
            const int dig = int(e->lookupScalar("digits"));
            const scalar sc = e->lookupScalarOrDefault("printedScale", 1.0);
            const Saturation s = saturation(T);
            const std::string at_ = "saturation at T = " + g9(T) + " K: ";
            if (e->found("psat")) out.push_back(judge(tab, at_ + "psat", e->lookupScalar("psat", Dims::pressure), s.psat, dig, sc));
            if (e->found("rhoL")) out.push_back(judge(tab, at_ + "rhoL", e->lookupScalar("rhoL", Dims::density), s.rhoL, dig, sc));
            if (e->found("rhoV")) out.push_back(judge(tab, at_ + "rhoV", e->lookupScalar("rhoV", Dims::density), s.rhoV, dig, sc));
            if (e->found("hL"))   out.push_back(judge(tab, at_ + "hL", e->lookupScalar("hL", Dims::specificEnergy), s.liquid.h, dig, sc));
            if (e->found("hV"))   out.push_back(judge(tab, at_ + "hV", e->lookupScalar("hV", Dims::specificEnergy), s.vapour.h, dig, sc));
            if (e->found("sL"))   out.push_back(judge(tab, at_ + "sL", e->lookupScalar("sL", Dims::heatCapacity), s.liquid.s, dig, sc));
            if (e->found("sV"))   out.push_back(judge(tab, at_ + "sV", e->lookupScalar("sV", Dims::heatCapacity), s.vapour.s, dig, sc));
            if (e->found("cvL"))  out.push_back(judge(tab, at_ + "cvL", e->lookupScalar("cvL", Dims::heatCapacity), s.liquid.cv, dig, sc));
            if (e->found("cvV"))  out.push_back(judge(tab, at_ + "cvV", e->lookupScalar("cvV", Dims::heatCapacity), s.vapour.cv, dig, sc));
            if (e->found("cpL"))  out.push_back(judge(tab, at_ + "cpL", e->lookupScalar("cpL", Dims::heatCapacity), s.liquid.cp, dig, sc));
            if (e->found("cpV"))  out.push_back(judge(tab, at_ + "cpV", e->lookupScalar("cpV", Dims::heatCapacity), s.vapour.cp, dig, sc));
            if (e->found("wL"))   out.push_back(judge(tab, at_ + "wL", e->lookupScalar("wL", Dims::velocity), s.liquid.w, dig, sc));
            if (e->found("wV"))   out.push_back(judge(tab, at_ + "wV", e->lookupScalar("wV", Dims::velocity), s.vapour.w, dig, sc));
        }

    //  A published property table on (T, p): the density is SOLVED (the
    //  stable root), so these check the root search as well as the equation.
    if (cv->found("pTState"))
        for (const DictPtr& e : cv->lookupDictList("pTState"))
        {
            const std::string tab = e->lookupWord("table");
            const scalar T = e->lookupScalar("T", Dims::temperature);
            const scalar p = e->lookupScalar("p", Dims::pressure);
            const int dig = int(e->lookupScalar("digits"));
            const scalar sc = e->lookupScalarOrDefault("printedScale", 1.0);
            const State s = at(T, density(T, p));
            const std::string at_ = "T = " + g9(T) + " K, p = " + g9(p) + " Pa: ";
            if (e->found("rho")) out.push_back(judge(tab, at_ + "rho", e->lookupScalar("rho", Dims::density), s.rho, dig, sc));
            if (e->found("u"))   out.push_back(judge(tab, at_ + "u",  e->lookupScalar("u",  Dims::specificEnergy), s.u, dig, sc));
            if (e->found("h"))   out.push_back(judge(tab, at_ + "h",  e->lookupScalar("h",  Dims::specificEnergy), s.h, dig, sc));
            if (e->found("s"))   out.push_back(judge(tab, at_ + "s",  e->lookupScalar("s",  Dims::heatCapacity), s.s, dig, sc));
            if (e->found("cv"))  out.push_back(judge(tab, at_ + "cv", e->lookupScalar("cv", Dims::heatCapacity), s.cv, dig, sc));
            if (e->found("cp"))  out.push_back(judge(tab, at_ + "cp", e->lookupScalar("cp", Dims::heatCapacity), s.cp, dig, sc));
            if (e->found("w"))   out.push_back(judge(tab, at_ + "w",  e->lookupScalar("w",  Dims::velocity), s.w, dig, sc));
        }

    if (cv->found("virial"))
        for (const DictPtr& e : cv->lookupDictList("virial"))
        {
            const std::string tab = e->lookupWord("table");
            const scalar T = e->lookupScalar("T", Dims::temperature);
            const int dig = int(e->lookupScalar("digits"));
            const scalar sc = e->lookupScalarOrDefault("printedScale", 1.0);
            const std::string at_ = "virial at T = " + g9(T) + " K: ";
            if (e->found("B")) out.push_back(judge(tab, at_ + "B", e->lookupScalar("B"), B(T), dig, sc));
            if (e->found("C")) out.push_back(judge(tab, at_ + "C", e->lookupScalar("C"), C(T), dig, sc));
        }

    if (out.empty())
        throw std::runtime_error(path_ + ": the checkValues block holds no "
            "check value -- a reference equation is shipped only with the "
            "publication's own verification values");
    return out;
}

scalar ReferenceFluid::worstRelativeDeviation() const
{
    scalar w = 0.0;
    for (const auto& c : verify()) w = std::max(w, c.relDev);
    return w;
}

std::string ReferenceFluid::windowSentence() const
{
    return "validated " + g9(Tmin_) + " K <= T <= " + g9(Tmax_) + " K, p <= "
         + g9(pMax_ / 1.0e6) + " MPa";
}

void ReferenceFluid::announceIfOutside(scalar T, scalar p) const
{
    if (T >= Tmin_ && T <= Tmax_ && p <= pMax_) return;
    const std::string key = "helmholtz-window:" + equation_ + ":" + g9(T) + ":" + g9(p);
    const std::string msg = "(T = " + g9(T) + " K, p = " + g9(p / 1.0e6)
        + " MPa) is OUTSIDE the window " + equation_ + " is " + windowSentence()
        + " for -- EXTRAPOLATED.  The publication on extrapolation: "
        + extrapolation_;
    if (AdvisoryLog::instance().addAnnouncedOnce(key, "validity", "warning",
            "reference equation '" + equation_ + "'", msg))
        std::cerr << "[referenceEoS] " << equation_ << ": " << msg << "\n";
}

} // namespace helmholtz
} // namespace Choupo
