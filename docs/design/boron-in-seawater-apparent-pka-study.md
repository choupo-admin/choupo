# Boron in seawater: can ion association reach Dickson's apparent pK?

**Status: MEASUREMENT STUDY, 2026-11-02** (DEV.md 4c C198, the architecture
question left open by Stage 1).  No engine change, no corpus case change; the
scratch cases lived in a gitignored `data/local/` directory and are reproduced
inline in §6.

## 1. The question

The Stage 1 boron record (branch `backup/boron-stage1`,
`docs/design/boron-in-reverse-osmosis-proposal.md`, results section) reports an
engine APPARENT pK of boric acid of 9.118 at the first pass of
`swro01_campoDalias` (seawater lumped as NaCl, I = 0.593, Davies) against
Dickson's conditional pK*B = 8.597 (S 35, 25 C, total scale, mol/kg-solution),
and names three causes: Davies outside its band, no Mg/Ca/SO4 pairs with a
NaCl feed, and different pH scales.  The question for the architect: does the
ion-association route this tree already uses (thermodynamic K + Davies + ion
pairs, the `phreeqc.dat` posture) bring the apparent pK of boron in REAL
seawater close to Dickson's, or is Pitzer (or another route) needed?

## 2. What the sources hold (read 2026-11-02)

Both files: USGS `usgs-coupled/phreeqc3`, branch `master`, `database/`, US
Government work, public domain.  sha256 `phreeqc.dat`
`5b2caeaa37fc3547…e0487`, `pitzer.dat` `3c8ed68703a66115…e53d`.

**`phreeqc.dat`** -- one boric-acid dissociation, four fluoroborates, NO
sodium, magnesium or calcium borate association:

```
43:  B           H3BO3   0   B               10.81
153: H3BO3 = H3BO3
319: H3BO3 = H2BO3- + H+
320: 	-log_k -9.24
321: 	-delta_h 3.224 kcal
322: H3BO3 + F- = BF(OH)3-            (-log_k -0.4)
325: H3BO3 + 2 F- + H+ = BF2(OH)2- + H2O   (7.63)
328: H3BO3 + 2 H+ + 3 F- = BF3OH- + 2 H2O  (13.67)
331: H3BO3 + 3 H+ + 4 F- = BF4- + 3 H2O    (20.28)
```

No reference is written on lines 319-321.

**`pitzer.dat`** -- the boron set of its Pitzer databank, with the Mg and Ca
borate complexes as EXPLICIT species:

```
8:   B           B(OH)3  0   B               10.81
161: B(OH)3 + H2O = B(OH)4- + H+            log_k -9.239   delta_h 0 kcal
164: 3 B(OH)3 = B3O3(OH)4- + 2 H2O + H+     log_k -7.528   delta_h 0 kcal
167: 4 B(OH)3 = B4O5(OH)4-2 + 3 H2O + 2 H+  log_k -16.134  delta_h 0 kcal
170: Ca+2 + B(OH)3 + H2O = CaB(OH)4+ + H+   log_k -7.589   delta_h 0 kcal
173: Mg+2 + B(OH)3 + H2O = MgB(OH)4+ + H+   log_k -7.84    delta_h 0 kcal
-B0   511: B(OH)4- K+ 0.035      512: B(OH)4- Na+ -0.0427
      532: CaB(OH)4+ Cl- 0.12    538: Cl- MgB(OH)4+ 0.16
-B1   566: B(OH)4- K+ 0.14       567: B(OH)4- Na+ 0.089
-C0   624: B(OH)4- Na+ 0.0114
-THETA 657: B(OH)4- Cl- -0.065   658: B(OH)4- SO4-2 -0.012
-LAMBDA 688: B(OH)3 Cl- 0.091    689: B(OH)3 K+ -0.14
        690: B(OH)3 Na+ -0.097   691: B(OH)3 SO4-2 0.018
-ZETA 716: B(OH)3 Cl- H+ -0.0102 717: B(OH)3 Na+ SO4-2 0.046
-PSI  727: B(OH)4- Cl- Na+ -0.0073
```

