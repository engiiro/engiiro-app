import { THEME_CHOICES, THEME_LABEL } from "../lib/useTheme";
import type { ThemeChoice } from "../lib/useTheme";
import { cx } from "../lib/cx";
import "./MockControls.css";

/*
 * モックの操作帯。製品の UI ではない。
 *
 * 3テーマを並べて見比べるための切替と、画面だけでは作り出せない状態
 * （AI 停止中・フィードの読み込み中・フィードが空）を出すためのスイッチ。
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
  readonly aiAvailable: boolean;
  readonly onAiAvailableChange: (available: boolean) => void;
  readonly feedMode: FeedMode;
  readonly onFeedModeChange: (mode: FeedMode) => void;
};

export function MockControls({
  theme,
  onThemeChange,
  aiAvailable,
  onAiAvailableChange,
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

        <div className="eg-mock__group">
          <span className={cx("eg-mock__label", "t-label")}>AI</span>
          <div className="eg-mock__seg">
            <button
              type="button"
              aria-pressed={aiAvailable}
              className={cx("eg-mock__button", "t-label")}
              onClick={() => onAiAvailableChange(true)}
            >
              稼働
            </button>
            <button
              type="button"
              aria-pressed={!aiAvailable}
              className={cx("eg-mock__button", "t-label")}
              onClick={() => onAiAvailableChange(false)}
            >
              停止
            </button>
          </div>
        </div>

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
