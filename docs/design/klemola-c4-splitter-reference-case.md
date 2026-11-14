# The Klemola–Ilme C4 splitter: an industrial distillation anchor

**Status:** transcription record + case specification. The case itself
(`column14_klemola_c4_splitter`) is built against THIS document; nothing in the
case may carry a number that is not here, and nothing here may be a number the
paper does not publish.

**Primary, and the only source used:**

> Klemola, K. T.; Ilme, J. K. *Distillation Efficiencies of an Industrial-Scale
> i-Butane/n-Butane Fractionator.* Ind. Eng. Chem. Res. **1996**, 35 (12),
> 4579–4586. IE960390R.

One coherent primary, end to end — the cavett01 / Williams–Otto rule. No number
below is blended with any other source, and where the paper is silent this
document says so rather than filling the hole from elsewhere.

---

## 1. Why this column, and what it is for

The corpus has sixteen distillation tutorials and **not one of them is anchored
on measured reality**: they are self-recorded goldens, and the closest thing to
an external anchor (`acetone06/07_luyben_column`) compares Choupo against
*another simulation*. This case is the first distillation anchor against a real
column: 74 real trays, 2.9 m diameter, plant data reconciled by the authors.

What it puts under test is the **column model** — the MESH solve, the tray
efficiency, the energy balance — rather than an activity model, because the
system is nearly ideal. That is a feature: a disagreement here cannot be blamed
on thermodynamics and then forgotten.

---

## 2. Transcription — Table 1, Column Specifications

| quantity | value |
|---|---|
| column height | 51.8 m |
| column diameter | 2.900 m |
| number of trays | 74 |
| type of trays | two-pass Ballast V-1 valve |
| weir length (side) | 1.859 m |
| weir length (center) | 2.885 m |
| liquid flowpath length | 0.967 m per pass |
| active area | 4.9 m² |
| downcomer area (side) | 0.86 m² |
| downcomer area (center) | 0.86 m² |
| tray spacing | 0.600 m |
| hole diameter | 39 mm |
| total hole area | 0.922 m² |
| outlet weir height | 51 mm |
| tray thickness | 2 mm |
| number of valves per tray | 772 |
| free fractional hole area | 18.82 % |

## 3. Transcription — Table 2, Performance Data (Product Flow Rates Adjusted)

| quantity | value |
|---|---|
| feed tray | 37 |
| feed flow rate | 26234 kg/h |
| bottoms flow rate | 18119 kg/h |
| distillate flow rate | 8115 kg/h |
| reflux flow rate | 92838 kg/h |
| reflux temperature | 18.5 °C |
| column top pressure | 658.6 kPa |
| feed pressure | 892.67 kPa |
| boiler duty | 10.240 MW |

