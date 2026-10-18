-- Hourly rate raises per employer: [{ "rate": 80, "from": "2026-11-01" }]
-- Run in Supabase SQL Editor after 002_projects.sql. Safe to run more than once.

alter table employers add column if not exists rate_changes jsonb not null default '[]'::jsonb;
