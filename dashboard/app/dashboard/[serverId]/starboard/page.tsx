import { requireOwner } from '@/lib/forms';
import { getServerChannels } from '@/lib/botApi';
import { getStarboard } from '@/lib/queries/community';
import { FormCard, Field, PageHeader, inputClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { Notice } from '@/components/Notice';
import { saveStarboardAction } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERRORS: Record<string, string> = {
  emoji: 'Use a single emoji, e.g. ⭐ or :fire:.',
  channel: 'Pick a channel in this server.',
  'needs-channel': 'Pick a channel before turning the starboard on.',
};

export default async function StarboardPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  await requireOwner(serverId);
  const query = await searchParams;
  const [cfg, channels] = await Promise.all([getStarboard(serverId), getServerChannels(serverId)]);

  return (
    <div>
      <PageHeader
        title="Starboard"
        description="When a message collects enough of one reaction, Panda reposts it to a highlights channel — the server's best moments in one place."
      />
      <Notice query={query} errors={ERRORS} />

      <form action={saveStarboardAction.bind(null, serverId)} className="space-y-4">
        <FormCard title="Starboard">
          <Toggle name="enabled" label="Repost popular messages" defaultChecked={cfg.enabled} />
          <Field label="Highlights channel" name="channelId">
            <ChannelPicker name="channelId" mode="single" channels={channels} allowedTypes={['text']} initial={cfg.channelId} clearable placeholder="Pick a channel…" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Reaction" name="emoji" hint="The emoji that counts.">
              <input id="emoji" name="emoji" defaultValue={cfg.emoji} maxLength={64} className={inputClassName} />
            </Field>
            <Field label="Reactions needed" name="threshold" hint="1–50.">
              <input id="threshold" name="threshold" type="number" min={1} max={50} defaultValue={cfg.threshold} className={inputClassName} />
            </Field>
          </div>
        </FormCard>
        <SaveBar />
      </form>
    </div>
  );
}
