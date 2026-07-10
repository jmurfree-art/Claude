import "server-only";

import { HttpsProxyAgent } from "https-proxy-agent";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Shared free text-to-speech (Microsoft Edge neural voices, keyless).
 * Used by the local video provider and the lip-sync audio step.
 */

/** Default Edge voice per app language code, for projects whose stored
 *  voice belongs to a different vendor. */
export const DEFAULT_EDGE_VOICE_BY_LANGUAGE: Record<string, string> = {
  en: "en-US-AriaNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  it: "it-IT-ElsaNeural",
  pt: "pt-BR-FranciscaNeural",
  nl: "nl-NL-ColetteNeural",
  pl: "pl-PL-ZofiaNeural",
  hi: "hi-IN-SwaraNeural",
  ja: "ja-JP-NanamiNeural",
  ko: "ko-KR-SunHiNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ar: "ar-SA-ZariyahNeural",
  tr: "tr-TR-EmelNeural",
};

/**
 * Picks a usable Edge TTS voice: keeps `voiceId` when it already is an Edge
 * neural voice, otherwise falls back to the language default (or English).
 */
export function pickEdgeVoice(voiceId: string | null, language: string): string {
  if (voiceId && /-\w+Neural$/.test(voiceId)) return voiceId;
  return DEFAULT_EDGE_VOICE_BY_LANGUAGE[language] ?? "en-US-AriaNeural";
}

function escapeSsmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Synthesizes `text` with the given Edge voice and returns MP3 bytes. */
export async function synthesizeSpeechToBuffer(
  voiceId: string,
  text: string
): Promise<Buffer> {
  // Honor HTTPS_PROXY for the TTS WebSocket (ws ignores proxy env vars).
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const tts = new MsEdgeTTS(
    proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : undefined
  );

  try {
    await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeSsmlText(text));

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.once("error", reject);
      audioStream.once("end", () => resolve());
    });
    return Buffer.concat(chunks);
  } finally {
    tts.close();
  }
}
