-- Up Migration
-- スタンプカタログを frontend の実素材に合わせ直す（人間の指摘 2026-08-28）。
--
-- 症状：デプロイ環境でスタンプの絵が出ず、壊れた画像アイコンと404になる。
--
-- 原因：カタログの正本が2つに割れていた。
--   frontend がモックだったころは public/data/stamps.json（12件・/images/stamps/<id>.png）を
--   読んでいたが、実API接続（8ab8d22）以降は GET /api/stamps ＝ この stamps テーブルを見る。
--   テーブルには 1787810399037_seed-stamps.sql が入れた別物（8件・/stamps/<id>.svg）が
--   入っており、その SVG は frontend の public 配下に存在しない。
--   ローカルで見えていたのは、古いモックのカタログが残っていた画面だけ。
--
-- あわせて shelf（スタンプの棚）を持たせる。
--   frontend は棚ごとにタブを出す（data/stampCatalog.ts の STAMP_SHELVES）が、
--   応答に shelf が無いため全件が「へんじ」1つに落ちていた。
--
-- image_url はフロントのオリジンからの絶対パス。frontend/app/public/images/stamps/ に
-- 同名の PNG が置いてある（全て小文字。大文字小文字を区別する環境でも一致する）。

alter table stamps add column shelf varchar(20) not null default 'reply';
alter table stamps add column sort_order integer not null default 0;

-- 棚の中の並びは sort_order が決める。created_at は同一トランザクションで同値になるため
-- 並び順の根拠にできない。
insert into stamps (id, name, image_url, shelf, sort_order) values
    ('naku',    'ないちゃう', '/images/stamps/naku.png',    'weak',   10),
    ('akubi',   'あくび',     '/images/stamps/akubi.png',   'weak',   20),
    ('hoshii',  'ほしい',     '/images/stamps/hoshii.png',  'weak',   30),
    ('banzai',  'ばんざい',   '/images/stamps/banzai.png',  'glad',   40),
    ('niko',    'にこにこ',   '/images/stamps/niko.png',    'glad',   50),
    ('suki',    'すき',       '/images/stamps/suki.png',    'glad',   60),
    ('wakaru',  'わかる',     '/images/stamps/wakaru.png',  'soothe', 70),
    ('ganbare', 'がんばれ',   '/images/stamps/ganbare.png', 'soothe', 80),
    ('arigato', 'ありがとう', '/images/stamps/arigato.png', 'soothe', 90),
    ('ryokai',  'りょうかい', '/images/stamps/ryokai.png',  'reply',  100),
    ('bikkuri', 'びっくり',   '/images/stamps/bikkuri.png', 'reply',  110),
    ('gomen',   'ごめんね',   '/images/stamps/gomen.png',   'reply',  120)
on conflict (id) do update set
    name       = excluded.name,
    image_url  = excluded.image_url,
    shelf      = excluded.shelf,
    sort_order = excluded.sort_order;

-- 前の seed が入れたプレースホルダー。post_stamps から参照されているものは残す
-- （参照があるのに消すと外部キーで落ちる。利用者の投稿を巻き添えにしない）。
delete from stamps
 where id in ('nemui', 'ogya', 'bottle', 'pacifier', 'heart', 'star', 'cloud', 'drop')
   and not exists (
       select 1 from post_stamps where post_stamps.stamp_id = stamps.id
   );

-- Down Migration

delete from stamps
 where id in (
       'naku', 'akubi', 'hoshii', 'banzai', 'niko', 'suki',
       'wakaru', 'ganbare', 'arigato', 'ryokai', 'bikkuri', 'gomen'
   )
   and not exists (
       select 1 from post_stamps where post_stamps.stamp_id = stamps.id
   );

insert into stamps (id, name, image_url) values
    ('nemui',    'ねむい',       '/stamps/nemui.svg'),
    ('ogya',     'おぎゃー',     '/stamps/ogya.svg'),
    ('bottle',   'ほにゅうびん', '/stamps/bottle.svg'),
    ('pacifier', 'おしゃぶり',   '/stamps/pacifier.svg'),
    ('heart',    'すき',         '/stamps/heart.svg'),
    ('star',     'きらきら',     '/stamps/star.svg'),
    ('cloud',    'もやもや',     '/stamps/cloud.svg'),
    ('drop',     'ぽろり',       '/stamps/drop.svg')
on conflict (id) do nothing;

alter table stamps drop column sort_order;
alter table stamps drop column shelf;
