# A design reading by measurement: the pressure term of the generic liquid enthalpy (C390)

Date: 2026-11-13.  Asked by the coordinator (board, R2) BEFORE anything
is built.  Read and measured on `c378-pilot` at f08f9b061e (a native
build of that head).  Nothing was committed there: the prototype that
produced sections 3 and 4 was a throwaway patch, reverted, and the build
restored.  Every script and table named below is in this folder; scripts
take `<repo-root> <scratch-dir>`.

## 1. The recommendation

1. **The form is `v (1 - alpha T) dP`, not `v dP`.**  Integrated from the
   component's own `p_sat,i(T)` to P, component by component, with the
   volume and its temperature slope from the property kernel's
   pure-component leaf.  On water it reproduces the engine's own
   reference route to three or four digits; `v dP` is 8 % too large at
   298 K, 28 % at 350 K and 110 % at 450 K (section 2).
2. **One home: the liquid leg of `H_stream_formation`, with its entropy
   partner `-(dv/dT) dP` in `S_stream_formation`, in the same slice.**
   The energy report, `priceState`, the valve, the heater, the flash and
   the column already price through that function at (T, P), so they gain
   the term with no edit.  Not in `speciesPhaseEnthalpy`,
   `H_liquid_formation` or `Hliquid`, and no unit adds its own.
3. **The pump then SOLVES the stream balance**
   `H(T_out, P_out) = H(T_in, P_in) + w`, as its pure-fluid branch already
   does, and reads its outlet phase from the resolved state.  That closes
   TD-18 by construction.
4. **Reference pressure: the same `Psat(i, T)` the K-value uses.**  Do
   not tie the enthalpy to the Poynting factor's constant record volume:
   that pair is self-consistent and gives the wrong enthalpy.  Moving the
   Poynting factor onto the kernel volume is a later slice of its own (it
   moves K-values).
5. **It cannot land without a full sweep and a list.**  The term reaches
   every case through a function every case calls.  Measured on four
   cases, it moves 5, 46, 20 and 9 golden rows, among them a flagship
   plant's net present value by 1 % (section 4).

## 2. Which form: measured against the engine's reference route

Reference: `(h(T,P) - h_sat,liq(T))` from the IF97 route, in J/mol.
Kernel volume for water: the IAPWS-95 leaf.  `pressure_terms.csv`,
`mk_props.py`, `analyse_props.py`.

| T (K) | P (bar) | reference | `v(1-alpha T) dP`, kernel | `v dP`, kernel | `v(1-alpha T) dP`, Rackett slope | record volume x dP |
|---|---|---|---|---|---|---|
| 298.15 | 10 | 16.626 | 16.624 | 18.008 | 13.052 | 18.013 |
| 298.15 | 100 | 166.127 | 166.117 | 180.233 | 130.897 | 180.643 |
| 350 | 100 | 144.016 | 144.022 | 183.823 | 120.647 | 179.938 |
| 450 | 50 | 38.232 | 37.470 | 80.515 | 32.005 | 72.019 |
| 450 | 100 | 86.110 | 85.327 | 181.207 | 72.156 | 162.369 |

The reviewing session checked the 298.15 K, 100 bar row by hand: with
v = 1.80684e-5 m3/mol and alpha = 2.57e-4 1/K at 1 bar,
`v (1 - alpha T) dP` = 166.79 J/mol with the volume held constant; the
table's 166.12 integrates the compression.

The 0.77 J/mol gap at 450 K is the reference PRESSURE, not the form:
water's record gives p_sat by an Antoine fit declared for 273 to 373 K,
which at 450 K reads 10.14 bar where the reference equation has 9.32.

Pumps, with the prototype (`out_pumps.txt`, `run_modes.py`): temperature
rise of the pump, in K.

| case | today | IF97 selected | `v dP`, kernel | `v(1-alpha T) dP`, kernel |
|---|---|---|---|---|
| liquidDensity01_water | 0.020513 | 0.024238 | 0.020520 | 0.024201 |
| pump01_water | 0.927152 | 1.071230 | 0.932378 | 1.073683 |
| pump02_pressure_spec | 0.373701 | 0.429409 | 0.374585 | 0.429377 |

