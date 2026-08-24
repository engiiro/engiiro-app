import { useCallback, useEffect, useState } from "react";

/*
 * テーマの選択（DESIGN.md §8.3）。
 *
 * 既定は「OS 設定に従う」＝ data-theme 属性なし。
 * 園児UI は OS 設定から自動選択されない。利用者が明示的に選ぶテーマ。
 * 選択は localStorage に保存し、<html data-theme> に反映する。
 */

export const THEME_CHOICES = ["system", "normal", "dark", "kid"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_LABEL: Readonly<Record<ThemeChoice, string>> = {
  system: "OSに従う",
  normal: "ノーマル",
  dark: "ダーク",
  kid: "園児UI",
};

const STORAGE_KEY = "engiiro.theme";

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value !== null && (THEME_CHOICES as readonly string[]).includes(value);
}

function readStored(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    // プライベートウィンドウなどで読めないことがある。既定に落とす
    return "system";
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", choice);
}

export function useTheme(): {
  theme: ThemeChoice;
  setTheme: (choice: ThemeChoice) => void;
} {
  const [theme, setThemeState] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // 保存できなくても、この画面の間は選択を反映させる
    }
  }, []);

  return { theme, setTheme };
}
