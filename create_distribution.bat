@echo off
echo Creating distribution package...
echo.

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Run the distribution script
python prepare_distribution.py

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Distribution package created successfully!
    echo Check the 'dist' folder for the ZIP file.
) else (
    echo.
    echo ERROR: Distribution creation failed!
    pause
    exit /b 1
)

pause


