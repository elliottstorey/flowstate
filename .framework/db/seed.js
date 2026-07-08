import postgres from "postgres";
import seed from "#config/seed";

const db = postgres(process.env.DATABASE_URL);

try {
    await seed({ db });
} catch{

}