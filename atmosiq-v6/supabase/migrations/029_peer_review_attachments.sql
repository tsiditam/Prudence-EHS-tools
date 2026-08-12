-- 029_peer_review_attachments.sql
--
-- Private Supabase Storage bucket for peer-review report attachments.
--
-- Peer review previously base64-encoded the whole consultant DOCX into
-- the /api/peer-review JSON request body. Vercel caps a serverless
-- request body at ~4.5 MB, so photo-heavy reports were rejected by the
-- platform (non-JSON 413) before the handler ran — surfacing only as a
-- bare "Send failed." This bucket moves the DOCX out of the request:
-- the client uploads it here, then sends only the storage path; the
-- /api/peer-review function downloads it (service role) and attaches it
-- to the Resend email, then deletes it.
--
-- Mirrors migration 016 (report-templates): private bucket, owner-only
-- RLS on storage.objects keyed on the {user_id}/... path prefix. No
-- catalog table — the object is transient (deleted after the email is
-- sent), and the peer_reviews row already records the request.
--
-- All changes are additive. No existing table is altered.

-- ── Storage bucket ──────────────────────────────────────────────────
-- Private (public = false). Owner-only access enforced via RLS on
-- storage.objects below. Created idempotently so the migration can be
-- re-applied in dev without erroring.
insert into storage.buckets (id, name, public)
values ('peer-review-attachments', 'peer-review-attachments', false)
on conflict (id) do nothing;

-- Per-user RLS on storage.objects scoped to this bucket. Path
-- convention: {user_id}/{uuid}.docx — the user-id prefix gates access.
-- (storage.foldername(name)[1] is the first path segment as text.)
drop policy if exists peer_review_attachments_owner_select on storage.objects;
create policy peer_review_attachments_owner_select
  on storage.objects for select
  using (
    bucket_id = 'peer-review-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists peer_review_attachments_owner_insert on storage.objects;
create policy peer_review_attachments_owner_insert
  on storage.objects for insert
  with check (
    bucket_id = 'peer-review-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists peer_review_attachments_owner_delete on storage.objects;
create policy peer_review_attachments_owner_delete
  on storage.objects for delete
  using (
    bucket_id = 'peer-review-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- No UPDATE policy — attachments are write-once then deleted after send.
