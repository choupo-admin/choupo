# DESIGN.md -- benzene/toluene flash (round 1, approved by the student)

## 1. Goal
Separate 100 kmol/h of 40/60 mol% benzene/toluene into a benzene-rich vapour and a toluene-rich liquid in one flash.

## 2. Components
benzene, toluene (both catalogue names).

## 3. Thermodynamics
gammaPhi with ideal liquid (Raoult) and ideal-gas vapour: similar aromatics at 1 bar.

## 4. Topology
feed -> flash01 (isothermalFlash) -> liquid, vapor. Inlet: feed. Products: liquid, vapor.

## 5. Specification per unit
flash01: T = 370 K and P = 1 bar fixed; the engine computes V/F, compositions and the duty. Feed fixed by T and P (2 intensive variables).

## 6. Expected results
370 K lies between bubble (~368 K) and dew (~374 K): V/F about 0.3, vapour benzene-rich (~0.6).

## 7. Left out
Pressure drop, heat losses, non-ideality (negligible for benzene/toluene).

## 8. Revisions
(none yet)
