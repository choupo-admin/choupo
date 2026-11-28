# gibbs09_refusal_unlisted_feed_species — a feed species the reactor was not told about

A refusal witness.  The water-gas shift reactor at 800 K and 1 bar is fed a
mixture that carries CH4, but `operation.species` omits it.  The unit must
refuse by name: before, the CH4 moles (0.25 kmol/h) were dropped from the
Gibbs inventory without a word.

## What it prints

    ERROR: GibbsReactor: the feed carries species not listed in operation.species: CH4.
    Their moles would be dropped from the Gibbs inventory.  Add them to
    operation.species, or remove them from the feed.

The case ends with an error by design (an EXPECTED-FAIL in the suite).

## The lesson

A reactor that silently ignores a species breaks the mass balance.  Naming
the species and the two remedies is the whole fix.

## What to try

Add CH4 to `operation.species` and the case runs.
