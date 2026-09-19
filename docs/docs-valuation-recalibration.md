# MotoWorth valuation recalibration v1

## What changed
- Current, verified models up to four years old now use a current replacement-context anchor blended with historical depreciation.
- Replacement context uses current ex-showroom price plus the estimated current one-time road-tax reference for the selected current state.
- The historical depreciation curve remains part of the blend and remains the fallback for discontinued or non-current models.
- Recent current-model valuations use a tighter no-comparables range than the previous generic range.
- Owner/dealer status changes negotiation strategy, not intrinsic value.
- Repair reserve is still deducted separately from value.

## Why
A 2024 Triumph Speed 400 in Bengaluru illustrates the issue: a generic 72% two-year residual applied to the current ex-showroom reference produced about ₹1.69 lakh before other adjustments. Current Bangalore references show about ₹2.91 lakh on-road for the current Speed 400 and used examples around ₹2.15 lakh to ₹2.40 lakh. The recalibrated model is therefore intended to anchor recent bikes closer to current replacement economics while remaining conservative until more comparable data is available.

## Example regression
2024 Triumph Speed 400, Bengaluru, 15,500 km, one owner, good condition, complete service, no repair reserve:
- current ex-showroom reference: ₹2,34,140
- Karnataka tax reference: 18%
- replacement context: about ₹2,76,285 (ex-showroom + tax reference; insurance excluded)
- blended pre-adjustment value: about ₹2,14,734
- after mileage and history: about ₹2,23,305
- no-comps range at 14%: about ₹1,92,042–₹2,54,568

These outputs are model estimates, not transaction-price guarantees. Asking-price evidence should tighten the estimate as comparable coverage improves.
