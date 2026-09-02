# estimate_acetone — build a component from its groups, and see the error

Acetone is `2 × CH3 + 1 × ketone`.  This case runs under `choupoProps`
and asks Joback's group-contribution method to **create** a property set
from those three groups, then lays the estimate beside the reference
values the case itself declares.  The golden: Tb **322.11 K**, Tc
**500.56 K**, Pc **48.02 bar**, ω **0.30**, Vc 209.5 cm³/mol, ΔHf
**−217.83 kJ/mol**.

## The lesson

1. **Estimation is a resolution problem, not a runtime one.**  Choupo does
   not estimate properties while a flowsheet runs; it estimates them
   HERE, at curation time, so a student can look at the number before
   trusting it.  `output { proposal auto; }` writes the estimate as a
   record you can read, edit, and only then wire into a case — the run
   prints where: `constant/components/acetone.estimated.dat`, with the
   GAPS the method left listed in its header.
2. **The error is the point.**  Against the reference block in
   `system/propsDict` (Tb 329.2 K, Tc 508.1 K, Pc 47.0 bar, ω 0.307):
   Tb is **2.2 % low**, Tc **1.5 % low**, Pc **2.2 % high** — Joback's
   usual band for a small ketone, and you can see it rather than be told.
3. **ω is not a group sum.**  It comes from (Tb, Tc, Pc) through
   Lee-Kesler; an error in Tb propagates into it.  That chain is printed
   in the run's log.
4. **A reference is a citation, not an endorsement.**  The block names
   where its four numbers were read; the run compares against those four
   and nothing else.

## What to try

Open `estimate_ethanol_benzene`: the same method on a hydrogen-bonding
molecule, where Joback's Tb goes noticeably wrong — the honest limit of
a group method, shown rather than warned about.
