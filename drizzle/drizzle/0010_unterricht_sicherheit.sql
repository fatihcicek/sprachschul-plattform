-- Unterricht: Schutz der Nachweise in der Datenbank selbst, unabhängig vom Anwendungscode.
-- 1. Bestätigte Anwesenheit ändert sich nur mit einer Korrektur samt Begründung im selben Vorgang.
-- 2. Klassenbuch: jede Fassung bleibt erhalten; nach Abschluss des Termins gesperrt.
-- 3. Ein abgeschlossener Termin wird nicht wieder geöffnet.

CREATE FUNCTION guard_confirmed_attendance() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.review_state = 'CONFIRMED' THEN
      RAISE EXCEPTION 'Bestätigte Anwesenheit kann nicht gelöscht werden';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.review_state = 'CONFIRMED' THEN
    IF NEW.review_state <> 'CONFIRMED'
       OR NEW.session_id <> OLD.session_id
       OR NEW.membership_id <> OLD.membership_id
       OR NEW.present_minutes <> OLD.present_minutes
       OR NEW.confirmed_by_membership_id IS DISTINCT FROM OLD.confirmed_by_membership_id
       OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
      RAISE EXCEPTION 'Bestätigte Anwesenheit kann nur über eine Korrektur geändert werden';
    END IF;
    IF NEW.status <> OLD.status AND NOT EXISTS (
      SELECT 1 FROM attendance_corrections c
      WHERE c.attendance_record_id = OLD.id AND c.from_status = OLD.status AND c.to_status = NEW.status AND c.created_at = now()
    ) THEN
      RAISE EXCEPTION 'Änderung bestätigter Anwesenheit braucht eine Korrektur mit Begründung';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER attendance_records_guard BEFORE UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION guard_confirmed_attendance();
--> statement-breakpoint
CREATE TRIGGER attendance_records_no_truncate BEFORE TRUNCATE ON attendance_records
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE FUNCTION guard_closed_register() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT status FROM lesson_sessions WHERE id = NEW.session_id) = 'CLOSED' THEN
    RAISE EXCEPTION 'Das Klassenbuch ist nach Abschluss des Termins gesperrt';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER class_register_entries_guard BEFORE INSERT OR UPDATE ON class_register_entries
  FOR EACH ROW EXECUTE FUNCTION guard_closed_register();
--> statement-breakpoint
CREATE TRIGGER class_register_entries_no_delete BEFORE DELETE ON class_register_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER class_register_entries_no_truncate BEFORE TRUNCATE ON class_register_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
ALTER TABLE class_register_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_register_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON class_register_versions
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
CREATE TRIGGER class_register_versions_no_change BEFORE UPDATE OR DELETE ON class_register_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER class_register_versions_no_truncate BEFORE TRUNCATE ON class_register_versions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE FUNCTION guard_closed_session() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'Ein abgeschlossener Termin kann nicht wieder geöffnet werden';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER lesson_sessions_closed_guard BEFORE UPDATE ON lesson_sessions
  FOR EACH ROW EXECUTE FUNCTION guard_closed_session();
