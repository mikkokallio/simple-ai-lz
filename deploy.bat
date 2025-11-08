@echo off
REM ============================================================================
REM Azure AI Landing Zone - Simple Deployment Script (Windows)
REM ============================================================================
REM Prerequisites: Azure CLI installed and authenticated (az login)
REM Usage: deploy.bat
REM ============================================================================

setlocal enabledelayedexpansion

echo ============================================================================
echo Azure AI Landing Zone - MVP Deployment
echo ============================================================================
echo.

REM Check if logged in
echo Checking Azure login status...
az account show >nul 2>&1
if %errorlevel% neq 0 (
    echo Not logged in. Running 'az login'...
    az login
)

for /f "tokens=*" %%i in ('az account show --query "user.name" -o tsv') do set USERNAME=%%i
for /f "tokens=*" %%i in ('az account show --query "name" -o tsv') do set SUBNAME=%%i
echo Logged in as: %USERNAME%
echo Subscription: %SUBNAME%
echo.

REM Generate deployment name with timestamp
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATE=%%c%%a%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a%%b
set DEPLOYMENT_NAME=ailz-mvp-%DATE: =0%-%TIME: =0%

echo Starting deployment: %DEPLOYMENT_NAME%
echo This will take approximately 15-20 minutes.
echo.

az deployment sub create ^
  --name %DEPLOYMENT_NAME% ^
  --location swedencentral ^
  --template-file main.bicep ^
  --parameters main.bicepparam ^
  --output table

if %errorlevel% neq 0 (
    echo.
    echo ============================================================================
    echo Deployment FAILED
    echo ============================================================================
    echo.
    echo To view error details:
    echo   az deployment sub show --name %DEPLOYMENT_NAME%
    exit /b 1
)

echo.
echo ============================================================================
echo Deployment Complete!
echo ============================================================================
echo.

REM Show outputs
echo Deployment Outputs:
az deployment sub show ^
  --name %DEPLOYMENT_NAME% ^
  --query properties.outputs ^
  --output json

echo.
echo To view resources:
echo   az resource list --resource-group rg-ailz-lab --output table
echo.

endlocal
