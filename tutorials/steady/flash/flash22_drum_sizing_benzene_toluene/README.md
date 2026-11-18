# flash22_drum_sizing_benzene_toluene -- a flash drum, sized in detail

**The task:** a flash drum separates 1000 kmol/h of 40/60 benzene/toluene at 370 K and 1 bar
(flash01's split at ten times the flow). How big must the drum be, which way does it lie, where are the
liquid levels, and how wide are its three nozzles?

`system/postDict` declares `drum { ... }` instead of a residence time. The drum is then sized by the
procedure of **Towler & Sinnott, *Chemical Engineering Design* 1st ed., section 10.9** (eqs. 10.10 and
10.11, Fig. 10.51, examples 10.5 and 10.6), with a **Haider-Levenspiel** droplet check (Kunii & Levenspiel,
*Fluidization Engineering* 2nd ed., eq. 34) and the pipe velocities of Towler & Sinnott section 5.
Theory Guide: `sec:drum-sizing`. Run it: `runCase tutorials/steady/flash/flash22_drum_sizing_benzene_toluene`
and read the `[drum]` block of the log.

## What the case declares (the sources do not fix these)

| key | value | why |
|---|---|---|
| `method` | towler | the published procedure |
| `demister` | yes | a mesh pad: u = u_t (without one Towler multiplies by 0.15) |
| `holdupTime` / `surgeTime` | 600 s / 60 s | Towler: "typically 10 minutes"; the surge margin is assumed |
| `lowLevel` | 0.3 m | Towler example 10.5: room for the level controller |
| `dropDiameter` | 150 um | assumed design droplet, for the check only |
| `nozzleVelocity` | 15 / 20 / 1.5 m/s | feed / vapour / liquid, inside Towler's section 5 windows |
| `diameterStep` | 0.1524 m | round D up to the next 6 in. (Wankat section 2.8) |

## Hand calculation (a calculator and the densities and flows the run prints)

From the run: vapour 303.98 kmol/h of M = 84.40 kg/kmol = 7.127 kg/s at rho_V = 2.744 kg/m3, so
Q_V = 2.597 m3/s; liquid 696.02 kmol/h of M = 87.46 kg/kmol = 16.91 kg/s at rho_L = 794.4 kg/m3, so
Q_L = 0.02128 m3/s.

1. **Souders-Brown (Towler 10.10).** u_t = 0.07 sqrt((794.4 - 2.744)/2.744) = **1.189 m/s**; with a
   demister u = u_t.
2. **Vertical drum (10.11).** D = sqrt(4 x 2.597 / (pi x 1.189)) = 1.668 m, rounded up to the next 6 in.
   step: **1.676 m**. Its area is 2.207 m2, so the 600 s hold-up is 0.02128 x 600 / 2.207 = 5.79 m and the
   60 s surge 0.58 m: LLL 0.30, NLL 6.09, HLL 6.67 m. Add Fig. 10.51a's clearances (D/2 or 0.6 m to the
   inlet: 0.84 m; D or 1.0 m of disengagement: 1.68 m; 0.4 m for the pad): H = 6.67 + 0.84 + 1.68 + 0.4 =
   **9.58 m**, so H/D = **5.71 > 5**. Wankat section 2.8 says a drum that tall should lie down: the run
   prints exactly this and chooses a **horizontal** drum (`orientation auto`).
3. **Horizontal drum (Towler 10.9.3).** P = 1 bar < 20, so L/D = 3. Equating the droplet's fall time
   (D/2)/u to the vapour's residence time L/u_v at half level gives D^2 = 4 Q_V / (pi (L/D) u) =
   4 x 2.597 / (pi x 3 x 1.189), D = 0.963 m. But the liquid between the low level and D/2 must hold
   0.02128 x 660 = 14.05 m3: with L = 3D, D = 2.286 m (rounded step) holds 11.89 m3 (too little) and
   D = 2.438 m holds **14.67 m3**. So **D = 2.438 m, L = 7.315 m**, shell volume 34.16 m3.
4. **Levels (horizontal).** From the circular-segment area: LLL 0.300 m, NLL 1.112 m, HLL **1.184 m** above
   the bottom. The vapour then has A_v = 2.420 m2, u_v = 1.073 m/s, so it stays L/u_v = 6.82 s in the drum
   while a droplet needs (D - HLL)/u = 1.055 s to fall: satisfied.
5. **Droplet check.** For 150 um in benzene/toluene vapour (mu = 8.7e-6 Pa s, Chung): d* = 150e-6 x
   [2.744 x 791.7 x 9.80665 / (8.7e-6)^2]^(1/3), u* from eq. 34, u_t = **0.554 m/s**; it falls the
   1.254 m of free height in 2.26 s, against 6.82 s of vapour residence: **it settles**.
6. **Nozzles.** d = sqrt(4Q/(pi u)): feed Q = 2.597 + 0.0213 = 2.618 m3/s at 15 m/s, **471 mm** (rho v^2 =
   2065 Pa at the mixture density 9.18 kg/m3); vapour out 2.597 m3/s at 20 m/s, **407 mm**; liquid out
   0.02128 m3/s at 1.5 m/s, **134 mm**.

The run's numbers are the same to the digits printed: D = 2.438 m, L = 7.315 m, V = 34.16 m3, LLL / NLL /
HLL = 0.300 / 1.112 / 1.184 m, nozzles 471 / 407 / 134 mm. (The pad-less variant of Towler's own example
10.5, steam and water at 4 bar, gives 1.25 m; this case differs only in the fluid.)

## Try

* `demister no;` -- u falls to 0.15 u_t = 0.178 m/s, the vapour area grows 6.7-fold and the vertical drum
  becomes D = 4.42 m, H = 7.85 m (H/D 1.8, below Wankat's 3: the run stays vertical and says so).
* `orientation vertical;` -- the drum stands 9.58 m tall (H/D 5.7), and the run says it is outside the
  3-5 window.
* `method wankat;` -- Blackwell's fit of Watkins' chart gives K = 0.4054 ft/s = 0.1236 m/s at F_lv =
  0.139 (hand check: 0.4054, and 0.4433 for Wankat's own example 2-4 at F_lv = 0.0722), Kh = 1.25 K, and
  the drum comes out horizontal D = 2.591 m, L = 7.772 m: compare the two procedures on one drum.

*A verification case, not a validation: the sizing pins the procedure (the two sources' equations as
implemented, read at the page), not a measured vessel.*
