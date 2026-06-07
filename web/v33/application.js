'use strict';

const GITHUB_PROJECT = 'https://github.com/emtronictech/pockethernet-v1-macos-updater';

const REQUIRED_FILE_NAME = 'pockethernet-v33-fwupgrade';

const FW1_LEN_OFFSET = 0x1C9B8;
const FW1_DATA_OFFSET = 0x4060;
const FW2_LEN_OFFSET = 0x4040;
const FW2_DATA_OFFSET = 0x4020;
const EXPECTED_FW1_LEN = 0x18958;
const EXPECTED_FW2_LEN = 0x20;

const CMD_SET_LED = 0xF006;
const CMD_BOOT_STAGE = 0xF001;
const CMD_SET_ADDRESS = 0xF003;
const CMD_WRITE_DATA = 0xF002;
const CMD_VALIDATE = 0xF005;
const VALIDATE_OK = 0xF0FA;

const ADDR_FW1 = 0x08010000;
const ADDR_FW2 = 0x0803FFE0;
const CHUNK_SIZE = 0x800;
const BAUD_RATE = 115200;

const STEPS = [
    {
        id: 'file',
        number: 1,
        title: 'Select firmware file',
        eyebrow: 'Step 1',
        description: 'Choose the official Pockethernet v33 Linux updater file from your Mac.',
        waiting: 'Waiting for file',
        ok: 'Firmware file selected',
        error: 'File selection failed',
        panelId: 'stepPanelFile',
    },
    {
        id: 'dryRun',
        number: 2,
        title: 'Dry run validation',
        eyebrow: 'Step 2',
        description: 'Validate the updater file before any serial connection or flashing is attempted.',
        waiting: 'Required before serial connection',
        ok: 'Dry run passed',
        error: 'Dry run failed',
        panelId: 'stepPanelDryRun',
    },
    {
        id: 'connect',
        number: 3,
        title: 'Connect Pockethernet',
        eyebrow: 'Step 3',
        description: 'Connect the Pockethernet v1 over USB and select the serial port.',
        waiting: 'Required before flashing',
        ok: 'Serial port connected',
        error: 'Serial connection failed',
        panelId: 'stepPanelConnect',
    },
    {
        id: 'flash',
        number: 4,
        title: 'Flash firmware',
        eyebrow: 'Step 4',
        description: 'Flash firmware v33 after the file has passed validation and the serial port is connected.',
        waiting: 'Ready after validation and connection',
        ok: 'Firmware upgrade successful',
        error: 'Firmware upgrade failed',
        panelId: 'stepPanelFlash',
    },
];

const state = {
    file: null,
    fw1: null,
    fw2: null,
    dryRunOk: false,
    port: null,
    reader: null,
    writer: null,
    readLoopActive: false,
    rxBytes: [],
    connected: false,
    flashing: false,
    flashComplete: false,
    flashSucceeded: false,
    errors: {
        file: null,
        dryRun: null,
        connect: null,
        flash: null,
    },
};

const els = {
    supportAlert: document.getElementById('supportAlert'),
    firmwareFile: document.getElementById('firmwareFile'),
    dryRunButton: document.getElementById('dryRunButton'),
    connectButton: document.getElementById('connectButton'),
    disconnectButton: document.getElementById('disconnectButton'),
    flashButton: document.getElementById('flashButton'),
    progressBar: document.getElementById('progressBar'),
    flashStatus: document.getElementById('flashStatus'),
    flashResult: document.getElementById('flashResult'),
    log: document.getElementById('log'),
    clearLogButton: document.getElementById('clearLogButton'),
    overallBadge: document.getElementById('overallBadge'),
    timeline: document.getElementById('timeline'),
    activeStepIcon: document.getElementById('activeStepIcon'),
    activeStepEyebrow: document.getElementById('activeStepEyebrow'),
    activeStepTitle: document.getElementById('activeStepTitle'),
    activeStepDescription: document.getElementById('activeStepDescription'),
    stepPanelFile: document.getElementById('stepPanelFile'),
    stepPanelDryRun: document.getElementById('stepPanelDryRun'),
    stepPanelConnect: document.getElementById('stepPanelConnect'),
    stepPanelFlash: document.getElementById('stepPanelFlash'),
};

