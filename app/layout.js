import { NotificationProvider } from '../components/ui/NotificationProvider';

export const metadata = {
  title: 'Outbound Engine',
  description: 'Automated outbound sales pipeline',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </body>
    </html>
  );
}
