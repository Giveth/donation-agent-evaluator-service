import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreMetadataField1752692728371 implements MigrationInterface {
  name = 'RestoreMetadataField1752692728371';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" DROP CONSTRAINT "UQ_post_id_project_account_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "metadata" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" ADD CONSTRAINT "UQ_post_id_project_account_id" UNIQUE ("post_id", "project_account_id")`,
    );
  }
}
