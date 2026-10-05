-- Add per-user saved items without changing existing listing data.
CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_item_id ON favorites(item_id);
