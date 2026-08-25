import { THEME_CHOICES, THEME_LABEL } from "../lib/useTheme";
import type { ThemeChoice } from "../lib/useTheme";
import { cx } from "../lib/cx";
import "./MockControls.css";

/*
 * モックの操作帯。製品の UI ではない。
 *
 * 3テーマを並べて見比べるための切替と、画面だけでは作り出せない状態
 * （AI 停止中・フィードの読み込み中・フィードが空）を出すためのスイッチ。
 *
 * AI は「評価」と「生成」で止まったときの振る舞いが違うので、別々に落とせる
 * （PO 回答 2026-08-25、Issue #19）。評価が落ちると投稿できない。生成は投稿に影響しない。
 * 実 API に差し替えるときに、この帯ごと外す。
 */

export type FeedMode = "normal" | "loading" | "empty";

const FEED_MODES: readonly { readonly value: FeedMode; readonly label: string }[] = [
  { value: "normal", label: "ふつう" },
  { value: "loading", label: "読み込み中" },
  { value: "empty", label: "空" },
];

type MockControlsProps = {
  readonly theme: ThemeChoice;
  readonly onThemeChange: (theme: ThemeChoice) => void;
  readonly aiEvaluateAvailable: boolean;
  readonly onAiEvaluateChange: (available: boolean) => void;
  readonly aiTransformAvailable: boolean;
  readonly onAiTransformChange: (available: boolean) => void;
  readonly feedMode: FeedMode;
  readonly onFeedModeChange: (mode: FeedMode) => void;
};

export function MockControls({
  theme,
  onThemeChange,
  aiEvaluateAvailable,
  onAiEvaluateChange,
  aiTransformAvailable,
  onAiTransformChange,
  feedMode,
  onFeedModeChange,
}: MockControlsProps) {
  return (
    <div className="eg-mock">
      <div className="eg-mock__inner">
        <p className={cx("eg-mock__caption", "t-caption")}>
          モック操作（製品の画面ではありません）
        </p>

        <div className="eg-mock__group">
          <span className={cx("eg-mock__label", "t-label")}>テーマ</span>
          <div className="eg-mock__seg">
            {THEME_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={theme === choice}
                className={cx("eg-mock__button", "t-label")}
                onClick={() => onThemeChange(choice)}
              >
                {THEME_LABEL[choice]}
              </button>
            ))}
          </div>
        </div>

        <AliveSwitch
          label="AI評価"
          available={aiEvaluateAvailable}
          onChange={onAiEvaluateChange}
        />

        <AliveSwitch
          label="AI生成"
          available={aiTransformAvailable}
          onChange={onAiTransformChange}
        />

        <div className="eg-mock__group">
          <span className={cx("eg-mock__label", "t-label")}>フィード</span>
          <div className="eg-mock__seg">
            {FEED_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                aria-pressed={feedMode === mode.value}
                className={cx("eg-mock__button", "t-label")}
                onClick={() => onFeedModeChange(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AliveSwitch({
  label,
  available,
  onChange,
}: {
  readonly label: string;
  readonly available: boolean;
  readonly onChange: (available: boolean) => void;
}) {
  return (
    <div className="eg-mock__group">
      <span className={cx("eg-mock__label", "t-label")}>{label}</span>
      <div className="eg-mock__seg">
        <button
          type="button"
          aria-pressed={available}
          className={cx("eg-mock__button", "t-label")}
          onClick={() => onChange(true)}
        >
          稼働
        </button>
        <button
          type="button"
          aria-pressed={!available}
          className={cx("eg-mock__button", "t-label")}
          onClick={() => onChange(false)}
        >
          停止
        </button>
      </div>
    </div>
  );
}
