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

#include "unitOperations/solids/classifierModel/PartitionCurves.H"
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

MillAnchor anchorOf(scalar mine, scalar theirs, const std::string& kind,
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

scalar needKey(const DictPtr& d, const std::string& owner, const std::string& key,
               const Dimensions& dims)
{
    if (!d->found(key))
        throw std::runtime_error(owner + ": `partition { " + key + " ...; }` is "
            "missing -- the curve cannot be drawn without it.");
    return d->lookupScalar(key, dims);
}

// ---------------------------------------------------------------------------
//  WHITEN (Nageswararao, Wiseman & Napier-Munn 2004, eq. 21, p. 681).  The
//  paper writes the ACTUAL recovery to OVERFLOW,
//
//      E_oa,i = C [ (e^a - 1) / (e^(a d_i/d50c) + e^a - 2) ],
//
//  C the water split to overflow (= 1 - R_f).  Dividing by C gives the
//  corrected recovery to overflow; its complement is the corrected recovery
//  to the coarse product (the underflow), which is what this object returns:
//
//      c(d) = 1 - (e^a - 1) / (e^(a d/d50c) + e^a - 2).
//
//  At d = d50c the bracket is (e^a - 1)/(2 e^a - 2) = 1/2 exactly: the
//  definition of d50c the paper states for eq. 25 (p. 683).
class WhitenPartition : public PartitionCurve
{
public:
    const std::string& type() const override
    { static const std::string t = "whiten"; return t; }
    const std::string& citation() const override
    {
        static const std::string c = "Whiten form of the efficiency curve, as "
            "given by Nageswararao, K.; Wiseman, D.M.; Napier-Munn, T.J. (2004) "
            "Miner. Eng. 17, 671-687, eq. 21, p. 681";
        return c;
    }
    const std::string& validityWindow() const override
    {
        static const std::string w = "a monotone curve (no fish hook: the "
            "beta form, eq. 25, is not built); the sharpness a is a property "
            "of the feed material, determined by test work (p. 681)";
        return w;
    }
    void readParameters(const DictPtr& d, std::size_t, const std::string& owner) override
    {
        alpha_ = needKey(d, owner, "alpha", Dims::dimensionless);
        if (!(alpha_ > 0.0))
            throw std::runtime_error(owner + ": whiten partition needs alpha > 0 "
                "(a = 0 is no classification at all).");
        if (d->found("d50c"))
        {
            d50c_ = d->lookupScalar("d50c", Dims::length);
            if (!(d50c_ > 0.0))
                throw std::runtime_error(owner + ": whiten partition needs d50c > 0.");
        }
    }
    void setCutSize(scalar d) override { d50c_ = d; }
    bool hasCutSize() const override { return d50c_ > 0.0; }
    std::vector<scalar> corrected(const std::vector<scalar>&,
                                  const std::vector<scalar>& x) const override
    {
        std::vector<scalar> c(x.size(), 0.0);
        for (std::size_t k = 0; k < x.size(); ++k) c[k] = value(x[k]);
        return c;
    }
    std::string describe() const override
    {
        std::ostringstream o;
        o << "c(d) = 1 - (e^a - 1)/(e^(a d/d50c) + e^a - 2),  a = " << alpha_
          << ",  d50c = " << d50c_ * 1e6 << " um";
        return o.str();
    }
    MillAnchor verify() const override
    {
        //  The definition of d50c (p. 683): at d = d50c the overflow
        //  recovery is C/2, so the corrected recovery is 1/2 -- for ANY a.
        WhitenPartition w;
        w.alpha_ = 2.5; w.d50c_ = 100.0e-6;
        return anchorOf(w.value(100.0e-6), 0.5, "identity",
            "Nageswararao et al. 2004 p. 683: d = d50c where E_oa = C/2");
    }
private:
    scalar value(scalar d) const
    {
        if (!(d50c_ > 0.0)) return 0.0;
        const scalar ea = std::exp(alpha_);
        const scalar u  = alpha_ * d / d50c_;
        if (u > 700.0) return 1.0;                   // e^u overflows; the limit
        return 1.0 - (ea - 1.0) / (std::exp(u) + ea - 2.0);
    }
    scalar alpha_ = 0.0, d50c_ = 0.0;
};

// ---------------------------------------------------------------------------
//  ROSIN-RAMMLER FORM (King 2001 eq. 4.41, p. 89, for the screen; the same
//  form Nageswararao et al. 2004 eq. 20 attribute to Plitt (1971) with ln 2):
//
//      c(d) = 1 - exp[ -0.693 (d/d50)^m ]
//
//  King prints the constant as 0.693 (ln 2 to three figures); it is kept as
//  printed, so c(d50) = 0.49997, not 1/2 -- the anchor says so.
class RosinRammlerPartition : public PartitionCurve
{
public:
    const std::string& type() const override
    { static const std::string t = "rosinRammler"; return t; }
    const std::string& citation() const override
    {
        static const std::string c = "King, R.P. (2001) Modeling and Simulation "
            "of Mineral Processing Systems, eq. 4.41, p. 89; Plitt's form as "
            "given by Nageswararao et al. (2004) eq. 20, p. 680";
        return c;
    }
    const std::string& validityWindow() const override
    {
        static const std::string w = "a monotone S-curve through d50; the "
            "sharpness m is fitted to the device and feed (King uses m = 5.9 "
            "for a vibrating screen, p. 89)";
        return w;
    }
    void readParameters(const DictPtr& d, std::size_t, const std::string& owner) override
    {
        m_ = needKey(d, owner, "m", Dims::dimensionless);
        if (!(m_ > 0.0))
            throw std::runtime_error(owner + ": rosinRammler partition needs m > 0.");
        if (d->found("d50"))
        {
            d50_ = d->lookupScalar("d50", Dims::length);
            if (!(d50_ > 0.0))
                throw std::runtime_error(owner + ": rosinRammler partition needs d50 > 0.");
        }
    }
    void setCutSize(scalar d) override { d50_ = d; }
    bool hasCutSize() const override { return d50_ > 0.0; }
    std::vector<scalar> corrected(const std::vector<scalar>&,
                                  const std::vector<scalar>& x) const override
    {
        std::vector<scalar> c(x.size(), 0.0);
        for (std::size_t k = 0; k < x.size(); ++k) c[k] = value(x[k]);
        return c;
    }
    std::string describe() const override
    {
        std::ostringstream o;
        o << "c(d) = 1 - exp(-0.693 (d/d50)^m),  m = " << m_ << ",  d50 = "
          << d50_ * 1e6 << " um";
        return o.str();
    }
    MillAnchor verify() const override
    {
        RosinRammlerPartition r;
        r.m_ = 5.9; r.d50_ = 1.0e-3;
        return anchorOf(r.value(1.0e-3), 1.0 - std::exp(-0.693), "identity",
            "King 2001 eq. 4.41 p. 89 at d = d50: 1 - exp(-0.693) = 0.49997");
    }
private:
    scalar value(scalar d) const
    {
        if (!(d50_ > 0.0) || d <= 0.0) return 0.0;
        return 1.0 - std::exp(-0.693 * std::pow(d / d50_, m_));
    }
    scalar m_ = 0.0, d50_ = 0.0;
};

// ---------------------------------------------------------------------------
//  TABULATED: c_k declared on the case's classes, pan first.  Herbst &
//  Fuerstenau (1980, p. 18) specify their design classifier this way -- the
//  diagonal of the classifier matrix C, class by class -- and a plant test
//  reports it this way (Wills & Napier-Munn Table 9.1, p. 216).
class TabulatedPartition : public PartitionCurve
{
public:
    const std::string& type() const override
    { static const std::string t = "tabulated"; return t; }
    const std::string& citation() const override
    {
        static const std::string c = "the classification function class by "
            "class: King (2001) section 4.2, eqs. 4.20-4.29, pp. 86-87; "
            "Herbst & Fuerstenau (1980) Int. J. Miner. Process. 7, p. 18 "
            "(classifier matrix C)";
        return c;
    }
    const std::string& validityWindow() const override
    {
        static const std::string w = "only the case's own classes: the values "
            "are NOT interpolated to any other grid";
        return w;
    }
    void readParameters(const DictPtr& d, std::size_t nC, const std::string& owner) override
    {
        if (!d->found("corrected"))
            throw std::runtime_error(owner + ": tabulated partition needs "
                "`corrected ( c_pan c_1 ... c_top );` -- one value per class of "
                "the case's size grid, the pan first.");
        c_ = d->lookupList("corrected");
        if (c_.size() != nC)
            throw std::runtime_error(owner + ": tabulated partition has "
                + std::to_string(c_.size()) + " values but the case's size grid "
                "has " + std::to_string(nC) + " classes (the pan included).  "
                "A tabulated curve is given on the case's own classes.");
        for (auto v : c_)
            if (v < 0.0 || v > 1.0)
                throw std::runtime_error(owner + ": tabulated partition value "
                    "outside [0, 1] -- a fraction of a class cannot be negative "
                    "or exceed the class.");
    }
    void setCutSize(scalar) override
    {
        throw std::runtime_error("a tabulated partition has no cut size to set: "
            "its classes ARE the curve.  Use a law (whiten, rosinRammler) when "
            "a correlation predicts d50c.");
    }
    bool hasCutSize() const override { return true; }
    std::vector<scalar> corrected(const std::vector<scalar>&,
                                  const std::vector<scalar>&) const override
    { return c_; }
    std::string describe() const override
    {
        std::ostringstream o;
        o << "declared class by class (" << c_.size() << " values, pan first)";
        return o.str();
    }
    MillAnchor verify() const override
    {
        //  Nothing to compute: the curve IS its data.  The anchor records that
        //  honestly (an identity of the values with themselves), so no one
        //  reads a 0 % here as a test of physics.
        return anchorOf(1.0, 1.0, "identity",
            "a tabulated curve is its own data; nothing is computed");
    }
private:
    std::vector<scalar> c_;
};

template <class R> std::map<std::string, R>& reg()
{
    static std::map<std::string, R> r;
    return r;
}

} // namespace


