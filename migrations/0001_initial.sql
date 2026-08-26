CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_date TEXT NOT NULL,
  claim_hour INTEGER NOT NULL CHECK (claim_hour >= 0 AND claim_hour <= 23),
  product_name TEXT NOT NULL,
  product_url TEXT NOT NULL,
  description TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'expired', 'refunded')),
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  UNIQUE (claim_date, claim_hour)
);

CREATE INDEX IF NOT EXISTS idx_claims_date
ON claims (claim_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_stripe_session
ON claims (stripe_session_id);
