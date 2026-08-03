async function handler({ db, user, params }) {
    const { id } = params;

    // Lock the section by setting completed_at to now()
    // The sub-query ensures the section actually belongs to the user
    const [section] = await db`
        update sections
        set completed_at = now()
        where id = ${id} 
          and completed_at is null
          and test_id in (select id from tests where user_id = ${user.id})
        returning id, test_id
    `;

    if (!section) throw new Error("Section not found or already submitted");

    return { success: true };
}

export default handler;