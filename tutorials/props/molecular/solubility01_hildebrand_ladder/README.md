# solubility01 — one number for "like dissolves like", and where it stops

Seven liquids on a ladder of cohesive energy density, from hexane to water.

```
substance        delta      published    dev
                MPa^0.5      MPa^0.5
nHexane         14.8590      14.8700   0.07 %
cyclohexane     16.7336      16.7400   0.04 %
benzene         18.6482      18.7000   0.28 %
toluene         18.1838      18.2500   0.36 %
acetone         19.6732      19.7300   0.29 %
ethanol         26.3019      26.1400   0.62 %
water           48.2664      47.8600   0.85 %
```

## What is derived and what is checked

δ is **derived**, never stored: `sqrt((ΔHvap(T) − RT)/V_m)`, with the latent
heat from the Watson correlation the enthalpy legs already use.  Every input
is already in the component record, so a stored δ would be a second home for a
fact the record fixes — free to drift from it.

The **published** column is an *anchor*, not an input.  It is what ChemSep
computed independently, and its only job is to give the derivation something
to be wrong against.  Worst deviation here is 0.85 %.

That matters because the three ways this arithmetic fails are all silent:

* the `RT` term dropped — δ a few per cent high, and a solubility parameter
  has no intuitive magnitude to make that look wrong;
* `V_m` in the wrong unit;
* Pa^0.5 reported where the literature uses MPa^0.5 — a factor of 31.6, and
  the number still reads as a solubility parameter.

Same device as the Zc column in a property data bank: a redundant
determination turns a plausible wrong number into a visible disagreement.

## The lesson the last row teaches

Water's δ is 48.3, more than 20 MPa^0.5 from ethanol's — so the pairwise table
says water and ethanol should not mix.  They are miscible in all proportions.

That single row is the point of the case.  Hildebrand measures **how much**
energy holds a liquid together and says nothing about **what kind**: it
compressed dispersion, polarity and hydrogen bonding into one scalar, and
water is where the compression costs everything.  Ethanol (26.3) and
nitromethane (~25.1) sit almost on top of each other and behave differently
for the same reason.

The run states this on every call, not only when a pair looks close.  The
three-parameter Hansen split is what that needs; it is not implemented, its
parameters being a separate dataset this repository does not hold.

## Not established

Agreement with a published δ establishes the **arithmetic**.  It does not
establish that any substance behaves as the number suggests: nothing here is
tested against a measured miscibility, and the corpus holds no such data.
