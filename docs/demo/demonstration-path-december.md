# The demonstration path for 2 December 2026 (C238)

One path through the running app, in order, for colleagues who teach chemical
engineering.  The thread is the one the project stands on: **every number on
screen can be opened, traced to its equation and its source, and held to
something outside Choupo**.  Each stop says what to open, what to show, the one
number to quote and where that number lives in the tree, and the trap to avoid.

Numbers below were read from the tree on 2026-11-23 (goldens `expected`, case
dictionaries, BRAIN.md).  Before the rehearsal, re-read each from its file: a
landing between now and then may move one, and the file wins over this page.

Open the app at `/app`.  A case opens with `?case=<name>`, an EduTool with
`?workspace=methods&tool=<id>`.

## 1. The glass box, in thirty seconds -- a flash

- Open `?case=flash01_benzene_toluene` (if the name moved, the gallery finds
  it under Flash) and Run.
- Show: the log prints every Newton iteration of the Rachford-Rice solve; the
  Theory link of the block opens the section that derives it.
- Say: "nothing here is hidden; the student reads the iteration, the equation
  and the source line."
- Trap: none; it is the shortest stop.  Do not linger.

## 2. "Does it agree with the simulator we use?" -- the MTBE column

- Open `?case=column19_mtbe_reactive_mesh` and Run.
- Quote: against the reference simulator, duties within +2.5 % and +1.5 %,
  temperatures within 0.6 K (BRAIN.md, Distillation row, C235).
- Trap (C479, a general is on it): until it lands the comparison is not on
  screen; say the numbers, then open the next case, which shows its
  comparison.  Never name the commercial simulator.

## 3. "Validated against what?" -- a measured industrial column

- Open `?case=column14_klemola_c4_splitter` and Run.
- Show: the parity plot and the paper's Table 2 beside the run.
- Quote: both key purities within 1 % of the measured plant (+0.45 %,
  +0.24 %; Klemola & Ilme 1996 Table 2; BRAIN.md Distillation row).
- Say the honest half too: the two minor keys miss in opposite senses and the
  paper's own balance fails on them.  Colleagues trust a tool that says where
  it is weak.

## 4. The reference plant -- green ammonia, the PEQ 2026-27 base case

`?case=greenAmmoniaPEQ_baseCase`.  This is the case of the course they teach.

1. **Flowsheet and the loop.**  N2 boost, two make-up compressors, recycle
   compressor, FEHE, water cooler, chiller, separator, let-down, storage
   flash; the converter is a sector with three kinetically sized beds (C440).
   Drill into the converter.
2. **Balances.**  Mass, element and energy closure are printed on every run
   and gated in every suite mode (C258).  Show the closure line.
3. **The FEHE profile.**  Plots > Profile > FEHE: cold 275.48 -> 651.16 K,
   hot 735.56 -> 338.72 K, the same four numbers as the stream table (C478,
   fixed 11-23; before, the curves ran past the exchanger's ends).  Duty
   64 381 kW (`expected`, `kpi FEHE Q_kW`).
4. **Pinch.**  The plant's pinch includes the converter segment (C302).
5. **Equipment and cost.**  Total capital investment 167.9 M EUR (`kpi
   economics TCI`).  Trap (C479): until it lands the ten H2 buffer vessels
   show as raw names; they are the hydrogen stock and carry 55 % of capital.
6. **The economics, framed before it is opened.**  The appraisal opens on an
   NPV of -3 288 M EUR (`kpi economics NPV`).  Say first, then open it: every
   price is public, dated and cited (constant/economics): ammonia at its 2025
   EU import value, 0.530 EUR/kg (Eurostat), hydrogen at the EU average cost of
   renewable hydrogen, 8.0 EUR/kg (ACER, October 2025).  Hydrogen alone costs
   0.1803 x 8 = 1.44 EUR per kg of ammonia made.  So the plant breaks even only
   at 1.95 EUR/kg of ammonia (`kpi economics breakEven_price_ProductNH3`),
   about 3.7 times the market, or with hydrogen at 1.68 EUR/kg (`kpi economics
   breakEven_price_H2Feed`).  The answer a student should reach is the one
   the industry reached: green ammonia waits on the price of hydrogen.  The
   negative NPV is the lesson, not a defect.
7. **3D layout.**  Open the layout tab: roads, fence, gates, piped stores and
   the utilities block; say that the process block is still small on the plot.

## 5. One EduTool, chosen for these colleagues

- `?workspace=methods&tool=transfer-unit` (Colburn's N_OG against the integral
  of its definition; the pole at A = R, not at A = 1, a common slip in
  lectures), or `?workspace=methods&tool=methane-assembly` (methane combustion
  assembled reaction by reaction from a printed mechanism with its pages,
  against shock-tube measurements).
- Show the quiz at the end (C158).

## 6. If time remains -- kinetics against Cantera

- `?case=nox02_millerbowman_denox`: the paper's Fig. 57; minimum 16.7 ppm NOx
  at 1225 K, the paper's model curve within 2.9 ppm rms and Cantera within
  1.7e-3 in every species (BRAIN.md, Miller & Bowman entry).  Speed: about 1.2
  times Cantera's time on this case (C473).
- The essential plots of these cases are being built (C477); until they land,
  show the trajectory plot, not the full list of species.

## Before the day

- [x] Re-read every quoted number from its file (above).  Done 2026-11-24 after the
      C256 landing (afd3f8ff91): FEHE 64 380.7 kW and its four temperatures, TCI
      167.86 M EUR, NPV -3 287.7 M EUR, break-even 1.952 and 1.685 EUR/kg read from
      the PEQ `expected`; column19 duties from its `expected`; every case of the path
      PASSED in the full sweep of that morning, both EduTools in `--gui` 49/0.
- [ ] C479 landed (the U.A.LMTD line, variable units, buffer names, the MTBE
      comparison on screen); else use the traps' words.
- [x] WASM rebuilt from the landed main; the site serves it (rebuilt 2026-11-24
      10:01 at afd3f8ff91; publish-site succeeded for that commit).  Redo if an engine
      change lands before the day.
- [ ] Vitor rehearses the whole path once in the browser, on the machine and
      the network of the day, and notes any screen that surprised him.
- [ ] The 107 advisories under the plant's run header: decide whether the
      header folds them (C479 follow-up) or say "these are the model's
      validity notes, each with its reason".