// ===========================================================================
std::map<std::string, PartitionCurve::Factory>& PartitionCurve::registry()
{ return reg<Factory>(); }

void PartitionCurve::registerType(const std::string& name, Factory f)
{ registry()[name] = std::move(f); }

std::unique_ptr<PartitionCurve> PartitionCurve::New(const std::string& name,
                                                    const std::string& owner)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error(owner + ": unknown partition-curve model '"
            + name + "'.  Registered:" + avail);
    }
    return it->second();
}

std::vector<std::string> PartitionCurve::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void PartitionCurve::registerBuiltins()
{
    registerType("whiten",       []{ return std::make_unique<WhitenPartition>();       });
    registerType("rosinRammler", []{ return std::make_unique<RosinRammlerPartition>(); });
    registerType("tabulated",    []{ return std::make_unique<TabulatedPartition>();    });
}

// ===========================================================================
scalar partitionSize(const std::vector<scalar>& x,
                     const std::vector<scalar>& c, scalar level)
{
    for (std::size_t k = 0; k + 1 < x.size() && k + 1 < c.size(); ++k)
    {
        const scalar a = c[k], b = c[k + 1];
        if ((a - level) * (b - level) <= 0.0 && a != b && x[k] > 0.0 && x[k + 1] > 0.0)
        {
            const scalar t = (level - a) / (b - a);
            return std::exp(std::log(x[k]) + t * (std::log(x[k + 1]) - std::log(x[k])));
        }
    }
    return 0.0;
}

} // namespace Choupo
