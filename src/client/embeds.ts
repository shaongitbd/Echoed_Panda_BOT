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
  if (input.title) out.title = input.title;
  if (input.description) out.description = input.description;
  if (input.url) out.url = input.url;
  if (input.fields && input.fields.length > 0) out.fields = input.fields;
  if (input.footer) out.footer = { text: input.footer };
  if (input.thumbnail) out.thumbnail = { url: input.thumbnail };
  if (ts) out.timestamp = ts;
  return out;
}

// Field builder — keeps the inline default explicit at the call site.
export function field(name: string, value: string, inline = false): EmbedField {
  return { name, value, inline };
}
