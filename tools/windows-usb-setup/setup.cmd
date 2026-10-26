@echo off
rem BitFlow USB Setup: lets Chrome and Edge program FT2232-based FPGA boards (Tang Nano 9K/20K,
rem iCEstick, iCEBreaker, Basys 3, Arty, Nexys) from bitflowvlsi.tech/flash. It installs Windows'
rem own WinUSB driver on the board's programming interface only (USB 0403:6010, interface 0);
rem the serial port (interface 1) keeps its driver. undo.cmd puts the original driver back.
rem wdi-simple.exe is built from libwdi (https://github.com/pbatard/libwdi), the library behind Zadig.
setlocal
echo.
echo  BitFlow USB Setup
echo  -----------------
echo  Plug your board in, then click "Yes" when Windows asks for permission.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath '%~dp0wdi-simple.exe' -ArgumentList '--vid 0x0403 --pid 0x6010 --iid 0 --type 0 --name \"BitFlow FPGA programmer\" --inf bitflow_fpga.inf --dest \"%TEMP%\bitflow-usb-setup\" --progressbar --timeout 120000' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
if %errorlevel%==0 (
  echo  Done. Go back to the flash page and program your board.
) else (
  echo  Setup didn't finish ^(code %errorlevel%^). If you clicked "No", run setup.cmd again and click "Yes".
)
echo.
pause
