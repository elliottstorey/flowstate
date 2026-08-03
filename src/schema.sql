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
create type message_role as enum ('user', 'assistant');

create table passages (
    id bigint generated always as identity primary key,
    content text not null,
    generated boolean not null default false
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

    generated boolean not null default false,

    check (
        (type = 'Logical Reasoning' and stimulus is not null and passage_id is null) or
        (type = 'Reading Comprehension' and passage_id is not null)
    )
);

create table choices (
    id bigint generated always as identity primary key,
    question_id bigint not null references questions(id) on delete cascade,
    letter choice_letter not null,
    content text not null,
    rationale text not null,

    unique (question_id, letter)
);

create table lessons (
    id bigint generated always as identity primary key,
    type text not null,
    subtype text,
    title text not null,
    content text not null
);

-- user tables

create table tests (
    id bigint generated always as identity primary key,
    user_id bigint not null references auth.users(id) on delete cascade,

    raw_score integer,
    scaled_score integer check (scaled_score between 120 and 180),
    content text,

    completed_at timestamptz,
    created_at timestamptz not null default now()
);

create table sections (
    id bigint generated always as identity primary key,
    test_id bigint not null references tests(id) on delete cascade,
    position integer not null check (position between 1 and 4),
    type question_type not null,
    variable boolean not null default false,

    completed_at timestamptz,

    unique (test_id, position)
);

create table answers (
    id bigint generated always as identity primary key,
    user_id bigint not null references auth.users(id) on delete cascade,
    question_id bigint not null references questions(id) on delete cascade,

    section_id bigint references sections(id) on delete cascade,
    position integer,

    selected_choice choice_letter,
    reviewed boolean not null default false,
    created_at timestamptz not null default now(),

    unique (section_id, position)
);

create table messages (
    id bigint generated always as identity primary key,
    user_id bigint not null references auth.users(id) on delete cascade,
    answer_id bigint not null references answers(id) on delete cascade,
    role message_role not null,
    content text not null,
    created_at timestamptz not null default now()
);