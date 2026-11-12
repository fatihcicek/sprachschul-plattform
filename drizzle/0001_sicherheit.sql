-- Sicherheitsregeln, die in der Datenbank selbst gelten, unabhängig vom Anwendungscode.
--
-- 1. Mandantentrennung: Jede Verbindung sieht und schreibt nur Zeilen der Schule,
--    die sie zu Beginn der Transaktion in app.organization_id gesetzt hat.
--    Ohne gesetzte Schule sieht sie nichts.
-- 2. Unveränderliche Protokolle: Einwahlprotokoll, Korrekturen und Vorgangsprotokoll
--    können nur ergänzt, nie geändert oder gelöscht werden.
-- 3. Plausibilitätsregeln für Termine und Bestätigungen.

CREATE FUNCTION app_current_organization() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.organization_id', true), '')::uuid $$;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations
  USING (id = app_current_organization())
  WITH CHECK (id = app_current_organization());
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON courses
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON enrollments
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE teaching_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE teaching_assignments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON teaching_assignments
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE lesson_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lesson_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lesson_sessions
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE connection_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE connection_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON connection_events
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON attendance_records
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attendance_corrections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON attendance_corrections
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE class_register_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_register_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON class_register_entries
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_events
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
CREATE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Tabelle % ist unveränderlich: % ist nicht erlaubt', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER connection_events_no_change BEFORE UPDATE OR DELETE ON connection_events
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER connection_events_no_truncate BEFORE TRUNCATE ON connection_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER attendance_corrections_no_change BEFORE UPDATE OR DELETE ON attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER attendance_corrections_no_truncate BEFORE TRUNCATE ON attendance_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_change BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
ALTER TABLE courses ADD CONSTRAINT courses_dates_ordered CHECK (end_date >= start_date);
--> statement-breakpoint
ALTER TABLE lesson_sessions ADD CONSTRAINT lesson_sessions_times_ordered CHECK (ends_at > starts_at);
--> statement-breakpoint
ALTER TABLE lesson_sessions ADD CONSTRAINT lesson_sessions_ue_fit CHECK (
  planned_ue > 0 AND planned_ue * 45 <= extract(epoch FROM (ends_at - starts_at)) / 60
);
--> statement-breakpoint
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_minutes_valid CHECK (present_minutes >= 0);
--> statement-breakpoint
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_confirmation_complete CHECK (
  (review_state = 'CONFIRMED') = (confirmed_by_membership_id IS NOT NULL AND confirmed_at IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE attendance_corrections ADD CONSTRAINT attendance_corrections_reason_given CHECK (length(btrim(reason)) > 0);
