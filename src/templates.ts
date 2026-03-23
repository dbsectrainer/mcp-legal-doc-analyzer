import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import yaml from "js-yaml";
import type { Template } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const BUNDLED_TEMPLATES_DIR = join(__dirname, "templates");

/**
 * Load a single YAML template file.
 */
async function loadTemplateFile(filePath: string): Promise<Template> {
  const content = await readFile(filePath, "utf-8");
  const parsed = yaml.load(content) as Template;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid template file: ${filePath}`);
  }
  if (!parsed.name || !Array.isArray(parsed.rules)) {
    throw new Error(`Template at ${filePath} is missing required fields (name, rules)`);
  }

  return parsed;
}

/**
 * Load all templates from a directory (*.yaml and *.yml files).
 */
async function loadTemplatesFromDir(dir: string): Promise<Map<string, Template>> {
  const templates = new Map<string, Template>();

  if (!existsSync(dir)) {
    return templates;
  }

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return templates;
  }

  for (const entry of entries) {
    const ext = extname(entry).toLowerCase();
    if (ext !== ".yaml" && ext !== ".yml") continue;

    const filePath = join(dir, entry);
    try {
      const template = await loadTemplateFile(filePath);
      // Key by lowercase name for case-insensitive lookup
      templates.set(template.name.toLowerCase(), template);
    } catch {
      // Skip malformed template files silently
    }
  }

  return templates;
}

/**
 * Load all available templates: bundled first, then custom (which can override bundled).
 */
export async function loadAllTemplates(
  customDir?: string,
): Promise<Map<string, Template>> {
  const bundled = await loadTemplatesFromDir(BUNDLED_TEMPLATES_DIR);

  if (!customDir) {
    return bundled;
  }

  const custom = await loadTemplatesFromDir(customDir);

  // Merge, with custom templates overriding bundled ones
  const merged = new Map(bundled);
  for (const [key, template] of custom) {
    merged.set(key, template);
  }

  return merged;
}

/**
 * Get a template by name (case-insensitive).
 */
export function getTemplate(
  templates: Map<string, Template>,
  name: string,
): Template | undefined {
  return templates.get(name.toLowerCase());
}

/**
 * List all available template names and descriptions.
 */
export function listTemplates(
  templates: Map<string, Template>,
): Array<{ name: string; description: string; version: string }> {
  return Array.from(templates.values()).map((t) => ({
    name: t.name,
    description: t.description,
    version: t.version,
  }));
}
