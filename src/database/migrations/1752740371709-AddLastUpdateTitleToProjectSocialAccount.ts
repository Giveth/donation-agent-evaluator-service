import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastUpdateTitleToProjectSocialAccount1752740371709
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists before adding it
    const columnExists = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'project_social_accounts' 
      AND column_name = 'last_update_title'
    `);

    if (columnExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "project_social_accounts" 
        ADD COLUMN "last_update_title" varchar(500)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "project_social_accounts" 
            DROP COLUMN "last_update_title"
        `);
  }
}
