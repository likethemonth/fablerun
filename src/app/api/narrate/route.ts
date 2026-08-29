import type {
  NarrationInvalidResponse,
  NarrationUnavailableReason,
  NarrationUnavailableResponse,
} from "@/lib/platform/narration";

export const runtime = "nodejs";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const MAX_TEXT_LENGTH = 800;
const MAX_REQUEST_BYTES = 4_096;
const PROVIDER_TIMEOUT_MS = 8_000;
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{5,64}$/;

interface NarrationRequest {
  text: string;
  voiceId?: string;
}

function jsonUnavailable(
  reason: NarrationUnavailableReason,
  message: string,
  status = 503,
): Response {
  const body: NarrationUnavailableResponse = {
    ok: false,
    status: "unavailable",
    reason,
    message,
  };
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function jsonInvalid(message: string): Response {
  const body: NarrationInvalidResponse = {
    ok: false,
    status: "invalid_request",
    message,
  };
  return Response.json(body, {
    status: 400,
    headers: { "cache-control": "no-store" },
  });
}

function parseRequest(value: unknown): NarrationRequest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.text !== "string") return null;
  if (
    candidate.voiceId !== undefined &&
    typeof candidate.voiceId !== "string"
  ) {
    return null;
  }
  return {
    text: candidate.text.trim(),
    voiceId: candidate.voiceId,
  };
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonInvalid("Narration request is too large.");
  }

  let payload: NarrationRequest | null = null;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_BYTES) {
      return jsonInvalid("Narration request is too large.");
    }
    payload = parseRequest(JSON.parse(rawBody) as unknown);
  } catch {
    return jsonInvalid("Request body must be valid JSON.");
  }

  if (!payload) return jsonInvalid("A text string is required.");
  if (!payload.text) return jsonInvalid("Narration text cannot be empty.");
  if (payload.text.length > MAX_TEXT_LENGTH) {
    return jsonInvalid(`Narration text cannot exceed ${MAX_TEXT_LENGTH} characters.`);
  }

  const voiceId = payload.voiceId ?? DEFAULT_VOICE_ID;
  if (!VOICE_ID_PATTERN.test(voiceId)) {
    return jsonInvalid("The voice identifier is invalid.");
  }

  // This unprefixed variable is read only in the Node route and never returned.
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return jsonUnavailable(
      "not_configured",
      "Remote narration is not configured; use browser narration.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const providerResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          accept: "audio/mpeg",
          "content-type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: payload.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.48,
            similarity_boost: 0.72,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!providerResponse.ok) {
      return jsonUnavailable(
        "provider_error",
        "Remote narration is temporarily unavailable; use browser narration.",
      );
    }

    const audio = await providerResponse.arrayBuffer();
    if (audio.byteLength === 0) {
      return jsonUnavailable(
        "provider_error",
        "Remote narration returned no audio; use browser narration.",
      );
    }

    return new Response(audio, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-length": String(audio.byteLength),
        "content-type": "audio/mpeg",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (providerError) {
    const timedOut =
      providerError instanceof Error && providerError.name === "AbortError";
    return jsonUnavailable(
      timedOut ? "provider_timeout" : "provider_error",
      timedOut
        ? "Remote narration timed out; use browser narration."
        : "Remote narration is temporarily unavailable; use browser narration.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
