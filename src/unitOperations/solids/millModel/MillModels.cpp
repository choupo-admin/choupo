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

#include "unitOperations/solids/millModel/MillModels.H"
#include "core/Dimensions.H"

#include <cmath>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

MillAnchor anchor(scalar mine, scalar theirs, const std::string& kind,
                  const std::string& where)
{
    MillAnchor a;
    a.choupo = mine;
    a.published = theirs;
    a.dev = (theirs != 0.0) ? std::abs(mine - theirs) / std::abs(theirs) : std::abs(mine);
    a.kind = kind;
    a.where = where;
    return a;
}

//  A dimensioned key that must be present -- the refusal names the block.
scalar need(const DictPtr& d, const std::string& block, const std::string& key,
            const Dimensions& dims)
{
    if (!d->found(key))
        throw std::runtime_error("mill: `" + block + " { " + key + " ...; }` is "
            "missing -- the model cannot run without it.");
    return d->lookupScalar(key, dims);
}

// ---------------------------------------------------------------------------
//  AUSTIN SELECTION FUNCTION (King 2001, eq. 5.127, p. 187, after Austin,
//  Klimpel & Luckie 1984):
//
//      S(x) = S1 (x/x1)^alpha / ( 1 + (x/mu)^Lambda )
//
//  S1 the specific rate at the reference size x1, alpha the power-law slope
//  (Herbst & Fuerstenau 1980 eq. 22 is the mu -> infinity limit), mu the size
//  near which the rate passes through its maximum and Lambda how fast it
//  falls beyond it.  Without `mu` the denominator is 1: the pure power law.
class AustinSelection : public SelectionFunction
{
public:
    const std::string& type() const override
    { static const std::string t = "austin"; return t; }
    const std::string& citation() const override
    {
        static const std::string c = "Austin, L.G. (1971) Powder Technol. 5, "
            "1-17, eq. 37 (first-order breakage); the form with a maximum: "
            "King, R.P. (2001) Modeling and Simulation of Mineral Processing "
            "Systems, eq. 5.127, p. 187; power-law limit: Herbst & Fuerstenau "
            "(1980) Int. J. Miner. Process. 7, 1-31, eq. 22";
        return c;
    }
    const std::string& validityWindow() const override
    {
        static const std::string w = "tumbling (ball/rod) mills, first-order "
            "breakage; S1, alpha (, mu, Lambda) fitted to batch tests of the "
            "SAME material and mill conditions -- not transferable to another "
            "mill without a scale-up rule";
        return w;
    }
    std::string basis() const override { return "time"; }
    void readParameters(const DictPtr& d) override
    {
        S1_    = need(d, "selection", "S1", Dims::inverseTime);
        x1_    = d->lookupScalarOrDefault("x1", 1.0e-3, Dims::length);
        alpha_ = need(d, "selection", "alpha", Dims::dimensionless);
        mu_    = d->found("mu") ? d->lookupScalar("mu", Dims::length) : 0.0;
        Lambda_ = d->lookupScalarOrDefault("Lambda", 2.0);
        if (S1_ < 0.0 || x1_ <= 0.0)
            throw std::runtime_error("mill: austin selection needs S1 >= 0 and "
                "x1 > 0.");
        if (d->found("mu") && (mu_ <= 0.0 || Lambda_ <= 0.0))
            throw std::runtime_error("mill: austin selection needs mu > 0 and "
                "Lambda > 0 when the maximum is declared.");
    }
    std::vector<scalar> extent(const std::vector<scalar>& x,
                               const MillContext& c) const override
    {
        std::vector<scalar> k(x.size(), 0.0);
        for (std::size_t i = 0; i < x.size(); ++i) k[i] = rate(x[i]) * c.tau;
        return k;
    }
    std::string describe() const override
    {
        std::ostringstream o;
        o << "S(x) = " << S1_ * 60.0 << " 1/min (x/" << x1_ * 1e6 << " um)^"
          << alpha_;
        if (mu_ > 0.0) o << " / (1 + (x/" << mu_ * 1e6 << " um)^" << Lambda_ << ")";
        return o.str();
    }
    MillAnchor verify() const override
    {
        //  The primaries print no worked value of S(x) at a second size.  The
        //  anchor is the IDENTITY at the reference size, with the limestone
        //  numbers of Herbst & Fuerstenau (1980) p. 19: k1 = 0.780 1/min for
        //  8x10 mesh feed, alpha = 0.75 -- what mill01 uses.
        AustinSelection s;
        s.S1_ = 0.780 / 60.0; s.x1_ = 2.0e-3; s.alpha_ = 0.75; s.mu_ = 0.0;
        return anchor(s.rate(2.0e-3) * 60.0, 0.780, "identity",
                      "Herbst & Fuerstenau 1980 p. 19: k1 = 0.780 1/min at the "
                      "8x10 mesh feed size");
    }
private:
    scalar rate(scalar x) const
    {
        if (x <= 0.0) return 0.0;
        scalar s = S1_ * std::pow(x / x1_, alpha_);
        if (mu_ > 0.0) s /= 1.0 + std::pow(x / mu_, Lambda_);
        return s;
    }
    scalar S1_ = 0.0, x1_ = 1.0e-3, alpha_ = 1.0, mu_ = 0.0, Lambda_ = 2.0;
};

