import "server-only";
import { createHmac } from "node:crypto";

/** Server-side configuration. Secrets never leave the server. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return value;
}

function first(...names: string[]): string | undefined {
  for (const n of names) if (process.env[n]) return process.env[n];
  return undefined;
}

/**
 * When an app secret isn't set, derive a stable one from the Supabase
 * service-role key so the app runs with only the Supabase variables (as synced
 * by the Supabase <> Vercel integration). Set the variable explicitly to rotate
 * it independently; changing QUOTE_LINK_SECRET (or the service-role key when
 * it's derived) invalidates existing customer quote links.
 */
function secretOrDerived(name: string): string {
  const s = process.env[name];
  if (s) {
    if (s.length < 32) throw new Error(`${name} must be at least 32 characters.`);
    return s;
  }
  return createHmac("sha256", serverEnv.serviceRoleKey).update(`professional-wheelers:${name}`).digest("base64url");
}

export const serverEnv = {
  get supabaseUrl() {
    return first("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL") ?? required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return first("NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY")
      ?? required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey() {
    return first("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY") ?? required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get quoteLinkSecret() {
    return secretOrDerived("QUOTE_LINK_SECRET");
  },
  get appSecret() {
    return secretOrDerived("APP_SECRET");
  },
  get siteUrl() {
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return (process.env.NEXT_PUBLIC_SITE_URL ?? (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
  },
  get companyName() {
    return process.env.COMPANY_NAME || "Professional Wheelers";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY || null;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || null;
  },
  get emailReplyTo() {
    return process.env.EMAIL_REPLY_TO || null;
  },
  get resendWebhookSecret() {
    return process.env.RESEND_WEBHOOK_SECRET || null;
  },
  /** Bearer secret for /api/cron/* (Vercel Cron sends it automatically). */
  get cronSecret() {
    const s = process.env.CRON_SECRET;
    return s && s.length >= 32 ? s : null;
  },
  get emailConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  },
};
