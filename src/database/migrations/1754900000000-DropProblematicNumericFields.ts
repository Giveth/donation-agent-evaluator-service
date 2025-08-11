import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropProblematicNumericFields1754900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the problematic columns that are causing overflow errors in staging
    // This migration runs before the constraint migrations to prevent the overflow issue

    console.log(
      'Dropping problematic total_donations and quality_score columns...',
    );

    // Drop columns if they exist to prevent overflow errors
    try {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" DROP COLUMN IF EXISTS "total_donations"`,
      );
      console.log('Dropped total_donations column successfully');
    } catch {
      console.log('total_donations column may not exist, continuing...');
    }

    try {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" DROP COLUMN IF EXISTS "quality_score"`,
      );
      console.log('Dropped quality_score column successfully');
    } catch {
      console.log('quality_score column may not exist, continuing...');
    }

    console.log('Successfully dropped problematic numeric fields');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the columns if needed for rollback (using safe precision)
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "total_donations" numeric(15,2) DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "quality_score" numeric(5,2)`,
    );
  }
}
