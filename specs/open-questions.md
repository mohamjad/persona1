# Open Questions

## Purpose

This file tracks unresolved product and architecture questions.

Use it to log ambiguity before it turns into undocumented implementation drift.

## Current Questions

1. Repo topology
Should `persona1` stay a standalone repo that mirrors the world1 modular layout, or should it eventually be reabsorbed into a larger monorepo? The current docs assume the world1-style internal decomposition either way.

2. Firebase cutover
The runtime now includes a Firebase-compatible JWT verifier. The remaining work is product-level login UX and the operational cutover from locally issued tokens.

3. Billing launch shape
The source spec defines three paid tiers plus a bundle, but the implemented launch path is still `$9/month only`. Multi-tier billing should stay post-launch unless reprioritized.

4. Extension checkout UX
The current implementation opens checkout in a browser tab after it is initiated from the extension. If embedded checkout becomes a hard requirement, extension constraints should be revalidated before changing this.

5. Distribution location
The source spec describes distribution as separate from the persona1 product kernel. The precise repo boundary for that distribution logic should remain separate unless the product build explicitly requires coupling.
