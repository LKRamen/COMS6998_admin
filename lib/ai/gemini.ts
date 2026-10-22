import "server-only";
import { validateCaptions } from "../caption-input";
import { GenerationError } from "../generation-error";
export function generationSettings(model: string) {
 return { temperature: 0.9, maxOutputTokens: 4096, responseMimeType: "application/json", ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}) };
}
export function geminiConfig() {
 const key = process.env.GEMINI_API_KEY?.trim(); const model = process.env.GEMINI_MODEL?.trim();
 if (!key || !model || !/^[a-zA-Z0-9._-]+$/.test(model)) throw new GenerationError("Caption generation is not configured yet. Your saved drafts are safe.");
 return { key, model };
}
export async function generateCaptions(input: { image: Buffer; systemPrompt: string; userPrompt: string }): Promise<string[]> {
 const { key, model } = geminiConfig();
 const signal = AbortSignal.timeout(45_000);
 const body = JSON.stringify({ systemInstruction: { parts: [{ text: input.systemPrompt }] }, contents: [{ role: "user", parts: [{ text: input.userPrompt }, { inlineData: { mimeType: "image/jpeg", data: input.image.toString("base64") } }] }],
  generationConfig: { ...generationSettings(model), responseSchema: { type: "OBJECT", properties: { captions: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 } }, required: ["captions"] } },
 });
 let response!: Response;
 try {
  for (let attempt = 0; attempt < 3; attempt++) {
   signal.throwIfAborted();
   response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal, cache: "no-store", body });
   if (![500, 502, 503, 504].includes(response.status) || attempt === 2) break;
   await response.body?.cancel();
   await backoff((attempt + 1) * 1000, signal);
  }
 } catch { throw new GenerationError("The AI request timed out or could not connect. Your draft is saved; try again."); }
 if (response.status === 429) throw new GenerationError("The AI provider is temporarily at its limit. Please try again later.");
 if ([500, 502, 503, 504].includes(response.status)) throw new GenerationError("The AI provider is temporarily unavailable. Your draft is saved; try again shortly.");
 if (!response.ok) throw new GenerationError("The AI provider could not complete this request. Please try again later.");
 let data;
 try { data = await response.json(); }
 catch { throw new GenerationError("The AI did not return a valid response. Your draft is saved; try again."); }
 const candidate = data.candidates?.[0];
 if (data.promptFeedback?.blockReason || !candidate || candidate.finishReason !== "STOP") throw new GenerationError("The AI could not generate captions for this request. Try another photo or context.");
 try { return validateCaptions(JSON.parse(candidate.content.parts.map((part: { text?: string }) => part.text ?? "").join(""))); }
 catch { throw new GenerationError("The AI did not return three valid, distinct captions. Please try again."); }
}

function backoff(milliseconds: number, signal: AbortSignal): Promise<void> {
 return new Promise((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
  function abort() { clearTimeout(timer); reject(signal.reason); }
  signal.addEventListener("abort", abort, { once: true });
 });
}
