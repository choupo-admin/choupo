# temperature01_gas_thermometer — what the last digits of a temperature assert

> *"Thermodynamics is a funny subject.  The first time you go through it, you
> don't understand it at all.  The second time you go through it, you think you
> understand it, except for one or two small points.  The third time you go
> through it, you know you don't understand it, but by that time you are so
> used to it, it doesn't bother you any more."*
>
> — attributed to **Arnold Sommerfeld**.  **PROVENANCE UNVERIFIED**: Sommerfeld
> published no such sentence; it reaches us by report, and this repository does
> not quote a source it has not read.  It is here as an epigraph, marked, and
> must be either sourced or dropped before it appears in any published guide.

```
runCase tutorials/props/thermo/temperature01_gas_thermometer
```

---

## The question

Write down a temperature: **500.012 K**.

What does the `012` assert?  Not "roughly five hundred kelvin" — three digits
past the decimal point is a specific claim about the world.  Whose claim, and
resting on what?

## Part 1 — the definition, since 2019

The kelvin is no longer defined by a substance.  It is defined by fixing the
Boltzmann constant:

```
    k  =  1.380649 x 10^-23  J/K        exactly, by decree
```

Not measured.  **Fixed.**  So a temperature is a conversion factor between
energy and degrees, and nothing else.  The triple point of water — which
*defined* the kelvin for sixty-five years — became, overnight, a quantity that
is **measured**, with an uncertainty.

That is the first dogma, and it is worth sitting with: the definition tells you
what a kelvin *means* and gives you no way whatsoever to *measure* one.

## Part 2 — the realisation, which is a different thing entirely

Nobody puts the Boltzmann constant inside a thermometer.  To read a temperature
you need a *realisation*: a chain of reproducible fixed points and an
instrument that interpolates between them.  In practice that is **ITS-90**,
with a platinum resistance thermometer doing the interpolating.  At 500 K you
are between the triple point of water and the freezing point of zinc.

And the practical scale and the thermodynamic temperature **are not the same
number**.  They differ by a few millikelvin in this region — a difference that
is known, tabulated, and revised as measurements improve.

**So the `012` is a statement about a platinum resistor and a chain of fixed
points.  It is not a statement about nature.**

## Part 3 — what this case actually runs

Historically, thermodynamic temperature was got at with a **constant-volume gas
thermometer**: hold the volume, measure the pressure, read the temperature off

```
    P V  =  n R T
```

Except that no real gas obeys that.  The compressibility factor

```
    Z  =  P v / (R T)
```

is 1 for the ideal gas *by definition* and something else for nitrogen.  This
case scans it, at the very temperature in question:

| P | Z (nitrogen, SRK, 500.012 K) |
|---|---|
| 1 kPa | 1.000005 |
| 5 MPa | **1.0244** |

At laboratory pressure the gas thermometer is **2.4 % wrong**, and no amount of
care with the manometer fixes it — the error is in the equation, not the
apparatus.  Take the reading at a thousandth of that pressure and the error
falls below a part in a hundred thousand.

**Hence the third dogma, and the one worth carrying away:**

> The ideal gas is not a substance.  It is a **limit**.  A gas thermometer
> reads thermodynamic temperature only as `P → 0` — that is, only where you
> cannot actually take a measurement.  Every real reading is an extrapolation
> towards a place no experiment reaches.

## What this case is NOT

* **SRK is not the truth about nitrogen.**  It is a cubic equation of state,
  and what it establishes here is that `Z` departs from 1 and roughly by how
  much — not the third decimal of that departure.  A better equation moves the
  number and leaves the argument untouched.
* **No number here is compared with a measurement.**  The corpus holds no
  primary `Z` data for nitrogen, so this is a STRUCTURAL witness: it shows what
  the model says, and says that is what it shows.
* **The ITS-90 differences are quoted as an order of magnitude, not a value.**
  The tabulated `T − T90` at 500 K is a published number this repository has
  not read back against its source, and the never-invent-a-citation rule means
  it is described and not stated.  Sourcing it is open work.
* **500.012 K is arbitrary.**  It is a number chosen to make the question
  concrete, not a special state of anything.
