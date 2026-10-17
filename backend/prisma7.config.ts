// Prisma CLI configuration (Prisma ORM v7).
// The datasource URL lives here (not in schema.prisma) and is only needed by
// CLI commands (migrate, studio, db pull); `prisma generate` works without it.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
