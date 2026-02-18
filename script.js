/*
 * Canvas Platformer Adventure
 * - Vanilla JS + HTML5 canvas
 * - Tile-based levels
 * - Multi-screen UI + generated audio effects
 */

class AudioManager {
  constructor() {
    this.context = null;
    this.musicEnabled = true;
    this.musicNodes = [];
    this.musicTick = 0;
    this.musicInterval = null;
  }

  init() {
    if (!this.context) {
      const AudioContextRef = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextRef();
    }
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  createTone({ frequency = 440, type = 'sine', duration = 0.15, volume = 0.15, slideTo = null }) {
    if (!this.context) return;

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) {
      oscillator.frequency.linearRampToValueAtTime(slideTo, now + duration);
    }

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  playJump() {
    this.init();
    this.createTone({ frequency: 520, type: 'triangle', duration: 0.12, volume: 0.12, slideTo: 760 });
  }

  playHit() {
    this.init();
    this.createTone({ frequency: 180, type: 'square', duration: 0.18, volume: 0.14, slideTo: 90 });
  }

  playLevelComplete() {
    this.init();
    this.createTone({ frequency: 523, duration: 0.12, type: 'triangle', volume: 0.13 });
    setTimeout(() => this.createTone({ frequency: 659, duration: 0.12, type: 'triangle', volume: 0.13 }), 120);
    setTimeout(() => this.createTone({ frequency: 784, duration: 0.2, type: 'triangle', volume: 0.13 }), 260);
  }

  playGameOver() {
    this.init();
    this.createTone({ frequency: 330, duration: 0.15, type: 'sawtooth', volume: 0.13, slideTo: 240 });
    setTimeout(() => this.createTone({ frequency: 250, duration: 0.2, type: 'sawtooth', volume: 0.13, slideTo: 140 }), 160);
  }

  stopMusic() {
    this.musicNodes.forEach((node) => {
      try {
        node.osc.stop();
      } catch (_) {
        // No-op if already stopped.
      }
      node.osc.disconnect();
      node.gain.disconnect();
    });
    this.musicNodes = [];

    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  startMusic() {
    this.init();
    this.stopMusic();

    if (!this.musicEnabled || !this.context) return;

    const bassPattern = [130.81, 146.83, 174.61, 196.0, 174.61, 146.83];
    const leadPattern = [261.63, 329.63, 392.0, 329.63, 293.66, 329.63, 392.0, 523.25];

    this.musicTick = 0;
    this.musicInterval = setInterval(() => {
      if (!this.musicEnabled) return;
      const bass = bassPattern[this.musicTick % bassPattern.length];
      const lead = leadPattern[this.musicTick % leadPattern.length];
      this.createTone({ frequency: bass, type: 'sine', duration: 0.23, volume: 0.06 });
      this.createTone({ frequency: lead, type: 'triangle', duration: 0.12, volume: 0.045 });
      this.musicTick += 1;
    }, 250);
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
    return this.musicEnabled;
  }
}

class Platform {
  constructor(x, y, width, height, tileSize) {
    this.x = x * tileSize;
    this.y = y * tileSize;
    this.width = width * tileSize;
    this.height = height * tileSize;
  }

  draw(ctx, cameraX) {
    const px = this.x - cameraX;
    ctx.fillStyle = '#384f70';
    ctx.fillRect(px, this.y, this.width, this.height);
    ctx.fillStyle = '#4f6a8f';
    ctx.fillRect(px, this.y, this.width, 8);
  }
}

class Enemy {
  constructor(x, y, tileSize, range = 3, speed = 1.2) {
    this.x = x * tileSize;
    this.y = y * tileSize;
    this.width = tileSize * 0.8;
    this.height = tileSize * 0.8;
    this.startX = this.x;
    this.range = range * tileSize;
    this.speed = speed;
    this.direction = 1;
  }

  update(deltaTime) {
    this.x += this.direction * this.speed * (deltaTime * 60);
    if (this.x > this.startX + this.range || this.x < this.startX - this.range) {
      this.direction *= -1;
    }
  }

  draw(ctx, cameraX) {
    const px = this.x - cameraX;
    ctx.fillStyle = '#b23131';
    ctx.fillRect(px, this.y, this.width, this.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + 8, this.y + 8, 6, 6);
    ctx.fillRect(px + this.width - 14, this.y + 8, 6, 6);
  }
}

class Player {
  constructor(x, y, tileSize) {
    this.spawnX = x * tileSize;
    this.spawnY = y * tileSize;
    this.width = tileSize * 0.75;
    this.height = tileSize * 0.95;
    this.speed = 4;
    this.jumpForce = 12;
    this.gravity = 0.6;
    this.maxFallSpeed = 14;
    this.reset();
  }

  reset() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
  }

  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  update(input, platforms, deltaTime, worldWidth, audio) {
    const frameFactor = deltaTime * 60;

    // Horizontal movement
    if (input.left) {
      this.vx = -this.speed;
    } else if (input.right) {
      this.vx = this.speed;
    } else {
      this.vx *= 0.8;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
    }

    // Jump
    if (input.jumpPressed && this.onGround) {
      this.vy = -this.jumpForce;
      this.onGround = false;
      audio.playJump();
    }

    // Gravity
    this.vy += this.gravity * frameFactor;
    if (this.vy > this.maxFallSpeed) {
      this.vy = this.maxFallSpeed;
    }

    // Horizontal collision resolution
    this.x += this.vx * frameFactor;
    for (const platform of platforms) {
      if (rectIntersect(this.getBounds(), platform)) {
        if (this.vx > 0) {
          this.x = platform.x - this.width;
        } else if (this.vx < 0) {
          this.x = platform.x + platform.width;
        }
        this.vx = 0;
      }
    }

    // Vertical collision resolution
    this.y += this.vy * frameFactor;
    this.onGround = false;
    for (const platform of platforms) {
      if (rectIntersect(this.getBounds(), platform)) {
        if (this.vy > 0) {
          this.y = platform.y - this.height;
          this.onGround = true;
        } else if (this.vy < 0) {
          this.y = platform.y + platform.height;
        }
        this.vy = 0;
      }
    }

    // World bounds
    if (this.x < 0) this.x = 0;
    if (this.x + this.width > worldWidth) this.x = worldWidth - this.width;
  }

  draw(ctx, cameraX) {
    const px = this.x - cameraX;
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(px, this.y, this.width, this.height);
    ctx.fillStyle = '#173f2b';
    ctx.fillRect(px + 8, this.y + 8, this.width - 16, 10);
  }
}

class Level {
  constructor(config, tileSize) {
    this.tileSize = tileSize;
    this.map = config.map;
    this.width = this.map[0].length * tileSize;
    this.height = this.map.length * tileSize;
    this.playerSpawn = config.playerSpawn;
    this.goal = { x: config.goal.x * tileSize, y: config.goal.y * tileSize, width: tileSize, height: tileSize * 1.3 };
    this.platforms = [];
    this.enemies = [];

    this.parseMap();
  }

