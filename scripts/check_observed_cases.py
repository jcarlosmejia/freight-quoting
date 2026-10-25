#!/usr/bin/env python3
"""Check transcription/arithmetic of observations, not equivalence of a cost engine."""
import json
from decimal import Decimal as D
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'fixtures/observed-calculations.json'
data=json.loads(p.read_text())
def close(a,b):
    assert abs(D(a)-D(b))<=D('0.02'), (a,b)
f=data['fleet']; close(D(f['annual_fixed_expenses'])/D(f['annual_billable_hours']),f['displayed_hourly_recovery'])
v=data['vehicle']; close(D(v['value'])*D(v['salvage_percent'])/100,v['salvage_amount'])
close(D(v['value'])-D(v['salvage_amount']),v['depreciable_base'])
close((D(v['value'])+D(v['salvage_amount']))/2,v['average_capital'])
close(D(v['average_capital'])*D(v['annual_capital_percent'])/100,v['annual_capital_cost'])
f=data['freight']; close(sum(D(f[x]) for x in ['loaded_components_subtotal','driver','tolls']),f['trip_cost'])
for c in [f,f['profit_30_variant'],data['rental']]:
    close(D(c['subtotal'])+D(c['tax']),c['total'])
    close(D(c['subtotal'])*D('0.16'),c['tax'])
close(D(data['rental']['availability_cost'])*D('0.20'),data['rental']['profit'])
assert D(f['profit_30_variant']['total'])>D(f['total'])
print('Observed-case transcription and arithmetic checks passed (up to 2 cents for displayed rounding).')
