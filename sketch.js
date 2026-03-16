// --- VARIÁVEIS DA CÂMARA E ML5 ---
let video;
let bodyPose;
let poses = [];

// --- VARIÁVEIS DE SUAVIZAÇÃO (LERP) PARA EVITAR TREMOR ---
let smoothWristL = { x: 0, y: 0, confidence: 0 };
let smoothWristR = { x: 0, y: 0, confidence: 0 };
let lerpAmount = 0.2; // 20% de aproximação por frame (quanto menor, mais suave, mas mais "atrasado")

// --- VARIÁVEIS DE ESTADO E PONTUAÇÃO ---
let gameState = "START"; 
let score = 0;
let highScore = 0;
let gameDuration = 60; // 60 segundos
let gameStartTime = 0;
let timeLeft = 60;

// --- ALVOS DO JOGO E MENU ---
let targetL = { x: 0, y: 0, r: 80 }; 
let targetR = { x: 0, y: 0, r: 80 };
let menuTargetL, menuTargetR;

// --- VARIÁVEIS DO TEMPORIZADOR ---
let holdStartMillis = 0;
let isHolding = false;
const REQUIRED_HOLD_TIME = 3000; // 3 segundos

function preload() {
  bodyPose = ml5.bodyPose("BlazePose", { flipped: true });
}

function setup() {
  // Carrega o recorde guardado (se existir) a partir do localStorage
  let storedHighScore = localStorage.getItem("highScore");
  if (storedHighScore !== null) {
    highScore = int(storedHighScore);
  }

  createCanvas(1280, 720);
  
  video = createCapture(VIDEO); 
  video.size(1280, 720);
  video.hide();
  
  bodyPose.detectStart(video, gotPoses);
  updateMenuTargets();
}

function updateMenuTargets() {
  menuTargetL = { x: width * 0.25, y: height * 0.8, r: 80 };
  menuTargetR = { x: width * 0.75, y: height * 0.8, r: 80 };
}

function gotPoses(results) {
  poses = results;
}

function draw() {
  background(20);
  
  // Inverte o eixo X (efeito espelho)
  push();
  translate(width, 0); 
  scale(-1, 1);              
  image(video, 0, 0, width, height);
  pop();                     
  
  // Atualiza as posições suavizadas dos pulsos (Filtro anti-tremor)
  updateWrists();

  // Filtro semitransparente para os menus
  if (gameState === "START" || gameState === "END") {
    fill(0, 0, 0, 180); 
    rect(0, 0, width, height);
  }

  // Desenha os pontos verdes (agora usando as coordenadas suavizadas)
  drawWrists();

  // Gestão dos Ecrãs
  if (gameState === "START") {
    drawStartScreen();
    checkInteraction(menuTargetL, menuTargetR, startGame);
  } 
  else if (gameState === "PLAY") {
    playGame();
  } 
  else if (gameState === "END") {
    drawEndScreen();
    checkInteraction(menuTargetL, menuTargetR, startGame);
  }
}

// ==========================================
// ECRÃS E LÓGICA DE JOGO
// ==========================================

function drawStartScreen() {
  textAlign(CENTER, CENTER);
  noStroke();
  
  fill(255); textSize(60);
  text("SIMETRIA CORPORAL", width / 2, height * 0.15);
  
  fill(200); textSize(24);
  text("COMO JOGAR:\nMove os braços até aos círculos.\nMantém os dois pulsos nos círculos 3s.\nApanha o máximo possível em 60s.", width / 2, height * 0.35);

  fill(255, 215, 0); textSize(35);
  text("🏆 Recorde: " + highScore + " 🏆", width / 2, height * 0.55);

  fill(150, 255, 150); textSize(28);
  text("PARA COMEÇAR:\nColoca os dois pulsos nos círculos.", width / 2, height * 0.7);
}

function playGame() {
  let elapsedTime = floor((millis() - gameStartTime) / 1000);
  timeLeft = gameDuration - elapsedTime;
  
  if (timeLeft <= 0) {
    if (score > highScore) {
      highScore = score;
      // Guarda o novo recorde para não se perder ao recarregar a página
      localStorage.setItem("highScore", highScore);
    }
    gameState = "END";
    return;
  }

  fill(255); noStroke(); textSize(36);
  textAlign(LEFT, TOP); text("Pontuação: " + score, 40, 40);
  textAlign(RIGHT, TOP);
  if (timeLeft <= 10) fill(255, 50, 50);
  text("Tempo: " + timeLeft + "s", width - 40, 40);

  checkInteraction(targetL, targetR, function() {
    score++;
    generateTargets();
  });
}

