# A pressure exchanger is three balances

*DEV.md 4c C192, 2026-11-01.  Vítor: "faz essa operacao unitaria e depois
faz tambem a subrotina de design detalhado e faz ate um esquema HTML, como
fazes para os permutadores de calor."*

Kind: ADR.  Status: SHIPPED 2026-11-01 (the unit, the sizer, the schematic,
the witness, the gate).

## The decision

The rotary ceramic pressure exchanger of seawater RO (the ERI PX class) is
built as a unit operation, `pressureExchanger`
(`src/unitOperations/rotating/PressureExchanger.{H,cpp}`), with NO physics
beyond three algebraic balances on its two inlets, each parameterised by
ONE declared number from the maker's sheet or from Stover, Desalination 203
(2007) 168-175.  There is no default for any of the three: an absent one
refuses by name, naming where the number comes from.  A `source` is
required beside them.

Four positional ports: `inputs ( highPressureIn lowPressureIn )` -- the
brine, then the seawater; `outputs ( highPressureOut lowPressureOut )` --
the pressurised seawater, then the spent brine.

## The three balances

Every flow is VOLUMETRIC, `Q = F v`, with `v` the stream's liquid molar
volume under the dilute-solution reading the pump uses (a dissolved ion or
an aqueous-bridged salt carries no `Vliq` and contributes no volume;
announced), and the two solutions' volumes are taken additive.

1. **Volume, less the leakage** `lambda` (the lubrication flow across the
   rotor-stator gap, from the high-pressure side to the drain):

       Q_HPout = (1 - lambda) Q_HPin
       Q_LPout = Q_LPin + lambda Q_HPin

2. **Composition, by the mixing** `m`, defined as the share of the
   pressurised outlet's VOLUME that is brine left in the duct (the basis is
   stated: volumetric):

       n_i,HPout = m Q_HPout (F_b z_b,i / Q_b) + (1 - m) Q_HPout (F_s z_s,i / Q_s)
       n_i,LPout = F_b z_b,i + F_s z_s,i - n_i,HPout

   Matter closes by construction.  The salinity the feed gains is published
   (`feedSalinityIncrease`): it is the device's hidden penalty, the osmotic
   pressure the membrane must beat rising with it.  When the seawater fed
   cannot fill the duct volume the brine displaces, the balance of the duct
   is brine: the effective mixing is published and the run WARNS
   (under-flushed) rather than refusing, because inside a recycle the trial
   brine flow is the solver's, not the answer.

3. **Pressure, by the efficiency** `eta`, Stover's definition applied to
   the ABSOLUTE pressures the streams carry, with the drain pressure
   `P_LPout` declared (the device sets it by nothing of its own):

       eta = (Q_HPout P_HPout + Q_LPout P_LPout) / (Q_HPin P_HPin + Q_LPin P_LPin)
       P_HPout = [eta (Q_HPin P_HPin + Q_LPin P_LPin) - Q_LPout P_LPout] / Q_HPout

   The definition is not invariant to the pressure reference (the outlet
   volumes equal the inlet volumes, but the ratio still moves), so the
   header says which is used.  An outlet at or below the seawater inlet's
   pressure refuses (nothing recovered); one above the brine inlet's is
   announced (at eta -> 1 with a leak the definition credits the leaked
   volume's energy to the outlet).

Temperature is unchanged: the model is isothermal, so two inlets more than
0.5 K apart refuse (a mixing enthalpy balance is not modelled).  The unit
publishes `Q_kW = 0`: it does no heat and no work on the fluid beyond the
exchange of pressure; what it dissipates, `(1 - eta)` of the pressure
energy entering, is published (`dissipation_kW`, `specificEnergy_kWh_m3`
per m3 of pressurised seawater) and is NOT put on any stream, exactly as
the pump's useful work `v dP` is not (the liquid enthalpy surface carries
no pressure term; Pump.cpp states it).  The booster duty the device leaves
to be paid, `boosterDuty_kW = Q_HPout (P_target - P_HPout) / 1000`, is
HYDRAULIC (`eta_pump = 1`) to a declared `targetPressure` or, absent it, to
the brine inlet's pressure, announced as a lower bound.

Acceptance (C188): a liquid on both ports, the aqueous solvent in both,
every component modelled (one with neither a `Vliq` nor an aqueous bridge
refuses at the solve).

## The sheet

