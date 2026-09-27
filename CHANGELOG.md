# Changelog

## 2026-09-27
- Added a favicon (inline SVG monogram badge, matching the other apps) so browser bookmarks and tabs show the app logo instead of a generic globe.

## 2026-09-27
- Added top-left app-switcher dropdown on the brand mark: one-click jumps to every app in the suite (full index, this page marked).
- Launched TCO Calculator: year-by-year total cost of ownership modeling, current state vs proposed.
- Inputs: hardware capex + refresh year, software (one-time + annual), support, power (kW × rate × PUE), facilities, admin time, downtime/risk, migration, other annual.
- Global settings: 3/5/7-year horizon, discount rate for NPV, annual cost uplift.
- Outputs: KPI cards (TCO, savings, NPV savings, breakeven, avg annual savings), cumulative TCO chart with breakeven marker, year-by-year table, auto-generated SE findings, downloadable standalone HTML report.
- Projects: named saves, export/import JSON, autosave with session restore.
- Linked from the SE Command Center App Launcher.
- Fixed: biggest-cost-driver finding now ranks by full-horizon totals instead of comparing one-time capex against annual figures. Added Other annual, Software licenses (one-time), and Migration & professional services to the ranking. Fixed NaN% on blank canvas.
