-- Up Migration
-- docs/design_doc.md 6.2章のDDLをそのまま適用する。
-- テーブル・制約の意図はdesign_doc.md 6.1章（ER図）・6.3章（テーブル定義）を参照。

create extension if not exists pgcrypto; -- gen_random_uuid() を使うため

create table accounts (
    id            uuid primary key default gen_random_uuid(),
    login_id      varchar(50)  not null unique,
    password_hash varchar(255) not null,
    birth_date    date         not null,
    created_at    timestamptz  not null default now()
);

create table baby_personas (
    id         uuid primary key default gen_random_uuid(),
    account_id uuid         not null unique references accounts (id),
    nickname   varchar(50)  not null,
    bio        text,
    created_at timestamptz  not null default now()
);

create table mother_personas (
    id         uuid primary key default gen_random_uuid(),
    account_id uuid         not null unique references accounts (id),
    nickname   varchar(50)  not null,
    bio        text,
    created_at timestamptz  not null default now()
);

create table stamps (
    id         uuid primary key default gen_random_uuid(),
    name       varchar(50) not null,
    image_url  text        not null,
    created_at timestamptz not null default now()
);

create table posts (
    id              uuid primary key default gen_random_uuid(),
    baby_persona_id uuid        not null references baby_personas (id),
    body            varchar(150) not null,
    deleted_at      timestamptz,
    created_at      timestamptz not null default now()
);

create table post_stamps (
    id       uuid primary key default gen_random_uuid(),
    post_id  uuid    not null references posts (id),
    stamp_id uuid    not null references stamps (id),
    position integer
);

create table comments (
    id                  uuid primary key default gen_random_uuid(),
    post_id             uuid        not null references posts (id),
    persona_type        varchar(6)  not null check (persona_type in ('baby', 'mother')),
    baby_persona_id     uuid references baby_personas (id),
    mother_persona_id   uuid references mother_personas (id),
    reply_to_comment_id uuid references comments (id),
    body                text        not null,
    deleted_at          timestamptz,
    created_at          timestamptz not null default now(),
    -- persona_type='baby' なら baby_persona_id のみ、'mother' なら mother_persona_id のみが埋まる
    constraint comments_persona_exclusive check (
        (persona_type = 'baby'   and baby_persona_id   is not null and mother_persona_id is null) or
        (persona_type = 'mother' and mother_persona_id is not null and baby_persona_id   is null)
    )
);

create table reactions (
    id                 uuid primary key default gen_random_uuid(),
    target_type        varchar(7)  not null check (target_type in ('post', 'comment')),
    target_post_id     uuid references posts (id),
    target_comment_id  uuid references comments (id),
    reactor_account_id uuid        not null references accounts (id),
    type               varchar(10) not null check (type in ('ogya', 'yoshiyoshi', 'manma', 'babu')),
    created_at         timestamptz not null default now(),
    -- target_type='post' なら target_post_id のみ、'comment' なら target_comment_id のみが埋まる
    constraint reactions_target_exclusive check (
        (target_type = 'post'    and target_post_id    is not null and target_comment_id is null) or
        (target_type = 'comment' and target_comment_id is not null and target_post_id    is null)
    )
);

-- 同一利用者・同一対象・同一種類のリアクションは5件まで（FR-REACT-010〜011）。
-- 集計を伴う制約はCHECK制約単体では書けないため、INSERT前トリガーで検査する。
create or replace function reactions_enforce_limit() returns trigger as $$
declare
    current_count integer;
begin
    select count(*) into current_count
    from reactions
    where reactor_account_id = new.reactor_account_id
      and target_type = new.target_type
      and target_post_id is not distinct from new.target_post_id
      and target_comment_id is not distinct from new.target_comment_id
      and type = new.type;

    if current_count >= 5 then
        raise exception 'reaction limit exceeded: max 5 per reactor/target/type (FR-REACT-011)';
    end if;

    return new;
end;
$$ language plpgsql;

create trigger reactions_limit_check
    before insert on reactions
    for each row
    execute function reactions_enforce_limit();

create table follows (
    id                   uuid primary key default gen_random_uuid(),
    follower_account_id  uuid        not null references accounts (id),
    target_persona_type  varchar(6)  not null check (target_persona_type in ('baby', 'mother')),
    target_persona_id    uuid        not null,
    created_at           timestamptz not null default now(),
    unique (follower_account_id, target_persona_type, target_persona_id)
);

create table persona_age_estimates (
    persona_type  varchar(6)   not null check (persona_type in ('baby', 'mother')),
    persona_id    uuid         not null,
    estimated_age numeric(4,1),
    sample_count  integer      not null default 0,
    updated_at    timestamptz  not null default now(),
    primary key (persona_type, persona_id)
);

-- Down Migration
-- 作成した順と逆順に削除する（外部キーの依存関係があるため）。
-- pgcryptoは他のマイグレーションでも使う可能性があるためdropしない。

drop table persona_age_estimates;
drop table follows;
drop trigger reactions_limit_check on reactions;
drop function reactions_enforce_limit();
drop table reactions;
drop table comments;
drop table post_stamps;
drop table posts;
drop table stamps;
drop table mother_personas;
drop table baby_personas;
drop table accounts;
