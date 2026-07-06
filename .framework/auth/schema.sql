create schema auth;

create table auth.users (
    id bigint generated always as identity primary key,
    name text not null,
    email text not null,
    email_verified boolean not null default false,
    image text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table auth.sessions (
    id bigint generated always as identity primary key,
    user_id bigint not null references auth.users on delete cascade,
    token text not null,
    expires_at timestamptz not null,
    ip_address text,
    user_agent text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table auth.accounts (
    id bigint generated always as identity primary key,
    user_id bigint not null references auth.users on delete cascade,
    account_id text not null,
    provider_id text not null,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamptz,
    refresh_token_expires_at timestamptz,
    scope text,
    id_token text,
    password text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table auth.verifications (
    id bigint generated always as identity primary key,
    identifier text not null,
    value text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);