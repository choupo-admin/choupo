# column20 -- MTBE by reactive distillation with a RATE-LIMITED reaction in the full MESH

column19's problem (methanol + isobutene <=> MTBE, Sum nu = -1; 15 stages,
partial condenser, reactive stages 6-10, 7 bar, `bottomsRate` 240 kmol/h and
`boilupRatio` 5, UNIFAC liquid, ideal vapour) with the reaction closed by a
**rate law** instead of an equilibrium quotient.  On each reactive stage the
extent is *computed*, `xi_j = r(T_j, a_j) m_cat,j`, from the law and the
catalyst the stage holds; there is no extent unknown, and still no
heat-of-reaction term in the stage energy rows (they price on the elements
datum, which already holds it).

## The law, and where every number comes from

Rehfinger & Hoffmann, *Chem. Eng. Sci.* 45 (1990) 1605-1617,
doi 10.1016/0009-2509(90)80013-5, Amberlyst 15:

```
r = k ( a_IB / a_MeOH  -  a_MTBE / (K_a a_MeOH^2) )          (Eq. 12)
```

in liquid-phase activities, r per acid equivalent; `k(90 C) = 243.8 mmol/(s eq)`
and `E = 92.4 kJ/mol` (Eq. 15, Table 4); `K_a(T)` from their Eq. 6 with
`K_a(298.15 K) = 300.5` (Table 4: the value the fit returned together with k and
E, so the three are the pair the paper fitted -- Eq. 6 with 284, the value of
its Fig. 9 caption, reproduces Izquierdo's Table IV and is 5.8 % lower); acid
capacity 4.9 meq/g (p. 1606).  The law is written in the case with named
definitions and `a[<component>]` = gamma_i x_i, the package's activity at the
stage.

## Honest limits

* **The catalyst mass (220 kg) is illustrative**, not any column's loading.
* **The paper's activities are UNIQUAC; this case's are UNIFAC.**  The law and
  its activities were fitted together; the pairing here is an approximation.
* **The reactive stages run methanol-lean** (x_MeOH 0.05-0.18), below the 0.3 the
  paper says its model under-predicts at ("measured rates are greater ...
  internal mass transfer").  The law has no effectiveness factor, so the rate
  here is a lower bound there.  The run announces the excursion.
* The law diverges as a_MeOH -> 0; the engine hides no floor.  A trial that
  reaches it is an announced infeasible trial.
* The conversion (about 9 % of the methanol) is a property of the illustrative
  mass and of the methanol-lean stages.  The mass continuation converges up to
  about 270 kg and stops near 300 kg (measured), so no higher conversion is
  claimed.
* Nothing here is validated against a measured MTBE column.

Gate: `bin/curate/check_kinetic_mesh.py` (the proof is a limit: a mass-action
twin on column19's own K_a converges on column19's equilibrium as the mass
grows).  Design record: `docs/design/a-rate-law-in-the-full-mesh.md`.
