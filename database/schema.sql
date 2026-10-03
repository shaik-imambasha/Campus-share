CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name VARCHAR(120) NOT NULL,email VARCHAR(255) NOT NULL UNIQUE,password_hash TEXT NOT NULL,phone VARCHAR(20),college VARCHAR(160),department VARCHAR(120),year INTEGER CHECK(year IS NULL OR year BETWEEN 1 AND 6),hostel VARCHAR(160),profile_image TEXT,role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK(role IN('student','admin')),status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name VARCHAR(80) NOT NULL UNIQUE,description TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,category_id UUID REFERENCES categories(id) ON DELETE SET NULL,title VARCHAR(160) NOT NULL,description TEXT NOT NULL,condition VARCHAR(20) NOT NULL CHECK(condition IN('new','like_new','good','used')),type VARCHAR(20) NOT NULL CHECK(type IN('lend','donate','exchange')),status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK(status IN('available','requested','shared','completed','unavailable')),location VARCHAR(160),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS item_images(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,image_url TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS requests(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,message TEXT,status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected','cancelled')),requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),responded_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,borrower_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE RESTRICT,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expected_return_date DATE,returned_at TIMESTAMPTZ,status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN('active','returned','cancelled')));
CREATE TABLE IF NOT EXISTS notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,type VARCHAR(60) NOT NULL,title VARCHAR(160) NOT NULL,message TEXT NOT NULL,is_read BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS reports(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,reported_item_id UUID REFERENCES items(id) ON DELETE SET NULL,reason VARCHAR(120) NOT NULL,description TEXT,status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewing','resolved','dismissed')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS idx_items_owner_id ON items(owner_id);CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);CREATE INDEX IF NOT EXISTS idx_requests_item_id ON requests(item_id);CREATE INDEX IF NOT EXISTS idx_requests_requester_id ON requests(requester_id);CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
INSERT INTO categories(name,description) VALUES('Books','Academic and general books'),('Study Materials','Notes, calculators, stationery, and learning resources'),('Electronics','Useful electronic accessories and devices'),('Hostel Items','Reusable hostel and everyday campus items'),('Sports','Sports equipment and accessories'),('Others','Other useful campus items') ON CONFLICT(name) DO NOTHING;

-- Additive Rent & Reuse workflow tables and fields.
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
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS price_per_day NUMERIC(10,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2) NOT NULL DEFAULT 0;
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


ALTER TABLE transactions ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS owner_return_confirmed_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS borrower_return_confirmed_at TIMESTAMPTZ;
