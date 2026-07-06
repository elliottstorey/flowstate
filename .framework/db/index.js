import postgres from "postgres";

const db = postgres(process.env.DATABASE_URL);

function server() {
    return { db };
}

export { server };