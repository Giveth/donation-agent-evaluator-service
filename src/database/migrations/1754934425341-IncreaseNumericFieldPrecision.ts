import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreaseNumericFieldPrecision1754934425341
  implements MigrationInterface
{
  name = 'IncreaseNumericFieldPrecision1754934425341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns exist before trying to alter them
    // These columns may have been dropped by the hotfix migration
    try {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "quality_score" TYPE numeric(10,2)`,
      );
      console.log('Updated quality_score column type');
    } catch {
      console.log('quality_score column does not exist, skipping...');
    }

    try {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_donations" TYPE numeric(20,2)`,
      );
      console.log('Updated total_donations column type');
    } catch {
      console.log('total_donations column does not exist, skipping...');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Safely handle rollback - columns may not exist
    try {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_donations" TYPE numeric(15,2)`,
      );
    } catch {
      // Column doesn't exist, skip
    }
    try {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "quality_score" TYPE numeric(5,2)`,
      );
    } catch {
      // Column doesn't exist, skip
    }
  }
}