function requireElement(name, element) {
    if (!element) {
        throw new Error(`Missing required HTML element: ${name}`);
    }
}

Object.entries(els).forEach(([name, element]) => {
    if (name !== 'clearLogButton') {
        requireElement(name, element);
    }
});

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function log(message) {
    const time = new Date().toLocaleTimeString();
    els.log.textContent = `[${time}] ${message}\n` + els.log.textContent;
    els.log.scrollTop = 0;
}

function hasSerialSupport() {
    return 'serial' in navigator;
}

function setStatus(message) {
    els.flashStatus.textContent = message;
}

function setProgress(percent, label = null) {
    const value = Math.max(0, Math.min(100, percent));
    const text = label || `${value.toFixed(1)}%`;

    els.progressBar.style.width = `${value.toFixed(1)}%`;
    els.progressBar.textContent = text;
    els.progressBar.setAttribute('aria-valuenow', String(Math.round(value)));
}

function getFlashProgressContainer() {
    return els.progressBar.closest('.progress') || els.progressBar;
}

function getFlashResultBox() {
    if (els.flashResult) {
        return els.flashResult;
    }

    const resultBox = document.createElement('div');
    resultBox.id = 'flashResult';
    resultBox.className = 'alert d-none mt-4 mb-0';
    resultBox.setAttribute('role', 'alert');
    els.flashStatus.insertAdjacentElement('afterend', resultBox);
    els.flashResult = resultBox;

    return resultBox;
}

function resetFlashResult() {
    state.flashComplete = false;
    state.flashSucceeded = false;
    state.errors.flash = null;

    const resultBox = getFlashResultBox();
    resultBox.className = 'alert d-none mt-4 mb-0';
    resultBox.innerHTML = '';

    els.flashButton.classList.remove('d-none');
    getFlashProgressContainer().classList.remove('d-none');

    setProgress(0, '0%');
}

function showFinalFlashResult(success, title, message) {
    state.flashComplete = true;
    state.flashSucceeded = success;
    state.errors.flash = success ? null : message;

    updateUi();

    window.setTimeout(() => {
        els.flashButton.classList.add('d-none');
        getFlashProgressContainer().classList.add('d-none');

        const resultBox = getFlashResultBox();
        resultBox.className = `alert mt-4 mb-0 ${success ? 'alert-success' : 'alert-danger'}`;
        resultBox.innerHTML = `
      <div class="fw-semibold mb-1">${escapeHtml(title)}</div>
      <div>${escapeHtml(message)}</div>
    `;

        setStatus(success ? 'Firmware upgrade complete.' : 'Firmware upgrade failed.');
        updateUi();
    }, 500);
}

function getStepStatus(stepId) {
    if (state.errors[stepId]) {
        return 'error';
    }

    if (stepId === 'file') {
        return state.file ? 'ok' : 'waiting';
    }

    if (stepId === 'dryRun') {
        return state.dryRunOk ? 'ok' : 'waiting';
    }

    if (stepId === 'connect') {
        return state.connected ? 'ok' : 'waiting';
    }

    if (stepId === 'flash') {
        if (state.flashing) {
            return 'busy';
        }

        if (state.flashComplete) {
            return state.flashSucceeded ? 'ok' : 'error';
        }

        return 'waiting';
    }

    return 'waiting';
}

function getStepText(step) {
    const status = getStepStatus(step.id);

    if (status === 'ok') {
        return step.ok;
    }

    if (status === 'error') {
        return state.errors[step.id] || step.error;
    }

    if (status === 'busy') {
        return 'Flashing in progress';
    }

    return step.waiting;
}

function getActiveStep() {
    if (!state.file) {
        return STEPS[0];
    }

    if (!state.dryRunOk) {
        return STEPS[1];
    }

    if (!state.connected) {
        return STEPS[2];
    }

    return STEPS[3];
}

