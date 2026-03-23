/*
  NeuroSymmetry Trainer
  ----------------------
  Jogo de treino cognitivo‑motor que trabalha:
    - coordenação bilateral (usar os dois braços em simultâneo),
    - propriocepção (noção do corpo no espaço),
    - atenção sustentada e tempo de reação.
*/

// ===============================
// CONSTANTES GERAIS DO JOGO
// ===============================
const GAME_NAME = "NeuroSymmetry Trainer";

// ===============================
// VARIÁVEIS DA CÂMARA E ML5
// ===============================
let video;
let bodyPose;
let poses = [];
let cnv; // Variável para capturar o canvas e posicionar o input corretamente

// ===============================
// VARIÁVEIS DE ÁUDIO (SFX)
// ===============================
let synth; 
let lastTickTime = 0; 

// ===============================
// VARIÁVEIS DE SUAVIZAÇÃO (LERP)
// ===============================
let smoothWristL = { x: 0, y: 0, confidence: 0 };
let smoothWristR = { x: 0, y: 0, confidence: 0 };
let lerpAmount = 0.2; 
let displayWristL = { x: 0, y: 0, confidence: 0 };
let displayWristR = { x: 0, y: 0, confidence: 0 };
let mainPersonNose = null;

// ===============================
// VARIÁVEIS DE ESTADO E PONTUAÇÃO
// ===============================
let gameState = "START"; 
let score = 0;
let highScore = 0;
let gameDuration = 60; 
let gameStartTime = 0;
let timeLeft = 60;
let difficulty = "FÁCIL";
let targetBaseRadius = 90; 
let ranking = [];
let lastScore = null; 
let lastResult = null; 

// ===============================
// NOME DO JOGADOR (INPUT)
// ===============================
let playerName = "";
let nameInput; 

// ===============================
// ALVOS DO JOGO E DO MENU
// ===============================
let targetL = { x: 0, y: 0, r: 80 }; 
let targetR = { x: 0, y: 0, r: 80 };
let menuTargetL, menuTargetR;

// ===============================
// VARIÁVEIS DO TEMPORIZADOR
// ===============================
let holdStartMillis = 0;
let isHolding = false;
const HOLD_TIME_MIN = 1000; 
const HOLD_TIME_MAX = 2000; 
let requiredHoldTime = 1500; 

let videoScale = 1;
let videoOffsetX = 0;
let videoOffsetY = 0;

function positionNameInput() {
  if (!nameInput || !cnv) return;
  let inputW = 290; 
  // Posição alinhada à direita (82% da largura do ecrã)
  let x = cnv.position().x + (width * 0.82) - (inputW / 2);
  let y = cnv.position().y + height * 0.30; 
  nameInput.position(x, y);
}

function preload() {
  bodyPose = ml5.bodyPose("BlazePose", { flipped: false });
}

function setup() {
  synth = new p5.MonoSynth();

  let storedHighScore = localStorage.getItem("highScore");
  if (storedHighScore !== null) highScore = int(storedHighScore);

  let storedRanking = localStorage.getItem("ranking");
  if (storedRanking !== null) {
    try {
      let parsed = JSON.parse(storedRanking);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && typeof parsed[0] === "number") {
          ranking = parsed.map((s, idx) => ({ name: "Jogador " + (idx + 1), score: s }));
        } else {
          ranking = parsed.map((e, idx) => {
            if (typeof e === "number") return { name: "Jogador " + (idx + 1), score: e };
            return { name: e.name || ("Jogador " + (idx + 1)), score: e.score || 0 };
          });
        }
      } else {
        ranking = [];
      }
    } catch (e) { ranking = []; }
  }

  if (ranking.length > 0) highScore = max(highScore, ranking[0].score);

  // CAPTURAR O CANVAS NUMA VARIÁVEL
  cnv = createCanvas(1280, 720);

  // ESTILO NÉON PARA O INPUT
  nameInput = createInput("");
  nameInput.attribute("placeholder", "O teu nome");
  nameInput.size(260);
  nameInput.style("padding", "12px 15px");
  nameInput.style("font-size", "22px");
  nameInput.style("font-weight", "bold");
  nameInput.style("border", "3px solid #00FF00"); // Borda verde néon
  nameInput.style("border-radius", "25px");
  nameInput.style("background", "rgba(0, 0, 0, 0.85)");
  nameInput.style("color", "#00FF00");
  nameInput.style("text-align", "center");
  nameInput.style("outline", "none");
  nameInput.style("box-shadow", "0 0 15px rgba(0, 255, 0, 0.5)"); // Efeito de brilho
  nameInput.style("font-family", "Arial, Helvetica, sans-serif");

  positionNameInput();
  
  video = createCapture(VIDEO); 
  video.hide();
  bodyPose.detectStart(video, gotPoses);
  
  applyDifficultySettings();
  updateMenuTargets();
}

