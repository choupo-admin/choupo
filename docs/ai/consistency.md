# Data-consistency tests — *test the data, not just fit it*

The single feature that separates Choupo's property work from a black box:
before (and after) you fit a model, you **test whether the experimental data
itself is physically/thermodynamically consistent**.  A fit can minimise χ²
beautifully on data that violates a conservation or equilibrium law — that fit
is a *trap*, not an answer.  Choupo makes the test a first-class, **announced**
result (never a silent pass/fail badge), with a number the student reads and a
plot they see.

Two epistemically different layers — keep them named apart:

- **CONSISTENCY (a physical/thermodynamic LAW)** — VLE (Gibbs-Duhem), Psat
  (Clausius–Clapeyron ↔ Antoine ↔ Cp), SLE (ideal-solubility ceiling), EoS
  (Maxwell equal-area).  The data *can* be proven inconsistent.
- **ADEQUACY (a statistical model-discrimination diagnostic)** — kinetics order,
  PSD model, drying model, sorption model.  Here the data is not "wrong"; a model
  is *more or less adequate* (residual structure, R², identifiability).

## VLE Gibbs-Duhem consistency (built: `vleConsistency`)

Given a binary VLE dataset with **measured** `(x1, T, y1)` at constant `P`, the
op back-computes the activity coefficients **directly from the data** via
modified Raoult (Psat from the components' Antoine):

    γ_i = y_i · P / (x_i · Psat_i(T))

— note this needs **measured y** (a bubble-T-vs-x set alone cannot run it; and
testing an NRTL/Wilson *curve* is a tautology — they are GD-consistent by
construction).  It then reports:

- **Gibbs-Duhem pointwise (point/direct) residual** — at each interior x,
  `x1·d(lnγ1)/dx1 + x2·d(lnγ2)/dx2 ≈ 0`.  Hovers at 0 for consistent data; a
  systematic departure flags bad y or a mislabelled isobar.  *(Written in its
  ISOTHERMAL form; isobaric data adds a small −Hmix/RT²·dT/dx term — a stated
  caveat; the rigorous van Ness/Fredenslund direct test is the planned refinement.)*
- **Herington area test (companion)** — `D = 100·|∫ln(γ1/γ2)dx1| / ∫|ln(γ1/γ2)|dx1`
  and `J = 150·(Tmax−Tmin)/Tmin`; **pass if |D−J| < 10**.  (Lead with the point
  test: the area test can pass inconsistent data through ∫ error-cancellation.)
- **γ∞ (infinite-dilution)** — the most diagnostic single numbers; what
  distillation actually depends on.  (For ethanol/water ≈ 4–6 / 2–3.)

Dict form (in a `propsDict`):

    {
        name       vle_consistency;  type vleConsistency;
        component  ethanol;  partner water;     // partner required if >2 comps
        dataset    "constant/experiments/ethanol-water-Txy-101kPa";
        state      { P 1.01325 bar; }
        output     { file vle_consistency.csv; } // x1,lnGamma1,lnGamma2,lnRatio,gdResidual
    }

The dataset is self-describing with **mandatory units**:

    columns ( { name x[ethanol]; unit frac; role independent; }
              { name T;          unit K;    role independent; }
              { name y[ethanol]; unit frac; role dependent;   } );
    data ( 0.019 368.65 0.170   ... );

**Reading it (GUI `VleConsistencyPlot`, 3 views):** *ln γ* (the data-derived
coefficients), *GD area* (ln(γ1/γ2) vs x with the signed area shaded), *GD
residual* (≈0 if consistent).  The title shows the Herington verdict + γ∞.

## The contract (for any future consistency test)

A consistency test is an object `{pass, statistic, threshold, message, plot?}`:
it is announced in the log + emitted in the run JSON (the GUI reads it like a
KPI), states its statistic and the cited threshold/heuristic, and renders a
plot where it can.  A **units/basis pre-screen** should be the first object any
dataset hits (mmHg vs kPa, °C vs K, mole vs mass).  Heuristics (Trouton,
Cp_L>Cp_ig) are labelled *advisory*, not hard thresholds.
