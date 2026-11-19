# line01_pumped_drum -- the smallest plant that has a line list

A 40/60 mol % ethanol/water liquid (2500 kmol/h, 298 K, 1 atm; 20.3 kg/s) is
pumped to 6 bar and let down into a flash drum at 374 K and 2 bar, where it splits
into a vapour (12.9 kg/s) and a liquid (7.4 kg/s).  The pump and the drum are the two
placed items (`system/layoutDict`); the layout routes four pipes on the pipe rack, and
`lineDesign {}` in the same file sizes each of them.

```
choupoSolve .          # or: runCase tutorials/plant/line01_pumped_drum
```

Read, after the run:

* `design/lines/<stream>` -- one specification sheet per line: the routing, the fluid,
  the limits the size was held to, the nominal size and schedule, the hydraulics, the
  flags and the cost;
* `reports/lines/lineList.csv` -- the line list, one row per line;
* the result's `layout.lines`, pinned by the golden (`layout line:<stream> ...`).

| line | service | size | v (m/s) | governed by | drop (kPa) |
|---|---|---|---|---|---|
| feed (battery limit to pump) | liquid suction | 5 in, sch 40 | 1.84 | Rase's suction form | -38.4 (the line falls) |
| pumped (pump to drum) | liquid discharge | 4 in, sch 40 | 2.90 | the 1-3 m/s window | 39.0 |
| liquid (drum to battery limit) | liquid discharge | 2.5 in, sch 40 | 2.95 | the 1-3 m/s window | 68.9 |
| vapor (drum to battery limit) | gas | 24 in, sch 40 | 23.3 | the 15-30 m/s window | 1.2 |

The `pumped` and `liquid` lines are flagged: their drop per metre (638 and 1075 Pa/m)
exceeds the 0.5 kPa/m guide for a pumped liquid.  A flag is never a resize: the case
chose the window, the guide is the book's, and the sheet shows both.

## The `pumped` line by hand

Every number below is on `design/lines/pumped`; none is typed in the case.

**Service and flow.**  The stream is a liquid and its `to` end is not a pump, so it is a
discharge line.  m = 20.303 kg/s at rho = 853.73 kg/m3 (the package's liquid density at
298 K), so Q = m / rho = 0.023782 m3/s.

**Size.**  The window is 1-3 m/s (Towler and Sinnott 2008, section 5.6, p. 265), so
D >= sqrt(4 Q / (pi 3)) = 0.1005 m.  The declared sizes, smallest first: 3 in sch 40 has
an inside diameter of 77.9 mm, v = 4.99 m/s, too fast; 4 in sch 40 has 102.26 mm
(Perry, Table 10-22: outside 4.5 in, wall 0.237 in), so
v = 4 Q / (pi D^2) = 4 x 0.023782 / (pi x 0.10226^2) = 2.896 m/s, inside the window.  The
erosion check: rho v^2 = 853.73 x 2.896^2 = 7158 Pa, below the 15000 Pa the case declares.

**Schedule.**  The line is at 6 bar abs = 5.0 bar gauge; the design pressure is 1.1 times
that, P = 0.5485 MPa.  With S = 140 MPa (the carbon steel record), E = 1, g = 0.4:

    t_p = P d / (2 (S E + P g)) = 0.5485 x 114.3 / (2 (140 + 0.4 x 0.5485)) = 0.224 mm
    t_m = t_p + c = 0.224 + 1.5 = 1.724 mm        (Towler Eq. 5.8)
    t_nom = t_m / (1 - 0.125) = 1.97 mm

The lightest schedule whose wall reaches 1.97 mm is schedule 40 (6.02 mm).  The
schedule number of Eq. 5.9, 1000 P / S = 3.92, says the same: at 3.9 the lightest declared schedule already
holds the pressure; the 4 in size is set by the velocity, not the wall.

**Pressure drop.**  Re = rho v D / mu = 853.73 x 2.896 x 0.10226 / 9.611e-4 = 2.63e5;
eps/D = 0.046 mm / 102.26 mm = 4.50e-4 (commercial steel, Towler Table 5.2).  Haaland's
explicit form, 1/sqrt(f) = -1.8 log10[(eps/D / 3.7)^1.11 + 6.9 / Re], gives f = 0.01795;
the case names Churchill, which gives f = 0.01822 (1.5 % higher).  The route has 7
direction changes and the case declares 2 isolation valves:

    L_eq = (7 x 35 + 2 x 7.5) x D = 260 x 0.10226 = 26.59 m      (Towler Table 5.3)
    dP_friction = f (L + L_eq) / D x rho v^2 / 2
                = 0.01822 x (17.693 + 26.588) / 0.10226 x 3579 = 28.2 kPa
    dP_static   = rho g dz = 853.73 x 9.80665 x 1.280 = 10.7 kPa    (the route climbs 1.28 m)
    dP_total    = 28.2 + 10.7 = 39.0 kPa

**Cost.**  The only pipe prices in the literature folder are Towler's problem 7.2
(p. 425): a 4 in carbon steel pipe costs $5 per metre in schedule 40, with $16.5 per
metre for installation and fittings.  So the line costs 17.69 x (5 + 16.5) = $380.4.  The
5 in and 2.5 in lines have no price in the case and the sheet says "not costed".

## What the sheet does not say

Two-phase pressure drop, the nozzle entrance and exit losses (a sharp-edged 25 D at a
vessel outlet, 50 D at an inlet, Table 5.3, are not added), the economic diameter and the
supports.  The gas line's density is taken at its inlet.  The material record's allowable
stress (140 MPa) is, by its own header, an unsourced teaching value; g = 0.4 and the
12.5 % mill under-tolerance are the code's usual values, which no book in the folder
prints, so the case declares them `assumed`.  The 15000 Pa limit on rho v^2 is likewise
the author's screening value.

## The nozzle schedule (DEV.md 4c C444)

`nozzleDesign {}` in the same file adds a `nozzles {}` block to the sheets of the pump and
the drum (`design/pump/ratedMachine`, `design/drum/vessel`).  The drum's three process
nozzles are the ends of the `pumped`, `liquid` and `vapor` lines (4, 2.5 and 24 in, the
lines' own sizes), all class 150 raised face at the drum's 3 bar gauge and 399 K (the
hottest stream, 374 K, plus an assumed 25 K): carbon steel at 399 K = 318 F, in the 400 F
row of Perry's Table 10-42a, p. 10-95, holds 200 psig at class 150, and 3 bar is 43.5 psig.
The drum (D 1.85 m, above the 1.2 m entry limit of Towler p. 714) has one 24 in manway.
Every row prints the sentence that decided it.
