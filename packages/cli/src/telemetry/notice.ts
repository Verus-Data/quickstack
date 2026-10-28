import { Clock, Effect, Option } from "effect";
import { Notice, read, remove, type Storage, uuid } from "./storage";

/** Recover an abandoned exclusive claim; never discard a newer claimant's marker. */
export const recoverNotice = Effect.fn("telemetry.recoverNotice")(function* (store: Storage) {
  const target = store.path.join(store.root, "notice.json");
  const stat = yield* store.fs.stat(target).pipe(Effect.option);
  if (Option.isNone(stat)) return;
  const now = yield* Clock.currentTimeMillis;
  const modified = Option.getOrElse(stat.value.mtime, () => new Date(now)).getTime();
  if (now - modified <= 600_000) return;
  const observed = yield* read(store, "notice.json", Notice).pipe(Effect.option);
  if (Option.isSome(observed) && !observed.value.pending) return;
  const retired = `.notice-${yield* uuid}`;
  const moved = yield* store.fs
    .rename(target, store.path.join(store.root, retired))
    .pipe(Effect.result);
  if (moved._tag === "Failure") return;
  const claimed = yield* read(store, retired, Notice).pipe(Effect.option);
  const same =
    Option.isSome(observed) &&
    Option.isSome(claimed) &&
    observed.value.claimId === claimed.value.claimId &&
    observed.value.noticeShownAt === claimed.value.noticeShownAt;
  if (Option.isSome(claimed) && (!same || !claimed.value.pending)) {
    // link is exclusive: a marker created since the rename wins, and is left untouched.
    yield* store.fs.link(store.path.join(store.root, retired), target).pipe(Effect.ignore);
  }
  yield* remove(store, retired);
});
