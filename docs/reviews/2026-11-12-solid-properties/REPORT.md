# Review by measurement: what exists for the properties of solids

Date: 2026-11-12.  Reviewed at main d52dcb9465.  A survey asked for before an
architecture decision, not the review of a landed slice: how far the engine
and the catalogue are from three candidate rules.  The reviewer changed no
tracked file; `run_all_probes.sh` and `solid_catalogue_census.py` regenerate
the tables.

The three rules put to the measurement:

* **R1** each pure solid is well described: crystal density, heat capacity,
  formation enthalpy, and melting point with heat of fusion where it melts.
* **R2** a mixture of solids is a mechanical mixture: mass, enthalpy and
  volume add, with no parameter.
* **R3** bed and bulk properties (bulk density, porosity, angle of repose,
  equilibrium moisture) are declared by the case with a source, never
  computed.

## 1. The catalogue

80 of 687 component records are solid-bearing.

| field | present | absent |
|---|---|---|
| a crystal density the engine reads | 20 | 60 |
| shape factor `k_v` declared | 5 | 75 |
| solid heat capacity | 16 | 64 |
| formation enthalpy, direct | 17 | |
| formation enthalpy, ion-derived only (NaCl, KCl, NaOH) | 3 | |
| no formation route | 60 | |
| melting temperature | 0 | 80 |
| heat of fusion | 0 | 80 |
| bulk density, porosity, angle of repose | 0 | 80 |

Most of the 64 records with `solidPhases {}` are minerals used only for
saturation indices and carry nothing else.

## 2. The engine

* **A pure solid's enthalpy** is `s_i h_formation(T, solid)`: the record's
  formation datum plus the integral of its solid heat capacity.  Checked by
  hand on `mill01` (1.820000083 kW against 1.82000008287) and `cyclone02`.
  With no solid heat capacity the liquid one is used and ANNOUNCED; with no
  formation datum the run REFUSES.  Neither is silent.
* **Two solids in one stream** are carried per component; mass and enthalpy
  add.  An adiabatic mixer of silica at 300 K and calcite at 400 K gives
  366.293259541 K against 366.29326 K by an independent bisection.  R2 holds
  for mass and enthalpy.
* **Volume and density** have no single rule: the spray dryer adds volumes
  and says so; the cyclone and the pneumatic conveyor take a mass-weighted
  arithmetic mean and say nothing (SP-05).
* **Bulk properties**: the only declared-with-source key is the batch plan's
  `bulkDensity` (refuses when absent).  The GAB sorption isotherm is read
  off the component record with no required source.  There is no angle of
  repose and no bed porosity for a solid.
* **Size**: one distribution per stream for its whole solid phase.

## 3. Against the three rules

| rule | exists | missing | smallest change |
|---|---|---|---|
| R1 | 16-17 records with density, heat capacity and formation datum; exact pricing; refusal on a missing datum | density on 60 of 80; no melting point or heat of fusion on any solid; salt crystals not priceable on a stream (SP-10); polymer data in fields nothing reads (SP-08) | one read field each for melting temperature and heat of fusion; the ion-derived solid formation enthalpy routed into the stream pricing |
| R2 | mass and enthalpy additive, verified by hand | one density rule; a missing density refused instead of counted as zero | one "volumes add" mixture density in one place, called by the three units |
| R3 | `bulkDensity` on a batch plan; a case-local isotherm | angle of repose, bed porosity; a required source on the isotherm | one case-level declared block, each value with source and reason |

## 4. Findings (full text in `findings.tsv`; each reproduced twice)

* **SP-01 (S1)** in the cyclone and the pneumatic conveyor a solid with no
  density enters the mass-weighted density as ZERO while its mass enters the
  denominator (`Cyclone.cpp`, the particle-density loop; read again by the
  commander).  Probe, silica + graphite at equal mass: 2650 -> 1325 kg/m3,
  cut size 1.110 -> 1.570 um, efficiency 0.880 -> 0.836, nothing announced.
* **SP-02 (S2)** the spray dryer assumes 1500 kg/m3 when the record has no
  density, in silence.
* **SP-03 (S2)** `k_v` defaults to pi/6 in silence (15 records).
* **SP-04 (S2)** a GAB isotherm missing C or K gives zero equilibrium
  moisture in silence.
* **SP-05 (S2)** three density-mixing rules across units; the cyclone
  separates every solid on one efficiency curve.
* **SP-06 (S2)** a crystal above its melting point is still priced as a
  solid (sucrose at 520 K).
* **SP-07 (S3)** the mixer calls solids-only inlets "liquid inlets".
* **SP-08 (S3)** six polymer records declare a density nothing reads.
* **SP-09 (S3)** a comment counts 16 pure-solid records with a solid heat
  capacity; there are 17 and one has none.
* **SP-10 (S3)** the ion-derived salt formation enthalpy does not reach the
  stream pricing, so salt-crystal energy balances read UNAVAILABLE
  (announced).

## 5. Not examined

Whether any shipped case meets SP-01, SP-02 or SP-04 (every probe was a
modified copy); the pneumatic conveyor by running; the bag filter, the
splitter, the batch dryer and crystalliser, the time-integrated binaries;
two solid phases in `phases {}`; the solid entropy route.
