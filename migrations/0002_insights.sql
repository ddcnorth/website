-- Visitor network and per-space PostHog options.

-- Cloudflare's AS organisation for the visitor's IP (an ISP, company or university network).
ALTER TABLE sessions ADD COLUMN as_org TEXT;
ALTER TABLE sessions ADD COLUMN timezone TEXT;
ALTER TABLE events ADD COLUMN as_org TEXT;

-- PostHog in a space's pages: 0 = off, 1 = page views and clicks, 2 = also session replay.
-- Server-side portal events go to PostHog whenever POSTHOG_KEY is set, independent of this.
ALTER TABLE spaces ADD COLUMN posthog INTEGER NOT NULL DEFAULT 0;

CREATE INDEX events_session ON events(session_id, ts);
