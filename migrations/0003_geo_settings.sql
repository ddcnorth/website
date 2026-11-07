-- Visitor coordinates (Cloudflare's estimate for the IP), country restrictions, per-share
-- PostHog opt-out and admin-editable settings.

ALTER TABLE sessions ADD COLUMN latitude REAL;
ALTER TABLE sessions ADD COLUMN longitude REAL;
ALTER TABLE events ADD COLUMN latitude REAL;
ALTER TABLE events ADD COLUMN longitude REAL;

-- JSON array of ISO 3166-1 alpha-2 codes the share can be opened from; [] = anywhere.
ALTER TABLE grants ADD COLUMN allowed_countries TEXT NOT NULL DEFAULT '[]';
-- 1 = send this share's portal events to PostHog (when PostHog is configured), 0 = never.
ALTER TABLE grants ADD COLUMN posthog INTEGER NOT NULL DEFAULT 1;

-- Small key/value store for settings changed from /admin (JSON values).
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  INTEGER NOT NULL
);
