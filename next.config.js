/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Baseline hardening headers, applied to every response. Deliberately
  // NOT including a Content-Security-Policy here: writing one safely means
  // auditing every inline script/style and third-party origin the app
  // actually loads (fonts, the print/invoice views, etc.) first — a wrong
  // CSP silently breaks pages instead of failing loudly, which is worse
  // than not having one yet. These four are low-risk, well-understood, and
  // don't depend on knowing the app's full asset list.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops the app being iframed elsewhere (clickjacking — tricking
          // a logged-in owner/manager into clicking a real "Delete" button
          // rendered invisibly inside an attacker's page).
          { key: "X-Frame-Options", value: "DENY" },
          // Stops the browser guessing a file's type from its content
          // instead of trusting the declared Content-Type — closes a class
          // of "upload a .txt that's actually HTML/JS" tricks.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak the full URL (which can contain business names,
          // invite tokens in query strings, etc.) to third-party sites
          // this app links out to.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Opts out of the browser's default "share device sensors with
          // embedded content" behavior — this app doesn't use any of them,
          // so there's nothing to leave open.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
