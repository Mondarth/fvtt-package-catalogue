-- Keeps each user's latest session after it ends (last_sessions), against fraud: a new or refreshed session replaces
-- it, and one deleted (signed out, or expired) marks when it ended. An admin's session viewing the site as the user is
-- not theirs, and not kept.
CREATE OR REPLACE FUNCTION keep_last_session() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE last_sessions SET ended_at = now() WHERE user_id = OLD.user_id AND session_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.impersonated_by IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO last_sessions (user_id, session_id, started_at, last_active_at, ended_at, ip_address, user_agent, client_id)
  VALUES (NEW.user_id, NEW.id, NEW.created_at, NEW.updated_at, NULL, NEW.ip_address, NEW.user_agent, NEW.client_id)
  ON CONFLICT (user_id) DO UPDATE SET
    session_id = EXCLUDED.session_id,
    started_at = EXCLUDED.started_at,
    last_active_at = EXCLUDED.last_active_at,
    ended_at = NULL,
    ip_address = EXCLUDED.ip_address,
    user_agent = EXCLUDED.user_agent,
    client_id = EXCLUDED.client_id
  -- An older session refreshed after a newer one began is still the latest used.
  WHERE last_sessions.last_active_at <= EXCLUDED.last_active_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER sessions_keep_last AFTER INSERT OR UPDATE OR DELETE ON sessions
  FOR EACH ROW EXECUTE FUNCTION keep_last_session();
--> statement-breakpoint
-- Each user's latest session signed in now, to start with.
INSERT INTO last_sessions (user_id, session_id, started_at, last_active_at, ip_address, user_agent, client_id)
SELECT DISTINCT ON (user_id) user_id, id, created_at, updated_at, ip_address, user_agent, client_id
FROM sessions
WHERE impersonated_by IS NULL
ORDER BY user_id, updated_at DESC
ON CONFLICT (user_id) DO NOTHING;
