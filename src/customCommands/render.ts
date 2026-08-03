// Render a custom-command template. Supported placeholders:
//   {user}        — mention the invoker, `<@id>`
//   {user.name}   — invoker's display name as a plain string
//   {args}        — everything after the command name, joined by spaces
//
// Anything else passes through unchanged so the response can contain
// literal `{` / `}`.
//
// We deliberately keep this minimal — a richer template system (random
// pick lists, conditionals, etc.) is post-MVP.

import { escapeMentions } from '../client/text.js';

interface Vars {
  userId: string;
  userName: string;
  args: string[];
}

export function renderCustomCommand(template: string, vars: Vars): string {
  // {args} is whatever the invoker typed and {user.name} is a display name
  // they may control, so both are neutralised — otherwise a member could
  // make the bot ping anyone, or everyone, simply by passing that text to
  // a custom command. {user} stays a real mention: that one is the point.
  const argsJoined = escapeMentions(vars.args.join(' '));
  return template
    .replace(/\{user\.name\}/g, escapeMentions(vars.userName))
    .replace(/\{user\}/g, `<@${vars.userId}>`)
    .replace(/\{args\}/g, argsJoined);
}
