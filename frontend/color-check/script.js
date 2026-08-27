/*
 * script.js — 仮配色ラボ
 *
 * ここでやること：
 *   1. DESIGN.md の役割トークンを 3テーマぶん持って、ルート要素へ流し込む
 *   2. 触った値でコントラストを測り、DESIGN.md §2.2・§2.3 の条件を判定する
 *   3. 見本（app を写した部分）とイラストをテーマに追随させる
 *
 * ★ 配色の値をこのファイルで発明しない。プリセットはすべて DESIGN.md 由来。
 *   探索は「いま入っている値を1段ずつ動かす」だけにして、
 *   どこから来た色なのかが分からなくなる状態を作らない。
 */

/* ── 役割トークン。DESIGN.md frontmatter / app の tokens/theme.css と同じ ── */

const PRESETS = {
  normal: {
    label: "ノーマル（暫定値）",
    canvas: "#FFF8F1",
    surface: "#FFFDF9",
    card: "#F1E7DE",
    hairline: "#E8DED6",
    ink: "#312624",
    body: "#4A3C37",
    muted: "#6E615C",
    "accent-line": "#9B3342",
    "accent-fill": "#9B3342",
    "accent-fill-large": "#8E2F3B",
    "accent-press": "#7D2633",
    "accent-soft": "#F2E4E6",
    "on-accent": "#FFFDF9",
    baby: "#9B3342",
    "baby-soft": "#F2E4E6",
    mother: "#39704E",
    "mother-fill": "#4F8F69",
    "mother-soft": "#E3F1E9",
    success: "#39704E",
    warning: "#8C5A0C",
    error: "#8C2F1E",
  },
  dark: {
    label: "ダーク（実測値）",
    canvas: "#1A1513",
    surface: "#221B18",
    card: "#2B231F",
    hairline: "#3A302A",
    ink: "#F4EDE4",
    body: "#DCD1C6",
    muted: "#A8998E",
    "accent-line": "#E28E9C",
    "accent-fill": "#B54254",
    "accent-fill-large": "#B54254",
    "accent-press": "#C85C6D",
    "accent-soft": "#3A2226",
    "on-accent": "#FFFDF9",
    baby: "#E28E9C",
    "baby-soft": "#3A2226",
    mother: "#7FC79A",
    "mother-fill": "#6FB88C",
    "mother-soft": "#1F2E25",
    success: "#7FC79A",
    warning: "#E0B25C",
    error: "#E88A78",
  },
  kid: {
    /*
     * DESIGN.md の kid には on-accent の記載が無い。
     * 実装（tokens/theme.css）は #FFFDF9 を持っているので、そちらに合わせている。
     * success / warning / error も kid では上書きしていないので、ノーマルの値が出る。
     */
    label: "園児UI（実測値）",
    canvas: "#FFF9E3",
    surface: "#FFFFFF",
    card: "#FFF3C4",
    hairline: "#E8C84A",
    ink: "#2B211C",
    body: "#5A4A40",
    muted: "#7A675C",
    "accent-line": "#C22648",
    "accent-fill": "#C22648",
    "accent-fill-large": "#C22648",
    "accent-press": "#A31E3C",
    "accent-soft": "#FFE0E6",
    "on-accent": "#FFFDF9",
    baby: "#C22648",
    "baby-soft": "#FFE0E6",
    mother: "#2E7A50",
    "mother-fill": "#7FB069",
    "mother-soft": "#E4F3DC",
    success: "#39704E",
    warning: "#8C5A0C",
    error: "#8C2F1E",
  },
};

/*
 * DESIGN.md §2.3 の失敗例。ダークの地にノーマルの臙脂をそのまま置いた場合。
 * 「映えない」が主観ではなく計測上の事実であることを、判定で見るための案。
 */
PRESETS.darkNaive = Object.assign({}, PRESETS.dark, {
  label: "ダーク・臙脂そのまま（§2.3 の失敗例）",
  "accent-line": "#9B3342",
  "accent-fill": "#9B3342",
  "accent-fill-large": "#8E2F3B",
  "accent-press": "#7D2633",
  baby: "#9B3342",
});

