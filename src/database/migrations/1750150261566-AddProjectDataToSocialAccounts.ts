import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectDataToSocialAccounts1750150261566
  implements MigrationInterface
{
  name = 'AddProjectDataToSocialAccounts1750150261566';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns as nullable first to handle existing data
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "title" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "slug" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "description" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "project_status" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "verified" boolean DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "quality_score" numeric(5,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "giv_power_rank" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "total_donations" numeric(15,2) DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "total_reactions" integer DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "last_update_date" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "last_update_content" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "causes_ids" jsonb`,
    );

    // Update existing records with default values
    await queryRunner.query(
      `UPDATE "project_social_accounts" SET "title" = 'Unknown Project' WHERE "title" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "project_social_accounts" SET "slug" = 'unknown-project-' || "project_id" WHERE "slug" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "project_social_accounts" SET "project_status" = 'active' WHERE "project_status" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "project_social_accounts" SET "verified" = false WHERE "verified" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "project_social_accounts" SET "total_donations" = 0 WHERE "total_donations" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "project_social_accounts" SET "total_reactions" = 0 WHERE "total_reactions" IS NULL`,
    );

    // Make required columns NOT NULL after updating
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "title" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "slug" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "project_status" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "verified" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_donations" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_reactions" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "causes_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "last_update_content"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "last_update_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "total_reactions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "total_donations"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "giv_power_rank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "quality_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "verified"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "project_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "title"`,
    );
  }
}
