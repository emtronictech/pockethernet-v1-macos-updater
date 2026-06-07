#!/usr/bin/env python3
"""
Experimental macOS/Linux Pockethernet v1 firmware v33 updater.

This script does not contain the Pockethernet firmware. It extracts the firmware
payloads from the official Linux updater binary that you provide as input.

Tested by static reverse engineering only. Use at your own risk. Prefer the
official Windows or Linux updater if available.
"""

from __future__ import annotations

import argparse
import struct
import sys
import time
from pathlib import Path

serial = None
list_ports = None


def require_pyserial() -> None:
    global serial, list_ports
    if serial is not None:
        return
    try:
        import serial as serial_module
        from serial.tools import list_ports as list_ports_module
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("pyserial is required. Install it with: python3 -m pip install pyserial") from exc
    serial = serial_module
    list_ports = list_ports_module


CMD_SET_LED = 0xF006
CMD_BOOT_STAGE = 0xF001
CMD_SET_ADDRESS = 0xF003
CMD_WRITE_DATA = 0xF002
CMD_VALIDATE = 0xF005
VALIDATE_OK = 0xF0FA

# Offsets for the uploaded official pockethernet-v33-fwupgrade Linux x86_64 binary.
FW1_LEN_OFFSET = 0x1C9B8
FW1_DATA_OFFSET = 0x4060
FW2_LEN_OFFSET = 0x4040
FW2_DATA_OFFSET = 0x4020

ADDR_FW1 = 0x08010000
ADDR_FW2 = 0x0803FFE0
CHUNK_SIZE = 0x800


def crc16_pockethernet(data: bytes, count: int, initial: int = 0xFFFF) -> int:
    """CRC routine copied from the official updater logic."""
    crc = initial & 0xFFFF
    for b in data[:count]:
        tmp = ((crc >> 8) ^ b) & 0xFF
        tmp ^= tmp >> 4
        crc = ((crc << 8) ^ (tmp << 12) ^ (tmp << 5) ^ tmp) & 0xFFFF
    return crc


def cobs_encode(data: bytes) -> bytes:
    """COBS encoder matching the official updater."""
    out = bytearray()
    code_index = 0
    out.append(0)
    code = 1

    for b in data:
        if b == 0:
            out[code_index] = code
            code_index = len(out)
            out.append(0)
            code = 1
        else:
            out.append(b)
            code += 1
            if code == 0xFF:
                out[code_index] = code
                code_index = len(out)
                out.append(0)
                code = 1

    out[code_index] = code
    return bytes(out)


def cobs_decode(data: bytes) -> bytes:
    """COBS decoder matching the official updater."""
    out = bytearray()
    i = 0
    n = len(data)

    while i < n:
        code = data[i]
        if code == 0:
            raise ValueError("COBS packet contains zero")
        if i + code > n and code != 1:
            raise ValueError("COBS packet is truncated")
        i += 1
        copied = 1
        while copied < code:
            if i >= n:
                raise ValueError("COBS packet is truncated")
            out.append(data[i])
            i += 1
            copied += 1
        if code != 0xFF and i != n:
            out.append(0)

    return bytes(out)


def build_packet(command: int, payload: bytes = b"") -> bytes:
    if len(payload) > 0x0FE9:
        raise ValueError("payload too large")

    body = bytearray()
    body += struct.pack("<H", command)
    body += b"\x00\x00"
    body += payload

    count = len(body) & 0xFF
    crc = crc16_pockethernet(bytes(body), count)
    body[2:4] = struct.pack("<H", crc)

    return b"\x00" + cobs_encode(bytes(body)) + b"\x00"


def parse_packet(frame: bytes) -> tuple[int, bytes]:
    body = bytearray(cobs_decode(frame))
    if len(body) < 4:
        raise ValueError("packet too short")

    received_crc = struct.unpack_from("<H", body, 2)[0]
    body[2:4] = b"\x00\x00"
    count = len(body) & 0xFF
    calculated_crc = crc16_pockethernet(bytes(body), count)
    if received_crc != calculated_crc:
        raise ValueError(f"CRC mismatch: got 0x{received_crc:04x}, expected 0x{calculated_crc:04x}")

    command = struct.unpack_from("<H", body, 0)[0]
    return command, bytes(body[4:])


def read_packet(port, timeout_ms: int) -> tuple[int, bytes]:
    deadline = time.monotonic() + timeout_ms / 1000.0
    frame = bytearray()
    in_frame = False

    while time.monotonic() < deadline:
        remaining = max(0.01, deadline - time.monotonic())
        port.timeout = min(0.25, remaining)
        b = port.read(1)
        if not b:
            continue

        value = b[0]
        if value == 0:
            if in_frame and len(frame) > 3:
                return parse_packet(bytes(frame))
            frame.clear()
            in_frame = False
            continue

        in_frame = True
        frame.append(value)
        if len(frame) > 0x1000:
            frame.clear()
            in_frame = False

    raise TimeoutError("timeout waiting for Pockethernet response")


