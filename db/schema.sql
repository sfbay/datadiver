-- db/schema.sql — apply once via the Neon SQL console (see runbook).
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email

CREATE TABLE IF NOT EXISTS subscribers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'My alert',
  cadence       text NOT NULL DEFAULT 'daily',
  filters       jsonb NOT NULL DEFAULT '{"streams":[],"categories":[]}',
  radius_miles  numeric NOT NULL DEFAULT 0.5,
  last_sent_at  timestamptz,
  last_event_ts bigint NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  label           text,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS subscribe_attempts (
  id         bigserial PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_ip_time ON subscribe_attempts (ip, created_at);
-- The daily prune deletes by age alone; a composite (ip, created_at) B-tree
-- can't serve a created_at-only predicate, so it needs its own index.
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON subscribe_attempts (created_at);