function updateMenuTargets() {
  menuTargetL = { x: width * 0.25, y: height * 0.8, r: 80 };
  menuTargetR = { x: width * 0.75, y: height * 0.8, r: 80 };
}

function gotPoses(results) { poses = results; }

function draw() {
  background(20);
  
  if (video.width > 0 && video.height > 0) {
    videoScale = max(width / video.width, height / video.height);
    let drawW = video.width * videoScale;
    let drawH = video.height * videoScale;
    videoOffsetX = (width - drawW) / 2;
    videoOffsetY = (height - drawH) / 2;

    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, videoOffsetX, videoOffsetY, drawW, drawH);
    pop();
  }
  
  updateWrists();
  updateDisplayWrists();

  // Desenhar os círculos verdes dos pulsos.
  drawWrists();

  // Fundo escurecido para os menus
  if (gameState === "START" || gameState === "END") {
    fill(0, 0, 0, 180); 
    rect(0, 0, width, height);
  }

  // Lógica dos Estados de Jogo
  if (gameState === "START") {
    if (nameInput) {
      positionNameInput();
      nameInput.show(); // Só mostra o input no ecrã inicial
    }
    drawStartScreen();
    checkInteraction(menuTargetL, menuTargetR, startGame);
  } 
  else if (gameState === "PLAY") {
    if (nameInput) nameInput.hide();
    playGame();
  } 
  else if (gameState === "END") {
    if (nameInput) nameInput.hide(); // Esconde o input no fim
    drawEndScreen();
    checkInteraction(menuTargetL, menuTargetR, startGame);
  }
}

// ==========================================
// ECRÃS E LÓGICA DE JOGO
// ==========================================

function drawStartScreen() {
  noStroke();
  
  // Título
  drawingContext.shadowBlur = 20;
  drawingContext.shadowColor = 'rgba(0, 255, 0, 0.8)';
  textAlign(CENTER, CENTER);
  fill(255);
  textStyle(BOLD);
  textSize(60);
  text(GAME_NAME, width / 2, height * 0.12);
  textStyle(NORMAL);
  drawingContext.shadowBlur = 0;

  // PAINEL ESQUERDO: COMO JOGAR
  let panelW = 340, panelH = 280;
  let panelX = width * 0.05; // Fica a 5% da margem esquerda
  let panelY = height * 0.25;

  fill(0, 0, 0, 200);
  stroke(0, 255, 0, 100);
  strokeWeight(2);
  rect(panelX, panelY, panelW, panelH, 15);
  noStroke();

  textAlign(CENTER, TOP);
  fill(0, 255, 0); textSize(24); textStyle(BOLD);
  text("COMO JOGAR", panelX + panelW / 2, panelY + 25);
  textStyle(NORMAL);

  fill(240); textSize(18);
  text("1. Move os braços até aos círculos.\n\n2. Mantém os pulsos nos alvos 1–2s.\n\n3. Ganha o máximo de pontos em 60s.", panelX + panelW / 2, panelY + 90);

  // DIREITA: TÍTULO DA CAIXA DE NOME E RANKING
  let rightCenterX = width * 0.82; // Eixo central da coluna da direita
  
  textAlign(CENTER, CENTER); // Repor alinhamento
  fill(0, 255, 0); textSize(22); textStyle(BOLD);
  text("JOGADOR:", rightCenterX, height * 0.26);
  textStyle(NORMAL);

  // RANKING 
  drawRanking(rightCenterX, height * 0.44); 

  // CENTRO: RECORDE E DIFICULDADE
  // ---> A CORREÇÃO PRINCIPAL ESTÁ AQUI: forçar o alinhamento ao Centro!
  textAlign(CENTER, CENTER); 
  let infoY = height * 0.40;
  
  drawingContext.shadowBlur = 15;
  drawingContext.shadowColor = 'rgba(255, 215, 0, 0.6)';
  fill(255, 215, 0); textSize(38); textStyle(BOLD);
  text("🏆 Recorde: " + highScore + " 🏆", width / 2, infoY);
  textStyle(NORMAL);
  drawingContext.shadowBlur = 0;

  fill(173, 216, 230); textSize(22);
  text("Dificuldade Atual: " + difficulty, width / 2, infoY + 55);

  // INSTRUÇÃO PARA COMEÇAR 
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = 'rgba(0, 255, 0, 0.6)';
  fill(150, 255, 150); textSize(22); textAlign(CENTER, CENTER); textStyle(BOLD);
  text("PARA COMEÇAR:\nColoca os dois pulsos nos círculos abaixo.", width / 2, height * 0.75);
  textStyle(NORMAL);
  drawingContext.shadowBlur = 0;
}

