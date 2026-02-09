@echo off
title OPUS Session 2 - Kling 3 App Integration
cd /d "C:\Users\ikiuc\Documents\Image Gen Webapp"
set ANTHROPIC_BASE_URL=https://api.anthropic.com
set ANTHROPIC_API_KEY=sk-GdMSeA0nM44Pjic8ILVGzy3ViZkyrBc938fHk6KG5EmPJtww
set ANTHROPIC_AUTH_TOKEN=
set ANTHROPIC_MODEL=claude-opus-4-0-6
set ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-0-6
set ANTHROPIC_DEFAULT_SONNET_MODEL=claude-opus-4-0-6
set ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-opus-4-0-6
set ANTHROPIC_SMALL_FAST_MODEL=claude-opus-4-0-6
claude --dangerously-skip-permissions --model claude-opus-4-0-6
pause
