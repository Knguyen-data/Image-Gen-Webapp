"""Full Motion Director pipeline for ADK web dev UI.

This exposes the complete 3-agent system as sub-agents
so you can see all nodes in the ADK trace viewer.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool
from motion_director import (
    create_analyst_agent,
    create_motion_writer_agent,
    create_editor_agent,
    STYLE_PRESETS,
)

# Create sub-agents
analyst = create_analyst_agent(
    style_preset="fashion_walk",
    user_note="underground parking garage, luxury vibes",
)

# Dummy scene plan for writer/editor (will be replaced by analyst output in real flow)
DUMMY_PLAN = {
    "total_scenes": 2,
    "pacing_curve": "slow_build",
    "scenes": [
        {"scene_index": 0, "shot_type": "wide", "direction_notes": "Opening shot", "energy_level": 3, "duration_suggestion": "5s", "recommended_camera_move": "dolly forward", "recommended_subject_motion": "static", "recommended_environment_motion": "ambient"},
        {"scene_index": 1, "shot_type": "close_up", "direction_notes": "Intimate ending", "energy_level": 4, "duration_suggestion": "5s", "recommended_camera_move": "static", "recommended_subject_motion": "micro-expressions", "recommended_environment_motion": "light shift"},
    ],
}

writer_0 = create_motion_writer_agent(DUMMY_PLAN, scene_index=0)
writer_1 = create_motion_writer_agent(DUMMY_PLAN, scene_index=1)

editor = create_editor_agent(
    style_preset="fashion_walk",
    scene_plan=DUMMY_PLAN,
    motion_prompts=[],
)

# Root orchestrator that delegates to sub-agents
root_agent = LlmAgent(
    name="motion_director",
    model="gemini-2.5-flash",
    description="Orchestrates the full Motion Director pipeline: Analyst → Motion Writers → Editor",
    instruction="""You are the Motion Director orchestrator. You coordinate 3 specialist agents:

1. **motion_analyst** — Analyzes all input images and creates a scene plan with pacing and mood arc
2. **motion_writer_0 / motion_writer_1** — Writes Kling 2.6 motion prompts for each scene  
3. **motion_editor** — Reviews all prompts for consistency and flow

When the user sends images:
1. First, call the analyst to create a scene plan
2. Then, call the motion writers for each scene
3. Finally, call the editor to review and polish

Present the final polished prompts to the user.""",
    tools=[
        AgentTool(analyst),
        AgentTool(writer_0),
        AgentTool(writer_1),
        AgentTool(editor),
    ],
)
