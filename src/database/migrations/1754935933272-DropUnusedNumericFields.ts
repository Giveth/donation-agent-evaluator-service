import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUnusedNumericFields1754935933272
  implements MigrationInterface
{
  name = 'DropUnusedNumericFields1754935933272';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use IF EXISTS to prevent errors if columns were already dropped
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN IF EXISTS "quality_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN IF EXISTS "total_donations"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "total_donations" numeric(20,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "quality_score" numeric(10,2)`,
    );
  }
}
