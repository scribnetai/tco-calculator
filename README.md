# TCO Calculator

Year-by-year total cost of ownership modeling for presales SEs. Live at https://scribnetai.github.io/tco-calculator/

Compare "current state" vs "proposed" across hardware, software, support, power,
facilities, admin labor, downtime risk, and migration — with NPV, breakeven year,
and auto-generated findings written as deal-review talking points.

## Model

Per scenario per year:
- One-time: hardware + software + migration in year 1; hardware again in the refresh year
- Annual: (software + support + power + facilities + admin + downtime + other) × (1 + uplift)^(y-1)
- Discounted: total / (1 + discount)^y

Power $/yr = kW × 8760 × $/kWh × PUE. Admin $/yr = hrs/wk × 52 × loaded rate.

## A model, not a quote

Outputs trace back to assumptions typed into the page. Validate all pricing
against real distributor quotes before anything customer-facing.

## Local preview

Serve over HTTP (`python3 -m http.server`) — `fetch("CHANGELOG.md")` needs http, not file://.

## Privacy

100% client-side. Projects live in localStorage on your machine; nothing is uploaded.
