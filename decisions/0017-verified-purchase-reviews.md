# 0017: Verified purchase reviews with admin moderation

Product reviews were partially implemented in the working tree. Complete the
existing feature without changing the restored storefront design or payment rails.

Customers submit through `POST /api/reviews` with a product, rating and real order
ID. Both Python and Edge require that the signed-in customer owns that order,
that it contains the product, and that its status is paid, packing, shipped or
delivered. Guest order email alone does not authorize a review. Ratings are
integers from 1 to 5; names and comments are optional and bounded. Each order and
product pair can be reviewed once, including pending or rejected submissions.
Client-supplied moderation status is ignored.

Public list/detail responses expose approved reviews only and omit order IDs,
moderation status and internal timestamps. New reviews always start pending.
The separate admin origin serves `/admin/avaliacoes` and `/api/admin/reviews`;
approval, rejection and deletion use the existing admin role guards. Viewers
can read the queue but cannot moderate. Deletion requires browser confirmation.

Reviews use the existing JSONB collection storage seam (`reviews`), without a
new dependency or schema migration. Edge submissions and duplicate checks run
inside the existing advisory-locked transaction; Python duplicate insertion is
an atomic store update. Publishing requires both the Edge API and Worker export;
deploying only the frontend leaves the new API unavailable.

Regression checks: `python -m unittest api.tests.test_reviews -v` exercises
purchase validation, moderation privacy, duplicate prevention, strict ratings,
deletion and real HTTP permission checks. `npm run test:reviews` exercises the
matching Edge routes and viewer guards without network or production data.

Follow-up (2026-10-28): Edge product detail now returns `review_stats`, matching
Python. Counts, average and distribution include approved reviews of that
product only; moderation changes are reflected on the next request. The Edge
review checks cover this response for both slug and ID lookups.
