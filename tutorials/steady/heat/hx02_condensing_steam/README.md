# hx02_condensing_steam — where a condensing outlet sits

Steam at **8 bar, 450 K** (6.4 K above its saturation temperature) against
cooling water at **3 bar, 300 K**, 3.6 kmol/h (1 mol/s) each, in a
counter-current `heatExchanger` of **1 m²** at **U = 500 W/m²K**.  One
component, water, priced by **IAPWS-IF97** on both sides.

## Read this first: the duty is the sensible model's

The exchanger forms its duty by the ε-NTU method on SENSIBLE heat-capacity
rates: the steam side's rate is the VAPOUR's c_p, with no latent term.  So
Q ≈ 5.1 kW is not what a condenser of this area would transfer — a
condensing film carries far more.  The run says so in its caveat block
(`a side changed phase`).  This case exists to show something else: where
the outlet goes once the duty is fixed.

## The lesson

1. **The outlet is solved from its enthalpy.**  With Q known, the steam's
   outlet is the state whose enthalpy is H_in − Q/n, priced by IF97.  The
   ε-NTU temperature is only the starting guess.
2. **The duty lands inside the latent jump.**  5.1 kW is far less than the
   ~36 kW it would take to condense 1 mol/s, so the outlet sits AT
   Tsat(8 bar) = 443.56 K with a vapour fraction of about 0.87, carried as a
   pin (one component on its saturation curve: T and P do not fix the
   split).
3. **The unit closes on its own balance.**  The KPI `H_closure_gap_kW` and
   the plant's first-law residual are both zero: each outlet carries the
   duty the unit computed.

## Why it is here

Until 2026-11-13 this case did not close.  The outlet search walks a
bracket outward from the ε-NTU guess, here the cold side's 300 K, and its
low end walked below the IF97 window (273.15 K) before its high end reached
Tsat.  The search gave up, the steam left at the sensible model's 300 K as
a liquid, and the unit published about 43 kW of latent heat as its own
closure gap — at exit 0.  An end the package cannot price is now a wall:
it stops, and the other end walks on.  If no bracket exists at all, the
fallback to the ε-NTU temperature is announced in the caveat block.

## What to try

* Raise `U` tenfold, to 5000 W/m²K: the duty hardly moves (5.138 to
  5.139 kW).  The effectiveness is already 0.9998, and the sensible model
  caps the duty at C_vapour·(T_h,in − T_c,in).  That cap is exactly why
  this model is not a condenser.
* Raise the steam to 600 K: the duty doubles (10.47 kW), yet the outlet
  quality RISES, to about 0.885 — the extra duty is spent on the extra
  superheat the steam brought in.  The outlet temperature is still
  Tsat(8 bar).
