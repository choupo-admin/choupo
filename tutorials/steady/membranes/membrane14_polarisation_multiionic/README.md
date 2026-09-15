# membrane14 -- the film with a field: NF270 + SDEM on a real spacer channel

**The question.** membrane12 keeps its film out of the way (`k_film 1e-2`,
wall = bulk) so the SDEM rejections are intrinsic.  In a module the wall is
NOT the bulk: what does concentration polarisation look like when the feed
is four ions of different mobility and charge, and how do they pile up?

**The lesson.** The film model needs ONE diffusivity and a mixture of ions
has none; applied ion by ion it lets each ion polarise alone, so a fast
anion runs ahead and charge separates.  Geraldes & Afonso, J. Membr. Sci.
300 (2007) 20-27, keep the module's own mass-transfer correlation, evaluate
it PER ION on the ion's own D (`k_film_<ion>` columns, Cl- above Na+),
correct it for the suction of the permeation (the 2006 factor), and add ONE
unknown -- the electrical potential gradient at the interface, fixed by
electroneutrality at the wall.  No film thickness, no new parameter.  This
case declares it:

    massTransfer  { model SchockMiquel; channelHeight 0.7 mm; spacerPorosity 0.9; viscosity 1e-3; }
    pressureDrop  { model SchockMiquel; }
    polarisation  { suctionCorrection GeraldesAfonso2006; ionCoupling electroneutral; }

What a student sees: the polarisation index Gamma = (c_m - c_b)/c_b differs
BY ION (`Gamma_<ion>_avg`: Na+ 0.163, Cl- 0.163, NO3- 0.064, NH4+ 0.118 --
the dominant pair driven together by the field, the traces each on their own
rejection); the interface field `xi_V_per_m_avg` (~34 V/m) beside the
membrane's own potential `membranePotential_mV_avg` (~31 mV) -- two fields,
one in the solution and one across the active layer; R_obs BELOW the
intrinsic witness (Cl- 68.9 % here against membrane12's 77.5 %), because
the wall is richer than the bulk.  Set `ionCoupling none;` and each ion
polarises alone: Na+ 0.187, Cl- 0.135, NO3- 0.043, NH4+ 0.143 -- the
coupling moves the trace anion's Gamma by half.  (The README that briefed
this case said the trace anion's Gamma might go negative; on this feed it
does not, and the number above is what the run says.)

**Geometry.** One nominal 4-inch element (7.9 m2, 1.016 m) fed at 4 m3/h,
so the spacer-channel crossflow is ~0.45 m/s (a realistic velocity) and the
recovery ~16 %.  Membrane12's composition (NaCl 0.01 M, traces 2e-4 M) and
its NF270 permeance record, unchanged.

**Source of the numbers.** Permeances: Fernandez de Labastida & Yaroshchuk,
Membranes 11 (2021) 272, Table 1 (CC BY 4.0), as in membrane12.  Ion
diffusivities: the species records' `D0` -- Na+/Cl- from the standards;
NO3-/NH4+ from case-local copies under `constant/species/` that add a
Nernst-Einstein D0 from lambda0 (Robinson & Stokes 1959, App. 6.1), cited
in the record and not promoted.  Correlation: Schock & Miquel 1987.

**What is NOT validated here.** No measured polarisation index exists for
this feed; the case shows the MODEL's answer.  The gate
`check_polarisation_coupling` holds the wall electroneutral on every node
from what the run published, and the `none` twin as the negative.  The
props bench `props/membrane/polarisation01_geraldes_afonso_table1` is where
the same equations meet the paper's own case study.
