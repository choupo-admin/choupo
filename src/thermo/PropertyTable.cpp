/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "PropertyTable.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/Table1D.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/liquidProperty/ExperimentsFile.H"

#include <array>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <utility>

namespace Choupo {

namespace {

std::string fmtT(scalar T)
{
    char b[48];
    std::snprintf(b, sizeof b, "%.6f K", T);
    return b;
}

std::string fmtG(scalar v)
{
    char b[48];
    std::snprintf(b, sizeof b, "%.6g", v);
    return b;
}

bool isLog(PropertyTable::Interpolation m)
{
    return m == PropertyTable::Interpolation::logLinear
        || m == PropertyTable::Interpolation::logReciprocal;
}

//  The excursion bookkeeping is shared by the Jacobian's pool threads.
std::mutex& excursionMutex()
{
    static std::mutex m;
    return m;
}

} // namespace

std::string PropertyTable::symbolOf(const std::string& property)
{
    if (property == "liquidViscosity") return "mu";
    if (property == "liquidHeatCapacity" || property == "solidHeatCapacity"
        || property == "idealGasHeatCapacity")
        return "Cp";
    return "";
}

std::unique_ptr<PropertyTable> PropertyTable::fromLaw(const DictPtr& body, const std::string& property,
                                                      const std::string& label, scalar MW,
                                                      std::string* columnsText)
{
    if (property == "idealGasHeatCapacity")
        throw std::runtime_error(label + ": a table of the IDEAL-GAS heat capacity is not accepted yet"
            " -- it enters the formation integrals, the Gibbs energies and every equilibrium constant,"
            " and waits for its own check (C398, ruled addendum A2(v)).  The liquid and solid heat"
            " capacities may be tables.");
    const bool cp = property == "liquidHeatCapacity" || property == "solidHeatCapacity";
    if (property != "liquidViscosity" && !cp)
        throw std::runtime_error(label + ": a table law is accepted for liquidViscosity,"
            " liquidHeatCapacity and solidHeatCapacity in this slice (C398 (c)); `" + property
            + "` is not one of them.");
    if (!body->found("interpolation"))
        throw std::runtime_error(label + ": `interpolation <word>;` is required -- linear, logLinear,"
            " logReciprocal or monotoneCubic (C398 V3: always declared, never defaulted).");
    const Interpolation m = interpolationOf(body->lookupWord("interpolation"), label);

    experiments::ColumnRole tRole;
    tRole.dims = Dims::temperature; tRole.what = "a temperature"; tRole.affineAllowed = true;
    experiments::ColumnRole yRole;
    if (cp)
    {
        yRole.dims = Dims::molarHeatCap; yRole.what = "a heat capacity (molar, or per mass)";
        yRole.alternative = Dims::heatCapacity; yRole.hasAlternative = true;
    }
    else
    {
        yRole.dims = Dims::viscosity; yRole.what = "a dynamic viscosity";
    }
    const experiments::Table t = experiments::readTable(body, { tRole, yRole }, label);
    const std::string sym = symbolOf(property);
    if (t.cols[0].name != "T" || t.cols[1].name != sym)
        throw std::runtime_error(label + ": the columns are named `" + t.cols[0].name + "` and `"
            + t.cols[1].name + "`; a table of " + property + " names them `T` and `" + sym + "`.");
    //  A value <= 0 is refused AS WRITTEN, with its unit (review row TB-06):
    //  the author finds the line by the number in the file, not by its SI
    //  conversion.  (The constructor's check below holds the same rule for a
    //  table built from SI values; every conversion here is a positive factor.)
    for (std::size_t k = 0; k < t.raw[1].size(); ++k)
        if (!(t.raw[1][k] > 0.0))
            throw std::runtime_error(label + ": point " + std::to_string(k + 1) + " gives the "
                + std::string(cp ? (property == "solidHeatCapacity" ? "solid heat capacity"
                                                                    : "liquid heat capacity")
                                 : "liquid viscosity")
                + " as " + fmtG(t.raw[1][k]) + " " + t.cols[1].unit + " -- it is positive by definition,"
                " so a value <= 0 is refused whatever the interpolation (C398 V4, amended).");
    std::vector<scalar> y = t.si[1];
    std::string yText = t.cols[1].declared();
    if (cp && t.cols[1].spec.dims == Dims::heatCapacity)
    {
        //  Per mass -> molar: J/(kg K) x MW [kg/kmol] / 1000 = J/(mol K).
        if (!std::isnan(MW) && !(MW > 0.0))
            throw std::runtime_error(label + ": the heat capacity is declared PER MASS (`"
                + t.cols[1].unit + "`) and the record's molar mass is " + fmtG(MW) + " -- it cannot be"
                " converted to a molar heat capacity (review row TB-02).  Give the record its `MW`,"
                " or declare the column in J/mol/K.");
        if (MW > 0.0)
        {
            for (auto& v : y) v *= MW * 1.0e-3;
            char b[64];
            std::snprintf(b, sizeof b, "%.8g", MW);
            yText = sym + " [" + t.cols[1].unit + ", x M = " + b + " g/mol -> J/(mol K)]";
        }
        else
            yText = sym + " [" + t.cols[1].unit + ", per mass: converted with the record's M]";
    }
    if (columnsText) *columnsText = t.cols[0].declared() + ", " + yText;
    auto table = std::make_unique<PropertyTable>(t.si[0], y, m, label,
        cp ? std::string(property == "solidHeatCapacity" ? "solid heat capacity" : "liquid heat capacity")
           : std::string("liquid viscosity"),
        cp);
    if (body->found("extend"))
    {
        const DictPtr e = body->subDict("extend");
        Extension x;
        for (const auto& k : e->keys())
            if (k != "upTo" && k != "downTo" && k != "reason")
                throw std::runtime_error(label + ": extend: unknown word '" + k + "' (upTo, downTo,"
                    " reason).");
        auto tOf = [&](const char* k)
        {
            if (!e->hasDimensions(k))
                throw std::runtime_error(label + ": extend: `" + std::string(k) + "` carries no unit"
                    " (write it in K or degC).");
            try { return e->lookupScalar(k, Dims::temperature); }
            catch (const std::exception& ex)   // a parse refusal, named by its table (TG-14)
            {
                throw std::runtime_error(label + ": extend: `" + std::string(k) + "` must be a"
                    " temperature (K or degC) -- " + ex.what());
            }
        };
        if (e->found("upTo"))   { x.hasHi = true; x.hi = tOf("upTo"); }
        if (e->found("downTo")) { x.hasLo = true; x.lo = tOf("downTo"); }
        if (!x.any())
            throw std::runtime_error(label + ": `extend` names neither `upTo` nor `downTo`.");
        x.reason = e->lookupWordOrDefault("reason", "");
        table->setExtension(x);
    }
    return table;
}

PropertyTable::Interpolation PropertyTable::interpolationOf(const std::string& w, const std::string& where)
{
    if (w == "linear")        return Interpolation::linear;
    if (w == "logLinear")     return Interpolation::logLinear;
    if (w == "logReciprocal") return Interpolation::logReciprocal;
    if (w == "monotoneCubic") return Interpolation::monotoneCubic;
    if (w == "clamp")
        throw std::runtime_error(where + ": `clamp` is refused -- a clamped table returns its end"
            " value with a zero slope outside its points, and its error has no bound (C398 5.5c R2)."
            "  Past an end, a case declares `extend { upTo <T>; downTo <T>; reason \"...\"; }`.");
    throw std::runtime_error(where + ": interpolation `" + w + "` -- declare one of linear (y in T),"
        " logLinear (ln y in T), logReciprocal (ln y in 1/T, the Arrhenius form) or monotoneCubic"
        " (Fritsch-Carlson on y); a table's interpolation is always declared.");
}

const char* PropertyTable::word(Interpolation m)
{
    switch (m)
    {
        case Interpolation::linear:        return "linear";
        case Interpolation::logLinear:     return "logLinear";
        case Interpolation::logReciprocal: return "logReciprocal";
        case Interpolation::monotoneCubic: return "monotoneCubic";
    }
    return "?";
}

std::size_t PropertyTable::minimumPoints(Interpolation m)
{
    return m == Interpolation::monotoneCubic ? 3 : 2;
}

PropertyTable::PropertyTable(std::vector<scalar> x, std::vector<scalar> y, Interpolation m,
                             std::string label, std::string quantity, bool integrated)
:   x_(std::move(x)), y_(std::move(y)), m_(m), label_(std::move(label)),
    quantity_(std::move(quantity)), integrated_(integrated)
{
    const std::size_t n = x_.size();
    if (y_.size() != n)
        throw std::runtime_error(label_ + ": " + std::to_string(n) + " temperatures and "
            + std::to_string(y_.size()) + " values.");
    if (n < minimumPoints(m_))
        throw std::runtime_error(label_ + ": " + std::to_string(n) + " point(s); interpolation "
            + word(m_) + " needs at least " + std::to_string(minimumPoints(m_)) + " (C398 V4).");
    for (std::size_t k = 0; k < n; ++k)
    {
        if (!std::isfinite(x_[k]) || !std::isfinite(y_[k]))
            throw std::runtime_error(label_ + ": point " + std::to_string(k + 1) + " is not finite.");
        if (k > 0 && !(x_[k] > x_[k - 1]))
            throw std::runtime_error(label_ + ": the temperatures must be strictly increasing, with no"
                " duplicate (point " + std::to_string(k + 1) + ", " + fmtT(x_[k]) + ", after "
                + fmtT(x_[k - 1]) + ").");
        //  Every property a table may carry (a viscosity, a heat capacity) is
        //  positive by definition, so a value <= 0 is refused under EVERY
        //  interpolation, not only the two log forms (C398 V4 as amended by
        //  the architect, review row TG-08: one sign typo gave a silent wrong
        //  number through a linear table).
        if (!(y_[k] > 0.0))
            throw std::runtime_error(label_ + ": point " + std::to_string(k + 1) + " gives the "
                + quantity_ + " as " + fmtG(y_[k]) + " -- it is positive by definition, so a value"
                " <= 0 is refused whatever the interpolation (C398 V4, amended).");
    }
    if (!(x_.front() > 0.0))
        throw std::runtime_error(label_ + ": the first temperature is not above 0 K.");

    if (m_ == Interpolation::monotoneCubic)
    {
        //  Fritsch-Carlson (1980): secant mean at inner nodes, one-sided at the
        //  ends, zero at a change of sign; then the circle a^2 + b^2 <= 9.
        std::vector<scalar> d(n - 1);
        for (std::size_t k = 0; k + 1 < n; ++k) d[k] = (y_[k + 1] - y_[k]) / (x_[k + 1] - x_[k]);
        slope_.assign(n, 0.0);
        slope_[0] = d[0];
        slope_[n - 1] = d[n - 2];
        for (std::size_t k = 1; k + 1 < n; ++k)
            slope_[k] = (d[k - 1] * d[k] <= 0.0) ? 0.0 : 0.5 * (d[k - 1] + d[k]);
        for (std::size_t k = 0; k + 1 < n; ++k)
        {
            if (d[k] == 0.0) { slope_[k] = 0.0; slope_[k + 1] = 0.0; continue; }
            const scalar a = slope_[k] / d[k], b = slope_[k + 1] / d[k];
            const scalar r2 = a * a + b * b;
            if (r2 > 9.0)
            {
                const scalar tau = 3.0 / std::sqrt(r2);
                slope_[k]     = tau * a * d[k];
                slope_[k + 1] = tau * b * d[k];
            }
        }
    }

    if (integrated_)
    {
        if (isLog(m_))
            throw std::runtime_error(label_ + ": interpolation " + std::string(word(m_)) + " has no"
                " closed-form integral of y/T, and this property is integrated to an enthalpy and an"
                " entropy -- declare linear or monotoneCubic.");
        poly_.resize(n - 1);
        for (std::size_t k = 0; k + 1 < n; ++k)
        {
            const scalar h = x_[k + 1] - x_[k];
            const scalar dk = (y_[k + 1] - y_[k]) / h;
            if (m_ == Interpolation::linear)
                poly_[k] = { y_[k], dk, 0.0, 0.0 };
            else
                poly_[k] = { y_[k], slope_[k],
                             (3.0 * dk - 2.0 * slope_[k] - slope_[k + 1]) / h,
                             (slope_[k] + slope_[k + 1] - 2.0 * dk) / (h * h) };
        }
        cum1_.assign(n, 0.0);
        cum2_.assign(n, 0.0);
        for (std::size_t k = 0; k + 1 < n; ++k)
        {
            scalar i1 = 0.0, i2 = 0.0;
            segmentIntegrals(poly_[k], x_[k], x_[k + 1] - x_[k], i1, i2);
            cum1_[k + 1] = cum1_[k] + i1;
            cum2_[k + 1] = cum2_[k] + i2;
        }
    }
}

void PropertyTable::setExtension(const Extension& e)
{
    if (!e.any()) { ext_ = e; return; }
    if (e.reason.empty())
        throw std::runtime_error(label_ + ": `extend` needs `reason \"...\";` -- a table past its"
            " points is a hypothesis of the case, and the run says why.");
    if (e.hasHi && !(e.hi > x_.back()))
        throw std::runtime_error(label_ + ": `extend { upTo " + fmtT(e.hi) + "; }` does not reach past"
            " the last point (" + fmtT(x_.back()) + ").");
    if (e.hasLo && !(e.lo < x_.front()))
        throw std::runtime_error(label_ + ": `extend { downTo " + fmtT(e.lo) + "; }` does not reach"
            " below the first point (" + fmtT(x_.front()) + ").");
    if (e.hasLo && !(e.lo > 0.0))
        throw std::runtime_error(label_ + ": `extend { downTo ...; }` must stay above 0 K.");
    ext_ = e;
    const std::size_t n = x_.size();
    if (ext_.hasHi && !(chord(n - 2, ext_.hi) > 0.0))
        throw std::runtime_error(label_ + ": the end segment's chord is not positive at upTo = "
            + fmtT(ext_.hi) + " -- the extension reaches further than the data's trend allows.");
    if (ext_.hasLo && !(chord(0, ext_.lo) > 0.0))
        throw std::runtime_error(label_ + ": the first segment's chord is not positive at downTo = "
            + fmtT(ext_.lo) + " -- the extension reaches further than the data's trend allows.");
}

std::size_t PropertyTable::segment(scalar T) const
{
    if (T <= x_.front()) return 0;
    if (T >= x_.back())  return x_.size() - 2;
    return table1d::segment(x_, T);
}

scalar PropertyTable::chord(std::size_t k, scalar T) const
{
    switch (m_)
    {
        case Interpolation::linear:
        case Interpolation::monotoneCubic:
            return table1d::linear(x_, y_, k, T);
        case Interpolation::logLinear:
        {
            const scalar w = (T - x_[k]) / (x_[k + 1] - x_[k]);
            return std::exp(std::log(y_[k]) + w * (std::log(y_[k + 1]) - std::log(y_[k])));
        }
        case Interpolation::logReciprocal:
        {
            const scalar w = (1.0 / T - 1.0 / x_[k]) / (1.0 / x_[k + 1] - 1.0 / x_[k]);
            return std::exp(std::log(y_[k]) + w * (std::log(y_[k + 1]) - std::log(y_[k])));
        }
    }
    return 0.0;
}

int PropertyTable::admit(scalar T, const char* what) const
{
    if (T >= x_.front() && T <= x_.back()) return 0;
    const bool above = T > x_.back();
    const bool inExt = above ? (ext_.hasHi && T <= ext_.hi) : (ext_.hasLo && T >= ext_.lo);
    if (!inExt)
    {
        std::string m = label_ + ": the computation asked for the " + quantity_ + " " + what
            + " at T = " + fmtT(T) + ", OUTSIDE the table's points (" + fmtT(x_.front()) + " to "
            + fmtT(x_.back()) + ").  A table has no value beyond its points, so this REFUSES";
        if (ext_.any())
            m += " (the case's extension reaches " + std::string(ext_.hasLo ? "down to " + fmtT(ext_.lo) : "")
               + (ext_.hasLo && ext_.hasHi ? " and " : "") + (ext_.hasHi ? "up to " + fmtT(ext_.hi) : "") + ")";
        m += ".  The state may be a solver's trial state (a seed, a probe) as well as an answer.";
        const std::string remedy = "add a point that covers the state; or pin a law that covers it; or"
            " give the points as the case's own table (constant/experiments/<name>.dat) and declare"
            " `extend { " + std::string(above ? "upTo" : "downTo")
            + " <T>; reason \"...\"; }` on the pin that names it";
        throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain, m + "  Remedy: " + remedy + ".",
                                  remedy);
    }
    //  Inside the declared extension: announced once, the largest excursion
    //  restated (C398 end rule (c)).
    //  THE MAXIMUM OVER EVERY OBJECT THAT BUILT THE SAME TABLE (review row
    //  TB-01): a second package's object of the same table must not restate a
    //  smaller excursion, so the largest is kept per LOCUS (the table's label
    //  and side), process-wide, and restated in each pass of the log.
    const scalar exc = above ? T - x_.back() : x_.front() - T;
    const std::string locus = label_ + (above ? " (above)" : " (below)");
    struct Held { scalar max = 0.0; unsigned long long generation = 0; bool told = false; };
    static std::map<std::string, Held> held;
    std::lock_guard<std::mutex> lk(excursionMutex());
    Held& h = held[locus];
    const unsigned long long gen = AdvisoryLog::instance().generation();
    if (exc > h.max || h.generation != gen)
    {
        h.max = std::max(h.max, exc);
        h.generation = gen;
        const std::string msg = "the " + quantity_ + " was taken past the table's "
            + std::string(above ? "last" : "first") + " point by the case's extension (chord of the end"
            " segment, " + word(m_) + "); largest excursion " + fmtG(h.max) + " K, to T = "
            + fmtT(above ? x_.back() + h.max : x_.front() - h.max) + "; reason: " + ext_.reason;
        AdvisoryLog::instance().restate("table", "warning", locus, msg);
    }
    if (!h.told)
    {
        h.told = true;
        std::cerr << "[table] " << label_ << ": evaluated at T = " << fmtT(T) << ", past its "
                  << (above ? "last" : "first") << " point, by the case's extension (" << ext_.reason
                  << "); the largest excursion is restated at the end of the run.\n";
    }
    return above ? 1 : -1;
}

