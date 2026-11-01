# A negative order is a mechanism fact

DEV.md 4c C190 items 10 and 13, 2026-11-01.  Code:
`src/thermo/reaction/Reaction.{H,cpp}` (`powerLawFactor`,
`chemkinMolecularity`), `src/unitOperations/batch/BatchReactor.cpp`,
`src/unitOperations/dynamic/DynamicCSTR.cpp`,
`src/thermo/reaction/RateLaw.cpp`.  Gate:
`bin/curate/check_vessel_kinetic_orders.py`.

## 1. Two wrong rates at exit 0

**Item 10.**  The vessels' own `Arrhenius` path multiplied the rate by
`c_j^order_j` for every reactant and began the loop with
`if (rxn.order[s] <= 0.0) continue;` (BatchReactor.cpp, DynamicCSTR.cpp).  An
order of zero leaves the law, which is right; a NEGATIVE order is an
inhibition and does not.  `r = k cA^2 cB^-1` with cA = 3, cB = 100 returned
`9 k` instead of `0.09 k`.  The factory `RateLaw` (`std::pow(conc, order)` for
order != 0) honoured the sign, so the same reaction library gave two rates
depending on which path read it.  Reproduced first on a one-litre isothermal
probe (A + B -> C + D, k = 1, cE = 3, cA = 100 kmol/m3, 10 ms): 0.0874 kmol
converted, against 0.000900 for the honoured order.

**Item 13.**  The CHEMKIN cm-mol-s -> SI conversion of A needs the molecularity
`m = SUM order_j`, `A_SI = A (1e-3)^(m-1)`.  The code rounded each order to an
integer BEFORE summing: orders 0.5 + 1.5 became 1 + 2 = 3 and A came out 1000x
too low (A = 1e3 cm3/mol/s announced as 0.001 where 1.0 is right).

## 2. The rules

* **Only an order of exactly zero leaves the rate law.**  A negative order is
  honoured.
* **A species with a negative order at concentration <= 0 REFUSES by name**
  (`Reaction::powerLawFactor`): the rate diverges there, and both alternatives
  are wrong in a way the reader cannot see -- a clamp invents a rate, and
  `inf` handed to an integrator fails somewhere else with no cause attached.
  The message names the caller, the species, the order and the remedy (start
  with a non-zero amount, or write a law that saturates).  This is the same
  posture as the rest of the engine: a failed computation is not a result
  (`a-failed-computation-is-not-a-result.md`).
* **ONE rule for every reader of a power law.**  `RateLaw` (the factory path,
  steady `cstr`/`pfr`/column readers and the vessels' LHHW) had no rule at all:
  `pow(0, negative)` was `inf`.  It now calls the same function, so the vessels'
  own path and the factory path can no longer differ.  For every order >= 0 the
  arithmetic is unchanged to the last bit (a factor of exactly 1 for order 0,
  the same `pow` otherwise).
* **The molecularity is the SUM of the orders, decided only when a cm unit asks
  for it** (`Reaction::chemkinMolecularity`).  A CHEMKIN A is reported for an
  integer molecularity; a non-integer sum REFUSES naming the reaction, the
  orders, their sum and the remedy (give A in SI with the `units` block
  omitted).  A fractional-order law written in SI never reaches the check.
  Negative orders count in the sum, because the units of k follow the whole
  sum; the old code summed only the positive ones.

## 3. Not done

The vessels' reverse leg runs on the product stoichiometry and reads no order
(unchanged).  `thirdBody` / `falloff` keep C185's `+1`; they share the helper.
The corpus carries no negative order, so no golden moved.
