import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreaseNumericFieldPrecision1754934425341
  implements MigrationInterface
{
  name = 'IncreaseNumericFieldPrecision1754934425341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "quality_score" TYPE numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_donations" TYPE numeric(20,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "total_donations" TYPE numeric(15,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ALTER COLUMN "quality_score" TYPE numeric(5,2)`,
    );
  }
}
