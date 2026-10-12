// app/layout.js
import './globals.css';
import ExtensionCleaner from './components/ExtensionCleaner';
import AuthFetch from './components/AuthFetch';
import AccessNotice from './components/AccessNotice';
import { ThemeProvider } from './components/ui/ThemeProvider';
import { NotificationProvider } from './components/ui/NotificationProvider';
import ReduxProvider from '../components/ReduxProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { APP_NAME, APP_DESCRIPTION } from '../lib/brand.js';

// A malformed NEXT_PUBLIC_BASE_URL must never take the whole site down.
const SITE_URL = (() => { try { return new URL(String(process.env.NEXT_PUBLIC_BASE_URL || '').trim()).origin; } catch { return ''; } })();

export const metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
  openGraph: { title: APP_NAME, description: APP_DESCRIPTION, siteName: APP_NAME, type: 'website' },
  twitter: { card: 'summary', title: APP_NAME, description: APP_DESCRIPTION },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
        <script async src="https://accounts.google.com/gsi/client" />
        <script dangerouslySetInnerHTML={{
          __html: `(function() { try { const originalError = window.console && window.console.error; const originalWarn = window.console && window.console.warn; const originalLog = window.console && window.console.log; function shouldSuppress(...args) { try { if (!args || args.length === 0) return false; const str = args.join(' ').toString(); return str.includes('webextension') || str.includes('TronWeb') || str.includes('bybit') || str.includes('gethookd') || str.includes('evmAsk') || str.includes('frame_ant') || str.includes('lockdown-install'); } catch (e) { return false; } } if (window.console && originalError) { window.console.error = function(...args) { try { if (shouldSuppress(...args)) return; return originalError.apply(window.console, args); } catch (e) {} }; } if (window.console && originalWarn) { window.console.warn = function(...args) { try { if (shouldSuppress(...args)) return; return originalWarn.apply(window.console, args); } catch (e) {} }; } if (window.console && originalLog) { window.console.log = function(...args) { try { if (shouldSuppress(...args)) return; return originalLog.apply(window.console, args); } catch (e) {} }; } if (document && document.documentElement && HTMLElement && HTMLElement.prototype) { try { Object.defineProperty(document.documentElement, 'setAttribute', { value: function(name, value) { try { if (name && typeof name === 'string' && (name.startsWith('data-bybit') || name.startsWith('data-extension') || (name.includes && name.includes('channel-name')) || (name.includes && name.includes('wallet')))) { return; } return HTMLElement.prototype.setAttribute.call(this, name, value); } catch (e) { try { return HTMLElement.prototype.setAttribute.call(this, name, value); } catch (e2) {} } }, configurable: false, writable: false }); } catch (e) {} } } catch (e) { console.warn('Extension blocker script failed:', e); } })();`
        }} />
      </head>
      <body suppressHydrationWarning>
        <ErrorBoundary>
          <ReduxProvider>
            <ThemeProvider>
              <NotificationProvider>
                <ExtensionCleaner />
                <AuthFetch />
                <AccessNotice />
                {children}
              </NotificationProvider>
            </ThemeProvider>
          </ReduxProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
