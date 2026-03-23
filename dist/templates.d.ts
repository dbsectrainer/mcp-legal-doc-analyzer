import type { Template } from "./types.js";
/**
 * Load all available templates: bundled first, then custom (which can override bundled).
 */
export declare function loadAllTemplates(
  customDir?: string,
): Promise<Map<string, Template>>;
/**
 * Get a template by name (case-insensitive).
 */
export declare function getTemplate(
  templates: Map<string, Template>,
  name: string,
): Template | undefined;
/**
 * List all available template names and descriptions.
 */
export declare function listTemplates(templates: Map<string, Template>): Array<{
  name: string;
  description: string;
  version: string;
}>;
