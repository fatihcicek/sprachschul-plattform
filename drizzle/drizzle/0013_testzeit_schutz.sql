-- Status und Ende der Testzeit einer Schule dürfen nicht aus der App heraus geändert werden
-- (z. B. um sich selbst freizuschalten oder die Testzeit zu verlängern). Nur das Betreiber-Skript
-- setzt dafür den Schalter app.operator. Neue Schulen anzulegen (INSERT) bleibt unberührt.
CREATE OR REPLACE FUNCTION guard_organization_access() RETURNS trigger AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at)
     AND coalesce(current_setting('app.operator', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Status und Testzeit einer Schule ändert nur der Betreiber' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER organizations_guard_access BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION guard_organization_access();
