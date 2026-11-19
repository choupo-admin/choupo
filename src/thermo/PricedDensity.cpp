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

#include "PricedDensity.H"
#include "thermo/LiquidPropertyDoor.H"
#include "thermo/PropertyDomainError.H"

#include <cmath>
#include <exception>

namespace Choupo {
namespace pricedDensity {

//  The mole fraction below which a component the door refuses is a TRACE (see select).
static const scalar kTrace = 1.0e-6;

Selection select(const ThermoPackage& thermo, scalar T, scalar P,
                 const sVector& z, DensityPhase ph)
{
    const std::size_t n = thermo.n();
    Selection s;
    s.zPriced.assign(n, 0.0);
    //  A LIQUID IS FIRST ASKED OF THE ONE DENSITY DOOR OVER THE WHOLE SET (DEV.md 4c
    //  C445 (2)): a component with no pure-liquid volume of its own (a salt) is still
    //  PRICED when the door's method covers the set that holds it (a solution law, a
    //  measurement, massWithoutVolume), and only a set the door cannot price is
    //  thinned below.  Without this, a tank priced the seawater minus its salt while
    //  the pump priced the seawater.
    if (ph == DensityPhase::Liquid)
    {
        scalar zs = 0.0;
        for (std::size_t i = 0; i < n && i < z.size(); ++i) if (z[i] > 0.0) zs += z[i];
        if (zs > 0.0)
        {
            try
            {
                liquidProperty::Request q;
                q.thermo = &thermo; q.T = T; q.P = P; q.x = z; q.record = false;
                const scalar rho = liquidProperty::density(q).value;
                if (rho > 0.0 && std::isfinite(rho))
                {
                    for (std::size_t i = 0; i < n && i < z.size(); ++i)
                        if (z[i] > 0.0) s.zPriced[i] = z[i] / zs;
                    s.keptFraction = zs;
                    return s;
                }
            }
            catch (const std::exception&) { /* the set is not priced whole: thin it, below */ }
        }
    }
    for (std::size_t i = 0; i < n && i < z.size(); ++i)
    {
        if (!(z[i] > 0.0)) continue;
        sVector pure(n, 0.0); pure[i] = 1.0;
        scalar rhoPure = 0.0;
        try { rhoPure = thermo.density(T, P, pure, ph); }
        //  THE SELECTION OF THE PRICED SET (C398 review rows TG-01, TG-18).
        //  The designed case only -- a component at or above its critical
        //  temperature, a gas dissolved in the liquid -- is DROPPED, and the
        //  dropped fraction is published and announced by the caller, never a
        //  number in its place.  Every OTHER hard refusal of a pure liquid (a
        //  reference equation below its record's Tmin, a measurement or a
        //  solution law outside its box) is a real liquid the run cannot price:
        //  it propagates.
        catch (const PropertyDomainError& e)
        {
            if (e.kind == PropertyDomainError::Kind::outsideHardDomain && !e.aboveCriticalTemperature)
                throw;
            rhoPure = 0.0;
        }
        catch (const std::exception&) { rhoPure = 0.0; }
        if (rhoPure > 0.0 && std::isfinite(rhoPure))
        { s.zPriced[i] = z[i]; s.keptFraction += z[i]; }
        else
        {
            s.droppedFraction += z[i];
            if (!s.dropped.empty()) s.dropped += ", ";
            s.dropped += thermo.comp(i).name();
        }
    }
    if (s.keptFraction > 0.0)
        for (auto& v : s.zPriced) v /= s.keptFraction;

    //  A TRACE THE DOOR REFUSES (DEV.md 4c C445).  The door resolves a set by WHO IS
    //  PRESENT, so a component that exists only as the solver's probe of a zero flow
    //  (ammonia03: water at 1e-9 in a 250 K liquid, below its reference equation's Tmin)
    //  would refuse the whole stream.  When the thinned set still refuses, the components
    //  below kTrace of it are left out of the PRICE (never of the mass), by name, and the
    //  door is asked again; a set that still refuses is the caller's refusal.
    if (ph == DensityPhase::Liquid && s.keptFraction > 0.0)
    {
        try
        {
            liquidProperty::Request q;
            q.thermo = &thermo; q.T = T; q.P = P; q.x = s.zPriced; q.record = false;
            (void)liquidProperty::density(q);
        }
        catch (const std::exception&)
        {
            sVector rest = s.zPriced;
            std::string trace; scalar traceFrac = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (rest[i] > 0.0 && rest[i] < kTrace)
                {
                    traceFrac += z[i]; rest[i] = 0.0;
                    trace += (trace.empty() ? "" : ", ") + thermo.comp(i).name();
                }
            if (!trace.empty())
            {
                scalar rs = 0.0;
                for (const scalar v : rest) rs += v;
                if (rs > 0.0)
                {
                    for (auto& v : rest) v /= rs;
                    try
                    {
                        liquidProperty::Request q;
                        q.thermo = &thermo; q.T = T; q.P = P; q.x = rest; q.record = false;
                        (void)liquidProperty::density(q);
                        s.zPriced = rest;
                        s.keptFraction -= traceFrac;
                        s.droppedFraction += traceFrac;
                        s.dropped += (s.dropped.empty() ? "" : ", ") + trace;
                    }
                    catch (const std::exception&) { /* not a trace problem: the caller refuses */ }
                }
            }
        }
    }
    return s;
}

} // namespace pricedDensity
} // namespace Choupo