(polyborate mixing terms 513-516, 568-569, 659-664, 692, 728-729 omitted: at
4e-4 mol/kg the polyborates are negligible.)  **No reference is written on any
boron line of `pitzer.dat`**; its reference list (lines 50-56: Appelo, Parkhurst
& Post 2014; Appelo 2015, 2017; Laliberté 2009) is cited by other lines only.
Felmy & Weare (1986) is the usual primary for this set and the tree's
`species/MgBOH4.dat` names it, but it was NOT read here and is not cited as the
source of any number in this study.

**A correction to the premise** "Pitzer has no boron parameters in the tree":
`data/standards/parameters/Pitzer/pairs/` already holds `Na-BOH4`, `K-BOH4`,
`CaBOH4-Cl`, `MgBOH4-Cl` (and the four polyborate pairs), equal to the lines
above, and `species/` holds `H3BO3`, `BOH4`, `CaBOH4`, `MgBOH4`.  What the tree
lacks is the mixing terms (theta, lambda, psi, zeta above) and the three
formation reactions (BOH4 is on the boron branch; CaBOH4 and MgBOH4 nowhere).

## 3. The reference seawater

Millero et al. (2008a), Deep-Sea Res. I 55:50, Table 4, as reproduced in the
TEOS-10 Manual (IOC Manuals and Guides 56, 2010), Table D.3 (mole fractions
X_j x 1e7; the paper itself was not read): Na 4188071, Mg 471678, Ca 91823,
K 91159, Sr 810, Cl 4874839, SO4 252152, HCO3 15340, Br 7520, CO3 2134,
B(OH)4 900, F 610, OH 71, B(OH)3 2807, CO2 86.  With S_R = 35.16504 g/kg and
M_S = 31.4038218 g/mol (Table D.4): 1.119769 mol solute/kg-solution,
0.964835 kg-H2O/kg-solution, so molality = X_j x 1.16058e-7:

| Na | Mg | Ca | K | Sr | Cl | SO4 | Br | F | DIC | B_T |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.48606 | 0.054742 | 0.010657 | 0.010580 | 9.40e-5 | 0.565765 | 0.029264 | 8.73e-4 | 7.08e-5 | 2.0380e-3 | 4.3116e-4 |

DIC = HCO3 + CO3 + CO2 of the table, entered on the HCO3 master.  B_T is the
brief's 4.16e-4 mol/kg-solution (= 4.3116e-4 mol/kg-H2O; the table's own
B(OH)3 + B(OH)4 gives 4.302e-4).  The total alkalinity of the reference
speciation is 2.304e-3 mol/kg-solution (HCO3 + 2 CO3 + B(OH)4 + OH).  The pH is
GIVEN (7.8, 8.2, 8.6), so the carbonate distribution follows and the
alkalinity is not imposed; the ratio studied here does not depend on it.

## 4. Scales, and Dickson's constant moved onto them

**The engine's pH** (read in code): `SpeciationSolver.cpp:2215`
`out.pH = solveH ? -std::log10(r.activity) : in.pH`, with `r.activity =
gamma_H * m_H` on the molality basis, and the scale string from the active
model (`AqueousActivity.cpp:120`: "free H+ activity, Davies charge-symmetric
single-ion convention"; `PitzerHMW.cpp:330`: "free H+ activity, single-ion
convention of the HMW parameterisation").  So engine pH = -log10(gamma_H,free
m_H,free), m in mol/kg-H2O.

**Dickson's constant** is a stoichiometric constant on the total scale,
K*B = [H+]_T [B(OH)4-]_T / [B(OH)3], mol/kg-solution, with [B(OH)4-]_T ALL
borate (paired included).  Evaluated with the expression transcribed in
`seacarb` R/Kb.R lines 40-44 (seacarb, GPL; it cites Dickson 1990): pK*B =
**8.5975** at S 35, 25 C.

The comparison is made on the one scale that needs no single-ion convention,
the FREE-scale stoichiometric constant on molality,
pK*F = -log10 m_H,free - log10(sum borate / H3BO3):

