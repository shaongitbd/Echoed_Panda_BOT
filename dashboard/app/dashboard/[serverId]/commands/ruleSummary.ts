import type { CommandRule } from '@/lib/queries/commandSettings';

// The short labels a rule shows on the list page, so an admin can see at a
// glance which commands are limited without opening each one.
export function ruleChips(rule: CommandRule | undefined): string[] {
  if (!rule) return [];
  const chips: string[] = [];
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  if (!rule.enabled) chips.push('Off');
  if (rule.allowedChannelIds.length > 0) {
    chips.push(`Only in ${plural(rule.allowedChannelIds.length, 'channel', 'channels')}`);
  }
  if (rule.ignoredChannelIds.length > 0) {
    chips.push(`Not in ${plural(rule.ignoredChannelIds.length, 'channel', 'channels')}`);
  }
  if (rule.allowedRoleIds.length > 0) {
    chips.push(`${plural(rule.allowedRoleIds.length, 'role', 'roles')} only`);
  }
  if (rule.ignoredRoleIds.length > 0) {
    chips.push(`${plural(rule.ignoredRoleIds.length, 'role', 'roles')} blocked`);
  }
  if (rule.cooldownSeconds !== null) {
    chips.push(rule.cooldownSeconds === 0 ? 'No cooldown' : `${rule.cooldownSeconds}s cooldown`);
  }
  if (rule.deleteInvocation) chips.push('Deletes the command');
  return chips;
}

export function editHref(serverId: string, scope: string): string {
  return `/dashboard/${serverId}/commands/edit?scope=${encodeURIComponent(scope)}`;
}
