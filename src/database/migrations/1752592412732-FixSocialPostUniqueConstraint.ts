import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSocialPostUniqueConstraint1752592412732
  implements MigrationInterface
{
  name = 'FixSocialPostUniqueConstraint1752592412732';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing unique constraint on post_id only (if exists)
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" DROP CONSTRAINT IF EXISTS "UQ_092dae23274c272343e753e30ca"`,
    );

    // Drop the corresponding unique index (if exists)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_092dae23274c272343e753e30c"`);

    // Add composite unique constraint on (post_id, project_account_id)
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" ADD CONSTRAINT "UQ_post_id_project_account_id" UNIQUE ("post_id", "project_account_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the composite unique constraint
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" DROP CONSTRAINT "UQ_post_id_project_account_id"`,
    );

    // Recreate the original unique constraint on post_id only
    await queryRunner.query(
      `ALTER TABLE "stored_social_posts" ADD CONSTRAINT "UQ_092dae23274c272343e753e30ca" UNIQUE ("post_id")`,
    );

    // Recreate the corresponding unique index
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_092dae23274c272343e753e30c" ON "stored_social_posts" ("post_id")`,
    );
  }
}
