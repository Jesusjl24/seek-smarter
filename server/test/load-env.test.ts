// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../src/loadEnv.js";

describe("loadEnv", () => {
  let directory: string | undefined;
  afterEach(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
  it("loads .env without overriding values already in the process environment", () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "seek-smarter-env-"));
    fs.writeFileSync(path.join(directory, ".env"), "# comment\nexport FOO=from-file\nBAR='from-file'\n");
    const env: NodeJS.ProcessEnv = { FOO: "from-process" };
    loadEnv(directory, env);
    expect(env).toMatchObject({ FOO: "from-process", BAR: "from-file" });
  });
});

import { aiKeyName, hasAiKey, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults to xAI grok-4.3 and reports XAI_API_KEY when unset", () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.aiProvider).toBe("xai");
    expect(config.xaiModel).toBe("grok-4.3");
    expect(config.xaiBaseUrl).toBe("https://api.x.ai/v1");
    expect(hasAiKey(config)).toBe(false);
    expect(aiKeyName(config)).toBe("XAI_API_KEY");
  });
  it("keeps OpenAI and Gemini as explicit alternatives", () => {
    expect(loadConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk" } as NodeJS.ProcessEnv)).toMatchObject({ aiProvider: "openai" });
    expect(hasAiKey(loadConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk" } as NodeJS.ProcessEnv))).toBe(true);
    expect(aiKeyName(loadConfig({ AI_PROVIDER: "gemini" } as NodeJS.ProcessEnv))).toBe("GEMINI_API_KEY");
  });
});
