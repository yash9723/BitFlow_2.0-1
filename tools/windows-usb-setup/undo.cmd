@echo off
rem BitFlow USB Setup, undo: gives the board's programming interface its original (FTDI) driver
rem back, e.g. to use Gowin Programmer or Vivado again. Runs undo.ps1 as administrator.
echo.
echo  BitFlow USB Setup - undo
echo  Click "Yes" when Windows asks for permission.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0undo.ps1\"'; exit $p.ExitCode"
if %errorlevel%==0 (echo  Done. Unplug the board and plug it back in.) else (echo  Undo didn't finish ^(code %errorlevel%^).)
echo.
pause
