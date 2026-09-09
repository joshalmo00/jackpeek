# Light UI polish validation

## Scope

The September 9, 2026 UI pass updates the existing styles rather than adding a
second stylesheet. It standardizes light surfaces, reduces decorative treatments,
aligns capture controls, restores independent Port History scrolling, and improves
mobile settings headers. Context help now uses an accessible viewport-level
tooltip, with hover, focus, touch activation and Escape dismissal.

Switch Inventory now refreshes its presentation when selected. A populated-data
test also exposed and fixed a Map/Array mismatch in inventory search construction.
No identity matching, capture, authentication, encryption or NAS policy was changed.

## Changed files for this pass

- `src/NetworkPortAnalyzer.Web/wwwroot/styles.css`: theme, typography, controls,
  responsive layouts, scrolling and help presentation.
- `src/NetworkPortAnalyzer.Web/wwwroot/app.js`: context help and inventory rendering.
- `tests/ui/light-polish.cjs`: isolated browser regression test and screenshots.
- Review manifest/artifacts: regenerated using `scripts/review-artifacts.cjs`.

Other uncommitted work was already present and has been preserved.

## Verification

- JavaScript syntax check and `git diff --check`: passed.
- .NET build: passed, zero warnings and errors.
- Existing .NET executable test suite: 28 tests passed.
- Existing inventory UI contract test: passed.
- New Chromium UI suite: passed. All requests are intercepted; fixtures use DEMO
  labels and documentation addresses. It never calls a live API or writes NAS data.
- Viewports: 1440x1000, 1280x800, 768x1024, 390x844 and 720x500.
- CSS zoom at 200% and a half-width viewport were checked. These are not a substitute
  for native Windows browser zoom or display-scaling validation.
- Screens exercised: login, administrator login, denied access, Capture with 24
  historical records, Evidence History, all five Settings tabs, Npcap dialog,
  Privacy and Terms. Non-admin Settings visibility was checked.
- Inventory search/expansion, mobile filter expansion, duplicate adapter description,
  Port History scrolling, help hover/focus/Escape, and horizontal page overflow
  are covered. Representative screenshots were visually inspected.

## Reproduce

Run from the repository root with Playwright and a compatible browser available:

```sh
node --check src/NetworkPortAnalyzer.Web/wwwroot/app.js
git diff --check
dotnet build
dotnet run --project tests/NetworkPortAnalyzer.Tests --no-build
node tests/ui/inventory-contract.cjs
node tests/ui/light-polish.cjs
```

Set `JACKPEEK_BROWSER=chrome` to use installed Google Chrome, or leave it unset
for Playwright Chromium. Browser test screenshots are written under the ignored
`.ui-test/light-polish` directory. These contain synthetic data, not captures.

Start the built application with:

```sh
dotnet run --project src/NetworkPortAnalyzer.Web --no-build -- --no-browser --port=4177
```

Sign in normally, inspect Capture, then check History and Settings with an authorized
administrator. The macOS preview does not validate Windows account detection,
Npcap capture, real switch announcements or NAS connectivity. No security
certification or comprehensive accessibility conformance claim is made.
