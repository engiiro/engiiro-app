"""文体のナイーブベイズを確かめる。

いちばん大事なのは次の2つ。

  1. **判定側（素のPython）が、学習側（scikit-learn）と同じ値を出すこと。**
     ここがずれると、学習で測った成績と本番の挙動が食い違う。
  2. **手がかりが無い文を「予測」として扱わないこと。**
     一致するN-gramが無いと事前確率がそのまま返る。実測で確認した。
"""

import json
import sys
from pathlib import Path

import pytest

AI_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_DIR))

import style_model as S


@pytest.fixture(scope="module")
def samples():
    return S.load_samples()


@pytest.fixture(scope="module")
def model(samples):
    return S.train(samples)


# ============================================================
# 学習側と判定側が一致すること
# ============================================================

def test_文字N_gramがscikit_learnと同じに割れる():
    """空白のたたみ込みまで合わせてある。片方だけ変えると成績が変わる。"""
    from sklearn.feature_extraction.text import CountVectorizer

    texts = ["ねむいのー。", "おしごと  つらいでちゅ。", "React.js が 壊れた",
             "空白\tと\n改行"]
    for text in texts:
        vectorizer = CountVectorizer(analyzer="char",
                                     ngram_range=(S.NGRAM_MIN, S.NGRAM_MAX),
                                     lowercase=False)
        vectorizer.fit([text])
        assert set(vectorizer.vocabulary_) == set(S.char_ngrams(text)), text


def test_短すぎる文はN_gramが作れない(model):
    """1文字の投稿。scikit-learn 側は学習できずに例外になる長さ。

    判定側は例外にせず、「手がかりが無い」として返すこと。
    """
    assert S.char_ngrams("あ") == []
    result = S.predict("あ", model)
    assert result["matched"] == 0
    assert result["confident"] is False


def test_判定側の確率がscikit_learnと一致する(samples, model):
    """**素のPythonで解き直した値が、学習器の出力と合うこと。**

    ここがずれていたら、判定APIは学習していない別のモデルで動くことになる。
    """
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.naive_bayes import MultinomialNB

    vectorizer = CountVectorizer(analyzer="char",
                                 ngram_range=(S.NGRAM_MIN, S.NGRAM_MAX),
                                 lowercase=False)
    features = vectorizer.fit_transform(s["text"] for s in samples)
    reference = MultinomialNB().fit(features, [s["persona"] for s in samples])

    probes = ["ねむいのー。", "よしよし、できたね。", "デプロイが失敗しました。",
              "おなか いたいんだもん。", "そろそろ寝るか。", "ぷりん たべちゃったのー。"]
    for text in probes:
        expected = reference.predict_proba(vectorizer.transform([text]))[0]
        got = S.predict(text, model)
        for index, name in enumerate(model["classes"]):
            assert got["scores"][name] == pytest.approx(expected[index], abs=1e-6), text


def test_保存して読み直しても同じ結果(model, tmp_path):
    path = tmp_path / "model.json"
    S.save(model, path)
    reloaded = S.load(path)
    for text in ["ねむいのー。", "デプロイが失敗しました。"]:
        assert S.predict(text, reloaded) == S.predict(text, model)


def test_pickleを使わない(model, tmp_path):
    """読み込みでコードが動く形式を、判定の経路へ置かない。"""
    path = tmp_path / "model.json"
    S.save(model, path)
    json.loads(path.read_text(encoding="utf-8"))  # JSONとして読めること


# ============================================================
# 手がかりが無いとき
# ============================================================

def test_一致が無ければ事前確率がそのまま返る(model):
    """**当てずっぽうを予測として扱わない。**

    学習データに無い文字だけの文は、どのN-gramにも当たらない。
    """
    result = S.predict("Ω≠∮", model)
    assert result["matched"] == 0
    assert result["confident"] is False


def test_手がかりが少なければ自信なしにする(model):
    """短い文では判断がつかない。実測で 0.5 付近が出た。"""
    weak = [S.predict(text, model) for text in ("あ。", "ん", "…")]
    assert any(not r["confident"] for r in weak)


def test_確率は合計1になる(model):
    for text in ["ねむいのー。", "Ω≠∮", "デプロイが失敗しました。"]:
        total = sum(S.predict(text, model)["scores"].values())
        assert total == pytest.approx(1.0)


def test_空文字列はValueError(model):
    for bad in ("", "   ", "\n"):
        with pytest.raises(ValueError):
            S.predict(bad, model)


# ============================================================
# 学習データの読み込み
# ============================================================

def test_学習データが読める(samples):
    assert len(samples) >= 30
    assert {s["persona"] for s in samples} == set(S.PERSONAS)


def test_ラベルが不正なら止める(tmp_path):
    path = tmp_path / "bad.tsv"
    path.write_text("text\tpersona\tage\nこんにちは\tpapa\t3\n", encoding="utf-8")
    with pytest.raises(ValueError, match="persona"):
        S.load_samples(path)


def test_列が足りなければ止める(tmp_path):
    path = tmp_path / "bad.tsv"
    path.write_text("text\tpersona\tage\nこんにちは\n", encoding="utf-8")
    with pytest.raises(ValueError, match="列"):
        S.load_samples(path)


def test_年齢は空欄でよい(tmp_path):
    path = tmp_path / "ok.tsv"
    path.write_text("text\tpersona\tage\nこんにちは\tneither\n"
                    "ねむいのー\tbaby\t2\n", encoding="utf-8")
    loaded = S.load_samples(path)
    assert loaded[0]["age"] is None
    assert loaded[1]["age"] == 2


# ============================================================
# 学習そのもの
# ============================================================

def test_同じデータからは同じモデルができる(samples):
    assert S.train(samples) == S.train(samples)


def test_学習データが空なら止める():
    with pytest.raises(ValueError):
        S.train([])


def test_重みを人が書いていない():
    """**採点基準をコードに書かない**（人間監督の決定）。

    「絵文字があれば何点」のような数値がソースに現れたら、
    学習ではなく人が決めた基準になっている。
    """
    source = (AI_DIR / "style_model.py").read_text(encoding="utf-8")
    for banned in ("絵文字", "顔文字", "敬語", "漢字"):
        assert f'"{banned}"' not in source, f"{banned} を特徴量として書いている"