function playGame() {
  let elapsedTime = floor((millis() - gameStartTime) / 1000);
  timeLeft = gameDuration - elapsedTime;
  
  if (timeLeft <= 0) {
    let nameToSave = playerName && playerName.trim().length > 0 ? playerName.trim() : "Anónimo";
    
    // Limpar os destaques anteriores
    ranking.forEach(r => r.isLast = false);

    if (score > 0) {
      // Adiciona a nova pontuação com a flag 'isLast' para a destacar
      ranking.push({ name: nameToSave, score: score, isLast: true });
      ranking.sort((a, b) => b.score - a.score);
      
      // Manter apenas o Top 5
      if (ranking.length > 5) ranking = ranking.slice(0, 5);
      if (ranking.length > 0) highScore = ranking[0].score;

      // Guardar no localStorage (sem a flag isLast para não dar erros no futuro)
      let rankingToSave = ranking.map(r => ({ name: r.name, score: r.score }));
      localStorage.setItem("ranking", JSON.stringify(rankingToSave));
      localStorage.setItem("highScore", highScore);
    }
    
    gameState = "END";
    synth.play('C4', 0.6, 0, 0.5); 
    return;
  }

  noStroke(); fill(0, 0, 0, 160); rect(20, 20, width - 40, 70, 15);

  fill(255); textSize(36);
  textAlign(LEFT, TOP); text("Pontuação: " + score, 40, 40);
  
  textAlign(RIGHT, TOP);
  if (timeLeft <= 10) fill(255, 50, 50); else fill(255);
  text("Tempo: " + timeLeft + "s", width - 40, 40);

  fill(173, 216, 230); textSize(24); textAlign(CENTER, TOP);
  text("Dificuldade: " + difficulty, width / 2, 40);

  checkInteraction(targetL, targetR, function() {
    score++;
    synth.play('E5', 0.5, 0, 0.2); 
    
    updateDifficultyByScore();
    generateTargets();
  });
}

function drawEndScreen() {
  noStroke();

  let startY = height * 0.12; // Ponto de partida vertical

  // Título
  drawingContext.shadowBlur = 20;
  drawingContext.shadowColor = 'rgba(0, 255, 0, 0.8)';
  textAlign(CENTER, TOP); 
  fill(255);
  textStyle(BOLD);
  textSize(60);
  text(GAME_NAME, width / 2, startY);
  drawingContext.shadowBlur = 0;

  // FIM DO TREINO
  textSize(65);
  fill(255, 215, 0);
  text("FIM DO TREINO!", width / 2, startY + 80);
  textStyle(NORMAL);
  
  // Jogador
  textSize(30); fill(255);
  let displayName = playerName && playerName.trim().length > 0 ? playerName.trim() : "Anónimo";
  text("Jogador: " + displayName, width / 2, startY + 160);

  // Pontuação
  textSize(45);
  text("Pontuação: " + score, width / 2, startY + 205);
  
  // Ranking (Agora limpo e com o destaque inserido)
  drawRanking(width / 2, startY + 280);

  // Instrução para Repetir
  fill(150, 255, 150); textSize(20); textStyle(BOLD);
  textAlign(CENTER, TOP);
  text("PARA REPETIR:\nColoca de novo os pulsos nos círculos abaixo.", width / 2, height * 0.84);
  textStyle(NORMAL);
}

// ==========================================
// LÓGICA CORE (Rastreamento e Interação)
// ==========================================

