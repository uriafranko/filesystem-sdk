# fs-sdk

A POSIX-like virtual filesystem layer for
[`files-sdk`](https://github.com/haydenbleasel/files-sdk) storage providers,
with an API that can be passed directly to
[`just-bash`](https://github.com/vercel-labs/just-bash).

`fs-sdk` keeps storage ownership in `files-sdk` and adds filesystem behavior on
top: paths, directories, metadata, symlinks, recursive copy/move/remove, and
Node-style read/write operations over object storage.

## Quick Start

```bash
npm install fs-sdk files-sdk
```

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

await fs.mkdir("/workspace", { recursive: true });
await fs.writeFile("/workspace/readme.md", "# Hello\n", {
  contentType: "text/markdown",
});

const text = await fs.readFile("/workspace/readme.md");
console.log(text); // "# Hello\n"
```

The `prefix` keeps filesystem data isolated inside the backing storage bucket or
container. Use a different prefix for each workspace, tenant, session, or agent.

## Why fs-sdk

- Use object storage through a filesystem-shaped API.
- Keep provider adapters in `files-sdk` instead of duplicating storage logic.
- Run the same filesystem against R2, Vercel Blob, local files, memory adapters,
  or any compatible `files-sdk` provider.
- Preserve filesystem metadata separately from file bodies.
- Integrate with `just-bash` without an adapter bridge.

## Usage

### From a files-sdk Adapter

Pass normal `files-sdk` constructor options to `FileSystem`. The adapter handles
storage; `fs-sdk` handles filesystem semantics.

```ts
import { FileSystem } from "fs-sdk";
import { vercelBlob } from "files-sdk/vercel-blob";

const fs = new FileSystem({
  adapter: vercelBlob({
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    access: "private",
  }),
  prefix: "workspaces/docs",
});

await fs.writeFile("/notes/todo.md", "- ship\n");
await fs.cp("/notes/todo.md", "/archive/todo.md");
```

### From an Existing Files Instance

If your app already owns a `Files` instance, pass it directly.

```ts
import { Files } from "files-sdk";
import { FileSystem } from "fs-sdk";
import { fs as localFiles } from "files-sdk/fs";

const files = new Files({
  adapter: localFiles({ root: "/tmp/storage" }),
});

const fs = new FileSystem({
  files,
  prefix: "overlay",
});
```

### With just-bash

`FileSystem` implements the filesystem methods expected by `just-bash`.
Install `just-bash` as well when you want to execute scripts against the
filesystem.

```ts
import { Bash } from "just-bash";
import { FileSystem } from "fs-sdk";

const filesystem = new FileSystem({
  adapter,
  prefix: "sessions/bash",
});

await filesystem.writeFile("/home/user/run.sh", "echo hello\n");
await filesystem.hydratePaths();

const bash = new Bash({
  fs: filesystem,
  cwd: "/home/user",
});

const result = await bash.exec("sh run.sh");
console.log(result.stdout); // "hello\n"
```

Call `hydratePaths()` when the backing object store already contains data and a
consumer needs an eager path list through `getAllPaths()`.

### From Raw Object Storage

Use `OverlayFs` directly when you already have an object-storage implementation
with `upload`, `download`, `head`, `delete`, and `list`.

```ts
import { OverlayFs } from "fs-sdk";

const fs = new OverlayFs({
  storage,
  prefix: "raw-overlay",
});
```

## API Surface

`FileSystem` and `OverlayFs` expose the same core filesystem operations:

| Method | Purpose |
| --- | --- |
| `readFile`, `readFileBuffer`, `readFileBytes` | Read file content as text, bytes, or a byte string |
| `writeFile`, `appendFile` | Write or append file content |
| `exists`, `stat`, `lstat` | Inspect files, directories, and symlinks |
| `mkdir`, `readdir`, `readdirWithFileTypes` | Create and list directories |
| `rm`, `cp`, `mv` | Remove, copy, and move files or directory trees |
| `chmod`, `utimes` | Update stored metadata |
| `symlink`, `readlink`, `realpath` | Work with symbolic links |
| `link` | Create a file hard-link equivalent by copying content |
| `resolvePath`, `listPaths`, `hydratePaths`, `getAllPaths` | Resolve and enumerate virtual paths |

Most methods intentionally follow familiar Node filesystem naming, but all work
against the configured storage provider.

## Configuration

```ts
const fs = new FileSystem({
  adapter,
  prefix: "workspace",
  createParentDirectories: true,
  defaultFileMode: 0o100644,
  defaultDirectoryMode: 0o040755,
  defaultSymlinkMode: 0o120777,
});
```

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `files-sdk` adapter | Creates an internal `Files` instance |
| `files` | `Files`-like object | Reuses an existing storage client instead of creating one |
| `prefix` | `string` | Storage key prefix for this virtual filesystem |
| `createParentDirectories` | `boolean` | Automatically create missing parent directories on writes; defaults to `true` |
| `defaultFileMode` | `number` | Mode used for files without explicit metadata |
| `defaultDirectoryMode` | `number` | Mode used for directories without explicit metadata |
| `defaultSymlinkMode` | `number` | Mode used for symbolic links |

Use either `adapter` or `files`; do not pass both.

## Import Model

Provider adapters stay in `files-sdk`. Filesystem APIs stay in `fs-sdk`.

```ts
import { FileSystem, OverlayFs } from "fs-sdk";
import { overlayFromFilesSdk } from "fs-sdk/files-sdk";
import { createJustBashFs } from "fs-sdk/just-bash";

import { r2 } from "files-sdk/r2";
import { vercelBlob } from "files-sdk/vercel-blob";
```

`fs-sdk` does not re-export provider adapters from paths like `fs-sdk/r2`. This
keeps provider behavior owned by `files-sdk` and keeps this package focused on
filesystem behavior.

## Storage Model

The overlay stores file bodies and filesystem metadata separately:

| Key pattern | Contents |
| --- | --- |
| `${prefix}/objects/<path>` | File body bytes |
| `${prefix}/meta/<path>.json` | File or symlink metadata |
| `${prefix}/meta/<path>/.dir.json` | Explicit directory metadata |

Directories can also be synthesized from child object prefixes. That makes the
overlay usable with object stores that do not have native directories.

## Examples

This repository includes runnable TypeScript examples:

- [Cloudflare R2](https://github.com/uriafranko/fs-sdk/blob/main/packages/fs-sdk/examples/cloudflare-r2.ts) - creates a filesystem over `files-sdk/r2`.
- [Vercel Blob](https://github.com/uriafranko/fs-sdk/blob/main/packages/fs-sdk/examples/vercel-blob.ts) - creates a just-bash-compatible filesystem over `files-sdk/vercel-blob`.
- [Memory](https://github.com/uriafranko/fs-sdk/blob/main/packages/fs-sdk/examples/memory.ts) - implements a small in-memory `files-sdk` adapter for local testing.

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

The package lives in `packages/fs-sdk`; repository-level scripts delegate to it
through npm workspaces.

## Acknowledgements

`fs-sdk` is designed to work with and respect the existing ecosystems around:

- [`files-sdk`](https://github.com/haydenbleasel/files-sdk), an MIT-licensed
  storage SDK used as the backing provider layer.
- [`just-bash`](https://github.com/vercel-labs/just-bash), an Apache-2.0
  shell runtime that can consume this filesystem API.

## License

MIT. See
[LICENSE](https://github.com/uriafranko/fs-sdk/blob/main/packages/fs-sdk/LICENSE).
