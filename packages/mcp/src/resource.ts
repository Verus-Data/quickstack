import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Layer } from "effect";
import { Effect } from "effect";
import { McpServer } from "effect/ai";
import { cliPath } from "./config";

export const GUIDE_RESOURCE_URI = "quickstacks://guide";

function captureGuide(): string {
  try {
    return execFileSync("bun", [cliPath, "guide"], {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
  } catch (error) {
    return `Failed to capture guide: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const GUIDE_TEXT: string = captureGuide();

export interface SkillResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

function parseFrontmatter(
  text: string,
): { name: string; description: string; body: string } | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  const frontmatter = match[1];
  const body = match[2];
  let name = "";
  let description = "";
  for (const line of frontmatter.split("\n")) {
    const nameMatch = /^name:\s*(.+)$/.exec(line);
    if (nameMatch !== null && nameMatch[1] !== undefined) {
      name = nameMatch[1].trim();
      continue;
    }
    const descMatch = /^description:\s*(.+)$/.exec(line);
    if (descMatch !== null && descMatch[1] !== undefined) {
      description = descMatch[1].trim();
    }
  }
  if (name === "") return null;
  return { name, description, body };
}

function loadSkills(): SkillResource[] {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const skillsDir = resolve(here, "../skills");
  let files: string[];
  try {
    files = readdirSync(skillsDir);
  } catch {
    return [];
  }
  const skills: SkillResource[] = [];
  for (const file of files) {
    if (extname(file) !== ".md") continue;
    const fullPath = resolve(skillsDir, file);
    try {
      const text = readFileSync(fullPath, "utf8");
      const parsed = parseFrontmatter(text);
      if (parsed === null) continue;
      skills.push({
        uri: `skill://${parsed.name}`,
        name: parsed.name,
        description: parsed.description,
        body: parsed.body,
      });
    } catch {}
  }
  return skills;
}

export const SKILL_RESOURCES: SkillResource[] = loadSkills();

export const guideResourceLayer = McpServer.resource({
  uri: GUIDE_RESOURCE_URI,
  name: "guide",
  description: "The quickstacks agent guide: the list, new, verify loop and the rules.",
  mimeType: "text/markdown",
  content: Effect.succeed(GUIDE_TEXT),
});

export function buildResourceLayers(): Layer.Layer<never>[] {
  const layers: Layer.Layer<never>[] = [guideResourceLayer];
  for (const skill of SKILL_RESOURCES) {
    layers.push(
      McpServer.resource({
        uri: skill.uri,
        name: skill.name,
        description: skill.description,
        mimeType: "text/markdown",
        content: Effect.succeed(skill.body),
      }),
    );
  }
  return layers;
}
