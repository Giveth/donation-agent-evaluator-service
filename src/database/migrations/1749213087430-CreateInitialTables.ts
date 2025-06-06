import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialTables1749213087430 implements MigrationInterface {
  name = 'CreateInitialTables1749213087430';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."scheduled_jobs_job_type_enum" AS ENUM('tweet_fetch', 'farcaster_fetch', 'project_sync')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."scheduled_jobs_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "scheduled_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" character varying NOT NULL, "job_type" "public"."scheduled_jobs_job_type_enum" NOT NULL, "scheduled_for" TIMESTAMP NOT NULL, "status" "public"."scheduled_jobs_status_enum" NOT NULL DEFAULT 'pending', "processed_at" TIMESTAMP, "error" text, "attempts" integer NOT NULL DEFAULT '0', "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_119312a5470a95ee9c733a5246d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_03035c2352a0119d44484d1dd6" ON "scheduled_jobs" ("scheduled_for") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f91c4c5d8b0e18629c8c08b159" ON "scheduled_jobs" ("status", "scheduled_for") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project_social_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" character varying NOT NULL, "twitter_handle" character varying, "farcaster_username" character varying, "last_twitter_fetch" TIMESTAMP, "last_farcaster_fetch" TIMESTAMP, "latest_twitter_post_timestamp" TIMESTAMP, "latest_farcaster_post_timestamp" TIMESTAMP, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_13bfa8cb82beffc425f4699e901" UNIQUE ("project_id"), CONSTRAINT "PK_9528a9d176f459673cfbf1f46c1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_13bfa8cb82beffc425f4699e90" ON "project_social_accounts" ("project_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "stored_social_posts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "post_id" character varying NOT NULL, "content" text NOT NULL, "url" character varying, "post_timestamp" TIMESTAMP NOT NULL, "fetched_at" TIMESTAMP NOT NULL, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "project_account_id" uuid NOT NULL, CONSTRAINT "UQ_092dae23274c272343e753e30ca" UNIQUE ("post_id"), CONSTRAINT "PK_c48292ad5a51dac2e159bdb2df5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ee61e0ed9328554c961b05ab87" ON "stored_social_posts" ("project_account_id", "post_timestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d0e4b6fea21dc203c9b8114a43" ON "stored_social_posts" ("post_timestamp") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_092dae23274c272343e753e30c" ON "stored_social_posts" ("post_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" ADD CONSTRAINT "FK_431e34bd95cfe125692117882a7" FOREIGN KEY ("project_account_id") REFERENCES "project_social_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" DROP CONSTRAINT "FK_431e34bd95cfe125692117882a7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_092dae23274c272343e753e30c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d0e4b6fea21dc203c9b8114a43"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ee61e0ed9328554c961b05ab87"`,
    );
    await queryRunner.query(`DROP TABLE "stored_social_posts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_13bfa8cb82beffc425f4699e90"`,
    );
    await queryRunner.query(`DROP TABLE "project_social_accounts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f91c4c5d8b0e18629c8c08b159"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_03035c2352a0119d44484d1dd6"`,
    );
    await queryRunner.query(`DROP TABLE "scheduled_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."scheduled_jobs_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."scheduled_jobs_job_type_enum"`,
    );
  }
}
