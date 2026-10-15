import Link from 'next/link';
import { PandaLogo } from './PandaMark';

export function Footer(): JSX.Element {
  const link = 'text-text-muted transition-colors duration-100 hover:text-text-primary';
  return (
    <footer className="mt-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col gap-2">
          <PandaLogo size={24} />
          <p className="text-sm text-text-faint">The bot for Echoed servers. Free, with no premium tier.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/docs" className={link}>Docs</Link>
          <Link href="/privacy" className={link}>Privacy</Link>
          <Link href="/terms" className={link}>Terms</Link>
          <a href="https://github.com/shaongitbd/Echoed_Panda_BOT/blob/main/LICENSE" className={link}>Source &amp; licence</a>
          <a href="https://echoed.gg" className={link}>Echoed</a>
        </nav>
      </div>
    </footer>
  );
}