scalar PropertyTable::value(scalar T) const
{
    const int where = admit(T, "value");
    const std::size_t n = x_.size();
    if (where > 0) return chord(n - 2, T);
    if (where < 0) return chord(0, T);
    for (std::size_t k = 0; k < n; ++k)
        if (T == x_[k]) return y_[k];               // ON a point: its own value, exactly
    const std::size_t k = segment(T);
    if (m_ != Interpolation::monotoneCubic) return chord(k, T);
    const scalar h = x_[k + 1] - x_[k];
    const scalar t = (T - x_[k]) / h;
    const scalar t2 = t * t, t3 = t2 * t;
    return (2.0 * t3 - 3.0 * t2 + 1.0) * y_[k] + (t3 - 2.0 * t2 + t) * h * slope_[k]
         + (-2.0 * t3 + 3.0 * t2) * y_[k + 1] + (t3 - t2) * h * slope_[k + 1];
}

void PropertyTable::segmentIntegrals(const std::array<scalar, 4>& c, scalar x0, scalar s,
                                     scalar& i1, scalar& i2) const
{
    //  I1 = c0 s + c1 s^2/2 + c2 s^3/3 + c3 s^4/4.
    i1 = s * (c[0] + s * (c[1] / 2.0 + s * (c[2] / 3.0 + s * c[3] / 4.0)));
    //  I2 = int_0^s p(t) / (x0 + t) dt.  On a SHORT segment (|s| <= x0/2, every
    //  table of a liquid: 10 K at 300 K is s/x0 = 0.03) term by term, each
    //  int_0^s t^j / (x0 + t) dt = (s^(j+1)/x0) sum_k (-u)^k / (j+k+1), u = s/x0,
    //  an alternating series with no cancellation between large terms (review
    //  row TB-03: the closed form below loses about 1e-10 relative on a steep
    //  short segment).  Otherwise the closed form: p(s) = q(s) (s + x0) + r by
    //  synthetic division, I2 = int q + r ln((x0+s)/x0).
    const scalar u = s / x0;
    if (std::fabs(u) <= 0.5)
    {
        i2 = 0.0;
        scalar sj = s;                                   // s^(j+1)
        for (int j = 0; j < 4; ++j, sj *= s)
        {
            if (c[std::size_t(j)] == 0.0) continue;
            scalar sum = 0.0, uk = 1.0;
            for (int k = 0; k < 200; ++k, uk *= -u)
            {
                const scalar term = uk / scalar(j + k + 1);
                sum += term;
                if (std::fabs(term) <= 1.0e-18 * std::fabs(sum)) break;
            }
            i2 += c[std::size_t(j)] * sj / x0 * sum;
        }
        return;
    }
    const scalar q2 = c[3];
    const scalar q1 = c[2] - x0 * q2;
    const scalar q0 = c[1] - x0 * q1;
    const scalar r  = c[0] - x0 * q0;
    i2 = s * (q0 + s * (q1 / 2.0 + s * q2 / 3.0)) + r * std::log1p(u);
}

