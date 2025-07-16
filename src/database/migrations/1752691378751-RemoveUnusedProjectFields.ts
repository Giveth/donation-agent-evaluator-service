import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUnusedProjectFields1752691378751 implements MigrationInterface {
    name = 'RemoveUnusedProjectFields1752691378751'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_social_accounts" DROP COLUMN "metadata"`);
        await queryRunner.query(`ALTER TABLE "project_social_accounts" DROP COLUMN "verified"`);
        await queryRunner.query(`ALTER TABLE "project_social_accounts" DROP COLUMN "total_reactions"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_social_accounts" ADD "total_reactions" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "project_social_accounts" ADD "verified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "project_social_accounts" ADD "metadata" jsonb`);
    }

}
