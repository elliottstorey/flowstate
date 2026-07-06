create type question_type as enum ('Logical Reasoning', 'Reading Comprehension');

create type question_subtype as enum (
    -- Logical Reasoning Subtypes
    'Assumptions',
    'Flaws',
    'Techniques, Roles, and Principles',
    'Strengthen or Weaken',
    'Deductions and Inference',
    'Explain or Resolve',
    'Conclusions and Disputes',
    'Matching Structure and Principles',
    'Matching Flaws',
    -- Reading Comprehension Subtypes
    'Drawing Inferences',
    'Recognizing Elements of the Passage',
    'Identifying Main Points and Primary Purposes',
    'Analyzing how the Parts Work',
    'Applying the Argument to New Contexts',
    'Author''s Attitude',
    'Meaning in Context'
);

create type choice_letter as enum ('A', 'B', 'C', 'D', 'E');

-- 1. CORE TEST ENTITIES
create table tests (
    id bigint generated always as identity primary key,
    name text not null
);

create table sections (
    id bigint generated always as identity primary key,
    test_id bigint not null references tests(id) on delete cascade,
    number integer not null check (number between 1 and 4),
    type question_type not null,
    is_variable boolean default false,
    
    unique (test_id, number)
);

-- 2. INDEPENDENT CONTENT ENTITIES
create table passages (
    id bigint generated always as identity primary key,
    text text not null
    -- section_id and number REMOVED. Passages now exist independently.
);

create table questions (
    id bigint generated always as identity primary key,
    type question_type not null,
    subtype question_subtype not null,
    
    passage_id bigint references passages(id) on delete cascade, 
    stimulus text,
    stem text not null,
    answer choice_letter not null,
    difficulty integer not null check (difficulty between 1 and 5),

    -- OPTIONAL EXPERT LEVEL-UP: Enforce data integrity between LR and RC.
    -- LR needs a stimulus, RC needs a passage. 
    check (
        (type = 'Logical Reasoning' and stimulus is not null and passage_id is null) or
        (type = 'Reading Comprehension' and passage_id is not null)
    )
    -- section_id and number REMOVED. Questions now exist independently.
);

create table choices (
    id bigint generated always as identity primary key,
    question_id bigint not null references questions(id) on delete cascade,
    letter choice_letter not null,
    text text not null,
    rationale text not null,
    
    unique (question_id, letter)
);

-- 3. JUNCTION TABLES (The Glue)
-- Maps independent passages to specific sections
create table section_passages (
    section_id bigint not null references sections(id) on delete cascade,
    passage_id bigint not null references passages(id) on delete cascade,
    number integer not null check (number between 1 and 4),
    
    primary key (section_id, passage_id),
    unique (section_id, number)
);

-- Maps independent questions to specific sections
create table section_questions (
    section_id bigint not null references sections(id) on delete cascade,
    question_id bigint not null references questions(id) on delete cascade,
    number integer not null, -- e.g., Question 1 through 26
    
    primary key (section_id, question_id),
    unique (section_id, number)
);

-- 4. USER DATA
create table answers (
    id bigint generated always as identity primary key,
    user_id bigint null references auth.users(id) on delete cascade,
    question_id bigint not null references questions(id) on delete cascade,
    selected_choice choice_letter not null,
    reviewed boolean not null default false,
    answered_at timestamptz not null default now()
);

create type message_role as enum ('user', 'assistant');

create table messages (
    id bigint generated always as identity primary key,
    user_id bigint not null references auth.users(id) on delete cascade,
    answer_id bigint not null references answers(id) on delete cascade,
    role message_role not null,
    content text not null,
    created_at timestamptz not null default now()
);