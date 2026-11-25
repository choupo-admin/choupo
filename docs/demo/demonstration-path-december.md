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
- Show: Plots > Declared views, the course's reference-simulator run of the
  same column beside Choupo, with its "Read it right" note (a cross-check,
  not a validation).
- Quote, AS ON SCREEN (browser pass 2026-11-24): condenser duty 2.73 % and
  reboiler duty 1.60 % larger than the reference run's, top and bottom
  temperatures within 0.48 K and 0.63 K, conversion 0.1 % lower.
- Trap: never name the commercial simulator.

## 3. "Validated against what?" -- a measured industrial column

- Open `?case=column14_klemola_c4_splitter` and Run.
- Show: the parity plot and the paper's Table 2 beside the run.
- Quote, AS ON SCREEN (browser pass 2026-11-24, wt %): both key purities
  within 1 % of the measured plant -- i-butane in the distillate 93.90 against
  93.5 (+0.43 %), n-butane in the bottoms 97.98 against 98.1 (-0.12 %); Klemola
  & Ilme 1996 Table 2.
- Say the honest half too: the two minor keys miss in opposite senses and the
  paper's own balance fails on them.  Colleagues trust a tool that says where
  it is weak.

## 4. The reference plant -- ammonia, the PEQ 2026-27 base case

`?case=ammoniaPEQ_baseCase`.  This is the case of the course they teach.

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
5. **Equipment and cost.**  Total capital investment 146.2 M EUR (`kpi
   economics TCI`; 167.9 before the hydrogen price moved from 8.0 to 1.5 EUR/kg, which shrank the working capital).  The ten H2 buffer vessels are one grouped row of the
   equipment table, the hydrogen stock, 43.4 % of its cost (on screen,
   browser pass 2026-11-24).
6. **The economics, framed before it is opened.**  The appraisal opens on an
   NPV of +96.3 M EUR, IRR 20.2 %, discounted payback 6.5 years (`kpi economics
   NPV`, `IRR`, `paybackYears`).  Say first, then open it: every price is
   public, dated and cited (constant/economics): ammonia at its 2025 EU import
   value, 0.530 EUR/kg (Eurostat), which is the market price of CONVENTIONAL
   ammonia; hydrogen at 1.5 EUR/kg, the author's choice inside the range
   0.74-4.07 EUR/kg the brief quotes from ACER (the range is NOT in the text
   of ACER's report; say so if asked, README and provenance do).  Hydrogen
   alone costs 0.1803 x 1.5 = 0.27 EUR per kg of ammonia made.  **The lesson
   is the scenario table of the README ('Hydrogen price scenarios') and the
   tornado of the run:** the plant can bear hydrogen up to 1.685 EUR/kg (`kpi
   economics breakEven_price_H2Feed`) and sells ammonia down to 0.488 EUR/kg
   (`breakEven_price_ProductNH3`) before the NPV falls to zero; at 0.74 it
   earns +492 M EUR, at 4.07 it loses 1 242 M EUR, and at 8.0 EUR/kg, ACER's
   cost of electrolytic (RFNBO) hydrogen, it loses 3 287 M EUR (a scratch
   re-pricing, not pinned).  The answer a student should reach is the one
   the industry reached: ammonia from electrolytic hydrogen waits on the
   price of hydrogen, and the plant's own equipment is not what decides it.
7. **3D layout.**  Open the layout tab: roads, fence, gates, piped stores and
   the utilities block; say that the process block is still small on the plot.
   On a machine with a graphics card the view is up at once (laptop, Intel GPU,
   2026-11-24: run 34 s, 3D in 0.1 s, about 60 frames/s); on one without (a
   software rasteriser) it froze for minutes (docs/audits/2026-11-24-peq-3d-freeze.md).
   If the view is slow on the day, the Quality control's Fast setting is the remedy.

## 5. One EduTool, chosen for these colleagues

- `?workspace=methods&tool=transfer-unit` (Colburn's N_OG against the integral
  of its definition; the pole at A = R, not at A = 1, a common slip in
  lectures), or `?workspace=methods&tool=methane-assembly` (methane combustion
  assembled reaction by reaction from a printed mechanism with its pages,
  against shock-tube measurements).
- Show the quiz at the end (C158).

## 6. If time remains -- kinetics against Cantera

- `?case=nox02_millerbowman_denox`: the paper's Fig. 57; minimum 16.7 ppm NOx
  at 1225 K.  SAY, do not look for on screen (the browser pass found none of
  them there): the paper's model curve within 2.9 ppm rms, Cantera within
  1.7e-3 in every species (BRAIN.md, Miller & Bowman entry), about 1.2 times
  Cantera's time (C473).
- Trap: do NOT open Plots > Trajectory -- 357 traces under a legend that
  covers them.  The cloud is making the case open on its declared views; until
  that lands, skip this stop.

## Before the day

- [x] Re-read every quoted number from its file (above).  Done 2026-11-24 after the
      C256 landing (afd3f8ff91): FEHE 64 380.7 kW and its four temperatures, TCI
      167.86 M EUR, NPV -3 287.7 M EUR, break-even 1.952 and 1.685 EUR/kg read from
      the PEQ `expected` (SUPERSEDED 2026-11-25, C526: hydrogen 1.5 EUR/kg, TCI 146.2,
      NPV +96.3, break-evens 0.488 and 1.685; item 6 above carries the new numbers); column19 duties from its `expected`; every case of the path
      PASSED in the full sweep of that morning, both EduTools in `--gui` 49/0.
- [x] C479 landed: the MTBE comparison and the grouped buffer row are on
      screen (browser pass 2026-11-24, docs/audits/2026-11-24-demo-browser-pass.md).
- [ ] Every `?case=` link above opens its case (the browser pass found a bare
      name opens the landing; the cloud is fixing the lookup).  Until then use
      the full path, e.g. `?case=steady/flash/flash01_benzene_toluene`.
- [x] WASM rebuilt from the landed main; the site serves it (rebuilt 2026-11-24
      10:01 at afd3f8ff91; publish-site succeeded for that commit).  Redo if an engine
      change lands before the day.
- [ ] Vitor rehearses the whole path once in the browser, on the machine and
      the network of the day, and notes any screen that surprised him.
- [ ] The about 160 advisories under the plant's run header: decide whether the
      header folds them (C479 follow-up) or say "these are the model's
      validity notes, each with its reason".
