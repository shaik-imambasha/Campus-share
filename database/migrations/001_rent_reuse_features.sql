-- Additive CampusShare workflow enhancements. Safe to run more than once.
ALTER TABLE items ADD COLUMN IF NOT EXISTS price_per_day NUMERIC(10,2);
ALTER TABLE items ADD COLUMN IF NOT EXISTS available_from DATE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS available_until DATE;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_type_check;
ALTER TABLE items ADD CONSTRAINT items_type_check CHECK (type IN ('lend','donate','exchange','borrow','rent','both'));
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_price_per_day_check;
ALTER TABLE items ADD CONSTRAINT items_price_per_day_check CHECK (price_per_day IS NULL OR price_per_day >= 0);
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_availability_range_check;
ALTER TABLE items ADD CONSTRAINT items_availability_range_check CHECK (available_from IS NULL OR available_until IS NULL OR available_until >= available_from);

ALTER TABLE requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) NOT NULL DEFAULT 'borrow';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;
ALTER TABLE requests ADD CONSTRAINT requests_type_check CHECK (request_type IN ('borrow','rent','donate','exchange'));
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_date_range_check;
ALTER TABLE requests ADD CONSTRAINT requests_date_range_check CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) NOT NULL DEFAULT 'borrow';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS price_per_day NUMERIC(10,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS owner_return_confirmed_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS borrower_return_confirmed_at TIMESTAMPTZ;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('active','returned','completed','cancelled'));

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_request_created ON messages(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread ON messages(recipient_id, read_at);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT CHECK (body IS NULL OR length(body) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, reviewer_id),
  CHECK (reviewer_id <> reviewee_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
