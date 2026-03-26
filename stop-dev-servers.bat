@echo off
REM Stops dev servers for this app (and optionally every Node process on your PC).
REM
REM   stop-dev-servers.bat           — listeners on ports 3000, 4000, 5173, 5174
REM   stop-dev-servers.bat all       — also: taskkill ALL node.exe (strongest reset)
REM   stop-dev-servers.bat nopause   — no "press any key" (used by delete-local-data.bat)
REM   stop-dev-servers.bat all nopause
REM
REM Requires PowerShell for port cleanup (Windows 10/11).

setlocal EnableDelayedExpansion
set "KILLNODE="
set "NOPAUSE="
for %%A in (%*) do (
  if /i "%%A"=="all" set KILLNODE=1
  if /i "%%A"=="nopause" set NOPAUSE=1
)

if defined KILLNODE (
  echo Stopping ALL Node.js processes ^(node.exe^) on this machine...
  taskkill /F /IM node.exe 1>nul 2>nul
  if errorlevel 1 (
    echo No running node.exe found ^(or no permission^).
  ) else (
    echo node.exe processes ended.
  )
  echo.
)

echo Freeing common dev ports ^(API 4000, Vite 5173/5174, optional 3000^)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = 3000, 4000, 5173, 5174; " ^
  "foreach ($p in $ports) { " ^
  "  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | " ^
  "  ForEach-Object { " ^
  "    $owning = $_.OwningProcess; " ^
  "    Write-Host ('Port ' + $p + ' - PID ' + $owning + ' - stopping...'); " ^
  "    Stop-Process -Id $owning -Force -ErrorAction SilentlyContinue " ^
  "  } " ^
  "}"

timeout /t 2 /nobreak >nul
echo.
echo After this, start the API first, then Vite:
echo   cd server ^&^& npm run dev
echo   cd client ^&^& npm run dev
echo.
echo Vite proxy ECONNRESET usually means the API on :4000 is not running or crashed.
echo.

if defined NOPAUSE exit /b 0
pause
