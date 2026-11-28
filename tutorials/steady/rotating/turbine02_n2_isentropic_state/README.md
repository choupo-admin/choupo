# turbine02_n2_isentropic_state — the isentropic outlet satisfies S_out = S_in

An adiabatic turbine on N2 with efficiency 1: 0.001 kmol/s at 600 K and 10 bar
expanded to 1.188 bar (118 845.78 Pa).  The outlet is at **329.02 K**
(dT = -270.98 K), the shaft work 8 kW generated.  With eta = 1 the published
`T_out_isen` equals `T_out`, and the generated entropy `dS_gen` is
-6.8e-13, zero to round-off.  Figures are the case's `expected` rows.

## The lesson

1. The isentropic outlet is not a formula in T: it is the root of
   S(T_out_isen, P_out) = S_in on the package's own entropy surface.
2. With eta = 1 the real and isentropic states coincide, so the entropy
   generation is a direct check of that root.
3. `dS_gen` at round-off is the case's witness that the root is right.

## What to try

Set `eta` below 1: T_out rises above T_out_isen and `dS_gen` becomes positive.
