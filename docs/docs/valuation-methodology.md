# MotoWorth V2 valuation methodology

## Design principle
MotoWorth does not claim to know an exact resale price from depreciation alone. The output is a buyer decision range. The model separates:
1. Reference price evidence.
2. Age and mileage effects.
3. Condition and history adjustments.
4. Immediate repair reserve.
5. Comparable used-bike asking prices when available.
6. Negotiation strategy based on seller type.

## Reference price hierarchy
- Same variant + current city + current date: strongest reference.
- Same model/generation + current national reference: acceptable fallback.
- Historical price matching registration year/generation: required for discontinued models when available.
- Manual user-entered benchmark: allowed but explicitly marked as manual.

## Resale baseline
The model uses a residual curve rather than adding annual depreciation percentages together. This prevents the older V1 failure mode where seven years of percentages could mathematically drive a bike to an unrealistic floor.

## Market comps
Comparable asking prices are blended only when the user supplies or MotoWorth later ingests comparable records. More comparable records increase their weight, but they never become the sole answer without quality checks.

## Seller type
Dealer status never increases intrinsic motorcycle value. A dealer may quote a higher asking price because of stock cost, refurbishment, warranty or margin, but MotoWorth treats that as a negotiation context rather than a value premium. Owner and dealer therefore get different opening-offer strategies, not different intrinsic values.

## Confidence
- High: strong current reference + 3+ usable comparables.
- Medium: verified reference + limited/no comparables.
- Low: historical/manual reference or catalogue-only fallback.

Every production price/spec fact should carry source, effective/retrieved date, price basis and confidence.
