BitFlow USB Setup (Windows)
===========================

Lets Chrome or Edge program your FPGA board from https://bitflowvlsi.tech/flash.

1. Plug the board in.
2. Double-click setup.cmd and click "Yes" when Windows asks for permission.
3. Go back to the flash page and program the board.

You only do this once per computer.

What it does: installs Windows' own WinUSB driver on the board's programming
interface (USB 0403:6010, interface 0), the same thing Zadig does, and nothing
else. The board's serial port keeps its normal driver.

Works for: Sipeed Tang Nano 9K and 20K, Lattice iCEstick, iCEBreaker,
Digilent Basys 3, Arty A7 and Nexys A7.

To undo it (for example to use Gowin Programmer or Vivado again), double-click
undo.cmd, click "Yes", then unplug the board and plug it back in.

Windows may show "Windows protected your PC" the first time: click
"More info", then "Run anyway".

wdi-simple.exe is built from libwdi (https://github.com/pbatard/libwdi, LGPL-3.0),
the library behind Zadig, by this repository's "Windows USB setup" workflow.
