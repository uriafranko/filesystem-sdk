# fs-sdk

A POSIX-like virtual filesystem overlay for `files-sdk` providers. Storage
communication still goes through `files-sdk`; this package adds filesystem
operations and native just-bash integration on top.

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
  prefix: "workspace",
});

await fs.mkdir("/src", { recursive: true });
await fs.writeFile("/src/index.ts", "export {};\n");
```

If your app already creates a `files-sdk` instance, pass it directly:

```ts
import { Files } from "files-sdk";
import { FileSystem } from "fs-sdk";

const files = new Files({ adapter });
const fs = new FileSystem({ files, prefix: "workspace" });
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

## just-bash

```ts
import { FileSystem } from "fs-sdk";

const filesystem = new FileSystem({
  adapter,
  prefix: "session",
});
```

The returned object implements the just-bash filesystem shape, including
`readFile`, `writeFile`, `stat`, `lstat`, `readdir`, `mkdir`, `rm`, `cp`, `mv`,
`chmod`, `symlink`, `readlink`, `realpath`, and `utimes`.

## Examples

This package includes TypeScript examples that configure `files-sdk` through
the `FileSystem` constructor:

- [Cloudflare R2](examples/cloudflare-r2.ts) - creates a filesystem over
  `files-sdk/r2`.
- [Vercel Blob](examples/vercel-blob.ts) - creates a just-bash-compatible
  filesystem over `files-sdk/vercel-blob`.
- [Memory](examples/memory.ts) - defines an in-memory `files-sdk` adapter for
  local tests, then creates a filesystem over it.

## Acknowledgements

`fs-sdk` is designed to work with and respect the existing ecosystems around:

- [`files-sdk`](https://github.com/haydenbleasel/files-sdk) - an MIT-licensed
  file storage SDK that this project can adapt as a backing provider.
- [`just-bash`](https://github.com/vercel-labs/just-bash) - an Apache-2.0
  licensed shell runtime that this project can provide a filesystem for.

## License

MIT. See [LICENSE](LICENSE).
