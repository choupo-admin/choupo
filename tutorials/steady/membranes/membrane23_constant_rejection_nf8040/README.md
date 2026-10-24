# membrane23 -- a constant intrinsic rejection per salt

**The question.** A spiral-wound element is hardware; the membrane model is a
choice.  What is the simplest model it can carry, and what does it leave out?

**The model.** `transport constantRejection;` -- each solute leaves through
the membrane with a DECLARED intrinsic rejection, measured against the wall:

    c_p,i = (1 - R_i) c_m,i,      N_i = J_v c_p,i,      J_v = A_w (dP - dpi)

This is Eq. (1) of Geraldes & Afonso, J. Membr. Sci. 300 (2007) 20-27, which
takes R_i as an input.  The wall concentration c_m comes from the module's
polarisation model (here Schock & Miquel's correlation on the FT30 spacer with
the Geraldes & Afonso 2006 suction correction) and the water flux from the
same Newton the solution-diffusion law uses.  The membrane record (`NF270`)
supplies A_w only.

    transport        constantRejection;
    transportParameters
    {
        rejection { NaCl 0.60;  MgSO4 0.98; }
        source    "...";
    }

The same `module Generic-8040;` runs `solutionDiffusion` (B per solute),
`SDEM` (per-ion B under zero current, membrane21) and `DSPM-DE` (the charged
pore, membrane22): only the `transport` line changes.

**What the student sees.** The declared R's are INTRINSIC; the run publishes
the OBSERVED ones, `R_obs_<salt> = 1 - c_p/c_feed`, of the mixed permeate
against the feed.  They are lower -- 0.49 for NaCl against 0.60 declared,
0.97 for MgSO4 against 0.98 -- for two reasons the student can separate in
the per-element KPIs: the wall is richer than the bulk (`Gamma_<salt>_elemK`,
up to +24 % for MgSO4 in the first element) and the bulk concentrates along
the vessel (`c_ret_elemK`) as 44 % of the water leaves.

**Why the feed is declared by salts.** A salt is neutral, so one R per salt
cannot charge the permeate.  The law also accepts a feed written ion by ion,
with one R per ion -- and there the permeate charge is
sum z_i (1 - R_i) c_m,i, which vanishes only when the R's are equal or tuned
to one wall composition, and the wall composition moves along the channel.
This law couples nothing, so a charged permeate would be a current through a
membrane with no electrodes: it is REFUSED by name.  Measured on membrane21's
feed (Na/Cl 0.01 M, NO3/NH4 2e-4 M, the Geraldes-Afonso coupled wall):
R = 0.55/0.55/0.30/0.40 gives a relative permeate charge of 2.1e-3 at the
first station; even 0.55/0.55/0.30/0.30 -- pairwise equal -- gives 1.4e-4,
because NO3- and NH4+ polarise by different amounts.  Equal R's on all four
ions pass.  The remedies the refusal names: R per salt, or `transport SDEM;`,
which derives the split of the ions from their permeances.

**What is not modelled.** An intrinsic rejection that is constant is a
CHOICE, not physics: a real one rises with the flux (solution-diffusion,
R = J_v/(J_v + B)) and depends on the ion mixture (DSPM-DE).  The two R's
here are hypothetical teaching values and say so.  The film reads ONE
diffusivity for both lumped salts (declared 1.4e-9 m2/s).  The generic
element's geometry is estimated, and announced.

Gate: `bin/curate/check_constant_rejection.py`.
