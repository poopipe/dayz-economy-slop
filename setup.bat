@echo off
echo ============================================================
echo XML Data Viewer - Setup Script
echo ============================================================
echo.
echo This script will set up the XML Data Viewer applications
echo on your computer.
echo.
echo Prerequisites:
echo - Python 3.13 or higher must be installed
echo - Internet connection required for package installation
echo.
echo ============================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH
    echo.
    echo Please install Python 3.13 or higher from:
    echo https://www.python.org/downloads/
    echo.
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo Checking Python version...
python --version
echo.

REM Check Python version (should be 3.13+)
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
for /f "tokens=1 delims=." %%i in ("%PYTHON_VERSION%") do set PYTHON_MAJOR=%%i
for /f "tokens=2 delims=." %%j in ("%PYTHON_VERSION%") do set PYTHON_MINOR=%%j

if %PYTHON_MAJOR% LSS 3 (
    echo ERROR: Python 3.13 or higher is required
    echo Current version: %PYTHON_VERSION%
    echo.
    pause
    exit /b 1
)

if %PYTHON_MAJOR% EQU 3 (
    if %PYTHON_MINOR% LSS 13 (
        echo WARNING: Python 3.13 or higher is recommended
        echo Current version: %PYTHON_VERSION%
        echo.
        echo Continue anyway? (Y/N)
        set /p CONTINUE=
        if /i not "%CONTINUE%"=="Y" exit /b 1
    )
)

echo.
echo Step 1: Creating virtual environment...
if exist venv (
    echo Virtual environment already exists. Skipping...
) else (
    python -m venv venv
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    echo Virtual environment created successfully!
)

echo.
echo Step 2: Activating virtual environment...
call venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)

echo.
echo Step 3: Upgrading pip...
python -m pip install --upgrade pip

echo.
echo Step 4: Installing dependencies...
if not exist requirements.txt (
    echo ERROR: requirements.txt not found!
    pause
    exit /b 1
)

pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Setup completed successfully!
echo ============================================================
echo.
echo Next steps:
echo 1. Run start_all_apps.bat to start all applications
echo 2. Open your browser to http://localhost:5000
echo.
echo Or run individual applications:
echo - python run_launcher.py
echo - python run_economy_editor.py
echo - python run_map_viewer.py
echo.
pause

