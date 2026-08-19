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

#include "PolynomialCp.H"

#include "core/Advisory.H"

#include <variant>
#include <iostream>

#include <cmath>
#include <stdexcept>

namespace Choupo {

namespace
{
//  `std::to_string(375.0)` is "375.000000", and this text is read by students.
//  Six trailing zeros on a temperature make a caveat look like machine noise,
//  which is the opposite of what the summary block is for.
std::string trimNum(scalar v)
{
    std::string s = std::to_string(v);
    if (s.find('.') == std::string::npos) return s;
    while (!s.empty() && s.back() == '0') s.pop_back();
    if (!s.empty() && s.back() == '.') s.pop_back();
    return s;
}
}


PolynomialCp::PolynomialCp(const DictPtr& dict)
{
    a_ = dict->lookupList("coefficients");
    if (a_.empty())
        throw std::runtime_error("PolynomialCp: 'coefficients' is empty");
    if (a_.size() > 5)
        throw std::runtime_error("PolynomialCp: at most 5 coefficients (a0..a4)");
    if (dict->found("Trange"))
    {
        //  THREE STATES, and the middle one had no way to be written (AP3,
        //  2026-08-05).  A fit either declares the domain it was regressed
        //  over, declares that the domain is NOT KNOWN, or declares nothing
        //  at all -- and those are different facts about the curation, not
        //  degrees of the same one.
        //
        //  `Trange unknown;` is the explicit second state.  Before it existed,
        //  a curator with no recoverable window had only two options: omit the
        //  key (indistinguishable from never having thought about it) or write
        //  an impossible interval.  Six catalogue records took the second
        //  route -- `(30 27)`, `(24 24)` -- and the engine ANNOUNCED them and
        //  carried on.
        //
        //  It refuses now.  An inverted interval is not extrapolation, which
        //  I4 explicitly permits; it is a MALFORMED CLAIM about where a
        //  correlation holds, and a malformed claim cannot be extrapolated
        //  from.  The remedy is in the message, and it is one word.
        //  DISCRIMINATE ON THE VARIANT, not by asking for a word.
        //  `lookupWordOrDefault` THROWS when the entry is a list -- it does
        //  not fall back to its default -- so asking it first would have
        //  refused every component in the catalogue that declares a numeric
        //  window.  Caught by running the engine against a real case; the
        //  build was clean and the gate was green, because neither looks at
        //  what happens when a record is actually loaded.
        const bool isWord =
            std::holds_alternative<std::string>(dict->entryValue("Trange"));
        if (isWord && dict->lookupWord("Trange") == "unknown")
        {
            rangeUnknown_ = true;
            //  ANNOUNCED AT CONSTRUCTION, not at evaluation.
            //
            //  "This fit's domain is unknown" is a fact about the RECORD, and
            //  it is knowable the moment the record is read.  The first
            //  version announced it from `noteRange`, inside `Cp(T)` -- so a
            //  case that loads the component but never evaluates its liquid
            //  Cp said nothing at all, and the probe that was meant to
            //  witness it saw silence.  A warning whose delivery depends on
            //  whether a hot path happens to run is a warning that can be
            //  missed exactly when the record matters least visibly.
            //
            //  The OUTSIDE-THE-WINDOW announcement stays at evaluation,
            //  because that one genuinely is a fact about a temperature.
            const std::string who = dict->lookupWordOrDefault("owner", "");
            AdvisoryLog::instance().add(
                "validity", "warning",
                who.empty() ? "polynomial Cp" : "component '" + who + "'",
                "declares `Trange unknown;` -- the fit's validity domain could "
                "not be recovered, so its values carry no validity claim at "
                "any temperature");
            std::cerr << "[cp] polynomial Cp"
                      << (who.empty() ? std::string() : " for '" + who + "'")
                      << " declares `Trange unknown;` -- the record states"
                         " that the fit's validity domain could not be"
                         " recovered.\n     Values are still returned, and"
                         " they carry NO validity claim at any temperature."
                         "  Re-deriving the window from the regression that"
                         " produced the coefficients is a curation act.\n";
        }
        else
        {
            auto r = dict->lookupList("Trange");
            if (r.size() != 2)
                throw std::runtime_error("PolynomialCp: 'Trange' must hold "
                    "(Tmin Tmax), or the word `unknown`");
            if (r[1] <= r[0])
                throw std::runtime_error(
                    "PolynomialCp: 'Trange (" + std::to_string(r[0]) + " "
                    + std::to_string(r[1]) + ")' is not an interval -- the "
                    "upper bound does not exceed the lower, so the fit claims "
                    "a validity domain that cannot exist and EVERY "
                    "temperature lies outside it.\n  REMEDY: re-derive the "
                    "window from the regression that produced the "
                    "coefficients, or, if it cannot be recovered, declare it "
                    "honestly as `Trange unknown;` -- which is announced on "
                    "every run and never mistaken for a validated range.");
            Tmin_ = r[0]; Tmax_ = r[1];
        }
    }
    owner_ = dict->lookupWordOrDefault("owner", "");
}

//  THE DECLARED WINDOW IS NOW USED (AP3).  Two distinct things can be wrong,
//  and they need different sentences:
//
//    * the window is NOT A WINDOW (hi <= lo).  Six records in the catalogue
//      declare one -- CoolProp liquid-Cp fits with a four-term polynomial over
//      a 1 K or 0 K span, which cannot have been fitted as stated.  Saying
//      "outside the range" about such a record would be nonsense: EVERY T is
//      outside an empty interval.  So it gets its own message, and it names
//      the defect rather than the symptom.
//
//    * T is genuinely outside a VALID window.  I4 is explicit that this is
//      ANNOUNCED, never refused -- "the professor extrapolates on purpose,
//      but knows he did".
//
//  Once per model instance, then a bool test: Cp(T) runs inside the Newton
//  loop and provenance must not live there.
void PolynomialCp::noteRange(scalar T) const
{
    //  `Trange unknown;` is announced at CONSTRUCTION (see above), so
    //  nothing is due here: the fact does not depend on T.
    if (rangeUnknown_) return;

    if (Tmin_ == 0.0 && Tmax_ == 0.0) return;          // no window declared

    if ((T < Tmin_ || T > Tmax_) && !announcedOutside_)
    {
        announcedOutside_ = true;
        AdvisoryLog::instance().add(
            "validity", "warning",
            owner_.empty() ? "polynomial Cp" : "component '" + owner_ + "'",
            "evaluated at T = " + trimNum(T) + " K, OUTSIDE its declared "
            "Trange (" + trimNum(Tmin_) + " " + trimNum(Tmax_)
            + ") -- extrapolated, still returned");
        std::cerr << "[cp] polynomial Cp"
                  << (owner_.empty() ? std::string() : " for '" + owner_ + "'")
                  << " evaluated at T = " << T << " K, OUTSIDE its declared"
                     " Trange (" << Tmin_ << " " << Tmax_ << ").\n     The"
                     " value is extrapolated: it is still returned (I4 --"
                     " extrapolation is a legitimate choice), but it is no"
                     " longer covered by the fit.\n";
    }
}

//  THE SPAN.  Same rule as noteRange -- announced, never refused (I4) -- but a
//  different fact, and the difference is what makes either of them readable.
//
//  MEASURED, not remembered (2026-08-19, and this is the number that decided
//  the shape).  When H/S first started noting their endpoints through
//  `noteRange`, a sweep of every steady tutorial that runs choupoSolve --
//
//      for d in tutorials/steady/*/*/; do ./choupoSolve "$d" | grep -q '^\[cp\]'
//
//  -- returned 100 LOUD of 210 cases.  Every one of those hundred is TRUE: the
//  corpus's liquid-Cp fits are mostly regressed over ~280-350 K while process
//  temperatures routinely run past them, and until this slice the integral was
//  the route that never looked.  But the point message it borrowed said
//  "evaluated at T = 370 K", which is not what happened: nothing evaluated
//  anything at 370 K, an integral ran from the 298.15 K datum to 370 K and
//  spent 20 K of that path outside the fit.  Naming an endpoint understates a
//  long excursion and overstates a short one, and a hundred cases carrying the
//  wrong sentence is worse than a hundred carrying none.
//
//  So the span says the span, and the reader can size the error from the
//  message.  It does NOT judge: how much a 20 K excursion costs depends on the
//  polynomial, and no gate here knows that.
//
//  THE CORPUS INCIDENCE IS A CURATION FINDING, not a defect in this file, and
//  it is deliberately not fixed by widening any window -- inventing a validity
//  domain converts "unsourced" into "falsely sourced", which no reader and no
//  gate can detect.
void PolynomialCp::noteSpan(scalar Tref, scalar T) const
{
    if (rangeUnknown_) return;                         // said at construction
    if (Tmin_ == 0.0 && Tmax_ == 0.0) return;          // no window declared
    if (announcedSpan_) return;

    const scalar lo = (Tref < T) ? Tref : T;
    const scalar hi = (Tref < T) ? T : Tref;
    if (lo >= Tmin_ && hi <= Tmax_) return;            // the whole path is in

    //  How much of the path fell outside, so the sentence carries a size and
    //  not only a verdict.  A window lying strictly inside [lo, hi] leaves
    //  BOTH ends out, and this arithmetic covers that without a special case.
    const scalar inLo = (lo > Tmin_) ? lo : Tmin_;
    const scalar inHi = (hi < Tmax_) ? hi : Tmax_;
    const scalar inside  = (inHi > inLo) ? (inHi - inLo) : 0.0;
    const scalar outside = (hi - lo) - inside;

    announcedSpan_ = true;
    const std::string who =
        owner_.empty() ? "polynomial Cp" : "component '" + owner_ + "'";
    const std::string span =
        "integrated from " + trimNum(Tref) + " K to " + trimNum(T)
      + " K, a path that LEAVES its declared Trange (" + trimNum(Tmin_) + " "
      + trimNum(Tmax_) + ") over " + trimNum(outside) + " K of its "
      + trimNum(hi - lo) + " K";

    AdvisoryLog::instance().add(
        "validity", "warning", who,
        span + " -- extrapolated, still returned");
    std::cerr << "[cp] polynomial Cp"
              << (owner_.empty() ? std::string() : " for '" + owner_ + "'")
              << " " << span << ".\n     The enthalpy/entropy difference is"
                 " extrapolated over that part of the path: it is still"
                 " returned (I4 -- extrapolation is a legitimate choice), but"
                 " it is no longer covered by the fit.\n";
}

scalar PolynomialCp::Cp(scalar T) const
{
    noteRange(T);
    scalar s = 0.0;
    scalar pwr = 1.0;
    for (scalar a : a_) { s += a * pwr; pwr *= T; }
    return s;
}

scalar PolynomialCp::H(scalar T, scalar Tref) const
{
    //  THE INTEGRAL CROSSES THE WINDOW TOO, and until 2026-08-19 it crossed it
    //  in SILENCE.  Only `Cp(T)` called `noteRange`, so evaluating the heat
    //  capacity 0.5 K past a declared `Trange` announced, while INTEGRATING the
    //  same polynomial across the same boundary said nothing -- and the
    //  integral is the commoner call, because every enthalpy takes this road.
    //
    //  That is the shape this project has now paid for three times (the
    //  `check_true_ions` and `check_ebullioscopic` cases, and this):
    //  A GUARD ARMED ON ONE OF TWO ROUTES GUARDS NEITHER, because the
    //  unguarded route is the one the answer actually travels.
    //
    //  Found by the enthalpy-concentration scan, which integrates ethanol's
    //  liquid Cp 0.45 K past its declared window on the way to the azeotrope
    //  and reported nothing.  The numerical cost there is under 50 J/mol; the
    //  mechanism is general and the silence was the defect.
    //
    //  THE WHOLE PATH is what left the window, so `noteSpan` is what says so
    //  -- see its definition above for why the endpoint message this first
    //  used was the wrong sentence for a hundred cases at once.
    noteSpan(Tref, T);

    // ∫ Cp dT = Σ a_k T^{k+1} / (k+1)
    auto integral = [&](scalar tau) {
        scalar s = 0.0;
        scalar pwr = tau;
        for (std::size_t k = 0; k < a_.size(); ++k)
        {
            s += a_[k] * pwr / static_cast<scalar>(k + 1);
            pwr *= tau;
        }
        return s;
    };
    return integral(T) - integral(Tref);
}

scalar PolynomialCp::S(scalar T, scalar Tref) const
{
    //  Same crossing, same silence, same remedy -- see H() above.
    noteSpan(Tref, T);

    //  ∫ Cp/T dT
    //  = a_0 · ln(T/Tref) + Σ_{k≥1} a_k · (T^k − Tref^k) / k
    if (a_.empty()) return 0.0;
    scalar s = a_[0] * std::log(T / Tref);
    scalar pwrT    = T;
    scalar pwrTref = Tref;
    for (std::size_t k = 1; k < a_.size(); ++k)
    {
        s += a_[k] * (pwrT - pwrTref) / static_cast<scalar>(k);
        pwrT    *= T;
        pwrTref *= Tref;
    }
    return s;
}

} // namespace Choupo
