import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNumericFieldConstraints1754933538620
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, fix any existing data that might be causing overflow issues
    // Cap total_donations at the maximum allowed value for numeric(20,2)
    await queryRunner.query(`
            UPDATE project_social_accounts 
            SET total_donations = 999999999999999999.99 
            WHERE total_donations > 999999999999999999.99
        `);

    // Cap quality_score at the maximum allowed value for numeric(10,2)
    await queryRunner.query(`
            UPDATE project_social_accounts 
            SET quality_score = 99999999.99 
            WHERE quality_score > 99999999.99
        `);

    // Ensure negative values are set to 0
    await queryRunner.query(`
            UPDATE project_social_accounts 
            SET total_donations = 0 
            WHERE total_donations < 0
        `);

    await queryRunner.query(`
            UPDATE project_social_accounts 
            SET quality_score = 0 
            WHERE quality_score < 0
        `);

    // Add check constraints to prevent future overflow issues
    await queryRunner.query(`
            ALTER TABLE project_social_accounts 
            DROP CONSTRAINT IF EXISTS check_total_donations_range
        `);

    await queryRunner.query(`
            ALTER TABLE project_social_accounts 
            ADD CONSTRAINT check_total_donations_range 
            CHECK (total_donations >= 0 AND total_donations <= 999999999999999999.99)
        `);

    await queryRunner.query(`
            ALTER TABLE project_social_accounts 
            DROP CONSTRAINT IF EXISTS check_quality_score_range
        `);

    await queryRunner.query(`
            ALTER TABLE project_social_accounts 
            ADD CONSTRAINT check_quality_score_range 
            CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 99999999.99))
        `);

    // Create a function to safely update numeric fields with overflow protection
    await queryRunner.query(`
            CREATE OR REPLACE FUNCTION safe_numeric_update()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Check and cap total_donations
                IF NEW.total_donations > 999999999999999999.99 THEN
                    NEW.total_donations := 999999999999999999.99;
                    RAISE NOTICE 'total_donations capped at maximum value for project %', NEW.project_id;
                ELSIF NEW.total_donations < 0 THEN
                    NEW.total_donations := 0;
                    RAISE NOTICE 'total_donations set to 0 (was negative) for project %', NEW.project_id;
                END IF;
                
                -- Check and cap quality_score
                IF NEW.quality_score IS NOT NULL THEN
                    IF NEW.quality_score > 99999999.99 THEN
                        NEW.quality_score := 99999999.99;
                        RAISE NOTICE 'quality_score capped at maximum value for project %', NEW.project_id;
                    ELSIF NEW.quality_score < 0 THEN
                        NEW.quality_score := 0;
                        RAISE NOTICE 'quality_score set to 0 (was negative) for project %', NEW.project_id;
                    END IF;
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

    // Create trigger to automatically apply the safe update function
    await queryRunner.query(`
            DROP TRIGGER IF EXISTS safe_numeric_update_trigger ON project_social_accounts;
        `);

    await queryRunner.query(`
            CREATE TRIGGER safe_numeric_update_trigger
            BEFORE INSERT OR UPDATE ON project_social_accounts
            FOR EACH ROW
            EXECUTE FUNCTION safe_numeric_update();
        `);

    // Log current statistics for monitoring
    const stats = await queryRunner.query(`
            SELECT 
                COUNT(*) as total_records,
                MAX(total_donations) as max_donations,
                MIN(total_donations) as min_donations,
                AVG(total_donations) as avg_donations,
                MAX(quality_score) as max_quality,
                MIN(quality_score) as min_quality,
                AVG(quality_score) as avg_quality
            FROM project_social_accounts
        `);
    console.log(
      'Project Social Accounts Statistics after migration:',
      stats[0],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the trigger and function
    await queryRunner.query(`
            DROP TRIGGER IF EXISTS safe_numeric_update_trigger ON project_social_accounts;
        `);

    await queryRunner.query(`
            DROP FUNCTION IF EXISTS safe_numeric_update();
        `);

    // Drop the check constraints
    await queryRunner.query(`
            ALTER TABLE project_social_accounts 
            DROP CONSTRAINT IF EXISTS check_total_donations_range
        `);

    await queryRunner.query(`
            ALTER TABLE project_social_accounts 
            DROP CONSTRAINT IF EXISTS check_quality_score_range
        `);
  }
}
