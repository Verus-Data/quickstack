import { Effect, Schema, SchemaAST, SchemaGetter, SchemaParser } from "effect";

type Row = Schema.Struct<Schema.Struct.Fields> | Schema.Union<ReadonlyArray<Schema.Constraint>>;

interface Field {
  readonly name: string;
  optional: boolean;
  nullable: boolean;
  children?: Map<string, Field>;
}

interface Column {
  readonly name: string;
  readonly keys: ReadonlyArray<string>;
}

function objectMembers(
  ast: SchemaAST.AST,
  nullable = false,
): ReadonlyArray<SchemaAST.Objects> | undefined {
  if (SchemaAST.isObjects(ast) && ast.indexSignatures.length === 0) return [ast];
  if (!SchemaAST.isUnion(ast)) return undefined;
  const members = ast.types.filter(SchemaAST.isObjects);
  return members.length > 0 &&
    ast.types.every((type) =>
      SchemaAST.isObjects(type)
        ? type.indexSignatures.length === 0
        : nullable && SchemaAST.isNull(type),
    )
    ? members
    : undefined;
}

function acceptsNull(ast: SchemaAST.AST): boolean {
  return SchemaAST.isNull(ast) || (SchemaAST.isUnion(ast) && ast.types.some(acceptsNull));
}

function missingFromMember(name: string, member: SchemaAST.Objects): boolean {
  return !member.propertySignatures.some(
    (candidate) => candidate.name === name && !SchemaAST.isNever(candidate.type),
  );
}

function fieldTypes(members: ReadonlyArray<SchemaAST.Objects>): Map<string, Array<SchemaAST.AST>> {
  const types = new Map<string, Array<SchemaAST.AST>>();
  for (const member of members) {
    for (const property of member.propertySignatures) {
      if (typeof property.name !== "string") {
        throw new Error("Columnar requires string field names");
      }
      if (SchemaAST.isNever(property.type)) continue;
      const current = types.get(property.name) ?? [];
      current.push(property.type);
      types.set(property.name, current);
    }
  }
  return types;
}

function collect(members: ReadonlyArray<SchemaAST.Objects>, fields: Map<string, Field>): void {
  for (const [name, asts] of fieldTypes(members)) {
    const field: Field = {
      name,
      optional:
        members.some((member) => missingFromMember(name, member)) ||
        asts.some(SchemaAST.isOptional),
      nullable: asts.some(acceptsNull),
    };
    fields.set(name, field);
    const nested = asts.map((ast) => objectMembers(ast, true));
    if (nested.every((part) => part !== undefined)) {
      field.children = new Map();
      collect(
        nested.flatMap((part) => part ?? []),
        field.children,
      );
    } else if (nested.some((part) => part !== undefined)) {
      throw new Error(`Columnar cannot mix nested and leaf values at ${name}`);
    }
  }
}

function assertUnambiguous(fields: Map<string, Field>, prefix = ""): void {
  for (const field of fields.values()) {
    const name = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.optional && field.nullable) {
      throw new Error(`Columnar cannot encode optional nullable key: ${name}`);
    }
    if (
      field.children !== undefined &&
      (field.optional || field.nullable) &&
      [...field.children.values()].every(canBeAllNull)
    ) {
      throw new Error(`Columnar cannot distinguish absent and all-null values at: ${name}`);
    }
    if (field.children !== undefined) assertUnambiguous(field.children, name);
  }
}

function canBeAllNull(field: Field): boolean {
  return (
    field.optional ||
    field.nullable ||
    (field.children !== undefined && [...field.children.values()].every(canBeAllNull))
  );
}

function leafColumns(
  fields: Map<string, Field>,
  prefix = "",
  keys: ReadonlyArray<string> = [],
): ReadonlyArray<Column> {
  const result: Column[] = [];
  for (const field of fields.values()) {
    const name = prefix ? `${prefix}.${field.name}` : field.name;
    const path = [...keys, field.name];
    if (field.children === undefined) result.push({ name, keys: path });
    else result.push(...leafColumns(field.children, name, path));
  }
  return result;
}

function paths(fields: Map<string, Field>, prefix = ""): ReadonlyArray<string> {
  return leafColumns(fields, prefix).map((column) => column.name);
}

function getPath(row: unknown, keys: ReadonlyArray<string>): unknown {
  let value = row;
  for (const part of keys) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) return null;
    value = Reflect.get(value, part);
  }
  return value;
}

function toColumns(
  rows: ReadonlyArray<unknown>,
  columns: ReadonlyArray<Column>,
): Record<string, ReadonlyArray<unknown>> {
  return Object.fromEntries(
    columns.map((column) => [column.name, rows.map((row) => getPath(row, column.keys))]),
  );
}

function isAbsent(
  field: Field,
  columns: Record<string, ReadonlyArray<unknown>>,
  index: number,
  name: string,
): boolean {
  if (!field.optional) return false;
  if (field.children === undefined) return columns[name]?.[index] === null;
  return paths(field.children, name).every((path) => columns[path]?.[index] === null);
}

function rebuild(
  fields: Map<string, Field>,
  columns: Record<string, ReadonlyArray<unknown>>,
  index: number,
  prefix = "",
): Record<string, unknown> {
  const row: Record<string, unknown> = Object.create(null);
  for (const field of fields.values()) {
    const name = prefix ? `${prefix}.${field.name}` : field.name;
    if (isAbsent(field, columns, index, name)) continue;
    if (field.children === undefined) {
      const value = columns[name]?.[index];
      row[field.name] = value;
    } else {
      const empty = paths(field.children, name).every((path) => columns[path]?.[index] === null);
      row[field.name] =
        field.nullable && empty ? null : rebuild(field.children, columns, index, name);
    }
  }
  return row;
}

function columnCount(
  columns: Record<string, ReadonlyArray<unknown>>,
  names: ReadonlyArray<string>,
): string | undefined {
  if (
    Object.keys(columns).length !== names.length ||
    names.some((name) => !Object.hasOwn(columns, name))
  ) {
    return "columns do not match row schema";
  }
  const length = columns[names[0] ?? ""]?.length ?? 0;
  if (names.some((name) => columns[name]?.length !== length)) return "column lengths differ";
  return undefined;
}

/** Keeps row values in TypeScript while encoding lists as equal-length columns. */
export function Columnar<const R extends Row>(row: R) {
  const members = objectMembers(row.ast);
  if (members === undefined) throw new Error("Columnar requires a struct or a union of structs");
  const fields = new Map<string, Field>();
  collect(members, fields);
  assertUnambiguous(fields);
  const columnPaths = leafColumns(fields);
  const names = columnPaths.map((column) => column.name);
  if (names.length === 0) throw new Error("Columnar requires at least one column");
  if (new Set(names).size !== names.length) throw new Error("Columnar has duplicate column names");
  const columns = Schema.Record(Schema.String, Schema.Array(Schema.Unknown)).check(
    Schema.makeFilter((value) => columnCount(value, names) ?? true),
  );
  const encodedRow = Schema.toEncoded(row);
  return columns.pipe(
    Schema.decodeTo(Schema.Array(row), {
      decode: SchemaGetter.transformEffect((value) =>
        Effect.forEach(
          Array.from({ length: value[names[0] ?? ""]?.length ?? 0 }, (_, index) => index),
          (index) => SchemaParser.decodeUnknownEffect(encodedRow)(rebuild(fields, value, index)),
        ),
      ),
      encode: SchemaGetter.transform((value) => toColumns(value, columnPaths)),
    }),
  );
}
