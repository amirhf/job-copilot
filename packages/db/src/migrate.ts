import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, getPool, closeDb } from './client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HYBRID_FTS_INDEX_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS career_bullets_fts_gin_idx
ON career_bullets
USING GIN (
  to_tsvector(
    'english',
    coalesce(bullet_text, '') || ' ' ||
    coalesce(technical_approach, '') || ' ' ||
    coalesce(skill_tags::text, '')
  )
);

CREATE INDEX IF NOT EXISTS career_experiences_fts_gin_idx
ON career_experiences
USING GIN (
  to_tsvector(
    'english',
    coalesce(company_name, '') || ' ' ||
    coalesce(job_title, '') || ' ' ||
    coalesce(role_overview, '') || ' ' ||
    coalesce(primary_tech_stack::text, '')
  )
);

CREATE INDEX IF NOT EXISTS career_projects_fts_gin_idx
ON career_projects
USING GIN (
  to_tsvector(
    'english',
    coalesce(project_name, '') || ' ' ||
    coalesce(tagline, '') || ' ' ||
    coalesce(problem_statement, '') || ' ' ||
    coalesce(architecture_and_stack, '') || ' ' ||
    coalesce(tech_stack_tags::text, '')
  )
);

CREATE INDEX IF NOT EXISTS career_stories_fts_gin_idx
ON career_stories
USING GIN (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' ||
    coalesce(situation, '') || ' ' ||
    coalesce(task, '') || ' ' ||
    coalesce(action, '') || ' ' ||
    coalesce(result, '')
  )
);
`;

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const db = getDb();

  // 1. Ensure pgvector is enabled before running Drizzle table migrations
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

  // 2. Run Drizzle generated migrations
  const migrationsFolder = path.resolve(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });

  // 3. Ensure expression-based GIN full-text search indexes exist
  await pool.query(HYBRID_FTS_INDEX_SQL);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      console.log('Database migrations and hybrid search indexes applied successfully.');
      await closeDb();
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await closeDb();
      process.exit(1);
    });
}
