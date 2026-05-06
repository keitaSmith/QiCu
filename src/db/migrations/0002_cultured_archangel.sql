ALTER TABLE "patients" ADD COLUMN "public_id" text;--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-T-1001' WHERE "id" = '22222222-2222-4222-8222-222222222201';--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-T-1002' WHERE "id" = '22222222-2222-4222-8222-222222222202';--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-T-1003' WHERE "id" = '22222222-2222-4222-8222-222222222203';--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-T-1004' WHERE "id" = '22222222-2222-4222-8222-222222222204';--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-K-2001' WHERE "id" = '22222222-2222-4222-8222-222222222301';--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-K-2002' WHERE "id" = '22222222-2222-4222-8222-222222222302';--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-K-2003' WHERE "id" = '22222222-2222-4222-8222-222222222303';--> statement-breakpoint
UPDATE "patients" SET "public_id" = 'P-K-2004' WHERE "id" = '22222222-2222-4222-8222-222222222304';--> statement-breakpoint
CREATE UNIQUE INDEX "patients_practitioner_public_id_unique" ON "patients" USING btree ("practitioner_id","public_id");