def send_command(port, command: int, payload: bytes = b"", timeout_ms: int = 2000) -> tuple[int, bytes]:
    port.write(build_packet(command, payload))
    port.flush()
    return read_packet(port, timeout_ms)


def require_command(port, command: int, payload: bytes, timeout_ms: int, err_no: int) -> tuple[int, bytes]:
    try:
        return send_command(port, command, payload, timeout_ms)
    except Exception as exc:
        raise RuntimeError(f"Can't communicate with Pockethernet (err: {err_no}): {exc}") from exc


def read_u32(data: bytes, offset: int) -> int:
    if offset + 4 > len(data):
        raise ValueError(f"offset 0x{offset:x} outside updater binary")
    return struct.unpack_from("<I", data, offset)[0]


def extract_payloads(updater_path: Path) -> tuple[bytes, bytes]:
    data = updater_path.read_bytes()

    fw1_len = read_u32(data, FW1_LEN_OFFSET)
    fw2_len = read_u32(data, FW2_LEN_OFFSET)

    fw1_end = FW1_DATA_OFFSET + fw1_len
    fw2_end = FW2_DATA_OFFSET + fw2_len
    if fw1_end > len(data) or fw2_end > len(data):
        raise ValueError("firmware offsets do not fit in this updater binary")

    fw1 = data[FW1_DATA_OFFSET:fw1_end]
    fw2 = data[FW2_DATA_OFFSET:fw2_end]

    if fw1_len != 0x18958 or fw2_len != 0x20:
        print(
            f"Warning: unexpected payload lengths fw1=0x{fw1_len:x}, fw2=0x{fw2_len:x}. "
            "This script was built for v33.",
            file=sys.stderr,
        )

    return fw1, fw2


def write_payload(port, payload: bytes, err_no: int) -> None:
    total = len(payload)
    sent = 0
    while sent < total:
        chunk = payload[sent:sent + CHUNK_SIZE]
        packet_payload = struct.pack("<H", len(chunk)) + chunk
        require_command(port, CMD_WRITE_DATA, packet_payload, 2000, err_no)
        sent += len(chunk)
        pct = sent * 100 / total
        print(f"  {sent:6d}/{total:6d} bytes  {pct:5.1f}%")


def set_leds(port, mode: int) -> None:
    for led in range(1, 5):
        try:
            send_command(port, CMD_SET_LED, bytes([led, mode]), 2000)
        except Exception:
            pass


def list_serial_ports() -> None:
    require_pyserial()
    ports = list(list_ports.comports())
    if not ports:
        print("No serial ports found.")
        return
    for p in ports:
        print(f"{p.device}\t{p.description}")


def run_update(args: argparse.Namespace) -> int:
    fw1, fw2 = extract_payloads(Path(args.updater_binary))
    print(f"Extracted payloads: fw1={len(fw1)} bytes, fw2={len(fw2)} bytes")

    if args.dry_run:
        print("Dry run complete. No serial port was opened.")
        return 0

    require_pyserial()
    with serial.Serial(args.port, baudrate=115200, timeout=0.25, write_timeout=5) as port:
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

        print("Program download complete, validating")
        command, payload = require_command(port, CMD_VALIDATE, b"", 2000, 11)

        if command == VALIDATE_OK:
            set_leds(port, 1)
            print("Firmware upgrade complete. You can now unplug the device.")
            return 0

        set_leds(port, 0)
        print(f"Firmware upgrade failed. Validation response was 0x{command:04x}, payload {payload.hex()}.")
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Experimental Pockethernet v33 macOS/Linux updater")
    parser.add_argument("port", nargs="?", help="Serial port, for example /dev/cu.usbmodemXXXX on macOS")
    parser.add_argument("updater_binary", nargs="?", help="Official pockethernet-v33-fwupgrade Linux binary")
    parser.add_argument("--list-ports", action="store_true", help="List serial ports and exit")
    parser.add_argument("--dry-run", action="store_true", help="Extract payloads only, do not open the serial port")
    args = parser.parse_args()

    if args.list_ports:
        list_serial_ports()
        return 0

    if not args.port or not args.updater_binary:
        parser.error("port and updater_binary are required unless --list-ports is used")

    return run_update(args)


if __name__ == "__main__":
    raise SystemExit(main())
