import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getServerChannels } from '@/lib/botApi';
import { FormCard, Field, inputClassName, textareaClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { SaveBar } from '@/components/SaveBar';
import { saveWelcome } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function WelcomePage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [config, channels] = await Promise.all([
    getGuildConfig(serverId),
    getServerChannels(serverId),
  ]);
  const action = saveWelcome.bind(null, serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Welcome</h1>
        <p className="mt-2 text-text-secondary">
          Greet new members and assign them a starter role automatically.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <FormCard
          title="Welcome message"
          description="Set the channel and template. Leave the channel blank to disable greetings entirely (auto-role still works independently)."
        >
          <Field
            label="Welcome channel"
            name="welcomeChannel"
            hint="Pick the channel to post welcomes in. Leave empty to disable."
          >
            <ChannelPicker
              mode="single"
              name="welcomeChannel"
              channels={channels}
              initial={config.welcomeChannel}
              allowedTypes={['text']}
              clearable
            />
          </Field>

          <Field
            label="Welcome message"
            name="welcomeMessage"
            hint="Placeholders: {user}, {server}, {membercount}. Leave blank to use the default."
          >
            <textarea
              id="welcomeMessage"
              name="welcomeMessage"
              defaultValue={config.welcomeMessage ?? ''}
              rows={4}
              placeholder="Welcome to **{server}**, {user}! You're member #{membercount}."
              className={textareaClassName}
            />
          </Field>
        </FormCard>

        <FormCard
          title="Auto-role"
          description="Assigned to every new member as soon as they join. Useful for unverified / general / member roles."
        >
          <Field
            label="Auto-role"
            name="autoroleId"
            hint="Role ID or <@&role> mention. Type 'none' to clear."
          >
            <input
              id="autoroleId"
              name="autoroleId"
              defaultValue={config.autoroleId ?? ''}
              placeholder="<@&role> or role ID"
              className={inputClassName}
            />
          </Field>
        </FormCard>

        <SaveBar />
      </form>
    </div>
  );
}
