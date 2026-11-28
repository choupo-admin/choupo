# valve_refusal_pressure_raise — a valve asked to raise the pressure

A refusal witness.  A valve is given a 10 bar feed and asked for 30 bar out.
An isenthalpic raise has w = 0 and a negative entropy change, which violates
the second law; the unit used to warn and report it anyway.

## What it prints

    ERROR: Valve: outlet P (30.000000 bar) is above the inlet P (10.000000 bar).
    A valve only drops pressure ... use a `pump` (liquid) or a `compressor` (gas).

The case ends with an error by design (an EXPECTED-FAIL in the suite).

## The lesson

Say why the request is impossible and what to use instead.

## What to try

Set the outlet pressure below 10 bar and the valve runs.
