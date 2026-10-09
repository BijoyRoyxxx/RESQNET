-- Restore constraints lost when accounts was dropped with CASCADE.
-- Old orphan references are retained. New invalid references are rejected.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
    item record;
    constraint_name text;
    has_orphans boolean;
BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('case_messages', 'account_id'),
        ('report_cases', 'account_id'),
        ('report_cases', 'assigned_to'),
        ('media_owners', 'account_id'),
        ('login_sessions', 'account_id')
    ) AS refs(table_name, column_name)
    LOOP
        constraint_name := item.table_name || '_' || item.column_name || '_fkey';
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = to_regclass('public.' || item.table_name)
              AND conname = constraint_name
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.accounts(id) NOT VALID',
                item.table_name, constraint_name, item.column_name
            );
        END IF;
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM public.%I t LEFT JOIN public.accounts a ON a.id=t.%I WHERE t.%I IS NOT NULL AND a.id IS NULL)',
            item.table_name, item.column_name, item.column_name
        ) INTO has_orphans;
        IF NOT has_orphans THEN
            EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', item.table_name, constraint_name);
        END IF;
    END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS ix_service_search_cache
    ON public.service_searches (service, latitude, longitude, radius_km, created_at DESC);
COMMIT;

SELECT conrelid::regclass AS table_name, conname, convalidated
FROM pg_constraint WHERE confrelid = 'public.accounts'::regclass ORDER BY conname;
