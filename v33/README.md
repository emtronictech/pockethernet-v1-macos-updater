# Pockethernet v1 macOS firmware v33 updater

⚠️ **Use at your own risk.**

This folder contains the source code for an unofficial Python based macOS updater for **Pockethernet v1 firmware v33**.

Pockethernet provides official firmware update tools for Windows and Linux, but not for macOS. This script allows macOS users to flash firmware v33 by using the official Pockethernet Linux updater file as the firmware source.

The Python script does **not** include Pockethernet firmware.

## What this script does

The official Pockethernet v33 Linux updater contains the actual firmware payloads inside the Linux executable.

macOS cannot run that Linux executable directly.

This Python script reads the official Linux updater file, extracts the embedded firmware payloads, and sends them to the Pockethernet over USB serial.

In short:

```text
Official Pockethernet Linux updater file
        ↓
Python script extracts the firmware payloads
        ↓
Firmware is flashed to Pockethernet v1 over USB serial
```

## Requirements

You need:

```text
macOS
Python 3
pyserial
Pockethernet v1
Official Pockethernet v33 Linux updater
```

Install `pyserial` with:

```bash
python3 -m pip install pyserial
```

## Download the official firmware updater

The official Pockethernet v33 Linux updater is required.

Download it from the official Pockethernet firmware page:

https://pockethernet.com/firmware.html

After downloading and extracting it, you should have a file named:

```text
pockethernet-v33-fwupgrade
```

This file is intentionally **not included** here.

## Files needed

To use the updater, you need these two files in the same directory on your Mac:

```text
pockethernet_v33_macos_updater.py
pockethernet-v33-fwupgrade
```

The first file is the Python updater script.

The second file is the official Pockethernet Linux updater that you downloaded yourself from Pockethernet.

## List serial ports

Connect the Pockethernet v1 to your Mac using USB.

Then run:

```bash
python3 pockethernet_v33_macos_updater.py --list-ports
```

On macOS, the Pockethernet usually appears as something like:

```text
/dev/cu.usbmodemXXXX
```

Use the `/dev/cu.*` device, not the `/dev/tty.*` device.

## Dry run

Before flashing, run a dry run first:

```bash
python3 pockethernet_v33_macos_updater.py --dry-run dummy ./pockethernet-v33-fwupgrade
```

The dry run checks whether the firmware payloads can be extracted from the official Linux updater file.

It does not open the serial port and does not flash the Pockethernet.

Expected result:

```text
Extracted payloads: fw1=100696 bytes, fw2=32 bytes
Dry run complete. No serial port was opened.
```

## Flash firmware v33

Replace `/dev/cu.usbmodemXXXX` with the actual serial port shown by `--list-ports`.

```bash
python3 pockethernet_v33_macos_updater.py /dev/cu.usbmodemXXXX ./pockethernet-v33-fwupgrade
```

Do not unplug the Pockethernet while the update is running.

When the update succeeds, the script sets the Pockethernet LEDs to green. If an error occurs, the script attempts to set the LEDs to red.

## Safety checklist

Before flashing, check the following:

| Check            | Description                                        |
| ---------------- | -------------------------------------------------- |
| Correct device   | Use this only with Pockethernet v1                 |
| Correct firmware | Use the official v33 Linux updater                 |
| Dry run          | Run the dry run command first                      |
| USB cable        | Use a reliable USB cable                           |
| Power            | Keep your Mac connected to power if possible       |
| Sleep mode       | Do not let your Mac go to sleep during flashing    |
| Connection       | Do not disconnect the Pockethernet during flashing |

## Technical notes

The official Pockethernet v33 Linux updater is an x86_64 Linux executable. macOS cannot run it directly.

This Python script does not execute the Linux binary. Instead, it extracts the embedded firmware payloads from the official updater file and sends them to the Pockethernet over USB CDC serial.

For v33, the expected payloads are:

```text
Main firmware payload: 100696 bytes
Second payload: 32 bytes
```

The update protocol uses:

```text
USB CDC serial
115200 baud
COBS packet framing
0x00 packet delimiter
CRC16 validation
Little endian command values
```

This script is intentionally specific to firmware v33. It should not be used with unknown firmware versions.

## Disclaimer

This is an unofficial tool.

It is not affiliated with, endorsed by, or supported by Pockethernet.

Firmware flashing always carries a risk. A failed update may leave your device in an unusable state. Use this tool only if you understand and accept that risk.

This script does not include, redistribute, modify, or host any Pockethernet firmware. Download the official updater from Pockethernet yourself:

https://pockethernet.com/firmware.html