  parseMap() {
    for (let row = 0; row < this.map.length; row++) {
      for (let col = 0; col < this.map[row].length; col++) {
        const tile = this.map[row][col];
        if (tile === 1) {
          this.platforms.push(new Platform(col, row, 1, 1, this.tileSize));
        } else if (tile === 2) {
          this.enemies.push(new Enemy(col, row, this.tileSize));
        } else if (typeof tile === 'object' && tile.type === 'enemy') {
          this.enemies.push(new Enemy(col, row, this.tileSize, tile.range || 3, tile.speed || 1.2));
        }
      }
    }
  }

  drawBackground(ctx, cameraX, canvasWidth, canvasHeight) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    grad.addColorStop(0, '#6ec6ff');
    grad.addColorStop(1, '#dff3ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Parallax hills
    ctx.fillStyle = '#9ad79b';
    for (let i = 0; i < 8; i++) {
      const x = (i * 260) - (cameraX * 0.25 % 260);
      ctx.beginPath();
      ctx.arc(x, canvasHeight + 80, 160, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#7dbc80';
    for (let i = 0; i < 10; i++) {
      const x = (i * 200) - (cameraX * 0.45 % 200);
      ctx.beginPath();
      ctx.arc(x, canvasHeight + 100, 120, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGoal(ctx, cameraX) {
    const x = this.goal.x - cameraX;
    ctx.fillStyle = '#6b4f2a';
    ctx.fillRect(x + 10, this.goal.y - 30, 8, this.goal.height + 30);
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath();
    ctx.moveTo(x + 18, this.goal.y - 28);
    ctx.lineTo(x + 58, this.goal.y - 15);
    ctx.lineTo(x + 18, this.goal.y - 2);
    ctx.closePath();
    ctx.fill();
  }

  update(deltaTime) {
    this.enemies.forEach((enemy) => enemy.update(deltaTime));
  }

  draw(ctx, cameraX, canvasWidth, canvasHeight) {
    this.drawBackground(ctx, cameraX, canvasWidth, canvasHeight);
    this.platforms.forEach((p) => p.draw(ctx, cameraX));
    this.enemies.forEach((e) => e.draw(ctx, cameraX));
    this.drawGoal(ctx, cameraX);
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tileSize = 48;

    this.ui = {
      mainMenu: document.getElementById('mainMenu'),
      levelSelectMenu: document.getElementById('levelSelectMenu'),
      pauseMenu: document.getElementById('pauseMenu'),
      gameOverScreen: document.getElementById('gameOverScreen'),
      victoryScreen: document.getElementById('victoryScreen'),
      hud: document.getElementById('hud'),
      scoreValue: document.getElementById('scoreValue'),
      livesValue: document.getElementById('livesValue'),
      levelValue: document.getElementById('levelValue'),
      finalScoreValue: document.getElementById('finalScoreValue'),
      victoryScoreValue: document.getElementById('victoryScoreValue'),
      musicToggleBtn: document.getElementById('musicToggleBtn'),
      levelButtons: document.getElementById('levelButtons')
    };

    this.audio = new AudioManager();
    this.input = { left: false, right: false, jump: false, jumpPressed: false };

    this.levelConfigs = this.buildLevels();
    this.totalLevels = this.levelConfigs.length;

    this.resetGameData();
    this.gameState = 'menu'; // menu, levelSelect, playing, paused, gameOver, victory
    this.lastTimestamp = 0;

    this.bindInputs();
    this.bindUI();
    this.populateLevelSelect();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resetGameData() {
    this.score = 0;
    this.lives = 3;
    this.currentLevelIndex = 0;
    this.cameraX = 0;
    this.level = null;
    this.player = null;
  }

  buildLevels() {
    return [
      {
        playerSpawn: { x: 2, y: 8 },
        goal: { x: 36, y: 8 },
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        ]
      },
      {
        playerSpawn: { x: 2, y: 7 },
        goal: { x: 40, y: 4 },
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,1,1,0,0,0,0,{"type":"enemy","range":2,"speed":1.3},0,0,1,1,1,0,0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        ]
      },
      {
        playerSpawn: { x: 1, y: 7 },
        goal: { x: 46, y: 3 },
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,{"type":"enemy","range":3,"speed":1.6},0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        ]
      }
    ];
  }

  loadLevel(index) {
    this.currentLevelIndex = index;
    this.level = new Level(this.levelConfigs[index], this.tileSize);
    this.player = new Player(this.level.playerSpawn.x, this.level.playerSpawn.y, this.tileSize);
    this.cameraX = 0;
    this.syncHUD();
  }

  startGame(levelIndex = 0, keepScore = false, keepLives = false) {
    if (!keepScore) this.score = 0;
    if (!keepLives) this.lives = 3;

    this.loadLevel(levelIndex);
    this.gameState = 'playing';
    this.showUI('none');
    this.ui.hud.classList.remove('hidden');
    this.audio.startMusic();
  }

  restartCurrentLevel() {
    const current = this.currentLevelIndex;
    this.loadLevel(current);
    this.gameState = 'playing';
    this.showUI('none');
    this.ui.hud.classList.remove('hidden');
  }

  handlePlayerDeath() {
    this.lives -= 1;
    this.audio.playHit();
    this.syncHUD();

    if (this.lives <= 0) {
      this.gameState = 'gameOver';
      this.ui.finalScoreValue.textContent = String(this.score);
      this.showUI('gameOver');
      this.ui.hud.classList.add('hidden');
      this.audio.playGameOver();
      return;
    }

    this.player.reset();
  }

  completeLevel() {
    this.score += 500;
    this.syncHUD();
    this.audio.playLevelComplete();

    if (this.currentLevelIndex < this.totalLevels - 1) {
      this.loadLevel(this.currentLevelIndex + 1);
    } else {
      this.gameState = 'victory';
      this.ui.victoryScoreValue.textContent = String(this.score);
      this.showUI('victory');
      this.ui.hud.classList.add('hidden');
    }
  }

  bindInputs() {
    const moveKeys = new Set(['arrowleft', 'a', 'arrowright', 'd', ' ', 'arrowup', 'w']);

    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (moveKeys.has(key)) event.preventDefault();

      if (key === 'arrowleft' || key === 'a') this.input.left = true;
      if (key === 'arrowright' || key === 'd') this.input.right = true;
      if (key === ' ' || key === 'arrowup' || key === 'w') {
        if (!this.input.jump) this.input.jumpPressed = true;
        this.input.jump = true;
      }

      if (key === 'escape' && this.gameState === 'playing') {
        this.pauseGame();
      } else if (key === 'escape' && this.gameState === 'paused') {
        this.resumeGame();
      }
    });

    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();

      if (key === 'arrowleft' || key === 'a') this.input.left = false;
      if (key === 'arrowright' || key === 'd') this.input.right = false;
      if (key === ' ' || key === 'arrowup' || key === 'w') this.input.jump = false;
    });
  }

