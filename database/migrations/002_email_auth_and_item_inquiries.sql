-- Additive email-link authentication and pre-request item messaging support.
-- Existing accounts remain verified; new registrations set email_verified=false.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
UPDATE users SET email_verified=TRUE WHERE email_verified IS NULL;
UPDATE users SET auth_version=0 WHERE auth_version IS NULL;
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;
ALTER TABLE users ALTER COLUMN auth_version SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN auth_version SET NOT NULL;

CREATE TABLE IF NOT EXISTS auth_email_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('login_approval','email_verification','password_reset')),
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (length(token_hash)=64),
  challenge_hash CHAR(64) CHECK (challenge_hash IS NULL OR length(challenge_hash)=64),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_user_purpose ON auth_email_tokens(user_id,purpose,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_challenge ON auth_email_tokens(challenge_hash,purpose) WHERE challenge_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS item_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id,requester_id),
  CHECK(requester_id<>owner_id)
);
CREATE INDEX IF NOT EXISTS idx_item_inquiries_owner_created ON item_inquiries(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_inquiries_requester_created ON item_inquiries(requester_id,created_at DESC);

ALTER TABLE messages ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS inquiry_id UUID REFERENCES item_inquiries(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_context_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_context_check
      CHECK ((request_id IS NOT NULL) <> (inquiry_id IS NOT NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_messages_inquiry_created ON messages(inquiry_id,created_at) WHERE inquiry_id IS NOT NULL;