function updateTimeline(activeStep) {
    els.timeline.innerHTML = STEPS.map(step => {
        const status = getStepStatus(step.id);
        const active = step.id === activeStep.id;

        return `
      <div class="timeline-item timeline-${status} ${active ? 'active' : ''}">
        <div class="timeline-marker">
          <span>${step.number}</span>
        </div>
        <div class="timeline-content">
          <div class="fw-semibold">${escapeHtml(step.title)}</div>
          <div class="small text-secondary">${escapeHtml(getStepText(step))}</div>
        </div>
      </div>
    `;
    }).join('');
}

function updateActivePanel(activeStep) {
    els.activeStepIcon.textContent = String(activeStep.number);
    els.activeStepEyebrow.textContent = activeStep.eyebrow;
    els.activeStepTitle.textContent = activeStep.title;
    els.activeStepDescription.textContent = activeStep.description;

    for (const step of STEPS) {
        const panel = document.getElementById(step.panelId);
        if (panel) {
            panel.classList.toggle('d-none', step.id !== activeStep.id);
        }
    }
}

function updateOverallBadge() {
    let text = 'Waiting';
    let className = 'badge rounded-pill text-bg-secondary';

    if (state.flashing) {
        text = 'Flashing';
        className = 'badge rounded-pill text-bg-warning';
    } else if (state.flashComplete && state.flashSucceeded) {
        text = 'Complete';
        className = 'badge rounded-pill text-bg-success';
    } else if (state.flashComplete && !state.flashSucceeded) {
        text = 'Failed';
        className = 'badge rounded-pill text-bg-danger';
    } else if (state.connected) {
        text = 'Connected';
        className = 'badge rounded-pill text-bg-primary';
    } else if (state.dryRunOk) {
        text = 'Validated';
        className = 'badge rounded-pill text-bg-success';
    } else if (state.file) {
        text = 'File selected';
        className = 'badge rounded-pill text-bg-primary';
    }

    els.overallBadge.textContent = text;
    els.overallBadge.className = className;
}

function updateUi() {
    const activeStep = getActiveStep();

    els.dryRunButton.disabled = !state.file || state.flashing;
    els.connectButton.disabled = !state.dryRunOk || state.connected || state.flashing;
    els.disconnectButton.classList.toggle('d-none', !state.connected);
    els.flashButton.disabled = !state.dryRunOk || !state.connected || state.flashing || state.flashComplete;

    updateTimeline(activeStep);
    updateActivePanel(activeStep);
    updateOverallBadge();
}

function readU32LE(bytes, offset) {
    if (offset + 4 > bytes.length) {
        throw new Error(`Offset 0x${offset.toString(16)} is outside the updater file`);
    }

    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function extractPayloads(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
        throw new Error('The selected file is not a Linux ELF executable');
    }

    const fw1Len = readU32LE(bytes, FW1_LEN_OFFSET);
    const fw2Len = readU32LE(bytes, FW2_LEN_OFFSET);

    if (fw1Len !== EXPECTED_FW1_LEN || fw2Len !== EXPECTED_FW2_LEN) {
        throw new Error(`Unexpected payload lengths: fw1=${fw1Len}, fw2=${fw2Len}`);
    }

    const fw1End = FW1_DATA_OFFSET + fw1Len;
    const fw2End = FW2_DATA_OFFSET + fw2Len;

    if (fw1End > bytes.length || fw2End > bytes.length) {
        throw new Error('Firmware payload offsets do not fit inside the selected file');
    }

    return {
        fw1: bytes.slice(FW1_DATA_OFFSET, fw1End),
        fw2: bytes.slice(FW2_DATA_OFFSET, fw2End),
    };
}

function crc16Pockethernet(data, count, initial = 0xffff) {
    let crc = initial & 0xffff;

    for (let i = 0; i < count; i += 1) {
        const b = data[i];
        let tmp = ((crc >> 8) ^ b) & 0xff;
        tmp ^= tmp >> 4;
        crc = ((crc << 8) ^ (tmp << 12) ^ (tmp << 5) ^ tmp) & 0xffff;
    }

    return crc & 0xffff;
}

