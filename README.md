# Pockethernet v1 macOS firmware updater

[![GitHub Release](https://img.shields.io/github/v/release/emtronictech/pockethernet-v1-macos-updater?include_prereleases&style=for-the-badge)](https://github.com/emtronictech/pockethernet-v1-macos-updater/releases)

⚠️ **Use at your own risk.**

Unofficial Python firmware updater for Pockethernet v1 on macOS.

This project makes it possible to update a Pockethernet v1 from macOS by using the official Pockethernet Linux firmware updater file as the firmware source.

The Python script does **not** execute the Linux binary. Instead, it extracts the embedded firmware payloads from the official updater file and flashes them to the Pockethernet over USB serial.

## Why this project exists

Pockethernet provides official firmware update tools for Windows and Linux, but there is no official macOS updater for Pockethernet v1.

The official Linux updater is distributed as a Linux executable. macOS cannot run this executable directly because it is not a macOS binary.

This project provides Python based updater scripts that work natively on macOS by using `pyserial` to communicate with the Pockethernet over USB.

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

## Supported firmware versions

<table>
  <thead>
    <tr>
      <th>Firmware version</th>
      <th>Status</th>
      <th>Release</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>v33</td>
      <td>Tested</td>
      <td><a href="https://github.com/emtronictech/pockethernet-v1-macos-updater/releases/tag/v33">Release v33</a></td>
    </tr>
  </tbody>
</table>

Future firmware versions can be added when their official updater layout has been inspected and tested.

## Requirements

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

## How to use

Choose the firmware version you want to install from the supported versions table.

Each version has its own instructions and updater script.

General process:

```text
Download the official Pockethernet Linux updater for the firmware version
Download the matching macOS Python updater script from this project
Place both files in the same directory on your Mac
Run the dry run command first
Flash the firmware only if the dry run succeeds
```

For exact commands, serial port instructions and version specific details, read the README for the firmware version you want to install.

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

The Python updater scripts contain the update protocol implementation, but they do not contain the firmware itself.

## Technical summary

The official Linux updater is an x86_64 Linux executable. macOS cannot run it directly.

The macOS Python updater extracts embedded firmware payloads from the official Linux updater file and sends them to the device over USB CDC serial.

The update protocol uses:

```text
USB CDC serial
115200 baud
COBS packet framing
0x00 packet delimiter
CRC16 validation
Little endian command values
```

Each updater script is intentionally version specific. A script should only be used with the official Linux updater file for the matching firmware version.

## Adding support for another firmware version

Support for another firmware version should only be added after the official Linux updater for that version has been inspected and tested.

Do not assume that firmware versions share the same embedded payload offsets or update layout.

A new version should only be marked as tested after it has been successfully used on a real Pockethernet v1.

## Safety checklist

Before flashing, check the following:

<table>
  <thead>
    <tr>
      <th>Check</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Official updater file</td>
      <td>Download the official Pockethernet Linux updater from https://pockethernet.com/firmware.html</td>
    </tr>
    <tr>
      <td>Matching version</td>
      <td>Use the script that matches the firmware version</td>
    </tr>
    <tr>
      <td>Dry run</td>
      <td>Run the dry run command first</td>
    </tr>
    <tr>
      <td>USB cable</td>
      <td>Use a reliable USB cable</td>
    </tr>
    <tr>
      <td>Power</td>
      <td>Keep your Mac connected to power if possible</td>
    </tr>
    <tr>
      <td>Sleep mode</td>
      <td>Do not let your Mac go to sleep during flashing</td>
    </tr>
    <tr>
      <td>Connection</td>
      <td>Do not disconnect the Pockethernet during flashing</td>
    </tr>
  </tbody>
</table>

If the update fails, do not repeatedly retry with random files or unknown firmware versions. Use only the matching official updater file for the script version.

## License

This project is licensed under the MIT License.

The license only applies to the code in this project. Pockethernet firmware and official Pockethernet updater binaries are not included and are not covered by this license.

## Credits

This project exists because Pockethernet v1 users on macOS have no official native firmware updater available.
