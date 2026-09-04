import { useCallback, useRef } from "react";

/*
 * 壊されないための最低限（frontend 完結、2026-08-28）。
 *
 * ここで守るのは2つだけ。
 *   1. 連打・多重送信 … 同じ操作が往復中にもう一度飛ぶのを止める／短時間の連打を間引く
 *   2. 巨大入力       … 貼り付けで数十万文字が入り、描画と AI 呼び出しが固まるのを止める
 *
 * ★ これは「安全対策」ではない。frontend の値はいくらでも書き換えられるので、
 *   悪意ある送信そのものは backend でしか止められない。ここが受け持つのは
 *   **ふつうに使っている画面が壊れないこと**（誤操作の連打・貼り付け事故）まで。
 *   backend 側の上限・レート制限を、ここの数字で置きかえたつもりにならない。
 * ★ 上限はどれも仕様の上限（BUBBLE_MAX_LENGTH など）より十分に大きく取る。
 *   仕様の上限は「保存を止める／カウンタで知らせる」で扱う決まりなので
 *   （data/constants.ts、DESIGN.md §4 文字数カウンタ）、ここが先に入力を切ると
 *   その作法を壊してしまう。ここは事故の桁にだけ効く。
 */

/**
 * 本文欄に入れておける文字数の天井（コードポイント）。
 * バブルの上限 150 の十数倍。ふつうに書いていて当たることはない。
 */
export const INPUT_HARD_MAX = 2000;

/**
 * 1行の入力欄（components/TextField.tsx）の天井。
 * ニックネーム 20・自己紹介 40 のどちらより十分に大きい。
 */
export const FIELD_HARD_MAX = 200;

/** 天井を超えた分を落とす。サロゲートペアを割らないようコードポイントで数える */
export function capInput(text: string, max: number = INPUT_HARD_MAX): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

/**
 * 同じ操作の多重送信を止める。
 *
 * ★ ボタンの disabled だけでは足りない。disabled は state の反映待ちなので、
 *   同じフレームに2回届いたクリックは両方とも通ってしまう。ref は即座に立つ。
 * ★ 走っている間に来た呼び出しは黙って捨てる（並べて後で流したりしない）。
 *   投稿もリアクションも、取りこぼしより二重送信のほうが困る。
 */
export function useSingleFlight(): (task: () => Promise<unknown> | unknown) => Promise<void> {
  const busyRef = useRef(false);
  return useCallback(async (task: () => Promise<unknown> | unknown) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      await task();
    } finally {
      busyRef.current = false;
    }
  }, []);
}

/**
 * 短い時間に何回まで通すか（リアクションのような、連続で押せる操作用）。
 *
 * 返るのは「いま通してよいか」を返す関数。false のときは呼び出し側で
 * 一言出して捨てる（黙って消すと、押したのに何も起きないだけの画面になる）。
 */
export function useBurstLimit(capacity: number, windowMs: number): () => boolean {
  const stampsRef = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    const recent = stampsRef.current.filter((at) => now - at < windowMs);
    if (recent.length >= capacity) {
      stampsRef.current = recent;
      return false;
    }
    recent.push(now);
    stampsRef.current = recent;
    return true;
  }, [capacity, windowMs]);
}
