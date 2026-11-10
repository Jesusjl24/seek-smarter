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
