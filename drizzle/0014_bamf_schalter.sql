ALTER TABLE "organizations" ADD COLUMN "bamf_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "bamf_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Auch die Wahl "BAMF-Funktionen" einer offenen Registrierung ist nach dem Anlegen unveränderlich.
CREATE OR REPLACE FUNCTION guard_registration() RETURNS trigger
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
     OR NEW.bamf_enabled IS DISTINCT FROM OLD.bamf_enabled
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Angaben einer Registrierung sind unveränderlich.';
  END IF;
  RETURN NEW;
END;
$$;