- total to free: [H]_T = [H]_F (1 + S_T/K_S) (seacarb R/kconv.R line 65), K_S
  of HSO4- by Dickson (1990) as transcribed in seacarb R/Ks.R lines 30, 47-53
  (free scale, mol/kg-solution), S_T = 0.14 Cl/96.062 = 0.028235 mol/kg-soln
  (Dickson et al. 2007, Table 2, as cited in seacarb).  K_S = 0.10030
  (pK_S 0.9987), 1 + S_T/K_S = 1.28150, log10 = **+0.1077**;
- kg-solution to kg-H2O: w = 1 - 0.001005 S = 0.964825 (the factor inside
  seacarb's lnK_S), log10 w = **-0.0156**;
- **Dickson, free scale, molal: pK*F = 8.5975 + 0.1077 - 0.0156 = 8.6896.**

On the engine's own activity scale the same constant reads
pK_app(Dickson) = pK*F - log10(gamma_H), with the model's gamma_H: 8.817 under
Davies (gamma_H 0.7452), 8.823 under the tree's HMW (0.7359).  The GAP is the
same number on both scales; only the free-scale column is independent of the
model's single-ion convention.

The Stage 1 gap of 0.52 decomposes: scales 0.220 (total to free 0.108,
solution to water -0.016, free concentration to activity 0.128) and model
0.297.

## 5. Results

25 C, pH given; every row at pH 8.2 unless marked (the Davies rows at 7.8 and
8.6 give the same pK to 0.001, as they must with a pH-independent pairing).
pK_app = pH - log10(sum borate / H3BO3), the brief's definition, engine scale.
f_pair = (CaBOH4 + MgBOH4) / all borate.

| variant | model | I | gamma_BOH4 | f_pair | pK_app (engine) | Dickson on that scale | pK*F (free, molal) | Dickson pK*F | gap |
|---|---|---|---|---|---|---|---|---|---|
| (a) NaCl + B, I 0.593 | Davies | 0.593 | 0.7394 | 0 | **9.118** | 8.821 | 8.987 | 8.690 | +0.297 |
| (a) NaCl + B, I 0.7226 | Davies | 0.723 | 0.7520 | 0 | 9.128 | 8.813 | 9.004 | 8.690 | +0.314 |
| (b) full seawater, no borate pairs | Davies | 0.659 | 0.7452 | 0 | 9.121 | 8.817 | 8.993 | 8.690 | **+0.304** |
| (c) (b) + CaBOH4, MgBOH4 (pitzer.dat K) | Davies | 0.659 | 0.7452 | 0.325 | 8.951 | 8.817 | 8.823 | 8.690 | **+0.133** |
| (a) NaCl + B | HMW, tree params | 0.723 | 0.5130 | 0 | 8.961 | 8.777 | 8.873 | 8.690 | +0.184 |
| (b) seawater*, no borate pairs | HMW, tree params | 0.721 | 0.5128 | 0 | 8.958 | 8.823 | 8.825 | 8.690 | +0.135 |
| (c) seawater* + pairs | HMW, tree params | 0.721 | 0.5128 | 0.239 | 8.839 | 8.823 | 8.706 | 8.690 | **+0.016** |
| (c) seawater* + pairs | HMW + pitzer.dat boron mixing terms | 0.721 | 0.4751 | 0.226 | 8.810 | 8.823 | 8.677 | 8.690 | **-0.012** |

\* carbonate-free (the tree's HMW set carries no Br/Sr seawater mixing, so Br
is folded into Cl and Sr into Ca; F and DIC omitted); network restricted to
water + the three boron reactions, which IS `pitzer.dat`'s posture (major ions
unpaired, Mg/Ca borate explicit).  Under Davies the 30-reaction curated network
ran (sulfate, carbonate, fluoride and hydroxide pairs of Na, K, Mg, Ca, Sr).
Sanity check: variant (a) at I 0.593 reproduces Stage 1's 9.118 exactly.

What the table says:

1. **Ion association with every Mg/Ca borate pair the public databases hold
   halves the gap and stops at +0.13.**  Variant (b) (full seawater, sulfate
   and carbonate pairs, Davies) is no better than NaCl (+0.304 against
   +0.297): pairing the MAJOR ions only changes I and gamma_BOH4 marginally.
   Adding the Ca/Mg borate complexes moves 32 % of the borate into pairs and
   takes 0.17 off.
