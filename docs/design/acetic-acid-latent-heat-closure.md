# Acetic acid: closing the latent heat at Tb

*2026-11-02, DEV.md 4c C201 item 1.  A reading study done by a general (no
record, case or engine line changed by it); the architect's decision is §6.
Follows `docs/design/one-record-two-vapours-acetic-acid.md` §1-2.*

## 1. The question

The NBS liquid at 298.15 K (-484.5 kJ/mol), carried to Tb with the record's
heat capacities, the monomer ideal gas back, and the vapour priced as the
dimerised equilibrium mixture, gave 31.1 kJ/mol at Tb against the measured
24.39.  Which input is wrong?

## 2. Chao & Zwolinski, J. Phys. Chem. Ref. Data 7, 363 (1978) -- READ

(srd.nist.gov/jpcrdreprint/1.555571.pdf; page images checked for every number)

* Table 11 (p. 371), ethanoic acid MONOMER, 298.15 K: dHf -432.25, dGf
  -374.33 kJ/mol, log Kf 65.579; Cp 63.438 (298.15), 79.665 (400) J/(mol K).
* Table 12 (p. 372), ethanoic acid DIMER, 298.15 K: dHf -927.68, dGf -766.38,
  log Kf 134.265; 400 K: dHf -934.16, log Kf 92.740.
* Text p. 372: "Our selected value dHd = -15.10 kcal mol-1 at 298.15 K"
  (= -63.18 kJ/mol = -927.68 - 2(-432.25) exactly).
* Table 16 (p. 374): Keq of the equilibrium mixture 1.26 x 10^3 at 298.15 K,
  2.02 at 400 K; dimer mole fraction at 1 atm 0.972 (298.15), 0.502 (400).
  The mole fractions reproduce only with Keq = p_dimer / p_monomer^2 in
  atm^-1, the DIMERISATION direction.
