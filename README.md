# ClaimTheHour V1.3.1 — PayPal Sandbox cancellation safeguard

This patch fixes the payment-state issue found during cancellation testing.

## Critical change

A redirect back from PayPal is no longer treated as sufficient evidence of payment approval.

Before Capture, the Worker now retrieves the PayPal order and requires:

- PayPal order status = `APPROVED`
- amount = `1.00`
- currency = `USD`
- `custom_id` matches the D1 reservation ID

Only then will the Worker call PayPal Capture.

After Capture, the Worker additionally requires:

- order status = `COMPLETED`
- capture status = `COMPLETED`
- captured amount = `1.00 USD`

Only after all checks pass does D1 change from `pending` to `paid`.

If approval is missing, the D1 claim remains `pending`/HELD and will expire under the normal 15-minute cleanup rule.

## Required Cloudflare runtime variables

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV=sandbox`

No D1 migration is required.
