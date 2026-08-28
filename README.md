# ClaimTheHour V1.7.2 — Claimed Card Sharing

Adds a no-payment way to validate and reuse Viral Share.

New:
- Existing CLAIMED cards are clickable.
- Clicking a CLAIMED card opens the share panel.
- Share on X, Share on Reddit, and Copy Link work for existing claims.
- Shared `?hour=` links reopen the matching claimed hour's share panel.
- The Visit button still opens the product without triggering the share panel.
- Paid-return flow keeps the original "You claimed..." owner wording.

Unchanged:
- PayPal Live payment logic
- PayPal webhook
- D1 schema/data
- Reservation/hold/capture logic
- SEO/legal routes