// ---------------------------------------------------------------------------
//  HERBST-FUERSTENAU ENERGY-SPECIFIC SELECTION (Herbst & Fuerstenau 1980,
//  eqs. 10-11; size dependence as given by King 2001, eq. 5.138, p. 193):
//
//      S_i = S_i^E P/H                    (eq. 10: the rate scales with the
//                                          net specific power)
//      ln(S_i^E / S_1^E) = z1 ln(x_i/x_1) + z2 [ln(x_i/x_1)]^2
//
//  so the extent of one pass is kappa_i = S_i^E E with E = P/W the net
//  specific energy.  S_1^E is reported in t/kWh, the unit the literature
//  uses; z2 = 0 is the power law.
class HerbstFuerstenauSelection : public SelectionFunction
{
public:
    const std::string& type() const override
    { static const std::string t = "herbstFuerstenau"; return t; }
    const std::string& citation() const override
    {
        static const std::string c = "Herbst, J.A.; Fuerstenau, D.W. (1980) "
            "Int. J. Miner. Process. 7, 1-31, eqs. 10-11 and 22; quadratic size "
            "dependence: King, R.P. (2001) eq. 5.138, p. 193";
        return c;
    }
    const std::string& validityWindow() const override
    {
        static const std::string w = "ball mills in the normal operating range "
            "(H&F 1980 Fig. 3: P/H from about 15 to 50 kW/t, mill diameters "
            "25-76 cm); S^E depends on the ball size, so it is measured with "
            "the ball charge of the mill it is used for (King p. 192)";
        return w;
    }
    std::string basis() const override { return "energy"; }
    void readParameters(const DictPtr& d) override
    {
        //  t/kWh -> kg/J.  The dimension of S^E is mass per energy.
        S1E_ = need(d, "selection", "S1E", Dimensions{ 0, -2, 2, 0, 0 });
        x1_  = need(d, "selection", "x1", Dims::length);
        z1_  = d->lookupScalarOrDefault("zeta1", 0.0);
        z2_  = d->lookupScalarOrDefault("zeta2", 0.0);
        if (S1E_ < 0.0 || x1_ <= 0.0)
            throw std::runtime_error("mill: herbstFuerstenau selection needs "
                "S1E >= 0 and x1 > 0.");
        if (z2_ > 0.0)
            throw std::runtime_error("mill: herbstFuerstenau `zeta2` must be "
                "<= 0 -- a positive value gives the specific rate a MINIMUM "
                "instead of a maximum (King p. 194).");
    }
    std::vector<scalar> extent(const std::vector<scalar>& x,
                               const MillContext& c) const override
    {
        std::vector<scalar> k(x.size(), 0.0);
        for (std::size_t i = 0; i < x.size(); ++i)
        {
            if (x[i] <= 0.0) continue;
            const scalar l = std::log(x[i] / x1_);
            k[i] = S1E_ * std::exp(z1_ * l + z2_ * l * l) * c.E;
        }
        return k;
    }
    std::string describe() const override
    {
        std::ostringstream o;
        o << "S^E(x) = " << S1E_ * 3.6e6 / 1000.0 << " t/kWh exp(" << z1_
          << " ln(x/x1) + " << z2_ << " ln^2(x/x1)),  x1 = " << x1_ * 1e6
          << " um;  extent = S^E E";
        return o.str();
    }
    MillAnchor verify() const override
    {
        //  The scale-up identity the model rests on (eq. 10 with P = E W):
        //  H&F 1980 p. 22-23 design the commercial mill at E = 1.82 kWh/t of
        //  ball-mill feed and W = 350 t/h, "1.82 x 350 or 637.0 kW".
        const scalar E = 1.82 * 3600.0;            // J/kg
        const scalar W = 350.0 * 1000.0 / 3600.0;  // kg/s
        return anchor(E * W / 1000.0, 637.0, "arithmetic",
                      "Herbst & Fuerstenau 1980 p. 23: P = 1.82 kWh/t x 350 t/h "
                      "= 637.0 kW");
    }
private:
    scalar S1E_ = 0.0, x1_ = 1.0e-3, z1_ = 0.0, z2_ = 0.0;
};

