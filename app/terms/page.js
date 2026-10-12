// app/terms/page.js - public. Plain-language terms that match how the product works.
import LegalPage, { Section, Bullets, Contact } from '../components/LegalPage';
import { APP_NAME } from '../../lib/brand.js';

export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p className="mt-6 text-sm leading-relaxed text-gray-300">
        By signing in to or using {APP_NAME} you agree to these terms. If you use it for a company, you confirm you may accept them for that
        company. Questions: <Contact />.
      </p>

      <Section title="1. What the service is">
        <p>
          {APP_NAME} is a tool for managing outreach, follow-ups, deals, customers and invoice records, with AI that writes drafts. It is not an
          autopilot: you review and send. It is not an accounting, tax, legal or payments product; invoices here are records only and no payments
          are taken.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          Sign in with your own Google account and keep it secure. Access may be by invitation. You are responsible for what happens under your
          account and for the accuracy of what you enter.
        </p>
      </Section>

      <Section title="3. Your messages and your leads">
        <p>You are the sender of every message you send through the service. You agree to:</p>
        <Bullets items={[
          'Contact only people you may lawfully contact in your country and theirs, and follow the email, SMS and call-marketing rules that apply to you.',
          'Keep the opt-out link and your postal address in your emails, and never contact someone who has opted out, asked to stop, or bounced.',
          'Not send spam, deceptive, harassing, unlawful or harmful content, and not impersonate anyone.',
          'Not use the service to collect or send data you have no right to use, or to try to break, overload or bypass its limits and security.',
        ]} />
        <p>We may limit or suspend an account that risks the service, other customers or recipients (for example, high complaint or bounce rates).</p>
      </Section>

      <Section title="4. AI and estimates">
        <p>
          AI drafts and analysis can be wrong or badly worded: read everything before you send. Forecasts, win rates, ROI and similar figures are
          calculated from the data you enter and are estimates, not promises or advice. Daily and monthly limits apply to sending and AI use.
        </p>
      </Section>

      <Section title="5. Your data">
        <p>
          Your data stays yours. You give us the right to store and process it only to run the service for you, as described in the{' '}
          <a className="text-blue-400 underline" href="/privacy">Privacy Policy</a>. You can export or delete it in Account at any time.
        </p>
      </Section>

      <Section title="6. Availability and changes">
        <p>
          We work to keep the service running but do not promise it will be uninterrupted or error free. It depends on providers such as Google,
          the AI provider and the web host. We may change or retire features; we will try to give notice of changes that remove something you rely on.
        </p>
      </Section>

      <Section title="7. Fees">
        <p>If the service is paid for your account, the price and billing terms are agreed with you before you are charged. Nothing is charged through this app automatically.</p>
      </Section>

      <Section title="8. Ending">
        <p>You can stop using the service and delete your account at any time. We may end access for breach of these terms or if the law requires it.</p>
      </Section>

      <Section title="9. Liability">
        <p>
          The service is provided “as is”. To the extent the law allows, we are not liable for lost profits, lost business, deals not won, or
          indirect damages, and our total liability for any claim is limited to what you paid us for the service in the three months before it
          arose. Nothing here limits rights you have by law that cannot be limited.
        </p>
      </Section>

      <Section title="10. Changes to these terms">
        <p>We may update these terms. If a change matters, we will update the date above and tell signed-in customers. Continuing to use the service after that means you accept the update.</p>
      </Section>
    </LegalPage>
  );
}
