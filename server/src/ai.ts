import type { Config } from "./config.js";
export class AIUnavailableError extends Error { status = 503; missing: string; constructor(missing: string) { super("AI is not configured"); this.missing = missing; } }
export async function chatJson(config: Config, input: { system: string; user: string; temperature?: number }) {
  if (config.aiProvider === "gemini") {
    if (!config.geminiApiKey) throw new AIUnavailableError("GEMINI_API_KEY");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: input.system }] }, contents: [{ role: "user", parts: [{ text: input.user }] }], generationConfig: { responseMimeType: "application/json", temperature: input.temperature ?? 0.2 } }) });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data: any = await response.json(); return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  }
  if (!config.openaiApiKey) throw new AIUnavailableError("OPENAI_API_KEY");
  const response = await fetch(`${config.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: config.openaiModel, response_format: { type: "json_object" }, temperature: input.temperature ?? 0.2, messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }] }) });
  if (!response.ok) throw new Error(`OpenAI-compatible request failed (${response.status})`);
  const data: any = await response.json(); return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}
