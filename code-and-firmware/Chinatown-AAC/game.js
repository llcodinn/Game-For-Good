'use strict';
const R = CatcherRules;
const $ = id => document.getElementById(id);
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const rottenImage = new Image();
rottenImage.src = 'rotten-fruit.svg';
const state = { phase: 'setup', demo: false, connecting: false, generation: 0, players: [],
  items: [], effects: [], remaining: 60, elapsed: 0, spawn: 0, paused: false, practice: 0,
  scores: [], lastFrame: 0, devices: [], message: '', settings: null };
let audio;
let poseScriptPromise;
const POSE_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/';
function cameraMessage(message, error = false) {
  $('cameraMessage').textContent = message;
  $('setupMessage').textContent = message;
  $('setupMessage').dataset.error = String(error);
}
function withDeadline(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function loadPoseScript() {
  if (typeof Pose !== 'undefined') return Promise.resolve();
  if (poseScriptPromise) return poseScriptPromise;
  const script = document.createElement('script');
  script.src = `${POSE_BASE}pose.js`; script.crossOrigin = 'anonymous';
  const loaded = new Promise((resolve, reject) => {
    script.onload = () => typeof Pose !== 'undefined' ? resolve() : reject(new Error('Tracking library unavailable.'));
    script.onerror = () => reject(new Error('Tracking library download failed.'));
    document.head.append(script);
  });
  poseScriptPromise = withDeadline(loaded, 20000, 'Tracking library download timed out.').catch(error => {
    script.remove(); poseScriptPromise = null; throw error;
  });
  return poseScriptPromise;
}
function explainCameraError(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name))
    return 'Camera permission is blocked. In Chrome or Edge, open the site controls beside the address bar, allow Camera, then reconnect. Also check Windows Settings → Privacy & security → Camera.';
  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(error.name))
    return 'The selected camera was not found. Plug it in, choose Default camera or another camera in Settings, then reconnect.';
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(error.name))
    return 'The camera could not start. Close other apps using it (such as Teams or Zoom), check its privacy switch, then reconnect.';
  return error.message || 'Unable to connect. Check camera permissions and reconnect.';
}
function closePose(p) { try { Promise.resolve(p.pose?.close()).catch(() => {}); } catch {} }
function settings() {
  return { count: Number($('players').value), limb: $('limb').value, difficulty: $('difficulty').value,
    weights: $('weights').checked, mirror: $('mirror').checked };
}
function modeKey(s = settings()) { return `fruit-bonus · ${s.limb} · ${s.difficulty}${s.weights ? ' · weights' : ''}${state.demo ? ' · demo' : ''}`; }
function loadScores() {
  try { state.scores = R.cleanScores(JSON.parse(localStorage.getItem('catcher_scores_v2') || '[]')); }
  catch { state.scores = []; $('storageMessage').textContent = 'Scores are available for this visit; browser storage is unavailable or unreadable.'; }
}
function showScores() {
  const list = $('leaderboard'); list.replaceChildren();
  const scores = state.scores.filter(s => s.mode === modeKey()).sort((a, b) => b.score - a.score).slice(0, 10);
  for (const entry of scores) { const li = document.createElement('li'); li.textContent = `${entry.name} — ${entry.score}`; list.append(li); }
  if (!scores.length) { const li = document.createElement('li'); li.textContent = 'Your first score could be here.'; list.append(li); }
}
function names() { return [1, 2].map(i => $(`name${i}`).value.trim().slice(0, 24) || `Player ${i}`); }
function newPlayer(id) {
  return { id, name: names()[id], score: 0, bonusLeft: 0, lastValid: 0, video: null, stream: null, pose: null, landmarks: null,
    lastSeen: 0, stableSince: 0, baseline: 0, scaleSamples: [], close: false, ready: false, center: 0.5, error: '', tracker: 'waiting' };
}
function updateSettings() {
  if (state.phase !== 'setup') return;
  if ($('weights').checked) { $('limb').value = 'hands'; $('difficulty').value = 'easy'; }
  $('limb').disabled = $('difficulty').disabled = $('weights').checked;
  $('secondName').hidden = $('players').value !== '2';
  const s = settings();
  $('movementHint').textContent = s.limb === 'legs'
    ? 'Step gently sideways, left and right. Your ankle markers collect objects in the narrow column. No bombs.'
    : s.limb === 'both' ? 'Use comfortable hand reaches and gentle side steps. Keep hands and feet visible.'
    : 'Reach comfortably with your hands to catch the blue circles.';
  $('setupInstructions').textContent = s.limb === 'hands'
    ? 'Show both shoulders and at least one hand for two seconds. Your hips and feet do not need to be visible in Hands mode. No extra pairing is needed.'
    : `Show both shoulders, hips and ${s.limb === 'both' ? 'at least one hand and one ankle' : 'at least one ankle'} for two seconds. No extra pairing is needed.`;
  $('bombLegend').hidden = s.limb === 'legs';
  $('setupMirror').textContent = `Mirror: ${s.mirror ? 'on' : 'off'}`;
  $('setupMirror').setAttribute('aria-pressed', String(s.mirror));
  for (const p of state.players) { p.ready = state.demo; p.baseline = 0; p.stableSince = 0; p.lastValid = 0; p.scaleSamples = []; }
  showScores();
}
function cameraSelectors() {
  const previous = [0, 1].map(i => $(`camera${i}`)?.value);
  $('cameraSelectors').replaceChildren();
  for (let i = 0; i < Number($('players').value); i++) {
    const label = document.createElement('label'); label.htmlFor = `camera${i}`; label.textContent = `Player ${i + 1} camera`;
    const select = document.createElement('select'); select.id = `camera${i}`;
    const placeholder = new Option(i === 0 ? 'Default camera' : 'Choose a second camera', ''); select.add(placeholder);
    state.devices.forEach((d, n) => select.add(new Option(d.label || `Camera ${n + 1}`, d.deviceId)));
    if (previous[i] && state.devices.some(d => d.deviceId === previous[i])) select.value = previous[i];
    select.disabled = state.phase !== 'setup' || state.connecting;
    $('cameraSelectors').append(label, select);
  }
}
async function stopCameras() {
  state.generation++;
  const previous = state.players;
  state.players = [];
  for (const p of previous) {
    p.stream?.getTracks().forEach(t => t.stop());
    if (p.video) p.video.srcObject = null;
    // Close only after an in-flight inference finishes.
    if (p.pose && !p.busy) closePose(p);
  }
}
async function enumerateCameras() {
  if (navigator.mediaDevices?.enumerateDevices) {
    state.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    cameraSelectors();
  }
}
async function connectCameras() {
  if (state.connecting || state.phase !== 'setup') return;
  state.connecting = true; state.demo = false; lockControls();
  await stopCameras();
  const generation = state.generation;
  const requested = [0, 1].map(i => $(`camera${i}`)?.value || '');
  cameraMessage('Choose Allow in your browser’s camera prompt. Your mirrored preview will appear above.');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open this game on localhost or HTTPS to use a camera.');
    for (let i = 0; i < Number($('players').value); i++) {
      const p = newPlayer(i); state.players.push(p);
      let id = requested[i];
      if (i === 1 && !id) {
        await enumerateCameras();
        const first = state.players[0].stream.getVideoTracks()[0].getSettings().deviceId;
        id = state.devices.find(d => d.deviceId !== first)?.deviceId;
        if (!id) throw new Error('Two-player mode needs two different cameras. Connect another camera, or choose one player.');
      }
      let abandoned = false;
      const request = navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: 640 }, height: { ideal: 480 }, ...(id ? { deviceId: { exact: id } } : {}) } });
      request.then(stream => { if (abandoned || generation !== state.generation) stream.getTracks().forEach(t => t.stop()); }, () => {});
      try { p.stream = await withDeadline(request, 20000, 'Still waiting for camera permission. Choose Allow in the browser prompt, then click Reconnect cameras.'); }
      catch (error) { abandoned = true; throw error; }
      if (generation !== state.generation) { p.stream.getTracks().forEach(t => t.stop()); return; }
      if (i === 1 && p.stream.getVideoTracks()[0].getSettings().deviceId === state.players[0].stream.getVideoTracks()[0].getSettings().deviceId)
        throw new Error('Select two different cameras, one for each player.');
      p.video = document.createElement('video'); p.video.autoplay = true; p.video.muted = true; p.video.playsInline = true;
      p.video.srcObject = p.stream;
      await withDeadline(p.video.play(), 10000, 'Camera connected but video did not start. Reconnect the camera.');
      if (generation !== state.generation) return;
      // The preview is rendered independently of model loading and body detection.
      p.stream.getVideoTracks()[0].addEventListener('ended', () => { p.error = 'Camera disconnected. Finish the round and reconnect.'; p.ready = false; });
      startTracking(p, generation);
    }
    await enumerateCameras();
    state.players.forEach(p => { const selected = $(`camera${p.id}`); if (selected) selected.value = p.stream.getVideoTracks()[0].getSettings().deviceId; });
    cameraMessage('Camera connected — no extra pairing needed. Watch the checks below; Start practice unlocks when your selected body parts are visible.');
  } catch (error) {
    if (generation !== state.generation) return;
    // Keep any working first camera visible if the second camera fails.
    for (const p of state.players.filter(p => !p.video || p.video.readyState < 2)) {
      p.stream?.getTracks().forEach(t => t.stop()); p.error = explainCameraError(error); p.ready = false;
    }
    cameraMessage(explainCameraError(error), true);
  } finally {
    if (generation === state.generation) { state.connecting = false; lockControls(); showScores(); }
  }
}
async function startTracking(p, generation) {
  p.tracker = 'loading';
  try {
    await loadPoseScript();
    if (generation !== state.generation) return;
    p.pose = new Pose({ locateFile: file => `${POSE_BASE}${file}` });
    p.pose.setOptions({ modelComplexity: 0, smoothLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    p.pose.onResults(result => { if (generation === state.generation && !p.error) onPose(p, result); });
    runCamera(p, generation);
  } catch {
    if (generation !== state.generation) return;
    p.tracker = 'error'; p.ready = false;
    p.error = 'Camera is working, but body tracking could not download. Check your internet connection or network blocker, then Reconnect cameras. The mouse / touch demo works without tracking.';
  }
}
async function runCamera(p, generation) {
  if (generation !== state.generation) return;
  try {
    p.busy = true;
    const inference = Promise.resolve().then(() => p.pose.send({ image: p.video })).finally(() => {
      p.busy = false; if (generation !== state.generation) closePose(p);
    });
    await withDeadline(inference, p.lastSeen ? 8000 : 30000, 'Tracking response timed out.');
  } catch {
    if (generation !== state.generation) return;
    p.tracker = 'error'; p.error = 'Camera is working, but body tracking stopped or could not load. Check your internet connection, then reconnect. If you are playing, finish the round first.'; p.ready = false;
  }
  if (generation !== state.generation) return;
  if (!p.error) setTimeout(() => runCamera(p, generation), 35);
}
function onPose(p, result) {
  p.tracker = 'active';
  p.landmarks = result.poseLandmarks || null; p.lastSeen = performance.now();
  const s = state.settings || settings();
  const proximity = R.proximity(p.landmarks, p.baseline, p.close, s.limb); p.close = proximity.close;
  const valid = proximity.valid && !p.close && R.tracked(p.landmarks, s.limb);
  if (state.phase === 'setup') {
    if (!valid) {
      if (p.close || p.lastSeen - p.lastValid > 400) { p.stableSince = 0; p.ready = false; p.scaleSamples = []; }
    }
    else {
      p.lastValid = p.lastSeen;
      if (!p.stableSince) p.stableSince = p.lastSeen;
      p.scaleSamples.push(proximity.scale); if (p.scaleSamples.length > 60) p.scaleSamples.shift();
      if (p.lastSeen - p.stableSince >= 2000) {
        p.ready = true;
        if (!p.baseline) p.baseline = p.scaleSamples.reduce((a, b) => a + b, 0) / p.scaleSamples.length;
        const center = s.limb === 'hands' ? (p.landmarks[11].x + p.landmarks[12].x) / 2 : (p.landmarks[23].x + p.landmarks[24].x) / 2;
        p.center = s.mirror ? 1 - center : center;
      }
    }
  }
}
function trackingProblem(p, now) {
  if (state.demo) return '';
  if (p.error) return p.error;
  if (p.tracker === 'loading') return 'Camera on · Loading body tracking… Your video should already be visible.';
  if (!p.lastSeen || now - p.lastSeen > 1200) return 'Camera tracking unavailable. Stand in view or reconnect.';
  if (p.close) return 'Too close to the camera — pause and return to your starting position. 请回到起始位置';
  const limb = (state.settings || settings()).limb;
  if (!R.proximity(p.landmarks, p.baseline, p.close, limb).valid)
    return limb === 'hands' ? 'Keep both shoulders in view for the distance check. Hands mode does not need your hips or feet.' : 'Keep both shoulders and hips in view for the distance check.';
  if (!R.tracked(p.landmarks, limb))
    return limb === 'hands' ? 'Show at least one hand in the camera view.' : limb === 'legs' ? 'Show at least one ankle in the camera view.' : 'Show at least one hand and one ankle in the camera view.';
  return '';
}
async function enableDemo() {
  if (state.phase !== 'setup' || state.connecting) return;
  await stopCameras(); state.demo = true;
  state.players = Array.from({ length: settings().count }, (_, i) => ({ ...newPlayer(i), ready: true }));
  cameraMessage('Mouse / touch demo: tap a blue object to collect it. Camera tracking and distance alerts are not active. In two-player demo, tap in each player’s lane.');
  showScores();
}
function lockControls() {
  const locked = state.phase !== 'setup' || state.connecting;
  $('gameSettings').disabled = locked; $('connectButton').disabled = locked; $('demoButton').disabled = locked;
  $('setupConnect').disabled = locked; $('setupDemo').disabled = locked;
  $('cancelConnect').hidden = !state.connecting;
  $('setupConnect').textContent = $('connectButton').textContent = state.connecting ? 'Connecting…' : state.players.length && !state.demo ? 'Reconnect cameras' : 'Connect cameras';
  document.querySelectorAll('#cameraSelectors select').forEach(s => { s.disabled = locked; });
}
function startPractice() {
  if (!canStart(performance.now())) return;
  state.settings = settings(); state.players.forEach((p, i) => { p.name = names()[i]; p.score = 0; p.bonusLeft = 0; });
  state.phase = 'tutorial'; state.practice = 0; state.items = []; state.effects = []; state.paused = false;
  $('setupOverlay').hidden = true; $('tutorialPanel').hidden = false; $('finishButton').hidden = false;
  $('gameArea').classList.remove('setup-layout'); resize();
  $('tutorialText').textContent = state.demo ? 'Demo: tap a blue target in each lane. Camera play uses your hands or ankles.' :
    state.settings.limb === 'legs' ? 'Step gently sideways LEFT and RIGHT to bring your ankle marker into the blue target. No jumping or high kicks are needed. 双腿向左右小步移动。' :
    'Move your hand marker into the blue target. In legs mode, gentle sideways steps collect objects with your ankle markers. 向左右小步移动也可以收集物品。';
  $('practiceCount').textContent = 'Practice has no timer or score. Try catching a target, or skip whenever you’re ready.';
  makePracticeTargets(); lockControls(); initAudio();
}
function makePracticeTargets() {
  state.items = state.players.map(p => ({ owner: p.id, kind: 'good', points: 0, x: p.center,
    y: state.settings.limb === 'legs' ? 0.82 : 0.66, speed: 0, radius: 48,
    symbol: R.fruits[0] }));
}
function startRound() {
  if (state.phase !== 'tutorial') return;
  state.phase = 'playing'; state.items = []; state.effects = []; state.remaining = 60; state.elapsed = 0; state.spawn = 0;
  state.paused = false; $('tutorialPanel').hidden = true; $('gameHud').hidden = false; $('pauseButton').hidden = false;
  $('pauseButton').textContent = 'Pause';
}
function finishRound(completed = false) {
  if (!['tutorial', 'playing'].includes(state.phase)) return;
  const wasPlaying = state.phase === 'playing';
  state.phase = 'ended'; state.items = []; $('tutorialPanel').hidden = true;
  $('gameHud').hidden = true; $('pauseButton').hidden = true; $('finishButton').hidden = true; $('safetyWarning').hidden = true;
  $('endOverlay').hidden = false;
  $('finalScore').textContent = state.players.map(p => `${p.name}: ${p.score}`).join('\n');
  if (completed && wasPlaying) {
    const mode = modeKey(state.settings);
    state.scores.push(...state.players.map(p => ({ name: p.name, score: p.score, mode, date: new Date().toISOString() })));
    state.scores = state.scores.sort((a, b) => b.score - a.score).slice(0, 100);
    try { localStorage.setItem('catcher_scores_v2', JSON.stringify(state.scores)); }
    catch { $('storageMessage').textContent = 'Browser storage is unavailable. Scores will last only for this visit.'; }
    $('resultMessage').textContent = state.players.length === 2 ? `Together you collected ${state.players.reduce((a, p) => a + p.score, 0)} points. Scores added to this browser’s board.` : 'Round complete. Your score has been added to this browser’s board.';
    tone(true);
  } else $('resultMessage').textContent = 'Round ended early. No high score recorded. Taking a break is always OK.';
  showScores();
}
function reset() {
  state.phase = 'setup'; state.settings = null; state.paused = false; state.items = [];
  $('endOverlay').hidden = true; $('setupOverlay').hidden = false;
  $('gameArea').classList.add('setup-layout'); resize();
  updateSettings(); lockControls();
}
function canStart(now) {
  return !state.connecting && state.players.length === settings().count && state.players.every(p => p.ready && !trackingProblem(p, now));
}
function lane(p) {
  const width = canvas.width / Math.max(1, state.players.length);
  return { x: width * p.id, width, height: canvas.height };
}
function videoBounds(p) {
  const l = lane(p);
  if (state.phase !== 'setup' || !p.video?.videoWidth) return l;
  const scale = Math.min(l.width / p.video.videoWidth, l.height / p.video.videoHeight);
  const width = p.video.videoWidth * scale, height = p.video.videoHeight * scale;
  return { x: l.x + (l.width - width) / 2, y: (l.height - height) / 2, width, height };
}
function limbPoints(p) {
  if (state.demo || !p.landmarks) return [];
  const s = state.settings || settings(), l = videoBounds(p);
  const indices = s.limb === 'hands' ? [15, 16] : s.limb === 'legs' ? [27, 28] : [15, 16, 27, 28];
  return indices.filter(i => p.landmarks[i]?.visibility > 0.55).map(i => ({
    x: l.x + (s.mirror ? 1 - p.landmarks[i].x : p.landmarks[i].x) * l.width,
    y: (l.y || 0) + p.landmarks[i].y * l.height, label: i < 20 ? 'HAND' : 'ANKLE'
  }));
}
function itemPixels(item) {
  const l = lane(state.players[item.owner]);
  return { x: l.x + item.x * l.width, y: item.y * l.height, radius: Math.min(item.radius, l.width * 0.095) };
}
function catchItem(index) {
  const item = state.items[index], p = state.players[item.owner];
  if (state.phase === 'tutorial') {
    state.practice++; $('practiceCount').textContent = `${state.practice} practice catch${state.practice === 1 ? '' : 'es'}! Keep practising or start your round.`;
    item.x = Math.max(0.2, Math.min(0.8, p.center + (state.practice % 2 ? 0.12 : -0.12)));
    tone(true); return;
  }
  const earned = R.award(p, item);
  state.effects.push({ ...itemPixels(item), text: item.kind === 'bonus' ? '2× FRUIT! 10s' : earned > 0 ? `+${earned}` : '−10', life: 0.8 });
  state.items.splice(index, 1); tone(item.kind === 'good' || item.kind === 'bonus');
}
function collisions(now) {
  if (state.paused || state.players.some(p => trackingProblem(p, now))) return;
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i], point = itemPixels(item);
    if (limbPoints(state.players[item.owner]).some(p => Math.hypot(p.x - point.x, p.y - point.y) < point.radius + 20)) {
      if (state.phase !== 'tutorial' || now - (state.lastPracticeCatch || 0) > 800) { catchItem(i); state.lastPracticeCatch = now; }
    }
  }
}
function initAudio() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch {}
}
function tone(good) {
  if (!audio || audio.state !== 'running') return;
  const o = audio.createOscillator(), g = audio.createGain(); o.connect(g); g.connect(audio.destination);
  o.frequency.value = good ? 660 : 160; g.gain.setValueAtTime(Number($('volume').value) * 0.12, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.16); o.start(); o.stop(audio.currentTime + 0.17);
}
function draw() {
  const width = canvas.width, height = canvas.height;
  ctx.fillStyle = '#101c2d'; ctx.fillRect(0, 0, width, height);
  for (const p of state.players) {
    const l = lane(p); ctx.save(); ctx.beginPath(); ctx.rect(l.x, 0, l.width, height); ctx.clip();
    if (p.video?.readyState >= 2 && !state.demo) {
      const view = videoBounds(p);
      ctx.save();
      if ((state.settings || settings()).mirror) { ctx.translate(view.x + view.width, view.y || 0); ctx.scale(-1, 1); ctx.drawImage(p.video, 0, 0, view.width, view.height); }
      else ctx.drawImage(p.video, view.x, view.y || 0, view.width, view.height);
      ctx.restore();
      if (state.phase !== 'setup') { ctx.fillStyle = '#07142355'; ctx.fillRect(l.x, 0, l.width, height); }
    }
    if ((state.settings || settings()).limb === 'legs') {
      const center = Math.max(0.25, Math.min(0.75, p.center));
      ctx.fillStyle = '#7dd3fc16'; ctx.fillRect(l.x + (center - 0.15) * l.width, 0, l.width * 0.3, height);
      ctx.strokeStyle = '#7dd3fc88'; ctx.setLineDash([8, 8]); ctx.strokeRect(l.x + (center - 0.15) * l.width, 0, l.width * 0.3, height); ctx.setLineDash([]);
    }
    if (p.lastSeen && performance.now() - p.lastSeen < 1200 && !p.error) for (const point of limbPoints(p)) {
      ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(point.x, point.y, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#0b1526'; ctx.fillRect(point.x - 27, point.y - 43, 54, 18); ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(point.label, point.x, point.y - 29);
    }
    ctx.restore();
    if (p.id > 0) { ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(l.x, 0); ctx.lineTo(l.x, height); ctx.stroke(); }
  }
  if (state.phase === 'setup' && !state.players.some(p => p.video?.readyState >= 2)) {
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#b9ccdf'; ctx.font = '18px system-ui';
    ctx.fillText(state.demo ? 'Mouse / touch demo selected' : 'Your camera preview will appear here', width / 2, height / 2, width - 30);
    ctx.font = '14px system-ui'; ctx.fillStyle = '#8aa4bc';
    ctx.fillText(state.connecting ? 'Check the camera permission prompt in your browser' : 'Click Connect cameras below', width / 2, height / 2 + 30, width - 30);
    ctx.restore();
  }
  for (const item of state.items) {
    const pos = itemPixels(item), warning = item.speed > 0 && R.warning(item);
    ctx.save();
    if (warning && !$('reduceMotion').checked) ctx.globalAlpha = 0.65 + 0.35 * Math.cos(state.elapsed * Math.PI * 2);
    ctx.fillStyle = item.kind === 'bonus' ? '#614611' : item.kind === 'good' ? '#153c58' : '#781329';
    ctx.strokeStyle = item.kind === 'bonus' ? '#ffe083' : item.kind === 'good' ? '#9bdeff' : '#ff93a5'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (item.kind === 'good' || item.kind === 'bonus') ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
    else for (let i = 0; i <= 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; const x = pos.x + Math.cos(a) * pos.radius, y = pos.y + Math.sin(a) * pos.radius; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (item.kind === 'rotten' && rottenImage.complete && rottenImage.naturalWidth) ctx.drawImage(rottenImage, pos.x - pos.radius * 0.8, pos.y - pos.radius * 0.8, pos.radius * 1.6, pos.radius * 1.6);
    else {
      const text = item.kind === 'rotten' ? '✕' : item.kind === 'bomb' ? '💣' : item.symbol;
      ctx.font = `bold ${pos.radius * 1.05}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(text, pos.x, pos.y, pos.radius * 1.65);
    }
    ctx.globalAlpha = 1;
    if (item.kind === 'bonus') { ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe083'; ctx.fillText('2×', pos.x, pos.y + pos.radius + 15); }
    if (warning) { ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#071423'; ctx.fillRect(pos.x - 32, pos.y - pos.radius - 22, 64, 20); ctx.fillStyle = '#fff'; ctx.fillText('leaving', pos.x, pos.y - pos.radius - 11); }
    ctx.restore();
  }
  for (const e of state.effects) { ctx.save(); ctx.globalAlpha = e.life / 0.8; ctx.fillStyle = '#fff'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.text, e.x, e.y); ctx.restore(); }
}
function frame(now) {
  const dt = Math.min((now - (state.lastFrame || now)) / 1000, 0.1); state.lastFrame = now;
  if (state.phase === 'setup') {
    const live = state.players.some(p => p.video?.readyState >= 2) && !state.demo;
    $('previewBadge').textContent = `${live ? 'Live camera' : 'Camera preview'} · Mirror ${settings().mirror ? 'on' : 'off'}`;
    const ready = canStart(now); $('startButton').disabled = !ready;
    $('startButton').textContent = ready ? 'Start practice • 开始练习' : !live ? 'Connect a camera or try the demo' : 'Complete the camera checks below';
    const statuses = state.players.map(p => {
      const problem = trackingProblem(p, now);
      const seen = i => p.landmarks?.[i]?.visibility > 0.55;
      const limb = settings().limb;
      const checks = [`Shoulders ${seen(11) && seen(12) ? '✓' : '—'}`];
      if (limb !== 'hands') checks.push(`Hips ${seen(23) && seen(24) ? '✓' : '—'}`);
      if (limb !== 'legs') checks.push(`Hand ${seen(15) || seen(16) ? '✓' : '—'}`);
      if (limb !== 'hands') checks.push(`Ankle ${seen(27) || seen(28) ? '✓' : '—'}`);
      const progress = Math.min(100, Math.floor((now - (p.stableSince || now)) / 20));
      return `${names()[p.id]}: ${state.demo ? 'Demo ready' : `${checks.join(' · ')}\n${problem || (p.ready ? 'Ready ✓ — click Start practice' : `Calibrating ${progress}% · Keep these parts in view for two seconds`)}`}`;
    }).join('\n');
    if ($('playerStatus').textContent !== statuses) $('playerStatus').textContent = statuses;
  }
  if (['playing', 'tutorial'].includes(state.phase)) {
    const problems = state.players.map(p => { const issue = trackingProblem(p, now); return issue ? `${p.name}: ${issue}` : ''; }).filter(Boolean);
    if (document.hidden && state.phase === 'playing') { state.paused = true; $('pauseButton').textContent = 'Resume'; }
    const blocked = state.paused || problems.length > 0;
    $('safetyWarning').hidden = !blocked;
    $('safetyWarning').textContent = problems.length ? `Paused. ${problems.join(' ')}` : 'Paused — take your time. Press Resume when ready.';
    if (!blocked) {
      if (state.phase === 'playing') {
        state.remaining = Math.max(0, state.remaining - dt); state.elapsed += dt; state.spawn -= dt;
        state.players.forEach(p => { p.bonusLeft = Math.max(0, p.bonusLeft - dt); });
        if (state.spawn <= 0) {
          state.players.forEach(p => state.items.push(R.spawn(state.settings, p)));
          state.spawn = R.difficulty[state.settings.difficulty].delay * (state.settings.weights ? 1.3 : 1);
        }
        state.items.forEach(item => { item.y += item.speed * dt; });
        state.items = state.items.filter(item => item.y <= 1.12);
        state.effects.forEach(e => { e.life -= dt; e.y -= dt * 35; }); state.effects = state.effects.filter(e => e.life > 0);
        $('hudScore').textContent = state.players.map(p => `${p.name}: ${p.score}${p.bonusLeft > 0 ? ` · 2× ${Math.ceil(p.bonusLeft)}s` : ''}`).join('  |  ');
        $('hudTime').textContent = `${Math.ceil(state.remaining)}s`;
        if (state.remaining <= 0) finishRound(true);
      }
      if (['playing', 'tutorial'].includes(state.phase)) collisions(now);
    }
  }
  draw(); requestAnimationFrame(frame);
}
function resize() { canvas.width = Math.max(1, $('cameraStage').clientWidth); canvas.height = Math.max(1, $('cameraStage').clientHeight); }
$('connectButton').addEventListener('click', connectCameras);
$('setupConnect').addEventListener('click', connectCameras);
$('setupDemo').addEventListener('click', enableDemo);
$('setupMirror').addEventListener('click', () => { $('mirror').checked = !$('mirror').checked; updateSettings(); });
$('cancelConnect').addEventListener('click', async () => {
  await stopCameras(); state.connecting = false; lockControls();
  cameraMessage('Camera setup cancelled. You can reconnect or try the mouse / touch demo.');
});
$('demoButton').addEventListener('click', enableDemo);
$('startButton').addEventListener('click', startPractice);
$('skipTutorial').addEventListener('click', startRound);
$('completeTutorial').addEventListener('click', startRound);
$('finishButton').addEventListener('click', () => finishRound(false));
$('againButton').addEventListener('click', reset);
$('pauseButton').addEventListener('click', () => { state.paused = !state.paused; $('pauseButton').textContent = state.paused ? 'Resume' : 'Pause'; });
$('focusButton').addEventListener('click', () => {
  const hidden = document.body.classList.toggle('focus-mode'); $('focusButton').textContent = hidden ? 'Show settings' : 'Hide settings';
  $('focusButton').setAttribute('aria-expanded', String(!hidden)); resize();
});
$('fullscreenButton').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('gameArea').requestFullscreen(); }
  catch { document.body.classList.add('focus-mode'); $('focusButton').textContent = 'Show settings'; $('focusButton').setAttribute('aria-expanded', 'false'); $('cameraMessage').textContent = 'Fullscreen is unavailable here. Settings have been hidden to enlarge the game.'; resize(); }
});
document.addEventListener('fullscreenchange', () => { $('fullscreenButton').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; resize(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.phase === 'playing') { state.paused = true; $('pauseButton').textContent = 'Resume'; } state.lastFrame = 0; });
document.addEventListener('keydown', event => { if (event.code === 'Space' && state.phase === 'playing' && !['INPUT', 'SELECT', 'BUTTON'].includes(event.target.tagName)) { event.preventDefault(); $('pauseButton').click(); } });
canvas.addEventListener('pointerdown', event => {
  if (!state.demo || !['playing', 'tutorial'].includes(state.phase) || state.paused) return;
  const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
  for (let i = state.items.length - 1; i >= 0; i--) { const p = itemPixels(state.items[i]); if (Math.hypot(x - p.x, y - p.y) <= p.radius + 20) { catchItem(i); break; } }
});
$('gameSettings').addEventListener('change', async event => {
  if (event.target.id === 'players') { await stopCameras(); state.demo = false; cameraSelectors(); }
  updateSettings();
});
window.addEventListener('pagehide', () => { state.players.forEach(p => p.stream?.getTracks().forEach(t => t.stop())); });
$('reduceMotion').checked = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
new ResizeObserver(resize).observe($('cameraStage'));
loadScores(); cameraSelectors(); updateSettings(); resize(); requestAnimationFrame(frame);
