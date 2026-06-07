# Pockethernet v1 macOS firmware updater

⚠️ **Use at your own risk.**

Unofficial Python firmware updater for Pockethernet v1 on macOS.

This project makes it possible to update a Pockethernet v1 from macOS by using the official Pockethernet Linux firmware updater file as the firmware source.

The Python script does **not** execute the Linux binary. Instead, it extracts the embedded firmware payloads from the official updater file and flashes them to the Pockethernet over USB serial.

## Why this project exists

Pockethernet provides official firmware update tools for Windows and Linux, but there is no official macOS updater for Pockethernet v1.

The official Linux updater is distributed as a Linux executable. macOS cannot run this executable directly because it is not a macOS binary.

This project provides a small Python based updater that works natively on macOS by using `pyserial` to communicate with the Pockethernet over USB.

## ⚠️ Important warning

This is an unofficial project.

It is not affiliated with, endorsed by, or supported by Pockethernet.

Firmware flashing always carries a risk. A failed update may leave your device in an unusable state. Use this tool only if you understand and accept that risk.

Do not unplug the Pockethernet while updating. Make sure your Mac has enough battery power or is connected to power before starting the update.

This project does **not** include, redistribute, modify, or host any Pockethernet firmware.

You must download the official Pockethernet Linux updater yourself from the official Pockethernet firmware page:

https://pockethernet.com/firmware.html

The official firmware updater is intentionally not included in this repository.

The MIT License in this repository only applies to the code in this repository. Pockethernet firmware and official Pockethernet updater binaries remain property of their respective owners.

## Supported firmware versions

<table>
  <thead>
    <tr>
      <th>Firmware version</th>
      <th>Status</th>
      <th>Folder</th>
      <th>Script</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>v33</td>
      <td>Tested</td>
      <td><code>v33/</code></td>
      <td><code>pockethernet_v33_macos_updater.py</code></td>
    </tr>
  </tbody>
</table>

Future firmware versions can be added in their own version folder, for example `v34/`, when their official updater layout has been inspected and tested.

## Repository structure

```text
pockethernet-v1-macos-updater/
  README.md
  LICENSE
  .gitignore

  v33/
    README.md
    pockethernet_v33_macos_updater.py
```

The root README gives a general overview of the project.

Each firmware version folder contains its own README with version specific usage instructions.

## Requirements

You need the following:

```text
macOS
Python 3
pyserial
Pockethernet v1
Official Pockethernet v1 Linux firmware updater for the matching firmware version
```

For v33, download the official Pockethernet v33 Linux updater from:

https://pockethernet.com/firmware.html

The required official updater file is expected to be:

```text
pockethernet-v33-fwupgrade
```

The official updater file is not included in this repository.

## Installing pyserial

Install `pyserial` with pip:

```bash
python3 -m pip install pyserial
```

If you use a virtual environment, activate it first and then install `pyserial`.

## Basic usage

Go to the folder for the firmware version you want to install.

For v33:

```bash
cd v33
```

Place the official Pockethernet Linux updater file next to the Python script:

```text
v33/
  pockethernet_v33_macos_updater.py
  pockethernet-v33-fwupgrade
```

List available serial ports:

```bash
python3 pockethernet_v33_macos_updater.py --list-ports
```

On macOS, the Pockethernet usually appears as something like:

```text
/dev/cu.usbmodemXXXX
```

Run a dry run first:

```bash
python3 pockethernet_v33_macos_updater.py --dry-run dummy ./pockethernet-v33-fwupgrade
```

If the dry run succeeds, flash the firmware:

```bash
python3 pockethernet_v33_macos_updater.py /dev/cu.usbmodemXXXX ./pockethernet-v33-fwupgrade
```

Replace `/dev/cu.usbmodemXXXX` with the actual serial port shown on your Mac.

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
Write the main firmware payload
Write the second small payload
Ask the device to validate the firmware
Set the Pockethernet LEDs green when validation succeeds
Set the Pockethernet LEDs red when an error occurs
```

The Python script contains the update protocol implementation, but it does not contain the firmware itself.

## Technical summary

The v33 updater script was created by inspecting the official Pockethernet v33 Linux updater.

The official Linux updater is an x86_64 Linux executable. Inside that executable are two embedded firmware payloads.

The macOS Python updater extracts those payloads from the official updater file and sends them to the device over USB CDC serial.

The update protocol uses:

```text
USB CDC serial
115200 baud
COBS packet framing
0x00 packet delimiter
CRC16 validation
Little endian command values
```

The v33 script is intentionally version specific. It expects the known v33 updater layout and refuses to continue if the expected firmware payloads cannot be extracted.

## Firmware files are intentionally ignored

The `.gitignore` should exclude official Pockethernet updater and firmware files.

Recommended extra entries:

```gitignore
# Pockethernet official updater and firmware files
pockethernet-v*-fwupgrade
pockethernet-v*-fwupgrade*
*.tar.gz
*.zip

# Local output and debug files
*.log
*.bin
*.hex
*.dump

# macOS
.DS_Store
```

This helps prevent accidental redistribution of official Pockethernet firmware or updater files.

## Adding support for another firmware version

Support for another firmware version should be added in a separate folder.

Example:

```text
v34/
  README.md
  pockethernet_v34_macos_updater.py
```

Before adding a new version, the official Linux updater for that version should be inspected and tested. Do not assume that firmware versions share the same embedded payload offsets or update layout.

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

The license only applies to the code in this repository. Pockethernet firmware and official Pockethernet updater binaries are not included and are not covered by this license.

## Credits

This project exists because Pockethernet v1 users on macOS have no official native firmware updater available.

The updater was tested with Pockethernet v1 firmware v33 on macOS.
