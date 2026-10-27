/**
 * A project name as an ASCII slug: lowercased, every run of characters outside `[a-z0-9]` turned
 * into one `-`, dashes trimmed from both ends, and `project` when nothing is left. The one slug
 * rule (roadmap, Shared helpers); 3.1c extends it in place.
 */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

/** The slug upper-cased with `-` turned to `_`, prefixed `_` when it starts with a digit. */
export function envPrefix(slugged: string): string {
  const upper = slugged.toUpperCase().replaceAll("-", "_");
  return /^[0-9]/.test(upper) ? `_${upper}` : upper;
}
