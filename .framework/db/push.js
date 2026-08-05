import { execSync } from "child_process";
import fs from "fs/promises";
import { join } from "path";

const root = join(import.meta.dirname, "../../");
const paths = [
    ".framework/db/schema.sql",
    ".framework/auth/schema.sql",
    ".framework/payments/schema.sql",
    ".framework/ai/schema.sql",
    "schema.sql",
    "src/schema.sql"
].map(p => join(root, p));

try {
    const customFiles = await fs.readdir(join(root, "src/schemas"));
    paths.push(...customFiles.filter(f => f.endsWith(".sql")).map(f => join(root, "src/schemas", f)));
} catch { }

let schema = "";
for (const p of paths) {
    try { schema += `${await fs.readFile(p, "utf8")}\n\n`; } catch { }
}

const temp = join(root, "temp.sql");
await fs.writeFile(temp, schema);

try {
    execSync(`npx @ariga/atlas schema apply --url "${process.env.DATABASE_URL}" --to "file://${temp}" --dev-url "docker://postgres/15/dev"`, { stdio: "inherit" });
} finally {
    await fs.unlink(temp).catch(() => { });
}