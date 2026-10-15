import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Panda — the bot for Echoed servers',
  description:
    'AI moderation on your own key, auto-mod, music, levels, welcomes, reaction roles, giveaways and more for Echoed servers — set up from one dashboard. Free, with no premium tier.',
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
