# Pockethernet v1 macOS firmware updater

[![GitHub Release](https://img.shields.io/github/v/release/emtronictech/pockethernet-v1-macos-updater?include_prereleases\&style=for-the-badge)](https://github.com/emtronictech/pockethernet-v1-macos-updater/releases)

⚠️ **Use at your own risk.**

Unofficial firmware updater for Pockethernet v1 on macOS.

This project makes it possible to update a Pockethernet v1 from macOS by using the official Pockethernet Linux firmware updater file as the firmware source.

The updater does **not** execute the Linux binary. Instead, it extracts the embedded firmware payloads from the official updater file and flashes them to the Pockethernet over USB serial.

## Why this project exists

Pockethernet provides official firmware update tools for Windows and Linux, but there is no official macOS updater for Pockethernet v1.

The official Linux updater is distributed as a Linux executable. macOS cannot run this executable directly because it is not a macOS binary.

This project provides macOS compatible updater options that communicate with the Pockethernet over USB serial.

## ⚠️ Important warning

This is an unofficial project.

It is not affiliated with, endorsed by, or supported by Pockethernet.

Firmware flashing always carries a risk. A failed update may leave your device in an unusable state. Use this tool only if you understand and accept that risk.

Do not unplug the Pockethernet while updating. Make sure your Mac has enough battery power or is connected to power before starting the update.

This project does **not** include, redistribute, modify, or host any Pockethernet firmware.

You must download the official Pockethernet Linux updater yourself from the official Pockethernet firmware page:

https://pockethernet.com/firmware.html

The official firmware updater is intentionally not included here.

The MIT License in this project only applies to the code provided here. Pockethernet firmware and official Pockethernet updater binaries remain property of their respective owners.

## Update options

You can use the web based updater directly in your browser:

https://emtronic.nl/pockethernet-web-updater/

The web updater uses Web Serial and processes the selected official Pockethernet Linux updater file locally in your browser. No firmware is uploaded to a server.

Use Chrome or Edge on macOS. Safari and Firefox do not support Web Serial.

If you prefer to run the updater yourself with Python on macOS, follow the instructions below.

## Currently supported firmware

The currently tested firmware version is **v33**.

Python updater source:

[`v33/pockethernet_v33_macos_updater.py`](v33/pockethernet_v33_macos_updater.py)

Version specific instructions:

[`v33/README.md`](v33/README.md)

Release:

[Release v33](https://github.com/emtronictech/pockethernet-v1-macos-updater/releases/tag/v33)

Future firmware versions can be added when their official updater layout has been inspected and tested.

## Python updater requirements

You need the following:

```text
macOS
Python 3
pyserial
Pockethernet v1
Official Pockethernet v1 Linux firmware updater for the matching firmware version
```

Install `pyserial` with pip:

```bash
python3 -m pip install pyserial
```

## Python updater usage overview

Download the official Pockethernet Linux updater for the firmware version you want to install:

https://pockethernet.com/firmware.html

Download the matching macOS Python updater script from this project.

Place both files in the same directory on your Mac.

Run the dry run command first.

Flash the firmware only if the dry run succeeds.

For exact commands, serial port instructions and version specific details, read the README for the firmware version you want to install:

[`v33/README.md`](v33/README.md)

## macOS serial port note

On macOS, USB serial devices usually appear twice:

```text
/dev/cu.usbmodemXXXX
/dev/tty.usbmodemXXXX
```

For this updater, use the `/dev/cu.*` device.

## What the updater does

The updater performs the following steps:

```text
Open the Pockethernet USB serial port
Read the firmware payloads from the official Linux updater file
Enter the Pockethernet firmware update flow
Write the firmware payloads
Ask the device to validate the firmware
Set the Pockethernet LEDs green when validation succeeds
Set the Pockethernet LEDs red when an error occurs
```

The updater contains the update protocol implementation, but it does not contain the firmware itself.

## Technical summary

The official Linux updater is an x86_64 Linux executable. macOS cannot run it directly.

The macOS updater extracts embedded firmware payloads from the official Linux updater file and sends them to the device over USB CDC serial.

The update protocol uses:

```text
USB CDC serial
115200 baud
COBS packet framing
0x00 packet delimiter
CRC16 validation
Little endian command values
```

Each updater is intentionally version specific. An updater should only be used with the official Linux updater file for the matching firmware version.

## Adding support for another firmware version

Support for another firmware version should only be added after the official Linux updater for that version has been inspected and tested.

Do not assume that firmware versions share the same embedded payload offsets or update layout.

A new version should only be marked as tested after it has been successfully used on a real Pockethernet v1.

## Safety checklist

Before flashing, check the following:

```text
Download the official Pockethernet Linux updater from https://pockethernet.com/firmware.html
Use the updater that matches the firmware version
Run the dry run first
Use a reliable USB cable
Keep your Mac connected to power if possible
Do not let your Mac go to sleep during flashing
Do not disconnect the Pockethernet during flashing
```

If the update fails, do not repeatedly retry with random files or unknown firmware versions. Use only the matching official updater file for the updater version.

## License

This project is licensed under the MIT License.

The license only applies to the code in this project. Pockethernet firmware and official Pockethernet updater binaries are not included and are not covered by this license.

## Credits

This project exists because Pockethernet v1 users on macOS have no official native firmware updater available.
