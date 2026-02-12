@echo off
REM Build and push lora-trainer to Docker Hub
REM Run from Image Gen Webapp directory

echo Building lora-trainer Docker image...
docker build -t kie1/lora-trainer:latest -f workers/lora-trainer/Dockerfile workers/lora-trainer/

if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

echo Build successful!
echo.
echo Logging in to Docker Hub...
docker login -u kie1

if %errorlevel% neq 0 (
    echo Docker Hub login failed!
    exit /b 1
)

echo Pushing to Docker Hub...
docker push kie1/lora-trainer:latest

if %errorlevel% neq 0 (
    echo Push failed!
    exit /b 1
)

echo.
echo ✅ Successfully pushed kie1/lora-trainer:latest to Docker Hub!
