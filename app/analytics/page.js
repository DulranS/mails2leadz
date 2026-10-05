import { redirect } from 'next/navigation';
// Analytics now lives on the Business Value page (real deals, not assumed rates).
export default function AnalyticsRedirect() {
  redirect('/business');
}
