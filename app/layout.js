export const metadata = {
  title: 'Outbound Engine',
  description: 'Automated outbound sales pipeline',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
