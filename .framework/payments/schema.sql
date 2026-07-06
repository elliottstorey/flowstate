create schema payments;

create table payments.customers (
    id text primary key,
    user_id bigint not null references auth.users(id) on delete cascade
);

create table payments.subscriptions (
    id text primary key,
    customer_id text not null references payments.customers(id) on delete cascade,
    stripe_price_id text not null,
    status text not null,
    current_period_start timestamptz not null,
    current_period_end timestamptz not null,
    cancel_at_period_end boolean not null default false
);

create table payments.webhook_events (
    id text primary key,
    type text not null,
    processed_at timestamptz default now()
);