ALTER TABLE "services" ADD COLUMN "public_id" text;--> statement-breakpoint
UPDATE "services" SET "public_id" = 'tom-acu-60' WHERE "id" = '33333333-3333-4333-8333-333333333301';--> statement-breakpoint
UPDATE "services" SET "public_id" = 'tom-acu-45' WHERE "id" = '33333333-3333-4333-8333-333333333302';--> statement-breakpoint
UPDATE "services" SET "public_id" = 'tom-acu-30' WHERE "id" = '33333333-3333-4333-8333-333333333303';--> statement-breakpoint
UPDATE "services" SET "public_id" = 'tom-massage-60' WHERE "id" = '33333333-3333-4333-8333-333333333304';--> statement-breakpoint
UPDATE "services" SET "public_id" = 'keita-acu-60' WHERE "id" = '33333333-3333-4333-8333-333333333401';--> statement-breakpoint
UPDATE "services" SET "public_id" = 'keita-acu-45' WHERE "id" = '33333333-3333-4333-8333-333333333402';--> statement-breakpoint
UPDATE "services" SET "public_id" = 'keita-cupping-30' WHERE "id" = '33333333-3333-4333-8333-333333333403';--> statement-breakpoint
UPDATE "services" SET "public_id" = 'keita-moxa-45' WHERE "id" = '33333333-3333-4333-8333-333333333404';--> statement-breakpoint
CREATE UNIQUE INDEX "services_public_id_unique" ON "services" USING btree ("public_id");
