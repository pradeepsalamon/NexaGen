"""Test 17: Pydantic, jsonschema and (in apps/api) Zod agree on every fixture,
and the hand-written models match the generated schema's shape."""

from __future__ import annotations

import json
import typing
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import BaseModel, ValidationError

from app.contract import AI_CONTRACT_VERSION, CONTRACT_MODELS, ErrorCode
from tests.conftest import CONTRACT_DIR

FIXTURES = CONTRACT_DIR / "fixtures"


def _schema(name: str) -> dict:
    return json.loads((CONTRACT_DIR / f"{name}.schema.json").read_text())


def _fixtures() -> list[tuple[str, Path]]:
    return [(d.name, f) for d in sorted(FIXTURES.iterdir()) for f in sorted(d.glob("*.json"))]


def test_every_schema_has_a_model_and_fixtures() -> None:
    generated = {p.name.removesuffix(".schema.json") for p in CONTRACT_DIR.glob("*.schema.json")}
    assert generated == set(CONTRACT_MODELS)
    assert {d.name for d in FIXTURES.iterdir()} == generated


@pytest.mark.parametrize(("schema_name", "path"), _fixtures(), ids=lambda v: getattr(v, "stem", v))
def test_fixture_verdicts_agree(schema_name: str, path: Path) -> None:
    fixture = json.loads(path.read_text())
    validator = Draft202012Validator(_schema(schema_name))
    json_schema_valid = validator.is_valid(fixture["data"])
    try:
        CONTRACT_MODELS[schema_name].model_validate(fixture["data"])
        pydantic_valid = True
    except ValidationError:
        pydantic_valid = False
    assert json_schema_valid == fixture["valid"], f"jsonschema: {fixture['reason']}"
    assert pydantic_valid == fixture["valid"], f"pydantic: {fixture['reason']}"


def test_generated_schemas_are_valid_draft_2020_12() -> None:
    for name in CONTRACT_MODELS:
        Draft202012Validator.check_schema(_schema(name))


def _model_shape(model: type[BaseModel]) -> tuple[set[str], set[str]]:
    required = {n for n, f in model.model_fields.items() if f.is_required()}
    return required, set(model.model_fields)


def _walk(model: type[BaseModel], schema: dict, root: dict, path: str) -> None:
    if "$ref" in schema:
        schema = root["$defs"][schema["$ref"].split("/")[-1]]
    required, fields = _model_shape(model)
    assert set(schema.get("required", [])) == required, f"{path}: required fields differ"
    assert set(schema.get("properties", {})) == fields, f"{path}: properties differ"
    strict_model = model.model_config.get("extra") == "forbid"
    assert (schema.get("additionalProperties") is False) == strict_model, f"{path}: strictness differs"
    for name, field in model.model_fields.items():
        prop = schema["properties"][name]
        annotation = field.annotation
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            _walk(annotation, prop, root, f"{path}.{name}")
            continue
        if "enum" in prop:
            assert set(prop["enum"]) == set(typing.get_args(annotation)), f"{path}.{name}: enum values differ"
        if "const" in prop:
            assert typing.get_args(annotation) == (prop["const"],), f"{path}.{name}: literal differs"


@pytest.mark.parametrize("name", sorted(CONTRACT_MODELS))
def test_models_match_schema_shape(name: str) -> None:
    schema = _schema(name)
    _walk(CONTRACT_MODELS[name], schema, schema, name)


def test_error_codes_and_version_match_manifest() -> None:
    manifest = json.loads((CONTRACT_DIR / "manifest.json").read_text())
    assert manifest["contractVersion"] == AI_CONTRACT_VERSION
    assert set(manifest["errorCodes"]) == set(typing.get_args(ErrorCode))
    envelope = _schema("aiErrorEnvelope")
    assert set(envelope["properties"]["error"]["properties"]["code"]["enum"]) == set(typing.get_args(ErrorCode))
