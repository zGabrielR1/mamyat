# Atelier discovery and operations

**VISUAL DIRECTION REJECTED by the owner on 2026-10-23.** The owner subsequently
clarified that the functional capabilities must be retained in the previous
design. Decision 0016 supersedes the visual decisions here; the operations and
commerce-function descriptions remain applicable.

2026-10-23. Requested: substantial storefront/admin redesign and deployment,
using the taste skill and the operator project's workflow mindset.

Keep Next/React, the two free Cloudflare Workers and the existing Python/Edge
commerce contracts. No migration, payment-provider change or new dependency.

The storefront follows the split-stage direction: the selected catalog object
stays beside the shopping guidance on desktop; phones place the buying action
before the object. Existing serif/sans brand faces remain. Rose paper and
mulberry replace the cream/espresso surfaces, with neutral dark surfaces.

New customer capabilities: switch the featured object, browse by occasion,
save product IDs on this browser, filter by availability/budget/saved pieces,
recover from failed/empty searches, and select images on a product detail page.
The server still calculates checkout totals and enforces availability.

New `/admin/operacao` groups authenticated orders by production/dispatch/delivery,
oldest first. Search and delivery filters scope the queue. A confirmation precedes
each transition; posted deliveries require tracking in this workflow. Viewers
can inspect and print but receive no mutation controls. Existing API role checks
remain authoritative.

Picking lists fetch current full snapshots only for explicitly selected paid or
packing orders. If any selected order changed stage, printing stops with an
explanation. Stock priorities use available quantity (including reservations)
and distinguish physical stock; made-to-order/inactive products are excluded.
Stock and confirmed-sales exports use the existing escaped CSV helper.

Revenue is gross order value for current paid/packing/shipped/delivered states,
grouped by order creation date. It includes shipping and discounts, excludes
cancelled/refunded/awaiting records, and does not claim provider settlement,
profit, or net revenue. The seven-day chart states its own period separately.

Existing order actions now confirm cancellation/refund registration; refund copy
explicitly says the provider refund must be completed separately. Filter counts
follow the current date/search scope. The dashboard can recover from initial
load failure. Admin navigation folds on tablet and phone.

Design evidence and limitations: `docs/design-review-2026-10-23.md`.
