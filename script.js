(() => {
  'use strict';

  // ---------- DOM References ----------
  const screens = {
    start: document.getElementById('startScreen'),
    game: document.getElementById('gameScreen'),
    over: document.getElementById('gameOverScreen')
  };

  const ui = {
    playButton: document.getElementById('playButton'),
    pauseButton: document.getElementById('pauseButton'),
    restartButton: document.getElementById('restartButton'),
    menuButton: document.getElementById('menuButton'),
    scoreValue: document.getElementById('scoreValue'),
    levelValue: document.getElementById('levelValue'),
    stabilityBar: document.getElementById('stabilityBar'),
    menuHighScore: document.getElementById('menuHighScore'),
    finalScore: document.getElementById('finalScore'),
    endHighScore: document.getElementById('endHighScore'),
    gameArea: document.getElementById('gameArea'),
    entitiesLayer: document.getElementById('entitiesLayer'),
    levelUpNotice: document.getElementById('levelUpNotice'),
    shieldDome: document.getElementById('shieldDome')
  };

  const HIGH_SCORE_KEY = 'missile-grid-high-score';
  const BASE_Y_OFFSET = 24;

  // ---------- Game State ----------
  const game = {
    running: false,
    paused: false,
    animationId: null,
    spawnIntervalId: null,
    levelTimerId: null,
    score: 0,
    level: 1,
    stability: 100,
    missileSpeed: 1.2,
    spawnDelay: 1200,
    missilesPerWave: 1,
    missiles: [],
    interceptors: [],
    powerUps: [],
    multiShotUntil: 0,
    slowUntil: 0,
    shieldUntil: 0,
    highScore: Number(localStorage.getItem(HIGH_SCORE_KEY) || 0),
    lastTime: 0
  };

  // ---------- Audio ----------
  const audio = {
    context: null,
    ensure() {
      if (!this.context) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.context = new Ctx();
      }
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
    },
    tone({ freq = 440, duration = 0.14, type = 'sine', gain = 0.04, sweep = null }) {
      this.ensure();
      const now = this.context.currentTime;
      const osc = this.context.createOscillator();
      const amp = this.context.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (sweep) {
        osc.frequency.linearRampToValueAtTime(sweep, now + duration);
      }

      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(amp);
      amp.connect(this.context.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },
    launch() { this.tone({ freq: 520, duration: 0.08, type: 'triangle', gain: 0.03, sweep: 680 }); },
    explosion() { this.tone({ freq: 180, duration: 0.16, type: 'sawtooth', gain: 0.05, sweep: 90 }); },
    baseHit() { this.tone({ freq: 120, duration: 0.18, type: 'square', gain: 0.05, sweep: 70 }); },
    levelUp() {
      this.tone({ freq: 440, duration: 0.08, type: 'triangle', gain: 0.03 });
      setTimeout(() => this.tone({ freq: 660, duration: 0.11, type: 'triangle', gain: 0.03 }), 90);
    },
    gameOver() { this.tone({ freq: 260, duration: 0.3, type: 'sine', gain: 0.05, sweep: 120 }); }
  };

  // ---------- Utility ----------
  const nowMs = () => performance.now();

  function setScreen(next) {
    Object.values(screens).forEach((screen) => screen.classList.remove('active'));
    screens[next].classList.add('active');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createEntity(className, x, y, extraClass = '') {
    const node = document.createElement('div');
    node.className = `${className}${extraClass ? ` ${extraClass}` : ''}`;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    ui.entitiesLayer.appendChild(node);
    return node;
  }

  function spawnExplosion(x, y) {
    const exp = createEntity('explosion', x, y);
    setTimeout(() => exp.remove(), 380);
  }

  function getBounds(el) {
    return el.getBoundingClientRect();
  }

  function intersects(a, b) {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  }

  // ---------- Spawning ----------
  function spawnMissile() {
    if (!game.running || game.paused) return;

    const rect = ui.gameArea.getBoundingClientRect();
    const spawnCount = game.level > 5 ? game.missilesPerWave : 1;

    for (let i = 0; i < spawnCount; i += 1) {
      const x = 20 + Math.random() * (rect.width - 40);
      const missile = {
        x,
        y: -10,
        speed: game.missileSpeed * (0.85 + Math.random() * 0.5),
        el: createEntity('missile', x, -10)
      };
      game.missiles.push(missile);
    }

    if (Math.random() < 0.18) {
      spawnPowerUp();
    }
  }

  function spawnPowerUp() {
    const rect = ui.gameArea.getBoundingClientRect();
    const types = ['shield', 'slow', 'multi'];
    const type = types[Math.floor(Math.random() * types.length)];

    const power = {
      type,
      x: 20 + Math.random() * (rect.width - 40),
      y: -10,
      speed: 0.75,
      el: createEntity('power-up', 0, 0, type)
    };

    power.el.style.left = `${power.x}px`;
    power.el.style.top = `${power.y}px`;
    game.powerUps.push(power);
  }

  // ---------- Player Actions ----------
  function fireInterceptor(targetX, targetY) {
    if (!game.running || game.paused) return;

    const rect = ui.gameArea.getBoundingClientRect();
    const startX = rect.width / 2;
    const startY = rect.height - BASE_Y_OFFSET;

    const angle = Math.atan2(targetY - startY, targetX - startX);
    const speed = 5.2;

    const interceptor = {
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      el: createEntity('interceptor', startX, startY)
    };

    interceptor.el.style.transform = `translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad)`;
    game.interceptors.push(interceptor);
    audio.launch();
  }

  function shootAt(clientX, clientY) {
    const rect = ui.gameArea.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const isMulti = nowMs() < game.multiShotUntil;
    if (!isMulti) {
      fireInterceptor(localX, localY);
      return;
    }

    fireInterceptor(localX, localY);
    fireInterceptor(localX - 40, localY + 30);
    fireInterceptor(localX + 40, localY + 30);
  }

  function straightShot() {
    const rect = ui.gameArea.getBoundingClientRect();
    shootAt(rect.left + rect.width / 2, rect.top + rect.height * 0.2);
  }

  // ---------- Power-up Logic ----------
  function applyPower(type) {
    const t = nowMs();
    if (type === 'shield') {
      game.shieldUntil = t + 5000;
      ui.shieldDome.classList.remove('hidden');
    }
    if (type === 'slow') {
      game.slowUntil = t + 5000;
    }
    if (type === 'multi') {
      game.multiShotUntil = t + 8000;
    }
  }

  // ---------- Main Update ----------
  function update() {
    if (!game.running || game.paused) return;

    const areaRect = ui.gameArea.getBoundingClientRect();
    const baseRect = document.getElementById('base').getBoundingClientRect();

    const slowFactor = nowMs() < game.slowUntil ? 0.45 : 1;

    // Move missiles
    for (let i = game.missiles.length - 1; i >= 0; i -= 1) {
      const m = game.missiles[i];
      m.y += m.speed * slowFactor;
      m.el.style.top = `${m.y}px`;

      const mRect = getBounds(m.el);
      if (intersects(mRect, baseRect)) {
        m.el.remove();
        game.missiles.splice(i, 1);

        if (nowMs() >= game.shieldUntil) {
          game.stability = clamp(game.stability - 10, 0, 100);
          ui.gameArea.classList.add('shake');
          setTimeout(() => ui.gameArea.classList.remove('shake'), 280);
          audio.baseHit();
        } else {
          spawnExplosion(m.x, m.y);
        }

        if (game.stability <= 0) {
          endGame();
          return;
        }
      } else if (m.y > areaRect.height + 30) {
        m.el.remove();
        game.missiles.splice(i, 1);
      }
    }

    // Move interceptors
    for (let i = game.interceptors.length - 1; i >= 0; i -= 1) {
      const inter = game.interceptors[i];
      inter.x += inter.vx;
      inter.y += inter.vy;
      inter.el.style.left = `${inter.x}px`;
      inter.el.style.top = `${inter.y}px`;

      if (inter.y < -30 || inter.x < -30 || inter.x > areaRect.width + 30) {
        inter.el.remove();
        game.interceptors.splice(i, 1);
      }
    }

    // Move power-ups
    for (let i = game.powerUps.length - 1; i >= 0; i -= 1) {
      const p = game.powerUps[i];
      p.y += p.speed;
      p.el.style.top = `${p.y}px`;

      if (p.y > areaRect.height - 40) {
        applyPower(p.type);
        spawnExplosion(p.x, p.y);
        p.el.remove();
        game.powerUps.splice(i, 1);
      }
    }

    // Interceptor collisions with missiles + power-ups
    for (let i = game.interceptors.length - 1; i >= 0; i -= 1) {
      const inter = game.interceptors[i];
      const iRect = getBounds(inter.el);
      let removedInterceptor = false;

      for (let j = game.missiles.length - 1; j >= 0; j -= 1) {
        const m = game.missiles[j];
        if (intersects(iRect, getBounds(m.el))) {
          spawnExplosion(m.x, m.y);
          m.el.remove();
          game.missiles.splice(j, 1);
          game.score += 10;
          audio.explosion();

          inter.el.remove();
          game.interceptors.splice(i, 1);
          removedInterceptor = true;
          break;
        }
      }
      if (removedInterceptor) continue;

      for (let j = game.powerUps.length - 1; j >= 0; j -= 1) {
        const p = game.powerUps[j];
        if (intersects(iRect, getBounds(p.el))) {
          applyPower(p.type);
          spawnExplosion(p.x, p.y);
          p.el.remove();
          game.powerUps.splice(j, 1);

          inter.el.remove();
          game.interceptors.splice(i, 1);
          break;
        }
      }
    }

    if (nowMs() >= game.shieldUntil) {
      ui.shieldDome.classList.add('hidden');
    }

    updateHud();
  }

  function loop() {
    update();
    game.animationId = requestAnimationFrame(loop);
  }

  // ---------- Progression ----------
  function levelUp() {
    if (!game.running) return;

    game.level += 1;
    game.missileSpeed += 0.35;
    game.spawnDelay = Math.max(350, game.spawnDelay - 130);

    if (game.level > 5) {
      game.missilesPerWave = Math.min(4, game.missilesPerWave + 1);
    }

    ui.levelUpNotice.classList.remove('show');
    void ui.levelUpNotice.offsetWidth;
    ui.levelUpNotice.classList.add('show');

    audio.levelUp();
    resetSpawnTimer();
    updateHud();
  }

  function resetSpawnTimer() {
    clearInterval(game.spawnIntervalId);
    game.spawnIntervalId = setInterval(spawnMissile, game.spawnDelay);
  }

  // ---------- Lifecycle ----------
  function updateHud() {
    ui.scoreValue.textContent = String(game.score);
    ui.levelValue.textContent = String(game.level);
    ui.stabilityBar.style.width = `${game.stability}%`;
    ui.stabilityBar.parentElement.setAttribute('aria-valuenow', String(game.stability));
  }

  function clearEntities() {
    [...game.missiles, ...game.interceptors, ...game.powerUps].forEach((entity) => entity.el.remove());
    game.missiles = [];
    game.interceptors = [];
    game.powerUps = [];
    ui.entitiesLayer.innerHTML = '';
  }

  function startGame() {
    game.running = true;
    game.paused = false;
    game.score = 0;
    game.level = 1;
    game.stability = 100;
    game.missileSpeed = 1.2;
    game.spawnDelay = 1200;
    game.missilesPerWave = 1;
    game.multiShotUntil = 0;
    game.slowUntil = 0;
    game.shieldUntil = 0;

    clearEntities();
    ui.shieldDome.classList.add('hidden');
    ui.pauseButton.textContent = 'Pause';
    updateHud();

    setScreen('game');

    resetSpawnTimer();
    clearInterval(game.levelTimerId);
    game.levelTimerId = setInterval(levelUp, 20000);

    cancelAnimationFrame(game.animationId);
    game.animationId = requestAnimationFrame(loop);
  }

  function stopGameTimers() {
    clearInterval(game.spawnIntervalId);
    clearInterval(game.levelTimerId);
    cancelAnimationFrame(game.animationId);
  }

  function endGame() {
    game.running = false;
    game.paused = false;
    stopGameTimers();

    if (game.score > game.highScore) {
      game.highScore = game.score;
      localStorage.setItem(HIGH_SCORE_KEY, String(game.highScore));
    }

    ui.finalScore.textContent = String(game.score);
    ui.endHighScore.textContent = String(game.highScore);
    ui.menuHighScore.textContent = String(game.highScore);
    setScreen('over');
    audio.gameOver();
  }

  function togglePause() {
    if (!game.running) return;
    game.paused = !game.paused;
    ui.pauseButton.textContent = game.paused ? 'Resume' : 'Pause';

    if (!game.paused) {
      cancelAnimationFrame(game.animationId);
      game.animationId = requestAnimationFrame(loop);
    }
  }

  function showMenu() {
    game.running = false;
    game.paused = false;
    stopGameTimers();
    clearEntities();
    setScreen('start');
    ui.menuHighScore.textContent = String(game.highScore);
  }

  // ---------- Events ----------
  ui.playButton.addEventListener('click', startGame);
  ui.pauseButton.addEventListener('click', togglePause);
  ui.restartButton.addEventListener('click', startGame);
  ui.menuButton.addEventListener('click', showMenu);

  ui.gameArea.addEventListener('click', (event) => {
    shootAt(event.clientX, event.clientY);
  });

  ui.gameArea.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    shootAt(touch.clientX, touch.clientY);
  }, { passive: true });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      if (screens.game.classList.contains('active')) {
        event.preventDefault();
        straightShot();
      }
    }

    if (event.code === 'KeyP') {
      togglePause();
    }
  });

  // Initial menu high score
  ui.menuHighScore.textContent = String(game.highScore);
})();
