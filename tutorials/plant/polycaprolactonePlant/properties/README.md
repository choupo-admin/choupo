# properties — close the loop on the PCL plant (process → property)

A `choupoProps` sub-case of [`../`](..) (the polycaprolactone plant). The plant
gives you the chain statistics from the kinetics (Mn / Mw / PDI); here you
estimate the polymer's **physical property** — the glass transition **Tg** — from
the **same** repeat unit `-[O-(CH2)5-CO]-` (`M0 = 114.14`, the exact number the
reactor used for `Mn = M0/(1-p)`).

```bash
runCase tutorials/plant/polycaprolactonePlant/properties
```

* **Tg via Yang 2020** (CC-BY) — runnable. `Tg(inf) = 85.8 K`; the console prints
  the **−59.7 %** deviation from the measured ~213 K (an honest limit of an
  additive scheme on a flexible aliphatic polyester). `M0 = 114` is goldened (an
  exact mass-balance fact); `Tg` is shown but not goldened as validated physics.
* **Density via Van Krevelen** — *not* runnable on PCL with the shipped data (the
  Slice-1 group set has no ester `-O-`/`-CO-` group, so it would hard-error rather
  than invent a value). See the full explanation and the runnable hydrocarbon
  example linked from the parent [`../README.md`](../README.md).

The full teaching narrative lives in the parent README. See
[`system/propsDict`](system/propsDict) for the exact group decomposition and the
estimator invocation.
