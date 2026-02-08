"""Motion Editor agent for ADK web dev UI."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from motion_director import create_editor_agent

DUMMY_SCENE_PLAN = {
    "total_scenes": 4,
    "pacing_curve": "slow_build",
    "scenes": [
        {"scene_index": 0, "shot_type": "extreme_wide", "direction_notes": "Opening"},
        {"scene_index": 1, "shot_type": "full_body", "direction_notes": "Approach"},
        {"scene_index": 2, "shot_type": "medium", "direction_notes": "Feature"},
        {"scene_index": 3, "shot_type": "close_up", "direction_notes": "Climax"},
    ],
}

DUMMY_PROMPTS = [
    {"scene_index": 0, "motion_prompt": "Slow crane down into vast underground garage, fluorescent reflections shimmer on luxury cars, static figure centered in lane, consistent overhead lighting", "camera_move": "crane down", "subject_motion": "static", "duration_suggestion": "5s"},
    {"scene_index": 1, "motion_prompt": "Camera pushes forward toward subject, subtle hair movement from ambient airflow, cream fabric catches fluorescent light, shallow DOF", "camera_move": "push forward", "subject_motion": "subtle sway", "duration_suggestion": "5s"},
    {"scene_index": 2, "motion_prompt": "Tracking shot moves backward matching model pace, confident stride with slight hip sway, cars blur in background, cinematic motion", "camera_move": "tracking backward", "subject_motion": "walking", "duration_suggestion": "5s"},
    {"scene_index": 3, "motion_prompt": "Static intimate close-up, micro-expressions play across face, gentle overhead light shift, contemplative locked gaze, shallow DOF", "camera_move": "static", "subject_motion": "micro-expressions", "duration_suggestion": "5s"},
]

root_agent = create_editor_agent(
    style_preset="fashion_walk",
    scene_plan=DUMMY_SCENE_PLAN,
    motion_prompts=DUMMY_PROMPTS,
)
