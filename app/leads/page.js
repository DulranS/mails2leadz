import { redirect } from 'next/navigation';
// Lead management lives on the main dashboard (and deals in /crm).
export default function LeadsRedirect() {
  redirect('/dashboard');
}
