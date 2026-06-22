-- Run ONLY in Supabase SQL Editor.
-- Do not paste JavaScript here.

-- 1) Quick sanity check: tables + summary function
select to_regclass('public.website_events') as website_events_table;
select to_regclass('public.website_leads') as website_leads_table;
select * from public.get_portal_analytics_summary();

-- 2) Insert a test pageview event via SQL function
select public.track_public_event(
  p_event_name := 'qa_sql_page_view',
  p_page_path := '/index.html',
  p_page_url := 'https://harvest-renovation-enterprise.vercel.app/',
  p_referrer := '',
  p_link_text := null,
  p_href := null,
  p_session_id := 'qa-sql-session',
  p_user_agent := 'qa-sql',
  p_source := 'website'
);

-- 3) Insert a test lead via SQL function
select public.capture_website_lead(
  '{
    "first_name":"QA",
    "last_name":"Lead",
    "email":"qa.lead@example.com",
    "phone":"8320000000",
    "project_type":"Kitchen Remodeling",
    "project_details":"QA insert from SQL editor",
    "page_url":"https://harvest-renovation-enterprise.vercel.app/estimate.html",
    "source":"website_form"
  }'::jsonb
);

-- 4) Verify counts moved
select * from public.get_portal_analytics_summary();
select * from public.portal_traffic_window_summary;

-- 5) Cleanup QA rows (safe to run)
delete from public.website_events where event_name = 'qa_sql_page_view';

delete from public.website_leads where email = 'qa.lead@example.com';

-- 6) Final check after cleanup
select * from public.get_portal_analytics_summary();
