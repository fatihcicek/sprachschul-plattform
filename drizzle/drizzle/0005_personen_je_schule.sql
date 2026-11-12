-- Personen gehören ab jetzt genau einer Schule (organization_id), mit der
-- gleichen Zeilensicherheit wie alle Schultabellen. Bestehende Personen
-- bekommen die Schule ihrer Mitgliedschaft.
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
-- Der Eigentümer unterliegt (FORCE) selbst der Zeilensicherheit; für das Übertragen
-- und die Prüfung der neuen Verknüpfungen kurz aussetzen (alles in einer Transaktion).
ALTER TABLE "memberships" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "users" u SET "organization_id" = m."organization_id" FROM "memberships" m WHERE m."user_id" = u."id";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_email_unique" UNIQUE("organization_id","email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_organization_id_users_id_organization_id_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "users"
  USING (organization_id = app_current_organization())
  WITH CHECK (organization_id = app_current_organization());