function getMainPose() {
  if (!poses || poses.length === 0) return null;
  let bestPose = null, bestScore = Infinity; 
  for (let p of poses) {
    if (!p) continue;
    let refX, refY;
    if (p.nose) { refX = p.nose.x; refY = p.nose.y; } 
    else if (p.left_wrist && p.right_wrist) { refX = (p.left_wrist.x + p.right_wrist.x) / 2; refY = (p.left_wrist.y + p.right_wrist.y) / 2; } 
    else continue;

    let score;
    if (mainPersonNose) {
      let dx = refX - mainPersonNose.x, dy = refY - mainPersonNose.y;
      score = dx * dx + dy * dy;
    } else {
      let centerX = video.width / 2, centerY = video.height / 2;
      let dx = refX - centerX, dy = refY - centerY;
      score = dx * dx + dy * dy;
    }
    if (score < bestScore) { bestScore = score; bestPose = p; }
  }
  if (bestPose && bestPose.nose) mainPersonNose = { x: bestPose.nose.x, y: bestPose.nose.y };
  return bestPose;
}

function updateWrists() {
  let pose = getMainPose();
  if (pose) {
    let lw = pose.left_wrist, rw = pose.right_wrist;
    smoothWristL.confidence = lw.confidence;
    if (lw.confidence > 0.1) {
      if (smoothWristL.x === 0) { smoothWristL.x = lw.x; smoothWristL.y = lw.y; } 
      else { smoothWristL.x = lerp(smoothWristL.x, lw.x, lerpAmount); smoothWristL.y = lerp(smoothWristL.y, lw.y, lerpAmount); }
    }
    smoothWristR.confidence = rw.confidence;
    if (rw.confidence > 0.1) {
      if (smoothWristR.x === 0) { smoothWristR.x = rw.x; smoothWristR.y = rw.y; } 
      else { smoothWristR.x = lerp(smoothWristR.x, rw.x, lerpAmount); smoothWristR.y = lerp(smoothWristR.y, rw.y, lerpAmount); }
    }
  } else { smoothWristL.confidence = 0; smoothWristR.confidence = 0; }
}

function updateDisplayWrists() {
  displayWristL.confidence = smoothWristL.confidence;
  if (smoothWristL.confidence > 0.1) {
    displayWristL.x = width - (videoOffsetX + smoothWristL.x * videoScale);
    displayWristL.y = videoOffsetY + smoothWristL.y * videoScale;
  }
  displayWristR.confidence = smoothWristR.confidence;
  if (smoothWristR.confidence > 0.1) {
    displayWristR.x = width - (videoOffsetX + smoothWristR.x * videoScale);
    displayWristR.y = videoOffsetY + smoothWristR.y * videoScale;
  }
}

function drawWrists() {
  fill(0, 255, 0); noStroke();
  if (displayWristL.confidence > 0.1) circle(displayWristL.x, displayWristL.y, 30);
  if (displayWristR.confidence > 0.1) circle(displayWristR.x, displayWristR.y, 30);
}

function checkInteraction(tL, tR, onSuccessCallback) {
  let isHovering = false;
  if (displayWristL.confidence > 0.1 && displayWristR.confidence > 0.1) {
    let distL = dist(displayWristL.x, displayWristL.y, tL.x, tL.y);
    let distR = dist(displayWristR.x, displayWristR.y, tR.x, tR.y);
    if (distL < tL.r && distR < tR.r) isHovering = true;
  }

  if (isHovering) {
    if (!isHolding) {
      isHolding = true;
      holdStartMillis = millis();
      requiredHoldTime = random(HOLD_TIME_MIN, HOLD_TIME_MAX);
    } else {
      let holdDuration = millis() - holdStartMillis;
      
      if (millis() - lastTickTime > 150) {
          synth.play('C5', 0.05, 0, 0.05); 
          lastTickTime = millis();
      }

      if (holdDuration >= requiredHoldTime) {
        isHolding = false; 
        onSuccessCallback(); 
        return; 
      }
    }
  } else {
    isHolding = false; 
  }

  strokeWeight(4);
  if (difficulty === "FÁCIL") stroke(0, 255, 0, 200);
  else if (difficulty === "MÉDIO") stroke(255, 165, 0, 220);
  else stroke(255, 80, 80, 220);
  
  fill(0, 0, 0, 80);
  circle(tL.x, tL.y, tL.r * 2);
  circle(tR.x, tR.y, tR.r * 2);

  if (isHovering && isHolding) {
    let holdDuration = millis() - holdStartMillis;
    let progress = map(holdDuration, 0, requiredHoldTime, 0, 360);
    progress = constrain(progress, 0, 360);

    stroke(0, 255, 0); noFill(); strokeWeight(8);
    arc(tL.x, tL.y, tL.r * 2, tL.r * 2, -HALF_PI, radians(progress) - HALF_PI);
    arc(tR.x, tR.y, tR.r * 2, tR.r * 2, -HALF_PI, radians(progress) - HALF_PI);
    
    fill(255); noStroke(); textAlign(CENTER, CENTER); textSize(24);
    let secondsToHold = (requiredHoldTime / 1000).toFixed(1);
    text(secondsToHold + "s", tL.x, tL.y);
    text(secondsToHold + "s", tR.x, tR.y);
  }
}

