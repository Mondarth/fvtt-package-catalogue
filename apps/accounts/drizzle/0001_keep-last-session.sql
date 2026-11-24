-- Keeps each user's latest session after it ends (last_sessions), against fraud: a new or refreshed session replaces
-- it, and one deleted (signed out, or expired) marks when it ended. An admin's session viewing the site as the user is
-- not theirs, and not kept. A session refreshed by Better Auth keeps the address and browser the accounts saw it from
-- (access.ts `seen`): Better Auth's own address is only the first X-Forwarded-For value, or localhost without one, so
-- it is taken only for a session not seen yet.
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
    started_at = EXCLUDED.started_at,
    last_active_at = greatest(last_sessions.last_active_at, EXCLUDED.last_active_at),
    ended_at = NULL,
    ip_address = CASE WHEN last_sessions.session_id = EXCLUDED.session_id THEN last_sessions.ip_address ELSE EXCLUDED.ip_address END,
    user_agent = CASE WHEN last_sessions.session_id = EXCLUDED.session_id THEN last_sessions.user_agent ELSE EXCLUDED.user_agent END,
    client_id = EXCLUDED.client_id,
    session_id = EXCLUDED.session_id
  -- An older session refreshed after a newer one began is still the latest used.
  WHERE last_sessions.session_id = EXCLUDED.session_id OR last_sessions.last_active_at <= EXCLUDED.last_active_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER sessions_keep_last AFTER INSERT OR UPDATE OR DELETE ON sessions
  FOR EACH ROW EXECUTE FUNCTION keep_last_session();