Every form closes the plant (below 4e-11 kW) once the pump solves the
stream balance.  Only the recommended form also publishes the reference
temperature rise, to 0.2 %.  `v dP` closes the first law and keeps the
wrong outlet temperature: a closed balance is not evidence here.

## 3. The reservation: the slope of every liquid that is not water

For a fluid no reference equation names, the kernel's volume has no
pressure dependence and its temperature slope is the Rackett slope.  The
term's size is `(1 - alpha T)`, which is a difference: a small error in
alpha becomes a large one in the term as `alpha T` approaches 1.  The
tree holds three more reference equations, so the slope was measured
where the engine itself can say (`rackett_alpha.csv`,
`rackett_alpha.py`; alpha isobaric at 1.01 p_sat).

| fluid | reduced T | `1 - alpha T`, reference | `1 - alpha T`, Rackett | ratio |
|---|---|---|---|---|
| methane | 0.60 | 0.5927 | 0.5912 | 0.998 |
| methane | 0.75 | 0.2599 | 0.2851 | 1.097 |
| methane | 0.90 | -1.0200 | -0.6511 | 0.638 |
| nitrogen | 0.60 | 0.5808 | 0.5884 | 1.013 |
| nitrogen | 0.75 | 0.2488 | 0.2803 | 1.127 |
| nitrogen | 0.90 | -1.0294 | -0.6619 | 0.643 |
| carbon dioxide | 0.72 | 0.3110 | 0.3329 | 1.070 |
| carbon dioxide | 0.75 | 0.2183 | 0.2465 | 1.129 |
| carbon dioxide | 0.90 | -1.0524 | -0.7399 | 0.703 |
| water | 0.46 | 0.9233 | 0.7246 | 0.785 |
| water | 0.54 | 0.7817 | 0.6374 | 0.815 |
| water | 0.70 | 0.4602 | 0.3750 | 0.815 |

What it says:

- Three non-associating fluids: within about 1 % at a reduced
  temperature of 0.6, 7 to 13 % too large near 0.75, and wrong by a third
  at 0.9, where the term has changed sign (the enthalpy of the liquid
  falls as pressure rises).  The sign change is physics; its size on the
  Rackett route is not established.
- Water, the one associating fluid that could be checked, is 19 to 22 %
  too small on the Rackett route at every temperature.
- **The cases that move most are ammonia cases, and ammonia can not be
  checked in the tree.**  In `letdown01_ammonia_flashing` the liquid is at
  253 K, a reduced temperature of 0.62, where the three checked fluids
  suggest a few percent.  Ammonia is polar and associating; the only
  associating fluid in the table is off by 20 %.  So the honest statement
  is: unverified, probably within 10 %, possibly 20.

What follows for the build:

- The run must say, per component and once, which slope the term used
  (a reference equation, or the Rackett slope) so that a reader can tell
  the two classes of number apart.
- Where `alpha T` exceeds 1 on the Rackett route the term has changed
  sign on a slope nobody checked; that deserves its own announcement.
- Before the ammonia plants' goldens are re-recorded, either an ammonia
  reference equation is curated or the rows are shown as resting on an
  unverified slope.  This is a curation decision, not the builder's.

## 4. What moves (prototype, recommended form)

| case | rows moved | the ones that matter |
|---|---|---|
| pump01_water | 5 | pump dT +15.8 %; plant residual 1.3 kW to 0 |
| letdown01_ammonia_flashing (140 to 20 bar) | 46 of 98 | the valve's dT from -0.136 K to +1.890 K; low-pressure flash gas +16.4 %; product ammonia -0.87 % |
| ammonia02_full_plant | 20 of 204 | the isothermal letdown flash duty from +13.80 kW to -225.06 kW; net present value +1.02 %; pinch: admissible candidates 5 to 2 |
| column14_klemola_c4_splitter (6.6 bar) | 9 of 35 | duties and flows by 4e-4 to 7e-4 relative |
| vlle04 (liquid-liquid, 3 bar) | 0 of 19 | the term cancels across a liquid split |

(`out_letdown01.txt`, `out_ammonia02.txt`, `out_column14.txt`,
`out_vlle04.txt`.)  The valve's sign is the physical one: a compressed
liquid with `alpha T` below 1 warms when throttled.  With `v dP` the same
valve reads +4.08 K.

