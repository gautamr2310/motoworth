# MotoWorth V2 data dictionary

`models.data_status` tells the calculator whether the record is usable for a source-backed baseline. `verified_reference` records have a `pricing` object with source/date/basis/confidence. `variants` store variant-level reference prices. `price_history` supports historical ex-showroom anchors for discontinued generations. `market_comps` stores used-bike asking prices separately from new-bike reference prices. `sources` is the provenance registry. Legacy seed benchmarks are retained only for auditability and are never used by the V2 calculator.
