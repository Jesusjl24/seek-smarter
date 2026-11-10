import { aiKeyName, type Config } from "./config.js";
import { peekErrorBody, providerErrorMessage } from "./lib/providerErrors.js";
export class AIUnavailableError extends Error { status = 503; missing: string; constructor(missing: string) { super("AI is not configured"); this.missing = missing; } }

export async function chatJson(config: Config, input: { system: string; user: string; temperature?: number }) {
  if (config.aiProvider === "gemini") {
    if (!config.geminiApiKey) throw new AIUnavailableError("GEMINI_API_KEY");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: input.system }] }, contents: [{ role: "user", parts: [{ text: input.user }] }], generationConfig: { responseMimeType: "application/json", temperature: input.temperature ?? 0.2 } }) });
    if (!response.ok) {
      const body = await peekErrorBody(response);
      throw new Error(providerErrorMessage("Gemini", response.status, body));
    }
    const data: any = await response.json(); return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  }
  const isXai = config.aiProvider !== "openai";
  const apiKey = isXai ? config.xaiApiKey : config.openaiApiKey;
  const missing = aiKeyName(config);
  if (!apiKey) throw new AIUnavailableError(missing);
  const baseUrl = (isXai ? config.xaiBaseUrl : config.openaiBaseUrl).replace(/\/$/, "");
  const model = isXai ? config.xaiModel : config.openaiModel;
  const provider = isXai ? "xAI" : "OpenAI-compatible";
  const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model, response_format: { type: "json_object" }, temperature: input.temperature ?? 0.2, messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }] }) });
  if (!response.ok) {
    const body = await peekErrorBody(response);
    throw new Error(providerErrorMessage(provider, response.status, body));
  }
  const data: any = await response.json();
  const raw = String(data.choices?.[0]?.message?.content || "").replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw || "{}");
}