Of 568 cases with goldens, 68 declare a pressure of 10 bar or more in
`0/`; rows also move at 3 bar (liquidDensity01) and 6.6 bar (column14).

## 5. The answers to the five questions

1. **Form and volume.**  Section 1, items 1 and 4.  The volume is
   evaluated at (T, max(P, p_sat,i)) and held flat below p_sat,i, so that
   the enthalpy never refuses: the kernel refuses a liquid volume on the
   vapour side, and a refusal inside an enthalpy would break every flash
   trial.
2. **Consistency with the Poynting factor.**  Same reference pressure,
   yes.  Same volume, not yet: today the factor uses the record's
   constant volume (`SaturatedVapour.cpp:113-159`) and is OFF whenever the
   vapour is an ideal gas (`ThermoPackage.cpp:828-839`).  The mismatch
   this leaves between g and h is `T (dv/dT) dP`, about 14 J/mol for
   water at 100 bar, forty times smaller than the one the engine already
   carries between its latent heat and its vapour-pressure curve.
3. **Flashes and columns at pressure.**  Section 4.  An isothermal
   letdown flash can change the sign of its duty; an isenthalpic letdown
   changes its split; a column at 7 bar moves in the fourth digit; a
   liquid-liquid split does not move.
4. **Goldens.**  Section 4, and the sweep.
5. **TD-18.**  Section 1, item 3.  With the inlet already accepted as a
   liquid, a discharge below its bubble point is out of arithmetic reach
   (the rise of p_sat per degree of pump heating against dP is of order
   1e-6); what a pump can really violate is its suction margin, which is
   a separate item.

## 6. What the first slice should NOT do

- Change the Poynting factor (K-values move: its own slice, its own list).
- Touch `ReactionHeat` or `speciesPhaseEnthalpy`: the heat of reaction
  stays on the standard state.  The datum offset is 1.75 J/mol for water
  (v x (1 bar - p_sat(298 K))), 1e-4 of a heat of reaction.
- Give a term to a component with no saturation line at T (above its
  critical temperature, a Henry solute, a salt).  They get none,
  announced once; a Henry solute's `v_inf (P - p_sat,solvent)` is a later
  slice and is the same anchor the Krichevsky-Kasarnovsky factor uses.
- Use a mixture or solution-law volume.  The per-component form is the
  one whose reference matches each component's own standard state, and
  the one that cancels across a liquid split.

## 7. Holes the build will meet (each would show as a unit residual)

- The T-only fallbacks: 17 unit-operation sites call `Hliquid` and 9 call
  `speciesPhaseEnthalpy` (batch 5, reactor 3, dynamic 1).  A unit that
  falls back there while the report prices at (T, P) opens a gap of the
  term's size.  Measure the unit residuals on the fast set before the
  sweep.
- `StreamEquilibrium.H:629` subtracts a T-only liquid enthalpy for a
  precipitate; with the term in the stream that leaves the liquid's
  pressure term on the crystal.
- The dynamic holdups (`VariableVolumeHoldup.cpp:200`,
  `DynamicCSTR.cpp:722`) store a T-only enthalpy.
- A brine pump (swro01) has no liquid heat capacity for its salt: the
  prototype's solve refused there.  The closed form stays for a stream
  with no enthalpy route, announced.
- `H_real(T, P, y, Liquid)` on a generic package returns the vapour
  route's enthalpy (`ThermoPackage.cpp:2643`): a generic liquid must not
  be priced through it.

## 8. A gate

`check_energy_closure`'s unit arm for the pump and the valve; the four
cases pinned open today (pump01 and pump02 at 65 %, liquidDensity01 and
02 at 70 %) leave the list.  One arm against the reference: the pump of
liquidDensity01 publishes the temperature rise of its IF97 twin within
0.5 %.  That arm is the one that tells the recommended form from `v dP`;
closure alone cannot.

## 9. What was NOT reviewed

- Batch and time-integrated units and their ledgers.
- The other 64 cases at 10 bar or more.
- The slope of any organic liquid against a measurement.
- The effect over the whole pressure integral at a reduced temperature of
  0.9 (alpha was taken at 1.01 p_sat; it falls with pressure).
- The web app's line citations into `ThermoPackage.cpp`, which a real
  edit will move.
