import { afterEach, expect, test } from "vitest";
import { addCli, added, addProject, put, read, refused, releaseAdd } from "./helpers/add";
import { spawnGit } from "./helpers/git";
import { minimal, writeEntry } from "./helpers/registry";

afterEach(releaseAdd);

test.each([
  { configured: undefined, git: 'Ada "Count"\\Lovelace', expected: "Ada CountLovelace" },
  { configured: "Configured Author", git: "Git Author", expected: "Configured Author" },
  { configured: "", git: "Git Author", expected: "" },
  { configured: undefined, git: "Bad\tAuthor", expected: "" },
])("add uses the shared template author precedence: %j", async ({ configured, git, expected }) => {
  const project = addProject();
  const entry = writeEntry({
    root: project.registry,
    kind: "fragment",
    dir: "author",
    frontmatter: minimal("fragment", "author"),
  });
  put(entry, "files/author.txt.tmpl", "{{author}}\n");
  expect(spawnGit(["-C", project.root, "config", "user.name", git]).status).toBe(0);
  if (configured !== undefined)
    put(project.home, "config/quickstacks/config.json", JSON.stringify({ author: configured }));
  await added(await addCli(project, ["add", "author", "--json"]));
  expect(read(project.root, "author.txt")).toBe(`${expected}\n`);
});

test("a configured author with remaining control characters is InvalidConfig for add", async () => {
  const project = addProject();
  put(project.home, "config/quickstacks/config.json", JSON.stringify({ author: "Bad\tAuthor" }));
  refused(await addCli(project, ["add", "named", "--json"]), 3, "InvalidConfig");
});
