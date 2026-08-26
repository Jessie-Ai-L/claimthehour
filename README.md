# ClaimTheHour V1.2 — D1 integrated

This build connects the live board to Cloudflare D1.

## What works
- Reads today's claims from D1
- Shows paid claims as CLAIMED
- Shows active pending reservations as HELD
- Claim form validates product name, URL, description
- Creates a 15-minute pending reservation in D1
- Automatically releases stale pending reservations
- Uses UTC consistently for the daily board
- Keeps the existing polished V1.1 UI

## Not connected yet
Stripe Checkout is intentionally not connected in this build. After a reservation is created, the UI clearly says payment is the next step.

## D1 binding
`wrangler.jsonc` includes:
- binding: `DB`
- database: `claimthehour-db`

The existing Cloudflare D1 binding and database are preserved by configuration.
