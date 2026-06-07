#!/usr/bin/env python3
"""
Unofficial Pockethernet v1 firmware v33 updater for macOS and Linux.

Project:
https://github.com/emtronictech/pockethernet-v1-macos-updater

This script does not contain Pockethernet firmware. It extracts the firmware
payloads from the official Pockethernet v33 Linux updater file.

Use at your own risk.
"""

from __future__ import annotations

import argparse
import struct
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_URL = "https://github.com/emtronictech/pockethernet-v1-macos-updater"

BAUDRATE = 115200
SERIAL_TIMEOUT = 0.25
WRITE_TIMEOUT = 5

CMD_BOOT_STAGE = 0xF001
CMD_WRITE_DATA = 0xF002
CMD_SET_ADDRESS = 0xF003
CMD_VALIDATE = 0xF005
CMD_SET_LED = 0xF006

VALIDATE_OK = 0xF0FA

FW1_DATA_OFFSET = 0x4060
FW1_LEN_OFFSET = 0x1C9B8
FW2_DATA_OFFSET = 0x4020
FW2_LEN_OFFSET = 0x4040

EXPECTED_FW1_LEN = 0x18958
EXPECTED_FW2_LEN = 0x20

ADDR_FW1 = 0x08010000
ADDR_FW2 = 0x0803FFE0

CHUNK_SIZE = 0x800
MAX_PAYLOAD_SIZE = 0x0FE9
MAX_FRAME_SIZE = 0x1000

_serial: Any | None = None
_list_ports: Any | None = None


def require_pyserial() -> tuple[Any, Any]:
    global _serial, _list_ports

    if _serial is None or _list_ports is None:
        try:
            import serial as serial_module
            from serial.tools import list_ports as list_ports_module
        except ImportError as exc:
            raise RuntimeError(
                "pyserial is required. Install it with: python3 -m pip install pyserial"
            ) from exc

        _serial = serial_module
        _list_ports = list_ports_module

    return _serial, _list_ports


def crc16_pockethernet(data: bytes, count: int, initial: int = 0xFFFF) -> int:
    crc = initial & 0xFFFF

    for value in data[:count]:
        tmp = ((crc >> 8) ^ value) & 0xFF
        tmp ^= tmp >> 4
        crc = ((crc << 8) ^ (tmp << 12) ^ (tmp << 5) ^ tmp) & 0xFFFF

    return crc


def cobs_encode(data: bytes) -> bytes:
    output = bytearray()
    code_index = 0
    code = 1

    output.append(0)

    for value in data:
        if value == 0:
            output[code_index] = code
            code_index = len(output)
            output.append(0)
            code = 1
            continue

        output.append(value)
        code += 1

        if code == 0xFF:
            output[code_index] = code
            code_index = len(output)
            output.append(0)
            code = 1

    output[code_index] = code
    return bytes(output)


def cobs_decode(data: bytes) -> bytes:
    output = bytearray()
    index = 0

    while index < len(data):
        code = data[index]

        if code == 0:
            raise ValueError("COBS packet contains zero")

        if index + code > len(data) and code != 1:
            raise ValueError("COBS packet is truncated")

        index += 1

        for _ in range(1, code):
            if index >= len(data):
                raise ValueError("COBS packet is truncated")
            output.append(data[index])
            index += 1

        if code != 0xFF and index != len(data):
            output.append(0)

    return bytes(output)


def build_packet(command: int, payload: bytes = b"") -> bytes:
    if len(payload) > MAX_PAYLOAD_SIZE:
        raise ValueError("payload too large")

    body = bytearray()
    body += struct.pack("<H", command)
    body += b"\x00\x00"
    body += payload

    crc_count = len(body) & 0xFF
    crc = crc16_pockethernet(bytes(body), crc_count)
    body[2:4] = struct.pack("<H", crc)

    return b"\x00" + cobs_encode(bytes(body)) + b"\x00"


def parse_packet(frame: bytes) -> tuple[int, bytes]:
    body = bytearray(cobs_decode(frame))

    if len(body) < 4:
        raise ValueError("packet too short")

    received_crc = struct.unpack_from("<H", body, 2)[0]
    body[2:4] = b"\x00\x00"

    crc_count = len(body) & 0xFF
    calculated_crc = crc16_pockethernet(bytes(body), crc_count)

    if received_crc != calculated_crc:
        raise ValueError(
            f"CRC mismatch: got 0x{received_crc:04x}, expected 0x{calculated_crc:04x}"
        )

    command = struct.unpack_from("<H", body, 0)[0]
    payload = bytes(body[4:])

    return command, payload


def read_packet(port: Any, timeout_ms: int) -> tuple[int, bytes]:
    deadline = time.monotonic() + timeout_ms / 1000.0
    frame = bytearray()
    in_frame = False

    while time.monotonic() < deadline:
        remaining = max(0.01, deadline - time.monotonic())
        port.timeout = min(SERIAL_TIMEOUT, remaining)

        data = port.read(1)
        if not data:
            continue

        value = data[0]

        if value == 0:
            if in_frame and len(frame) > 3:
                return parse_packet(bytes(frame))

            frame.clear()
            in_frame = False
            continue

        in_frame = True
        frame.append(value)

        if len(frame) > MAX_FRAME_SIZE:
            frame.clear()
            in_frame = False

    raise TimeoutError("timeout waiting for Pockethernet response")


