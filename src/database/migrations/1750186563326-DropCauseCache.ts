import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCauseCache1750186563326 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e9879f87c3eedf70548f93eae8"`,
    );
    await queryRunner.query(`DROP TABLE "cause_cache"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cause_cache" ("id" integer NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "project_ids" jsonb NOT NULL, "cached_at" TIMESTAMP NOT NULL DEFAULT now(), "expires_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_cbbb5f1b866601ac4bad013982b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e9879f87c3eedf70548f93eae8" ON "cause_cache" ("expires_at") `,
    );
  }
}
