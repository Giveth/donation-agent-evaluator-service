import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCausesFromProjectSocialAccounts1750186580643
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "causes_ids"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "causes_ids" jsonb`,
    );
  }
}
