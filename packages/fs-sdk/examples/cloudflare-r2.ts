import { r2 } from "files-sdk/r2";
import { FileSystem } from "fs-sdk";

// Storage adapters come from files-sdk. FileSystem adds fs-like operations.
const fs = new FileSystem({
  adapter: r2({
    bucket: env("R2_BUCKET"),
    accountId: env("CLOUDFLARE_ACCOUNT_ID"),
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  }),
  prefix: "examples/r2",
});

const main = async () => {
  await fs.writeFile("/workspace/readme.md", "# Stored through files-sdk R2\n", {
    contentType: "text/markdown",
  });
  await fs.cp("/workspace/readme.md", "/workspace/archive/readme.md");

  console.log({
    workspace: await fs.readdir("/workspace"),
    archived: await fs.readFile("/workspace/archive/readme.md"),
  });
};

main().catch((error: unknown) => {
  console.error(error);
  throw error;
});

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
