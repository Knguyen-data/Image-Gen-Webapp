"""Launch ADK Web UI for prompt tuning."""
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Set API key from env if available
if not os.environ.get("GOOGLE_API_KEY"):
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        os.environ["GOOGLE_API_KEY"] = key
    else:
        print("WARNING: No GOOGLE_API_KEY or GEMINI_API_KEY set.")
        print("Set it: set GOOGLE_API_KEY=your-key")

from google.adk.cli import main
sys.argv = ["adk", "web", "--port", "8888", "--reload_agents", "."]
main()
