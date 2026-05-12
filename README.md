# fs-sdk

`fs-sdk` is a virtual filesystem overlay for object/blob storage backends.
It is designed to sit above any `files-sdk`-compatible storage provider and
provide filesystem-style operations for tools such as `just-bash`.

```ts
import { OverlayFs } from "fs-sdk";
import { filesSdkStorage } from "fs-sdk/files-sdk";
import { createJustBashFs } from "fs-sdk/just-bash";

const storage = filesSdkStorage(files); // files is a files-sdk Files instance

const fs = new OverlayFs({ storage, prefix: "agents/session-1" });
await fs.writeFile("/home/user/readme.txt", "hello");

const bashFs = createJustBashFs({ storage, prefix: "agents/session-1" });
```

## Package Layout

- `packages/fs-sdk/src/index.ts` - core overlay filesystem API.
- `packages/fs-sdk/src/files-sdk/index.ts` - adapter helpers for files-sdk.
- `packages/fs-sdk/src/just-bash/index.ts` - native just-bash filesystem integration.
- `packages/fs-sdk/src/internal/*` - path, byte, storage, and metadata helpers.
- `packages/fs-sdk/test/*` - focused coverage for the overlay and integrations.

## Storage Model

The overlay stores file bodies and filesystem metadata separately:

- `${prefix}/objects/<path>` - file body bytes.
- `${prefix}/meta/<path>.json` - file or symlink metadata.
- `${prefix}/meta/<path>/.dir.json` - explicit directory metadata.

Directories can also be synthesized from child object prefixes, which makes the
overlay work across object stores that do not have real directories.

## Acknowledgements

`fs-sdk` is designed to work with and respect the existing ecosystems around:

- [`files-sdk`](https://github.com/haydenbleasel/files-sdk) - an MIT-licensed
  file storage SDK that this project can adapt as a backing provider.
- [`just-bash`](https://github.com/vercel-labs/just-bash) - an Apache-2.0
  licensed shell runtime that this project can provide a filesystem for.

## License

MIT. See [LICENSE](LICENSE).
