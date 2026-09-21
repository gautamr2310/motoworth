# MotoWorth M2 Integration Fix

The M2 catalogue is intentionally named `data/catalogue.v2.json` because the V15 frontend loads that exact path.

The previous M2 final package contained `catalogue.v2.m2.complete.json`, which caused the V15 frontend to receive a 404 when it tried to load `data/catalogue.v2.json`. As a result, the calculator fields could not initialise correctly.

This package is the V15 master with the completed M2 catalogue installed at the exact filename/path expected by the application.

## Deployment
Use this project as the complete replacement for the currently deployed MotoWorth project, or replace only:

`data/catalogue.v2.json`

with the file in this package.

No valuation-engine, UI, PDF, API, or V15 logic changes were made for this fix.
