-- The Adventure Book (shared/rules/collection.ts): what each character has met and found, and the milestones it has claimed.
CREATE TABLE IF NOT EXISTS collection (
  char_id int  NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kind    text NOT NULL,          -- mob | variant | card
  ref     int  NOT NULL,          -- mob id / variant id / card item id
  count   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (char_id, kind, ref)
);
CREATE TABLE IF NOT EXISTS collection_claim (
  char_id   int  NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  milestone text NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (char_id, milestone)   -- a milestone pays once
);
