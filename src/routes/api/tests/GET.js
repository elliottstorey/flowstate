async function handler({ db, user }) {
    const tests = await db`
        select * from tests
        where user_id = ${user.id}
        order by created_at asc
    `;

    return tests;
}

export default handler;