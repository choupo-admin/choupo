# ed08 — a red wine stabilised on a conductivity target

A new medium red wine, supersaturated in potassium bitartrate (KHT), passes
once through **Vítor Geraldes' own 100-cell-pair, 50 m² Eurodia stack** at
its design flow of 3000 L/h, and the case asks for what a cellar measures:
**remove 20 % of the wine's electrical conductivity.**  Choupo solves the
current.

```
operation
{
    stack                      EurodiaED-100P-50;
    membrane                   CMX_AMX;
    targetConductivityRemoval  0.20;      // the third operating form, first used here
    xi                         0.9;
    E_electrodes               2.0;
}
```

## Ethanol is not in the feed — read this first

The wine carries about 13.5 % v/v ethanol (106 g/L) and the stack cannot be
told so: declaring `ethanol` refuses (`aqueousMapping: component 'ethanol'
declares no aqueous mapping`), because every non-water component must be an
aqueous species.  The solvent is therefore priced as **pure water**.  What
that costs was *computed* with the engine's own route, not cited: a
`propertyScan1D` of `viscosity_liquid` on {water 0.955, ethanol 0.045} against
pure water (Vogel per component, the package's Grunberg–Nissan mixing rule)
gives **μ_mix/μ_water = 1.0084 at 20 °C** — 0.8 %.  That number is a lower
bound on the truth: the mixing rule has no binary term, interpolates between
the two pure viscosities and can never sit above both, while a water–ethanol
mixture can.  Mobilities and conductivities scale with 1/μ, so κ_in and κ_out
are overestimated by whatever the real factor is; the **relative** target is
insensitive to a common factor, the **absolute** voltage and power are not.
Named and not built: a neutral co-solvent carried through the mass balance and
priced into the solvent viscosity.

## The wine

Every value is chosen inside a published range and the flowsheetDict header
carries the full table.  The one coherent primary, read in full: Sirén, Sirén &
Sirén, *Anal. Chem. Res.* 3 (2015) 26–36, Table 2 (eight Pinot Noir reds,
12.5–14.5 % alcohol, pH 3.51–4.02).  Chosen: K⁺ 1000, Na⁺ 120, Ca²⁺ 50, Mg²⁺
100, Cl⁻ 40 mg/L; phosphate 650 mg/L (as HPO₄); tartaric 1.80, malic 0.25,
lactic 2.30 g/L; pH 3.60; 20 °C.  Speciation at pH 3.60 with NIST-primary pKa
(tartaric 3.036/4.366, malic 3.459/5.097, phosphoric 2.148/7.200; lactic 3.862
quoted through Mauger 2017) puts 69 % of the tartaric acid in HT⁻ and 12 % in
T²⁻, 57 % of the malic in HMal⁻, 35 % of the lactic in lactate and 97 % of the
phosphate in H₂PO₄⁻; the neutral acids (19 % of the tartaric, 41 % of the
malic, 65 % of the lactic) carry no current and are left out.

**Electroneutrality is closed on sulfate**, the one measured anion the source
itself contradicts by an order of magnitude (IC 21–53 mg/L against a total-
sulfur column allowing up to 755 mg/L as sulfate): cations 41.77 meq/L, anions
28.98, the 12.79 meq/L gap assigned to SO₄²⁻ = 6.40 mmol/L = 614 mg/L
(1.11 g/L as K₂SO₄, just above the OIV 1 g/L limit — so not all of the missing
charge is really sulfate).  A named adjustment of a stated size, never a
silent one.

## Six ions had no D0, and the engine now says so

K, Na, Ca, Mg, H, Cl and SO₄ carry curated D0 in the catalogue; HTart, Tart,
H₂PO₄ do not, and HMal, Mal and Lactate have no species record at all.  They
are declared **case-locally** under `constant/species/`, each
`origin estimated; reviewStatus unverified;` with the method (Stokes–Einstein
on a crystal-volume radius from `potassiumBitartrate.dat`'s own density, scaled
by molar mass for the malates and lactate; H₂PO₄⁻ equal to the isosteric
sulfate) and a note naming the primary to verify against.  The run prints

```
[estimate] species 'HTart': `D0` = 7.568e-10 m2/s is an ESTIMATE (Stokes-Einstein at 298.15 K ...), reviewStatus unverified -- Verify against Marsh, Spiro and Selvaratnam, J. Phys. Chem. 67 (1963) 699-703 ...
```

six times, and the caveat block repeats them: that announcement was **added
for this case** — the species bridge had been dropping the provenance block,
so an estimated D0 was read in the same silence as a measured one.

## What to read off the log

```
[solve I] targetConductivityRemoval 0.2000  ->  I = 1.4583 A  (kappa_in = 0.5003 S/m, kappa_out = 0.4002 S/m; Newton, 2 it, residual 5.5e-15; seed 1.3300 A from the linear slope at 1.0000 A)
  I        = 1.458 A  (solved for targetConductivityRemoval)
  i (dens) = 2.92 A/m2
  i_lim    = 207.39 A/m2  (model GeraldesAfonso2010, default; set by anion-exchange membrane)
  i/i_lim  = 0.014
  U        = 5.476 V
  P=U*I    = 0.008 kW
  demin    = 6.3821 %  (ion K)
```

**The answer:** κ 0.5003 → 0.4002 S/m, I = 1.458 A, U = 5.48 V, P = 8.0 W
(0.0027 kWh/m³), i/i_lim = 0.014 with the limiting current *predicted*
(GeraldesAfonso2010 engaged: a stack record, both ion signs, every ion with a
D0; D corrected to 20 °C by the factor 0.874).  Vítor's machine at 20 % removal
on this wine is nowhere near its limiting current on this model.

**Two findings about the unit, which this feed exposes and the case prints:**

1. **The Faraday split is a single-salt idealisation.**  Every counter-ion
   loses ξIN/(|z|F) mol/s regardless of its concentration: 1.632 mmol/L from
   each monovalent ion.  K⁺ falls only 6.4 % while H⁺, Cl⁻, HMal⁻ and Mal²⁻ are
   removed *entirely* (the cap binds four times; `[WARNING] ... capped at the
   available inflow`).  Charge is not conserved: 5 cations and 8 anions each
   lose the same equivalents, so the **diluate outlet carries +3.64 meq/L of
   net charge (+5.5 % of its ion equivalents)** — the finding CLAUDE.md records
   as "not charge-balanced on a feed of mixed valence", 1.8 % on ed04's three
   ions, 5.5 % here on thirteen.  RESERVED for Vítor, not fixed.  A
   transport-number split, computed by hand from the t_lim values the run
   itself prints (K 0.746, SO₄ 0.337, lactate 0.202, …), would need
   **I = 6.68 A, 4.6× the equal-share answer**, at i/i_lim = 0.064.
2. **κ_in = 5.0 mS/cm is too high** (instruments read 1.5–3 on such wines):
   infinite-dilution λ°, pure-water solvent, and a D0 at 25 °C divided by RT at
   20 °C — the Stokes–Einstein correction the limiting current receives is not
   applied to κ.  An engine inconsistency, named in the design record and not
   fixed here (it moves every ED golden).

**The motive, quantified with its approximations.**  Berg & Keefer (1958,
Table 1 via the AWRI) give KHT's solubility at 20 °C as 2.77 g/L in 12 % and
2.51 g/L in 14 % ethanol → 13.68 mmol/L at 13.5 %; a saturated solution sits
at pH (pK1+pK2)/2 = 3.70 with α₁ = 0.698, so Ksp' = [K⁺][HT⁻] ≈ 130.7 mM²
(water pKa, no activity correction).  Feed: 212.4 mM², **S = 1.62**.  After the
run: 159.7, **S = 1.22** — still supersaturated on paper, because the
equal-share split takes only 6.4 % of the potassium; under the
transport-number split S ≈ 1.09.  The trade's criterion is the mini-contact
test, not this product, and Berg & Keefer report KHT precipitating far more
slowly from wine than from alcohol–water.

**The brine.**  A KHT solution at 20 mmol/L, 76 % of KHT's 20 °C water
solubility — the ceiling a wine-ED concentrate loop is bled to stay under.  A
twin at 10 mmol/L gives the *same* I (the target is the diluate's alone) and
U = 3.13 V instead of 5.48 (back-EMF and concentrate resistance).

## What is pinned and what is not

The golden pins this model's answer, including the three conductivity KPIs.
Nothing here is validated against a measured wine: every ion is a chosen
value inside a published range, six diffusivities are announced estimates, the
sulfate is a closure, the pKa are water values, and the unit's transfer model
is the one the two findings above describe.
