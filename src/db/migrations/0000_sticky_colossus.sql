CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"auth_provider" text,
	"auth_provider_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"email" text,
	"initials" text,
	"avatar_url" text,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"deletion_type" text NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL,
	"restore_until" timestamp with time zone NOT NULL,
	"deleted_by_practitioner_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_groups_deletion_type_check" CHECK ("deletion_groups"."deletion_type" in ('patient-data', 'booking', 'session', 'service')),
	CONSTRAINT "deletion_groups_restore_window_check" CHECK ("deletion_groups"."restore_until" > "deletion_groups"."deleted_at")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_name" text,
	"last_name" text,
	"display_name" text NOT NULL,
	"birth_date" date,
	"gender" text,
	"phone" text,
	"email" text,
	"preferred_language" text,
	"fhir_json" jsonb,
	"search_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"restore_until" timestamp with time zone,
	"deleted_by_practitioner_id" uuid,
	"deletion_group_id" uuid,
	"deletion_type" text,
	"deletion_reason" text,
	CONSTRAINT "patients_gender_check" CHECK ("patients"."gender" is null or "patients"."gender" in ('male', 'female', 'other', 'prefer_not_to_say')),
	CONSTRAINT "patients_deletion_type_check" CHECK ("patients"."deletion_type" is null or "patients"."deletion_type" in ('patient-data', 'booking', 'session', 'service')),
	CONSTRAINT "patients_restore_window_check" CHECK ("patients"."restore_until" is null or "patients"."deleted_at" is null or "patients"."restore_until" > "patients"."deleted_at")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"price_cents" integer,
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"restore_until" timestamp with time zone,
	"deleted_by_practitioner_id" uuid,
	"deletion_group_id" uuid,
	"deletion_type" text,
	"deletion_reason" text,
	CONSTRAINT "services_duration_minutes_check" CHECK ("services"."duration_minutes" > 0),
	CONSTRAINT "services_price_cents_check" CHECK ("services"."price_cents" is null or "services"."price_cents" >= 0),
	CONSTRAINT "services_deletion_type_check" CHECK ("services"."deletion_type" is null or "services"."deletion_type" in ('patient-data', 'booking', 'session', 'service')),
	CONSTRAINT "services_restore_window_check" CHECK ("services"."restore_until" is null or "services"."deleted_at" is null or "services"."restore_until" > "services"."deleted_at")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"service_id" uuid,
	"service_name" text NOT NULL,
	"service_duration_minutes" integer NOT NULL,
	"resource" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"status_updated_at" timestamp with time zone,
	"notes" text,
	"external_source" text,
	"external_calendar_id" text,
	"external_event_id" text,
	"external_sync_status" text,
	"external_last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"restore_until" timestamp with time zone,
	"deleted_by_practitioner_id" uuid,
	"deletion_group_id" uuid,
	"deletion_type" text,
	"deletion_reason" text,
	CONSTRAINT "bookings_status_check" CHECK ("bookings"."status" in ('confirmed', 'pending', 'in-progress', 'cancelled', 'completed', 'no-show')),
	CONSTRAINT "bookings_external_source_check" CHECK ("bookings"."external_source" is null or "bookings"."external_source" in ('google')),
	CONSTRAINT "bookings_external_sync_status_check" CHECK ("bookings"."external_sync_status" is null or "bookings"."external_sync_status" in ('imported', 'synced', 'pending', 'error')),
	CONSTRAINT "bookings_time_order_check" CHECK ("bookings"."end_at" > "bookings"."start_at"),
	CONSTRAINT "bookings_service_duration_minutes_check" CHECK ("bookings"."service_duration_minutes" > 0),
	CONSTRAINT "bookings_deletion_type_check" CHECK ("bookings"."deletion_type" is null or "bookings"."deletion_type" in ('patient-data', 'booking', 'session', 'service')),
	CONSTRAINT "bookings_restore_window_check" CHECK ("bookings"."restore_until" is null or "bookings"."deleted_at" is null or "bookings"."restore_until" > "bookings"."deleted_at")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"booking_id" uuid,
	"service_id" uuid,
	"service_name" text,
	"start_at" timestamp with time zone NOT NULL,
	"chief_complaint" text NOT NULL,
	"treatment_summary" text,
	"outcome" text,
	"treatment_notes" text,
	"pain_score" integer,
	"tcm_diagnosis" text,
	"tcm_findings" jsonb,
	"points_used" text[],
	"techniques" text[],
	"basic_vitals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"restore_until" timestamp with time zone,
	"deleted_by_practitioner_id" uuid,
	"deletion_group_id" uuid,
	"deletion_type" text,
	"deletion_reason" text,
	CONSTRAINT "sessions_pain_score_check" CHECK ("sessions"."pain_score" is null or "sessions"."pain_score" between 0 and 10),
	CONSTRAINT "sessions_deletion_type_check" CHECK ("sessions"."deletion_type" is null or "sessions"."deletion_type" in ('patient-data', 'booking', 'session', 'service')),
	CONSTRAINT "sessions_restore_window_check" CHECK ("sessions"."restore_until" is null or "sessions"."deleted_at" is null or "sessions"."restore_until" > "sessions"."deleted_at")
);
--> statement-breakpoint
CREATE TABLE "google_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"google_user_email" text,
	"selected_calendar_id" text,
	"selected_calendar_name" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"token_expiry" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "oauth_states_expires_at_check" CHECK ("oauth_states"."expires_at" > "oauth_states"."created_at")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_practitioner_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"patient_id" uuid,
	"booking_id" uuid,
	"recipient_email" text NOT NULL,
	"email_type" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_logs_status_check" CHECK ("email_logs"."status" in ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_groups" ADD CONSTRAINT "deletion_groups_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_groups" ADD CONSTRAINT "deletion_groups_deleted_by_practitioner_id_practitioners_id_fk" FOREIGN KEY ("deleted_by_practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_deleted_by_practitioner_id_practitioners_id_fk" FOREIGN KEY ("deleted_by_practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_deletion_group_id_deletion_groups_id_fk" FOREIGN KEY ("deletion_group_id") REFERENCES "public"."deletion_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_deleted_by_practitioner_id_practitioners_id_fk" FOREIGN KEY ("deleted_by_practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_deletion_group_id_deletion_groups_id_fk" FOREIGN KEY ("deletion_group_id") REFERENCES "public"."deletion_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deleted_by_practitioner_id_practitioners_id_fk" FOREIGN KEY ("deleted_by_practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deletion_group_id_deletion_groups_id_fk" FOREIGN KEY ("deletion_group_id") REFERENCES "public"."deletion_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deleted_by_practitioner_id_practitioners_id_fk" FOREIGN KEY ("deleted_by_practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deletion_group_id_deletion_groups_id_fk" FOREIGN KEY ("deletion_group_id") REFERENCES "public"."deletion_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_integrations" ADD CONSTRAINT "google_integrations_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_practitioner_id_practitioners_id_fk" FOREIGN KEY ("actor_practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_provider_user_id_unique" ON "users" USING btree ("auth_provider","auth_provider_user_id");--> statement-breakpoint
CREATE INDEX "practitioners_user_id_idx" ON "practitioners" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deletion_groups_practitioner_restore_until_idx" ON "deletion_groups" USING btree ("practitioner_id","restore_until");--> statement-breakpoint
CREATE INDEX "patients_practitioner_id_idx" ON "patients" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "patients_practitioner_active_idx" ON "patients" USING btree ("practitioner_id","active");--> statement-breakpoint
CREATE INDEX "patients_practitioner_deleted_at_idx" ON "patients" USING btree ("practitioner_id","deleted_at");--> statement-breakpoint
CREATE INDEX "services_practitioner_active_idx" ON "services" USING btree ("practitioner_id","active");--> statement-breakpoint
CREATE INDEX "services_practitioner_deleted_at_idx" ON "services" USING btree ("practitioner_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_practitioner_code_unique" ON "bookings" USING btree ("practitioner_id","code");--> statement-breakpoint
CREATE INDEX "bookings_practitioner_time_idx" ON "bookings" USING btree ("practitioner_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "bookings_practitioner_status_deleted_idx" ON "bookings" USING btree ("practitioner_id","status","deleted_at");--> statement-breakpoint
CREATE INDEX "bookings_practitioner_patient_idx" ON "bookings" USING btree ("practitioner_id","patient_id");--> statement-breakpoint
CREATE INDEX "bookings_external_event_idx" ON "bookings" USING btree ("external_source","external_event_id");--> statement-breakpoint
CREATE INDEX "bookings_availability_blocking_idx" ON "bookings" USING btree ("practitioner_id","start_at","end_at") WHERE "bookings"."deleted_at" is null and "bookings"."status" in ('confirmed', 'pending');--> statement-breakpoint
CREATE INDEX "sessions_practitioner_patient_idx" ON "sessions" USING btree ("practitioner_id","patient_id");--> statement-breakpoint
CREATE INDEX "sessions_practitioner_booking_idx" ON "sessions" USING btree ("practitioner_id","booking_id");--> statement-breakpoint
CREATE INDEX "sessions_practitioner_deleted_at_idx" ON "sessions" USING btree ("practitioner_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_integrations_practitioner_id_unique" ON "google_integrations" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "google_integrations_practitioner_id_idx" ON "google_integrations" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "audit_events_practitioner_created_at_idx" ON "audit_events" USING btree ("practitioner_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "email_logs_practitioner_created_at_idx" ON "email_logs" USING btree ("practitioner_id","created_at");--> statement-breakpoint
CREATE INDEX "email_logs_booking_id_idx" ON "email_logs" USING btree ("booking_id");