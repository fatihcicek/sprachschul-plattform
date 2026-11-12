CREATE TABLE "class_register_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"content" text NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "class_register_versions" ADD CONSTRAINT "class_register_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_register_versions" ADD CONSTRAINT "class_register_versions_session_id_organization_id_lesson_sessions_id_organization_id_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."lesson_sessions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_register_versions" ADD CONSTRAINT "class_register_versions_author_membership_id_organization_id_memberships_id_organization_id_fk" FOREIGN KEY ("author_membership_id","organization_id") REFERENCES "public"."memberships"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_register_versions_organization_id_session_id_created_at_index" ON "class_register_versions" USING btree ("organization_id","session_id","created_at");