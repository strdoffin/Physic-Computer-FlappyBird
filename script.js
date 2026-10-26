// ===== Mobile menu =====
const mobileMenu = document.getElementById("mobile-menu");
function toggleMenu() {
  mobileMenu.classList.toggle("hidden");
  mobileMenu.classList.toggle("flex");
}
document.getElementById("menu-btn").onclick = toggleMenu;
mobileMenu.querySelectorAll("a").forEach((link) => (link.onclick = toggleMenu)); // close after choosing

// ===== Game settings =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const WIDTH = 400,
  HEIGHT = 600,
  GROUND = 40;
const BIRD_X = 80,
  BIRD_SIZE = 24;
const GRAVITY = 0.45,
  JUMP_POWER = -8;
const PIPE_WIDTH = 60,
  PIPE_GAP = 150,
  PIPE_SPEED = 3,
  PIPE_EVERY = 90; // new pipe every 90 frames

// Hand mode (ultrasonic) - edit these to change the hand range and feel
const HAND_LOW_CM = 5; // hand this close to the sensor = bird at the bottom
const HAND_HIGH_CM = 40; // hand this far from the sensor = bird at the top
const HAND_SMOOTH = 0.15; // how fast the bird follows the hand: 0.05 = slow and smooth, 0.3 = fast

// ===== Game state =====
let state = "ready"; // 'ready' | 'countdown' | 'playing' | 'over'
let countdown = 0; // frames left in the 3-2-1 countdown
let tick = 0; // frame counter for the hovering bird
let birdY, speedY, pipes, frame, score;
let best = 0;
let overTime = 0;
let handMode = false; // true = bird follows the hand (ultrasonic)
let handCm = 0; // distance from the board, 0 = no hand

function resetGame() {
  state = "ready";
  birdY = 250;
  speedY = 0;
  pipes = [];
  frame = 0;
  score = 0;
  showScore();
}

function startGame() {
  state = "playing";
  speedY = JUMP_POWER;
}

// START button on the board: fresh game with a short 3-2-1 countdown
function startButton() {
  resetGame();
  state = "countdown";
  countdown = 90; // 90 frames = 1.5 seconds
}

// Called by SPACE, mouse click, or "JUMP!" from the Arduino
function jump() {
  if (state === "ready") startGame();
  else if (state === "playing" && !handMode) speedY = JUMP_POWER;
  else if (state === "over" && Date.now() - overTime > 1000) resetGame();
}

function gameOver() {
  state = "over";
  overTime = Date.now();
  best = Math.max(best, score);
  showScore();
}

function showScore() {
  document.getElementById("score-text").textContent = score;
  document.getElementById("best-text").textContent = best;
}

// ===== Update (runs 60 times per second) =====
function update() {
  tick++;

  // before the game starts, the bird hovers gently
  if (state === "ready" || state === "countdown") {
    birdY = 250 + Math.sin(tick / 12) * 8;
    if (state === "countdown") {
      countdown--;
      if (countdown <= 0) startGame();
    }
    return;
  }
  if (state !== "playing") return;

  // bird
  if (handMode && handCm > 0) {
    const cm = Math.min(HAND_HIGH_CM, Math.max(HAND_LOW_CM, handCm));
    const percent = (cm - HAND_LOW_CM) / (HAND_HIGH_CM - HAND_LOW_CM); // 0 = low, 1 = high
    const topY = 30,
      bottomY = HEIGHT - GROUND - 30;
    const targetY = bottomY - percent * (bottomY - topY);
    birdY += (targetY - birdY) * HAND_SMOOTH; // glide toward the target
  } else {
    speedY += GRAVITY;
    birdY += speedY;
  }
  if (birdY < BIRD_SIZE / 2) {
    birdY = BIRD_SIZE / 2;
    speedY = 0;
  }

  // pipes
  frame++;
  if (frame % PIPE_EVERY === 0) {
    const gapTop = 60 + Math.random() * (HEIGHT - GROUND - PIPE_GAP - 120);
    pipes.push({ x: WIDTH, gapTop: gapTop, passed: false });
  }
  for (const p of pipes) {
    p.x -= PIPE_SPEED;
    if (!p.passed && p.x + PIPE_WIDTH < BIRD_X) {
      p.passed = true;
      score++;
      showScore();
    }
  }
  pipes = pipes.filter((p) => p.x + PIPE_WIDTH > 0);

  // collisions
  const r = BIRD_SIZE / 2;
  if (birdY + r >= HEIGHT - GROUND) return gameOver();
  for (const p of pipes) {
    const hitX = BIRD_X + r > p.x && BIRD_X - r < p.x + PIPE_WIDTH;
    const hitY = birdY - r < p.gapTop || birdY + r > p.gapTop + PIPE_GAP;
    if (hitX && hitY) return gameOver();
  }
}

