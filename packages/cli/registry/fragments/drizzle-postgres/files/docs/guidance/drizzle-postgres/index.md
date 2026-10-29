# drizzle-postgres guidance

Read these references before changing the database code, its tests or its scripts. They apply to every agent.

Drizzle changes its config shape, migration folder layout and migrator entry points between releases. Look things up in this order: the installed declarations under `node_modules/drizzle-orm/` and `node_modules/drizzle-kit/`, `bunx drizzle-kit <command> --help`, the matching pages on orm.drizzle.team, then memory last.

- [database](database.md): services and ports, the database module, migrations and the drift check.
- [testing](testing.md): the run-owned test databases, the end-to-end database and what each test proves.
