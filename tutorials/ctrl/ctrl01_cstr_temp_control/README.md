# ctrl01_cstr_temp_control — a loop closes, and you watch it settle

A 1-litre continuous stirred reactor with a first-order A → B reaction
(two stand-in components, both MW 30 — the pseudo-reaction says so by
name rather than inventing atoms), fed at 320 K, with a jacket whose
temperature a **PID controller** sets to hold the reactor at **350 K**.
150 s of transient, 1 s steps.  The golden: PV ends at **348.47 K**, the
jacket (MV) at **348.54 K**, mass in = out = 0.225 kg over the run and
the material balance closes at 1.8e-15.

## The lesson

1. **The controller is a unit in the dict, with its tuning in the
   open.**  `type PID; setpoint 350.0; gains { Kp 4.0; Ki 0.04; Kd 0.0; }
   output { min 280; max 420; bias 320; }` — proportional band ≈ 7–8 K,
   integral time τ_I = Kp/Ki = 100 s, no derivative.  Nothing is tuned
   for you.
2. **Watch the manipulated variable saturate.**  At t = 2 s the jacket
   demand jumps to the **420 K clamp** (the log's last column), then
   backs off as the reactor warms: 402, 385, 374 K … The **Log** tab
   prints every 2 s; the clamp is a number in the dict and you can see it
   bind.
3. **Into the band, then the slow part.**  The reactor crosses 343 K —
   the −2 % edge of the setpoint band — at **t ≈ 14 s**.  At 150 s it
   sits 1.5 K under setpoint and still climbing: that is the integral
   action at τ_I = 100 s working off the offset.  Widen `endTime` and
   watch it arrive.
4. **The energy balance REFUSES here, and says why.**  `[balance] energy:
   UNAVAILABLE — the dynamicCSTR energy equation is a Cp/convective
   model, not the exact derivative of a stored H`.  The stand-in
   components carry no formation enthalpy on purpose; a ledger that
   cannot be exact says so rather than printing a closure it did not
   earn.  `ctrl11` is the case where it can, and does (1.4e-7).

## What to try

Set `Kp 8.0;`: faster into the band, more overshoot, the clamp held
longer.  Then `Ki 0;` — the offset never closes, which is what a
proportional-only loop teaches in one run.  `ctrl02_disturbance_rejection`
steps the feed temperature and asks the same loop to hold.
