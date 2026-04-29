import { pool } from './pool.js';
import { log } from '../log.js';

// Bootstrap migrations. Runs on every boot — every statement is idempotent
// (`IF NOT EXISTS`) so re-running is free. We skip the usual versioned-
// migration framework because Phase-1 schema is small and the bot is
// the only writer; if that ever changes we'll graduate to node-pg-migrate
// or graphile-migrate.
//
// Schema name `panda` matches the bot name. The Postgres role in
// DATABASE_URL needs CREATE on the database (one-time bootstrap), or you
// can pre-create the schema and grant USAGE+CREATE on it.

const STATEMENTS: ReadonlyArray<{ name: string; sql: string }> = [
  {
    name: 'create schema',
    sql: 'CREATE SCHEMA IF NOT EXISTS panda',
  },
  {
    name: 'guild_config table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.guild_config (
        server_id        TEXT PRIMARY KEY,
        prefix           TEXT,
        modlog_channel   TEXT,
        welcome_channel  TEXT,
        welcome_message  TEXT,
        goodbye_channel  TEXT,
        goodbye_message  TEXT,
        autorole_id      TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'guild_config updated_at trigger fn',
    sql: `
      CREATE OR REPLACE FUNCTION panda.touch_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `,
  },
  {
    name: 'guild_config updated_at trigger',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'guild_config_touch_updated_at'
        ) THEN
          CREATE TRIGGER guild_config_touch_updated_at
            BEFORE UPDATE ON panda.guild_config
            FOR EACH ROW EXECUTE FUNCTION panda.touch_updated_at();
        END IF;
      END $$
    `,
  },
  {
    name: 'xp table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.xp (
        server_id   TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        total_xp    BIGINT NOT NULL DEFAULT 0,
        level       INT NOT NULL DEFAULT 0,
        last_msg_at TIMESTAMPTZ,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, user_id)
      )
    `,
  },
  {
    name: 'xp leaderboard index',
    sql: `
      CREATE INDEX IF NOT EXISTS xp_leaderboard_idx
        ON panda.xp (server_id, total_xp DESC)
    `,
  },
  {
    name: 'level_settings table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.level_settings (
        server_id          TEXT PRIMARY KEY,
        enabled            BOOLEAN NOT NULL DEFAULT TRUE,
        level_up_channel   TEXT,
        level_up_message   TEXT,
        stack_rewards      BOOLEAN NOT NULL DEFAULT TRUE,
        no_xp_channel_ids  TEXT[] NOT NULL DEFAULT '{}',
        xp_per_message_min INT NOT NULL DEFAULT 15,
        xp_per_message_max INT NOT NULL DEFAULT 25,
        cooldown_seconds   INT NOT NULL DEFAULT 60,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'level_settings updated_at trigger',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'level_settings_touch_updated_at'
        ) THEN
          CREATE TRIGGER level_settings_touch_updated_at
            BEFORE UPDATE ON panda.level_settings
            FOR EACH ROW EXECUTE FUNCTION panda.touch_updated_at();
        END IF;
      END $$
    `,
  },
  {
    name: 'level_rewards table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.level_rewards (
        server_id   TEXT NOT NULL,
        level       INT NOT NULL,
        role_id     TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, level)
      )
    `,
  },
  {
    name: 'level_rewards by_server index',
    sql: `
      CREATE INDEX IF NOT EXISTS level_rewards_by_server
        ON panda.level_rewards (server_id, level)
    `,
  },
  {
    name: 'warnings table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.warnings (
        id          BIGSERIAL PRIMARY KEY,
        server_id   TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        actor_id    TEXT NOT NULL,
        reason      TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'warnings by_user index',
    sql: `
      CREATE INDEX IF NOT EXISTS warnings_by_user_idx
        ON panda.warnings (server_id, user_id, created_at DESC)
    `,
  },
  {
    name: 'automod_config table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.automod_config (
        server_id              TEXT PRIMARY KEY,
        enabled                BOOLEAN NOT NULL DEFAULT FALSE,

        spam_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
        spam_threshold         INT NOT NULL DEFAULT 5,
        spam_window_seconds    INT NOT NULL DEFAULT 5,

        bad_words_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
        bad_words              TEXT[] NOT NULL DEFAULT '{}',

        caps_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
        caps_threshold_pct     INT NOT NULL DEFAULT 70,
        caps_min_length        INT NOT NULL DEFAULT 10,

        mentions_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
        mentions_threshold     INT NOT NULL DEFAULT 5,

        emoji_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
        emoji_threshold        INT NOT NULL DEFAULT 10,

        zalgo_enabled          BOOLEAN NOT NULL DEFAULT FALSE,

        links_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
        link_whitelist         TEXT[] NOT NULL DEFAULT '{}',

        invites_enabled        BOOLEAN NOT NULL DEFAULT FALSE,

        exempt_channel_ids     TEXT[] NOT NULL DEFAULT '{}',
        exempt_role_ids        TEXT[] NOT NULL DEFAULT '{}',

        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'automod_config updated_at trigger',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'automod_config_touch_updated_at'
        ) THEN
          CREATE TRIGGER automod_config_touch_updated_at
            BEFORE UPDATE ON panda.automod_config
            FOR EACH ROW EXECUTE FUNCTION panda.touch_updated_at();
        END IF;
      END $$
    `,
  },
  {
    name: 'automod_offenses table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.automod_offenses (
        id          BIGSERIAL PRIMARY KEY,
        server_id   TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        filter_kind TEXT NOT NULL,
        message_id  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'automod_offenses recent index',
    sql: `
      CREATE INDEX IF NOT EXISTS automod_offenses_recent_idx
        ON panda.automod_offenses (server_id, user_id, created_at DESC)
    `,
  },
  {
    name: 'reaction_role_messages table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.reaction_role_messages (
        message_id  TEXT PRIMARY KEY,
        server_id   TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        mode        TEXT NOT NULL DEFAULT 'normal',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'reaction_role_messages by_server index',
    sql: `
      CREATE INDEX IF NOT EXISTS rrm_by_server_idx
        ON panda.reaction_role_messages (server_id)
    `,
  },
  {
    name: 'reaction_role_mappings table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.reaction_role_mappings (
        message_id  TEXT NOT NULL,
        emoji       TEXT NOT NULL,
        role_id     TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (message_id, emoji)
      )
    `,
  },
  {
    name: 'custom_commands table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.custom_commands (
        server_id   TEXT NOT NULL,
        name        TEXT NOT NULL,
        response    TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        uses_count  BIGINT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, name)
      )
    `,
  },
  {
    name: 'afk table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.afk (
        server_id  TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        message    TEXT,
        since      TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, user_id)
      )
    `,
  },
  {
    name: 'guild_config + suggestions_channel',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS suggestions_channel TEXT
    `,
  },
  {
    name: 'guild_config + anti_raid columns',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS anti_raid_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS anti_raid_threshold     INT NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS anti_raid_window_seconds INT NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS anti_raid_lockdown_until TIMESTAMPTZ
    `,
  },
  {
    name: 'reminders table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.reminders (
        id          BIGSERIAL PRIMARY KEY,
        server_id   TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        message     TEXT NOT NULL,
        due_at      TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'reminders due_at index',
    sql: `
      CREATE INDEX IF NOT EXISTS reminders_due_at_idx
        ON panda.reminders (due_at)
    `,
  },
  {
    name: 'reminders by_user index',
    sql: `
      CREATE INDEX IF NOT EXISTS reminders_by_user_idx
        ON panda.reminders (server_id, user_id, due_at)
    `,
  },
  {
    name: 'giveaways table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.giveaways (
        id            BIGSERIAL PRIMARY KEY,
        server_id     TEXT NOT NULL,
        channel_id    TEXT NOT NULL,
        message_id    TEXT NOT NULL,
        prize         TEXT NOT NULL,
        winner_count  INT NOT NULL DEFAULT 1,
        end_at        TIMESTAMPTZ NOT NULL,
        ended         BOOLEAN NOT NULL DEFAULT FALSE,
        winners_json  TEXT,
        created_by    TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'giveaways scheduling index',
    sql: `
      CREATE INDEX IF NOT EXISTS giveaways_end_at_idx
        ON panda.giveaways (end_at)
        WHERE ended = FALSE
    `,
  },
  {
    name: 'giveaways by_message index',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS giveaways_message_idx
        ON panda.giveaways (message_id)
    `,
  },
  {
    name: 'stat_counters table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.stat_counters (
        server_id   TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        kind        TEXT NOT NULL,
        format      TEXT NOT NULL,
        last_value  INT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (channel_id)
      )
    `,
  },
  {
    name: 'stat_counters by_server index',
    sql: `
      CREATE INDEX IF NOT EXISTS stat_counters_by_server_idx
        ON panda.stat_counters (server_id)
    `,
  },
  {
    name: 'temp_channels table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.temp_channels (
        channel_id  TEXT PRIMARY KEY,
        server_id   TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'temp_channels expiry index',
    sql: `
      CREATE INDEX IF NOT EXISTS temp_channels_expiry_idx
        ON panda.temp_channels (expires_at)
    `,
  },
  {
    name: 'reddit_subs table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.reddit_subs (
        id            BIGSERIAL PRIMARY KEY,
        server_id     TEXT NOT NULL,
        channel_id    TEXT NOT NULL,
        subreddit     TEXT NOT NULL,
        last_post_id  TEXT,
        created_by    TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'reddit_subs unique index',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS reddit_subs_uniq_idx
        ON panda.reddit_subs (server_id, channel_id, subreddit)
    `,
  },
  {
    name: 'twitch_subs table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.twitch_subs (
        id              BIGSERIAL PRIMARY KEY,
        server_id       TEXT NOT NULL,
        channel_id      TEXT NOT NULL,
        twitch_login    TEXT NOT NULL,
        last_stream_id  TEXT,
        last_check_live BOOLEAN NOT NULL DEFAULT FALSE,
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'twitch_subs unique index',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS twitch_subs_uniq_idx
        ON panda.twitch_subs (server_id, channel_id, twitch_login)
    `,
  },
  {
    name: 'youtube_subs table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.youtube_subs (
        id                  BIGSERIAL PRIMARY KEY,
        server_id           TEXT NOT NULL,
        channel_id          TEXT NOT NULL,
        youtube_channel_id  TEXT NOT NULL,
        last_video_id       TEXT,
        created_by          TEXT NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'youtube_subs unique index',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS youtube_subs_uniq_idx
        ON panda.youtube_subs (server_id, channel_id, youtube_channel_id)
    `,
  },
  {
    name: 'auto_react table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.auto_react (
        server_id   TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        emoji       TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (channel_id, emoji)
      )
    `,
  },
  {
    name: 'auto_react by_server index',
    sql: `
      CREATE INDEX IF NOT EXISTS auto_react_by_server_idx
        ON panda.auto_react (server_id)
    `,
  },
  {
    name: 'keyword_responses table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.keyword_responses (
        id          BIGSERIAL PRIMARY KEY,
        server_id   TEXT NOT NULL,
        phrase      TEXT NOT NULL,
        response    TEXT NOT NULL,
        channel_id  TEXT,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'keyword_responses by_server index',
    sql: `
      CREATE INDEX IF NOT EXISTS keyword_responses_by_server_idx
        ON panda.keyword_responses (server_id)
    `,
  },
  {
    name: 'scheduled_messages table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.scheduled_messages (
        id                BIGSERIAL PRIMARY KEY,
        server_id         TEXT NOT NULL,
        channel_id        TEXT NOT NULL,
        message           TEXT NOT NULL,
        schedule_kind     TEXT NOT NULL,
        interval_seconds  INT,
        daily_time        TEXT,
        next_run_at       TIMESTAMPTZ NOT NULL,
        created_by        TEXT NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'scheduled_messages next_run index',
    sql: `
      CREATE INDEX IF NOT EXISTS scheduled_messages_next_run_idx
        ON panda.scheduled_messages (next_run_at)
    `,
  },
  {
    name: 'scheduled_messages by_server index',
    sql: `
      CREATE INDEX IF NOT EXISTS scheduled_messages_by_server_idx
        ON panda.scheduled_messages (server_id)
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const stmt of STATEMENTS) {
      log.debug({ migration: stmt.name }, 'Applying');
      await client.query(stmt.sql);
    }
    log.info({ count: STATEMENTS.length }, 'Migrations applied');
  } finally {
    client.release();
  }
}
