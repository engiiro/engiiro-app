import type { PersonaKind, PublicPersona } from "../data/types";
import { cx } from "../lib/cx";
import { EmptyState } from "../components/EmptyState";
import { LikeButton } from "../components/LikeButton";
import { PersonaChip } from "../components/PersonaChip";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkeletonFeed } from "../components/Skeleton";
import "./FavoritesScreen.css";

/*
 * S7 おきにいり ＝ 大好きな人の一覧（人間の指示、2026-08-25）。
 *
 * 仕様書でいう「フォロー中一覧」（FR-FOLLOW-003）。**本人だけが見られる。**
 *
 * ★ 出していないもの：
 *   - 「誰が自分を大好きにしているか」。本人にも見せない（FR-FOLLOW-004/005、OUT-004）。
 *     0 を出すのではなく、そういう欄を作らない
 *   - 大好きにした時期。並びの手がかりになる時刻を持たせていない
 *
 * 赤ちゃんとお母さんを別の節に分ける。混ぜて並べると、隣り合った2人が
 * 同じ人のペルソナに見える並びを作ってしまうことがある（FR-PERSONA-003 の趣旨）。
 *
 * 各行から S6 へ。その場で大好きを外すこともできる（取り消せる操作なので確認は出さない）。
 */

type Section = {
  readonly kind: PersonaKind;
  readonly title: string;
  readonly personas: readonly PublicPersona[];
};

type FavoritesScreenProps = {
  readonly baby: readonly PublicPersona[];
  readonly mother: readonly PublicPersona[];
  readonly loading: boolean;
  readonly pendingId: string | null;
  readonly onOpenProfile: (personaId: string) => void;
  readonly onUnlike: (personaId: string) => void;
};

export function FavoritesScreen({
  baby,
  mother,
  loading,
  pendingId,
  onOpenProfile,
  onUnlike,
}: FavoritesScreenProps) {
  const sections: readonly Section[] = [
    { kind: "baby", title: "大好きな 赤ちゃん達", personas: baby },
    { kind: "mother", title: "大好きな お母さん達", personas: mother },
  ];
  const isEmpty = !loading && baby.length === 0 && mother.length === 0;

  return (
    <>
      <ScreenHeader title="おきにいり" />

      <div className={cx("eg-column", "eg-favorites")}>
        {loading ? <SkeletonFeed count={2} /> : null}

        {isEmpty ? (
          <EmptyState
            illustration="haven"
            lines={[
              "まだ だれも 大好きに していません。",
              "気になる子の アイコンから、その子の ページを ひらいてみる？",
            ]}
          />
        ) : null}

        {!loading && !isEmpty
          ? sections.map((section) => (
              <section key={section.kind} className="eg-favorites__section">
                <h2 className={cx("eg-favorites__title", "t-heading", "is-" + section.kind)}>
                  {section.title}
                  {/* 数は「大好きにした数」。大好きされた数ではない（FR-FOLLOW-005） */}
                  <span className={cx("eg-favorites__count", "t-metric")}>
                    {section.personas.length}
                  </span>
                </h2>

                {section.personas.length === 0 ? (
                  <p className={cx("eg-favorites__none", "t-caption")}>
                    {section.kind === "baby"
                      ? "大好きな 赤ちゃんは まだ いません。"
                      : "大好きな お母さんは まだ いません。"}
                  </p>
                ) : (
                  <ul className="eg-favorites__list">
                    {section.personas.map((persona) => (
                      <li key={persona.id} className="eg-favorites__row">
                        <PersonaChip persona={persona} onOpenProfile={onOpenProfile} />
                        <LikeButton
                          liked
                          kind={persona.kind}
                          nickname={persona.nickname}
                          pending={pendingId === persona.id}
                          onToggle={() => onUnlike(persona.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          : null}
      </div>
    </>
  );
}
