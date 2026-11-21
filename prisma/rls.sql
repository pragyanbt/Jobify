-- Supabase exposes the public schema through its REST/GraphQL APIs using the
-- anon and authenticated roles. Jobify never uses those APIs for data: all
-- access goes through the server with Prisma (table owner, bypasses RLS).
-- Enabling RLS with no policies therefore denies every API request while the
-- app keeps working. Re-run after schema changes (npm run db:secure).

alter table "Profile"        enable row level security;
alter table "MasterResume"   enable row level security;
alter table "Job"            enable row level security;
alter table "TailoredResume" enable row level security;
alter table "ResumeVersion"  enable row level security;
alter table "ResumePdf"      enable row level security;
alter table "Application"    enable row level security;
alter table "ApplicationDraft" enable row level security;
alter table "Integration"    enable row level security;
alter table "InboxUpdate"    enable row level security;
alter table "ApiUsage"       enable row level security;

-- Belt and braces: remove API-role privileges entirely.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
