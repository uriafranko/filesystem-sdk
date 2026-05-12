# filesystem-sdk

A POSIX-like virtual filesystem layer for
[`files-sdk`](https://github.com/haydenbleasel/files-sdk) storage providers,
with an API that can be passed directly to
[`just-bash`](https://github.com/vercel-labs/just-bash).

`filesystem-sdk` keeps storage ownership in `files-sdk` and adds filesystem behavior on
top: paths, directories, metadata, symlinks, recursive copy/move/remove, and
Node-style read/write operations over object storage.

## Installation

```bash
npm install filesystem-sdk
```

## Quick Start

```bash
npm install filesystem-sdk files-sdk
```

```ts
import { FileSystem } from "filesystem-sdk";
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

## Why filesystem-sdk

- Use object storage through a filesystem-shaped API.
- Keep provider adapters in `files-sdk` instead of duplicating storage logic.
- Run the same filesystem against R2, Vercel Blob, local files, memory adapters,
  or any compatible `files-sdk` provider.
- Preserve filesystem metadata separately from file bodies.
- Integrate with `just-bash` without an adapter bridge.

## Usage

### From a files-sdk Adapter

Pass normal `files-sdk` constructor options to `FileSystem`. The adapter handles
storage; `filesystem-sdk` handles filesystem semantics.

```ts
import { FileSystem } from "filesystem-sdk";
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
import { FileSystem } from "filesystem-sdk";
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
import { FileSystem } from "filesystem-sdk";

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

#### just-bash Integration Support

The integration is a filesystem adapter for `just-bash`; it does not extend the
shell parser or process model. Search-oriented shell workflows should use the
built-in commands from the `just-bash` version you install rather than
reimplementing them in `filesystem-sdk`.

| Workflow or feature | Support | Notes |
| --- | --- | --- |
| Run scripts that read files by path | Supported | `readFile`, `readFileBuffer`, `exists`, `stat`, and `lstat` are implemented |
| Write files from scripts | Supported | `writeFile` and `appendFile` update object storage and the in-memory path cache |
| Relative paths and `cwd` | Supported | `resolvePath()` handles virtual path resolution for the shell runtime |
| Directory operations | Supported | `mkdir`, `readdir`, and `readdirWithFileTypes` are implemented |
| Copy, move, and remove | Supported | `cp`, `mv`, and `rm` work against the virtual filesystem |
| Symlinks | Supported | `symlink`, `readlink`, and `realpath` are implemented |
| File modes and timestamps | Metadata only | `chmod` and `utimes` persist metadata, but there is no OS-level user/group enforcement |
| Eager path discovery | Supported with hydration | Use `hydratePaths()` when `getAllPaths()` must include files that already exist in object storage |
| `ls`, `tree`, `du`, and `stat` | Supported by `just-bash` | These commands use the directory and metadata APIs exposed by this adapter |
| Glob expansion, such as `*.ts` | Supported by `just-bash` | Fresh writes are cached automatically; hydrate first when matching paths that already existed in object storage |
| `find` | Supported by `just-bash` | Recursive traversal uses `readdir`/`stat`; it can discover object-store contents without a separate search index |
| `grep`, `egrep`, and `fgrep` | Supported by `just-bash` | Recursive search works, but it reads matching file bodies from object storage |
| `rg` | Supported by `just-bash` | This is the `just-bash` implementation, not the native ripgrep binary; use `rg --help` for supported flags |
| Search pipelines | Supported by `just-bash` | Pipes, redirects, `xargs`, `sort`, `uniq`, `wc`, `head`, `tail`, `sed`, and `awk` can compose with filesystem commands |
| Server-side full-text search | Not supported | `filesystem-sdk` does not maintain an index; large searches cost object listings plus file downloads |
| Host-specific commands outside `just-bash` | Not supported by `filesystem-sdk` | Add clean `just-bash` custom commands if your app needs a specific extra command |
| Native executable binaries | Not supported by `filesystem-sdk` | Object-store files are stored bytes; `filesystem-sdk` does not execute OS processes |
| TTY, job control, and background processes | Not supported by `filesystem-sdk` | These require a process runtime outside the filesystem adapter |

### From Raw Object Storage

Use `OverlayFs` directly when you already have an object-storage implementation
with `upload`, `download`, `head`, `delete`, and `list`.

```ts
import { OverlayFs } from "filesystem-sdk";

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

## Compared With a Local Filesystem

`filesystem-sdk` provides filesystem primitives over object storage. It is not a full
Unix filesystem, kernel, or Bash environment. Shell features are only available
when the shell runtime you pass this filesystem to implements them.

| Feature | Local filesystem / shell | `filesystem-sdk` behavior |
| --- | --- | --- |
| `ls` | A shell command can list directories from the OS filesystem | Use `readdir()` or `readdirWithFileTypes()`; `ls` itself depends on the shell runtime |
| Glob patterns like `*.ts` | Expanded by the shell or glob library | No built-in glob expansion; use `getAllPaths()` or `listPaths()` and filter paths yourself |
| `grep` / text search | External command scans files on disk | No built-in search command or index; read file content and search in application code or through a shell runtime that provides `grep` |
| Pipes and redirects | Managed by the shell and operating system | Not provided by `filesystem-sdk`; support depends on the command runner, such as `just-bash` |
| Process execution | The OS runs binaries from the filesystem | `filesystem-sdk` stores files only; it does not execute native binaries |
| Permissions and ownership | Enforced by the OS with users, groups, and modes | Modes are stored as metadata; OS-level users, groups, and permission enforcement are not provided |
| Hard links | Multiple paths can point to the same inode | `link()` copies file content and metadata instead of sharing an inode |
| File watching and locks | Provided by OS APIs such as inotify/FSEvents and advisory locks | Not supported |
| Special files | Devices, sockets, FIFOs, and other node types can exist | Only files, directories, and symbolic links are modeled |
| Random access / streaming writes | Local files can be updated in place | Object bodies are uploaded as whole objects |

For Bash-like workflows, treat `filesystem-sdk` as the storage-backed filesystem layer.
Use `just-bash` or another command runner for shell syntax and commands, and use
`hydratePaths()` when that runner needs a complete eager path list through
`getAllPaths()`.

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

Provider adapters stay in `files-sdk`. Filesystem APIs stay in
`filesystem-sdk`.

```ts
import { FileSystem, OverlayFs } from "filesystem-sdk";
import { overlayFromFilesSdk } from "filesystem-sdk/files-sdk";
import { createJustBashFs } from "filesystem-sdk/just-bash";

import { r2 } from "files-sdk/r2";
import { vercelBlob } from "files-sdk/vercel-blob";
```

`filesystem-sdk` does not re-export provider adapters from paths like
`filesystem-sdk/r2`. This keeps provider behavior owned by `files-sdk` and keeps
this package focused on filesystem behavior.

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

- [Cloudflare R2](https://github.com/uriafranko/filesystem-sdk/blob/main/packages/filesystem-sdk/examples/cloudflare-r2.ts) - creates a filesystem over `files-sdk/r2`.
- [Vercel Blob](https://github.com/uriafranko/filesystem-sdk/blob/main/packages/filesystem-sdk/examples/vercel-blob.ts) - creates a just-bash-compatible filesystem over `files-sdk/vercel-blob`.
- [Memory](https://github.com/uriafranko/filesystem-sdk/blob/main/packages/filesystem-sdk/examples/memory.ts) - implements a small in-memory `files-sdk` adapter for local testing.

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

The package lives in `packages/filesystem-sdk`; repository-level scripts delegate to it
through npm workspaces.

## Acknowledgements

`filesystem-sdk` is designed to work with and respect the existing ecosystems around:

- [`files-sdk`](https://github.com/haydenbleasel/files-sdk), an MIT-licensed
  storage SDK used as the backing provider layer.
- [`just-bash`](https://github.com/vercel-labs/just-bash), an Apache-2.0
  shell runtime that can consume this filesystem API.

## License

MIT. See
[LICENSE](https://github.com/uriafranko/filesystem-sdk/blob/main/packages/filesystem-sdk/LICENSE).
