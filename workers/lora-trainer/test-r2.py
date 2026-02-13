#!/usr/bin/env python3
"""Test R2 upload functionality."""
import os
import boto3
from botocore.client import Config

# Credentials
R2_ENDPOINT = "https://490be35332b2cf733dcf21f04469aa7a.r2.cloudflarestorage.com"
R2_ACCESS_KEY = "AiUWkKsMv0-wtiTfDYd0wjz_ywHQXefdxBrYz1kb"
R2_SECRET_KEY = "147tQwSE8gX6-kvN5Dbo1iF7PnCC22b6I7Z3XVmC"
R2_BUCKET = "lora-training-images"

def test_r2_connection():
    """Test R2 connection and upload."""
    print("Testing R2 connection...")
    
    s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )
    
    # Test 1: List buckets
    print("\n1. Listing buckets...")
    try:
        response = s3.list_buckets()
        print(f"   Buckets: {[b['Name'] for b in response.get('Buckets', [])]}")
    except Exception as e:
        print(f"   Error listing buckets: {e}")
    
    # Test 2: Upload test file
    print("\n2. Uploading test file...")
    test_content = b"R2 connection test - " + str(os.path.getsize(__file__)).encode()
    test_key = "test/connection-test.txt"
    
    try:
        s3.put_object(Bucket=R2_BUCKET, Key=test_key, Body=test_content, ContentType="text/plain")
        print(f"   Uploaded: {test_key}")
    except Exception as e:
        print(f"   Upload error: {e}")
        return False
    
    # Test 3: Generate pre-signed URL
    print("\n3. Generating pre-signed URL...")
    try:
        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": test_key},
            ExpiresIn=3600,
        )
        print(f"   URL: {presigned_url[:100]}...")
    except Exception as e:
        print(f"   Pre-signed URL error: {e}")
        return False
    
    # Test 4: Generate pre-signed upload URL
    print("\n4. Generating pre-signed upload URL...")
    try:
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": R2_BUCKET,
                "Key": "test/upload-test.jpg",
                "ContentType": "image/jpeg",
            },
            ExpiresIn=3600,
        )
        print(f"   Upload URL: {upload_url[:100]}...")
    except Exception as e:
        print(f"   Upload URL error: {e}")
        return False
    
    print("\n✅ R2 connection successful!")
    return True

if __name__ == "__main__":
    success = test_r2_connection()
    exit(0 if success else 1)