// ---------------------------------------------------------------------------
//  VOGEL-PEUKERT BREAKAGE PROBABILITY (Vogel & Peukert 2003, Powder
//  Technol. 129, 101-110, eq. 14):
//
//      P_B(x) = 1 - exp( - fMat x k (W_m,kin - W_m,min) ),   W_m,min = (x W_m,min)/x
//
//  the probability that a particle of size x breaks under k impacts of
//  mass-specific kinetic energy W_m,kin.  fMat and (x W_m,min) are MATERIAL
//  parameters (their Fig. 6 table: limestone 0.318 kg/(J m) and 0.5 J m/kg).
//  In a mill whose particles are stressed f times per second at W_m,kin each
//  (one impact per event), the specific rate is S(x) = f P_B(x) -- the
//  transfer to a mill is OURS, stated, and V&P say it "was successful and
//  will be studied further" (p. 109); the paper itself is single-particle.
class VogelPeukertSelection : public SelectionFunction
{
public:
    const std::string& type() const override
    { static const std::string t = "vogelPeukert"; return t; }
    const std::string& citation() const override
    {
        static const std::string c = "Vogel, L.; Peukert, W. (2003) Powder "
            "Technol. 129, 101-110, eq. 14 and the Fig. 6 parameter table";
        return c;
    }
    const std::string& validityWindow() const override
    {
        static const std::string w = "single-particle IMPACT breakage of "
            "polymers, limestone and glass, 0.095-8 mm, measured in a rotor "
            "impact device; the transfer to a mill as S = f P_B is a modelling "
            "step, not in the paper";
        return w;
    }
    std::string basis() const override { return "time"; }
    void readParameters(const DictPtr& d) override
    {
        fMat_ = need(d, "selection", "fMat", Dimensions{ 0, -3, 2, 0, 0 });
        xWmin_ = need(d, "selection", "xWmMin", Dimensions{ 0, 3, -2, 0, 0 });
        Wkin_ = need(d, "selection", "Wkin", Dims::specificEnergy);
        f_    = need(d, "selection", "stressFrequency", Dims::inverseTime);
        k_    = d->lookupScalarOrDefault("impacts", 1.0);
        if (fMat_ <= 0.0 || xWmin_ < 0.0 || Wkin_ < 0.0 || f_ < 0.0 || k_ <= 0.0)
            throw std::runtime_error("mill: vogelPeukert needs fMat > 0, "
                "xWmMin >= 0, Wkin >= 0, stressFrequency >= 0 and impacts > 0.");
    }
    std::vector<scalar> extent(const std::vector<scalar>& x,
                               const MillContext& c) const override
    {
        std::vector<scalar> k(x.size(), 0.0);
        for (std::size_t i = 0; i < x.size(); ++i)
            k[i] = f_ * probability(x[i]) * c.tau;
        return k;
    }
    std::string describe() const override
    {
        std::ostringstream o;
        o << "S(x) = " << f_ << " 1/s [1 - exp(-" << fMat_ << " x " << k_
          << " (" << Wkin_ << " J/kg - " << xWmin_ << "/x))]";
        return o.str();
    }
    MillAnchor verify() const override
    {
        //  "The product fMat x k (Wm,kin - Wm,min) can be interpreted as a
        //  dimensionless stressing parameter ... a value of 1 corresponds to a
        //  breakage probability of 63%" (V&P 2003 p. 108), on PMMA G55
        //  (Fig. 6 table: fMat 0.111, x Wm,min 2.9) at x = 2.25 mm.
        VogelPeukertSelection v;
        v.fMat_ = 0.111; v.xWmin_ = 2.9; v.k_ = 1.0; v.f_ = 1.0;
        const scalar x = 2.25e-3;
        v.Wkin_ = 1.0 / (v.fMat_ * x) + v.xWmin_ / x;
        return anchor(100.0 * v.probability(x), 63.0, "identity",
                      "Vogel & Peukert 2003 p. 108: a stressing parameter of 1 "
                      "is a breakage probability of 63 %");
    }
    //  Public for the bench reading in the log.
    scalar probability(scalar x) const
    {
        if (x <= 0.0) return 0.0;
        const scalar net = Wkin_ - xWmin_ / x;
        if (net <= 0.0) return 0.0;          // below the threshold: no breakage
        return 1.0 - std::exp(-fMat_ * x * k_ * net);
    }
private:
    scalar fMat_ = 0.0, xWmin_ = 0.0, Wkin_ = 0.0, f_ = 0.0, k_ = 1.0;
};

