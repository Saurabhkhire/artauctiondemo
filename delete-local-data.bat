@echo off
REM Clears local SQLite (server\data\auction.db*) and uploaded images (server\uploads\*).
REM Stops dev servers on ports 4000 + 5173 first so the DB is not locked (EBUSY).

call "%~dp0stop-dev-servers.bat" all nopause

cd /d "%~dp0server"
if not exist "scripts\reset-database.js" (
  echo ERROR: server\scripts\reset-database.js not found.
  echo Run this file from the artauctiondemo project folder.
  pause
  exit /b 1
)

set DATABASE_URL=
echo.
node scripts\reset-database.js
set ERR=%ERRORLEVEL%
echo.
if %ERR% neq 0 echo If the database could not be deleted, stop the server and run this script again.
pause
exit /b %ERR%
