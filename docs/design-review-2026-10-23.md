# Mamy design review — 2026-10-23

**Owner rejected this redesign.** The previous storefront and admin builds are
live again. The self-review below did not reflect the owner's preference and
must not be treated as approval to redeploy this design. Future changes should
preserve the previous composition, typography and palette.

## Brief and direction

The operator reference supplies the method: preserve the working business
contracts, design around the next job, keep selections scoped, distinguish
missing data from real zero, validate responsive flows, then verify deployment.
Its sports/casino visual identity is not reused.

Subject inventory: Mamy's name; Concórdia/SC; crochet bags; embroidered linens;
amigurumi companions; individual variants; ready stock; made-to-order lead times;
personalized commissions; local pickup; the atelier's WhatsApp; the existing
twelve catalog illustrations. No product photography is supplied.

Argument: the actual object shows what is sold; occasion links help choose;
production/transport copy clarifies waiting; live catalog prices support buying;
custom-order contact starts a real conversation; practical answers cover checkout
and tracking. No invented testimonials, sales figures or customer counts.

Dealt direction: **The split stage**, seed **339928965**. Existing brand type
(Playfair Display and Inter) retained; unused Geist removed. Palette adapted to
rose paper/mulberry instead of the original cream/brown; the dark theme uses
neutral surfaces. The direction was reprinted with palette/type kept to preserve
the established readable brand rather than adopt its initially dealt STIX/deep
burgundy/bubblegum sheet. No scroll scenes were added.

Idea: Mamy's illustrated pieces become the changing object on the atelier's
worktable, beside the choices of recipient and production time. Live element:
switch the displayed catalog piece with its actual price and destination.
This is specific to the catalog but not exclusive to the atelier; creativity
therefore does not receive an originality score above seven.

Admin: **Achromatic ledger**, seed **1634859619**. Shared type/palette, near-ink
actions, neutral navigation, muted rose only on revenue data. Signature element:
the paid → production → dispatch atelier queue with real item names and quantities.
Its questions are: what needs work next; which variants need replenishment;
what confirmed order value belongs to this creation-date period?

## Render review

ROUND 1
Seen in one second: the selected bag and the large shopping headline.
Idea (one sentence): the illustrated object stays beside the atelier's shopping guidance.
Live thing: featured-product selection, saved pieces, scoped discovery filters.
Layout words by section: hero=sticky split / discovery=list / collection=product shelf / commission=colour field / answers=disclosures.
Scores: design 6.5 · usability 7.5 · creativity 6.5 · content 7.5 → overall 6.9
Caps applied: fewer than four photographic/raster images, design ≤ 6.5.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Initial development-server captures still showed loading placeholders. Switched visual verification to the complete production export and waited for populated catalog cards.
2. Stock columns collided on phone (`qa/stock-390.png`). Replaced the phone table geometry with labelled two-line item records.
3. Checkout expanded beyond 320px (`qa/checkout-320-before.png`); metric amounts cramped at tablet width and daily chart labels crowded on phones. Set minimum-zero form tracks, wrap the payment action, use two tablet metric columns and horizontal phone bars.

ROUND 2
Seen in one second: the production queue and selected storefront object.
Idea (one sentence): shopping and production both start from the atelier's pieces.
Live thing: saved-piece filtering and authenticated order progression.
Layout words by section: hero=sticky split / discovery=list / collection=product shelf / commission=colour field / answers=disclosures.
Scores: design 6.5 · usability 7.5 · creativity 6.5 · content 8 → overall 7.0
Caps applied: existing SVG imagery, design ≤ 6.5.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. `qa/sales-320.png`: the phone chart retained seven desktop columns, crowding every day into one line. Reset to one full-width day per row.
2. `qa/picking-print.png`: the queue's explanatory paragraph appeared above the picking sheet. Hide all non-print siblings in print media.
3. `qa/sales-768.png`: totals competed for narrow columns. Use a two-column tablet strip and a labelled value list below 360px.

ROUND 3 (final)
Seen in one second: product-focused atelier composition; admin's production queue.
Idea (one sentence): the worktable and production stages anchor browsing and operating.
Live thing: actual featured-object switching and the queue's authenticated actions.
Layout words by section: hero=sticky split / discovery=list / collection=product shelf / commission=colour field / answers=disclosures.
Scores: design 6.5 · usability 8 · creativity 6.5 · content 8 → overall 7.1
Caps applied: existing SVG illustrations are not product photography; design ≤ 6.5.
Corrections verified: phone chart rows no longer inherit the desktop seven-column grid; zero days have no bars; stock phone rows preserve the piece, variant, SKU, physical/available quantities and action; tablet totals fit; 320px checkout and light/dark operations fit. Picking-print chrome is suppressed.
Remaining limitation: original product photographs would make a larger visual improvement than further interface decoration. The current drawings remain consistent with the existing catalog and are not presented as photographs.

## Assets and verification

All product imagery remains the project's existing `/produtos/*.svg` assets or
the catalog's configured image URLs. No found photo, clip, generated product
photograph or sample business proof was added; no new image attribution applies.
Replace catalog drawings with actual owner-supplied product photographs when
available. Isolated browser-test customers/orders never belong to storefront
content or production data.

The taste source lint reports zero failures and one acceptable warning: date
zero-padding in the operations aggregation. The stock inspector failed with
`CDP timeout: Page.enable` on both page and app invocations. Therefore no clean
stock-inspector result is claimed. Direct Chrome/Playwright captures and flow
checks are used as the fallback; screenshots/results are under `.taste-skill/`.
Before screenshots were captured from the live version prior to publishing.

Backend verification: 43 tests and structure/type checks; isolated HTTP smoke:
29 checks. Production static build and both Worker dry runs pass. 80 browser flow
checks and 14 final layout checks pass at 1440/768/390/320. Browser flows
exercise discovery/saves, checkout widths, operations, stock/sales, printing,
tracking, CSV and viewer access. Deployment identifiers and final browser counts
are recorded in CURRENTTASK after publication. Final release: 35 live checks
passed with zero page errors. Storefront version
`2a8ca1bf-e956-42d0-9c86-dbc69f302afe`; admin version
`6457d81d-7402-4835-afe4-94b85cc2b9de`. No production commerce mutations.
