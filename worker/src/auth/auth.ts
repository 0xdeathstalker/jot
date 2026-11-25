import { betterAuth } from "better-auth"

import { isEmailAllowed } from "./allowlist.ts"
import { canJoin, JOIN_COOKIE, recordJoin } from "./invites.ts"

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
          // Returning false aborts the sign-up: only ALLOWED_EMAILS, or a live join link (its token
          // is in a cookie the login screen set). Existing users are re-checked on each socket
          // connection (worker/src/auth/gate.ts) so removing an email takes effect.
          before: async (user, ctx) => {
            if (isEmailAllowed(user.email, env.ALLOWED_EMAILS)) return true
            const token = ctx?.getCookie(JOIN_COOKIE)
            return token ? canJoin(env, token) : false
          },
          // Record who invited them (and use up one of the inviter's places).
          after: async (user, ctx) => {
            if (isEmailAllowed(user.email, env.ALLOWED_EMAILS)) return
            const token = ctx?.getCookie(JOIN_COOKIE)
            if (token) await recordJoin(env, user.id, token)
          },
        },
      },
    },
  })
}
