/* Pure rules shared by the browser and the regression tests. */
(function (root) {
  'use strict';
  const themes = {
    fruit: ['🍎', '🍐', '🍑'], celebration: ['🧧', '🏮', '🎁'],
    garden: ['🌻', '🌷', '🌿'], sport: ['⚽', '🏀', '🎾']
  };
  const difficulty = {
    easy: { speed: 0.105, delay: 1.65, radius: 44 },
    medium: { speed: 0.16, delay: 1.25, radius: 36 },
    hard: { speed: 0.23, delay: 0.95, radius: 30 }
  };
  function objectList(theme, custom) {
    const tokens = String(custom || '').split(',').map(s => Array.from(s.trim()).slice(0, 12).join('')).filter(Boolean).slice(0, 6);
    return theme === 'custom' && tokens.length ? tokens : (themes[theme] || themes.fruit);
  }
  function spawn(settings, player, random = Math.random) {
    const rules = difficulty[settings.difficulty];
    const roll = random();
    const kind = roll < 0.8 ? 'good' : (settings.limb === 'legs' || roll < 0.92 ? 'rotten' : 'bomb');
    const choices = objectList(settings.theme, settings.custom);
    const halfWidth = settings.limb === 'legs' ? 0.15 : 0.36;
    const center = settings.limb === 'legs' ? Math.max(0.25, Math.min(0.75, player.center || 0.5)) : 0.5;
    return { owner: player.id, kind, x: center + (random() * 2 - 1) * halfWidth,
      y: -0.12, speed: rules.speed * (0.85 + random() * 0.3) * (settings.weights ? 0.7 : 1),
      radius: rules.radius, symbol: choices[Math.floor(random() * choices.length)],
      points: kind === 'good' ? 10 : -10 };
  }
  function warning(item) { return (1.12 - item.y) / item.speed <= 1.8; }
  function proximity(landmarks, baseline, wasClose) {
    const visible = i => landmarks?.[i] && landmarks[i].visibility > 0.6;
    if (![11, 12, 23, 24].every(visible)) return { valid: false, close: false, scale: 0 };
    const a = landmarks[11], b = landmarks[12], c = landmarks[23], d = landmarks[24];
    const width = Math.hypot(a.x - b.x, a.y - b.y);
    const torso = Math.hypot((a.x + b.x - c.x - d.x) / 2, (a.y + b.y - c.y - d.y) / 2);
    const scale = Math.max(width, torso);
    const limit = wasClose ? 1.22 : 1.4;
    return { valid: true, scale, close: width > 0.55 || torso > 0.6 || Boolean(baseline && scale > baseline * limit) };
  }
  function tracked(landmarks, limb) {
    const seen = i => landmarks?.[i]?.visibility > 0.55;
    const hands = seen(15) || seen(16), legs = seen(27) || seen(28);
    return limb === 'hands' ? hands : limb === 'legs' ? legs : hands && legs;
  }
  function cleanScores(value) {
    return Array.isArray(value) ? value.filter(s => s && typeof s.name === 'string' &&
      Number.isFinite(s.score) && s.score >= 0 && typeof s.mode === 'string').slice(0, 100) : [];
  }
  const api = { themes, difficulty, objectList, spawn, warning, proximity, tracked, cleanScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatcherRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
