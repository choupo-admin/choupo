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
Class
    Choupo::VaporPressureModel

Description
    Abstract base for pure-component vapour-pressure models  P_i^sat(T).
    Concrete models (Antoine, ExtendedAntoine, DIPPR101,...) register
    themselves through `VaporPressureModel::registerModel(name, factory)`.

    Selected at run-time via the dictionary entry

        vaporPressure
        {
            model           Antoine;          // factory key
            coefficients    (A B C);
            Trange          (Tmin Tmax);
        }

    CONTINUITY OF Psat(T) (2026-11-09, DEV.md 4c C245 slice 5a)

    WHAT.  `Psat_Pa` is a function of T over the WHOLE axis a solver can
    visit, not only over the temperatures where a correlation was fitted.
    On [T_lo, T_hi] it is the model's own `computePsat`, bit for bit.  Outside
    it, ln Psat is continued LINEARLY IN 1/T,

        ln Psat(T) = ln Psat(T_e) + s_e (1/T - 1/T_e),
        s_e = d ln Psat / d(1/T) at T_e = -T_e^2 (d ln Psat/dT)|T_e,

    with e = lo below T_lo and e = hi above T_hi: the Clausius-Clapeyron form
    (a straight line on the Cox chart) carrying the value AND the slope the
    model has at the edge.  Psat and d ln Psat/dT are continuous at both
    edges, Psat stays finite, positive and strictly increasing, and Psat -> 0
    as T -> 0 and Psat -> a finite limit as T -> infinity.

    WHY.  Every gamma-phi K-value is Psat times something.  Before this, the
    Antoine equation had a pole at T = -C (Psat -> infinity and the slope
    changed sign below it), Ambrose-Walton and Wagner returned Pc / Pr from
    Tc up (continuous in value, not in slope, and a different number from
    what Antoine returns above Tc), and a Newton or a temperature search that
    crossed one of them saw a wrong derivative or a discontinuous residual
    and stalled (the Tc step of the liquid reference factor, C239, was found
    that way).  The rule is in the BASE class, once, so no model and no
    caller has to remember it.

    WINDOW.  T_lo = max(record Tmin, the model's safe lower bound, 1 K): the
    record's Tmin when it declares one (`Trange`, {0,0} = none), and for
    Antoine at least `-C + B/60` (the temperature at which Psat is 1e-60 of
    its coefficient scale: finite margin above the pole).  T_hi = the
    model's safe upper bound (Ambrose-Walton: Tc; Wagner: its reducing T)
    intersected with the component's declared Tc; with neither, no upper
    continuation.  The record's Tmax is NOT T_hi: between Tmax and Tc the
    correlation is still a smooth curve and is evaluated as before, with the
    `noteRange` announcement (I4).

    WHAT IT DOES NOT CLAIM.  The continuation is a numerical surface for a
    solver in transit, not a physical vapour pressure: a component above Tc
    has no saturation state, and below Tmin a fit is not a measurement.  Each
    continuation is announced ONCE per component, model and side
    (`[psatContinued]`, AdvisoryLog category "validity") -- no silent crutch.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <string>
#include <utility>

namespace Choupo {

class VaporPressureModel
{
public:
    virtual ~VaporPressureModel() = default;

    // Saturation pressure in Pa at temperature T [K] (canonical SI
    //; was bar in earlier editions).
    //
    //  NON-VIRTUAL ON PURPOSE (2026-08-06).  Every model must declare a
    //  validity `range()`, every one of the 108 `vaporPressure {}` blocks in
    //  the catalogue declares a `Trange` -- and until this day NOTHING IN THE
    //  TREE EVER CALLED `range()`.  Not one temperature was ever compared
    //  against one of those windows, on the correlation behind every K-value,
    //  every flash and every column stage.
    //
    //  Putting the comparison inside each model would be the SAME defect one
    //  layer down: `Antoine` parsed `Tmin_`/`Tmax_` into members and never
    //  read them, exactly as `PolynomialCp` had until AP3.  A rule each
    //  implementer must remember is a rule that will be forgotten.  So the
    //  base owns it -- one place derives the check from the `range()` every
    //  model already supplies, and a NEW model gets it without writing a line.
    //  (OpenFOAM's shape: `gStd(T)` is an interface function, and `K` follows
    //  from it once for every combination of models.)
    scalar Psat_Pa(scalar T_K) const
    {
        //  A record law has no hard window yet (C398: `domain` is refused by
        //  the record grammar until its own slice); its soft window is noted
        //  below.  The law's first evaluation describes it (review CV-07).
        //  Callers never see computePsat without this note having run.
        if (onFirstUse_) { const auto f = std::move(onFirstUse_); onFirstUse_ = nullptr; f(*this); }
        noteRange(T_K);
        if (!cont_.ready) buildContinuation();
        if (T_K >= cont_.lo && T_K <= cont_.hi)
            return computePsat(T_K);                 // the model's own formula
        return continuedPsat(T_K);                   // ln P linear in 1/T
    }

    //  [T_lo, T_hi]: where `Psat_Pa` is the model's own formula (see the
    //  class description).  hi = +infinity when no upper bound exists.
    std::pair<scalar, scalar> continuationWindow() const
    {
        if (!cont_.ready) buildContinuation();
        return {cont_.lo, cont_.hi};
    }

    // Temperature range (Tmin, Tmax) of validity.  `{0, 0}` means the model
    // declares no window -- absence is not a claim, and nothing is announced.
    virtual std::pair<scalar, scalar> range() const = 0;

    virtual const std::string& modelName() const = 0;

    //  The component this model belongs to, stamped by the factory from the
    //  dict `Component::readFromDict` hands it.  A validity warning that
    //  cannot name its subject is one the reader cannot act on -- the Cp path
    //  paid for that once, printing warnings with no owner for twenty
    //  components.
    void setOwner(const std::string& owner) { owner_ = owner; }

    //  The component's critical temperature, stamped by the factory from the
    //  same injected key the corresponding-states models read.  `noteRange`
    //  needs it to tell two PHYSICALLY DIFFERENT situations apart -- see
    //  `noteRange` for why that distinction is not optional.  0 means the
    //  record declares none, and the branch degrades to the plain one.
    void setCriticalT(scalar Tc) { Tc_declared_ = Tc; }

    //  Bind the law's hard window; `onOutside(T)` throws (Component builds
    //  it from the record's laws, so the remedy can name them).
    void setHardDomain(scalar lo, scalar hi, std::function<void(scalar)> onOutside)
    { hasDomain_ = true; domainLo_ = lo; domainHi_ = hi; onOutsideDomain_ = std::move(onOutside); }

    //  Run once, at the law's first evaluation inside its window: the law
    //  describes itself and its datum's provenance is voiced (C398 review
    //  rows CV-07, CN-06).  One pointer test per call after the first.
    void setOnFirstUse(std::function<void(const VaporPressureModel&)> f) { onFirstUse_ = std::move(f); }

    // ---- Factory -----------------------------------------------------------
    using Factory = std::function<std::unique_ptr<VaporPressureModel>(const DictPtr&)>;
    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<VaporPressureModel> New(const DictPtr& dict);

    // Registers the built-in models (Antoine,...).  Call once at startup.
    static void registerBuiltins();
    //  Is `name` a registered type of this family?  (C398 slice (b): a
    //  record law's name doubles as its type when it names one.)
    static bool hasModel(const std::string& name);

protected:
    //  The bare correlation.  A model implements THIS; callers never see it,
    //  so no model can be reached without its validity note having run.
    virtual scalar computePsat(scalar T_K) const = 0;

    //  The model's own safe domain for `computePsat` (the continuation
    //  window is the record's Trange intersected with it).  A model whose
    //  formula is smooth on all of (0, inf) keeps the defaults.
    //  d ln Psat / dT of `computePsat` at T [1/K], ANALYTIC, for a model whose
    //  curve has a square-root-type singularity in a higher derivative at the
    //  edge (Ambrose-Walton and Wagner carry tau^1.5 terms at Tc, so a
    //  finite-difference slope there is only good to ~1e-4).  NaN (the
    //  default) = none: the base class differences `computePsat` instead.
    virtual scalar computeDlnPsatDT(scalar /*T_K*/) const
    { return std::numeric_limits<scalar>::quiet_NaN(); }

    virtual scalar safeLowerT() const { return 0.0; }
    virtual scalar safeUpperT() const
    { return std::numeric_limits<scalar>::infinity(); }

    //  Announces ONCE per model instance when T falls outside the declared
    //  window, then returns the value anyway.  I4: extrapolation is a
    //  legitimate choice -- the professor extrapolates on purpose, but knows
    //  he did -- so this is never a refusal.
    //
    //  Kept to one bool test per call after the first: `Psat_Pa` runs inside
    //  the Newton loop, and `property-architecture.md` puts provenance at the
    //  data and validation boundaries, never on the hot path.
    void noteRange(scalar T_K) const;

    std::string  owner_;
    scalar       Tc_declared_ = 0.0;
    bool         hasDomain_ = false;
    scalar       domainLo_ = 0.0, domainHi_ = 0.0;
    std::function<void(scalar)> onOutsideDomain_;
    mutable std::function<void(const VaporPressureModel&)> onFirstUse_;
    mutable bool announcedOutside_ = false;   // an excursion at an ANSWER was announced
    mutable bool announcedTrial_   = false;   // ... or at a trial state of a search (PO-02)

    //  The continuation, built lazily on the first call (the owner and Tc are
    //  stamped AFTER construction, so the constructor cannot build it).
    struct Continuation
    {
        bool   ready = false;
        scalar lo = 0.0, hi = 0.0;       // [T_lo, T_hi]
        scalar lnLo = 0.0, sLo = 0.0;    // ln Psat and d ln Psat/d(1/T) at lo
        scalar lnHi = 0.0, sHi = 0.0;    // ... at hi
        bool   hasLo = false, hasHi = false;
        bool   announcedLo = false, announcedHi = false;
    };
    mutable Continuation cont_;
    void   buildContinuation() const;
    scalar continuedPsat(scalar T_K) const;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
