import { getServerChannels } from '@/lib/botApi';
import { getCounting } from '@/lib/queries/community';
import { FormCard, Field, PageHeader } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { Notice } from '@/components/Notice';
import { resetCountingAction, saveCountingAction } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERRORS: Record<string, string> = {
  channel: 'Pick a channel in this server.',
  'needs-channel': 'Pick a channel before turning counting on.',
};

export default async function CountingPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const query = await searchParams;
  const [cfg, channels] = await Promise.all([getCounting(serverId), getServerChannels(serverId)]);
  const reset = query.saved === 'reset';

  return (
    <div>
      <PageHeader
        title="Counting"
        description="A channel where members count up together, one number each, no one twice in a row. Panda keeps score."
      />
      <Notice query={query} errors={ERRORS} saved={reset ? 'Count reset — the next number is 1.' : undefined} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.085em] text-text-faint">Current count</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-text-primary">{cfg.currentCount}</p>
        </div>
        <div className="rounded-2xl bg-bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.085em] text-text-faint">Best so far</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-text-primary">{cfg.highScore}</p>
        </div>
      </div>

      <form action={saveCountingAction.bind(null, serverId)} className="space-y-4">
        <FormCard title="Counting game">
          <Toggle name="enabled" label="Run the counting game" defaultChecked={cfg.enabled} />
          <Field label="Channel" name="channelId" hint="Best as a channel just for counting. Messages that aren't numbers are left alone.">
            <ChannelPicker name="channelId" mode="single" channels={channels} allowedTypes={['text']} initial={cfg.channelId} clearable placeholder="Pick a channel…" />
          </Field>
          <Toggle
            name="resetOnFail"
            label="Start over on a mistake"
            description="A wrong number, or the same person twice in a row, breaks the chain and the count starts over at 1. Off: the mistake just gets a ❌ and the count carries on."
            defaultChecked={cfg.resetOnFail}
          />
        </FormCard>
        <SaveBar />
      </form>

      <form action={resetCountingAction.bind(null, serverId)} className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-bg-card px-5 py-4">
        <p className="text-sm text-text-muted">Start the count over from 1. The best score is kept.</p>
        <button type="submit" className="h-9 shrink-0 rounded-lg bg-bg-elevated px-4 text-sm font-semibold text-text-primary transition-colors duration-100 hover:bg-bg-hover">
          Reset count
        </button>
      </form>
    </div>
  );
}
