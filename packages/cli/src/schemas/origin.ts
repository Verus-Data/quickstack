import { Schema } from "effect";

/** Where an entry was found; 3.2a adds "source" and 4.0d "index". */
export const Origin = Schema.Literals(["project", "user", "bundled"]);
export type Origin = typeof Origin.Type;
