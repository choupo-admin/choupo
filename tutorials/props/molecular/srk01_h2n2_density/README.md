# srk01_h2n2_density — is SRK good enough for an ammonia synthesis loop?

`runCase tutorials/props/molecular/srk01_h2n2_density`

## The question

The green ammonia plant in `tutorials/plant/greenAmmoniaIndustrialN2` runs its
synthesis loop at around 200 bar and condenses its product near 250 K, and it
prices every stream with a **Soave–Redlich–Kwong** equation of state whose only
inputs are each component's critical temperature, critical pressure and acentric
factor. Two questions follow, and only the second one has an answer a student can
check:

1. Is that reasonable? — an engineering judgement.
2. **How far from measurement is it?** — a number.

This case produces the number.

## What it does

Sixteen `propertyPoint` operations, one per **measured** state of the
nitrogen + hydrogen binary, at exactly the temperature, pressure and composition
the experimenters reported. The engine computes the molar volume with the
plant's own declaration — SRK, van der Waals one-fluid mixing, and
`kij = 0`, which the run **announces** rather than assuming in silence:

```
SRK: no binaryInteractions declared -- all 1 binary pair(s) run kij = 0
     (predictive-degraded; curated pairs, where they exist, live in
     parameters/SRK/ ...)
```

The measurement sits beside it in `constant/evidence/`, cited to its primary
publication:

> R. Hernández-Gómez, D. Tuma, A. Gómez-Hernández, C. R. Chamorro,
> *Accurate Experimental (p, ρ, T) Data for the Introduction of Hydrogen into
> the Natural Gas Grid: Thermodynamic Characterization of the Nitrogen–Hydrogen
> Binary System from 240 to 350 K and Pressures up to 20 MPa*,
> J. Chem. Eng. Data (2017). [doi:10.1021/acs.jced.7b00694](https://doi.org/10.1021/acs.jced.7b00694)

## The exercise

Each operation reports `v_molar` in m³/mol. Turn it into a mass density with

    ρ = MW_mix / v_molar ,   MW_mix = x·MW(N₂) + (1−x)·MW(H₂)

using the molar masses in `data/standards/components/N2.dat` and `H2.dat`, and
compare it with the `rho` column of the evidence file. Then answer, in your own
words:

* Does the error grow with **pressure**? By how much between 50 and 200 bar?
* Does it grow with **nitrogen content**? Compare the x(N₂) = 0.50 ladder with
  the x(N₂) = 0.95 one — the errors have **opposite signs**. Why would a cubic
  equation of state overpredict one mixture and underpredict the other?
* SRK's parameters come from the pure components' critical points. The loop runs
  at 200 bar and 250 K. How far outside their fitting region is that?

## What this case does *not* claim

* It does **not** say SRK is wrong, and it does not offer a better model — this
  tree has none for this binary today.
* It does **not** test the loop's composition. The measured mixtures are
  nitrogen-rich (x(N₂) = 0.50, 0.90, 0.95); a stoichiometric synthesis gas is
  near 0.25, and the dataset holds **no point** between 0.19 and 0.31.
* It says nothing about **ammonia**, which is the strongly associating component
  the loop actually has to condense, and where a cubic equation of state is on
  much weaker ground than it is here.

## The number is nowhere in this folder

No file here records the agreement statistic. `bin/curate/check_srk_h2n2_aad.py`
recomputes it on every run of the suite, from this run's own output and this
case's own cited data, and refuses if it moves in either direction — a
transcribed agreement statistic is a second home for a fact the run owns, and it
goes stale silently.
