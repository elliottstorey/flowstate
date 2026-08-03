async function handler({ db }) {
    const lessons = await db`
        select id, type, subtype, title from lessons
    `;

    return lessons;
}

export default handler;