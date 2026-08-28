import type { PersonaKind } from "../data/types";
import { cx } from "../lib/cx";
import { IconHeart } from "./icons";
import "./LikeButton.css";

/*
 * 「大好き」ボタン（人間の指示、2026-08-25）。仕様上のフォローにあたる（FR-FOLLOW-001/002）。
 *
 * - ペルソナ単位。赤ちゃんとお母さんを別々に付け外しできる（FR-FOLLOW-001）
 * - 一方向。相手の承認を待つ状態を作らない（FR-FOLLOW-002）
 * - 取り消せる操作なので確認ダイアログを出さない（DESIGN.md §4 バブルの削除）
 *
 * ★ ここから「何人に大好きされているか」を出さない。本人にも他人にも
 *   （FR-FOLLOW-004/005、OUT-004）。数を置く props をそもそも作っていない。
 *
 * 後から画像を差し込む前提（人間の指示）。いまは仮のハートで、
 * 押した状態は 色・塗り・文字の3つで示す（色だけに意味を持たせない。DESIGN.md §2.5）。
 */

export function LikeButton({
  liked,
  kind,
  nickname,
  pending,
  onToggle,
}: {
  readonly liked: boolean;
  readonly kind: PersonaKind;
  /** 読み上げ用。どのペルソナへの操作かをボタン単体で分かるようにする */
  readonly nickname: string;
  readonly pending?: boolean;
  readonly onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={cx("eg-like", "eg-touch", "t-label", "is-" + kind, liked && "is-liked")}
      aria-pressed={liked}
      aria-label={(liked ? "大好きを やめる" : "大好きにする") + "：" + nickname}
      disabled={pending}
      onClick={() => onToggle(!liked)}
    >
      <IconHeart className="eg-like__icon" />
      <span className="eg-like__label">{liked ? "大好き" : "大好きにする"}</span>
    </button>
  );
}
