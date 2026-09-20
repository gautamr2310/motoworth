(function(global){
  'use strict';

  function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
  function num(value, fallback){ const n=Number(value); return Number.isFinite(n)?n:(fallback||0); }

  function residual(age, rules){
    age=Math.max(0, Math.floor(num(age,0)));
    if(age<=0) return 1;
    if(age<=15) return num(rules.residual_by_age[String(age)], 0.20);
    return Math.max(num(rules.residual_floor,0.18), num(rules.residual_by_age['16_plus'],0.20)-(age-16)*0.004);
  }

  function ownerAdjustment(owners, rules){
    if(owners===1) return num(rules.history_adjustment.one_owner,0);
    if(owners>=3) return num(rules.history_adjustment.three_plus_owners,0);
    return num(rules.history_adjustment.two_owners,0);
  }

  function serviceAdjustment(service, rules){
    const map={good:'service_good',partial:'service_partial',missing:'service_missing'};
    return num(rules.history_adjustment[map[service] || 'service_partial'],0);
  }

  function repairReserve(wear, rules){
    const keys=['tyres','chain_sprocket','battery','major_service','brake_pads','fork_seal_service'];
    return keys.reduce((sum,key)=>sum+(wear && wear[key] ? num(rules.wear_costs_inr[key],0):0),0);
  }

  function normalizeComp(comp, targetYear, targetKm, rules, valuationYear){
    const compYear=num(comp.year,0), compKm=num(comp.km,0), price=num(comp.price,0);
    if(!price || compYear<1900) return 0;
    const targetAge=Math.max(0, valuationYear-targetYear);
    const compAge=Math.max(0, valuationYear-compYear);
    const ageRatio=residual(targetAge,rules)/Math.max(0.05,residual(compAge,rules));
    const kmDelta=((compKm-targetKm)/1000)*num(rules.km_adjustment.per_1000,0.01);
    const kmFactor=1+clamp(kmDelta,-0.15,0.15);
    return Math.max(0,price*ageRatio*kmFactor);
  }

  function median(values){
    if(!values.length) return 0;
    const s=values.slice().sort((a,b)=>a-b), mid=Math.floor(s.length/2);
    return s.length%2?s[mid]:(s[mid-1]+s[mid])/2;
  }

  function calculateOnRoadReference(exShowroom, stateTaxProfile, spec){
    const profile=stateTaxProfile||{};
    if(!profile || profile.verified===false) return {verified:false, exShowroom, roadTax:0, registrationFee:0, total:exShowroom};
    let rate=0;
    if(profile.method==='price_percent') rate=num(profile.rate_percent,0);
    else if(profile.method==='cc_percent'){
      const cc=num(spec?.engine_cc||spec?.cc,0);
      const band=(profile.bands||[]).find(b=>cc>=num(b.min_cc,0)&&cc<=num(b.max_cc,999999)) || (profile.bands||[])[(profile.bands||[]).length-1];
      rate=num(band?.rate_percent,0);
    }
    const roadTax=Math.round(exShowroom*rate/100);
    const registrationFee=num(profile.registration_fee_inr,0);
    return {verified:Boolean(rate||registrationFee), exShowroom, roadTax, registrationFee, total:exShowroom+roadTax+registrationFee};
  }

function evaluate(input, rules){
    rules=rules||{};
    const valuationYear=num(input.valuationYear,2026);
    const registrationYear=num(input.registrationYear,valuationYear);
    const age=Math.max(0,valuationYear-registrationYear);
    const referencePrice=num(input.referencePrice,0);
    if(referencePrice<=0) throw new Error('A positive reference price is required.');
    const onRoad=input.onRoadReference || calculateOnRoadReference(referencePrice,input.stateTaxProfile,input.spec||{});
    if(input.requireOnRoad && !onRoad.verified) throw new Error('A verified state on-road reference is required.');
    const valuationReference=num(onRoad.total,referencePrice);

    const segment=input.segment || 'standard';
    const annualKm=num((rules.annual_km_by_segment||{})[segment],7000);
    const expectedKm=age*annualKm;
    const actualKm=Math.max(0,num(input.mileageKm,0));
    const kmDiff=(actualKm-expectedKm)/1000;
    const kmAdjustment=clamp(-(kmDiff*num(rules.km_adjustment?.per_1000,0.01)), -num(rules.km_adjustment?.high_km_penalty_cap,0.20), num(rules.km_adjustment?.low_km_bonus_cap,0.07));

    let baseline=valuationReference*residual(age,rules);
    const condition=input.condition || 'good';
    baseline*=1+num((rules.condition_adjustment||{})[condition],0);
    baseline*=1+kmAdjustment;
    baseline*=1+ownerAdjustment(Math.max(0,Math.floor(num(input.owners,2))),rules);
    baseline*=1+serviceAdjustment(input.service || 'partial',rules);
    if(input.accident) baseline*=1+num(rules.history_adjustment?.accident_declared,0);
    if(input.insuranceExpired) baseline*=1+num(rules.history_adjustment?.insurance_expired,0);
    baseline*=1+num((rules.modification_adjustment||{})[input.modification || 'stock'],0);

    const reserve=repairReserve(input.wear||{},rules);
    baseline=Math.max(valuationReference*num(rules.residual_floor,0.18), baseline-reserve);

    const compValues=(input.comps||[]).map(c=>normalizeComp(c,registrationYear,actualKm,rules,valuationYear)).filter(v=>v>0);
    const compMedian=median(compValues);
    const compKey=compValues.length>=3?'3_plus':String(compValues.length);
    const compWeight=compValues.length ? num((rules.comp_blend_weight||{})[compKey],0) : 0;
    const target=compValues.length ? baseline*(1-compWeight)+compMedian*compWeight : baseline;
    const verifiedReference=Boolean(input.referenceVerified);
    const confidence=verifiedReference ? (compValues.length>=3?'high':'medium') : 'low';
    const uncertainty=verifiedReference ? num((rules.confidence_ranges||{})[compValues.length>=3?'high_comp':compValues.length?'medium_comp':'low_comp'],0.18) : num((rules.confidence_ranges||{}).catalogue_only,0.25);
    const low=target*(1-uncertainty), high=target*(1+uncertainty);

    const seller=(input.sellerType||'unknown').toLowerCase();
    const openingFactor=num((rules.seller_strategy||{})[seller+'_opening_below_target'],0.07);
    const walkFactor=num((rules.seller_strategy||{}).walkaway_above_target,0.03);
    const opening=target*(1-openingFactor);
    const walkAway=target*(1+walkFactor);
    const askingPrice=num(input.askingPrice,0);
    const referenceVerified=verifiedReference;
    const askGap=askingPrice?askingPrice-target:0;
    const askPremiumPct=askingPrice?askGap/target:0;

    return {
      valuationYear, registrationYear, age, referencePrice, onRoadReference:onRoad, valuationReference,
      referenceVerified, expectedKm, actualKm,
      mileageAdjustment: kmAdjustment,
      repairReserve: reserve,
      baseline,
      comparableValues: compValues,
      comparableMedian: compMedian,
      comparableWeight: compWeight,
      target,
      low,
      high,
      opening,
      walkAway,
      askingPrice,
      askingGap: askGap,
      askingPremiumPct: askPremiumPct,
      confidence,
      cityAdjustment: num(rules.city_adjustment?.default,0),
      sellerType: seller
    };
  }

  global.MotoWorthEngine={evaluate, residual, normalizeComp, median, calculateOnRoadReference};
})(window);