function cobsEncode(data) {
    const out = [0];
    let codeIndex = 0;
    let code = 1;

    for (const b of data) {
        if (b === 0) {
            out[codeIndex] = code;
            codeIndex = out.length;
            out.push(0);
            code = 1;
        } else {
            out.push(b);
            code += 1;

            if (code === 0xff) {
                out[codeIndex] = code;
                codeIndex = out.length;
                out.push(0);
                code = 1;
            }
        }
    }

    out[codeIndex] = code;
    return new Uint8Array(out);
}

function cobsDecode(data) {
    const out = [];
    let i = 0;

    while (i < data.length) {
        const code = data[i];

        if (code === 0) {
            throw new Error('COBS packet contains zero');
        }

        if (i + code > data.length && code !== 1) {
            throw new Error('COBS packet is truncated');
        }

        i += 1;

        let copied = 1;
        while (copied < code) {
            if (i >= data.length) {
                throw new Error('COBS packet is truncated');
            }

            out.push(data[i]);
            i += 1;
            copied += 1;
        }

        if (code !== 0xff && i !== data.length) {
            out.push(0);
        }
    }

    return new Uint8Array(out);
}

function u16LE(value) {
    return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function u32LE(value) {
    return new Uint8Array([
        value & 0xff,
        (value >> 8) & 0xff,
        (value >> 16) & 0xff,
        (value >> 24) & 0xff,
    ]);
}

function concatBytes(...parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;

    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }

    return out;
}

function buildPacket(command, payload = new Uint8Array()) {
    if (payload.length > 0x0fe9) {
        throw new Error('Payload too large');
    }

    const body = new Uint8Array(4 + payload.length);
    body[0] = command & 0xff;
    body[1] = (command >> 8) & 0xff;
    body[2] = 0;
    body[3] = 0;
    body.set(payload, 4);

    const count = body.length & 0xff;
    const crc = crc16Pockethernet(body, count);

    body[2] = crc & 0xff;
    body[3] = (crc >> 8) & 0xff;

    return concatBytes(new Uint8Array([0]), cobsEncode(body), new Uint8Array([0]));
}

function parsePacket(frame) {
    const body = cobsDecode(frame);

    if (body.length < 4) {
        throw new Error('Packet too short');
    }

    const receivedCrc = body[2] | (body[3] << 8);
    const check = body.slice();

    check[2] = 0;
    check[3] = 0;

    const calculatedCrc = crc16Pockethernet(check, check.length & 0xff);

    if (receivedCrc !== calculatedCrc) {
        throw new Error(`CRC mismatch: got 0x${receivedCrc.toString(16)}, expected 0x${calculatedCrc.toString(16)}`);
    }

    const command = body[0] | (body[1] << 8);

    return {
        command,
        payload: body.slice(4),
    };
}

async function startReadLoop() {
    state.reader = state.port.readable.getReader();
    state.readLoopActive = true;

    try {
        while (state.readLoopActive) {
            const { value, done } = await state.reader.read();

            if (done) {
                break;
            }

            if (value) {
                for (const b of value) {
                    state.rxBytes.push(b);
                }
            }
        }
    } catch (error) {
        if (state.connected) {
            log(`Read loop stopped: ${error.message}`);
        }
    }
}

async function readPacket(timeoutMs) {
    const deadline = performance.now() + timeoutMs;
    let frame = [];
    let inFrame = false;

    while (performance.now() < deadline) {
        while (state.rxBytes.length > 0) {
            const value = state.rxBytes.shift();

            if (value === 0) {
                if (inFrame && frame.length > 3) {
                    return parsePacket(new Uint8Array(frame));
                }

                frame = [];
                inFrame = false;
                continue;
            }

            inFrame = true;
            frame.push(value);

            if (frame.length > 0x1000) {
                frame = [];
                inFrame = false;
            }
        }

        await new Promise(resolve => window.setTimeout(resolve, 10));
    }

    throw new Error('Timeout waiting for Pockethernet response');
}

