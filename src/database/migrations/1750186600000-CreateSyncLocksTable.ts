import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSyncLocksTable1750186600000 implements MigrationInterface {
  name = 'CreateSyncLocksTable1750186600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sync_locks',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'lock_key',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'acquired_by',
            type: 'varchar',
            length: '255',
            comment: 'Correlation ID of the process that acquired the lock',
          },
          {
            name: 'acquired_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            comment: 'When the lock expires and can be reclaimed',
          },
        ],
      }),
      true,
    );

    // Create index on expires_at for cleanup operations
    await queryRunner.createIndex(
      'sync_locks',
      new TableIndex({
        name: 'IDX_sync_locks_expires_at',
        columnNames: ['expires_at'],
      }),
    );

    // Clean up expired locks automatically
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_locks()
      RETURNS void AS $$
      BEGIN
        DELETE FROM sync_locks WHERE expires_at < NOW();
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP FUNCTION IF EXISTS cleanup_expired_locks()');
    await queryRunner.dropTable('sync_locks');
  }
}