* From Tables 11/12: log K_dim(298.15) = 134.265 - 2 x 65.579 = **3.107
  atm^-1** (3.104 from the dGf's).  dH(400) = -62.18 kJ/mol, so dCp_dim =
  +9.8 J/(mol K).

**Where 2.555 came from:** Table 4 (p. 367, METHANOIC monomer) log Kf 61.494,
dGf -351.00; Table 6 (p. 369, METHANOIC dimer) log Kf 125.543, dGf -716.59
-- exactly the numbers the record's 2026-08-24 adoption note quotes; Table 8
(methanoic) Keq at 298.15 K = 3.60 x 10^2 = 10^2.556.  The note's "the paper's
own formation properties give -63.80" is formic acid's too.  **The record
carried acetic acid's dH with formic acid's K: 3.5 times too small at 25 C.**

## 3. The other inputs

* Liquid Cp: the primary is Martin & Andon, J. Chem. Thermodyn. 14 (1982) 679
  (adiabatic calorimetry, 293-400 K), LOCATED through Zabransky, Ruzicka &
  Domalski, JPCRD 30 (2001) 1199, Table 44.2.1; NOT READ (paywalled).  Read
  instead from the local ThermoML cache: Dai, Li, Lei & Chen, J. Chem. Eng.
  Data 55 (2010) 1704, 135.5 (313.15 K) and 137.21 (333.15 K) J/(mol K),
  slope 0.086 J/(mol K^2), about 10 % above 123.1 at 298.15 K.  The
  temperature dependence is BRACKETED below, not settled.
* Latent heat at Tb: 24.38 kJ/mol at 117.4 C, J. C. Brown, J. Chem. Soc.,
  Trans. 83 (1903) 987, LOCATED via Slavchov, Mosbach & Kraft, c4e preprint
  190 (2017) p. 6; NOT READ.  Very likely the record's 24.39.
* At 298 K: Konicek & Wadso, Acta Chem. Scand. 24 (1970) 2612, calorimetric,
  51.6 kJ/mol on the monomer basis (located, not read); the NBS pair gives
  52.25, which agrees.

## 4. The closure

Tb = 391.05 K, Psat = 1.0145 bar (record Antoine); K = p_d/p_m^2;
p_m + p_d = Psat.

| term (kJ/mol) | record K (2.555) | Chao & Zwolinski K (3.107) |
|---|---|---|
| K_dim(Tb), bar^-1 | 0.842 | 3.065 (dCp 9.8 J/K; 2.94 with constant dH) |
| dimer share of molecules at Tb | 52.4 % | 72.7 % |
| mol dimer per mol vaporised | 0.262 | 0.364 |
| association heat at Tb | -16.56 | -22.64 |
| monomer basis, liquid Cp 123.1 | 47.67 | 47.67 |
| **apparent, Cp 123.1 constant** | **31.11** | **25.03** |
| apparent, 123.1 + Dai slope | 30.74 | 24.66 |
| apparent, Dai level | 29.71 | 23.63 |
| measured | 24.38 (Brown) | 24.38 |

Independent test at 298.15 K, where no Cp enters (Psat 0.02114 bar):
52.25 + n_d dH = 26.30 with the record's K, 23.71 with acetic acid's K;
the measured apparent heat there is 23.0-23.4 (compilations, cross-check).

## 5. Conclusion of the study

The wrong input is `logK25 2.555`, formic acid's constant on acetic acid's
dH.  With acetic acid's own constant the closure at Tb comes within 0.3-1
kJ/mol of the measured latent heat and within 0.3-0.7 kJ/mol at 298 K; the
liquid Cp's slope is the remaining uncertainty (0.4-1.4 kJ/mol) until Martin
& Andon is read.  Not wrong: the NBS liquid, the 24.39, dH -63.18, Watson.

## 6. The architect's decision (2026-11-02)

1. **Correct the record:** `vapourDimerisation { logK25 3.107; }` in atm^-1
   (the unit the reactive builder already uses, `ReactiveVLE.cpp` pEqAtm),
   dH -63180 unchanged; the 2026-08-24 adoption note is corrected in the same
   commit (it cites methanoic Tables 4/6 as ethanoic).  dCp is not added: the
   grammar has no field for it and its effect is <= 0.2 kJ/mol at Tb.
2. **As its own slice on `main`, before the associated-vapour slice:** it is
   a wrong number whether or not that slice lands, and alone it reaches only
   the reactive flashes that already price the dimer plus the sealed mirrors
   of the record (resealed, never re-imported wholesale).  Its moved rows are
   listed in its commit.
3. **Then** `backup/c201-acetic-vapour` is rebased on the corrected record and
   re-measured; the latent heat at Tb is expected near 25 kJ/mol and the
   aceticAcid02_plant duties near their goldens.  If they are not, that is
   reported before anything lands.
4. The lesson: **a value whose source is a table must be read off the table
   of the substance it names**; the gate that would have caught this
   recomputes the stored constant from the formation properties the record
   cites, so a gate arm holding logK25 = log Kf(dimer) - 2 log Kf(monomer)
   with the ethanoic table values is part of the slice.

## 7. Done (2026-11-03): item 1, 2 and 4 of §6

* `logK25 3.107` in the standards record and its five case mirrors (flash10,
  11, 12, 13, 17); the 2026-08-24 note is corrected in place.
* Moved rows, all from 3.5x more dimer: `dimer_share` and `p_dimer_atm` x3-3.5
  on every case, `p_eq_sum_atm` +0.05-1.2 %; flash13 V/F 0.5766 -> 0.5790, duty
  665.82 -> 667.95 kW, pH 4.981 -> 5.009; flash17 duty 0.08625 -> 0.08470 kW.
* Gate `check_dimerisation_constants` (item 4): the stored pair is recomputed
  from the ethanoic Tables 11/12; a mirror that drifts, or the formic 2.555,
  fails (sabotage: one mirror set back to 2.555 -> exit 1, two findings).
* **What it exposed:** flash17's first law, 0.6 W open under the wrong K, is
  2.2 W (2.546 % of its 0.085 kW exchange) under the right one.  Measured:
  with logK25 -9 (no dimer) it closes at 100.00 %.  The unit prices the
  dimer's association heat in its duty, the report prices the stream without
  it -- the seam §6 item 3 (the associated-vapour slice) closes.  Pinned in
  `check_energy_closure.KNOWN_OPEN` with that reason, so it may not grow.
