# ClaimTheHour V1.6.2 — Live copy cleanup

Built from the uploaded V1.6.1 source.

User-facing cleanup:
- removed PayPal Sandbox label from checkout modal
- removed Sandbox/test-payment language from How it works
- updated FAQ to state that $1 USD PayPal payments are real transactions
- replaced the Sandbox-only checkout note with a live PayPal security note

Important:
- backend `sandbox` references remain intentionally in the environment-switching code so PAYPAL_ENV can still select sandbox vs live.
- PayPal logic, D1, webhook, holds, claims, SEO, and UI layout are unchanged.
