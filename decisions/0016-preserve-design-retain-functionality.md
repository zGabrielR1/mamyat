# Preserve the previous design, retain functionality

2026-10-23. The owner clarified that only the redesign should be rolled back;
the new storefront and admin capabilities must remain available.

Restore the original homepage composition, header/footer, fonts, palette,
background treatment, radii and product-card geometry. Existing admin screens
use the previous brand surfaces, serif headings and active-navigation treatment.
Do not apply the rejected split-stage or rose/mulberry direction.

Preserve browser-saved pieces, availability/budget/saved filters, query recovery,
product-gallery selection and the checkout sizing fix. Featured-piece selection
is implemented as small controls within the existing hero photograph frame;
the original hero copy, location, dimensions and surrounding sections remain.

Preserve the operations workspace's production queue, tracking confirmations,
picking printouts, stock priorities/CSV, gross sales/CSV and responsive chart.
Its styles are restricted to its own `.ops-*` classes and use the original brand
tokens. Functional filter/save/checkout styles are similarly scoped. No new
global tokens or changes to existing type/button/navigation styling.

Existing role guards, error recovery, scoped order counts, cancellation/refund
confirmation and keyboard-accessible order opening remain. API, database,
payment and stock contracts are unchanged.

Browser checks assert both original design facts (headline, background,
composition, fonts and card corners) and functional behavior. Publish storefront
and admin together using the existing free Workers deployment.
