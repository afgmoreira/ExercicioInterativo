/*
  NeuroSymmetry Trainer
  ----------------------
  Jogo de treino cognitivo‑motor que trabalha:
    - coordenação bilateral (usar os dois braços em simultâneo),
    - propriocepção (noção do corpo no espaço),
    - atenção sustentada e tempo de reação.

  Ideia geral do funcionamento:
  - A câmara capta a imagem em tempo real.
  - O modelo BlazePose (via ml5.js) detecta a pose do corpo e dá as coordenadas dos pulsos.
  - O jogo desenha círculos‑alvo no ecrã e o utilizador tenta encostar os dois pulsos a esses círculos.
  - Se mantiver os dois pulsos dentro dos círculos durante 1 a 2 segundos, ganha 1 ponto.
  - Ao longo de 60 segundos a dificuldade vai aumentando (alvos mais pequenos).
  - No final é guardado um ranking das melhores pontuações no próprio browser (localStorage).
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

// ===============================
// VARIÁVEIS DE ÁUDIO (SFX)
// ===============================
let synth; // Sintetizador virtual para gerar sons
let lastTickTime = 0; // Controla o ritmo do som "tick" enquanto segura

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

function preload() {
  // Carrega o modelo de deteção de pose (BlazePose) antes de começar o jogo.
  // A opção flipped:false diz ao modelo que a imagem original não está espelhada;
  // o espelho é tratado mais à frente apenas na parte de desenho.
  bodyPose = ml5.bodyPose("BlazePose", { flipped: false });
}

function setup() {
  // Inicializa o sintetizador de som (efeitos simples tipo "ding" e "tick").
  synth = new p5.MonoSynth();

  // Ler recorde gravado anteriormente no browser (se existir).
  let storedHighScore = localStorage.getItem("highScore");
  if (storedHighScore !== null) highScore = int(storedHighScore);

  // Ler lista de pontuações (ranking) gravada anteriormente no browser.
  let storedRanking = localStorage.getItem("ranking");
  if (storedRanking !== null) {
    try { ranking = JSON.parse(storedRanking); } 
    catch (e) { ranking = []; }
  }

  // Se houver ranking, garantir que o highScore está alinhado com a melhor pontuação.
  if (ranking.length > 0) highScore = max(highScore, ranking[0]);

  // Tamanho fixo do canvas para facilitar o design do jogo.
  createCanvas(1280, 720);
  // Criar o stream de vídeo da webcam.
  video = createCapture(VIDEO); 
  video.hide();
  // Começar a deteção contínua de poses na imagem de vídeo.
  bodyPose.detectStart(video, gotPoses);
  
  // Ajusta o raio base dos alvos em função da dificuldade inicial.
  applyDifficultySettings();
  // Define a posição dos círculos que servem para começar/repetir o jogo.
  updateMenuTargets();
}

function updateMenuTargets() {
  // Define dois círculos na parte inferior do ecrã.
  // Estes círculos são usados apenas no ecrã inicial e final
  // para o jogador iniciar ou repetir o treino encostando os dois pulsos.
  menuTargetL = { x: width * 0.25, y: height * 0.8, r: 80 };
  menuTargetR = { x: width * 0.75, y: height * 0.8, r: 80 };
}

function gotPoses(results) { poses = results; }

function draw() {
  // Esta função corre várias vezes por segundo (ciclo principal do jogo).
  // A ordem é basicamente:
  // 1) Desenhar o vídeo de fundo.
  // 2) Atualizar a posição suavizada dos pulsos (com base na pose).
  // 3) Desenhar os pulsos e os alvos.
  // 4) Desenhar o ecrã de início, jogo ou fim, consoante o estado.
  background(20);
  
  if (video.width > 0 && video.height > 0) {
    // Calcular a escala para o vídeo encher o ecrã sem ficar "esticado".
    videoScale = max(width / video.width, height / video.height);
    let drawW = video.width * videoScale;
    let drawH = video.height * videoScale;
    videoOffsetX = (width - drawW) / 2;
    videoOffsetY = (height - drawH) / 2;

    push();
    // Espelhar horizontalmente (efeito espelho):
    // movemos a origem para a direita e depois aplicamos escala -1 no eixo X.
    translate(width, 0);
    scale(-1, 1);
    image(video, videoOffsetX, videoOffsetY, drawW, drawH);
    pop();
  }
  
  // Atualizar as coordenadas dos pulsos com suavização (lerp).
  updateWrists();
  // Converter as coordenadas do espaço do vídeo para o espaço do canvas.
  updateDisplayWrists();

  if (gameState === "START" || gameState === "END") {
    // Escurecer o fundo para dar mais destaque ao texto do menu.
    fill(0, 0, 0, 180); 
    rect(0, 0, width, height);
  }

  // Desenhar os círculos verdes dos pulsos.
  drawWrists();

  if (gameState === "START") {
    // Ecrã inicial + verificação se os pulsos estão nos círculos de arranque.
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
  // Ecrã de boas‑vindas com título, instruções e ranking.
  noStroke();
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(58);
  text(GAME_NAME, width / 2, height * 0.16);

  let panelX = width * 0.14, panelY = height * 0.20, panelW = width * 0.72, panelH = height * 0.30;
  fill(0, 0, 0, 170);
  rect(panelX, panelY, panelW, panelH, 20);

  textAlign(CENTER, TOP);
  fill(255);
  textSize(26);
  text("COMO JOGAR", width / 2, panelY + 18);

  textSize(22);
  text("1. Move os braços até aos círculos.\n2. Mantém os dois pulsos nos círculos 1–2s.\n3. Ganha o máximo de pontos em 60s.", width / 2, panelY + 60);

  let infoY = panelY + panelH + 20;
  fill(255, 215, 0); textSize(32);
  text("🏆 Recorde: " + highScore + " 🏆", width / 2, infoY);

  fill(173, 216, 230); textSize(20);
  text("Dificuldade: " + difficulty, width / 2, infoY + 32);

  fill(150, 255, 150); textSize(20); textAlign(CENTER, CENTER);
  text("PARA COMEÇAR:\nColoca os dois pulsos nos círculos.", width / 2, height * 0.66);

  drawRanking(height * 0.74);
}

function playGame() {
  // Calcula há quanto tempo o jogo está a decorrer e atualiza o tempo restante.
  let elapsedTime = floor((millis() - gameStartTime) / 1000);
  timeLeft = gameDuration - elapsedTime;
  
  if (timeLeft <= 0) {
    // Quando o tempo acaba, se houver pontuação, atualiza o ranking e grava no browser.
    if (score > 0) {
      ranking.push(score);
      ranking.sort((a, b) => b - a);
      if (ranking.length > 5) ranking = ranking.slice(0, 5);
      highScore = ranking[0];
      localStorage.setItem("ranking", JSON.stringify(ranking));
      localStorage.setItem("highScore", highScore);
    }
    lastScore = score;
    gameState = "END";
    
    // SOM: Fim de Jogo (Tom grave)
    synth.play('C4', 0.6, 0, 0.5); 
    return;
  }

  noStroke(); fill(0, 0, 0, 160); rect(20, 20, width - 40, 70, 15);

  // HUD superior com pontuação, tempo e dificuldade atual.
  fill(255); textSize(36);
  textAlign(LEFT, TOP); text("Pontuação: " + score, 40, 40);
  
  textAlign(RIGHT, TOP);
  if (timeLeft <= 10) fill(255, 50, 50); else fill(255);
  text("Tempo: " + timeLeft + "s", width - 40, 40);

  fill(173, 216, 230); textSize(24); textAlign(CENTER, TOP);
  text("Dificuldade: " + difficulty, width / 2, 40);

  // Verifica se os pulsos ficaram tempo suficiente dentro dos alvos do jogo.
  checkInteraction(targetL, targetR, function() {
    score++;
    // SOM: Sucesso ao apanhar alvo (Ding agudo!)
    synth.play('E5', 0.5, 0, 0.2); 
    
    updateDifficultyByScore();
    generateTargets();
  });
}

function drawEndScreen() {
  // Ecrã final que mostra a pontuação do treino e o ranking.
  textAlign(CENTER, CENTER); noStroke();
  fill(255); textSize(70);
  text("FIM DO TREINO!", width / 2, height * 0.18);
  
  textSize(45); text("Pontuação: " + score, width / 2, height * 0.34);
  
  fill(150, 255, 150); textSize(20);
  text("PARA REPETIR:\nColoca de novo os pulsos nos círculos.", width / 2, height * 0.55);
  drawRanking(height * 0.63);
}

// ==========================================
// LÓGICA CORE (Rastreamento e Interação)
// ==========================================

function getMainPose() {
  // Seleciona uma única pessoa para ser o "jogador principal".
  // Isto é importante quando aparecem várias pessoas na imagem da câmara.
  // A escolha é feita com base na posição do nariz:
  //  - se já temos um nariz guardado (mainPersonNose), escolhemos quem estiver mais perto dele;
  //  - se ainda não temos, escolhemos a pessoa mais próxima do centro da imagem.
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
  // Atualiza a posição SUAVIZADA dos pulsos a partir da pose principal.
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
  // Converte as coordenadas dos pulsos do sistema de vídeo para o sistema do canvas,
  // aplicando a escala (videoScale), o deslocamento (offset) e o espelho horizontal.
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
  // Desenha pequenos círculos verdes na posição estimada de cada pulso.
  fill(0, 255, 0); noStroke();
  if (displayWristL.confidence > 0.1) circle(displayWristL.x, displayWristL.y, 30);
  if (displayWristR.confidence > 0.1) circle(displayWristR.x, displayWristR.y, 30);
}

function checkInteraction(tL, tR, onSuccessCallback) {
  // Função genérica que verifica se os dois pulsos estão dentro de dois círculos (tL e tR)
  // e se lá permanecem o tempo suficiente. Se sim, chama a função onSuccessCallback().
  let isHovering = false;
  if (displayWristL.confidence > 0.1 && displayWristR.confidence > 0.1) {
    let distL = dist(displayWristL.x, displayWristL.y, tL.x, tL.y);
    let distR = dist(displayWristR.x, displayWristR.y, tR.x, tR.y);
    if (distL < tL.r && distR < tR.r) isHovering = true;
  }

  if (isHovering) {
    // Começou agora a segurar dentro dos círculos.
    if (!isHolding) {
      isHolding = true;
      holdStartMillis = millis();
      requiredHoldTime = random(HOLD_TIME_MIN, HOLD_TIME_MAX);
    } else {
      // Já está a segurar: medir há quanto tempo se mantém nos círculos.
      let holdDuration = millis() - holdStartMillis;
      
      // SOM: Ticking progressivo enquanto segura
      if (millis() - lastTickTime > 150) {
          synth.play('C6', 0.05, 0, 0.05); // Som curtinho e muito baixo
          lastTickTime = millis();
      }

      if (holdDuration >= requiredHoldTime) {
          // Chegou ao tempo necessário => interação concluída com sucesso.
        isHolding = false; 
        onSuccessCallback(); 
        return; 
      }
    }
  } else {
    // Assim que sai de qualquer um dos círculos, a contagem é interrompida.
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
    // Desenhar um arco de progresso à volta de cada alvo a indicar o tempo restante.
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
  // Gera novas posições aleatórias para os dois alvos do jogo (esquerda e direita),
  // garantindo que um fica em cada metade do ecrã e afastado das margens.
  let margin = 150; 
  targetL.r = targetBaseRadius; targetR.r = targetBaseRadius;
  targetL.x = random(margin, (width / 2) - margin); targetL.y = random(margin, height - margin);
  targetR.x = random((width / 2) + margin, width - margin); targetR.y = random(margin, height - margin);
}

function startGame() {
  // Obrigatório para alguns browsers permitirem som: inicializar no primeiro clique/interação
  userStartAudio();
  
  // Reiniciar variáveis principais do jogo.
  score = 0; timeLeft = gameDuration; gameStartTime = millis();
  isHolding = false; gameState = "PLAY"; difficulty = "FÁCIL";
  
  // SOM: Início de Jogo!
  synth.play('G4', 0.5, 0, 0.3);

  applyDifficultySettings(); generateTargets();
}

function applyDifficultySettings() {
  // Define o raio base dos alvos em função da dificuldade atual.
  if (difficulty === "FÁCIL") targetBaseRadius = 100;
  else if (difficulty === "MÉDIO") targetBaseRadius = 80;
  else if (difficulty === "DIFÍCIL") {
    let extraPoints = max(0, score - 10);
    targetBaseRadius = max(30, 60 - extraPoints * 2);
  }
}

function updateDifficultyByScore() {
  // Atualiza o nível de dificuldade automaticamente a partir da pontuação.
  let oldDifficulty = difficulty;

  if (score >= 10) difficulty = "DIFÍCIL";
  else if (score >= 5) difficulty = "MÉDIO";
  else difficulty = "FÁCIL";

  // SOM: Subida de nível (nota mais alta)
  if (difficulty !== oldDifficulty) {
    setTimeout(() => { synth.play('C6', 0.6, 0, 0.4); }, 200); // Toca com 200ms de atraso para não misturar com o Ding
  }

  applyDifficultySettings();
}

function drawRanking(startY) {
  // Desenha a tabela de ranking (TOP 5) e a linha "VOCÊ" com a última pontuação.
  // O ranking é guardado no browser, por isso mantém‑se entre sessões.
  if (ranking.length === 0 && lastScore === null) return;

  let tableWidth = 380, rowHeight = 20, headerHeight = 28;
  let xCenter = width / 2, xLeft = xCenter - tableWidth / 2;
  let xColPos = xLeft + 40, xColScore = xLeft + tableWidth - 60;

  noStroke(); fill(0, 0, 0, 170);
  let totalRows = max(ranking.length, 1) + (lastScore !== null ? 3 : 1);
  rect(xLeft, startY - 10, tableWidth, headerHeight + rowHeight * totalRows, 12);

  textAlign(CENTER, TOP); textSize(18); fill(255);
  text("RANKING", xCenter, startY - 4);

  textSize(14); textAlign(LEFT, TOP); fill(200);
  text("POS", xColPos, startY + headerHeight - 4);
  textAlign(RIGHT, TOP); text("PTS", xColScore, startY + headerHeight - 4);

  for (let i = 0; i < ranking.length; i++) {
    let y = startY + headerHeight + rowHeight * (i + 1);
    if (i === 0) fill(255, 215, 0); else fill(230);
    textAlign(LEFT, TOP); text((i + 1) + "º", xColPos, y);
    textAlign(RIGHT, TOP); text(ranking[i] + " pts", xColScore, y);
  }

  if (lastScore !== null) {
    let yLine = startY + headerHeight + rowHeight * (ranking.length + 1.2);
    stroke(255, 255, 255, 100); line(xLeft + 20, yLine, xLeft + tableWidth - 20, yLine);
    noStroke();

    let yPlayer = yLine + 6;
    if (ranking.length > 0 && lastScore === ranking[0]) fill(50, 255, 120); else fill(135, 206, 250);
    textAlign(LEFT, TOP); text("VOCÊ", xColPos, yPlayer);
    textAlign(RIGHT, TOP); text(lastScore + " pts", xColScore, yPlayer);
  }
}