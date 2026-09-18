"""
学習用データ（`data/` ディレクトリ配下の JSON ファイル）を読み込むモジュール。

このプロジェクトの `data/` ディレクトリには、次の3つのサブディレクトリがある。

    data/
    ├── 赤ちゃん/   ... 赤ちゃん言葉の文章サンプルを集めた JSON ファイルを置く
    ├── お母さん/   ... お母さん言葉の文章サンプルを集めた JSON ファイルを置く
    └── その他/     ... どちらでもない、普通の文章サンプルを集めた JSON ファイルを置く

それぞれのディレクトリの中には、好きな数だけ JSON ファイルを置くことができる
（1ファイルにまとめてもいいし、話者ごと・収集日ごとなどに分けて複数ファイルに
してもよい）。このモジュールは、各ディレクトリの中身を「まとめて」読み込む。

JSON ファイル1つの中身は、文章（文字列）の配列にする。

    [
        "ばぶー ねむいよぉ",
        "おぎゃー おなかすいたでちゅ"
    ]
"""

from __future__ import annotations

import json
from pathlib import Path

# このファイル（data_loader.py）から見て、1つ上の階層にある data/ ディレクトリを指す。
# こう書いておくと、どのディレクトリから `python` コマンドを実行しても
# 正しく data/ を見つけられる（実行時のカレントディレクトリに依存しない）。
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = _PROJECT_ROOT / "data"

# 分類したい3つのクラスの名前。ディレクトリ名と一致させている。
CLASS_NAMES: tuple[str, ...] = ("赤ちゃん", "お母さん", "その他")


def _load_texts_from_directory(directory: Path) -> list[str]:
    """
    1つのディレクトリの中にある *.json ファイルをすべて読み込み、
    文章（文字列）のリストにまとめて返す。

    - ディレクトリ自体が存在しない場合は、空リストを返す（エラーにはしない）。
    - JSON ファイルの中身が配列でなかったり、壊れていたりする場合はスキップし、
      どのファイルが問題だったかを警告として表示する（全体の読み込みは止めない）。
    """
    texts: list[str] = []

    if not directory.exists():
        return texts

    for json_path in sorted(directory.glob("*.json")):
        try:
            with json_path.open(encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as error:
            print(f"[警告] {json_path} を読み込めませんでした: {error}")
            continue

        if not isinstance(data, list):
            print(f"[警告] {json_path} の中身が配列ではありません。スキップします。")
            continue

        # 文字列の要素だけを採用する（万一、数値やオブジェクトが混ざっていても壊れないようにする）。
        texts.extend(item for item in data if isinstance(item, str) and item.strip())

    return texts


def load_training_data() -> dict[str, list[str]]:
    """
    3クラスぶんの学習データを、まとめて辞書として読み込む。

    戻り値の例:
        {
            "赤ちゃん": ["ばぶー ねむいよぉ", "おぎゃー おなかすいたでちゅ", ...],
            "お母さん": ["よしよし、えらいね", ...],
            "その他":   ["本日の会議は15時からです。", ...],
        }
    """
    return {
        class_name: _load_texts_from_directory(_DATA_DIR / class_name)
        for class_name in CLASS_NAMES
    }


if __name__ == "__main__":
    # このファイルを直接実行した（`python app/data_loader.py`）ときだけ動くコード。
    # 実際に data/ 配下から何件のデータが読み込めているかを確認するための、動作確認用のコード。
    dataset = load_training_data()
    for class_name, texts in dataset.items():
        print(f"[{class_name}] {len(texts)} 件")
        for text in texts[:3]:
            print(f"  例: {text}")
