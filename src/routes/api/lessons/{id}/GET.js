async function handler({ db, user, params }) {
    const { id } = params;

    const [lesson] = await db`
        select * from lessons
        where id = ${id}
    `;

    return lesson;
}

export default handler;