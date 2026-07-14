# Mixer — own data folder

This unit op's OWN `constant/`: it INHERITS the sector/plant thermoPackage by
default (cascade), and this folder is where its PARTICULAR data accumulates and
from which it is curated. Drop here, as it earns them:
- `thermoPackage`              its own model, when it needs one (then it overrides)
- `components/<name>.dat`       sample-specific overlays (axiom 4)
- experimental measurements      the unit's lab notebook

Dignity: this unit runs and is DIAGNOSED standalone (open its .cho, Run; inlets
frozen from the parent run).
