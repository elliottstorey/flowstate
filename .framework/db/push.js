import fs from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import crypto from "crypto";
import postgres from "postgres";
import migra from "@pgkit/migra";

// Anchor to this file's location, then step up two folders to the project root
const rootDir = join(import.meta.dirname, "../../");

async function loadSchemas() {
    const parts = [];

    // Helper to safely read a specific file and log if successful
    const tryRead = async (file) => {
        try {
            parts.push(await fs.readFile(file, "utf8"));
            console.log(`Loaded schema from: ${file}`);
        } catch {
            // Silently fail if a file doesn't exist yet
        }
    };

    // 1. STRICT MANIFEST ORDER
    // This is your source of truth. Add new framework modules here in the exact order they should load.
    const schemaOrder = [
        "db",
        "auth",
        "payments",
        "ai"
    ];

    const fwDir = join(rootDir, ".framework");
    for (const moduleName of schemaOrder) {
        // Loads .framework/db/schema.sql, then .framework/auth/schema.sql, etc.
        await tryRead(join(fwDir, moduleName, "schema.sql"));
    }

    // 2. PROJECT-LEVEL FALLBACKS
    // Load the user's custom app-level schemas after the framework foundation is laid
    await tryRead(join(rootDir, "schema.sql"));
    await tryRead(join(rootDir, "src/schema.sql"));

    // 3. ANY ADDITIONAL SRC SCHEMAS
    // If you have a dedicated folder for random app schemas, we still load them (sorted alphabetically for predictability)
    try {
        const schemaDir = join(rootDir, "src/schemas");
        const files = await fs.readdir(schemaDir);
        const sortedFiles = files.filter(f => f.endsWith(".sql")).sort();
        for (const f of sortedFiles) {
            await tryRead(join(schemaDir, f));
        }
    } catch { }

    // 4. JAVASCRIPT SCHEMAS
    try {
        const jsModule = await import(pathToFileURL(join(rootDir, "src/schema.js")).href);
        const jsSchema = jsModule.default || jsModule.schema || "";
        if (jsSchema) {
            parts.push(jsSchema);
            console.log(`Loaded schema from: src/schema.js`);
        }
    } catch { }

    const finalSchema = parts.join("\n\n");

    // If we still found absolutely nothing, scream loudly in the terminal
    if (!finalSchema.trim()) {
        console.warn("\n⚠️ WARNING: No schema files were loaded! Migra is comparing an empty database.");
        console.warn("Please ensure your SQL file is named correctly and located in one of the searched directories.\n");
    }

    return finalSchema;
}

const dbUrl = process.env.DATABASE_URL;
const shadowDb = `schema_${crypto.randomBytes(8).toString("hex")}`;
const shadowDbUrl = new URL(shadowDb, dbUrl).toString();

console.log("connecting to database...");
const sql = postgres(dbUrl, { max: 1, idle_timeout: 1 });

try {
    console.log("loading schema files...");
    const schema = await loadSchemas();

    console.log("creating shadow database...");
    await sql.unsafe(`create database "${shadowDb}"`);

    console.log("initialising schema...");
    const shadowSql = postgres(shadowDbUrl, { max: 1, idle_timeout: 1 });

    console.log(schema)
    // Wrapped in a specific try/catch to catch bad SQL syntax immediately
    try {
        await shadowSql.unsafe(schema);
    } catch (sqlError) {
        console.error("\n❌ ERROR: Your loaded SQL contains a syntax error.");
        console.error("Check your .sql files for typos or unquoted reserved words (like 'user').");
        throw sqlError;
    }

    // Ask the SHADOW database for the schemas, because it contains our desired state
    const schemas = await shadowSql`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT LIKE 'pg_%' 
        AND schema_name != 'information_schema'
    `;

    // Now we can close the shadow connection
    await shadowSql.end();

    console.log("diffing schemas...");
    let appliedMigrations = false;

    // Run Migra in a loop for EACH schema individually. 
    // This perfectly prevents the library from choking on comma-separated strings.
    for (const s of schemas) {
        const schemaName = s.schema_name;
        console.log(`checking schema: ${schemaName}`);

        const diff = await migra.run(dbUrl, shadowDbUrl, {
            unsafe: true,
            schema: schemaName
        });

        if (diff && diff.sql) {
            const patchedSql = diff.sql.replace(/'Author's Attitude'/g, "'Author''s Attitude'");
            console.log(`\n--- GENERATED MIGRATION FOR ${schemaName} ---`);
            console.log(diff.sql);
            console.log("-----------------------------------\n");
            await sql.unsafe(patchedSql);
            appliedMigrations = true;
        }
    }

    if (appliedMigrations) {
        console.log("applied schema migrations successfully!");
    } else {
        console.log("no migrations to apply");
    }
} catch (error) {
    console.log("\nencountered error:");
    console.error(error);
} finally {
    console.log("cleaning up...");
    await sql.unsafe(`drop database if exists "${shadowDb}" with (force)`);
    await sql.end();
}