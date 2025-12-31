@echo off
REM Activate virtual environment for this workspace
REM Usage: activate_venv.bat
REM Then use: python app.py (will use venv python)

echo Activating virtual environment...
set VIRTUAL_ENV=%~dp0venv
set PATH=%VIRTUAL_ENV%\Scripts;%PATH%
set PROMPT=(venv) %PROMPT%

echo Virtual environment activated!
echo Python: 
venv\Scripts\python.exe --version
echo.
echo You can now use 'python' command which will use the virtual environment.

