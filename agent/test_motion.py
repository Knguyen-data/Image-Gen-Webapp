"""Quick manual test for the Motion Director pipeline."""
import asyncio
import base64
import json
import httpx

API_KEY = input("Paste your Gemini API key: ").strip()
BACKEND = "http://localhost:8001"

# Create a tiny 1x1 red PNG as test image
RED_PIXEL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

async def main():
    async with httpx.AsyncClient(timeout=120) as client:
        # 1. Health
        r = await client.get(f"{BACKEND}/health")
        print(f"✓ Health: {r.json()}")

        # 2. Generate
        print("\n⏳ Generating motion prompts (3-agent pipeline)...")
        img_b64 = base64.b64encode(RED_PIXEL_PNG).decode()
        
        payload = {
            "api_key": API_KEY,
            "images": [
                {"base64": img_b64, "mime_type": "image/png"},
                {"base64": img_b64, "mime_type": "image/png"},
            ],
            "style_preset": "fashion_walk",
            "user_note": "underground parking garage, luxury vibes",
        }
        
        r = await client.post(f"{BACKEND}/motion/generate", json=payload)
        
        if r.status_code != 200:
            print(f"✗ Error {r.status_code}: {r.text}")
            return
        
        result = r.json()
        print(f"✓ Session: {result['session_id']}")
        print(f"✓ Got {len(result['prompts'])} motion prompts:\n")
        
        for p in result["prompts"]:
            print(f"  Scene {p['scene_index']}:")
            print(f"    Prompt: {p['motion_prompt']}")
            print(f"    Camera: {p['camera_move']}")
            print(f"    Subject: {p['subject_motion']}")
            print(f"    Duration: {p['duration_suggestion']}")
            print()

        # 3. Refine
        print("⏳ Testing refine (make scene 0 more dramatic)...")
        r2 = await client.post(f"{BACKEND}/motion/refine", json={
            "api_key": API_KEY,
            "session_id": result["session_id"],
            "message": "make the first scene more dramatic with a crane shot",
            "scene_index": 0,
        })
        
        if r2.status_code == 200:
            refined = r2.json()
            print(f"✓ Refined {len(refined['prompts'])} prompts")
            for p in refined["prompts"]:
                print(f"  Scene {p['scene_index']}: {p['motion_prompt'][:80]}...")
        else:
            print(f"✗ Refine error: {r2.text}")

asyncio.run(main())
