@echo off
echo ============================================================
echo Starting XML Data Viewer Applications
echo ============================================================
echo.
echo Launcher: http://localhost:5000
echo Economy Editor: http://localhost:5004
echo Map Viewer: http://localhost:5003
echo.
echo ============================================================
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PYTHON_EXE=%SCRIPT_DIR%\venv\Scripts\python.exe"

REM Check if Windows Terminal is available
where wt.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    REM Use Windows Terminal with tabs
    echo Starting all applications in Windows Terminal tabs...
    wt.exe -d "%SCRIPT_DIR%" cmd /k "cd /d \"%SCRIPT_DIR%\" && \"%PYTHON_EXE%\" run_economy_editor.py" ; -d "%SCRIPT_DIR%" cmd /k "cd /d \"%SCRIPT_DIR%\" && \"%PYTHON_EXE%\" run_map_viewer.py" ; -d "%SCRIPT_DIR%" cmd /k "cd /d \"%SCRIPT_DIR%\" && \"%PYTHON_EXE%\" run_launcher.py"
) else (
    REM Fallback to separate windows if Windows Terminal is not available
    echo Windows Terminal not found. Using separate windows instead...
    echo.
    
    REM Start Economy Editor in a new window
    start "Economy Editor" cmd /k "cd /d \"%SCRIPT_DIR%\" && \"%PYTHON_EXE%\" run_economy_editor.py"
    
    REM Wait a moment for the first app to start
    timeout /t 2 /nobreak >nul
    
    REM Start Map Viewer in a new window
    start "Map Viewer" cmd /k "cd /d \"%SCRIPT_DIR%\" && \"%PYTHON_EXE%\" run_map_viewer.py"
    
    REM Wait a moment for the second app to start
    timeout /t 2 /nobreak >nul
    
    REM Start Launcher in a new window
    start "Launcher" cmd /k "cd /d \"%SCRIPT_DIR%\" && \"%PYTHON_EXE%\" run_launcher.py"
)

echo.
echo All applications are starting...
echo.
echo Open your browser to http://localhost:5000 to use the launcher
echo.
timeout /t 3 /nobreak >nul