`PressureExchangerSize` (`src/postProcessing/sizing/`, registered
`pressureExchanger`, dispatched by the postDict's `sizing { units ( {
unitName; type pressureExchanger; material; designRules { ratedFlowPerUnit
<v> m3/h; source "..."; [pressureDesign <P> bar;] } } ) }`) is a sizer for
a RATING model: it reads the unit's answer and computes ONE number,

    rotors = ceil(Q_LP / ratedFlowPerUnit)

the array in parallel, the rated flow per unit a DECLARED maker's datum
with its source (the ERI PX-Q300 class is of the order of 50-68 m3/h per
unit; no built-in table).  It publishes, each with its unit: `rotors`,
`ratedFlowPerUnit`, `flowPerRotor`, the four volumetric flows, `P_HPin`,
`P_HPout`, `P_recovered`, `dP_HP`, `dP_LP`, `boosterPower` (hydraulic),
`efficiency`, `mixing`, `leakage`, `salinityIncrease`, `pressureDesign`
(declared, or the HP inlet pressure read from the unit -- the basis says
which).  `d.basis` names the rule and the source.  **NOT COSTED**, through
`notCostedBecause`: `Turton::coeffsFor` names nine equipment words and a
rotary pressure exchanger is none of them, so the item is listed apart (no
total moves, none reads INCOMPLETE) and the case prices it, if it wants a
price, as a declared quote (C98).  Verified before the sentence was
written, not assumed.

## The schematic

`gui/src/case/equipmentSchematic.ts` draws the `pressureExchanger` sheet
alone (`pressureExchangerSvg`, keyed on the sheet's `equipment` word in
`SCHEMATIC_KINDS`): the rotor as a NOMINAL cylinder with its ducts -- the
sheet publishes no rotor diameter, length or duct count, so none is written
on it and the picture says so; the four ports lettered with their stream
names and the PRESSURES the run wrote on the sheet's own port blocks; the
rotor count and rated flow; the booster as a box on the high-pressure
outlet with the hydraulic duty; every dimension in two channels (ink and
the word): the rated flow and the three device numbers DECLARED, the count,
the recovered pressure, the drops and the booster duty Choupo's, the design
pressure "provenance not published" because the drawing does not parse the
basis sentence.  Prose goes beside the picture, never in the SVG.  The
Reports tab's generic sheet view renders it for this kind
(`ReportsWorkspace.tsx`); the GUI test
`gui/tests/pressureExchangerSchematic.test.ts` holds a transcription of the
witness's sheet, and the gate holds that transcription to the engine.

## The witness

`tutorials/steady/membranes/membrane27_swro_energy_recovery`: membrane01's
seawater, a high-pressure pump to 55 bar, the exchanger, a booster, one
SW30HR-380 stage (2 x 7 elements), the brine recycled to the exchanger
(tear `brine`, Wegstein with its full secant step).  Its header decomposes
the specific energy: 1.88 kWh/m3 with the exchanger, 3.67 kWh/m3 without
it, against a thermodynamic minimum of 1.09 kWh/m3 computed from the
module's own van't Hoff osmotic pressure at the plant recovery.

Three things the witness found, each recorded rather than tuned away:

* **The loop's gain is 0.985** -- the exchanger returns the brine's volume
  less the leak -- so the plant's recovery is a knife edge on the
  high-pressure pump's flow (that pump moves the permeate plus the leak;
  a real train controls it to that).  Newton on the tear overshoots to
  unphysical trials the units refuse; Wegstein with `recycleWegsteinQmin
  -100` converges in five.
* **Stover's two ranges are not consistent under this definition at 47 %
  recovery**: 3 % mixing (the low end of his 3-6 %) already raises the
  feed's salinity 2.8 %, the top of the 1-3 % he quotes for that penalty.
* **The plant's first law is UNAVAILABLE on membrane01's component set**:
  NaCl carries no liquid heat capacity, so the energy report refuses as it
  does on membrane01, and the adiabatic mixer cannot price the join (the
  case declares it isothermal and the run says what that discards).  The
  brief asked for the plant residual to close; on this component set the
  engine can state nothing, and on an ion-written twin the pumps' useful
  work would still leave the documented pump residual.  The exchanger's own
  row closes by construction (T unchanged, Q = 0).

## The gate

`bin/curate/check_pressure_exchanger.py`: (a) the three balances recomputed
from the witness's result JSON, independently of the engine (volume, salt
by the volumetric mixing, pressure at the declared efficiency); (b) the
refusals by name on fixtures built from the witness (a missing parameter,
an out-of-range one, a vapour feed and a non-aqueous feed through the
acceptance contract); (c) the sizer's rotor count against
`ceil(Q_LP / rated)` and its NOT COSTED posture; (d) the sheet carries
every dimension with a unit, and the GUI fixture matches the sheet the run
just wrote.

## Rejected

* A default for any of the three device numbers (a maker's number, never
  a built-in).
* Mixing on a molar or mass basis (the maker quotes it on volume; the
  definition is stated once).
* Solving an energy balance across the device (it does no work and
  publishes none; dissipation is published beside, not put on a stream).
* Refusing an under-flushed duct inside a recycle (the path is not the
  answer: announced with the effective mixing instead).
* Pricing the item on a neighbour's Turton correlation (uncosted beats
  falsely costed).
* Drawing a rotor to a diameter the sheet does not carry.

## Not modelled, named

The rotor's hydraulics (speed, duct count, the HP and LP drops as functions
of flow -- what the efficiency summarises); the duct-by-duct unsteadiness;
any dependence of the mixing on flow imbalance or salinity; the ceramic's
wear; a Pelton-turbine alternative (C192 names it as a second case); the
motor and drive efficiencies.
