import "server-only";

/** Server-side configuration. Secrets never leave the server. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return value;
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get quoteLinkSecret() {
    const s = required("QUOTE_LINK_SECRET");
    if (s.length < 32) throw new Error("QUOTE_LINK_SECRET must be at least 32 characters.");
    return s;
  },
  get appSecret() {
    const s = required("APP_SECRET");
    if (s.length < 32) throw new Error("APP_SECRET must be at least 32 characters.");
    return s;
  },
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get companyName() {
    return process.env.COMPANY_NAME || "Auto Transport";
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
  get emailConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  },
};
