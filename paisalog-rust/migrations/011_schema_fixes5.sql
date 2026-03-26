CREATE OR REPLACE FUNCTION create_next_partition(start_date DATE, end_date DATE)
RETURNS VOID AS $func$
DECLARE
  partition_name TEXT;
BEGIN
  partition_name := 'transactions_' ||
    to_char(start_date, 'YYYY') || '_q' ||
    to_char(CEIL(EXTRACT(MONTH FROM start_date) / 3.0), 'FM9');
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = partition_name AND n.nspname = 'public'
  ) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF transactions FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
  END IF;
END;
$func$ LANGUAGE plpgsql;
