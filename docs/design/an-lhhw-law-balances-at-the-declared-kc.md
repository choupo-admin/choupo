# An LHHW law balances at the declared Kc

DEV.md 4c C185 item 7, 2026-10-31.  Code: `src/thermo/reaction/RateLaw.cpp`
(`netRate`, the `revBalance_` leg).  Gate:
`bin/curate/check_lhhw_detailed_balance.py`.

## 1. The defect

`RateLaw` writes one formula for the power law and for
Langmuir-Hinshelwood-Hougen-Watson.  With theta_i the bulk variable (here a
concentration: `reversible true` is refused on an activity basis) and

    abar_i = K_i(T) theta_i ,   K_i(T) = K0_i exp(B_i / T)   (K_i = 1 if i does not adsorb)

the net rate is

            k_f PROD_{nu<0} abar_i^{|nu_i|}  -  k_r PROD_{nu>0} abar_i^{nu_i}
    r  =   -------------------------------------------------------------------
                               ( v + SUM_ads abar_i )^p

with the forward orders at their mass-action values (|nu_i| on the reactants),
which is what detailed balance presumes on the power law as on LHHW.

Under `reversible true` the engine took k_r = k_f / Kc.  The net rate is zero
when

    k_f / k_r = PROD_i abar_i^{nu_i} = PROD_i K_i^{nu_i} . PROD_i theta_i^{nu_i}

so with k_r = k_f / Kc the law came to rest at

    PROD_i theta_i^{nu_i} = Kc / PROD_i K_i^{nu_i}

-- the declared equilibrium shifted by the product of the adsorption
constants, at exit 0, with a converged answer and a wrong conversion and duty.
The external review's case: A <-> B, Kc = 1, K_A = 1, K_B = 10, v = 1, p = 1,
k_f = 1; at c_A = c_B = 1 the rate is (1 - 10)/(1 + 1 + 10) = -0.75 where it
should be zero, and it vanishes only at c_B/c_A = 0.1.

The denominator is a common factor of both legs.  It sets how FAST the law
approaches equilibrium, never WHERE: it is not part of the defect and is not
touched.

## 2. The derivation

Kc is a statement about the bulk: at equilibrium PROD theta_i^{nu_i} = Kc
(`Reaction::equilibriumKc`, from the formation Gibbs energies).  Requiring the
net rate above to vanish exactly there fixes the reverse constant:

    k_r = k_f / ( Kc . PROD_i K_i(T)^{nu_i} )

This is the Hougen-Watson result read the other way round: when the surface
step is rate-determining, its equilibrium constant is written on the adsorbed
activities, K_s = k_f / k_r = PROD_i abar_i^{nu_i} at equilibrium, and
substituting abar_i = K_i theta_i gives K_s = Kc . PROD_i K_i^{nu_i}.  Every
adsorption equilibrium
the step leans on is in it, so a temperature-dependent K_i (B_i != 0) moves k_r
with T exactly as the bulk equilibrium requires.

Three consequences, each held by the gate:

* **No reacting species adsorbs => k_r = k_f / Kc, bit for bit.**  The product
  is over species with nu_i != 0 and K_i != 1; the power law takes its own
  path and was not edited at all.  Every reversible case in the corpus is a
  power law (measured 2026-10-31: 11 files declare `reversible true`, none of
  them carries an `adsorption` block).
* **A spectator that adsorbs (nu_i = 0) does not enter k_r.**  It slows the
  law through the denominator and leaves the equilibrium where it was.
* **An explicit `A_rev`/`Ea_rev` pair is unchanged.**  Such a pair is regressed
  on the adsorbed activities by the paper that reports it (Popken et al. 2000,
  Eq 16, in `cstr07`/`batch07`), and its equilibrium is whatever the authors'
  k_1/k_-1 and K_i make it -- a claim of the paper, which a case can check
  against Kc, not one the engine may rewrite.

## 3. What was measured

* Reach: `grep -rlE 'reversible\s+true'` over `tutorials/` and `data/`, then
  the intersection with files carrying `adsorption`: empty.  The three LHHW
  cases (`cstr07_lhhw_methylAcetate`, `batch07_lhhw_methylAcetate`,
  `ctrl07_lhhw_inhibition`) declare no `reversible true`.  So the fix moves
  no golden; the defect was reachable only by a case nobody had written yet.
* Reproduction: the gate run against the parent commit's `RateLaw.cpp`
  (a84aa7922) fails arm (a) on every adsorbing law at every temperature, the
  residual at the declared Kc being exactly |1 - PROD K_i^nu_i| of the forward
  leg: 0.900 with K_CO = 10 (shift 0.1), 3.000 with K_CO2 = 4 (shift 4), 0.667
  on the saturated resin form (shift 5/3), 1.72 / 4.40 / 6.91 at 500 / 700 /
  900 K on the van 't Hoff law (shifts 2.72 / 5.40 / 7.91).  Arm (b) fails too
  wherever the shift exceeds the factor-2 bracket: the old law does not even
  point toward Kc from both sides.  The power law and the explicit reverse
  passed arm (c) on the parent code, as they must.
* A second sabotage, dividing out the PRODUCTS' factors only, fails arm (a)
  on the reactant-adsorbing laws -- the division has to run over every
  species with nu_i != 0.
* The fix: arm (a) holds every reversible law at |r|/r_f <= 1e-12 at
  PROD c^nu = Kc over 500/700/900 K, with adsorption on reactants only,
  products only, both, and all four species with van 't Hoff dependence;
  arm (b) the sign on both sides; arm (c) the power law and the explicit
  reverse equal to their recomputation with ==.

## 4. Non-mass-action orders under detailed balance: refused (the ruling)

If a reactant's `order` is not |nu|, a product carries a forward `order`, or
an `orderRev` is not nu, the zero of the derived law is not at Kc on EITHER
path, the power law included.  The architect ruled on 2026-10-31 that this
combination is REFUSED BY NAME: a law that cannot reach its own declared
equilibrium is a wrong answer at exit 0, and the legitimate way to write a
non-elementary mechanism is an explicit reverse leg (`A_rev`/`Ea_rev` with its
`orderRev`, or a `type expression` law with `forward` and `reverse`).

ONE home, `Reaction::refuseNonMassActionDetailedBalance`, beside the
liquid-basis refusal; it reads the reaction's own `stoichiometry` entries, so
only a DECLARED key can trip it.  Its callers are every reader that derives
the reverse leg from Kc (measured 2026-10-31 by grepping `"reversible"` in
`src/`): `RateLaw::fromDict` (the `reactions ( ... )` path of `cstr` and `pfr`,
`dynamicCSTR`, the batch vessel's factory laws), the single-reaction `cstr`
and `pfr`, and the batch vessel's own forms (Arrhenius, modified Arrhenius,
third body, fall-off).  `ExpressionRate` refuses `reversible` outright and
`dynamicCSTR` sends every reversible reaction to `RateLaw`, so neither needs
a call.  Corpus reach, measured on every explicit `order`/`orderRev` under
`reversible true` in `tutorials/` and `data/`: none refuses.

## 5. Not done, named

* **A reactor integrating to the zero.**  The gate holds the law; that a
  `cstr`, `pfr`, `batchReactor` or `dynamicCSTR` integrates to it is the
  reactor's, and no witness case was added because none reaches the path.
