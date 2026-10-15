import { requireOwner } from '@/lib/forms';
import { getServerChannels } from '@/lib/botApi';
import { getQotd, listQotdQuestions, MAX_QUESTION_LEN } from '@/lib/queries/community';
import { FormCard, Field, PageHeader, inputClassName, textareaClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { Notice, formatUtc } from '@/components/Notice';
import { addQuestionAction, removeQuestionAction, saveQotdAction } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERRORS: Record<string, string> = {
  time: 'Time must be HH:MM in 24-hour UTC, e.g. 18:30.',
  channel: 'Pick a channel in this server.',
  'needs-channel': 'Pick a channel before turning question of the day on.',
  empty: 'Write a question first.',
  long: `Questions are limited to ${MAX_QUESTION_LEN} characters.`,
};

export default async function QotdPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  await requireOwner(serverId);
  const query = await searchParams;
  const [cfg, questions, channels] = await Promise.all([
    getQotd(serverId),
    listQotdQuestions(serverId),
    getServerChannels(serverId),
  ]);
  const next = cfg.enabled && cfg.channelId ? formatUtc(cfg.nextRunAt) : null;

  return (
    <div>
      <PageHeader
        title="Question of the day"
        description="Panda posts one conversation starter a day. It uses your questions first, then its own bank of light, easy-to-answer ones."
      />
      <Notice query={query} errors={ERRORS} />

      <form action={saveQotdAction.bind(null, serverId)} className="space-y-4">
        <FormCard title="Schedule" description={next ? `Next question: ${next}.` : 'Off — nothing is scheduled.'}>
          <Toggle name="enabled" label="Post a question every day" defaultChecked={cfg.enabled} />
          <Field label="Channel" name="channelId">
            <ChannelPicker name="channelId" mode="single" channels={channels} allowedTypes={['text']} initial={cfg.channelId} clearable placeholder="Pick a channel…" />
          </Field>
          <Field label="Time (UTC)" name="dailyTime" hint="24-hour, in UTC. Changing it reschedules the next post.">
            <input id="dailyTime" name="dailyTime" defaultValue={cfg.dailyTime} placeholder="12:00" pattern="([01]?\d|2[0-3]):[0-5]\d" className={`${inputClassName} max-w-[10rem]`} />
          </Field>
        </FormCard>
        <SaveBar />
      </form>

      <form action={addQuestionAction.bind(null, serverId)} className="mt-10">
        <FormCard title="Your questions" description="Panda picks from these before its own bank. Same as !qotd add.">
          <Field label="New question" name="question">
            <textarea id="question" name="question" rows={2} maxLength={MAX_QUESTION_LEN} placeholder="What's a game you'd happily play again for the first time?" className={textareaClassName} />
          </Field>
          <div className="flex justify-end">
            <button type="submit" className="h-10 rounded-lg bg-bg-elevated px-4 text-sm font-semibold text-text-primary transition-colors duration-100 hover:bg-bg-hover">
              Add question
            </button>
          </div>
        </FormCard>
      </form>

      {questions.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--border-subtle)] rounded-2xl bg-bg-card">
          {questions.map((q) => (
            <li key={q.id} className="flex items-start gap-3 px-5 py-3">
              <p className="min-w-0 flex-1 text-sm text-text-secondary">{q.question}</p>
              <form action={removeQuestionAction.bind(null, serverId, q.id)}>
                <button type="submit" className="text-xs text-text-faint underline-offset-2 hover:text-text-primary hover:underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 px-1 text-sm text-text-faint">No questions of your own yet — Panda will use its built-in bank.</p>
      )}
    </div>
  );
}