def send_command(
    port: Any,
    command: int,
    payload: bytes = b"",
    timeout_ms: int = 2000,
) -> tuple[int, bytes]:
    port.write(build_packet(command, payload))
    port.flush()
    return read_packet(port, timeout_ms)


def require_command(
    port: Any,
    command: int,
    payload: bytes,
    timeout_ms: int,
    error_code: int,
) -> tuple[int, bytes]:
    try:
        return send_command(port, command, payload, timeout_ms)
    except Exception as exc:
        raise RuntimeError(
            f"Cannot communicate with Pockethernet (error {error_code}): {exc}"
        ) from exc


def read_u32(data: bytes, offset: int) -> int:
    if offset + 4 > len(data):
        raise ValueError(f"offset 0x{offset:x} is outside the updater file")

    return struct.unpack_from("<I", data, offset)[0]


def extract_payloads(updater_path: Path) -> tuple[bytes, bytes]:
    data = updater_path.read_bytes()

    fw1_len = read_u32(data, FW1_LEN_OFFSET)
    fw2_len = read_u32(data, FW2_LEN_OFFSET)

    fw1_end = FW1_DATA_OFFSET + fw1_len
    fw2_end = FW2_DATA_OFFSET + fw2_len

    if fw1_end > len(data) or fw2_end > len(data):
        raise ValueError("firmware offsets do not fit inside this updater file")

    if fw1_len != EXPECTED_FW1_LEN or fw2_len != EXPECTED_FW2_LEN:
        print(
            "Warning: unexpected firmware payload lengths. "
            f"fw1=0x{fw1_len:x}, fw2=0x{fw2_len:x}. "
            "This script was built for firmware v33.",
            file=sys.stderr,
        )

    return (
        data[FW1_DATA_OFFSET:fw1_end],
        data[FW2_DATA_OFFSET:fw2_end],
    )


def write_payload(port: Any, payload: bytes, error_code: int) -> None:
    total = len(payload)
    sent = 0

    while sent < total:
        chunk = payload[sent : sent + CHUNK_SIZE]
        packet_payload = struct.pack("<H", len(chunk)) + chunk

        require_command(port, CMD_WRITE_DATA, packet_payload, 2000, error_code)

        sent += len(chunk)
        progress = sent * 100 / total
        print(f"  {sent:6d}/{total:6d} bytes  {progress:5.1f}%")


def set_leds(port: Any, mode: int) -> None:
    for led in range(1, 5):
        try:
            send_command(port, CMD_SET_LED, bytes([led, mode]), 2000)
        except Exception:
            pass


def list_serial_ports() -> None:
    _, list_ports = require_pyserial()
    ports = list(list_ports.comports())

    if not ports:
        print("No serial ports found.")
        return

    for port in ports:
        print(f"{port.device}\t{port.description}")


def run_update(args: argparse.Namespace) -> int:
    updater_path = Path(args.updater_binary)
    fw1, fw2 = extract_payloads(updater_path)

    print(f"Extracted payloads: fw1={len(fw1)} bytes, fw2={len(fw2)} bytes")

    if args.dry_run:
        print("Dry run complete. No serial port was opened.")
        return 0

    serial_module, _ = require_pyserial()

    with serial_module.Serial(
        args.port,
        baudrate=BAUDRATE,
        timeout=SERIAL_TIMEOUT,
        write_timeout=WRITE_TIMEOUT,
    ) as port:
        try:
            port.reset_input_buffer()
            port.reset_output_buffer()
        except Exception:
            pass

        print("Upgrade in progress")

        for led in range(1, 5):
            require_command(port, CMD_SET_LED, bytes([led, 2]), 2000, 4)

        require_command(port, CMD_BOOT_STAGE, b"\x04", 5000, 5)
        require_command(port, CMD_BOOT_STAGE, b"\x05", 5000, 6)

        require_command(port, CMD_SET_ADDRESS, struct.pack("<I", ADDR_FW1), 2000, 7)
        print("Writing main firmware payload")
        write_payload(port, fw1, 8)

        require_command(port, CMD_SET_ADDRESS, struct.pack("<I", ADDR_FW2), 2000, 9)
        print("Writing small tail payload")
        write_payload(port, fw2, 10)

        print("Program download complete. Validating.")
        command, payload = require_command(port, CMD_VALIDATE, b"", 2000, 11)

        if command == VALIDATE_OK:
            set_leds(port, 1)
            print("Firmware upgrade complete. You can now unplug the device.")
            return 0

        set_leds(port, 0)
        print(
            "Firmware upgrade failed. "
            f"Validation response was 0x{command:04x}, payload {payload.hex()}."
        )
        return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Unofficial Pockethernet v1 firmware v33 updater for macOS",
        epilog=f"Project: {PROJECT_URL}",
    )
    parser.add_argument(
        "port",
        nargs="?",
        help="Serial port, for example /dev/cu.usbmodemXXXX on macOS",
    )
    parser.add_argument(
        "updater_binary",
        nargs="?",
        help="Official pockethernet-v33-fwupgrade Linux updater file",
    )
    parser.add_argument(
        "--list-ports",
        action="store_true",
        help="List serial ports and exit",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract payloads only. Do not open the serial port.",
    )

    args = parser.parse_args()

    if args.list_ports:
        return args

    if not args.port or not args.updater_binary:
        parser.error("port and updater_binary are required unless --list-ports is used")

    return args


def main() -> int:
    args = parse_args()

    if args.list_ports:
        list_serial_ports()
        return 0

    return run_update(args)


if __name__ == "__main__":
    raise SystemExit(main())