function drawEndScreen() {
  textAlign(CENTER, CENTER);
  noStroke();
  
  fill(255); textSize(70);
  text("FIM DO TREINO!", width / 2, height * 0.2);
  
  textSize(45);
  text("Pontuação: " + score, width / 2, height * 0.4);
  
  fill(255, 215, 0); textSize(40);
  text("🏆 Recorde: " + highScore + " 🏆", width / 2, height * 0.55);

  fill(150, 255, 150); textSize(28);
  text("PARA REPETIR:\nColoca de novo os pulsos nos círculos.", width / 2, height * 0.7);
}

// ==========================================
// FUNÇÕES DE SUAVIZAÇÃO (LERP) E DESENHO
// ==========================================

function updateWrists() {
  if (poses.length > 0) {
    let pose = poses[0];
    let lw = pose.left_wrist;
    let rw = pose.right_wrist;

    // Atualiza o pulso esquerdo
    smoothWristL.confidence = lw.confidence;
    if (lw.confidence > 0.1) {
      if (smoothWristL.x === 0) { 
        // Se for a primeira vez que deteta, assume a posição imediatamente
        smoothWristL.x = lw.x; 
        smoothWristL.y = lw.y; 
      } else {
        // Interpolação Linear (desliza da posição atual para a nova posição)
        smoothWristL.x = lerp(smoothWristL.x, lw.x, lerpAmount);
        smoothWristL.y = lerp(smoothWristL.y, lw.y, lerpAmount);
      }
    }

    // Atualiza o pulso direito
    smoothWristR.confidence = rw.confidence;
    if (rw.confidence > 0.1) {
      if (smoothWristR.x === 0) { 
        smoothWristR.x = rw.x; 
        smoothWristR.y = rw.y; 
      } else {
        smoothWristR.x = lerp(smoothWristR.x, rw.x, lerpAmount);
        smoothWristR.y = lerp(smoothWristR.y, rw.y, lerpAmount);
      }
    }
  } else {
    smoothWristL.confidence = 0;
    smoothWristR.confidence = 0;
  }
}

function drawWrists() {
  fill(0, 255, 0); noStroke();
  if (smoothWristL.confidence > 0.1) circle(smoothWristL.x, smoothWristL.y, 30);
  if (smoothWristR.confidence > 0.1) circle(smoothWristR.x, smoothWristR.y, 30);
}

// ==========================================
// LÓGICA DE INTERAÇÃO E ALVOS
// ==========================================

function checkInteraction(tL, tR, onSuccessCallback) {
  let isHovering = false;

  // Agora usamos as coordenadas SUAVIZADAS para calcular a colisão!
  if (smoothWristL.confidence > 0.1 && smoothWristR.confidence > 0.1) {
    let distL = dist(smoothWristL.x, smoothWristL.y, tL.x, tL.y);
    let distR = dist(smoothWristR.x, smoothWristR.y, tR.x, tR.y);

    if (distL < tL.r && distR < tR.r) {
      isHovering = true;
    }
  }

  if (isHovering) {
    if (!isHolding) {
      isHolding = true;
      holdStartMillis = millis();
    } else {
      let holdDuration = millis() - holdStartMillis;
      if (holdDuration >= REQUIRED_HOLD_TIME) {
        isHolding = false; 
        onSuccessCallback(); 
        return; 
      }
    }
  } else {
    isHolding = false; 
  }

  strokeWeight(4); stroke(255, 255, 255, 120); fill(0, 0, 0, 50);
  circle(tL.x, tL.y, tL.r * 2);
  circle(tR.x, tR.y, tR.r * 2);

  if (isHovering && isHolding) {
    let holdDuration = millis() - holdStartMillis;
    let progress = map(holdDuration, 0, REQUIRED_HOLD_TIME, 0, 360);
    progress = constrain(progress, 0, 360);

    stroke(0, 255, 0); noFill(); strokeWeight(8);
    arc(tL.x, tL.y, tL.r * 2, tL.r * 2, -HALF_PI, radians(progress) - HALF_PI);
    arc(tR.x, tR.y, tR.r * 2, tR.r * 2, -HALF_PI, radians(progress) - HALF_PI);
    
    fill(255); noStroke(); textAlign(CENTER, CENTER); textSize(24);
    text("3s", tL.x, tL.y);
    text("3s", tR.x, tR.y);
  }
}

function generateTargets() {
  let margin = 150; 
  targetL.x = random(margin, (width / 2) - margin);
  targetL.y = random(margin, height - margin);
  targetR.x = random((width / 2) + margin, width - margin);
  targetR.y = random(margin, height - margin);
}

function startGame() {
  score = 0;
  timeLeft = gameDuration;
  gameStartTime = millis();
  isHolding = false;
  gameState = "PLAY";
  generateTargets();
}