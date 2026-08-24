// Shared by the `chat` and `generate-program` Edge Functions.
// Files under _shared/ are bundled into each function at deploy time; the
// leading underscore keeps Supabase from treating this directory as a function.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Primary is a free cloaked (undisclosed-provider) model, rate-limited on a
 * shared upstream pool roughly half the time — hence the fallback.
 *
 * It is also a *reasoning* model: it emits a hidden reasoning trace before any
 * answer, and those tokens are charged against max_tokens. A measured turn ran
 * 8,188 characters of reasoning / 2,458 completion tokens. Setting maxTokens too
 * low does not truncate the answer — it consumes the whole budget on reasoning
 * and returns EMPTY content. That bug broke `chat` on its first deploy. Give
 * every caller generous headroom and check `finish_reason` before lowering it.
 */
export const MODEL = "stealth/ox-alpha";
export const FALLBACK_MODEL = "google/gemini-2.5-flash-lite";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  ok: boolean;
  reply?: string;
  /** HTTP status to hand back to the client if this was the final attempt. */
  status: number;
  /** Shown to the user. Provider status text, never internal detail. */
  userMessage: string;
  /** Server-side only. */
  logDetail: string;
}

/**
 * Verifies the caller's JWT and returns a Supabase client carrying it, so every
 * query the function makes is still subject to that user's RLS. Deliberately
 * never builds a service-role client — neither caller needs one.
 */
export async function authenticate(
  req: Request,
): Promise<{ user: { id: string }; userClient: SupabaseClient } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  return { user, userClient };
}

async function attempt(
  apiKey: string,
  body: unknown,
  signal: AbortSignal,
): Promise<CompletionResult> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://apextrack.app",
        "X-Title": "ApexTrack",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 502,
      userMessage: aborted
        ? "The AI took too long to reply. Try again."
        : "Could not reach the AI service.",
      logDetail: String(err),
    };
  }

  const data = await response.json().catch(() => null);

  // OpenRouter can deliver a provider error as HTTP 200 with an `error` body,
  // so the status alone is not a reliable success signal.
  if (!response.ok || data?.error) {
    const upstream = data?.error;
    // metadata.raw carries the provider's own wording ("...is temporarily
    // rate-limited upstream"), far more useful than the generic
    // "Provider returned error" sitting in .message.
    const detail = upstream?.metadata?.raw ?? upstream?.message;
    return {
      ok: false,
      status: 502,
      userMessage:
        typeof detail === "string" && detail.trim()
          ? detail.trim()
          : "The AI service returned an error.",
      logDetail: `HTTP ${response.status} ${JSON.stringify(data)?.slice(0, 400)}`,
    };
  }

  const choice = data?.choices?.[0];
  const reply = choice?.message?.content;
  if (typeof reply !== "string" || reply.trim().length === 0) {
    const truncated = choice?.finish_reason === "length";
    const reasoningLen = (choice?.message?.reasoning ?? "").length;
    return {
      ok: false,
      status: 502,
      userMessage: truncated
        ? "The AI ran out of room before it finished. Try again."
        : "The AI service returned an empty reply.",
      logDetail: `empty content: finish_reason=${choice?.finish_reason} reasoning_chars=${reasoningLen} model=${data?.model} body=${JSON.stringify(data)?.slice(0, 300)}`,
    };
  }

  return {
    ok: true,
    status: 200,
    reply: reply.trim(),
    userMessage: "",
    logDetail: "",
  };
}

/**
 * One completion, with OpenRouter's own models[] failover plus an explicit
 * one-shot retry on the fallback model. The models[] array is verified to fail
 * over on provider 429s; the explicit retry means availability doesn't depend on
 * that behaviour alone.
 */
export async function complete(opts: {
  apiKey: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const shared = {
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: opts.messages,
    };

    let result = await attempt(
      opts.apiKey,
      { model: MODEL, models: [MODEL, FALLBACK_MODEL], ...shared },
      controller.signal,
    );

    // Skip the retry on a timeout: the shared signal is already aborted and the
    // clock has run out anyway.
    if (!result.ok && result.status !== 504) {
      console.error("Primary model failed:", result.logDetail);
      result = await attempt(
        opts.apiKey,
        { model: FALLBACK_MODEL, ...shared },
        controller.signal,
      );
    }

    return result;
  } finally {
    clearTimeout(timer);
  }
}
