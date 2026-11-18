# compressor03_staged_design

Air, 1 bar and 25 degC, 455 kmol/h (11 279 m3/h, 6 639 cfm), to a 15 bar header.
The flowsheet unit is one adiabatic pass (eta_isentropic 0.75): it needs 1 697 kW
and leaves the gas at 743 K.  The `design {}` block of the postDict asks what
machine that really is, following Brown, *Compressors: Selection and Sizing*,
3rd ed. (2005).

## What the design says

| item | value | where it comes from |
|---|---|---|
| machine | centrifugal | the point (6 639 cfm, ratio 15) lies in the centrifugal region of Fig 1-2, p.3 |
| sections | 3, equal ratio 2.532, two intercoolers | fewest sections whose hottest discharge is within the DECLARED 450 K |
| discharge per section | 423.7 K | Eq 5.16 |
| shaft power, staged | 1 409 kW (single pass: 1 697 kW) | Eq 2.78 + 1 % mechanical loss |
| intercoolers | 2 x 466 kW, 0.138 bar drop each | Brown p.200 (2 % of P, floor 2 psi) |
| driver | electric motor, 1 550 kW | 110 % of the greatest power, p.307 |
| impellers | 3 per section, 9 in 3 casings | head per impeller 10 000 ft lbf/lb at MW 29, adjusted, p.196 |

`maxDischargeT 450 K` is the case's own limit (the book's 475 F is called
arbitrary on p.197): with the book's limit two sections would do.  Every other
input was not declared and is announced with its page in the run log and on
`design/compressor1/compressor`.

## One stage by hand (stage 1)

Pressure chain with the cooler drops (2 psi = 0.1379 bar, larger than 2 % of
the cooler inlet pressure): 1 -> 2.5320 bar, cooler to 2.3941; -> 6.0620, cooler
to 5.9241; -> 15.000.  So r = 2.532 in every stage.

Constant-gamma air, k = 1.40, so (k-1)/k = 0.2857; eta_p = 0.75:

    (n-1)/n = 0.2857 / 0.75 = 0.3810                    (Eq 2.71)
    T2 = 298.15 * 2.532^0.3810 = 298.15 * 1.4244 = 424.7 K   (Eq 5.16)
    R_s = 8314.46 / 28.845 = 288.2 J/(kg K),  Z = 1 (ideal-gas package)
    Hp = 288.2 * 298.15 * (1/0.3810) * (1.4244 - 1) = 95 730 J/kg   (Eq 2.73)
    W_gas = 3.6457 kg/s * 95 730 / 0.75 = 465.3 kW      (Eq 2.78)
    W_shaft = 465.3 * 1.01 = 470.0 kW

The engine prints 423.74 K, 95 673 J/kg and 469.71 kW: the 0.2 % difference is
the air's Cp rising with temperature, which the engine's package carries and the
constant k = 1.40 does not (the line `stage1_dhCheck`, -0.19 %, is the same
number measured against the package's own enthalpy rise).

## What is NOT done

The staged power is not what the flowsheet's unit computes, and the costing still
reads the unit's single-pass 1 697 kW; the intercoolers are listed, not placed as
exchangers of the plant.  No frame, speed, surge or standard motor size.  See
Theory Guide section *Compressor design* (`sec:compressor-design`).
