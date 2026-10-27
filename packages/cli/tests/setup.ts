import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const home = mkdtempSync(join(tmpdir(), "cli-unit-home-"));
for (const key of Object.keys(process.env))
  if (/API_KEY|TOKEN|SECRET|PASSWORD|^QUICKSTACK_/.test(key)) delete process.env[key];
Object.assign(process.env, {
  HOME: home,
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_DATA_HOME: join(home, "data"),
  NO_COLOR: "1",
  LOG_LEVEL: "none",
});
afterAll(() => rmSync(home, { recursive: true, force: true }));
