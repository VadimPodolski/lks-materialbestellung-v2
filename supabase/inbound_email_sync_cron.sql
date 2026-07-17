-- Ruft den Import des Einkaufspostfachs alle 10 Minuten auf.
-- Voraussetzung: Supabase Vault enthält den geheimen Wert
-- "inbound_email_cron_secret", der dem Vercel-Wert CRON_SECRET entspricht.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'sync-inbound-email-every-10-minutes'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end
$$;

select cron.schedule(
  'sync-inbound-email-every-10-minutes',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://bestellung.lks-technik.de/api/inbound-email/sync',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'inbound_email_cron_secret'
          limit 1
        ),
        'Content-Type',
        'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    );
  $job$
);
