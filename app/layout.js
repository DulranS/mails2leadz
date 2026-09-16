import { Fraunces } from 'next/font/google';
import './globals.css';

// Fraunces is used for headline/display text only (the "letters and
// sign-offs" personality of a correspondence tool) — body text everywhere,
// including the whole dashboard, stays on the fast system sans stack set in
// globals.css so nothing about the working app's density or load time
// changes.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata = {
  title: 'Outbound Engine — outbound that still asks before it sends',
  description:
    'Outbound Engine finds leads, drafts every email and WhatsApp follow-up in your voice, and stops the sequence the moment someone replies — but nothing goes out until you approve it.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body>{children}</body>
    </html>
  );
}
