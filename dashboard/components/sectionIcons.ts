import {
  Bell, Braces, CalendarClock, ChartColumn, Gavel, Gift, Hand, LayoutDashboard, MessageSquareText,
  Music, ScrollText, Settings, ShieldCheck, Sparkles, SquareTerminal, Sticker, Tags, TrendingUp,
  type LucideIcon,
} from 'lucide-react';

// One icon per dashboard section (lib/sections.ts hrefs) — shared by the
// sidebar, the Overview and the settings search so a section always looks
// the same wherever it's shown.
export const SECTION_ICONS: Record<string, LucideIcon> = {
  '': LayoutDashboard,
  '/general': Settings,
  '/commands': SquareTerminal,
  '/moderation': Gavel,
  '/automod': ShieldCheck,
  '/ai': Sparkles,
  '/logging': ScrollText,
  '/welcome': Hand,
  '/levels': TrendingUp,
  '/reactionroles': Tags,
  '/giveaways': Gift,
  '/customcommands': Braces,
  '/keywords': MessageSquareText,
  '/autoreact': Sticker,
  '/schedules': CalendarClock,
  '/notifications': Bell,
  '/statcounters': ChartColumn,
  '/music': Music,
};

export function iconFor(href: string): LucideIcon {
  return SECTION_ICONS[href] ?? LayoutDashboard;
}
