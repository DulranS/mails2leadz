// app/privacy/page.js - public. Describes what the app actually does with data (keep it in step with the code).
import LegalPage, { Section, Bullets, Contact } from '../components/LegalPage';
import { APP_NAME } from '../../lib/brand.js';

export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p className="mt-6 text-sm leading-relaxed text-gray-300">
        {APP_NAME} helps small businesses write to prospects, follow up and track deals. This page explains what data the service
        handles, why, who else touches it, and how you stay in control. Questions: <Contact />.
      </p>

      <Section title="1. Who is who">
        <p>
          You, the customer, decide who you contact and what you write. For the leads, customers and messages you add, you are the
          one responsible for having a lawful reason to contact them, and we process that data on your behalf to run the service.
          For your own account details (sign-in, settings, usage), we decide how the data is used.
        </p>
      </Section>

      <Section title="2. What we handle">
        <Bullets items={[
          'Account: your name, email address and profile picture from Google sign-in.',
          'What you add: leads and contact details (names, business names, emails, phone numbers, websites), notes, deals and their values, customers, invoice records, templates, and your business settings (what you sell, currency, payment terms, your postal address).',
          'Email activity: a copy of each email you send through the app (to show your history and run follow-ups), which leads replied, and which addresses bounced or opted out.',
          'Counters: how many emails you sent today and how much AI you used (counts and estimated cost only).',
        ]} />
        <p>We do not use advertising cookies or analytics trackers. Your browser stores a sign-in session and your display preferences (such as dark mode).</p>
      </Section>

      <Section title="3. Gmail access">
        <p>When you send email or check replies, Google asks you to let the app use your Gmail. We request two permissions:</p>
        <Bullets items={[
          'Send email: to send the messages you approve, from your own address.',
          'Read email: to find replies and “address not found” notices for conversations with leads you emailed, so follow-ups stop when someone replies and bad addresses are not contacted again. Reply detection looks at message headers (sender, recipient, subject, date). Message text is fetched only when you open a conversation inside the app.',
        ]} />
        <p>
          The access token Google gives your browser is short-lived. It is sent with each request so the server can act for you; we do not
          store it. We do not read your other mail, use it for advertising, sell it, or let people read it except where you ask for support,
          it is needed for security or abuse investigation, or the law requires it.
        </p>
        <p>
          {APP_NAME}&apos;s use and transfer of information received from Google APIs will adhere to the{' '}
          <a className="text-blue-400 underline" href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">Google API Services User Data Policy</a>,
          including the Limited Use requirements. You can withdraw access at any time in your Google Account&apos;s security settings.
        </p>
      </Section>

      <Section title="4. AI features">
        <p>
          AI drafts first emails, follow-ups, check-ins, reply analysis and payment reminders, and explains your numbers. To do that, the
          text needed for the request is sent to an AI provider: for example your description of what you sell, the email you sent, a
          lead&apos;s reply (only when you press “Analyze reply”), or the deal stage. The default provider is DeepSeek; OpenAI or Anthropic may
          be used as a backup if the operator has configured them. The pipeline coach receives totals only, never names or email addresses.
        </p>
        <p>
          AI output is always a draft: nothing is sent or changed until you approve it. The provider handles the text under its own terms, so
          do not put into the app information you would not want processed that way. Ask us which provider is currently in use.
        </p>
      </Section>

      <Section title="5. Who else handles data">
        <Bullets items={[
          'Google Firebase (sign-in and database) and our web host: where the app and your data live.',
          'The AI provider described above, only for the AI features you use.',
          'Twilio, only if you use SMS or phone calls from the app.',
          'OpenStreetMap public servers, only if you run the optional lead finder (it sends search terms and place names, not your data).',
        ]} />
        <p>We do not sell your data and do not share it with anyone else for their own marketing.</p>
      </Section>

      <Section title="6. If you received an email sent through this service">
        <p>
          Every email carries an opt-out link. Pressing it adds your address to that sender&apos;s do-not-contact list and the sender cannot
          reopen it from the app. We keep that address on the list so the opt-out keeps working. To ask about data held on you, write to the
          business that emailed you, or to <Contact />.
        </p>
      </Section>

      <Section title="7. Keeping and deleting data">
        <p>
          Your data stays until you delete it. In Account you can download everything as a file and delete your data and account yourself.
          Deletion removes your leads, deals, emails, customers, invoices and settings. Usage counters (counts and cost only, no personal
          content) are kept so the AI spending limits cannot be reset by deleting an account. Copies may remain in provider backups for a short time.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          Traffic uses HTTPS. Every request must come from a signed-in user and can only reach that user&apos;s own data, enforced on the
          server and by database rules. No online service can promise perfect security; if we learn of a breach that affects you we will tell you.
        </p>
      </Section>

      <Section title="9. Your choices and rights">
        <p>
          You can access, export, correct and delete your data in the app. For anything else (including rights you have under the law where you
          live), contact <Contact />. The service is for business use and not directed at children.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>If we change this policy in a way that matters, we will update the date above and, for significant changes, tell signed-in customers.</p>
      </Section>
    </LegalPage>
  );
}
