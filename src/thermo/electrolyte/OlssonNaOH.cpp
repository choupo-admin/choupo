/*---------------------------------------------------------------------------*\
  OlssonNaOH -- see OlssonNaOH.H.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "thermo/electrolyte/OlssonNaOH.H"
#include "core/Constants.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {
namespace electrolyte {

namespace {

// sum_i c_i u^i
scalar powerSeries(const std::vector<scalar>& c, scalar u)
{
    scalar s = 0.0, p = 1.0;
    for (scalar ci : c) { s += ci * p; p *= u; }
    return s;
}

std::vector<scalar> listOfLength(const DictPtr& d, const std::string& key,
                                 std::size_t n, const std::string& where)
{
    const auto v = d->lookupList(key);
    if (v.size() != n)
        throw std::runtime_error(where + ": `" + key + "` must carry "
            + std::to_string(n) + " coefficients (it carries "
            + std::to_string(v.size()) + ") -- the record was transcribed"
            " from the paper's table and its length is fixed by the equation.");
    return v;
}

std::vector<OlssonNaOH::Band> bands(const DictPtr& d, const std::string& where)
{
    std::vector<OlssonNaOH::Band> b;
    for (const auto& r : d->lookupDictList("validity"))
        b.push_back({r->lookupScalar("tFrom"), r->lookupScalar("tTo"),
                     r->lookupScalar("xMin")});
    if (b.empty())
        throw std::runtime_error(where + ": `validity` is empty -- the paper"
            " declares a window for every correlation (Tables III and VII).");
    return b;
}

} // namespace

OlssonNaOH OlssonNaOH::fromRecord(const DictPtr& rec, const std::string& where)
{
    OlssonNaOH o;
    o.citation_ = rec->lookupWordOrDefault("citation", "Olsson, Jernqvist & Aly 1997");
    auto vp = rec->subDict("vapourPressure");
    o.kP_ = listOfLength(vp, "k", 9, where + " vapourPressure");
    o.lP_ = listOfLength(vp, "l", 11, where + " vapourPressure");
    o.mP_ = listOfLength(vp, "m", 11, where + " vapourPressure");
    o.winP_ = bands(vp, where + " vapourPressure");
    auto h = rec->subDict("enthalpy");
    o.kH_ = listOfLength(h, "k", 8, where + " enthalpy");
    o.lH_ = listOfLength(h, "l", 9, where + " enthalpy");
    o.mH_ = listOfLength(h, "m", 8, where + " enthalpy");
    o.nH_ = listOfLength(h, "n", 8, where + " enthalpy");
    o.winH_ = bands(h, where + " enthalpy");
    auto ho = rec->subDict("handover");
    o.mFrom_ = ho->lookupScalar("fromMolality");
    o.mTo_   = ho->lookupScalar("toMolality");
    if (!(o.mTo_ > o.mFrom_ && o.mFrom_ > 0.0))
        throw std::runtime_error(where + ": handover needs 0 < fromMolality"
            " < toMolality.");

    //  A TRANSCRIPTION GUARD, not a validation.  The paper prints no table of
    //  computed values, so the record cannot carry the paper's own check
    //  values; what it can check is that the correlations reduce to WATER at
    //  x = 1, where every one of them was also fitted.  A misread digit in a
    //  leading coefficient fails these by orders of magnitude; the
    //  tolerances are the fits' own scatter, not a claim of accuracy.
    o.loaded_ = true;
    const scalar P100 = std::exp(o.lnP_kPa(1.0, 100.0));   // 101.325 kPa
    const scalar dH   = o.H_kJkg(1.0, 100.0) - o.H_kJkg(1.0, 0.0);   // 419.1 kJ/kg
    auto off = [](scalar a, scalar b) { return std::abs(a / b - 1.0); };
    if (off(P100, 101.325) > 0.01 || off(dH, 419.1) > 0.01)
        throw std::runtime_error(where + ": the record does not reduce to"
            " water at x = 1 (P(100 C) = " + std::to_string(P100)
            + " kPa, H(100 C)-H(0 C) = " + std::to_string(dH)
            + " kJ/kg) -- a coefficient was mistranscribed; re-read the table.");
    return o;
}

scalar OlssonNaOH::lnP_kPa(scalar x, scalar t) const
{
    //  Eq. (2): a1 + a2 t + a3 ln P = t ln P  =>  ln P = (a1 + a2 t)/(t - a3)
    const scalar L  = std::log(x);
    const scalar a1 = powerSeries(kP_, L);
    const scalar a2 = powerSeries(lP_, L);
    const scalar a3 = powerSeries(mP_, L);
    return (a1 + a2 * t) / (t - a3);
}

scalar OlssonNaOH::H_kJkg(scalar x, scalar t) const
{
    //  Eq. (13): c1 is a rational function with the EVEN k in the numerator
    //  and the ODD k in the denominator (1 + k1 x + k3 x^2 + k5 x^3 + k7 x^4).
    const scalar num = kH_[0] + kH_[2] * x + kH_[4] * x * x + kH_[6] * x * x * x;
    const scalar den = 1.0 + kH_[1] * x + kH_[3] * x * x + kH_[5] * x * x * x
                     + kH_[7] * x * x * x * x;
    const scalar c1 = num / den;
    const scalar c2 = powerSeries(lH_, x);
    const scalar c3 = powerSeries(mH_, x);
    const scalar c4 = powerSeries(nH_, x);
    return c1 + t * (c2 + t * (c3 + t * c4));            // Eq. (12)
}

scalar OlssonNaOH::Phi(scalar m, scalar t) const
{
    const scalar x = xOfMolality(m);
    const scalar Hrel = H_kJkg(x, t) - x * H_kJkg(1.0, t);   // kJ/kg solution
    return Ms_ * Hrel / (1.0 - x);                          // kJ/kg NaOH * g/mol = J/mol
}

const std::vector<OlssonNaOH::Band>& OlssonNaOH::win_(Property p) const
{
    switch (p)
    {
        case Property::vapourPressure: return winP_;
        case Property::enthalpy:       return winH_;
    }
    return winP_;
}

scalar OlssonNaOH::tLow(Property p) const  { return win_(p).front().tFrom; }
scalar OlssonNaOH::tHigh(Property p) const { return win_(p).back().tTo; }

scalar OlssonNaOH::xMinAt(Property p, scalar t) const
{
    const auto& w = win_(p);
    for (const auto& b : w)
        if (t >= b.tFrom && t < b.tTo) return b.xMin;
    if (t == w.back().tTo) return w.back().xMin;   // the closed upper end
    return 1.0;
}

scalar OlssonNaOH::L1fromVapourPressure_(scalar x, scalar t) const
{
    //  Gibbs-Helmholtz on the solvent: d(mu_w/T)/dT = -h_w/T^2, so the
    //  relative partial molar enthalpy of water is L1 = -R T^2 (d ln a_w/dT)_x.
    const scalar T = t + 273.15, h = 0.01;
    const scalar d = (lnAw(x, t + h) - lnAw(x, t - h)) / (2.0 * h);
    return -constant::R * T * T * d / Mw_;            // J/g = kJ/kg water
}

scalar OlssonNaOH::gibbsHelmholtzGap(scalar x, scalar t) const
{
    constexpr scalar xRef = 0.8;
    if (x >= xRef) return 0.0;
    //  (a) heat of diluting 1 kg NaOH from x to xRef, from H:
    //      Q_H = [Hrel(xRef)/(1-xRef) - Hrel(x)/(1-x)]   (kJ/kg NaOH)
    auto HrelPerNaOH = [&](scalar xx)
    { return (H_kJkg(xx, t) - xx * H_kJkg(1.0, t)) / (1.0 - xx); };
    const scalar QH = HrelPerNaOH(xRef) - HrelPerNaOH(x);
    //  (b) the same heat from a_w(T): water added at relative partial
    //      enthalpy L1, dW = dx/(1-x)^2 kg water per kg NaOH.
    constexpr int n = 200;
    scalar QP = 0.0;
    for (int i = 0; i < n; ++i)
    {
        const scalar x0 = x + (xRef - x) * i / n, x1 = x + (xRef - x) * (i + 1) / n;
        const scalar xm = 0.5 * (x0 + x1);
        QP += L1fromVapourPressure_(xm, t) * (x1 - x0) / ((1.0 - xm) * (1.0 - xm));
    }
    return (QP - QH) * (1.0 - x);      // kJ per kg of the solution at x
}

} // namespace electrolyte
} // namespace Choupo
