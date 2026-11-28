-- Random equipment affixes (shared/rules/affix.ts): the extra bonuses an equipment row rolled when it dropped, [{k, v}, ...].
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS affixes jsonb NOT NULL DEFAULT '[]';