async function sendCommand(command, payload = new Uint8Array(), timeoutMs = 2000) {
    await state.writer.write(buildPacket(command, payload));
    return readPacket(timeoutMs);
}

async function requireCommand(command, payload, timeoutMs, errNo) {
    try {
        return await sendCommand(command, payload, timeoutMs);
    } catch (error) {
        throw new Error(`Cannot communicate with Pockethernet, err ${errNo}: ${error.message}`);
    }
}

async function setLeds(mode) {
    for (let led = 1; led <= 4; led += 1) {
        try {
            await sendCommand(CMD_SET_LED, new Uint8Array([led, mode]), 2000);
        } catch (_error) {
            // Best effort only.
        }
    }
}

async function writePayload(payload, errNo, progressBase, progressSpan) {
    let sent = 0;

    while (sent < payload.length) {
        const chunk = payload.slice(sent, sent + CHUNK_SIZE);
        const packetPayload = concatBytes(u16LE(chunk.length), chunk);

        await requireCommand(CMD_WRITE_DATA, packetPayload, 2000, errNo);

        sent += chunk.length;

        const pct = progressBase + (sent / payload.length) * progressSpan;
        setProgress(pct);
        setStatus(`Written ${sent} of ${payload.length} bytes`);
        log(`Written ${sent}/${payload.length} bytes`);
    }
}

async function connectSerial() {
    if (!hasSerialSupport()) {
        throw new Error('Web Serial is not available in this browser');
    }

    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: BAUD_RATE, bufferSize: 4096 });

    state.writer = state.port.writable.getWriter();
    state.rxBytes = [];
    state.connected = true;

    startReadLoop();

    state.errors.connect = null;
    log('Serial port connected');
    updateUi();
}

async function disconnectSerial() {
    state.connected = false;
    state.readLoopActive = false;

    try {
        if (state.reader) {
            await state.reader.cancel();
            state.reader.releaseLock();
        }
    } catch (_error) {
        // Ignore disconnect errors.
    }

    try {
        if (state.writer) {
            state.writer.releaseLock();
        }
    } catch (_error) {
        // Ignore disconnect errors.
    }

    try {
        if (state.port) {
            await state.port.close();
        }
    } catch (_error) {
        // Ignore disconnect errors.
    }

    state.reader = null;
    state.writer = null;
    state.port = null;

    log('Serial port disconnected');
    updateUi();
}

async function runDryRun() {
    resetFlashResult();

    state.errors.file = null;
    state.errors.dryRun = null;

    if (!state.file) {
        throw new Error('No file selected');
    }

    if (state.file.name !== REQUIRED_FILE_NAME) {
        throw new Error(`Invalid file name. Expected exactly: ${REQUIRED_FILE_NAME}`);
    }

    const bytes = new Uint8Array(await state.file.arrayBuffer());
    const { fw1, fw2 } = extractPayloads(bytes);

    state.fw1 = fw1;
    state.fw2 = fw2;
    state.dryRunOk = true;

    log(`Dry run OK: fw1=${fw1.length} bytes, fw2=${fw2.length} bytes`);
    setStatus('Dry run complete. Ready to connect serial port.');
    updateUi();
}

