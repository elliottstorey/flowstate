async function handler({ db, user }) {
    const answers = (await db`
        SELECT * FROM answers
        WHERE user_id = ${user.id}
    `).length;

    return {answers};
}

export default handler;