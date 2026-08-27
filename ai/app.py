"""
docs/design_doc.md 7章のAI推論API（評価・変換）のエントリーポイント。
Hugging Face Spaces（Docker SDK）にそのままデプロイする想定。
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from src.evaluate import evaluate
from src.style_classifier import get_classifier, passes_threshold
from src.transform import transform


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 初回リクエストで学習コストを払わないよう、起動時に一度だけ学習させておく。
    get_classifier()
    yield


app = FastAPI(title="engiiro-app AI service", lifespan=lifespan)


class EvaluateRequest(BaseModel):
    body: str
    personaType: str  # "baby" | "mother"


class EvaluateResponse(BaseModel):
    estimatedAge: float
    passesThreshold: bool


class TransformRequest(BaseModel):
    body: str
    style: str  # "baby" | "mother"


class TransformResponse(BaseModel):
    # docs/design_doc.md 7章の確定仕様（2026-08-27、action は allow/block の
    # 2値に統一）に合わせる。ai/src/transform.py の TransformResult と同じ形。
    action: str  # "allow" | "block"
    transformedText: str | None
    reasonCodes: list[str]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/evaluate", response_model=EvaluateResponse)
def post_evaluate(req: EvaluateRequest):
    estimated_age = evaluate(req.body, req.personaType)
    passes = passes_threshold(req.body, req.personaType)
    return EvaluateResponse(estimatedAge=estimated_age, passesThreshold=passes)


@app.post("/transform", response_model=TransformResponse)
def post_transform(req: TransformRequest):
    result = transform(req.body, req.style)
    return TransformResponse(**result)