  bindUI() {
    const byId = (id) => document.getElementById(id);

    byId('startBtn').addEventListener('click', () => {
      this.audio.init();
      this.startGame(0);
    });

    byId('levelSelectBtn').addEventListener('click', () => {
      this.gameState = 'levelSelect';
      this.showUI('levelSelect');
    });

    byId('musicToggleBtn').addEventListener('click', () => {
      this.audio.init();
      const enabled = this.audio.toggleMusic();
      this.ui.musicToggleBtn.textContent = `Music: ${enabled ? 'On' : 'Off'}`;
    });

    byId('backToMainBtn').addEventListener('click', () => {
      this.showMainMenu();
    });

    byId('pauseBtn').addEventListener('click', () => {
      if (this.gameState === 'playing') this.pauseGame();
    });

    byId('resumeBtn').addEventListener('click', () => this.resumeGame());

    byId('restartBtn').addEventListener('click', () => {
      this.restartCurrentLevel();
    });

    byId('pauseToMenuBtn').addEventListener('click', () => this.showMainMenu());

    byId('gameOverRestartBtn').addEventListener('click', () => {
      this.startGame(0);
    });

    byId('gameOverMenuBtn').addEventListener('click', () => this.showMainMenu());
    byId('victoryMenuBtn').addEventListener('click', () => this.showMainMenu());
  }

