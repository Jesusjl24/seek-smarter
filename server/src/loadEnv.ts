import fs from "node:fs";
import path from "node:path";

export function loadEnv(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env) {
  const filename = path.join(cwd, ".env");
  if (!fs.existsSync(filename)) return;
  for (const originalLine of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = line.replace(/^export\s+/, ""), separator = assignment.indexOf("=");
    if (separator < 1) continue;
    const key = assignment.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || env[key] !== undefined) continue;
    let value = assignment.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0]; value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else value = value.replace(/\s+#.*$/, "").trimEnd();
    env[key] = value;
  }
}