// ---------------------------------------------------------------------------
//  AUSTIN BREAKAGE FUNCTION (normalised two-power form; King 2001, eq. 5.78,
//  p. 173; Austin 1971 p. 2 for the definition of B):
//
//      B(u) = phi u^gamma + (1 - phi) u^beta,      u = x/y
//
//  gamma is the slope in the fine range (Herbst & Fuerstenau 1980 p. 20 read
//  0.75 for limestone), beta the steeper coarse branch, phi the weight.
class AustinBreakage : public BreakageFunction
{
public:
    const std::string& type() const override
    { static const std::string t = "austin"; return t; }
    const std::string& citation() const override
    {
        static const std::string c = "King, R.P. (2001) Modeling and Simulation "
            "of Mineral Processing Systems, eqs. 5.78-5.79, p. 173; definition "
            "of B: Austin, L.G. (1971) Powder Technol. 5, 1-17, p. 2; "
            "normalisability: Herbst & Fuerstenau (1980) eq. 21";
        return c;
    }
    const std::string& validityWindow() const override
    {
        static const std::string w = "NORMALISABLE materials (the fragment "
            "distribution depends on x/y only, H&F 1980 eq. 21); 0 < phi < 1, "
            "0 < gamma < beta";
        return w;
    }
    void readParameters(const DictPtr& d) override
    {
        phi_   = need(d, "breakage", "phi", Dims::dimensionless);
        gamma_ = need(d, "breakage", "gamma", Dims::dimensionless);
        beta_  = need(d, "breakage", "beta", Dims::dimensionless);
        if (!(phi_ > 0.0 && phi_ <= 1.0) || !(gamma_ > 0.0) || !(beta_ > 0.0))
            throw std::runtime_error("mill: austin breakage needs 0 < phi <= 1, "
                "gamma > 0 and beta > 0 -- B(u) must rise monotonically from 0 "
                "to 1.");
    }
    scalar B(scalar u) const override
    {
        if (u <= 0.0) return 0.0;
        if (u >= 1.0) return 1.0;
        return phi_ * std::pow(u, gamma_) + (1.0 - phi_) * std::pow(u, beta_);
    }
    std::string describe() const override
    {
        std::ostringstream o;
        o << "B(u) = " << phi_ << " u^" << gamma_ << " + " << (1.0 - phi_)
          << " u^" << beta_;
        return o.str();
    }
    MillAnchor verify() const override
    {
        //  King 2001, Illustrative example 5.2 (pp. 159-160): phi 0.3,
        //  gamma 0.45, beta 3.2; parent representative size 11.28 cm, child
        //  class 7.50-5.60 cm:  b52 = 0.4393 - 0.2934 = 0.1459.
        AustinBreakage b;
        b.phi_ = 0.3; b.gamma_ = 0.45; b.beta_ = 3.2;
        const scalar v = b.B(7.5 / 11.28) - b.B(5.6 / 11.28);
        return anchor(v, 0.1459, "worked example",
                      "King 2001 Illustrative example 5.2, p. 160: b52 = 0.1459");
    }
private:
    scalar phi_ = 0.5, gamma_ = 1.0, beta_ = 3.0;
};

