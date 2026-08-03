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
    // Lease columns. Scheduled work used to be claimed by deleting the row
    // and only then performing the side effect, so any failure in between
    // destroyed the work with no way to recover it. Now a claim marks the
    // row instead, and the row is only removed once the side effect has
    // actually succeeded. A lease that goes stale (process killed mid-tick)
    // becomes claimable again.
    name: 'reminders lease columns',
    sql: `
      ALTER TABLE panda.reminders
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS attempts   INT NOT NULL DEFAULT 0
    `,
  },
  {
    name: 'temp_channels lease columns',
    sql: `
      ALTER TABLE panda.temp_channels
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS attempts   INT NOT NULL DEFAULT 0
    `,
  },
  {
    // A giveaway used to be marked ended before its winners were drawn, so
    // any failure in between left it ended with nobody picked — and the
    // early-end path only matches un-ended rows, so it couldn't be redone.
    // The lease lets the draw be retried; `ended` is now set only once
    // winners have actually been announced.
    name: 'giveaways lease columns',
    sql: `
      ALTER TABLE panda.giveaways
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS attempts   INT NOT NULL DEFAULT 0
    `,
  },
  {
    // Rotation cursor for the stat-counter sweep. `updated_at` only moves
    // when a rename actually happens, so ordering a limited batch by it
    // would park permanently on counters whose value never changes and
    // never reach the rest. `checked_at` advances on every pass.
    name: 'stat_counters checked_at',
    sql: `
      ALTER TABLE panda.stat_counters
        ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ
    `,
  },
  {
    name: 'stat_counters checked_at index',
    sql: `
      CREATE INDEX IF NOT EXISTS stat_counters_checked_at_idx
        ON panda.stat_counters (checked_at NULLS FIRST)
    `,
  },
  {
    // Who is currently wearing the birthday role, and which role it was.
    //
    // The rotation used to strip the role from "whoever has a birthday
    // yesterday", which is only the same set as "whoever we granted it to"
    // if nothing ever changed in between. An edited or deleted birthday, a
    // failed removal, a skipped day, or an admin changing the configured
    // role all left the role on somebody permanently, with nothing able to
    // work out that it should come off. Recording what we actually granted
    // means the rotation can strip exactly that.
    name: 'birthday_role_holders table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.birthday_role_holders (
        server_id  TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        role_id    TEXT NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, user_id)
      )
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
  {
    name: 'guild_config + dj_role_id',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS dj_role_id TEXT
    `,
  },
  {
    name: 'level_settings + allow / ignore lists',
    sql: `
      ALTER TABLE panda.level_settings
        ADD COLUMN IF NOT EXISTS allowed_xp_channel_ids TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS allowed_xp_role_ids    TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS ignored_xp_role_ids    TEXT[] NOT NULL DEFAULT '{}'
    `,
  },
  {
    name: 'automod_config + allow lists',
    sql: `
      ALTER TABLE panda.automod_config
        ADD COLUMN IF NOT EXISTS allowed_channel_ids TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS allowed_role_ids    TEXT[] NOT NULL DEFAULT '{}'
    `,
  },
  {
    // Music command scope. Empty arrays mean "no restriction" — the
    // bot answers everywhere / to everyone, matching pre-existing
    // behavior. Populating either allow list locks the feature down.
    // Ignore lists override allow lists (same semantics as automod).
    name: 'guild_config + music scope lists',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS music_allowed_channel_ids TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS music_exempt_channel_ids  TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS music_allowed_role_ids    TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS music_exempt_role_ids     TEXT[] NOT NULL DEFAULT '{}'
    `,
  },
  {
    // Anti-raid: snapshot of the server's verification_level at the
    // moment we engage a lockdown, so we can restore it to its
    // original value when the lockdown clears. Without this, bumping
    // verification_level during a raid permanently changes admin
    // intent — we'd elevate to "Medium" on first raid and never come
    // back down. NULL = no snapshot pending (no active lockdown or
    // lockdown was cleared cleanly).
    name: 'guild_config + pre-lockdown verification level snapshot',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS pre_lockdown_verification_level INT
    `,
  },
  {
    // Giveaway entry scope. Applied at end-of-giveaway pick time so
    // changes affect in-flight giveaways too — admins don't have to
    // restart anything.
    //   - exclude_admins: drop members holding MANAGE_SERVER (owner /
    //     additional_admins / role with the bit). Default TRUE because
    //     admins picking themselves looks rigged regardless of intent.
    //   - allowed_role_ids: empty = anyone may win; non-empty
    //     restricts the winner pool to members holding ≥1 of these
    //     roles.
    //   - exempt_role_ids: members with any of these roles can never
    //     win. Overrides allowed_role_ids (same semantics as automod
    //     scope lists).
    //   - exempt_user_ids: specific user IDs that can never win.
    //     For "this person already won the last 5 in a row" cooldowns.
    name: 'guild_config + giveaway scope',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS giveaway_exclude_admins   BOOLEAN  NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS giveaway_allowed_role_ids TEXT[]   NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS giveaway_exempt_role_ids  TEXT[]   NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS giveaway_exempt_user_ids  TEXT[]   NOT NULL DEFAULT '{}'
    `,
  },
  {
    // bot_welcomed_at: timestamp the bot first sent its welcome card to
    // this server. Used as a one-shot flag — the welcome flow only fires
    // when this column is NULL, so socket reconnects / event replays /
    // server-leave-rejoin cycles never re-send the message. NULL by
    // default for every existing server (they were already invited
    // before this migration ran, so they don't need a retroactive
    // welcome). New servers get the welcome on first SERVER_MEMBER_ADD.
    name: 'guild_config + bot welcome marker',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS bot_welcomed_at TIMESTAMPTZ
    `,
  },
  {
    // level_perms_nagged_at: one-shot flag for the "I need Manage Roles to set
    // up levels" notice. Set when level provisioning fails for lack of
    // permission, so the reconcile + self-heal paths don't re-post the notice
    // on every boot/permission-change. Cleared once provisioning succeeds, so a
    // later permission loss can notify again.
    name: 'guild_config + level perms nag marker',
    sql: `
      ALTER TABLE panda.guild_config
        ADD COLUMN IF NOT EXISTS level_perms_nagged_at TIMESTAMPTZ
    `,
  },

  // ─── Engagement features ──────────────────────────────────────────────

  {
    // Question of the Day. One config row per server (where to post, at
    // what UTC time, on/off) plus a scheduling cursor (next_run_at) that
    // the tick advances by a day on each fire — same model as
    // scheduled_messages. last_question stops the immediate repeat.
    name: 'qotd_config table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.qotd_config (
        server_id      TEXT PRIMARY KEY,
        channel_id     TEXT,
        enabled        BOOLEAN NOT NULL DEFAULT FALSE,
        daily_time     TEXT NOT NULL DEFAULT '12:00',
        next_run_at    TIMESTAMPTZ,
        last_question  TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'qotd_config due index',
    sql: `
      CREATE INDEX IF NOT EXISTS qotd_config_due_idx
        ON panda.qotd_config (next_run_at)
        WHERE enabled = TRUE
    `,
  },
  {
    // Per-server custom question bank. When empty, the bot falls back to
    // a built-in default list so QOTD works the moment it's switched on.
    name: 'qotd_questions table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.qotd_questions (
        id          BIGSERIAL PRIMARY KEY,
        server_id   TEXT NOT NULL,
        question    TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'qotd_questions by_server index',
    sql: `
      CREATE INDEX IF NOT EXISTS qotd_questions_by_server_idx
        ON panda.qotd_questions (server_id)
    `,
  },
  {
    // Members' birthdays (month/day; year optional so age stays private).
    name: 'birthdays table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.birthdays (
        server_id    TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        birth_month  INT NOT NULL,
        birth_day    INT NOT NULL,
        birth_year   INT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, user_id)
      )
    `,
  },
  {
    name: 'birthdays by_date index',
    sql: `
      CREATE INDEX IF NOT EXISTS birthdays_by_date_idx
        ON panda.birthdays (server_id, birth_month, birth_day)
    `,
  },
  {
    // Birthday announcement config. Same daily scheduling cursor as QOTD.
    // role_id (optional) is granted on the member's birthday and removed
    // the next day. message is an optional template ({user} placeholder).
    name: 'birthday_config table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.birthday_config (
        server_id    TEXT PRIMARY KEY,
        channel_id   TEXT,
        enabled      BOOLEAN NOT NULL DEFAULT FALSE,
        daily_time   TEXT NOT NULL DEFAULT '09:00',
        role_id      TEXT,
        message      TEXT,
        next_run_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: 'birthday_config due index',
    sql: `
      CREATE INDEX IF NOT EXISTS birthday_config_due_idx
        ON panda.birthday_config (next_run_at)
        WHERE enabled = TRUE
    `,
  },
  {
    // Starboard config: which emoji + how many of it reposts a message to
    // which channel.
    name: 'starboard_config table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.starboard_config (
        server_id   TEXT PRIMARY KEY,
        channel_id  TEXT,
        emoji       TEXT NOT NULL DEFAULT '⭐',
        threshold   INT NOT NULL DEFAULT 3,
        enabled     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  },
  {
    // Tracks which source messages already have a starboard entry (so we
    // edit the existing post's count rather than reposting) keyed by the
    // original message.
    name: 'starboard_posts table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.starboard_posts (
        server_id             TEXT NOT NULL,
        source_message_id     TEXT NOT NULL,
        source_channel_id     TEXT NOT NULL,
        starboard_message_id  TEXT NOT NULL,
        star_count            INT NOT NULL DEFAULT 0,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, source_message_id)
      )
    `,
  },
  {
    // Daily check-in streaks. last_claim_date is a DATE (UTC day) so the
    // "already claimed today / continued yesterday / streak broken" logic
    // is a plain date comparison.
    name: 'daily_checkins table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.daily_checkins (
        server_id        TEXT NOT NULL,
        user_id          TEXT NOT NULL,
        last_claim_date  DATE,
        streak           INT NOT NULL DEFAULT 0,
        best_streak      INT NOT NULL DEFAULT 0,
        total_claims     INT NOT NULL DEFAULT 0,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (server_id, user_id)
      )
    `,
  },
  {
    // Counting game: one channel per server where the community counts up.
    // current_count is the last valid number; last_user_id enforces the
    // no-double-counting rule; high_score is the all-time best run.
    name: 'counting_config table',
    sql: `
      CREATE TABLE IF NOT EXISTS panda.counting_config (
        server_id      TEXT PRIMARY KEY,
        channel_id     TEXT,
        current_count  INT NOT NULL DEFAULT 0,
        last_user_id   TEXT,
        high_score     INT NOT NULL DEFAULT 0,
        enabled        BOOLEAN NOT NULL DEFAULT FALSE,
        reset_on_fail  BOOLEAN NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
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