scalar PropertyTable::integral(scalar T) const
{
    if (!integrated_) throw std::logic_error("PropertyTable::integral: " + label_ + " is not integrated");
    const int where = admit(T, "integral");
    const std::size_t n = x_.size();
    scalar i1 = 0.0, i2 = 0.0;
    if (where > 0)
    {
        segmentIntegrals({ y_[n - 1], (y_[n - 1] - y_[n - 2]) / (x_[n - 1] - x_[n - 2]), 0.0, 0.0 },
                         x_[n - 1], T - x_[n - 1], i1, i2);
        return cum1_[n - 1] + i1;
    }
    if (where < 0)
    {
        segmentIntegrals({ y_[0], (y_[1] - y_[0]) / (x_[1] - x_[0]), 0.0, 0.0 }, x_[0], T - x_[0], i1, i2);
        return i1;
    }
    const std::size_t k = segment(T);
    segmentIntegrals(poly_[k], x_[k], T - x_[k], i1, i2);
    return cum1_[k] + i1;
}

scalar PropertyTable::integralOverT(scalar T) const
{
    if (!integrated_) throw std::logic_error("PropertyTable::integralOverT: " + label_ + " is not integrated");
    const int where = admit(T, "integral");
    const std::size_t n = x_.size();
    scalar i1 = 0.0, i2 = 0.0;
    if (where > 0)
    {
        segmentIntegrals({ y_[n - 1], (y_[n - 1] - y_[n - 2]) / (x_[n - 1] - x_[n - 2]), 0.0, 0.0 },
                         x_[n - 1], T - x_[n - 1], i1, i2);
        return cum2_[n - 1] + i2;
    }
    if (where < 0)
    {
        segmentIntegrals({ y_[0], (y_[1] - y_[0]) / (x_[1] - x_[0]), 0.0, 0.0 }, x_[0], T - x_[0], i1, i2);
        return i2;
    }
    const std::size_t k = segment(T);
    segmentIntegrals(poly_[k], x_[k], T - x_[k], i1, i2);
    return cum2_[k] + i2;
}

scalar PropertyTable::probeT() const
{
    const std::size_t k = segment(0.5 * (x_.front() + x_.back()));
    return x_[k] + 0.37 * (x_[k + 1] - x_[k]);
}

std::string PropertyTable::describe() const
{
    std::string s = std::to_string(x_.size()) + " points, " + fmtG(x_.front()) + "-" + fmtG(x_.back())
                  + " K, interpolation " + word(m_) + "; no value outside its points (refused)";
    if (ext_.any())
        s += "; the case extends it " + std::string(ext_.hasLo ? "down to " + fmtG(ext_.lo) + " K" : "")
           + (ext_.hasLo && ext_.hasHi ? " and " : "") + (ext_.hasHi ? "up to " + fmtG(ext_.hi) + " K" : "")
           + " by the end segment's chord (reason: " + ext_.reason + ")";
    return s;
}

} // namespace Choupo