function generateTargets() {
  let margin = 150; 
  targetL.r = targetBaseRadius; targetR.r = targetBaseRadius;
  targetL.x = random(margin, (width / 2) - margin); targetL.y = random(margin, height - margin);
  targetR.x = random((width / 2) + margin, width - margin); targetR.y = random(margin, height - margin);
}

function startGame() {
  userStartAudio();
  
  if (nameInput) {
    playerName = nameInput.value();
  }
  
  score = 0; timeLeft = gameDuration; gameStartTime = millis();
  isHolding = false; gameState = "PLAY"; difficulty = "FÁCIL";
  
  synth.play('G4', 0.5, 0, 0.3);

  applyDifficultySettings(); generateTargets();
}

function applyDifficultySettings() {
  if (difficulty === "FÁCIL") targetBaseRadius = 100;
  else if (difficulty === "MÉDIO") targetBaseRadius = 80;
  else if (difficulty === "DIFÍCIL") {
    let extraPoints = max(0, score - 10);
    targetBaseRadius = max(30, 60 - extraPoints * 2);
  }
}

function updateDifficultyByScore() {
  let oldDifficulty = difficulty;

  if (score >= 10) difficulty = "DIFÍCIL";
  else if (score >= 5) difficulty = "MÉDIO";
  else difficulty = "FÁCIL";

  if (difficulty !== oldDifficulty) {
    setTimeout(() => { synth.play('C6', 0.6, 0, 0.4); }, 200); 
  }

  applyDifficultySettings();
}

function drawRanking(xCenter, startY) {
  if (ranking.length === 0) return;

  let tableWidth = 340; // Largura igual à caixa do "Como Jogar" para ficar simétrico
  let rowHeight = 32;
  let headerHeight = 40;
  let xLeft = xCenter - tableWidth / 2;

  let xColPos = xLeft + 30;
  let xColName = xCenter;
  let xColScore = xLeft + tableWidth - 30;

  // Fundo estilizado do ranking
  fill(0, 0, 0, 200);
  stroke(0, 255, 0, 100);
  strokeWeight(2);
  let totalRows = max(ranking.length, 1);
  let boxHeight = headerHeight + (totalRows * rowHeight) + 40; // Altura corrigida!
  rect(xLeft, startY, tableWidth, boxHeight, 15);
  noStroke();

  textAlign(CENTER, TOP); textSize(20); fill(0, 255, 0); textStyle(BOLD);
  text("RANKING TOP 5", xCenter, startY + 15);
  textStyle(NORMAL);

  let headerY = startY + 55;

  textSize(14); fill(180);
  textAlign(LEFT, TOP); text("POS", xColPos, headerY);
  textAlign(CENTER, TOP); text("NOME", xColName, headerY);
  textAlign(RIGHT, TOP); text("PTS", xColScore, headerY);

  for (let i = 0; i < ranking.length; i++) {
    let rowY = headerY + 25 + (rowHeight * i); // Espaçamento corrigido para não sobrepor o cabeçalho!

    if (ranking[i].isLast && gameState === "END") {
      fill(50, 255, 120); textStyle(BOLD);
    } else if (i === 0) { 
      fill(255, 215, 0); textStyle(BOLD); 
    } else { 
      fill(230); textStyle(NORMAL); 
    }
    
    textAlign(LEFT, TOP); text((i + 1) + "º", xColPos, rowY);
    textAlign(CENTER, TOP); text(ranking[i].name, xColName, rowY);
    textAlign(RIGHT, TOP); text(ranking[i].score + " pts", xColScore, rowY);
  }
  
  // Repor alinhamento normal por precaução no final da função
  textAlign(CENTER, CENTER); 
  textStyle(NORMAL);
}
