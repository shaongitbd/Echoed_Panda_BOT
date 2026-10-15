import { requireOwner } from '@/lib/forms';
import { getServerChannels, getServerRoles } from '@/lib/botApi';
import { getBirthdays, MAX_BIRTHDAY_MESSAGE } from '@/lib/queries/community';
import { FormCard, Field, PageHeader, inputClassName, textareaClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { RolePicker } from '@/components/RolePicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { Notice, formatUtc } from '@/components/Notice';
import { saveBirthdaysAction } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERRORS: Record<string, string> = {
  time: 'Time must be HH:MM in 24-hour UTC, e.g. 09:00.',
  long: `The message is limited to ${MAX_BIRTHDAY_MESSAGE} characters.`,
  channel: 'Pick a channel in this server.',
  role: 'Pick a role in this server.',
  'needs-channel': 'Pick a channel before turning birthdays on.',
};

export default async function BirthdaysPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  await requireOwner(serverId);
  const query = await searchParams;
  const [cfg, channels, roles] = await Promise.all([
    getBirthdays(serverId),
    getServerChannels(serverId),
    getServerRoles(serverId),
  ]);
  const next = cfg.enabled && cfg.channelId ? formatUtc(cfg.nextRunAt) : null;

  return (
    <div>
      <PageHeader
        title="Birthdays"
        description={
          <>
            Members save their birthday with <code className="text-text-secondary">!birthday set MM-DD</code>; Panda
            wishes them happy birthday on the day.{' '}
            {cfg.registered > 0 ? `${cfg.registered} member${cfg.registered === 1 ? ' has' : 's have'} saved one so far.` : 'Nobody has saved one yet.'}
          </>
        }
      />
      <Notice query={query} errors={ERRORS} />

      <form action={saveBirthdaysAction.bind(null, serverId)} className="space-y-4">
        <FormCard title="Announcements" description={next ? `Next check: ${next}.` : 'Off — no birthday posts.'}>
          <Toggle name="enabled" label="Wish members happy birthday" defaultChecked={cfg.enabled} />
          <Field label="Channel" name="channelId">
            <ChannelPicker name="channelId" mode="single" channels={channels} allowedTypes={['text']} initial={cfg.channelId} clearable placeholder="Pick a channel…" />
          </Field>
          <Field label="Time (UTC)" name="dailyTime" hint="When Panda checks for today's birthdays. 24-hour, in UTC.">
            <input id="dailyTime" name="dailyTime" defaultValue={cfg.dailyTime} placeholder="09:00" pattern="([01]?\d|2[0-3]):[0-5]\d" className={`${inputClassName} max-w-[10rem]`} />
          </Field>
        </FormCard>

        <FormCard title="Birthday role and message">
          <Field label="Birthday role" name="roleId" hint="Optional. Given for the day, then taken back.">
            <RolePicker name="roleId" mode="single" roles={roles} initial={cfg.roleId} clearable />
          </Field>
          <Field label="Message" name="message" hint="Optional. {user} becomes the birthday mention(s). Leave empty for Panda's own message.">
            <textarea id="message" name="message" rows={3} maxLength={MAX_BIRTHDAY_MESSAGE} defaultValue={cfg.message ?? ''} placeholder="🎂 Happy birthday {user}! Hope it's a great one. 🎉" className={textareaClassName} />
          </Field>
        </FormCard>
        <SaveBar />
      </form>
    </div>
  );
}
