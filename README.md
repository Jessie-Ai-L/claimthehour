# ClaimTheHour V1.3 — PayPal Sandbox

This build connects the existing D1 reservation flow to PayPal Sandbox using PayPal Orders v2.

## Flow

1. Visitor selects an available UTC hour.
2. The Worker creates a 15-minute `pending` reservation in D1.
3. The Worker creates a PayPal Sandbox order for USD $1.00.
4. The buyer approves the payment on PayPal Sandbox.
5. PayPal redirects back to `/api/paypal/return`.
6. The Worker captures the order server-side and verifies `COMPLETED`, USD, and `$1.00`.
7. D1 changes the claim from `pending` to `paid`.
8. The board displays the product as `CLAIMED`.

## Cloudflare runtime variables required

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET` (Secret)
- `PAYPAL_ENV=sandbox`

`keep_vars: true` is included in `wrangler.jsonc` so dashboard-managed text variables remain when Git deployment runs.

## Database note

For this Sandbox MVP, the existing columns are reused:
- `stripe_session_id` = PayPal Order ID
- `stripe_payment_intent_id` = PayPal Capture ID

No D1 migration is required for this test build.

## Next after the Sandbox test

Add a PayPal webhook for payment-event redundancy, then switch credentials and `PAYPAL_ENV` to Live.
