# ClaimTheHour V1.4 — PayPal Sandbox Webhooks

This build keeps the validated PayPal Sandbox return/capture flow and adds a signed webhook endpoint:

`POST https://claimthehour.com/api/paypal/webhook`

## Webhook events to subscribe

- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `CHECKOUT.PAYMENT-APPROVAL.REVERSED`

## Why ORDER.APPROVED matters

If the buyer approves PayPal and closes the browser before returning to ClaimTheHour,
the webhook can still capture the approved order server-side.

`PAYMENT.CAPTURE.COMPLETED` then acts as a final reconciliation path.

## Security

Every webhook is verified with PayPal's
`/v1/notifications/verify-webhook-signature` endpoint before processing.

The Worker requires these Cloudflare runtime variables:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV=sandbox`
- `PAYPAL_WEBHOOK_ID` (add this after creating the Sandbox webhook)

## Idempotency

Duplicate webhooks are safe:
- capture uses the same PayPal request id per order
- D1 only transitions `pending -> paid`
- already-paid claims are treated as successful no-ops

## No D1 migration required
The existing schema remains compatible with this Sandbox build.
