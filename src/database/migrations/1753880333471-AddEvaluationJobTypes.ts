import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvaluationJobTypes1753880333471 implements MigrationInterface {
  name = 'AddEvaluationJobTypes1753880333471';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."scheduled_jobs_job_type_enum" RENAME TO "scheduled_jobs_job_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."scheduled_jobs_job_type_enum" AS ENUM('tweet_fetch', 'farcaster_fetch', 'project_sync', 'single_cause_evaluation', 'multi_cause_evaluation')`,
    );
    await queryRunner.query(
      `ALTER TABLE "scheduled_jobs" ALTER COLUMN "job_type" TYPE "public"."scheduled_jobs_job_type_enum" USING "job_type"::"text"::"public"."scheduled_jobs_job_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."scheduled_jobs_job_type_enum_old"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."scheduled_jobs_job_type_enum_old" AS ENUM('tweet_fetch', 'farcaster_fetch', 'project_sync')`,
    );
    await queryRunner.query(
      `ALTER TABLE "scheduled_jobs" ALTER COLUMN "job_type" TYPE "public"."scheduled_jobs_job_type_enum_old" USING "job_type"::"text"::"public"."scheduled_jobs_job_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."scheduled_jobs_job_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."scheduled_jobs_job_type_enum_old" RENAME TO "scheduled_jobs_job_type_enum"`,
    );
  }
}
