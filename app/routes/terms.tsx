import { createFileRoute, Link } from '@tanstack/react-router'
import { Topbar } from '~/components/Topbar'

export const Route = createFileRoute('/terms')({
  component: TermsPage,
})

export function TermsPage() {
  return (
    <div className="min-h-screen bg-[#080A12] flex flex-col">
      <Topbar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-8 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-10"
        >
          ← Back
        </Link>

        <h1 className="font-sans font-semibold text-[14px] text-white tracking-widest mb-2">
          TERMS OF SERVICE
        </h1>
        <p className="text-xs text-slate-500 mb-10">Last updated: March 2026</p>

        <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              ACCEPTANCE OF TERMS
            </h2>
            <p>
              By accessing or using Cartyx, you agree to be bound by these Terms of Service. If you
              do not agree, do not use the service. Your continued use of Cartyx constitutes
              acceptance of any updates to these terms.
            </p>
          </section>

          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              THE SERVICE
            </h2>
            <p>
              Cartyx is a campaign management tool for tabletop role-playing games. We reserve the
              right to modify, suspend, or discontinue the service — or any part of it — at any
              time, with or without notice. We are not liable to you or any third party for any
              such modification, suspension, or discontinuation.
            </p>
          </section>

          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              USER ACCOUNTS
            </h2>
            <p>
              You must authenticate via a supported OAuth provider (Google, GitHub, or Apple) to
              use Cartyx. You are responsible for all activity that occurs under your account. We
              may terminate or suspend your account at any time if you violate these terms or engage
              in conduct that we determine, in our sole discretion, to be harmful.
            </p>
          </section>

          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              USER-GENERATED CONTENT
            </h2>
            <p>
              Cartyx allows you to create and store content including campaign names, descriptions,
              and images ("User Content"). You retain ownership of your User Content. By uploading
              content to Cartyx, you grant us a limited license to store, display, and transmit
              that content as necessary to operate the service. You are solely responsible for your
              User Content and agree not to upload anything illegal, harmful, or infringing.
            </p>
          </section>

          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              NO WARRANTY
            </h2>
            <p className="uppercase font-medium text-slate-200">
              Cartyx is provided "as is" and "as available" without warranty of any kind.
            </p>
            <p className="mt-3">
              We expressly disclaim all warranties, whether express, implied, statutory, or
              otherwise, including but not limited to implied warranties of merchantability,
              fitness for a particular purpose, and non-infringement. We do not warrant that the
              service will be uninterrupted, error-free, or free of viruses or other harmful
              components. Use the service at your own risk.
            </p>
          </section>

          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              LIMITATION OF LIABILITY
            </h2>
            <p>
              To the maximum extent permitted by applicable law, Cartyx and its developer(s) shall
              not be liable for any indirect, incidental, special, consequential, or punitive
              damages — including but not limited to loss of data, lost profits, or loss of
              goodwill — arising out of or in connection with your use of (or inability to use)
              the service, even if we have been advised of the possibility of such damages.
            </p>
            <p className="mt-3">
              Our total liability for any claim arising from these terms or your use of Cartyx
              shall not exceed the amount you paid us in the twelve months preceding the claim (or
              $0 if you have not paid us anything).
            </p>
          </section>

          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              GOVERNING LAW
            </h2>
            <p>
              These terms are governed by applicable law. Any disputes shall be resolved in the
              appropriate courts of competent jurisdiction. If any provision of these terms is
              found to be unenforceable, the remaining provisions will continue in full force.
            </p>
          </section>

          <section>
            <h2 className="font-sans font-semibold text-[9px] text-blue-400 tracking-wider mb-3">
              CHANGES TO THESE TERMS
            </h2>
            <p>
              We may update these Terms of Service from time to time. We will indicate the date of
              the most recent update at the top of this page. Continued use of the service after
              changes are posted constitutes your acceptance of the revised terms.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
