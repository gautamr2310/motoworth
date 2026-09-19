import json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cat=json.load(open(ROOT/'data/catalogue.v2.json'))
rules=json.load(open(ROOT/'data/valuation_rules.v2.json'))
sources=json.load(open(ROOT/'data/source_registry.v2.json'))['sources']
errors=[]
brand_ids={b['id'] for b in cat['brands']}
model_ids=set()
for m in cat['models']:
    if m['id'] in model_ids: errors.append(f'duplicate model id: {m["id"]}')
    model_ids.add(m['id'])
    if m['brand_id'] not in brand_ids: errors.append(f'missing brand for {m["id"]}')
    if m['data_status']=='verified_reference':
        p=m['pricing']
        for k in ['amount_inr','effective_from','source_id','source_url','price_basis']:
            if not p.get(k): errors.append(f'{m["id"]}: missing pricing.{k}')
        if p.get('source_id') not in sources: errors.append(f'{m["id"]}: unknown source')
for v in cat['variants']:
    if v['model_id'] not in model_ids: errors.append(f'variant {v["id"]}: unknown model')
if not rules.get('residual_by_age'): errors.append('missing residual_by_age')
if errors:
    print('VALIDATION FAILED')
    print('\n'.join(errors)); sys.exit(1)
print(f'OK: {len(cat["brands"])} brands, {len(cat["models"])} models, {len(cat["variants"])} verified/reference variants, {sum(1 for m in cat["models"] if m["data_status"]=="verified_reference")} models with source-backed reference pricing.')
