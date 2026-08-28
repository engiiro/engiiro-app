-- Up Migration

-- 投稿・あやすごとの推定度合い（ai/src/style_classifier.pyのナイーブベイズ判定を
-- 月齢へ換算した値）を、投稿・あやすの行自体に保存する。
--
-- 人間監督の決定（2026-08-28）：プロフィールに出す「赤ちゃん度・お母さん度」は
-- 「直近15件の平均」と「リアクション上位15件の平均」を1:1で平均して算出する。
-- リアクションは投稿後に増えていくため、保存時に1回だけ計算して丸め込む
-- persona_age_estimates（累積平均）方式ではリアクション数を反映できない。
-- 表示のたびにこの列を使って計算し直す方式へ変える。
alter table posts add column estimated_age numeric(4, 1);
alter table comments add column estimated_age numeric(4, 1);

-- Down Migration

alter table comments drop column if exists estimated_age;
alter table posts drop column if exists estimated_age;