// ===== Draw =====
function draw() {
  ctx.fillStyle = "#0f172a"; // sky
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#22c55e"; // pipes
  for (const p of pipes) {
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapTop);
    ctx.fillRect(
      p.x,
      p.gapTop + PIPE_GAP,
      PIPE_WIDTH,
      HEIGHT - GROUND - p.gapTop - PIPE_GAP,
    );
  }

  ctx.fillStyle = "#334155"; // ground
  ctx.fillRect(0, HEIGHT - GROUND, WIDTH, GROUND);

  ctx.fillStyle = "#facc15"; // bird
  ctx.beginPath();
  ctx.arc(BIRD_X, birdY, BIRD_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(BIRD_X + 5, birdY - 4, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff"; // text
  ctx.textAlign = "center";
  ctx.font = "bold 36px Kanit, sans-serif";
  ctx.fillText(score, WIDTH / 2, 60);
  ctx.font = "20px Kanit, sans-serif";
  if (state === "ready")
    ctx.fillText("ปรบมือ กด SPACE หรือปุ่ม START", WIDTH / 2, 380);
  if (state === "countdown") {
    ctx.font = "bold 72px Kanit, sans-serif";
    ctx.fillText(Math.ceil(countdown / 30), WIDTH / 2, 380);
  }
  if (state === "over") {
    ctx.fillText("GAME OVER", WIDTH / 2, 260);
    ctx.fillText("คะแนน " + score + " · สูงสุด " + best, WIDTH / 2, 295);
  }
}

// ===== Game loop (60 updates per second on every screen) =====
let lastTime = 0,
  timeLeft = 0;
function loop(time) {
  timeLeft += Math.min(time - lastTime, 100);
  lastTime = time;
  while (timeLeft >= 1000 / 60) {
    update();
    timeLeft -= 1000 / 60;
  }
  draw();
  requestAnimationFrame(loop);
}

// ===== Keyboard and mouse =====
canvas.onclick = jump;
document.addEventListener("keydown", function (e) {
  const box = canvas.getBoundingClientRect();
  const gameOnScreen = box.top < window.innerHeight && box.bottom > 0;
  if (e.code === "Space" && gameOnScreen && e.target.tagName !== "INPUT") {
    e.preventDefault();
    jump();
  }
});

// ===== Arduino over USB (Web Serial API) =====
let port = null,
  reader = null,
  readDone = null;
const statusText = document.getElementById("status");
const connectBtn = document.getElementById("connect-btn");
const thresholdInput = document.getElementById("threshold");

connectBtn.onclick = function () {
  if (port) disconnect();
  else connect();
};

async function connect() {
  if (!("serial" in navigator)) {
    alert("เบราว์เซอร์นี้ไม่รองรับ Web Serial กรุณาใช้ Chrome หรือ Edge");
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
  } catch (err) {
    port = null;
    statusText.textContent = "เชื่อมต่อไม่ได้ (ปิด Serial Monitor แล้วลองใหม่)";
    return;
  }
  statusText.textContent = "เชื่อมต่อแล้ว";
  statusText.className = "text-green-400";
  connectBtn.textContent = "ยกเลิกการเชื่อมต่อ";
  setTimeout(sendThreshold, 2000); // UNO R3 restarts when the port opens
  readLines();
}

async function readLines() {
  const decoder = new TextDecoderStream();
  readDone = port.readable.pipeTo(decoder.writable).catch(() => {});
  reader = decoder.readable.getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop(); // last line may not be complete yet
      lines.forEach((line) => handleMessage(line.trim()));
    }
  } catch (err) {
    // cable unplugged
  }
  await closePort();
}

async function disconnect() {
  await reader.cancel(); // ends the while loop in readLines()
}

async function closePort() {
  await readDone;
  await port.close().catch(() => {});
  port = null;
  handMode = false;
  document.getElementById("mode-text").textContent = "เสียง";
  statusText.textContent = "ยังไม่เชื่อมต่อ";
  statusText.className = "text-red-400";
  connectBtn.textContent = "เชื่อมต่อผ่าน USB";
}

// One line from the Arduino
function handleMessage(msg) {
  if (msg === "JUMP!") {
    jump();
  } else if (msg === "CMD:START") {
    startButton();
  } else if (msg === "MODE:HAND" || msg === "MODE:VOICE") {
    handMode = msg === "MODE:HAND";
    document.getElementById("mode-text").textContent = handMode
      ? "มือ"
      : "เสียง";
  } else if (msg.startsWith("DIST:")) {
    handCm = Number(msg.slice(5));
    if (handMode)
      document.getElementById("mode-text").textContent =
        "มือ (" + handCm + " cm)";
  } else if (msg === "CAL:START") {
    document.getElementById("threshold-msg").textContent =
      "กำลัง Calibrate… เงียบ 2 วินาที";
  } else if (msg === "CAL:DONE") {
    document.getElementById("threshold-msg").textContent =
      "Calibrate เสร็จแล้ว";
  } else if (msg.startsWith("THRESHOLD:")) {
    thresholdInput.value = msg.slice(10);
    document.getElementById("threshold-text").textContent = msg.slice(10);
  } else if (/^\d+$/.test(msg)) {
    showLevel(Number(msg));
  }
}

function showLevel(level) {
  document.getElementById("level-text").textContent = level;
  document.getElementById("level-bar").style.width =
    Math.min(100, (level / 1023) * 100) + "%";
}

// ===== Threshold slider =====
thresholdInput.oninput = function () {
  document.getElementById("threshold-text").textContent = thresholdInput.value;
};
thresholdInput.onchange = sendThreshold; // send when the slider is released

async function sendThreshold() {
  if (!port || !port.writable) return;
  const writer = port.writable.getWriter();
  await writer.write(
    new TextEncoder().encode("T" + thresholdInput.value + "\n"),
  );
  writer.releaseLock();
}

// ===== Start =====
resetGame();
requestAnimationFrame(loop);
