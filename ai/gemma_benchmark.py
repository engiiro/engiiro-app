"""通常のPython環境でGemma方式の完了時間を計測する。

このスクリプトは、Colab上のPyTorch-onlyノートブックと同じ入力を使い、
Gemmaの依存関係import、モデル読込、推論を含むcold start時間をJSONへ保存する。
モデル品質や異なるハードウェア間の純粋な性能差は判定しない。

必要な依存関係の例:
    python -m pip install "torch>=2.4" "transformers>=4.51,<5" "accelerate>=1.4,<2"

4bitを使う場合:
    python -m pip install "bitsandbytes>=0.45,<1"

Gemmaの取得元やデプロイ先はこのスクリプトで決めない。人間が別途用意した
ローカルモデルディレクトリを読み込むだけとし、認証、ダウンロード、公開、
永続化は行わない。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from pathlib import Path
from time import perf_counter
from typing import Any, Literal


BENCHMARK_ID = "engiiro-transform-speed-v1"
BENCHMARK_CASES = [
    {
        "mode": "baby",
        "input": "今日はチームで仕様書をレビューし、未決事項を整理しました。",
    },
    {
        "mode": "mother",
        "input": "今日はチームで仕様書をレビューし、未決事項を整理しました。",
    },
]
MODE_INSTRUCTIONS = {
    "baby": "意味を保ちながら、幼い子どものような柔らかい表現へ変換してください。",
    "mother": "意味を保ちながら、見守る母親のような丁寧で温かい表現へ変換してください。",
}
REPEAT_COUNT = 3
MAX_INPUT_TOKENS = 256
MAX_NEW_TOKENS = 64
MAX_OUTPUT_CHARS = 150


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="通常Python上のGemma方式を計測し、比較可能なJSONを保存します。"
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="結果JSONの保存先。Gitへ追加しない場所を推奨します。",
    )
    parser.add_argument(
        "--model-path",
        type=Path,
        required=True,
        help="人間が別途用意したGemma互換ローカルモデルディレクトリ。",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "cpu", "cuda"),
        default="auto",
        help="autoはCUDAが利用できればCUDA、なければCPUを使います。",
    )
    parser.add_argument(
        "--four-bit",
        action="store_true",
        help="CUDA環境でbitsandbytes 4bit量子化を使います。",
    )
    parser.add_argument(
        "--compare-with",
        type=Path,
        help="PyTorch Colab方式の結果JSON。条件一致時だけ勝者を表示します。",
    )
    return parser.parse_args()


def benchmark_input_digest() -> str:
    serialized = json.dumps(
        BENCHMARK_CASES,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def select_device(torch_module: Any, requested: str) -> str:
    if requested == "auto":
        return "cuda" if torch_module.cuda.is_available() else "cpu"
    if requested == "cuda" and not torch_module.cuda.is_available():
        raise RuntimeError("--device cudaが指定されましたが、CUDAを利用できません。")
    return requested


def synchronize(torch_module: Any, device: str) -> None:
    if device == "cuda":
        torch_module.cuda.synchronize()


def load_dependencies() -> tuple[Any, Any, Any, Any]:
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from transformers import BitsAndBytesConfig
    except ImportError as exc:
        raise RuntimeError(
            "Gemma方式の依存関係が不足しています。ファイル先頭の導入例を確認してください。"
        ) from exc
    return torch, AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


def load_model(
    *,
    torch_module: Any,
    model_class: Any,
    tokenizer_class: Any,
    quantization_class: Any,
    model_path: Path,
    device: str,
    four_bit: bool,
) -> tuple[Any, Any, str]:
    if not model_path.is_dir():
        raise FileNotFoundError(f"ローカルモデルディレクトリがありません: {model_path}")
    tokenizer = tokenizer_class.from_pretrained(
        str(model_path),
        local_files_only=True,
    )
    model_kwargs: dict[str, Any] = {
        "local_files_only": True,
        "low_cpu_mem_usage": True,
    }

    if four_bit:
        if device != "cuda":
            raise RuntimeError("4bit量子化はこのスクリプトではCUDA時だけ使用できます。")
        compute_dtype = (
            torch_module.bfloat16
            if torch_module.cuda.is_bf16_supported()
            else torch_module.float16
        )
        model_kwargs.update(
            {
                "device_map": "auto",
                "quantization_config": quantization_class(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_compute_dtype=compute_dtype,
                ),
            }
        )
        dtype_name = str(compute_dtype)
    else:
        compute_dtype = (
            torch_module.bfloat16
            if device == "cuda" and torch_module.cuda.is_bf16_supported()
            else torch_module.float32
        )
        model_kwargs["torch_dtype"] = compute_dtype
        dtype_name = str(compute_dtype)

    model = model_class.from_pretrained(str(model_path), **model_kwargs)
    if not four_bit:
        model.to(device)
    model.eval()
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    return model, tokenizer, dtype_name


def generate_once(
    *,
    torch_module: Any,
    model: Any,
    tokenizer: Any,
    device: str,
    mode: Literal["baby", "mother"],
    text: str,
    retry: bool,
) -> str:
    length_instruction = (
        "前回は150文字を超えました。意味を保ち、必ず150文字以内に短くしてください。"
        if retry
        else "必ず150文字以内で出力してください。"
    )
    prompt = tokenizer.apply_chat_template(
        [
            {
                "role": "user",
                "content": (
                    f"{MODE_INSTRUCTIONS[mode]}\n{length_instruction}\n入力: {text}"
                ),
            }
        ],
        tokenize=False,
        add_generation_prompt=True,
    )
    encoded = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=MAX_INPUT_TOKENS,
        add_special_tokens=False,
    ).to(model.device)
    with torch_module.inference_mode():
        generated = model.generate(
            **encoded,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
            pad_token_id=tokenizer.pad_token_id,
        )
    new_tokens = generated[0, encoded["input_ids"].shape[1] :]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


def run_inference(
    *,
    torch_module: Any,
    model: Any,
    tokenizer: Any,
    device: str,
) -> tuple[list[dict[str, Any]], int]:
    representative_outputs: list[dict[str, Any]] = []
    retry_count = 0
    for repeat_index in range(REPEAT_COUNT):
        for case in BENCHMARK_CASES:
            output = generate_once(
                torch_module=torch_module,
                model=model,
                tokenizer=tokenizer,
                device=device,
                mode=case["mode"],
                text=case["input"],
                retry=False,
            )
            if len(output) > MAX_OUTPUT_CHARS:
                retry_count += 1
                output = generate_once(
                    torch_module=torch_module,
                    model=model,
                    tokenizer=tokenizer,
                    device=device,
                    mode=case["mode"],
                    text=case["input"],
                    retry=True,
                )
            if len(output) > MAX_OUTPUT_CHARS:
                raise RuntimeError(
                    f"再生成後も出力が{len(output)}文字です。切り捨ては行いません。"
                )
            if repeat_index == 0:
                representative_outputs.append(
                    {
                        "mode": case["mode"],
                        "input": case["input"],
                        "output": output,
                        "output_chars": len(output),
                    }
                )
    return representative_outputs, retry_count


def compare_results(current: dict[str, Any], other_path: Path) -> dict[str, Any]:
    other = json.loads(other_path.read_text(encoding="utf-8"))
    comparable_fields = ("benchmark_id", "input_digest", "repeat_count")
    mismatches = [
        field for field in comparable_fields if current.get(field) != other.get(field)
    ]
    if mismatches:
        raise ValueError(f"比較条件が一致しません: {', '.join(mismatches)}")
    if not current.get("success") or not other.get("success"):
        raise ValueError("両方式がsuccess=trueの場合だけ時間を比較できます。")

    current_seconds = float(current["timings"]["workload_seconds"])
    other_seconds = float(other["timings"]["workload_seconds"])
    difference = abs(current_seconds - other_seconds)
    winner = "tie"
    if difference > 0.01:
        winner = current["method"] if current_seconds < other_seconds else other["method"]
    return {
        "winner": winner,
        "difference_seconds": round(difference, 4),
        "basis": "cold workload_seconds",
        "warning": "異なるハードウェア間の結果は、環境と方式を合わせた実運用経路の比較です。",
    }


def write_result(path: Path, result: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    script_started_at = perf_counter()
    args = parse_args()
    dependency_started_at = perf_counter()
    torch_module, model_class, tokenizer_class, quantization_class = load_dependencies()
    dependency_import_seconds = perf_counter() - dependency_started_at
    device = select_device(torch_module, args.device)

    model_started_at = perf_counter()
    model, tokenizer, dtype_name = load_model(
        torch_module=torch_module,
        model_class=model_class,
        tokenizer_class=tokenizer_class,
        quantization_class=quantization_class,
        model_path=args.model_path,
        device=device,
        four_bit=args.four_bit,
    )
    synchronize(torch_module, device)
    model_prepare_seconds = perf_counter() - model_started_at

    inference_started_at = perf_counter()
    outputs, retry_count = run_inference(
        torch_module=torch_module,
        model=model,
        tokenizer=tokenizer,
        device=device,
    )
    synchronize(torch_module, device)
    inference_seconds = perf_counter() - inference_started_at

    result: dict[str, Any] = {
        "schema_version": 1,
        "benchmark_id": BENCHMARK_ID,
        "method": "gemma_python",
        "success": True,
        "input_digest": benchmark_input_digest(),
        "repeat_count": REPEAT_COUNT,
        "inference_calls": len(BENCHMARK_CASES) * REPEAT_COUNT + retry_count,
        "environment": {
            "python": platform.python_version(),
            "os": platform.platform(),
            "device": device,
            "gpu": torch_module.cuda.get_device_name(0) if device == "cuda" else None,
            "torch": torch_module.__version__,
            "model_name": args.model_path.name,
            "model_source": "local directory supplied at runtime",
            "four_bit": args.four_bit,
            "dtype": dtype_name,
        },
        "timings": {
            "dependency_import_seconds": round(dependency_import_seconds, 4),
            "model_prepare_seconds": round(model_prepare_seconds, 4),
            "inference_seconds": round(inference_seconds, 4),
            "workload_seconds": round(
                dependency_import_seconds
                + model_prepare_seconds
                + inference_seconds,
                4,
            ),
            "end_to_end_seconds": round(perf_counter() - script_started_at, 4),
        },
        "outputs": outputs,
        "quality_evaluated": False,
        "comparison_scope": "cold workflow completion time, not model quality",
    }
    write_result(args.output, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.compare_with:
        comparison = compare_results(result, args.compare_with)
        print(json.dumps({"comparison": comparison}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
