import { Schema } from "effect";

const Prose = Schema.String.check(Schema.isPattern(/\S/u));
const Items = Schema.Array(Prose).check(Schema.isMinLength(1), Schema.isMaxLength(3));
const ReviewDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter((value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return (
      (Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value) ||
      "reviewedAt must be a calendar date"
    );
  }),
);
const Homepage = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      (URL.canParse(value) && new URL(value).protocol === "https:") ||
      "homepage must be an HTTPS URL",
  ),
);
const Source = Schema.Struct({
  by: Schema.Literals(["author", "drafted"]),
  model: Schema.optionalKey(Schema.String),
  promptVersion: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  reviewedAt: Schema.NullOr(ReviewDate),
});

export const DependencyCard = Schema.Struct({
  whatItIs: Prose,
  goodAt: Schema.optionalKey(Items),
  notGoodAt: Schema.optionalKey(Items),
  example: Schema.optionalKey(Prose),
  homepage: Schema.optionalKey(Homepage),
  source: Source,
});
export type DependencyCard = typeof DependencyCard.Type;

export const DependencyCardFile = Schema.Struct({
  formatVersion: Schema.Literal(1),
  cards: Schema.Record(Schema.String, DependencyCard),
});
export type DependencyCardFile = typeof DependencyCardFile.Type;

export const DependencyCards = Schema.Struct({
  formatVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  cards: Schema.Struct({
    npm: Schema.Record(Schema.String, DependencyCard),
    pypi: Schema.Record(Schema.String, DependencyCard),
    go: Schema.Record(Schema.String, DependencyCard),
    crates: Schema.Record(Schema.String, DependencyCard),
  }),
});
export type DependencyCards = typeof DependencyCards.Type;