2. **The residual is a sodium-borate interaction, and ion association has no
   record for it.**  Under HMW the same seawater WITHOUT the borate complexes
   is already at +0.135, because Na-B(OH)4 beta0 = -0.0427 drives gamma_BOH4 to
   0.51 against Davies' 0.75: log10(0.745/0.513) = 0.162, the size of the
   residual.  An ion-association equivalent would be a NaB(OH)4(aq) pair; it is
   in neither `phreeqc.dat` nor `pitzer.dat`, and no constant for it was read
   from any primary source in this study.
3. **Pitzer closes it with data the tree already holds**: the tree's four
   boron binaries plus the two pitzer.dat complexes give +0.016; adding the
   pitzer.dat boron mixing terms (theta, lambda, psi, zeta, all public domain)
   gives -0.012.  Both are inside the scale-conversion uncertainty (~0.01, from
   K_S and S_T).

Caveats: the HMW engine's own seawater gammas were found 2-4 % below the cited
bands for the divalent salts (`pitzer_seawater_verify` header, finding of
2026-08-10); the Mg/Ca borate constants are used under Davies outside the
databank they were fitted in (a cross-model use, said in the scratch records);
`pitzer.dat` states no primary for any boron line.

## 6. Recommendation

**Pitzer (pitzerHMW) is the route for seawater boron; ion association is not
enough, and the gap cannot be closed under Davies with data the tree can
legally hold today.**  Reasons:

- Ion association with the public Mg/Ca borate constants leaves +0.13 in pK
  (the borate fraction 23 % low at pH 8.2: 0.151 against 0.195), and the missing term is a Na-borate
  interaction no public ion-association databank carries.  Inventing a
  NaB(OH)4 constant, or fitting one to Dickson, would make the anchor the fit.
- The Pitzer route reaches Dickson to 0.02 with the boron binaries ALREADY in
  `data/standards/parameters/Pitzer/pairs/` plus three formation reactions and
  six mixing terms, all from `pitzer.dat` (public domain, a class the tree
  already admits).  Curating them is a data slice, not an engine slice: the
  engine read case-local theta/lambda/psi/zeta records for these species
  without change.
- Davies stays right where Stage 1 also uses it: the low-salinity second pass
  and brackish feeds, where neither the gap nor the Na-borate term is material.
- The records a seawater boron feed needs: `chemistry/BOH4-formation.dat`
  (branch), `CaBOH4-formation.dat` and `MgBOH4-formation.dat` (pitzer.dat
  170-175), and under `parameters/Pitzer/` theta BOH4-Cl, BOH4-SO4, lambda
  H3BO3-Na/K/Cl/SO4, psi BOH4-Cl-Na, zeta H3BO3-Na-SO4 and H3BO3-H-Cl.  Open
  before promotion: the primary behind these lines (Felmy & Weare 1986 to be
  READ), whether the BOH4 constant should be pitzer.dat's -9.239 (dH 0) or
  phreeqc.dat's -9.24 (dH 3.224 kcal) inside the Pitzer route, and the HMW
  divalent-gamma finding above.

## 7. The scratch cases (not committed; reproduced here)

Four cases under `data/local/boronSeawaterStudy/` (`swB`, `swC`, `swP1`,
`swP2`), each `<name>.cho`, `system/controlDict` (`application choupoProps;`),
`constant/thermoPhysPropDict` (`components ( water ); aqueousProperties {
activityCoefficients { model Davies|PitzerHMW; referenceBasis aqueousMolality;
} }`), run as `build/linux64Gcc/choupoProps .` on worktree commit 3c4cfeff4.

`swC/constant/chemistry/` (swB has only the first; swP1/swP2 add a copy of
`water-dissociation.dat`):

