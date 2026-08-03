async function handler({ db, user, params, body }) {
    const { id } = params;
    const { selectedChoice } = await body();

    if (!['A', 'B', 'C', 'D', 'E', null].includes(selectedChoice)) {
        throw new Error("Invalid choice");
    }

    // This query ONLY updates the answer if its parent section is NOT completed
    const [updatedAnswer] = await db`
        update answers a
        set selected_choice = ${selectedChoice}
        from sections s
        where a.id = ${id} 
          and a.section_id = s.id
          and s.completed_at is null 
          and a.user_id = ${user.id}
        returning a.id, a.selected_choice
    `;

    if (!updatedAnswer) throw new Error("Answer not found or section is locked");

    return { success: true };
}

export default handler;