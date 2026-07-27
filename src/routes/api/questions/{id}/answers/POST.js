export default async function handler({ db, user, payments, params, body }) {
    const { id } = params; 
    const { selectedChoice } = await body();

    const [question] = await db`
        select * from questions
        where id = ${id}
    `;

    const correct = selectedChoice == question.answer;
    const reviewed = correct || !payments.features.messages; 

    const [answer] = await db`
        insert into answers (user_id, question_id, selected_choice, reviewed) 
        values (${user.id}, ${id}, ${selectedChoice}, ${reviewed})
        returning id;
    `;

    return {
        id: answer.id,
        answer: question.answer,
        correct,
        reviewed
    };
}