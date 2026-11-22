# Phase B stopped: species of Appendix A with no thermochemistry in the tree

Appendix A uses 51 species.  42 resolve today (NASA/TP-2002-211556 table,
data/standards/components, aliases: C2H2 = acetylene, C2H4 = ethylene,
C2H6 = ethane, H2O = water, CH2O = HCHO, C2H3 = C2H3_vinyl,
C3H3 = C3H3_1propynl, the radicals from the NASA table).  Nine do not, and
the brief says to stop rather than invent thermo:

| species | reactions of Appendix A using it | why absent |
|---|---|---|
| NNH | 8 | not in the NASA/TP-2002-211556 table (not even in its left-out list) |
| CH2CO (ketene) | 11 | in the report but refused by the report's own S(298) check (INDEX.md) |
| 1CH2 (singlet) | 9 | the table has triplet CH2 only |
| C3H2 | 5 | none |
| H2CN | 4 | none |
| HOCN | 3 | none |
| HCNO | 3 | none |
| C4H3 | 2 | none |
| HCCOH | 2 | none |

46 of the 235 reactions touch at least one of them (189 do not).  NNH is the
Thermal DeNOx path itself (A216, A221-A227), so no experiment of the paper's
NH3/NO/O2 chemistry can be represented without it.
