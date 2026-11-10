ALTER TABLE "courses" ADD COLUMN "bamf_course_number" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "mode" "delivery_mode" DEFAULT 'VIRTUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "bamf_funded" boolean DEFAULT false NOT NULL;