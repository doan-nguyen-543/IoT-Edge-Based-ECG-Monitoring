(function () {
  const canvas = document.getElementById('scope');
  const ctx = canvas.getContext('2d');
  const scopeOverlay = document.getElementById('scopeOverlay');
  const statusline = document.getElementById('statusline');
  const connectBtn = document.getElementById('connectBtn');
  const demoBtn = document.getElementById('demoBtn');
  const tileValue = document.getElementById('tileValue');
  const tileBPM = document.getElementById('tileBPM');
  const tileLead = document.getElementById('tileLead');
  const tileAnomalies = document.getElementById('tileSamples');
  const leadDot = document.getElementById('leadDot');

  const GAP = 4;            // erase-gap width ahead of the sweep pen, in columns
  const SUPPORTS_SERIAL = 'serial' in navigator;

  let dpr = window.devicePixelRatio || 1;
  let buf = null, bufferLen = 0, writeIdx = 0;
  let leadOff = false, hasData = false;
  let totalSamples = 0, samplesSinceRateCheck = 0, currentRate = 0, lastRateCheck = performance.now();

  let port = null, reader = null, readableStreamClosed = null, keepReading = false, connecting = false;
  let demoTimer = null, demoSampleIndex = 0;

  function setStatus(msg, kind) {
    statusline.textContent = msg;
    statusline.className = 'statusline' + (kind ? ' ' + kind : '');
  }

  // ---------- canvas / sweep buffer ----------
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const newLen = Math.max(120, Math.floor(rect.width));
    const fresh = new Float32Array(newLen).fill(NaN);
    buf = fresh;
    bufferLen = newLen;
    writeIdx = 0;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function pushSample(value) {
    if (!buf) return;
    hasData = true;
    buf[writeIdx] = value;
    for (let g = 1; g <= GAP; g++) buf[(writeIdx + g) % bufferLen] = NaN;
    writeIdx = (writeIdx + 1) % bufferLen;
    samplesSinceRateCheck++;
  }

  function drawGrid(w, h) {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid');
    ctx.lineWidth = 1;
    const stepX = 40 * dpr, stepY = 36 * dpr;
    ctx.beginPath();
    for (let x = 0; x < w; x += stepX) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += stepY) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }

  function render() {
    requestAnimationFrame(render);

    if (!buf) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    drawGrid(w, h);

    if (!hasData) return;
    scopeOverlay.classList.add('hidden');

    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < bufferLen; i++) {
      const v = buf[i];
      if (!Number.isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    if (mn === Infinity) return;
    if (mx - mn < 20) mx = mn + 20;
    const pad = (mx - mn) * 0.18;
    mn -= pad; mx += pad;

    const colW = w / bufferLen;
    const traceColor = leadOff ? '#ffb020' : '#35ffa0';
    const glow = leadOff ? 'rgba(255,176,32,0.55)' : 'rgba(53,255,160,0.55)';

    ctx.save();
    ctx.lineWidth = 2 * dpr;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = traceColor;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 9 * dpr;
    ctx.beginPath();
    let drawing = false;
    for (let x = 0; x < bufferLen; x++) {
      const v = buf[x];
      if (Number.isNaN(v)) { drawing = false; continue; }
      const y = h - ((v - mn) / (mx - mn)) * h;
      if (!drawing) { ctx.moveTo(x * colW, y); drawing = true; }
      else { ctx.lineTo(x * colW, y); }
    }
    ctx.stroke();
    ctx.restore();

    // sweep pen cursor
    const cursorX = writeIdx * colW;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, h);
    ctx.stroke();
    ctx.restore();
  }
  requestAnimationFrame(render);

  function handleSample(value) {
    leadOff = (value === 0);
    tileValue.textContent = value.toFixed(1);
    leadDot.classList.toggle('off', leadOff);
    tileLead.textContent = leadOff ? 'Lead off' : 'OK';
    pushSample(value);
  }

  function handleLine(rawLine) {
    const line = rawLine.trim();

    if (!line.includes(","))
      return;

    const parts = line.split(",");

    if (parts.length < 5)
      return;

    const filtered = parseFloat(parts[1]);
    const bpm = parseFloat(parts[3]);
    const anomalyText = parts[4].trim();

    if (Number.isNaN(filtered))
      return;

    tileBPM.textContent = Number.isNaN(bpm) ? "--" : bpm.toFixed(0);
    tileAnomalies.textContent = anomalyText ? anomalyText : "None";
    handleSample(filtered);
  }

  // ---------- Web Serial ----------
  async function connectSerial() {
    if (!SUPPORTS_SERIAL) {
      setStatus('This browser does not support Web Serial. Open this page in Chrome or Edge on desktop.', 'err');
      return;
    }
    if (connecting) return;
    connecting = true;
    stopDemo();
    connectBtn.disabled = true;
    connectBtn.textContent = 'CONNECTING…';
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      keepReading = true;
      connectBtn.classList.add('is-connected');
      connectBtn.textContent = '● Disconnect';
      setStatus('Connected. Reading raw ECG samples…');
      port.addEventListener('disconnect', () => {
        setStatus('Device unplugged.', 'warn');
        resetConnectionUI();
      });
      readLoop();
    } catch (err) {
      if (err && err.name !== 'NotFoundError') {
        setStatus('Connection failed: ' + err.message, 'err');
      } else {
        setStatus('No port selected.');
      }
      resetConnectionUI();
    } finally {
      connecting = false;
    }
  }

  // ESP32 boards reset on port-open (DTR/RTS pulses EN), and the ROM
  // bootloader briefly logs at 74880 baud before the sketch's own
  // Serial.begin(115200) kicks in. Read at 115200 during that window and
  // the OS reports a framing/parity error. That's transient, not fatal, so
  // this loop gets a fresh reader and keeps going instead of dropping the
  // connection. Only if errors keep recurring do we give up for real.
  async function readLoop() {
    let consecutiveErrors = 0;
    let lastErrorTime = 0;

    while (keepReading && port && port.readable) {
      let lineBuffer = '';
      try {
        const textDecoder = new TextDecoderStream();
        readableStreamClosed = port.readable.pipeTo(textDecoder.writable).catch(() => {});
        reader = textDecoder.readable.getReader();

        while (keepReading) {
          const { value, done } = await reader.read();
          if (done) { keepReading = false; break; }
          if (value) {
            lineBuffer += value;
            const parts = lineBuffer.split('\n');
            lineBuffer = parts.pop();
            for (const part of parts) handleLine(part);
          }
          if (consecutiveErrors > 0) {
            consecutiveErrors = 0;
            setStatus('Connected. Reading raw ECG samples…');
          }
        }
      } catch (err) {
        if (!keepReading) break;
        const now = performance.now();
        consecutiveErrors = (now - lastErrorTime < 2000) ? consecutiveErrors + 1 : 1;
        lastErrorTime = now;

        if (consecutiveErrors >= 6) {
          setStatus('Read error: ' + err.message + ' — connection unstable, disconnecting.', 'err');
          await teardown();
          break;
        }
        setStatus('Brief read glitch (' + err.message + ') — recovering…', 'warn');
        await new Promise((r) => setTimeout(r, 30));
      } finally {
        try { reader.releaseLock(); } catch (e) {}
      }
    }
  }

  async function teardown() {
    keepReading = false;
    if (reader) { try { await reader.cancel(); } catch (e) {} }
    if (readableStreamClosed) { await readableStreamClosed.catch(() => {}); }
    if (port) { try { await port.close(); } catch (e) {} }
    port = null;
    resetConnectionUI();
  }

  async function disconnectSerial() {
    await teardown();
    setStatus('Disconnected.');
  }

  function resetConnectionUI() {
    connectBtn.disabled = false;
    connectBtn.classList.remove('is-connected');
    connectBtn.textContent = '⏻ Connect device';
  }

  connectBtn.addEventListener('click', () => {
    if (connectBtn.classList.contains('is-connected')) disconnectSerial();
    else connectSerial();
  });

  // ---------- demo waveform (synthetic, for previewing the UI only) ----------
  function syntheticBeat(phase) {
    function bump(x, mu, sigma, amp) {
      const d = (x - mu) / sigma;
      return amp * Math.exp(-0.5 * d * d);
    }
    let v = 0;
    v += bump(phase, 0.16, 0.022, 0.12);   // P wave
    v += bump(phase, 0.30, 0.007, -0.20);  // Q
    v += bump(phase, 0.32, 0.009, 1.0);    // R spike
    v += bump(phase, 0.34, 0.009, -0.30);  // S
    v += bump(phase, 0.55, 0.05, 0.22);    // T wave
    return v;
  }

  function startDemo() {
    if (port) return; // real device takes priority
    demoSampleIndex = 0;
    demoBtn.classList.add('is-active');
    demoBtn.textContent = 'Stop demo waveform';
    setStatus('Showing a synthetic demo waveform (not real sensor data).', 'warn');
    leadOff = false;
    leadDot.classList.remove('off');
    tileLead.textContent = 'Demo';
    tileAnomalies.textContent = "Normal";
    const beatSamples = 250; // ~60 bpm at 250 Hz
    demoTimer = setInterval(() => {
      const phase = (demoSampleIndex % beatSamples) / beatSamples;
      const noise = (Math.random() - 0.5) * 0.02;
      const v = Math.round(1750 + (syntheticBeat(phase) + noise) * 900);
      const clamped = Math.max(0, Math.min(4095, v));
      tileValue.textContent = clamped;
      pushSample(clamped);
      demoSampleIndex++;
    }, 4); // ~250 Hz
  }

  function stopDemo() {
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    demoBtn.classList.remove('is-active');
    demoBtn.textContent = 'Preview demo waveform';
  }

  demoBtn.addEventListener('click', () => {
    if (demoTimer) { stopDemo(); setStatus('Demo stopped.'); }
    else startDemo();
  });

  if (!SUPPORTS_SERIAL) {
    setStatus('This browser does not support Web Serial. Open this page in Chrome or Edge on desktop — the demo waveform button still works anywhere.', 'warn');
  }
})();
