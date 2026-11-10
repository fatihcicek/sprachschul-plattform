-- Anmeldung: Mandantentrennung für Passwörter, Einladungen und Anmeldeversuche.

ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credentials FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON credentials
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invitations
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE login_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON login_attempts
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
--> statement-breakpoint
ALTER TABLE invitations ADD CONSTRAINT invitations_expiry_valid CHECK (expires_at > created_at);
