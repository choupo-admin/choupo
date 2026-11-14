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
-------------------------------------------------------------------------------
Class
    Choupo::PropertyTable

Description
    A PROPERTY GIVEN AS MEASURED POINTS (DEV.md 4c C398, THE RULING point 5,
    slice (c); second addendum V3-V4; addendum A2).  The arithmetic of the law
    type `table`: one property y against the temperature T, for one pure
    component, with a DECLARED interpolation and HARD ends.

    INTERPOLATION (always declared; segment k holds x_k <= T <= x_k+1,
    w = (T - x_k) / (x_k+1 - x_k)):
      linear          y = y_k + w (y_k+1 - y_k)
      logLinear       ln y = ln y_k + w (ln y_k+1 - ln y_k)
      logReciprocal   ln y = ln y_k + w' (ln y_k+1 - ln y_k),
                      w' = (1/T - 1/x_k) / (1/x_k+1 - 1/x_k)   (the Arrhenius form)
      monotoneCubic   the cubic Hermite interpolant of y in T with the
                      Fritsch-Carlson slopes: secant mean at the inner nodes
                      (zero where the secants change sign or one is zero),
                      one-sided secant at the two ends, and each segment's
                      pair (a, b) = (m_k, m_k+1) / d_k scaled by
                      3 / sqrt(a^2 + b^2) where a^2 + b^2 > 9 (Fritsch &
                      Carlson 1980, SIAM J. Numer. Anal. 17, 238-246): C1 and
                      monotone between the nodes, no overshoot.
    On a node the node's own value is returned exactly.  Minimum points: 2, 2,
    2 and 3; abscissae strictly increasing; values strictly positive for the
    two log forms.

    THE ENDS ARE HARD (the architect's end rule (c), C398 slice (c)).  A table
    has no value outside its points, so EVERY evaluation outside
    [x_0, x_n-1] -- a reported state or a solver's trial state alike -- throws
    the kernel's typed PropertyDomainError naming the table, the T the
    computation asked for (to six decimals, so it never reads as a bound) and
    the remedies.  No state is classified as trial or reported (the post-solve
    audit that did so missed states and misfired: review rows CV-28..32).
    The ONE way past an end is a case's bounded extension (`extend { upTo;
    downTo; reason; }`, written in a case pin, never in a record): inside it
    the value is the CHORD OF THE END SEGMENT in the interpolation's own
    variables (for monotoneCubic, the linear chord, never the cubic); the
    first excursion is announced, the largest is restated in the end-of-run
    advisory, and beyond the extension the same refusal holds.  `clamp` is
    refused (5.5c R2).

    INTEGRALS (a heat-capacity table, A2).  For `linear` and `monotoneCubic`
    each segment is a polynomial in s = T - x_k of degree <= 3, so
        I1(T) = integral of y dT        and   I2(T) = integral of y / T dT
    from x_0 are computed IN CLOSED FORM: I1 term by term; I2 by dividing the
    polynomial by (s + x_k) -- p(s) = q(s) (s + x_k) + r, so the integral is
    that of q plus r ln((x_k + s) / x_k).  The cumulative values at the nodes
    are built once, at construction; H(T, Tref) = I1(T) - I1(Tref) and
    S(T, Tref) = I2(T) - I2(Tref) are exact for the declared interpolant.
    The log forms have no closed-form I2 and are refused for an integrated
    property.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <array>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class PropertyTable
{
public:

    enum class Interpolation { linear, logLinear, logReciprocal, monotoneCubic };

    //- The declared word; throws, listing the four, on any other.
    static Interpolation interpolationOf(const std::string& word, const std::string& where);
    static const char*   word(Interpolation m);
    static std::size_t   minimumPoints(Interpolation m);

    //- A case's bounded extension past one or both ends.
    struct Extension
    {
        bool        hasLo = false, hasHi = false;
        scalar      lo = 0.0, hi = 0.0;     // K
        std::string reason;
        bool any() const { return hasLo || hasHi; }
    };

    //- `x` in K strictly increasing, `y` in SI.  `label` names the table in
    //  every message ("water's liquidViscosity law `crcWaterMu`, from
    //  constant/experiments/crcWaterMu.dat"); `quantity` names what it gives
    //  ("liquid viscosity").  `integrated` builds I1 and I2 (refused for the
    //  log forms).  Throws on every rule of the class description.
    PropertyTable(std::vector<scalar> x, std::vector<scalar> y, Interpolation m,
                  std::string label, std::string quantity, bool integrated);

    //- Install a case's extension; refused when it does not reach past the
    //  end it names, when its reason is empty, or when the chord would be
    //  non-positive at its far end.
    void setExtension(const Extension& e);

    //- y(T); throws PropertyDomainError outside the points and the extension.
    scalar value(scalar T) const;

    //- The closed-form integrals from x_0 (integrated tables only); each
    //  throws outside the points and the extension, like value().
    scalar integral(scalar T) const;          // I1, [y] K
    scalar integralOverT(scalar T) const;     // I2, [y]

    scalar      lo()     const { return x_.front(); }
    scalar      hi()     const { return x_.back(); }
    std::size_t points() const { return x_.size(); }
    Interpolation interpolation() const { return m_; }
    const std::string& label() const { return label_; }
    const Extension& extension() const { return ext_; }

    //- "11 points, 273.15-373.15 K, interpolation logReciprocal" (+ the
    //  extension when one is declared).
    std::string describe() const;

    //- A LAW OF TYPE `table` read into a table: its `columns` (T, then the
    //  property's symbol), its flat `data`, its `interpolation` and, in a
    //  case's law only, `extend`.  `property` is liquidViscosity,
    //  liquidHeatCapacity or solidHeatCapacity (an idealGasHeatCapacity table
    //  is refused: addendum A2(v)).  `MW` (kg/kmol) converts a heat capacity
    //  declared per mass; 0 means "not known yet" (validation only, the
    //  conversion is not applied).  `columnsText` receives the columns as
    //  declared ("T [degC, +273.15 K at read], Cp [J/g/K, x MW/1000 -> J/(mol K)]").
    static std::unique_ptr<PropertyTable> fromLaw(const DictPtr& body, const std::string& property,
                                                  const std::string& label, scalar MW,
                                                  std::string* columnsText = nullptr);

    //- The symbol a table of `property` names its value column by.
    static std::string symbolOf(const std::string& property);

private:

    std::vector<scalar> x_, y_;
    Interpolation       m_;
    std::string         label_, quantity_;
    bool                integrated_ = false;
    Extension           ext_;

    std::vector<scalar> slope_;                     // monotoneCubic: node slopes
    std::vector<std::array<scalar, 4>> poly_;       // segment k: y = c0 + c1 s + c2 s^2 + c3 s^3
    std::vector<scalar> cum1_, cum2_;               // I1, I2 at the nodes

    mutable scalar maxBelow_ = 0.0, maxAbove_ = 0.0;   // largest excursion, K

    //- The segment holding T (T inside the points); the extension uses the
    //  end segment.
    std::size_t segment(scalar T) const;
    //- The chord of segment k in the interpolation's own variables at T
    //  (w may lie outside [0, 1]: the extension).
    scalar chord(std::size_t k, scalar T) const;
    //- Refuse or announce T: returns 0 inside the points, -1 below in the
    //  extension, +1 above in the extension; throws beyond.
    int  admit(scalar T, const char* what) const;
    //- Integral of segment k's polynomial (or of the end chord) from its
    //  left node (or the end node) to T.
    void segmentIntegrals(const std::array<scalar, 4>& c, scalar x0, scalar s,
                          scalar& i1, scalar& i2) const;
};

} // namespace Choupo
