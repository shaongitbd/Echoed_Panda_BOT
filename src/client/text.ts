// Neutralising untrusted text before it goes into message content.
//
// Message content is scanned for things that turn into pings:
//   - `<@id>` / `<@&id>` / `<#id>` wire tokens
//   - a bare `@handle`, which is looked up and linked
//   - `@everyone` / `@here`, which are gated on the *sender's* permissions
//
// The sender here is always the bot. On a server where the bot was granted
// broad permissions — common, since it does moderation, roles and lockdown
// — that means text a member supplies can reach a mass ping just by being
// echoed back. Custom-command arguments, reminder bodies, keyword and
// scheduled-message bodies and warn reasons are all member-authored and all
// end up in content.
//
// So: anything that came from a user, and is being interpolated into
// content, goes through escapeMentions() first. Text we construct
// ourselves — a deliberate `{user}` expansion, a resolved display name —
// does not, because those pings are the intent.
//
// Note this is only needed for content. Embed bodies are delivered
// verbatim and are never scanned, so they cannot ping at all.

// A zero-width space breaks the pattern for the parser while staying
// invisible to a reader.
const ZWSP = '​';

export function escapeMentions(text: string): string {
  if (!text) return text;
  return (
    text
      // Break the opening bracket of a wire token: `<@id>` / `<@&id>` /
      // `<#id>`. Inserting after `<` leaves the visible text intact.
      .replace(/<(?=[@#])/g, `<${ZWSP}`)
      // `@everyone` / `@here` — the highest-impact case, since these are
      // permission-gated on the bot rather than on whoever supplied the
      // text.
      .replace(/@(everyone|here)\b/gi, `@${ZWSP}$1`)
      // A bare `@handle` is resolved against the user directory and
      // linked, so an unrelated member can be pulled into a message just
      // by their name appearing in it.
      .replace(/(^|[\s])@(?=[A-Za-z0-9_])/g, `$1@${ZWSP}`)
  );
}

// True if the text contains anything that would ping when placed in
// content. Used by config commands to refuse a template that would ping a
// specific member on every future use, rather than silently accepting it.
const PING_RE = /<@&?[a-zA-Z0-9_-]+>|<#[a-zA-Z0-9_-]+>|@everyone\b|@here\b|(?:^|\s)@[A-Za-z0-9_]/i;

export function containsMention(text: string): boolean {
  return !!text && PING_RE.test(text);
}
