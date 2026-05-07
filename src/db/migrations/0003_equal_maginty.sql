ALTER TABLE "bookings" ADD COLUMN "public_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "public_id" text;--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-tom-today-001' WHERE "id" = '44444444-4444-4444-8444-444444444401';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-tom-today-002' WHERE "id" = '44444444-4444-4444-8444-444444444402';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-tom-live-003' WHERE "id" = '44444444-4444-4444-8444-444444444403';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-tom-upcoming-101' WHERE "id" = '44444444-4444-4444-8444-444444444404';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-tom-past-201' WHERE "id" = '44444444-4444-4444-8444-444444444405';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-keita-today-001' WHERE "id" = '44444444-4444-4444-8444-444444444501';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-keita-today-002' WHERE "id" = '44444444-4444-4444-8444-444444444502';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-keita-upcoming-101' WHERE "id" = '44444444-4444-4444-8444-444444444503';--> statement-breakpoint
UPDATE "bookings" SET "public_id" = 'b-keita-past-201' WHERE "id" = '44444444-4444-4444-8444-444444444504';--> statement-breakpoint
UPDATE "sessions" SET "public_id" = 'S-T-1001' WHERE "id" = '55555555-5555-4555-8555-555555555501';--> statement-breakpoint
UPDATE "sessions" SET "public_id" = 'S-K-2001' WHERE "id" = '55555555-5555-4555-8555-555555555502';--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_practitioner_public_id_unique" ON "bookings" USING btree ("practitioner_id","public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_practitioner_public_id_unique" ON "sessions" USING btree ("practitioner_id","public_id");
