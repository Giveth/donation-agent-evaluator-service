import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSocialMediaColumns1752161108305
  implements MigrationInterface
{
  name = 'UpdateSocialMediaColumns1752161108305';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "twitter_handle"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "farcaster_username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "last_twitter_fetch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "latest_twitter_post_timestamp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "x_url" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "farcaster_url" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "last_x_fetch" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "latest_x_post_timestamp" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "latest_x_post_timestamp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "last_x_fetch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "farcaster_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" DROP COLUMN "x_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "latest_twitter_post_timestamp" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "last_twitter_fetch" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "farcaster_username" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_social_accounts" ADD "twitter_handle" character varying`,
    );
  }
}
