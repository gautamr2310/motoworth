# MotoWorth — On-Road Valuation Basis Update

The valuation reference is now:

**Model/variant ex-showroom reference → applicable state road tax → registration fee → state on-road reference → valuation adjustments**

The depreciation floor and baseline now use the state on-road reference, not ex-showroom alone.

## Included
- State-aware road-tax calculation from `data/state_tax_profiles.v1.json`
- Registration-fee layer in the same state profile
- On-road reference stored in the calculation result
- Buyer valuation, low/high range and negotiation values derived from the on-road reference
- Registration lens shows ex-showroom, road tax, registration and total
- PDF report includes ex-showroom reference, state on-road reference, road tax and registration fee
- Valuation engine exposes the same on-road calculation helper for future API/test use

## Important
Only states with a verified state-tax profile are allowed to calculate. The current verified profiles are KA, MH, HR, DL and TN. Other states remain visible in the selector but will not be guessed until their tax profiles are verified.

Insurance, finance, dealer accessories and optional/VIP registration numbers are excluded from this valuation basis.
