-- =====================================================================
-- System Backup v2 — private Storage bucket for full-database dumps
-- =====================================================================
-- The system-backup Edge Function (supabase/functions/system-backup/index.ts)
-- uploads gzipped full-database JSON dumps here. Private bucket — access is
-- only ever granted via short-lived signed URLs minted server-side by the
-- Edge Function's service-role client, never via public/anon access or a
-- client-side upload. No end-user or role ever writes to this bucket
-- directly; only the Edge Function (service role, bypasses RLS/storage
-- policies) does.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('system-backups', 'system-backups', false, 524288000) -- 500MB cap per file
ON CONFLICT (id) DO NOTHING;

-- No storage.objects RLS policies are added for this bucket intentionally —
-- the bucket is private (public = false) and all reads/writes happen through
-- the Edge Function's service-role client, which bypasses RLS entirely. This
-- means no authenticated user, regardless of role, can list/read/write this
-- bucket's contents directly via the client SDK or REST API — only the signed
-- URLs the Edge Function explicitly mints (5-minute TTL) grant temporary,
-- single-file read access.
