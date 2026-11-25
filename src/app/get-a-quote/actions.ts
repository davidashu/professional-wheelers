"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { checkFormToken, clientIp, hashIp, issueFormToken } from "@/lib/spam";
import { fieldErrors, formDataToObject, normalizePhone, quoteRequestSchema, type FieldErrors } from "@/lib/validation";

export type QuoteRequestState =
  | { status: "idle"; formToken: string }
  | { status: "error"; formToken: string; message: string; errors: FieldErrors }
  | { status: "success"; reference: string; duplicate: boolean };

export async function submitQuoteRequest(prev: QuoteRequestState, formData: FormData): Promise<QuoteRequestState> {
  const secret = serverEnv.appSecret;
  const formToken = prev.status === "success" ? issueFormToken(secret) : prev.formToken;

  // Honeypot: real visitors never see or fill this field. Don't tell bots they were caught.
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { status: "success", reference: "Q-RECEIVED", duplicate: false };
  }

  const tokenCheck = checkFormToken(String(formData.get("form_token") ?? ""), secret);
  if (tokenCheck === "too_fast") {
    return {
      status: "error",
      formToken,
      message: "That was quick! Please check your details and press Submit again.",
      errors: {},
    };
  }
  if (tokenCheck !== "ok") {
    return {
      status: "error",
      formToken: issueFormToken(secret),
      message: "This form has expired. Please press Submit again.",
      errors: {},
    };
  }

  const parsed = quoteRequestSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      formToken,
      message: "Please fix the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const payload = {
    ...data,
    phone: normalizePhone(data.phone),
    vehicles: data.vehicles.map((v) => ({ year: v.year, make: v.make, model: v.model, operable: v.operable })),
  };
  const ipHash = hashIp(clientIp(await headers()), secret);

  const { data: result, error } = await createAdminClient().rpc("submit_quote_request", {
    p: payload,
    p_ip_hash: ipHash,
  });

  if (error) {
    if (error.message.includes("rate_limited")) {
      return {
        status: "error",
        formToken,
        message: "We've received several requests from your network in the last hour. Please call us or try again later.",
        errors: {},
      };
    }
    if (error.message.includes("invalid_pickup_date")) {
      return { status: "error", formToken, message: "Please fix the highlighted fields.", errors: { earliest_pickup_date: "Choose a date from today onward" } };
    }
    console.error("submit_quote_request failed", { code: error.code, message: error.message });
    return {
      status: "error",
      formToken,
      message: "We couldn't save your request right now. Please try again in a minute.",
      errors: {},
    };
  }

  const r = result as { reference: string; duplicate: boolean };
  return { status: "success", reference: r.reference, duplicate: r.duplicate };
}
