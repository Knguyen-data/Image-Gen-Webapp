import asyncio
import base64
import os
import glob
import toml
import runpod
import boto3
import httpx
from botocore.client import Config
from pathlib import Path
from urllib.parse import urlparse


def download_image(url: str, output_path: str):
    """Download and save image from URL."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    parsed = urlparse(url)
    filename = os.path.basename(parsed.path) or f"image_{hash(url) % 10000}.jpg"

    if not filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        filename += ".jpg"

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        try:
            response = client.get(url)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"HTTP {e.response.status_code} for {url[:80]}: {str(e)[:150]}")

        file_path = os.path.join(output_path, filename)
        with open(file_path, "wb") as f:
            f.write(response.content)

    return filename


def generate_toml_config(config: dict, training_data_dir: str) -> str:
    """Generate kohya TOML configuration file."""

    steps = config.get("steps", 1500)
    lr = config.get("lr", 1e-4)
    network_dim = config.get("network_dim", 32)
    network_alpha = config.get("network_alpha", 16)
    resolution = config.get("resolution", 1024)

    toml_config = {
        "general": {
            "enable_bucket": True,
            "bucket_reso_steps": 64,
            "bucket_no_upscale": False,
        },
        "model_arguments": {
            "pretrained_model_name_or_path": "/workspace/models/sd_xl_base_1.0.safetensors"
        },
        "dataset_arguments": {
            "resolution": resolution,
            "train_data_dir": training_data_dir,
            "enable_bucket": True,
            "min_bucket_reso": 256,
            "max_bucket_reso": 2048,
        },
        "training_arguments": {
            "output_dir": "/tmp/output",
            "output_name": "lora",
            "save_model_as": "safetensors",
            "max_train_steps": steps,
            "learning_rate": lr,
            "lr_scheduler": "cosine",
            "lr_warmup_steps": 0,
            "train_batch_size": 1,
            "mixed_precision": "fp16",
            "save_precision": "fp16",
            "gradient_checkpointing": True,
            "gradient_accumulation_steps": 1,
            "optimizer_type": "AdamW8bit",
            "network_module": "networks.lora",
            "network_dim": network_dim,
            "network_alpha": network_alpha,
            "xformers": True,
            "sdpa": False,
        },
    }

    config_path = "/tmp/training_config.toml"
    with open(config_path, "w") as f:
        toml.dump(toml_config, f)

    return config_path


def upload_to_r2(file_path: str, storage: dict) -> str:
    """Upload file to Cloudflare R2 storage."""

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found for upload: {file_path}")

    s3 = boto3.client(
        "s3",
        endpoint_url=storage["r2_endpoint"],
        aws_access_key_id=storage["r2_access_key"],
        aws_secret_access_key=storage["r2_secret_key"],
        config=Config(signature_version="s3v4", read_timeout=60, connect_timeout=10),
    )

    upload_path = storage["upload_path"]
    bucket = storage["r2_bucket"]

    print(f"  Uploading {file_path} to R2 ({bucket}/{upload_path})...")
    
    # Upload with timeout protection
    import socket
    socket.setdefaulttimeout(120)  # 2 minute timeout
    
    try:
        s3.upload_file(file_path, bucket, upload_path)
        print(f"  Upload successful")
    except socket.timeout:
        raise RuntimeError("R2 upload timed out after 2 minutes")
    except Exception as e:
        raise RuntimeError(f"R2 upload failed: {str(e)}")
    finally:
        socket.setdefaulttimeout(None)  # Reset

    return f"{storage['r2_endpoint']}/{bucket}/{upload_path}"


def get_r2_upload_url(storage: dict, filename: str, content_type: str = "image/jpeg") -> str:
    """Generate a pre-signed URL for uploading to R2."""
    import datetime
    
    s3 = boto3.client(
        "s3",
        endpoint_url=storage["r2_endpoint"],
        aws_access_key_id=storage["r2_access_key"],
        aws_secret_access_key=storage["r2_secret_key"],
        config=Config(signature_version="s3v4"),
    )

    bucket = storage["r2_bucket"]
    
    # Generate presigned URL valid for 1 hour
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": bucket,
            "Key": filename,
            "ContentType": content_type,
        },
        ExpiresIn=3600,
    )
    
    return upload_url


def download_from_r2(r2_url: str, output_path: str) -> str:
    """Download file from R2 using pre-signed URL or public URL."""
    parsed = urlparse(r2_url)
    filename = os.path.basename(parsed.path) or f"image_{hash(r2_url) % 10000}.jpg"
    
    if not filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        filename += ".jpg"
    
    print(f"    Downloading from R2: {r2_url[:80]}...")
    
    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            response = client.get(r2_url)
            response.raise_for_status()
            
            file_path = os.path.join(output_path, filename)
            with open(file_path, "wb") as f:
                f.write(response.content)
            print(f"    Saved: {filename} ({len(response.content)} bytes)")
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"HTTP {e.response.status_code} downloading from R2: {str(e)[:150]}")
    except Exception as e:
        raise RuntimeError(f"R2 download failed: {str(e)[:200]}")
    
    return filename


def find_output_lora() -> str:
    """Find the trained LoRA file in output directory."""
    lora_files = glob.glob("/tmp/output/*.safetensors")

    if not lora_files:
        raise FileNotFoundError("No .safetensors file found in /tmp/output/")

    return lora_files[0]


async def handler(event: dict) -> dict:
    """
    RunPod handler for LoRA training.

    Expected input format (from frontend lora-model-service.ts):
    {
        "mode": "train_lora",
        "trigger_word": "ohwx",
        "training_images": ["url1", "url2"],
        "steps": 1000,
        "learning_rate": 1e-4,
        "output_name": "lora_userid_123abc"
    }
    """

    try:
        input_data = event.get("input", {})

        mode = input_data.get("mode")
        if mode != "train_lora":
            return {"status": "failed", "error": f"Unknown mode: {mode}"}

        # Check GPU availability
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA GPU is not available - training requires GPU")
        print(f"GPU available: {torch.cuda.get_device_name(0)}")

        trigger_word = input_data.get("trigger_word", "ohwx")
        image_urls = input_data.get("training_images", [])
        print(f"Received {len(image_urls)} training image URLs")
        if image_urls:
            print(f"  First URL sample: {image_urls[0][:100]}...")
        steps = input_data.get("steps", 1000)
        learning_rate = input_data.get("learning_rate", 1e-4)
        output_name = input_data.get("output_name", "lora")

        config = {
            "steps": steps,
            "lr": learning_rate,
            "network_dim": 32,
            "network_alpha": 16,
            "resolution": 1024,
            "trigger_word": trigger_word,
        }

        storage = {
            "r2_endpoint": os.environ.get("R2_ENDPOINT", ""),
            "r2_access_key": os.environ.get("R2_ACCESS_KEY", ""),
            "r2_secret_key": os.environ.get("R2_SECRET_KEY", ""),
            "r2_bucket": os.environ.get("R2_BUCKET", "lora-models"),
            "upload_path": f"{output_name}.safetensors",
        }

        # Validate R2 credentials
        if not storage["r2_endpoint"] or not storage["r2_access_key"]:
            raise RuntimeError("R2 credentials not configured (R2_ENDPOINT, R2_ACCESS_KEY required)")

        if not image_urls:
            return {"status": "failed", "error": "No training images provided"}

        training_data_dir = f"/tmp/training_data/{trigger_word}"
        os.makedirs(training_data_dir, exist_ok=True)

        print(f"Downloading {len(image_urls)} training images...")
        downloaded = 0
        failed_urls = []
        for i, url in enumerate(image_urls):
            try:
                filename = download_image(url, training_data_dir)
                print(f"  [{i + 1}/{len(image_urls)}] Downloaded: {filename}")
                downloaded += 1
            except Exception as e:
                print(f"  [{i + 1}/{len(image_urls)}] Failed: {url[:80]}... Error: {str(e)[:100]}")
                failed_urls.append(url)

        print(f"  Completed: {downloaded}/{len(image_urls)} images downloaded")
        if failed_urls:
            print(f"  WARNING: {len(failed_urls)} URLs failed - training may fail")

        print("Generating auto-captions...")
        caption_count = 0
        for img_file in os.listdir(training_data_dir):
            if img_file.lower().endswith((".jpg", ".jpeg", ".png")):
                base_name = os.path.splitext(img_file)[0]
                caption_path = os.path.join(training_data_dir, f"{base_name}.txt")
                with open(caption_path, "w") as f:
                    f.write(f"{trigger_word} person")
                caption_count += 1
        print(f"  Generated {caption_count} captions")

        print("Generating training config...")
        config_path = generate_toml_config(config, "/tmp/training_data")

        # Check if model file exists
        model_path = "/workspace/models/sd_xl_base_1.0.safetensors"
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Base model not found: {model_path}")
        print(f"  Model found: {model_path}")

        print("Starting LoRA training...")
        log_file = open("/tmp/training.log", "w")

        process = await asyncio.create_subprocess_exec(
            "accelerate",
            "launch",
            "--num_cpu_threads_per_process=1",
            "/workspace/kohya/sdxl_train_network.py",
            "--config_file",
            config_path,
            stdout=log_file,
            stderr=asyncio.subprocess.STDOUT,
        )

        print(f"  Training process started (PID: {process.pid})")

        # Wait with timeout (max 30 minutes)
        try:
            returncode = await asyncio.wait_for(process.wait(), timeout=1800.0)
        except asyncio.TimeoutError:
            log_file.close()
            return {
                "status": "failed",
                "error": "Training process timed out after 30 minutes",
            }

        log_file.close()

        if returncode != 0:
            with open("/tmp/training.log", "r") as f:
                log_content = f.read()

            return {
                "status": "failed",
                "error": f"Training process failed with exit code {returncode}",
                "log": log_content[-2000:],
            }

        print("Training completed. Finding output LoRA...")
        lora_path = find_output_lora()

        file_size = os.path.getsize(lora_path)
        print(f"LoRA file size: {file_size} bytes")

        print("Uploading to R2...")
        print(f"  R2 endpoint: {storage['r2_endpoint']}")
        print(f"  Bucket: {storage['r2_bucket']}")
        print(f"  Upload path: {storage['upload_path']}")
        
        r2_url = upload_to_r2(lora_path, storage)

        print(f"Upload complete: {r2_url}")

        return {"status": "completed", "success": True, "model_url": r2_url, "file_size": file_size}

    except Exception as e:
        print(f"Error during training: {str(e)}")

        log_content = ""
        if os.path.exists("/tmp/training.log"):
            with open("/tmp/training.log", "r") as f:
                log_content = f.read()[-2000:]

        return {"status": "failed", "error": str(e), "log": log_content}


if __name__ == "__main__":
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    app = FastAPI()

    # Add CORS middleware for local testing
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/runsync")
    async def runsync(request: Request):
        body = await request.json()
        result = await handler({"input": body})
        return result

    # In-memory job storage for local testing
    jobs: dict = {}

    @app.post("/run")
    async def run(request: Request):
        """Async endpoint - returns job ID immediately."""
        body = await request.json()
        job_id = f"local-{len(jobs) + 1}"
        jobs[job_id] = {"status": "queued", "input": body}
        
        # Start processing in background
        asyncio.create_task(process_job(job_id, body))
        
        return {"id": job_id}

    async def process_job(job_id: str, input_body: dict):
        """Background task to process job."""
        jobs[job_id]["status"] = "in_progress"
        try:
            result = await handler({"input": input_body})
            jobs[job_id]["status"] = result.get("status", "completed")
            jobs[job_id]["output"] = result
        except Exception as e:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(e)

    @app.get("/status/{job_id}")
    async def get_status(job_id: str):
        """Get job status."""
        if job_id not in jobs:
            return {"error": "Job not found"}, 404
        return jobs[job_id]

    @app.get("/upload-url")
    async def get_upload_url(filename: str, content_type: str = "image/jpeg"):
        """Generate R2 pre-signed upload URL for training images."""
        storage = {
            "r2_endpoint": os.environ.get("R2_ENDPOINT", ""),
            "r2_access_key": os.environ.get("R2_ACCESS_KEY", ""),
            "r2_secret_key": os.environ.get("R2_SECRET_KEY", ""),
            "r2_bucket": os.environ.get("R2_BUCKET", "lora-training-images"),
            "upload_path": filename,
        }
        
        if not storage["r2_endpoint"]:
            return {"error": "R2 not configured"}, 500
            
        try:
            upload_url = get_r2_upload_url(storage, filename, content_type)
            return {"upload_url": upload_url}
        except Exception as e:
            return {"error": str(e)}, 500

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    print("Starting local testing server on port 8000...")
    print("POST to http://localhost:8000/run for async (returns job ID)")
    print("POST to http://localhost:8000/runsync for sync (blocks until done)")
    print("GET  to http://localhost:8000/status/{job_id} for status")
    uvicorn.run(app, host="0.0.0.0", port=8000)
else:
    runpod.serverless.start({"handler": handler})