template <class R> std::map<std::string, R>& reg()
{
    static std::map<std::string, R> r;
    return r;
}

template <class Base, class Map>
std::unique_ptr<Base> build(Map& r, const std::string& name, const char* family)
{
    auto it = r.find(name);
    if (it == r.end())
    {
        std::string avail;
        for (const auto& kv : r) avail += " " + kv.first;
        throw std::runtime_error(std::string("mill: unknown ") + family
            + " model '" + name + "'.  Registered:" + avail);
    }
    return it->second();
}

} // namespace


// ===========================================================================
std::map<std::string, SelectionFunction::Factory>& SelectionFunction::registry()
{ return reg<Factory>(); }

void SelectionFunction::registerType(const std::string& name, Factory f)
{ registry()[name] = std::move(f); }

std::unique_ptr<SelectionFunction> SelectionFunction::New(const std::string& name)
{ return build<SelectionFunction>(registry(), name, "selection-function"); }

std::vector<std::string> SelectionFunction::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void SelectionFunction::registerBuiltins()
{
    registerType("austin",           []{ return std::make_unique<AustinSelection>();           });
    registerType("herbstFuerstenau", []{ return std::make_unique<HerbstFuerstenauSelection>(); });
    registerType("vogelPeukert",     []{ return std::make_unique<VogelPeukertSelection>();     });
}

// ===========================================================================
std::map<std::string, BreakageFunction::Factory>& BreakageFunction::registry()
{ return reg<Factory>(); }

void BreakageFunction::registerType(const std::string& name, Factory f)
{ registry()[name] = std::move(f); }

std::unique_ptr<BreakageFunction> BreakageFunction::New(const std::string& name)
{ return build<BreakageFunction>(registry(), name, "breakage-function"); }

std::vector<std::string> BreakageFunction::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void BreakageFunction::registerBuiltins()
{
    registerType("austin", []{ return std::make_unique<AustinBreakage>(); });
}

// ===========================================================================
const std::string& BondEnergy::citation()
{
    static const std::string c = "Bond, F.C. (1952) Trans. AIME 193, 484-494, "
        "as given by Wills & Napier-Munn (2006) Mineral Processing Technology, "
        "7th ed., eq. 5.2 and Table 5.1, p. 111; King (2001) eqs. 5.165-5.167, "
        "p. 202";
    return c;
}

const std::string& BondEnergy::validityWindow()
{
    static const std::string w = "conventional rod- and ball-mill grinding "
        "(Wills p. 111, after Hukki: Kick's law is closer above about 1 cm, "
        "Rittinger's in 10-1000 um); Wi from the standard test calibrates a "
        "2.44 m wet overflow ball mill in closed circuit at 250 % circulating "
        "load (King p. 202) -- other circuits need King's efficiency factors";
    return w;
}

scalar BondEnergy::specificEnergy(scalar Wi, scalar F80, scalar P80)
{
    //  W = 10 Wi (1/sqrt(P80[um]) - 1/sqrt(F80[um])) = Wi (sqrt(100um/P80) -
    //  sqrt(100um/F80)): the same law with the reference size written out,
    //  so it holds in any unit of Wi.
    if (!(P80 > 0.0) || !(F80 > 0.0)) return 0.0;
    const scalar xr = 100.0e-6;
    return Wi * (std::sqrt(xr / P80) - std::sqrt(xr / F80));
}

MillAnchor BondEnergy::verify()
{
    //  The work index IS, by definition, the energy from an infinite feed to
    //  80 % passing 100 um (Wills p. 111).  Limestone, Wills Table 5.1:
    //  Wi = 12.74 kWh/short ton.
    const scalar Wi = 12.74;
    return anchor(specificEnergy(Wi, 1.0e30, 100.0e-6), 12.74, "identity",
                  "Wills & Napier-Munn 2006 p. 111: Wi is the energy from "
                  "infinite size to 80 % passing 100 um (limestone 12.74)");
}

} // namespace Choupo