  populateLevelSelect() {
    this.ui.levelButtons.innerHTML = '';
    this.levelConfigs.forEach((_, index) => {
      const button = document.createElement('button');
      button.textContent = `Level ${index + 1}`;
      button.addEventListener('click', () => {
        this.audio.init();
        this.startGame(index);
      });
      this.ui.levelButtons.appendChild(button);
    });
  }

  pauseGame() {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';
    this.showUI('pause');
  }

  resumeGame() {
    if (this.gameState !== 'paused') return;
    this.gameState = 'playing';
    this.showUI('none');
    this.ui.hud.classList.remove('hidden');
  }

  showMainMenu() {
    this.gameState = 'menu';
    this.showUI('menu');
    this.ui.hud.classList.add('hidden');
    this.resetGameData();
  }

  showUI(target) {
    const overlays = [
      this.ui.mainMenu,
      this.ui.levelSelectMenu,
      this.ui.pauseMenu,
      this.ui.gameOverScreen,
      this.ui.victoryScreen
    ];
    overlays.forEach((overlay) => overlay.classList.remove('visible'));

    if (target === 'menu') this.ui.mainMenu.classList.add('visible');
    if (target === 'levelSelect') this.ui.levelSelectMenu.classList.add('visible');
    if (target === 'pause') this.ui.pauseMenu.classList.add('visible');
    if (target === 'gameOver') this.ui.gameOverScreen.classList.add('visible');
    if (target === 'victory') this.ui.victoryScreen.classList.add('visible');
  }

  syncHUD() {
    this.ui.scoreValue.textContent = String(this.score);
    this.ui.livesValue.textContent = String(this.lives);
    this.ui.levelValue.textContent = String(this.currentLevelIndex + 1);
  }

  update(deltaTime) {
    if (this.gameState !== 'playing' || !this.level || !this.player) return;

    this.level.update(deltaTime);
    this.player.update(this.input, this.level.platforms, deltaTime, this.level.width, this.audio);

    // Enemy collisions
    const playerBounds = this.player.getBounds();
    for (const enemy of this.level.enemies) {
      if (rectIntersect(playerBounds, enemy)) {
        this.handlePlayerDeath();
        return;
      }
    }

    // Fall off map
    if (this.player.y > this.canvas.height + 180) {
      this.handlePlayerDeath();
      return;
    }

    // Goal check
    if (rectIntersect(playerBounds, this.level.goal)) {
      this.completeLevel();
      return;
    }

    // Score progression for movement
    const scoreFromProgress = Math.floor(this.player.x / 80) + (this.currentLevelIndex * 500);
    if (scoreFromProgress > this.score) {
      this.score = scoreFromProgress;
      this.syncHUD();
    }

    // Camera follows player
    this.cameraX = this.player.x - this.canvas.width * 0.35;
    if (this.cameraX < 0) this.cameraX = 0;
    const maxCam = Math.max(0, this.level.width - this.canvas.width);
    if (this.cameraX > maxCam) this.cameraX = maxCam;

    this.input.jumpPressed = false;
  }

  draw() {
    if (this.level) {
      this.level.draw(this.ctx, this.cameraX, this.canvas.width, this.canvas.height);
      if (this.player) {
        this.player.draw(this.ctx, this.cameraX);
      }
    } else {
      this.ctx.fillStyle = '#0f1d2f';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Overlay hint in pause/game states
    if (this.gameState === 'paused') {
      this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  loop(timestamp) {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const delta = Math.min(0.033, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    this.update(delta);
    this.draw();

    requestAnimationFrame(this.loop);
  }
}

function rectIntersect(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const game = new Game(canvas);
  game.showMainMenu();
});
