import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Production migrations must bypass Neon's transaction pooler. CI validation and
// client generation may fall back to its synthetic DATABASE_URL placeholder.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED
  ? env('DATABASE_URL_UNPOOLED')
  : process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('DATABASE_URL_UNPOOLED (direct Neon connection) is required in production.'); })()
    : env('DATABASE_URL');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Application runtime uses pooled DATABASE_URL; Prisma CLI uses the direct URL.
    url: migrationUrl,
  },
});
