-- Aufgaben: Mandantentrennung und unveränderliche Abgabeversionen und Rückmeldungen.

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE assignments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON assignments
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE submissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON submissions
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE submission_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE submission_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON submission_versions
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE feedbacks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON feedbacks
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
CREATE TRIGGER submission_versions_no_change BEFORE UPDATE OR DELETE ON submission_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER submission_versions_no_truncate BEFORE TRUNCATE ON submission_versions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER feedbacks_no_change BEFORE UPDATE OR DELETE ON feedbacks
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER feedbacks_no_truncate BEFORE TRUNCATE ON feedbacks
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
ALTER TABLE submission_versions ADD CONSTRAINT submission_versions_no_valid CHECK (version_no >= 1);
