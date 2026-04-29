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

interface Vars {
  userId: string;
  userName: string;
  args: string[];
}

export function renderCustomCommand(template: string, vars: Vars): string {
  const argsJoined = vars.args.join(' ');
  return template
    .replace(/\{user\.name\}/g, vars.userName)
    .replace(/\{user\}/g, `<@${vars.userId}>`)
    .replace(/\{args\}/g, argsJoined);
}
