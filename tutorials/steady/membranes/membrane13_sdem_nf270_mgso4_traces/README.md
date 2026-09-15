# membrane13 -- SDEM on NF270, dominant MgSO4 with Na+/NH4+/Cl-/NO3- traces

**The question.** A membrane that rejects MgSO4 almost completely -- how can
it let MORE nitrate into the permeate than there is in the feed?

**The lesson.** SO4(2-) is the least permeable ion here (0.13 um/s against
0.9 for Mg2+ and 16-80 for the traces).  Zero current forces the sulfate
and the magnesium fluxes to match, so a strong field arises already at
small fluxes; every trace ANION is dragged through it and every trace
CATION is held back.  Cl- and NO3- come out with NEGATIVE rejections --
concentrated in the permeate -- while Na+ and NH4+ are rejected.  Same
permeances as the record, no parameter for the effect: it is what the
field does.

**Source of the numbers.** Fernandez de Labastida & Yaroshchuk, Membranes 11
(2021) 272, CC BY 4.0, Table 1 (row MgSO4), NF270 at 0.01 M MgSO4 + 2e-4 M
traces, 20 C.  What the paper reports: the dominant salt highly rejected,
trace cations rejected, Cl- from -70 % at small flux up to +60 %, NO3-
negative over the whole flux range (-151 % to -5 %).  `check_sdem` holds the
signs the text states at this run's flux, the permeate electroneutral, and
the MgSO4 rejection to the single-salt ambipolar law.

**Against the paper's Figure 4** (digitised into the NaCl witness's
`constant/experimental/fdl2021_figures.csv`): in the TRACE LIMIT the engine reproduces the authors' SDEM lines for Na+, Cl- and NO3-
within 2-9 %; at this case's 2e-4 M it does not, and that is the lesson --
here 2e-4 M of NO3- at 41.9 um/s carries more anion current than 0.01 M of
SO4 at 0.13 um/s, the field relaxes, NO3- is rejected LESS negatively
(f 1.37x the trace-limit value at 34.7 um/s) and the trace cations less
(0.45x).  The authors' analytical fit assumes the traces do not touch the
field; their text says they do.
