# ClaimTheHour V1.7.1 — Viral Share Hotfix

Fixes a browser-side JavaScript quoting bug introduced in V1.7.

Symptoms fixed:
- Today's date showed —
- Time left showed —
- Current UTC time showed —
- Board incorrectly appeared as 24/24 available
- Existing D1 claims appeared missing

The existing D1 claim records were not intentionally deleted. The browser script was failing before it fetched and rendered `/api/board`.

No PayPal, D1 schema, webhook, or payment logic changes.
