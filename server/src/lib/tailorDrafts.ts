import { chatJson } from "../ai.js";
import type { Config } from "../config.js";
export function tailorResume(config: Config, job: unknown, profile: unknown, score: number) { return chatJson(config, { system: "Create a truthful tailored resume draft as JSON. Never invent experience.", user: JSON.stringify({ job, profile, score }) }); }
export function coverLetter(config: Config, job: unknown, profile: unknown, score: number, highlights?: string[]) { return chatJson(config, { system: "Create a concise truthful cover letter as JSON. Never invent facts.", user: JSON.stringify({ job, profile, score, highlights }) }); }
