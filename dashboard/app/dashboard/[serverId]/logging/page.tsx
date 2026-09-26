import { getLogConfig, LOG_EVENTS } from '@/lib/queries/logConfig';
import { getServerChannels } from '@/lib/botApi';
import { FormCard, Field } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { saveLogging } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function LoggingPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [config, channels] = await Promise.all([getLogConfig(serverId), getServerChannels(serverId)]);
  const action = saveLogging.bind(null, serverId);
  const eventToggles = (group: 'messages' | 'members') =>
    LOG_EVENTS.filter((e) => e.group === group).map((e) => (
      <Toggle
        key={e.name}
        name={`event:${e.name}`}
        label={e.label}
        defaultChecked={!config.disabledEvents.includes(e.name)}
      />
    ));

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Server log</h1>
        <p className="mt-2 text-text-secondary">
          A record of what changes in your server: edited and deleted messages, and who joins,
          leaves, is kicked or banned, or changes nickname. Moderation actions taken through Panda
          stay in the mod-log.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <FormCard
          title="Messages"
          description="Edits show the text before and after. Deletes show the message in full, so post these to a channel only moderators can read."
        >
          <Field label="Channel" name="messageChannel" hint="Leave empty to turn message logging off.">
            <ChannelPicker
              mode="single"
              name="messageChannel"
              channels={channels}
              initial={config.messageChannel}
              allowedTypes={['text']}
              clearable
            />
          </Field>
          {eventToggles('messages')}
          <Toggle
            name="logBots"
            label="Log messages written by bots"
            description="Off by default — bots edit and delete their own messages constantly."
            defaultChecked={!config.ignoreBots}
          />
          <Field
            label="Channels not logged"
            name="ignoredChannelIds"
            hint="Edits and deletes in these channels are left out — a spam or bot channel, say."
          >
            <ChannelPicker
              mode="multi"
              name="ignoredChannelIds"
              channels={channels}
              initial={config.ignoredChannelIds}
            />
          </Field>
        </FormCard>

        <FormCard
          title="Members"
          description="Joins (with account age, to spot new accounts), leaves, kicks, bans and nickname changes."
        >
          <Field label="Channel" name="memberChannel" hint="Leave empty to turn member logging off.">
            <ChannelPicker
              mode="single"
              name="memberChannel"
              channels={channels}
              initial={config.memberChannel}
              allowedTypes={['text']}
              clearable
            />
          </Field>
          {eventToggles('members')}
        </FormCard>

        <SaveBar />
      </form>
    </div>
  );
}
