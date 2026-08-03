// Embed-builder helpers. Commands import these instead of constructing
// the raw Embed shape — keeps colors / typography consistent across
// the bot and gives us one place to change the brand if it ever
// shifts.
//
// Echoed's embed schema mirrors Discord's: `color` is a decimal RGB
// integer, fields are an array of {name,value,inline}, etc.

import type { Embed, EmbedField } from './echoedClient.js';

// Brand palette — these match the dashboard's design tokens. Picked
// for legibility on Echoed's dark default bg.
export const COLORS = {
  // Echoed gold — primary brand. Use for "neutral / informational"
  // panels (rank, leaderboard, settings).
  ACCENT: 0xffc928,
  // Bamboo green — used for "on / active / live" status panels.
  ONLINE: 0x4ade80,
  // Soft red — used for warnings and danger.
  DANGER: 0xef4444,
  // Amber — used for warnings that aren't quite errors.
  WARNING: 0xf59e0b,
  // Subtle gray — used for "off / disabled".
  MUTED: 0x71717a,
} as const;

// Caps applied to every embed we build.
//
// Nothing enforced these before, and a dozen list commands built their
// description by joining an unbounded row set. Over-length content is
// dropped rather than rejected, so the failure mode is a card that arrives
// blank or truncated with no error anywhere — worse than showing fewer
// rows. Truncating centrally means no call site has to remember, and the
// three sites that each invented their own arbitrary limit can stop.
const MAX_TITLE = 240;
const MAX_DESCRIPTION = 3800;
const MAX_FIELDS = 20;
const MAX_FIELD_NAME = 240;
const MAX_FIELD_VALUE = 1000;
const MAX_FOOTER = 200;

// Cut on a whitespace boundary where one is close by, so a truncated line
// doesn't end mid-word.
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastBreak = slice.lastIndexOf('\n');
  const cut = lastBreak > max * 0.6 ? lastBreak : slice.length;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

interface BuildEmbedInput {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  footer?: string;
  thumbnail?: string;
  url?: string;
  // Defaults to now() if not provided. Pass `null` to omit timestamp.
  timestamp?: Date | null;
}

// One canonical embed builder so every command surfaces a consistent
// look. Defaults: ACCENT color, current timestamp.
export function buildEmbed(input: BuildEmbedInput): Embed {
  const ts: string | undefined = input.timestamp === null
    ? undefined
    : (input.timestamp ?? new Date()).toISOString();

  const out: Embed = {
    type: 'rich',
    color: input.color ?? COLORS.ACCENT,
  };
  if (input.title) out.title = truncate(input.title, MAX_TITLE);
  if (input.description) out.description = truncate(input.description, MAX_DESCRIPTION);
  if (input.url) out.url = input.url;
  if (input.fields && input.fields.length > 0) {
    const kept = input.fields.slice(0, MAX_FIELDS);
    out.fields = kept.map((f) => ({
      name: truncate(f.name, MAX_FIELD_NAME),
      value: truncate(f.value, MAX_FIELD_VALUE),
      inline: f.inline,
    }));
    if (input.fields.length > MAX_FIELDS) {
      out.fields[MAX_FIELDS - 1] = {
        name: '…',
        value: `and ${input.fields.length - MAX_FIELDS + 1} more`,
        inline: false,
      };
    }
  }
  if (input.footer) out.footer = { text: truncate(input.footer, MAX_FOOTER) };
  if (input.thumbnail) out.thumbnail = { url: input.thumbnail };
  if (ts) out.timestamp = ts;
  return out;
}

// Field builder — keeps the inline default explicit at the call site.
export function field(name: string, value: string, inline = false): EmbedField {
  return { name, value, inline };
}

// Render a bounded list into an embed description, with an explicit note
// when rows were dropped. Silently showing the first N reads as "that's
// everything", which is how an admin ends up thinking a rule vanished.
export function boundedList(rows: readonly string[], max = 25): {
  description: string;
  omitted: number;
} {
  const kept = rows.slice(0, max);
  const omitted = rows.length - kept.length;
  return { description: kept.join('\n'), omitted };
}
