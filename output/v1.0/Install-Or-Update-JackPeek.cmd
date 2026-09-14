@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SOURCE=%~dp0"
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=%CD%"

set "SRC_EXE=%SOURCE%NetworkPortAnalyzer.exe"
set "SRC_SHA=%SOURCE%NetworkPortAnalyzer.exe.sha256"
set "DST_EXE=%TARGET%\NetworkPortAnalyzer.exe"

if not exist "%SRC_EXE%" (
  echo The NAS release executable was not found:
  echo %SRC_EXE%
  pause
  exit /b 1
)
if not exist "%SRC_SHA%" (
  echo The SHA256 file was not found:
  echo %SRC_SHA%
  pause
  exit /b 1
)
if not exist "%TARGET%" mkdir "%TARGET%"

for /f "tokens=1" %%H in (%SRC_SHA%) do set "EXPECTED=%%H"
for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%SRC_EXE%" SHA256 ^| findstr /R /V "hash CertUtil"') do set "ACTUAL=%%H"

if /I not "%EXPECTED%"=="%ACTUAL%" (
  echo SHA256 verification failed.
  echo Expected: %EXPECTED%
  echo Actual:   %ACTUAL%
  pause
  exit /b 1
)

:COPY
copy /Y "%SRC_EXE%" "%DST_EXE%" >nul
if errorlevel 1 (
  echo.
  echo Could not replace NetworkPortAnalyzer.exe.
  echo Close JackPeek, then press any key to retry.
  pause >nul
  goto COPY
)

copy /Y "%SRC_SHA%" "%TARGET%\NetworkPortAnalyzer.exe.sha256" >nul
if exist "%SOURCE%version.json" copy /Y "%SOURCE%version.json" "%TARGET%\version.json" >nul
if exist "%SOURCE%Publish-JackPeek-To-NAS.cmd" copy /Y "%SOURCE%Publish-JackPeek-To-NAS.cmd" "%TARGET%\Publish-JackPeek-To-NAS.cmd" >nul
if exist "%SOURCE%Install-Or-Update-JackPeek.cmd" copy /Y "%SOURCE%Install-Or-Update-JackPeek.cmd" "%TARGET%\Install-Or-Update-JackPeek.cmd" >nul

echo.
echo JackPeek was updated successfully in:
echo %TARGET%
echo.
pause
exit /b 0