async function flashFirmware() {
    if (!state.dryRunOk || !state.fw1 || !state.fw2) {
        throw new Error('Dry run has not completed');
    }

    if (!state.connected) {
        throw new Error('Serial port is not connected');
    }

    const confirmed = window.confirm('Flash Pockethernet v1 firmware v33 now? Do not disconnect the device during flashing.');

    if (!confirmed) {
        return;
    }

    state.flashComplete = false;
    state.flashSucceeded = false;
    state.errors.flash = null;
    state.flashing = true;

    els.flashButton.classList.remove('d-none');
    getFlashProgressContainer().classList.remove('d-none');
    getFlashResultBox().className = 'alert d-none mt-4 mb-0';

    updateUi();
    setProgress(0, '0%');
    setStatus('Upgrade in progress');
    log('Upgrade in progress');

    try {
        state.rxBytes = [];

        for (let led = 1; led <= 4; led += 1) {
            await requireCommand(CMD_SET_LED, new Uint8Array([led, 2]), 2000, 4);
        }

        await requireCommand(CMD_BOOT_STAGE, new Uint8Array([0x04]), 5000, 5);
        await requireCommand(CMD_BOOT_STAGE, new Uint8Array([0x05]), 5000, 6);

        await requireCommand(CMD_SET_ADDRESS, u32LE(ADDR_FW1), 2000, 7);

        log('Writing main firmware payload');
        await writePayload(state.fw1, 8, 0, 95);

        await requireCommand(CMD_SET_ADDRESS, u32LE(ADDR_FW2), 2000, 9);

        log('Writing small tail payload');
        await writePayload(state.fw2, 10, 95, 3);

        setStatus('Validating firmware');
        log('Program download complete, validating');

        const response = await requireCommand(CMD_VALIDATE, new Uint8Array(), 2000, 11);

        if (response.command === VALIDATE_OK) {
            await setLeds(1);
            setProgress(100, '100%');
            setStatus('Firmware upgrade complete. You can disconnect the Pockethernet.');
            log('Firmware upgrade complete');

            showFinalFlashResult(
                true,
                'Firmware upgrade successful',
                'The update completed successfully. You can now disconnect the Pockethernet.'
            );

            return;
        }

        await setLeds(0);
        throw new Error(`Validation failed: response 0x${response.command.toString(16)}, payload ${bytesToHex(response.payload)}`);
    } catch (error) {
        try {
            await setLeds(0);
        } catch (_ledError) {
            // Ignore LED errors.
        }

        setStatus(`Firmware upgrade failed: ${error.message}`);
        log(`Firmware upgrade failed: ${error.message}`);

        showFinalFlashResult(
            false,
            'Firmware upgrade failed',
            `The update did not complete successfully. You can disconnect the Pockethernet now, but the device may need recovery with the official updater. Error: ${error.message}`
        );

        throw error;
    } finally {
        state.flashing = false;
        updateUi();
    }
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function showSupportWarning() {
    if (hasSerialSupport()) {
        return;
    }

    els.supportAlert.classList.remove('d-none');
    els.supportAlert.innerHTML = `
    <strong>Web Serial is not available.</strong>
    Use Chrome or Edge on macOS. Safari and Firefox do not support this updater.
  `;
}

els.firmwareFile.addEventListener('change', () => {
    state.file = els.firmwareFile.files[0] || null;
    state.fw1 = null;
    state.fw2 = null;
    state.dryRunOk = false;
    state.errors.file = null;
    state.errors.dryRun = null;
    state.errors.flash = null;

    resetFlashResult();
    setStatus(state.file ? `Selected file: ${state.file.name}` : 'Waiting for firmware file.');
    log(state.file ? `Selected file: ${state.file.name}` : 'File selection cleared');
    updateUi();
});

els.dryRunButton.addEventListener('click', async () => {
    try {
        await runDryRun();
    } catch (error) {
        state.dryRunOk = false;
        state.errors.dryRun = error.message;
        setStatus(`Dry run failed: ${error.message}`);
        log(`Dry run failed: ${error.message}`);
        updateUi();
    }
});

els.connectButton.addEventListener('click', async () => {
    try {
        await connectSerial();
    } catch (error) {
        state.errors.connect = error.message;
        setStatus(`Serial connection failed: ${error.message}`);
        log(`Serial connection failed: ${error.message}`);
        updateUi();
    }
});

els.disconnectButton.addEventListener('click', async () => {
    await disconnectSerial();
});

els.flashButton.addEventListener('click', async () => {
    try {
        await flashFirmware();
    } catch (_error) {
        // Already shown in the UI.
    }
});

if (els.clearLogButton) {
    els.clearLogButton.addEventListener('click', () => {
        els.log.textContent = '';
    });
}

window.addEventListener('beforeunload', event => {
    if (state.flashing) {
        event.preventDefault();
        event.returnValue = '';
    }
});

showSupportWarning();
updateUi();
log(`Pockethernet v33 web updater loaded`);
