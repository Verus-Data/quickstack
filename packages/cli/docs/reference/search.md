# search

Find stacks and fragments for what you want to build:

```sh
stacks search "an iOS health app" --json
stacks search go cli --kind stack --limit 3
```

The request is one or more positional words, joined with spaces and trimmed, from 1 to 500
characters. `--kind stack|fragment` selects one list; `--limit` sets the maximum hits in each
list (default 5, range 1 to 20). `--local` keeps the request on this machine;
`--offline` is also accepted as a shared flag.

When an API endpoint is configured, search sends the request to `GET /v1/search` while ranking
the visible registry locally. API hits replace bundled and cached-index copies; project and
user overrides keep their local ranking. A missing API hit stays available locally.
The API has one attempt and an 800 ms deadline, including reading its response. A failed call
falls back to local ranking and backs off for ten minutes. Only endpoint URLs and expiry times
are saved under `$XDG_CACHE_HOME/stacks/search/backoff.json`; no request or response is cached.
Search stores no request text in logs and never calls a model. Cached statistics and last-run
evidence are optional; search never fetches statistics or refreshes the registry index.

The endpoint is the hosted API at `https://stacks.steamfield.io`. Source builds can point at a
loopback `STACKS_DEV_API_URL` instead; release builds ignore that variable.
`--local`, `--offline`, `STACKS_OFFLINE=1` and `DO_NOT_TRACK` (except empty, `0` or `false`)
each prevent the API call.

`--json` returns `SearchResult`: `ranking: "api" | "local"`, the request, recognized vocabulary and
unmatched content words under `understood`, `noStrongMatch`, and separate `stacks` and
`fragments` lists. `remote` is `used`, `off` or `unavailable`; when off, `remoteReason` is
`local_flag`, `offline`, `do_not_track`, `backoff` or `no_endpoint`. API results also include
`method` (`lexical` or `hybrid`). Text output says when ranking ran locally.
Run `stacks schema search` for the JSON Schema.

`understood.unmatched` lists request words no entry's strong metadata fields matched. A word
listed here may still appear in entry bodies, which provide weaker evidence of a fit.

Each hit includes its origin and trust, absolute `score` from 0 to 1, strong-field `coverage`,
`tier` (`strong`, `partial`, `weak`), matching fields and words under `why`, penalties, optional
caveats and cached evidence. Fragments also carry `appliesTo`. Evidence settles near-ties
within a tier; project counts never raise a score. Untrusted entries cannot be strong.

Compare strong matches using `why` and `evidence`, and read caveats before choosing. When
`noStrongMatch` is true, tell the user nothing fits well and confirm before using a weak match.
Never pick an untrusted entry unless the user named it. Text output ends with the next action,
using the first trusted stack when one is available.

Exit 0 means the search ran, including empty results and no strong match. Exit 2 means invalid
input, 6 means an unreadable registry, and 130 means interruption.
