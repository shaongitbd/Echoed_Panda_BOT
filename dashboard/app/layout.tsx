import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'panda — moderation, leveling, and more for Echoed',
  description:
    'Configurable bot for Echoed servers. Levels, moderation, auto-mod, welcome flows, reaction roles, custom commands, scheduled messages.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-bg-base font-sans text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
