# DESIGN.md -- water/water heat recovery (round 1, approved by the student)

## 1. Goal
Cool 100 kmol/h of hot water (360 K) by heating 120 kmol/h of cold water (300 K) in a counter-current exchanger.

## 2. Components
water.

## 3. Thermodynamics
Liquid water, ideal; only sensible heat matters.

## 4. Topology
hot, cold -> hx (heatExchanger) -> hotOut, coldOut. Inlets: hot, cold. Products: hotOut, coldOut.

## 5. Specification per unit
hx: area 10 m2, U 500 W/m2/K, counter-current fixed; the engine computes duty and both outlet temperatures (epsilon-NTU rating).

## 6. Expected results
NTU about 2.4, effectiveness about 0.75, Q about 93 kW, hot out about 315 K, cold out about 337 K.

## 7. Left out
Fouling, pressure drop, heat losses.

## 8. Revisions
(none yet)