```
// BOH4-formation.dat -- copy of the boron branch record
species BOH4; masters ( { ion H3BO3; nu 1; } { ion H; nu -1; } ); nuWater 1;
      logK25 -9.24; dH 13489.2; source "USGS PHREEQC phreeqc.dat lines 319-321";
// CaBOH4-formation.dat
species CaBOH4; masters ( { ion Ca; nu 1; } { ion H3BO3; nu 1; } { ion H; nu -1; } ); nuWater 1;
      logK25 -7.589; dH 0; source "USGS PHREEQC pitzer.dat lines 170-172";
// MgBOH4-formation.dat
species MgBOH4; masters ( { ion Mg; nu 1; } { ion H3BO3; nu 1; } { ion H; nu -1; } ); nuWater 1;
      logK25 -7.84; dH 0; source "USGS PHREEQC pitzer.dat lines 173-175";
```

(each with `recordType aqueousSpeciation; schemaVersion 1;`).
`swC/system/propsDict` (swB identical without `CaBOH4 MgBOH4` in `diagSpecies`,
plus the two NaCl operations):

```
variables { T 298.15 K; }
operations
(
    { name sw_pH82; type speciate; temperature $T;
      analyticalTotals { Na 0.48606 mol/kg; Mg 0.0547421 mol/kg; Ca 0.0106568 mol/kg;
                         K 0.0105797 mol/kg; Sr 9.40071e-05 mol/kg; Cl 0.565765 mol/kg;
                         SO4 0.0292643 mol/kg; Br 0.000872757 mol/kg; F 7.07955e-05 mol/kg;
                         HCO3 2.03798e-3 mol/kg; H3BO3 4.3116e-4 mol/kg; }
      pH 8.2; diagSpecies ( H H3BO3 BOH4 CaBOH4 MgBOH4 ); output { file sw_pH82.csv; } }
    // the same at pH 7.8 and 8.6
);
// swB adds:
    { name nacl_I0593_pH82; type speciate; temperature $T;
      analyticalTotals { Na 0.593 mol/kg; Cl 0.593 mol/kg; H3BO3 4.3116e-4 mol/kg; }
      pH 8.2; diagSpecies ( H H3BO3 BOH4 ); output { file nacl_I0593.csv; } }
    // and nacl_Isw_pH82 with Na = Cl = 0.7226 mol/kg
```

`swP1/system/propsDict` (swP2 identical):

```
    { name sw_pH82; type speciate; temperature $T;
      analyticalTotals { Na 0.48606 mol/kg; Mg 0.0547421 mol/kg; Ca 0.0107508 mol/kg;
                         K 0.0105797 mol/kg; Cl 0.566638 mol/kg; SO4 0.0292643 mol/kg;
                         H3BO3 4.3116e-4 mol/kg; }
      pH 8.2;
      networkScope restricted;
      network ( water-dissociation BOH4-formation CaBOH4-formation MgBOH4-formation );
      reason "pitzer.dat posture: major ions unpaired, borate complexes explicit";
      diagSpecies ( H H3BO3 BOH4 CaBOH4 MgBOH4 ); output { file sw_pH82.csv; } }
    // sw_noPairs_pH82: network ( water-dissociation BOH4-formation )
    // nacl_Isw_pH82:   Na = Cl = 0.7226, network ( water-dissociation BOH4-formation )
```

`swP2/constant/parameters/Pitzer/` adds eight `recordType
electrolyteMixingParameter; schemaVersion 1;` records with the values of §2:
`theta/BOH4-Cl` (a BOH4; b Cl; -0.065), `theta/BOH4-SO4` (-0.012),
`lambda/H3BO3-{Cl,K,Na,SO4}` (n H3BO3; ion X; 0.091, -0.14, -0.097, 0.018),
`psi/BOH4-Cl-Na` (a BOH4; b Cl; c Na; -0.0073), `zeta/H3BO3-Na-SO4` (n H3BO3;
c Na; a SO4; 0.046), `zeta/H3BO3-H-Cl` (c H; a Cl; -0.0102); each `source`
names its pitzer.dat line.  That they were read is visible in the result:
gamma_BOH4 0.5128 -> 0.4751 and gamma_H3BO3 1.0000 -> 1.0076.

The arithmetic of §4 and §5 was done by two short Python scripts over the
`speciate` CSV outputs (m and gamma of H, H3BO3, BOH4, CaBOH4, MgBOH4); the
I column is the run's own `speciation: ... I =` line.