/*
 * ── ダークの地の試作（DESIGN.md には無い。人間の判断待ち） ─────────────
 *
 * ★ ここだけが DESIGN.md 由来でない値。「真っ黒だけでなく紺色系も見たい」という
 *   依頼で作ったもので、採用済みの配色ではない。
 *
 * 作り方（発明を最小にするため、変えるのは7色だけ）：
 *   * 地の4色 … 色相と彩度だけを差し替え、**明度の段は DESIGN.md ダークのまま**
 *     （8.8 / 11.4 / 14.5 / 19.6%）。面の階層の作り方を変えないため
 *   * *-soft … 役割色を地に混ぜて作る（臙脂 15% / 緑 12%）。
 *     色相をずらすと臙脂が紫に、緑がオリーブに寄って役割が読めなくなる。
 *     この比率だと surface との面色差が 1.19 / 1.16 で、DESIGN.md ダークと同じ
 *   * 文字・臙脂・緑・意味色 … DESIGN.md ダークの実測値をそのまま使う
 *
 * ★ §2.3 の「地は #1A1513 の暖色寄りにして、ノーマルの生成りと同じ体温にする」
 *   という理由づけからは外れる。紺・藍は意図的に冷たい地なので、
 *   採るかどうかは人間の決定が要る。
 *
 * 5案とも §2.2・§2.3 の条件は全て満たしている（持ち上げ不要だった）。
 */
const DARK_GROUNDS = {
  darkSumi: ["墨", "#171616", "#1E1D1C", "#262524", "#343230", "#35282A", "#232B26"],
  darkTetsukon: ["鉄紺", "#141619", "#1A1D20", "#212429", "#2C3138", "#33282D", "#212B28"],
  darkKon: ["紺", "#11151C", "#161B24", "#1C222E", "#262E3E", "#30272F", "#1E2A2B"],
  darkAi: ["藍", "#12121B", "#171723", "#1D1E2D", "#27283D", "#31252E", "#1F282A"],
  darkBudou: ["葡萄", "#1A1316", "#22181D", "#2B1F25", "#3A2A32", "#38252A", "#262926"],
};

Object.entries(DARK_GROUNDS).forEach(([key, [name, canvas, surface, card, hairline, soft, motherSoft]]) => {
  PRESETS[key] = Object.assign({}, PRESETS.dark, {
    label: "ダーク・" + name + "（試作）",
    canvas: canvas,
    surface: surface,
    card: card,
    hairline: hairline,
    "accent-soft": soft,
    "baby-soft": soft,
    "mother-soft": motherSoft,
  });
});

/*
 * ── おやすみモード（人間の決定、2026-08-26） ──────────────────────────
 *
 * 「真っ暗より紺系で夜空っぽく、おやすみモード的な雰囲気」＋
 * 「このSNSは赤ちゃん側が主役。お母さんのあやすに目が奪われる」という指示から作った案。
 * ダークの既定にしている。
 *
 * 地：紺（DARK_GROUNDS.darkKon と同じ）
 *
 * 緑：**主役より弱くする**のがこの案の要。
 *   DESIGN.md のダークは mother #7FC79A が canvas 上 9.18:1 で、
 *   赤ちゃんの accent-line #E28E9C（7.48:1）より**強い**。
 *   役割としては脇役なのに、画面でいちばん明るい色になっていた。
 *   色相と彩度を保ったまま明度だけ落として 6.33:1 にし、主役との差を 1.15 つけている。
 *   mother-soft も 1段落として、あやすの地が赤ちゃんのバブルより手前に見えないようにした。
 *
 * ★ 意味色の success は DESIGN.md の #7FC79A のまま。あちらは「とどいた」の合図で、
 *   ペルソナの序列とは別の話なので、一緒に落とさない。
 *
 * ★ 残る不均衡は「面積」で、比では出ない。あやすカードは緑の枠が1周するので、
 *   赤ちゃんのバブル（枠が hairline）より広い色面を持つ。
 *   そこを直すには SootheItem.css / BubbleCard.css の構造の判断が要る（README 参照）。
 */
PRESETS.oyasumi = Object.assign({}, PRESETS.darkKon, {
  label: "おやすみ（紺・赤ちゃん主役）",
  mother: "#4AAA6E",
  "mother-fill": "#468F63",
  "mother-soft": "#1B2627",
});

/** プリセットがどのテーマの枠に入るか */
const PRESET_THEME = { normal: "normal", dark: "dark", darkNaive: "dark", kid: "kid", oyasumi: "dark" };
Object.keys(DARK_GROUNDS).forEach((key) => {
  PRESET_THEME[key] = "dark";
});

