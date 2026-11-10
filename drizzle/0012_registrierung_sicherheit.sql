-- Registrierung: Sicherheitsregeln in der Datenbank.
--
-- registrations und registration_attempts gehören keiner Schule (sie existieren vor der Schule),
-- also gilt hier nicht organization_id. Stattdessen sieht eine Verbindung nur Zeilen, für die sie
-- das Geheimnis kennt: den Hash des Bestätigungslinks bzw. die Zählschlüssel. Ohne diese
-- Angaben liefert jede Abfrage nichts.

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE registrations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Aufräumen: Ein DELETE mit WHERE muss die Zeilen auch lesen dürfen. Dafür gibt es einen eigenen Schalter,
-- der nur abgelaufene Registrierungen freigibt (Datensparsamkeit), nie gültige.
CREATE POLICY reg_select ON registrations FOR SELECT
  USING (token_hash = nullif(current_setting('app.registration_token_hash', true), '')
         OR (current_setting('app.registration_purge', true) = '1' AND expires_at < now()));
--> statement-breakpoint
CREATE POLICY reg_insert ON registrations FOR INSERT
  WITH CHECK (token_hash = nullif(current_setting('app.registration_token_hash', true), ''));
--> statement-breakpoint
CREATE POLICY reg_update ON registrations FOR UPDATE
  USING (token_hash = nullif(current_setting('app.registration_token_hash', true), ''))
  WITH CHECK (token_hash = nullif(current_setting('app.registration_token_hash', true), ''));
--> statement-breakpoint
CREATE POLICY reg_delete ON registrations FOR DELETE
  USING (token_hash = nullif(current_setting('app.registration_token_hash', true), '')
         OR (current_setting('app.registration_purge', true) = '1' AND expires_at < now()));
--> statement-breakpoint
ALTER TABLE registrations ADD CONSTRAINT registrations_expiry_valid CHECK (expires_at > created_at);
--> statement-breakpoint
-- Eine Registrierung gilt genau einmal und ihre Angaben ändern sich nie; nur used_at wird gesetzt.
CREATE FUNCTION guard_registration() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Diese Registrierung wurde schon bestätigt.';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.school_name IS DISTINCT FROM OLD.school_name OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.terms_version IS DISTINCT FROM OLD.terms_version OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Angaben einer Registrierung sind unveränderlich.';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER registrations_guard BEFORE UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION guard_registration();
--> statement-breakpoint
ALTER TABLE registration_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE registration_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY att_select ON registration_attempts FOR SELECT
  USING (key_hash = ANY (string_to_array(coalesce(current_setting('app.registration_keys', true), ''), ',')));
--> statement-breakpoint
CREATE POLICY att_insert ON registration_attempts FOR INSERT
  WITH CHECK (key_hash = ANY (string_to_array(coalesce(current_setting('app.registration_keys', true), ''), ',')));
--> statement-breakpoint
CREATE POLICY att_delete ON registration_attempts FOR DELETE
  USING (attempted_at < now() - interval '1 day'
         OR key_hash = ANY (string_to_array(coalesce(current_setting('app.registration_keys', true), ''), ',')));
--> statement-breakpoint
ALTER TABLE organizations ADD CONSTRAINT organizations_trial_has_end CHECK (status <> 'TRIAL' OR trial_ends_at IS NOT NULL);
