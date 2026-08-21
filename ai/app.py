"""
docs/design_doc.md 7章のAI推論API（評価・変換）のエントリーポイント。
Hugging Face Spaces（Docker SDK）にそのままデプロイする想定。
"""

from fastapi import FastAPI
from pydantic import BaseModel

from src.evaluate import evaluate
from src.transform import transform

app = FastAPI(title="engiiro-app AI service")


class EvaluateRequest(BaseModel):
    body: str
    personaType: str  # "baby" | "mother"


class EvaluateResponse(BaseModel):
    estimatedAge: float


class TransformRequest(BaseModel):
    body: str
    style: str  # "baby" | "mother"


class TransformResponse(BaseModel):
    transformedText: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/evaluate", response_model=EvaluateResponse)
def post_evaluate(req: EvaluateRequest):
    estimated_age = evaluate(req.body, req.personaType)
    return EvaluateResponse(estimatedAge=estimated_age)


@app.post("/transform", response_model=TransformResponse)
def post_transform(req: TransformRequest):
    transformed_text = transform(req.body, req.style)
    return TransformResponse(transformedText=transformed_text)
