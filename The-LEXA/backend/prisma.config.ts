import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Docker supplies a build-only placeholder during code generation. Render must
    // supply the real DATABASE_URL at runtime; the placeholder is not shipped.
    url: env('DATABASE_URL'),
  },
});
