-- ZKWAConnect v3.2.0 — Full DB Reset
-- Run in pgAdmin or: docker exec -i zkwa_postgres_development psql -U zkwa -d zkwaconnect < db-reset.sql
-- WARNING: Drops ALL tables, enums, types, views, functions, sequences

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$;

DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

SELECT
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') AS tables_remaining,
  (SELECT COUNT(*) FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) AS enums_remaining;

SELECT 'Reset complete. Now run: npx prisma migrate dev --name init_v32' AS next_step;
