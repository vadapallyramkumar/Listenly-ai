export const VOICES = [
  { id: "en-US-AriaNeural", label: "English - Female" },
  { id: "en-US-GuyNeural", label: "English - Male" },
  { id: "en-GB-SoniaNeural", label: "English UK - Female" },
  { id: "en-GB-RyanNeural", label: "English UK - Male" },
] as const;

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export const MAX_CHARS = 40_000;

export function formatSpeed(speed: number): string {
  const text = Number.isInteger(speed) ? speed.toFixed(1) : String(speed);
  return `${text}x`;
}

export function spokenText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function generateSpeech(
  text: string,
  voice: string,
  speed: number,
): Promise<Blob> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!response.ok) {
    let message = "Could not generate audio. Check your connection and try again.";
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string" && payload.detail) {
        message = payload.detail;
      }
    } catch {
      // The body was not JSON; keep the fallback message.
    }
    throw new Error(message);
  }

  return response.blob();
}