const THEME_STATUS = {
  normal: "配色は検討中。ここを決めるのが宿題（DESIGN.md §2.2）。",
  dark: "実測済みの確定候補。臙脂を線用と塗り用に割っている（§2.3）。",
  kid: "実測済み。可読性より鮮やかさを優先するテーマ（§2.4）。",
};

/* 園児UI の鮮やか色。実測済みなので編集対象にしない（DESIGN.md §2.4） */
const VIVID = [
  ["vivid-yellow", "#F4C51F"],
  ["vivid-orange", "#EF7A22"],
  ["vivid-green", "#7FB069"],
  ["vivid-pink", "#F2A0B5"],
  ["vivid-blue-deep", "#1F6B87"],
  ["vivid-purple-deep", "#6650A0"],
  ["vivid-blue-pale", "#A8D8E8"],
  ["vivid-purple-pale", "#CFC4EC"],
];

/* 役割名と用途。DESIGN.md §2.1 のトークン契約の表そのまま */
const ROLE_GROUPS = [
  {
    title: "面",
    open: true,
    roles: [
      ["canvas", "ページの地"],
      ["surface", "カード・入力欄・ヘッダの面"],
      ["card", "canvas より一段沈めた面"],
      ["hairline", "1px の枠線"],
    ],
  },
  {
    title: "文字",
    open: true,
    roles: [
      ["ink", "見出し・ニックネーム"],
      ["body", "バブル本文・あやす本文"],
      ["muted", "時刻・タグ・補足"],
    ],
  },
  {
    title: "臙脂",
    open: true,
    roles: [
      ["accent-line", "線・文字・アイコン"],
      ["accent-fill", "塗り（主ボタンの背景）"],
      ["accent-fill-large", "面積の大きい塗り"],
      ["accent-press", "押下・ホバー"],
      ["accent-soft", "活性リアクション・注記の地"],
      ["on-accent", "臙脂の塗りの上の文字"],
    ],
  },
  {
    title: "ペルソナ",
    open: false,
    roles: [
      ["baby", "赤ちゃん 文字・枠線"],
      ["baby-soft", "赤ちゃんあやすの地"],
      ["mother", "お母さん 文字・枠線"],
      ["mother-fill", "お母さん 塗り専用"],
      ["mother-soft", "お母さんあやすの地"],
    ],
  },
  {
    title: "意味色",
    open: false,
    roles: [
      ["success", "とどいた"],
      ["warning", "下書きのまま"],
      ["error", "送れなかった"],
    ],
  },
];

const ROLES = ROLE_GROUPS.flatMap((group) => group.roles.map(([name]) => name));

/* ── 色の計算 ─────────────────────────────────────────────────────── */

function normalizeHex(value) {
  const raw = String(value).trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return "#" + raw.split("").map((c) => c + c).join("").toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return "#" + raw.toUpperCase();
  }
  return null;
}

function toRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** WCAG の相対輝度 */
function luminance(hex) {
  const channels = toRgb(hex).map((value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexToHsl(hex) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }) {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const base = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.floor(hp) % 6];
  const m = lig - c / 2;
  return (
    "#" +
    base
      .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** 明度を1段動かす */
function nudge(hex, { dl = 0, ds = 0 }) {
  const hsl = hexToHsl(hex);
  return hslToHex({ h: hsl.h, s: hsl.s + ds, l: hsl.l + dl });
}

/*
 * 暖かさを1段動かす。赤と青の差だけを ±1 する。
 *
 * ★ 彩度（HSL の S）では動かさない。S が実際の RGB の振れ幅に効く度合いは
 *   (1 - |2L - 1|) に比例するので、地のように明度が端に寄った色では、
 *   S を数ポイント動かしても 1/255 に届かずまったく変わらない。
 *   ダークの地（L≈9%）がちょうどそれで、S を足す作りでは
 *   「地の暖かさ」ボタンが無反応だった。
 *   赤と青の差＝ほぼ無彩色の色がどちらに寄っているか、そのものなので、
 *   どの明度でも必ず1段動き、押し戻せば元の値に戻る。
 */
function warmStep(hex, dir) {
  const [r, g, b] = toRgb(hex);
  const clamp = (v) => Math.min(255, Math.max(0, v));
  return (
    "#" +
    [clamp(r + dir), g, clamp(b - dir)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/* ── 判定。しきい値と根拠は DESIGN.md §2.2・§2.3 ────────────────────── */

const RATIO_CHECKS = [
  {
    title: "本文が読めるか（§2.2 条件1・2）",
    rows: [
      ["ink", "canvas", 4.5, "見出し・ニックネーム"],
      ["body", "canvas", 4.5, "本文が地の上"],
      ["body", "surface", 4.5, "本文が吹き出しの上"],
      ["muted", "canvas", 4.5, "時刻・補足"],
      ["muted", "card", 4.5, "タグ・セグメント（沈めた面）"],
    ],
  },
  {
    title: "臙脂が使えるか（§2.2 条件3・4／§2.3）",
    rows: [
      ["accent-line", "canvas", 4.5, "リンク・活性・枠線"],
      ["accent-line", "surface", 4.5, "吹き出しの上の活性"],
      ["accent-line", "card", 4.5, "沈めた面の上の活性"],
      ["accent-line", "accent-soft", 4.5, "活性リアクションの文字"],
      ["on-accent", "accent-fill", 4.5, "主ボタンの文字"],
      ["on-accent", "accent-fill-large", 4.5, "全幅ボタンの文字"],
      ["accent-fill", "canvas", 3, "ボタンの輪郭が地から浮くか"],
    ],
  },
  {
    title: "ペルソナ（§2.1・§2.2）",
    rows: [
      ["baby", "canvas", 4.5, "赤ちゃんの文字・枠線"],
      ["mother", "canvas", 4.5, "お母さんの文字・枠線"],
      ["mother", "mother-soft", 4.5, "お母さんあやすの文字"],
      /*
       * mother-fill は塗り専用で、DESIGN.md はここにしきい値を置いていない。
       * 勝手に 3:1 を課すと、園児UI（2.39:1）が「不合格」に見えてしまう。
       * 測った値だけ出して、判定はしない。
       */
      ["mother-fill", "canvas", null, "塗り専用。しきい値は DESIGN.md に無い"],
    ],
  },
  {
    title: "意味色",
    rows: [
      ["success", "canvas", 4.5, "とどいた"],
      ["warning", "canvas", 4.5, "下書きのまま"],
      ["error", "canvas", 4.5, "送れなかった"],
    ],
  },
];

/** 比では測れない条件。テーマによって内容が変わるものを含む */
const RULE_CHECKS = [
  {
    name: "面積効果",
    use: "accent-fill-large は accent-fill と同じか暗い（§2.2 条件5）",
    test: (t) => luminance(t["accent-fill-large"]) <= luminance(t["accent-fill"]) + 1e-9,
  },
  {
    name: "面の階層",
    use: (theme) =>
      theme === "dark"
        ? "canvas → surface → card の順に明るくなる（影が効かないぶん面色差で作る／§2.3）"
        : "card は canvas より沈み、surface は canvas 以上（§2.1）",
    test: (t, theme) => {
      const canvas = luminance(t.canvas);
      const surface = luminance(t.surface);
      const card = luminance(t.card);
      if (theme === "dark") return canvas < surface && surface < card;
      return surface >= canvas && card < canvas;
    },
  },
  {
    /*
     * 人間の決定（2026-08-26）：「このSNSはあくまで赤ちゃん側が主役」。
     * DESIGN.md には無い条件なので、出典をここに残しておく。
     * 脇役のお母さんの緑が、主役の臙脂より地の上で強くなっていないかを見る。
     */
    name: "主役は赤ちゃん",
    use: "mother が accent-line より地の上で目立たない（人間の決定 2026-08-26）",
    test: (t) => contrast(t.mother, t.canvas) < contrast(t["accent-line"], t.canvas),
  },
  {
    name: "線と塗りを分ける",
    themes: ["dark"],
    use: "ダークでは accent-line と accent-fill が別の値になる（§2.1 の契約の要）",
    test: (t) => t["accent-line"].toUpperCase() !== t["accent-fill"].toUpperCase(),
  },
  {
    name: "純白を使わない",
    themes: ["dark"],
    use: "暗い地で滲む。ink は暖色寄りにする（§2.3）",
    test: (t) => t.ink.toUpperCase() !== "#FFFFFF",
  },
  {
    name: "純黒を使わない",
    themes: ["dark"],
    use: "ノーマルの生成りと同じ体温にする（§2.3）",
    test: (t) => t.canvas.toUpperCase() !== "#000000",
  },
];

/* ── 見本の中の SVG（app の BrandMark.tsx をそのまま写したもの） ───────── */

const BRANDMARK = [
  '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">',
  '<path d="M16 4.4c6.5 0 11.8 4 11.8 9.4 0 5.3-5.3 9.4-11.8 9.4-1.2 0-2.3-.1-3.4-.4',
  "-1.9 2.2-4.6 3.6-7.6 4.2.9-1.7 1.4-3.3 1.4-4.9-1.4-1.6-2.2-3.6-2.2-5.7 0-5.4 5.3-9.4 11.8-9.4Z\" ",
  'fill="var(--accent-soft)" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  '<circle cx="10.6" cy="13.6" r="1.5" fill="currentColor"/>',
  '<circle cx="16" cy="13.6" r="1.5" fill="currentColor"/>',
  '<circle cx="21.4" cy="13.6" r="1.5" fill="currentColor"/>',
  "</svg>",
].join("");

/*
 * イラストの置き場所。
 *
 * 素のファイルとして開くときは相対パス。1ファイルにまとめて共有するとき
 * （build_artifact.py）は外部ファイルを読み込めないので、data URI を入れた
 * CC_ILLUST が差し込まれる。どちらでも同じコードが動くようにしている。
 */
function illustSrc(theme) {
  const embedded = window.CC_ILLUST;
  if (embedded && embedded[theme]) return embedded[theme];
  return "./assets/illust/soft-bubble-haven-" + theme + ".svg";
}

/* ── 状態 ─────────────────────────────────────────────────────────── */

const root = document.documentElement;

const state = {
  theme: "dark",
  persona: "baby",
  /*
   * 赤ちゃんのバブルの枠を臙脂寄りにするか（試作）。
   * app の BubbleCard.css はいま hairline で、紺の地だとほぼ見えない。
   * 主役のバブルに枠の存在感を持たせる案を、その場で比べられるようにしてある。
   */
  babyEdge: true,
  /* テーマごとに編集中の値を持つ。切り替えても触った値が消えない */
  tokens: {
    normal: Object.assign({}, PRESETS.normal),
    /* ダークの既定は「おやすみ」（人間の決定 2026-08-26） */
    dark: Object.assign({}, PRESETS.oyasumi),
    kid: Object.assign({}, PRESETS.kid),
  },
};

function current() {
  return state.tokens[state.theme];
}

/* ── 描画 ─────────────────────────────────────────────────────────── */

const el = {
  roleGroups: document.querySelector("[data-role-groups]"),
  checks: document.querySelector("[data-checks]"),
  verdict: document.querySelector("[data-verdict]"),
  swatches: document.querySelector("[data-swatches]"),
  themeStatus: document.querySelector("[data-theme-status]"),
  vivid: document.querySelector("[data-vivid]"),
  vividStrip: document.querySelector("[data-vivid-strip]"),
  illust: document.querySelector("[data-illust]"),
  fieldLabel: document.querySelector(".pv__fieldLabel"),
};

/** 役割トークンの編集行。1度だけ組み立てて、値の更新だけを繰り返す */
function buildRoleEditors() {
  el.roleGroups.innerHTML = "";
  ROLE_GROUPS.forEach((group) => {
    const details = document.createElement("details");
    details.className = "lab__group";
    details.open = group.open;
    const summary = document.createElement("summary");
    summary.textContent = group.title;
    details.append(summary);

    group.roles.forEach(([role, use]) => {
      const row = document.createElement("div");
      row.className = "lab__row";

      const name = document.createElement("p");
      name.className = "lab__rowName";
      name.textContent = role;
      const useText = document.createElement("span");
      useText.textContent = use;
      name.append(useText);

      const picker = document.createElement("input");
      picker.type = "color";
      picker.dataset.picker = role;
      picker.setAttribute("aria-label", role + " の色");

      const text = document.createElement("input");
      text.type = "text";
      text.spellcheck = false;
      text.dataset.text = role;
      text.setAttribute("aria-label", role + " の hex");

      picker.addEventListener("input", (event) => setRole(role, event.target.value));
      text.addEventListener("change", (event) => setRole(role, event.target.value));

      row.append(name, picker, text);
      details.append(row);
    });

    el.roleGroups.append(details);
  });
}

function buildVivid() {
  el.vividStrip.innerHTML = "";
  VIVID.forEach(([name, hex]) => {
    const chip = document.createElement("div");
    chip.className = "lab__vividChip";
    chip.style.background = hex;
    /* 見本ではなく計器なので、読めるほうを機械的に選ぶ */
    chip.style.color = contrast(hex, "#000000") >= contrast(hex, "#FFFFFF") ? "#000" : "#FFF";
    chip.textContent = name.replace("vivid-", "") + " " + hex;
    el.vividStrip.append(chip);
  });
}

function renderChecks() {
  const tokens = current();
  el.checks.innerHTML = "";
  let failed = 0;
  let total = 0;

  RATIO_CHECKS.forEach((group) => {
    const box = document.createElement("div");
    box.className = "lab__checkGroup";
    const title = document.createElement("h3");
    title.textContent = group.title;
    box.append(title);

    group.rows.forEach(([fg, bg, min, use]) => {
      const ratio = contrast(tokens[fg], tokens[bg]);
      const label = fg + " / " + bg;
      const value = ratio.toFixed(2) + ":1";

      /* min が無い行は参考値。判定も件数も持たせない */
      if (min === null) {
        box.append(checkRow(label, use, value, null, "— 参考値"));
        return;
      }

      const ok = ratio >= min;
      total += 1;
      if (!ok) failed += 1;

      let grade;
      if (ratio >= 7) grade = "AAA";
      else if (ratio >= 4.5) grade = "AA";
      else if (ratio >= 3) grade = "部品可";
      else grade = "不足";

      box.append(checkRow(label, use, value, ok, ok ? "○ " + grade : "× " + min + " 必要"));
    });

    el.checks.append(box);
  });

  const ruleBox = document.createElement("div");
  ruleBox.className = "lab__checkGroup";
  const ruleTitle = document.createElement("h3");
  ruleTitle.textContent = "構造の条件";
  ruleBox.append(ruleTitle);

  RULE_CHECKS.filter((rule) => !rule.themes || rule.themes.includes(state.theme)).forEach(
    (rule) => {
      const ok = rule.test(tokens, state.theme);
      total += 1;
      if (!ok) failed += 1;
      const use = typeof rule.use === "function" ? rule.use(state.theme) : rule.use;
      ruleBox.append(checkRow(rule.name, use, "", ok, ok ? "○ 満たす" : "× 満たさない"));
    }
  );

  el.checks.append(ruleBox);

  el.verdict.textContent = failed === 0
    ? "満たさない条件はありません（" + total + "件すべて合格）"
    : failed + " 件が条件を満たしていません（全 " + total + " 件）";
  el.verdict.classList.toggle("is-ok", failed === 0);
  el.verdict.classList.toggle("is-ng", failed > 0);
}

function checkRow(name, use, ratio, ok, verdictText) {
  const row = document.createElement("div");
  row.className = "lab__check";

  const nameEl = document.createElement("span");
  nameEl.className = "lab__checkName";
  nameEl.textContent = name;
  if (use) {
    const useEl = document.createElement("span");
    useEl.textContent = use;
    nameEl.append(useEl);
  }

  const ratioEl = document.createElement("span");
  ratioEl.className = "lab__checkRatio";
  ratioEl.textContent = ratio;

  const verdictEl = document.createElement("span");
  /* ok が null の行は参考値。合否を出さない */
  verdictEl.className =
    "lab__checkVerdict " + (ok === null ? "is-info" : ok ? "is-ok" : "is-ng");
  verdictEl.textContent = verdictText;

  row.append(nameEl, ratioEl, verdictEl);
  return row;
}

function renderSwatches() {
  const tokens = current();
  el.swatches.innerHTML = "";
  ROLE_GROUPS.forEach((group) => {
    group.roles.forEach(([role, use]) => {
      const hex = tokens[role];
      const cell = document.createElement("div");
      cell.className = "pv__swatch";
      cell.style.background = hex;
      /* ここは計器。読めるほうを機械的に選ぶ（見本の色ではない） */
      cell.style.color = contrast(hex, "#000000") >= contrast(hex, "#FFFFFF") ? "#000" : "#FFF";

      const name = document.createElement("p");
      name.className = "pv__swatchName";
      name.textContent = role;

      const value = document.createElement("p");
      value.className = "pv__swatchHex";
      value.textContent = hex;

      const useEl = document.createElement("p");
      useEl.className = "pv__swatchUse";
      useEl.textContent = use;

      cell.append(name, value, useEl);
      el.swatches.append(cell);
    });
  });
}

function apply() {
  const tokens = current();

  ROLES.forEach((role) => {
    root.style.setProperty("--" + role, tokens[role]);
    const picker = document.querySelector('[data-picker="' + role + '"]');
    const text = document.querySelector('[data-text="' + role + '"]');
    if (picker) picker.value = tokens[role].toLowerCase();
    if (text) text.value = tokens[role];
  });

  root.dataset.ccTheme = state.theme;
  root.dataset.ccPersona = state.persona;
  root.dataset.ccBabyEdge = state.babyEdge ? "accent" : "hairline";

  document.querySelectorAll("[data-theme-button]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themeButton === state.theme);
    button.setAttribute("aria-pressed", String(button.dataset.themeButton === state.theme));
  });
  document.querySelectorAll("[data-persona-button]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.personaButton === state.persona);
    button.setAttribute("aria-pressed", String(button.dataset.personaButton === state.persona));
  });

  el.themeStatus.textContent = THEME_STATUS[state.theme];
  el.vivid.hidden = state.theme !== "kid";

  /*
   * イラストは <img> 越しでは CSS 変数が届かないので、テーマごとのファイルを選ぶ。
   * app の Illustration.tsx / useResolvedTheme.ts と同じ解き方。
   */
  el.illust.src = illustSrc(state.theme);

  /* 投稿は常に赤ちゃん。あやすだけ選べる（design_doc §3.2） */
  el.fieldLabel.textContent =
    state.persona === "mother" ? "あやす（お母さんとして）" : "いま言えないこと";

  renderChecks();
  renderSwatches();
}

/* ── 操作 ─────────────────────────────────────────────────────────── */

function setRole(role, value) {
  const hex = normalizeHex(value);
  if (!hex) {
    /* 読めない入力は捨てて、いまの値に戻す */
    apply();
    return;
  }
  current()[role] = hex;
  apply();
}

const GROUND = ["canvas", "surface", "card", "hairline"];

const STEPS = {
  "ground-l": (tokens, dir) => {
    GROUND.forEach((role) => {
      tokens[role] = nudge(tokens[role], { dl: 2 * dir });
    });
  },
  /* 暖かさ＝ほぼ無彩色の地が、赤と青のどちらへ寄っているか */
  "ground-warm": (tokens, dir) => {
    GROUND.forEach((role) => {
      tokens[role] = warmStep(tokens[role], dir);
    });
  },
  "line-l": (tokens, dir) => {
    tokens["accent-line"] = nudge(tokens["accent-line"], { dl: 3 * dir });
  },
  "fill-l": (tokens, dir) => {
    tokens["accent-fill"] = nudge(tokens["accent-fill"], { dl: 3 * dir });
    tokens["accent-fill-large"] = nudge(tokens["accent-fill-large"], { dl: 3 * dir });
  },
};

document.querySelectorAll("[data-theme-button]").forEach((button) => {
  button.addEventListener("click", () => {
    state.theme = button.dataset.themeButton;
    apply();
  });
});

document.querySelectorAll("[data-persona-button]").forEach((button) => {
  button.addEventListener("click", () => {
    state.persona = button.dataset.personaButton;
    apply();
  });
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.preset;
    const theme = PRESET_THEME[key];
    state.theme = theme;
    state.tokens[theme] = Object.assign({}, PRESETS[key]);
    delete state.tokens[theme].label;
    apply();
  });
});

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    STEPS[button.dataset.step](current(), Number(button.dataset.dir));
    apply();
  });
});

document.querySelector("[data-reset]").addEventListener("click", () => {
  /* ダークの「戻す」先は、いま基準にしている おやすみ にする */
  const source = state.theme === "dark" ? PRESETS.oyasumi : PRESETS[state.theme];
  state.tokens[state.theme] = Object.assign({}, source);
  delete state.tokens[state.theme].label;
  apply();
});

const babyEdgeInput = document.querySelector("[data-baby-edge]");
babyEdgeInput.checked = state.babyEdge;
babyEdgeInput.addEventListener("change", (event) => {
  state.babyEdge = event.target.checked;
  apply();
});

/* ── 起動 ─────────────────────────────────────────────────────────── */

document.querySelectorAll("[data-brandmark]").forEach((slot) => {
  slot.innerHTML = BRANDMARK;
});

Object.keys(state.tokens).forEach((theme) => delete state.tokens[theme].label);

buildRoleEditors();
buildVivid();
apply();
