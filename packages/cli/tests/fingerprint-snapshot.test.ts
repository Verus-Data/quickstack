import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, expect, test } from "vitest";
import { composeFilesWithNeutral, NEUTRAL_VARS } from "../src/core/compose/files";
import { fingerprint, fingerprintFromFiles } from "../src/core/fingerprint";
import { BINARY, composition, fileFixture, workspace } from "./fixtures/composed-files";

const space = workspace();
afterEach(() => space.release());

test("a source edit during project rendering cannot change the fingerprint of the retained files", async () => {
  const fixture = fileFixture(space.dir());
  const c = await composition(fixture);
  const before = await Effect.runPromise(fingerprint(c).pipe(Effect.provide(NodeServices.layer)));
  const { files, neutralFiles } = await Effect.runPromise(
    composeFilesWithNeutral(c, {
      ...NEUTRAL_VARS,
      // Edit real sources after reading the project template, before neutral rendering.
      get project_name() {
        fixture.put(fixture.stack, "files/payload.bin", "changed during rendering");
        fixture.put(fixture.stack, "files/README.md.tmpl", "changed {{ project_name }}\n");
        return "My Project";
      },
    }).pipe(Effect.provide(NodeServices.layer)),
  );
  expect(files.find((file) => file.path === "payload.bin")?.bytes).toEqual(BINARY);
  expect(
    new TextDecoder().decode(files.find((file) => file.path === "README.md")?.bytes),
  ).toContain("name=My Project\n");
  expect(fingerprintFromFiles(c, neutralFiles)).toBe(before);
  expect(await Effect.runPromise(fingerprint(c).pipe(Effect.provide(NodeServices.layer)))).not.toBe(
    before,
  );
});
