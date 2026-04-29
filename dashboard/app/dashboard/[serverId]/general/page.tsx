import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getServerChannels } from '@/lib/botApi';
import { FormCard, Field, inputClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { SaveBar } from '@/components/SaveBar';
import { saveGeneral } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function GeneralPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [config, channels] = await Promise.all([
    getGuildConfig(serverId),
    getServerChannels(serverId),
  ]);
  const action = saveGeneral.bind(null, serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">General</h1>
        <p className="mt-2 text-text-secondary">
          Server-wide basics — command prefix and where the suggestions feed posts.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <FormCard
          title="Command prefix"
          description="What members type before a command name (defaults to !). Per-server override; clear to fall back to the bot's default."
        >
          <Field
            label="Prefix"
            name="prefix"
            hint="1-5 characters. Leave blank or type 'none' to clear the override."
          >
            <input
              id="prefix"
              name="prefix"
              defaultValue={config.prefix ?? ''}
              placeholder="!"
              maxLength={5}
              className={inputClassName}
            />
          </Field>
        </FormCard>

        <FormCard
          title="Suggestions channel"
          description="Where !suggest posts land. Members can submit a suggestion from any channel; the post + voting reactions go here."
        >
          <Field
            label="Channel"
            name="suggestionsChannel"
            hint="Pick the channel where suggestion posts will appear."
          >
            <ChannelPicker
              mode="single"
              name="suggestionsChannel"
              channels={channels}
              initial={config.suggestionsChannel}
              allowedTypes={['text']}
              clearable
            />
          </Field>
        </FormCard>

        <SaveBar />
      </form>
    </div>
  );
}
