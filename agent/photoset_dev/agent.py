"""Prompt Generator (Photoset mode) for ADK web dev UI."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from prompt_agent import create_generate_agent

root_agent = create_generate_agent(
    mode="photoset",
    count=4,
    scene_context="",
)