Composition, **wt %** (the paper's own units and its own rounding):

| component | feed | top | bottoms |
|---|---|---|---|
| propane | 1.5 | 5.3 | 0.3 |
| i-butane | 29.4 | 93.5 | 0.3 |
| n-butane | 67.7 | 0.2 | 98.1 |
| 1-butene | 0.2 | 0.4 | 0.1 |
| i-butene | 0.2 | 0 | 0 |
| trans-2-butene | 0.1 | 0.6 | 0.1 |
| neopentane | 0.1 | 0 | 0.2 |
| i-pentane | 0.8 | 0 | 1.1 |
| n-pentane | 0.1 | 0 | 0.1 |

## 4. Transcription — the efficiency results the paper OBSERVES

From the text (p. 4580) and Table 4's `industrial data` row:

* ideal-tray simulation reproducing the measured products: **88 ideal trays**
  plus a total condenser and a reboiler;
* actual trays 74 → **overall column efficiency 118.9 %**;
* average observed **NTU_ov 1.71**, **point efficiency E_ov 81.6 %**, **Murphree
  tray efficiency E_mv 119.1 %**.

The paper's own model, stated so the case can MIRROR it rather than substitute
one: liquid activity coefficients by **UNIFAC**, vapour pressures by
**Antoine**, vapour fugacity by the **original Soave–Redlich–Kwong**. All three
are public in this tree, so no comparison here hides a model swap.

A Murphree efficiency **above 100 %** is not an error: on a large cross-flow
tray the liquid is not well mixed, and the vapour leaving can be richer than
equilibrium with the *outlet* liquid. Any Choupo path that silently clamps
E_mv ≤ 1 would be answering a different question — check before relying on it.

---

## 5. What the paper does NOT publish, and the doctrine's answer

Named here so no one has to rediscover them, and so no case invents them.

1. **No measured tray temperature profile, and no measured tray composition
   profile.** The figures are *efficiency* profiles from the back-calculation.
   So this anchor is an **endpoint** anchor — it tests what a column model
   predicts at its two products, not what it predicts inside. The internals
   remain unanchored, and the natural second case (a different primary, never
   blended into this one) is Vogelpohl's total-reflux profiles.
2. **The feed thermal state is absent.** Table 2 gives the feed *pressure*
   (892.67 kPa) and no feed temperature. The case must therefore DECLARE an
   assumption — saturated liquid at the feed pressure is the natural one — and
   announce it in its own header as an assumption, not as data.
3. **No tray-by-tray pressure profile.** Only the column top pressure
   (658.6 kPa) is given; the feed pressure is a line pressure, not a tray
   pressure. A declared linear profile or a single pressure must be announced
   the same way.
4. **The rounded compositions do not close per component.** Computed from the
   table itself (all figures rounded to 0.1 wt %):

   | component | in, kg/h | out, kg/h | discrepancy |
   |---|---|---|---|
   | i-butane | 7712.8 | 7641.9 | −0.9 % of feed i-butane |
   | n-butane | 17760.4 | 17790.9 | +0.17 % |
   | propane | 393.5 | 484.5 | +23 % |
   | i-butene | 52.5 | 0.0 | −100 % |

   The overall balance closes exactly (18119 + 8115 = 26234 — the authors say
   the product rates were *adjusted*), and the two **key components close to
   about 1 %**, which is what matters for a key-component anchor. The traces do
   not close at all, and cannot: 0.1 wt % resolution on a 0.2 % number is ±25 %
   before anything physical happens. **Anchor rows therefore belong on the keys,
   with a band that states the table's own rounding**; a trace-component anchor
   would be measuring the printing, not the column.

---

## 6. The case shape

**Specified** (each number from §2–§3, provenance stated per line in the case
header): 74 real trays, feed on tray 37, total condenser and reboiler; feed
26234 kg/h at the Table-2 composition, thermal state per the declared
assumption; column top pressure 658.6 kPa; and the two operating specs —
**distillate 8115 kg/h** and **reflux 92838 kg/h**. Murphree efficiency
**1.191** as a MEASURED INPUT. Thermo: UNIFAC + Antoine + SRK, mirroring the
paper.

**Predicted:** the two product compositions, the two duties, the temperature
profile.

**Compared (anchor rows):** distillate and bottoms **i-butane and n-butane**,
against the Table-2 measurements, with the band set by the rounding computed in
§5.4. Second arm, and it is the pedagogical payload: the same column at
**E_mv = 1.0** — the gap between the two says how much of this separation the
efficiency is carrying.

**Stated as NOT portable, up front:** the efficiency itself is an input, not a
prediction. Predicting it needs a rate-based or computed-efficiency model of a
multicomponent VALVE-tray column with a feed, which Choupo does not have: its one
rate-based model (`model rateBased;`, 2026-11-14) is a binary packed bed at total
reflux, and no valve-tray correlation is in the tree (C329 part 2, design record
`docs/design/c329-ratebased-at-general-reflux.md`, sections 6 and 7); the paper spends its
own length on exactly that difficulty, and Table 4 shows ten published methods
disagreeing across a factor of five. Tray hydraulics beyond what the MESH needs
are transcribed in §2 for the reader and used by nothing.

---

## 7. What a PASS on this case would and would not mean

It would mean: the MESH solve plus a declared efficiency reproduces an
industrial column's products from its own specification, on public
thermodynamics. It would **not** mean the internals are right (nothing here
measures them), nor that Choupo could have predicted the efficiency, nor that
the trace components are modelled well — §5.4 forbids that last claim before
the case is even built.

---

## 8. Status of the anchors (C239, 2026-11-08)

The rows promised in §6 are authored, in the case's `expected` (claim column
`anchor`), and the case is named in `verification-and-validation.md` §3 A.
Compared quantities are **mole fractions** (what the result publishes),
converted from Table 2's wt % with each component's own MW; the bottoms column
sums to 100.3 wt % and is normalised.

| quantity | measured (Table 2) | model | verdict |
|---|---|---|---|
| distillate i-butane, mol fraction | 0.919174 (93.5 wt %) | 0.923299 | ANCHOR, +0.45 %, band 1 %: in |
| bottoms n-butane, mol fraction | 0.979722 (98.1 wt %) | 0.982032 | ANCHOR, +0.24 %, band 1 %: in |
| distillate n-butane, mol fraction | 0.001966 (0.2 wt %) | 0.001098 | OPEN, 44 % low |
| bottoms i-butane, mol fraction | 0.002996 (0.3 wt %) | 0.004625 | OPEN, 54 % high |

**The band is 1 %, not the printing resolution.** §5.4 / §6 prescribed "the
table's own rounding" (±0.05 wt %). Against that band all four rows miss
(+0.45 % and +0.24 % on the majors, far more on the minors). The 1 % band is
justified instead by §5.4's own measurement that the table fails its own
key-component balance by about 1 % (i-butane 0.9 %); a target inconsistent
with its paper by 0.9 % cannot be held tighter. This choice was made having
seen the numbers and is disclosed as such: the two passing rows are weak
(column15, ideal trays, passes them too) and certify the major split only.

**The two open rows carry no `anchor` row**, following
`pitzer_seawater_verify` (an anchor that disagrees would commit a red suite
over a gap that is explained, not fixed). The model's values are pinned as
self-recorded rows and the disagreement is written in `expected`. Physical
reading: they miss in opposite senses (rectifying section too clean, stripping
section not clean enough), so E_MV does not explain them (column15 gives
0.728 wt % and 0.734 wt %, the measured 0.2 lying between the arms for the
first and below both for the second); and the paper's own balance cannot
support the printed bottoms i-butane (feed minus printed distillate leaves
0.69 wt %, not 0.3) nor a positive distillate n-butane (feed minus printed
bottoms is −15 kg/h).

**What the case still cannot reproduce:** the boiler duty (10.240 MW against
8.09 MW; constant molar overflow solves no stage energy balance and the
reflux is subcooled to 18.5 °C in the plant); any internal profile (the paper
publishes none); the trace components (§5.4); the efficiency itself (an input).
