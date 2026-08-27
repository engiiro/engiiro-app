-- Up Migration
-- スタンプカタログの初期データ。id（スラッグ）は
-- engiiro-app-feat-ui-profile/frontend/app/public/data/stamps.json および
-- components/BubbleBody.tsx の StampShape が対応している絵柄と一致させる。
-- image_urlは絵柄をSVGコンポーネントとして描画するfrontend側では未使用のため、
-- プレースホルダーの値を入れる。

insert into stamps (id, name, image_url) values
    ('nemui',    'ねむい',       '/stamps/nemui.svg'),
    ('ogya',     'おぎゃー',     '/stamps/ogya.svg'),
    ('bottle',   'ほにゅうびん', '/stamps/bottle.svg'),
    ('pacifier', 'おしゃぶり',   '/stamps/pacifier.svg'),
    ('heart',    'すき',         '/stamps/heart.svg'),
    ('star',     'きらきら',     '/stamps/star.svg'),
    ('cloud',    'もやもや',     '/stamps/cloud.svg'),
    ('drop',     'ぽろり',       '/stamps/drop.svg');

-- Down Migration

delete from stamps where id in
    ('nemui', 'ogya', 'bottle', 'pacifier', 'heart', 'star', 'cloud', 'drop');
