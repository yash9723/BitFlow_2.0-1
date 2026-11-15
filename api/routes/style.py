"""
routes/style.py — industry-style lint and formatting with Verible (chipsalliance/verible).

  POST /style/lint    {files: [{name, content}]} -> {ok, issues: [{file, line, col, endCol, rule, severity, message}]}
  POST /style/format  {source, name?}            -> {ok, formatted} | {ok: false, error}

Verible checks style (naming, always_comb/always_ff, default cases, parameter types...);
Verilator lint (sandbox._lint_design) stays the semantic check. Neither ever affects a
simulation or a grade. Rules: api/verible.rules. Runs under the same sandbox limits as
everything else, with its own small pool so typing never waits behind simulations.
"""

from __future__ import annotations

import asyncio
import os
import re
import subprocess

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.config import settings
from api.jwt_auth import verify_jwt
from api.sandbox import _run_limited
from api.utils import check_source_size, cleanup_workspace, create_workspace

router = APIRouter(prefix="/style", tags=["Style"])

LINT_BIN = "verible-verilog-lint"
FORMAT_BIN = "verible-verilog-format"
TIMEOUT_SECONDS = 10
MAX_FILES = 16
MAX_ISSUES = 200
RULES_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "verible.rules")

# Its own small pool, so typing never waits behind simulations; 2 keeps it light on 0.1 CPU.
_slots = asyncio.Semaphore(2)
# Names reach Verible's command line: they start with a letter, digit or underscore so one can't
# be read as an option ("--flag.v") or be a dot-file.
_SAFE_NAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}\.(v|sv|vh|svh)$")

# design.v:6:3-8: Use 'always_comb' instead of 'always @*'. [Style: combinational-logic] [always-comb]
# design.v:3:12: syntax error at token ";"
_ISSUE = re.compile(r"^(?P<file>[^:\s]+):(?P<line>\d+):(?P<col>\d+)(?:-(?P<end>\d+))?:\s*(?P<rest>.*)$")
_TAGS = re.compile(r"\s*\[([^\]]+)\]")
_FILE_PREFIX = re.compile(r"^[^:\s]+:\s+(?=[^:\s]+:\d+:)")


class SourceFile(BaseModel):
    name: str = Field(..., description="File name, e.g. design.v")
    content: str


class LintRequest(BaseModel):
    files: list[SourceFile] = Field(..., min_length=1, max_length=MAX_FILES)


class FormatRequest(BaseModel):
    source: str = Field(..., min_length=1)
    name: str = Field("design.sv", description="Only its extension matters (.v or .sv).")


def parse_lint(output: str) -> list[dict]:
    """Verible lint output -> issues. Lines without a [rule] tag are syntax errors."""
    issues: list[dict] = []
    for line in output.splitlines():
        # The formatter prefixes its first error with the file name: "d.v: d.v:1:10: ..."
        m = _ISSUE.match(_FILE_PREFIX.sub("", line.strip()))
        if not m:
            continue
        rest = m["rest"]
        tags = _TAGS.findall(rest)
        message = _TAGS.sub("", rest).strip()
        rule = tags[-1] if tags and not tags[-1].startswith("Style:") else None
        issues.append({
            "file": m["file"],
            "line": int(m["line"]),
            "col": int(m["col"]),
            "endCol": int(m["end"]) if m["end"] else None,
            "rule": rule or "syntax",
            "severity": "warning" if rule else "error",
            "message": message,
        })
        if len(issues) >= MAX_ISSUES:
            break
    return issues


def _write(tmpdir: str, name: str, content: str) -> None:
    path = os.path.join(tmpdir, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o644)


def _lint_sync(files: list[SourceFile]) -> dict:
    tmpdir, _ = create_workspace()
    try:
        names = []
        for f in files:
            if not _SAFE_NAME.match(f.name) or f.name in names:
                return {"ok": False, "error": f"Bad or repeated file name: {f.name[:64]}"}
            _write(tmpdir, f.name, f.content)
            names.append(f.name)
        try:
            _rc, out = _run_limited(
                [LINT_BIN, f"--rules_config={RULES_FILE}", "--lint_fatal=false", "--parse_fatal=false", *names],
                cwd=tmpdir, timeout=TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"Lint timed out after {TIMEOUT_SECONDS}s."}
        except FileNotFoundError:
            return {"ok": False, "error": "Style lint is unavailable (Verible is not installed on the server)."}
        return {"ok": True, "issues": parse_lint(out)}
    finally:
        cleanup_workspace(tmpdir)


def _format_sync(source: str, name: str) -> dict:
    ext = "sv" if name.endswith((".sv", ".svh")) else "v"
    tmpdir, _ = create_workspace()
    try:
        _write(tmpdir, f"design.{ext}", source)
        try:
            # --failsafe_success=false: by default Verible exits 0 and echoes the input on errors.
            rc, out = _run_limited([FORMAT_BIN, "--failsafe_success=false", f"design.{ext}"],
                                   cwd=tmpdir, timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"Formatting timed out after {TIMEOUT_SECONDS}s."}
        except FileNotFoundError:
            return {"ok": False, "error": "Formatting is unavailable (Verible is not installed on the server)."}
        if rc != 0:
            # Verible refuses to format code it can't parse; say where.
            errors = [i for i in parse_lint(out) if i["severity"] == "error"]
            where = f" (line {errors[0]['line']}: {errors[0]['message']})" if errors else ""
            return {"ok": False, "error": f"Fix the syntax error first{where}."}
        return {"ok": True, "formatted": out}
    finally:
        cleanup_workspace(tmpdir)


@router.post("/lint", dependencies=[Depends(verify_jwt)], summary="Style lint with Verible")
async def lint(body: LintRequest) -> dict:
    for f in body.files:
        check_source_size(f.content, settings.max_source_bytes, f.name[:64])
    async with _slots:
        return await asyncio.to_thread(_lint_sync, body.files)


@router.post("/format", dependencies=[Depends(verify_jwt)], summary="Format Verilog/SystemVerilog with Verible")
async def format_source(body: FormatRequest) -> dict:
    check_source_size(body.source, settings.max_source_bytes, "source")
    async with _slots:
        return await asyncio.to_thread(_format_sync, body.source, body.name)
