@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "APP_NAME=JackPeek"
set "VERSION=1.0"
set "SOURCE=%~dp0"
set "NAS_ROOT=\\sbcnas\field_services\new_brunswick\Tools\JackPeek"
set "RELEASED=%NAS_ROOT%\Released"
set "EXE=%SOURCE%NetworkPortAnalyzer.exe"
set "SHA_FILE=%SOURCE%NetworkPortAnalyzer.exe.sha256"

if not exist "%EXE%" (
  echo NetworkPortAnalyzer.exe was not found in %SOURCE%
  exit /b 1
)

for /f "tokens=1-5 delims=/:. " %%a in ("%date% %time%") do (
  set "STAMP=%%c%%a%%b-%%d%%e"
)
if "%STAMP%"=="" set "STAMP=%VERSION%"

if not exist "%NAS_ROOT%" mkdir "%NAS_ROOT%"
if errorlevel 1 (
  echo Could not create or access %NAS_ROOT%
  exit /b 1
)
if not exist "%RELEASED%" mkdir "%RELEASED%"

if exist "%NAS_ROOT%\NetworkPortAnalyzer.exe" (
  set "ARCHIVE=%RELEASED%\v%VERSION%_%STAMP%"
  mkdir "!ARCHIVE!"
  for %%F in (
    "NetworkPortAnalyzer.exe"
    "NetworkPortAnalyzer.exe.sha256"
    "version.json"
    "Install-Or-Update-JackPeek.cmd"
  ) do (
    if exist "%NAS_ROOT%\%%~F" move /Y "%NAS_ROOT%\%%~F" "!ARCHIVE!\" >nul
  )
)

for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%EXE%" SHA256 ^| findstr /R /V "hash CertUtil"') do (
  set "SHA256=%%H"
)
if "%SHA256%"=="" (
  echo Could not calculate SHA256 for %EXE%
  exit /b 1
)

> "%SHA_FILE%" echo %SHA256%  NetworkPortAnalyzer.exe

copy /Y "%EXE%" "%NAS_ROOT%\NetworkPortAnalyzer.exe" >nul
copy /Y "%SHA_FILE%" "%NAS_ROOT%\NetworkPortAnalyzer.exe.sha256" >nul
copy /Y "%SOURCE%Install-Or-Update-JackPeek.cmd" "%NAS_ROOT%\Install-Or-Update-JackPeek.cmd" >nul

> "%NAS_ROOT%\version.json" echo {
>> "%NAS_ROOT%\version.json" echo   "version": "%VERSION%",
>> "%NAS_ROOT%\version.json" echo   "releaseDate": "%date%",
>> "%NAS_ROOT%\version.json" echo   "sha256": "%SHA256%",
>> "%NAS_ROOT%\version.json" echo   "changes": [
>> "%NAS_ROOT%\version.json" echo     "Portable v%VERSION% release package",
>> "%NAS_ROOT%\version.json" echo     "NAS health, retained cache visibility, and update status workflow",
>> "%NAS_ROOT%\version.json" echo     "Speed Test speedometer dashboard"
>> "%NAS_ROOT%\version.json" echo   ]
>> "%NAS_ROOT%\version.json" echo }

copy /Y "%NAS_ROOT%\version.json" "%SOURCE%version.json" >nul

echo Published %APP_NAME% v%VERSION% to:
echo %NAS_ROOT%
echo SHA256: %SHA256%
echo Previous release files, when present, were moved under:
echo %RELEASED%
exit /b 0
