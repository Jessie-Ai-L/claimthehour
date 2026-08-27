# ClaimTheHour V1.6.1 — SEO route fix

Fixes a routing mistake in V1.6:
- `/robots.txt` is now handled in the actual Worker fetch router
- `/sitemap.xml` is now handled in the actual Worker fetch router
- both routes execute before the homepage fallback

All V1.6 homepage SEO metadata remains intact.

No payment, D1, hold, claim, UI, or webhook business logic changed.
No database migration required.
