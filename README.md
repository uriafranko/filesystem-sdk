# fs-sdk

`fs-sdk` is a virtual filesystem overlay for `files-sdk` storage providers.
Storage communication still goes through `files-sdk`; this package adds
filesystem-style operations and just-bash integration on top.

```ts
import { FileSystem } from "fs-sdk";
import { r2 } from "files-sdk/r2";

const fs = new FileSystem({
  adapter: r2({
    bucket: process.env.R2_BUCKET!,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  }),
  prefix: "agents/session-1",
});
await fs.writeFile("/home/user/readme.txt", "hello");
```

If your app already creates a `files-sdk` instance, pass it directly:

```ts
import { Files } from "files-sdk";
import { FileSystem } from "fs-sdk";

const files = new Files({ adapter });
const fs = new FileSystem({ files, prefix: "agents/session-1" });
```

## Import Model

Provider adapters stay in `files-sdk`; filesystem APIs stay in `fs-sdk`.

```ts
import { FileSystem } from "fs-sdk";
import { r2 } from "files-sdk/r2";
import { vercelBlob } from "files-sdk/vercel-blob";
```

`fs-sdk` does not re-export storage adapters from paths like `fs-sdk/files`.
That keeps storage behavior owned by `files-sdk` and keeps this package focused
on filesystem operations and just-bash compatibility.

## Minimal Examples

Cloudflare R2:

```ts
import { FileSystem } from "fs-sdk";
import { r2 } from "files-sdk/r2";

const fs = new FileSystem({
  adapter: r2({ bucket, accountId, accessKeyId, secretAccessKey }),
  prefix: "workspace",
});

await fs.writeFile("/notes/todo.md", "- ship\n");
```

Vercel Blob:

```ts
import { FileSystem } from "fs-sdk";
import { vercelBlob } from "files-sdk/vercel-blob";

const fs = new FileSystem({
  adapter: vercelBlob({ token: process.env.BLOB_READ_WRITE_TOKEN }),
  prefix: "workspace",
});

await fs.mkdir("/src", { recursive: true });
await fs.writeFile("/src/index.ts", "export {};\n");
```

Existing `files-sdk` instance:

```ts
import { Files } from "files-sdk";
import { FileSystem } from "fs-sdk";

const files = new Files({ adapter });
const fs = new FileSystem({ files, prefix: "workspace" });
```

just-bash-compatible filesystem:

```ts
import { FileSystem } from "fs-sdk";

const filesystem = new FileSystem({ adapter, prefix: "session" });

await filesystem.writeFile("/home/user/run.sh", "echo hello\n");
await filesystem.hydratePaths();
```

## Examples

The repository includes TypeScript examples that configure `files-sdk` through
the `FileSystem` constructor:

- [Cloudflare R2](packages/fs-sdk/examples/cloudflare-r2.ts) - creates a
  filesystem over `files-sdk/r2`.
- [Vercel Blob](packages/fs-sdk/examples/vercel-blob.ts) - creates a
  just-bash-compatible filesystem over `files-sdk/vercel-blob`.
- [Memory](packages/fs-sdk/examples/memory.ts) - defines an in-memory
  `files-sdk` adapter for local tests, then creates a filesystem over it.

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
