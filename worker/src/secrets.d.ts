// Secrets are not in wrangler.jsonc, so `wrangler types` does not know them.
// Local: .dev.vars. Production: `wrangler secret put <NAME>` (docs/plans/phase-4-auth.md).
// Merged into both `Env` and `Cloudflare.Env`, the two shapes wrangler generates.
interface JotSecrets {
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  // Comma-separated emails allowed to create an account. Empty or missing = nobody.
  ALLOWED_EMAILS?: string
}

interface Env extends JotSecrets {}
declare namespace Cloudflare {
  interface Env extends JotSecrets {}
}
