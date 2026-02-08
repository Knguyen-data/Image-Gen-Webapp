"""Motion Analyst agent for ADK web dev UI."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from motion_director import create_analyst_agent

root_agent = create_analyst_agent(
    style_preset="fashion_walk",
    user_note="underground parking garage, luxury vibes, moody lighting",
)
