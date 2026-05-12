import { vercelBlob } from "files-sdk/vercel-blob";
import { FileSystem } from "@uriafranko/fs-sdk";

// Storage adapters come from files-sdk. FileSystem is also just-bash-compatible.
const fs = new FileSystem({
  adapter: vercelBlob({
    token: env("BLOB_READ_WRITE_TOKEN"),
    access: "private",
  }),
  prefix: "examples/vercel-blob",
});

const main = async () => {
  await fs.writeFile("/home/user/run.sh", "echo stored through files-sdk\n", {
    contentType: "text/x-shellscript",
  });
  await fs.chmod("/home/user/run.sh", 0o100755);
  await fs.hydratePaths();

  console.log({
    paths: fs.getAllPaths(),
    script: await fs.readFile("/home/user/run.sh"),
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
