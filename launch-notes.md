# MotoWorth V15 — Option 4 + data UX update

Base: V15 email-gated PDF report build.

Updates in this package:
- Added the Option 4 Minimal Monogram MW logo to the V15 header.
- Replaced user-facing “catalogue only” wording with “limited data”.
- Made the Reference new-bike price field visible in the V15 calculator.
- Limited-data models now prefill an editable estimated reference price from `legacy_seed_benchmark_inr` when available.
- Verified source-backed models keep their source-backed reference price and remain read-only.
- Improved the missing-reference validation so the field is focused and the user gets a clear message.
- Preserved V15 email-gated detailed PDF generation and the existing valuation/report functionality.

Validation:
- Inline JavaScript syntax: PASS
- API JavaScript syntax: PASS
- JSON parsing: PASS
