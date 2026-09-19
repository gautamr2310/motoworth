# MotoWorth Ownership-Today Layer v1

This layer supplements price with practical ownership context for a used-bike buyer.

## What it shows
- Fuel efficiency with clear source/basis labels.
- Fuel spend per 1,000 km and per month using a user-editable fuel price and monthly distance.
- Scheduled-service cadence where model-specific data is source-backed.
- Published service-program pricing where an OEM currently exposes it.
- Parts/support availability as a cautious signal, with local-stock verification prompts.
- Primary-use fit (daily city, mixed, touring, performance).
- "Why it can make sense now" and "Reasons to pause / walk away" educational signals.

## Decision principles
1. Price is not the same as ownership cost.
2. Brand reputation is context, not proof of reliability.
3. Discontinued does not mean undesirable; it increases the need to verify parts lead times and specialist support.
4. Mileage figures are comparative references, not guarantees. Owner-reported data and claimed/ARAI data are labeled separately.
5. No ownership signal should quietly change the intrinsic valuation unless separate market evidence supports a rupee adjustment.

## Source policy
Every model-level ownership fact in the seed file carries either a source URL or an explicit coverage-gap statement. Exact local parts stock is never inferred from national brand presence.
