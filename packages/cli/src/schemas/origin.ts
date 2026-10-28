import { Schema } from "effect";

/** Where an entry was found; 3.2a adds "source". */
export const Origin = Schema.Literals(["project", "user", "index", "bundled"]);
export type Origin = typeof Origin.Type;
