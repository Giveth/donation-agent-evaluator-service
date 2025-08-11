import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreaseNumericFieldPrecision1754934425341
  implements MigrationInterface
{
  name = 'IncreaseNumericFieldPrecision1754934425341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns exist before trying to alter them using information_schema
    // This prevents transaction abortion from failed ALTER commands

    const qualityScoreExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'project_social_accounts' 
      AND column_name = 'quality_score'
    `);

    if (qualityScoreExists.length > 0) {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "quality_score" TYPE numeric(10,2)`,
      );
      console.log('Updated quality_score column type');
    } else {
      console.log('quality_score column does not exist, skipping...');
    }

    const totalDonationsExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'project_social_accounts' 
      AND column_name = 'total_donations'
    `);

    if (totalDonationsExists.length > 0) {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_donations" TYPE numeric(20,2)`,
      );
      console.log('Updated total_donations column type');
    } else {
      console.log('total_donations column does not exist, skipping...');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Safely handle rollback - check if columns exist first
    const totalDonationsExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'project_social_accounts' 
      AND column_name = 'total_donations'
    `);

    if (totalDonationsExists.length > 0) {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_donations" TYPE numeric(15,2)`,
      );
      console.log('Rolled back total_donations column type to numeric(15,2)');
    } else {
      console.log(
        'total_donations column does not exist, skipping rollback...',
      );
    }

    const qualityScoreExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'project_social_accounts' 
      AND column_name = 'quality_score'
    `);

    if (qualityScoreExists.length > 0) {
      await queryRunner.query(
        `ALTER TABLE "project_social_accounts" ALTER COLUMN "quality_score" TYPE numeric(5,2)`,
      );
      console.log('Rolled back quality_score column type to numeric(5,2)');
    } else {
      console.log('quality_score column does not exist, skipping rollback...');
    }
  }
}
