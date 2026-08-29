"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  NarrationResult,
  NarrationSpeakOptions,
  NarrationStatus,
  NarrationUnavailableReason,
  NarrationUnavailableResponse,
} from "@/lib/platform/narration";

export interface UseNarrationResult {
  status: NarrationStatus;
  source: NarrationResult["source"];
  muted: boolean;
  error: string | null;
  speak: (text: string, options?: NarrationSpeakOptions) => Promise<NarrationResult>;
  cancel: () => void;
  setMuted: (muted: boolean) => void;
}
function normalizeSpeechValue(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value ?? fallback));
}

/** ElevenLabs narration with an automatic, dependency-free browser fallback. */
export function useNarration(): UseNarrationResult {
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [source, setSource] = useState<NarrationResult["source"]>("none");
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mutedRef = useRef(false);

  const clearRemoteAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    clearRemoteAudio();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setStatus("idle");
    setSource("none");
  }, [clearRemoteAudio]);

  const speakInBrowser = useCallback(
    async (
      text: string,
      options: NarrationSpeakOptions,
    ): Promise<NarrationResult> => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        setStatus("unavailable");
        setSource("none");
        setError("Narration is unavailable in this browser.");
        return { source: "none", ok: false, reason: "browser_unsupported" };
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.lang ?? "en-GB";
      utterance.rate = normalizeSpeechValue(options.rate, 0.96, 0.5, 2);
      utterance.pitch = normalizeSpeechValue(options.pitch, 0.82, 0, 2);
      utterance.volume = mutedRef.current ? 0 : 1;

      return new Promise<NarrationResult>((resolve) => {
        utterance.onstart = () => {
          setSource("browser");
          setStatus("speaking");
        };
        utterance.onend = () => {
          setStatus("idle");
          resolve({ source: "browser", ok: true });
        };
        utterance.onerror = () => {
          setStatus("error");
          setError("Browser narration could not be played.");
          resolve({ source: "browser", ok: false, reason: "playback_blocked" });
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    },
    [],
  );

  const speak = useCallback(
    async (
      text: string,
      options: NarrationSpeakOptions = {},
    ): Promise<NarrationResult> => {
      const trimmedText = text.trim();
      if (!trimmedText || mutedRef.current) {
        return { source: "none", ok: false };
      }

      cancel();
      setError(null);
      if (options.preferRemote === false) {
        return speakInBrowser(trimmedText, options);
      }

      const controller = new AbortController();
      requestRef.current = controller;
      setStatus("loading");
      try {
        const response = await fetch("/api/narrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmedText }),
          signal: controller.signal,
        });

        if (response.ok && response.headers.get("content-type")?.startsWith("audio/")) {
          const blob = await response.blob();
          if (controller.signal.aborted) return { source: "none", ok: false };
          const objectUrl = URL.createObjectURL(blob);
          const audio = new Audio(objectUrl);
          audio.muted = mutedRef.current;
          objectUrlRef.current = objectUrl;
          audioRef.current = audio;
          audio.onended = () => {
            clearRemoteAudio();
            setStatus("idle");
          };
          await audio.play();
          setSource("elevenlabs");
          setStatus("speaking");
          return { source: "elevenlabs", ok: true };
        }

        let unavailableReason: NarrationUnavailableReason = "provider_error";
        try {
          const payload = (await response.json()) as NarrationUnavailableResponse;
          if (payload.status === "unavailable") unavailableReason = payload.reason;
        } catch {
          // A malformed upstream response is treated as a normal fallback case.
        }
        const fallback = await speakInBrowser(trimmedText, options);
        return fallback.ok ? fallback : { ...fallback, reason: unavailableReason };
      } catch (narrationError) {
        if (controller.signal.aborted) return { source: "none", ok: false };
        setError(
          narrationError instanceof Error
            ? narrationError.message
            : "Remote narration failed; using the browser voice.",
        );
        return speakInBrowser(trimmedText, options);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [cancel, clearRemoteAudio, speakInBrowser],
  );

  const setMuted = useCallback(
    (nextMuted: boolean) => {
      mutedRef.current = nextMuted;
      setMutedState(nextMuted);
      if (audioRef.current) audioRef.current.muted = nextMuted;
      if (nextMuted && typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
        clearRemoteAudio();
        setStatus("idle");
      }
    },
    [clearRemoteAudio],
  );

  useEffect(() => cancel, [cancel]);

  return { status, source, muted, error, speak, cancel, setMuted };
}
