/*---------------------------------------------------------------------------*\
  BoilingPointRise -- the EXACT boiling-point elevation of a solution with a
  non-volatile solute (C377 (b), 2026-11-12).  ONE home: the evaporator's
  BPE_of and the props bench's electrolyteActivity op both call it.

  The solution at T_b boils at the pressure its solvent exerts,
  a_w Psat(T_b); pure solvent boils at that same pressure at T_b - BPE.  So

        a_w Psat(T_b) = Psat(T_b - BPE)                                  (1)

  solved here for BPE by Newton on g(B) = ln Psat(T_b - B) - ln a_w
  - ln Psat(T_b), with dg/dB = -d ln Psat/dT at T_b - B (central difference
  on the caller's Psat).  The linearised Clausius-Clapeyron form
  BPE ~ -(R T_b^2 / dHvap) ln a_w is the first term of (1) and is used only
  as the starting guess.  No vapour of the solute, ideal vapour.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

template <class PsatFn>
scalar exactBoilingPointRise(const PsatFn& Psat, scalar a_w, scalar T_b,
                             scalar guess)
{
    if (!(a_w > 0.0))
        throw std::runtime_error("exactBoilingPointRise: water activity "
            + std::to_string(a_w) + " is not positive");
    if (a_w >= 1.0) return 0.0;                 // no lowering, no rise
    const scalar lnTarget = std::log(a_w) + std::log(Psat(T_b));
    scalar B = (guess > 0.0 && guess < 0.5 * T_b) ? guess : 1.0;
    for (int it = 0; it < 50; ++it)
    {
        const scalar T = T_b - B, h = 0.01;
        const scalar g = std::log(Psat(T)) - lnTarget;
        const scalar dlnP = (std::log(Psat(T + h)) - std::log(Psat(T - h))) / (2.0 * h);
        const scalar step = g / dlnP;           // dg/dB = -dlnP  =>  B_new = B + g/dlnP
        B += step;
        if (B < 0.0) B = 0.0;
        if (std::abs(step) < 1.0e-10) return B;
    }
    throw std::runtime_error("exactBoilingPointRise: Newton did not converge"
        " (a_w = " + std::to_string(a_w) + ", T_b = " + std::to_string(T_b) + " K)");
}

} // namespace Choupo
