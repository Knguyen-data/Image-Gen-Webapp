"""Motion Writer agent for ADK web dev UI."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from motion_director import create_motion_writer_agent

DUMMY_SCENE_PLAN = {
    "total_scenes": 4,
    "pacing_curve": "slow_build",
    "mood_arc": "contemplative to powerful",
    "scenes": [
        {"scene_index": 0, "shot_type": "extreme_wide", "direction_notes": "Opening — establish scale, vast garage", "energy_level": 3, "duration_suggestion": "5s", "recommended_camera_move": "slow crane down", "recommended_subject_motion": "static, small weight shift", "recommended_environment_motion": "fluorescent reflections on cars"},
        {"scene_index": 1, "shot_type": "full_body", "direction_notes": "Approach — reveal outfit", "energy_level": 5, "duration_suggestion": "5s", "recommended_camera_move": "slow push forward", "recommended_subject_motion": "subtle hair movement", "recommended_environment_motion": "ambient lighting"},
        {"scene_index": 2, "shot_type": "medium", "direction_notes": "Feature — show attitude, model walks", "energy_level": 7, "duration_suggestion": "5s", "recommended_camera_move": "tracking backward", "recommended_subject_motion": "confident steps, hip sway", "recommended_environment_motion": "cars blur background"},
        {"scene_index": 3, "shot_type": "close_up", "direction_notes": "Climax — intimate, the face", "energy_level": 4, "duration_suggestion": "5s", "recommended_camera_move": "static or slow zoom", "recommended_subject_motion": "micro-expressions, head tilt", "recommended_environment_motion": "soft light shift"},
    ],
}

root_agent = create_motion_writer_agent(DUMMY_SCENE_PLAN, scene_index=0)
