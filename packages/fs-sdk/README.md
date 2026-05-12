# fs-sdk

A POSIX-like virtual filesystem overlay for object/blob storage. The package is
structurally compatible with `files-sdk` providers and exposes a native
just-bash filesystem implementation.

```ts
import { OverlayFs } from "fs-sdk";
import { filesSdkStorage } from "fs-sdk/files-sdk";

const fs = new OverlayFs({
  storage: filesSdkStorage(files),
  prefix: "workspace",
});

await fs.mkdir("/src", { recursive: true });
await fs.writeFile("/src/index.ts", "export {};\n");
```

## just-bash

```ts
import { createJustBashFs } from "fs-sdk/just-bash";

const filesystem = createJustBashFs({
  storage: filesSdkStorage(files),
  prefix: "session",
});
```

The returned object implements the just-bash filesystem shape, including
`readFile`, `writeFile`, `stat`, `lstat`, `readdir`, `mkdir`, `rm`, `cp`, `mv`,
`chmod`, `symlink`, `readlink`, `realpath`, and `utimes`.

## Acknowledgements

`fs-sdk` is designed to work with and respect the existing ecosystems around:

- [`files-sdk`](https://github.com/haydenbleasel/files-sdk) - an MIT-licensed
  file storage SDK that this project can adapt as a backing provider.
- [`just-bash`](https://github.com/vercel-labs/just-bash) - an Apache-2.0
  licensed shell runtime that this project can provide a filesystem for.

## License

MIT. See [LICENSE](LICENSE).
