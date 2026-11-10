import { betterAuth } from "better-auth"

import { isEmailAllowed } from "./allowlist.ts"

// Built per request: bindings and secrets only exist on `env`. `origin` is the request's own
// origin, so localhost, workers.dev and the custom domain all work with no code change.
// Passing the D1 binding as `database` makes Better Auth pick its built-in D1 dialect.
export function createAuth(env: Env, origin: string) {
  return betterAuth({
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    database: env.DB,
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    databaseHooks: {
      user: {
        create: {
          // Returning false aborts the sign-up. Existing users are re-checked on each socket
          // connection (docs/plans/phase-4-auth.md, D1) so removing an email takes effect.
          before: async (user) => isEmailAllowed(user.email, env.ALLOWED_EMAILS),
        },
      },
    },
  })
}
