/*
  NeuroSymmetry Trainer
  ----------------------
  Jogo de treino cognitivo‑motor que trabalha:
    - coordenação bilateral (usar os dois braços em simultâneo),
    - propriocepção (noção do corpo no espaço),
    - atenção sustentada e tempo de reação.

  Como funciona?
    1. A câmara capta a imagem do corpo em tempo real.
    2. O modelo BlazePose (ml5.js) deteta vários pontos do corpo;
       aqui usamos apenas os pulsos esquerdo e direito.
    3. O jogador tem de alinhar os dois pulsos com círculos no ecrã
       e mantê‑los lá durante um curto intervalo de tempo.
    4. Cada sucesso conta 1 ponto e gera novos alvos.
    5. A partir de determinados pontos a dificuldade sobe e os
       círculos ficam mais pequenos, tornando o exercício mais
       exigente ao nível motor e cognitivo.

  Este ficheiro contém toda a lógica do jogo em p5.js.
*/

// ===============================
// CONSTANTES GERAIS DO JOGO
// ===============================
// Nome do jogo (pode ser alterado facilmente aqui)
const GAME_NAME = "NeuroSymmetry Trainer";

// ===============================
// VARIÁVEIS DA CÂMARA E ML5
// ===============================
// Objeto de vídeo da webcam e modelo de pose corporal do ml5
let video;
let bodyPose;
let poses = [];

// ===============================
// VARIÁVEIS DE SUAVIZAÇÃO (LERP)
// ===============================
// Guardam a posição "suavizada" dos pulsos para reduzir o tremor
let smoothWristL = { x: 0, y: 0, confidence: 0 };
let smoothWristR = { x: 0, y: 0, confidence: 0 };
let lerpAmount = 0.2; // 20% de aproximação por frame (quanto menor, mais suave, mas mais "atrasado")

// Coordenadas já convertidas para o canvas (após escala e centragem do vídeo)
let displayWristL = { x: 0, y: 0, confidence: 0 };
let displayWristR = { x: 0, y: 0, confidence: 0 };

// Guarda a posição aproximada do nariz da pessoa "principal"
// para podermos continuar a segui-la mesmo que outra pessoa
// entre no campo de visão.
let mainPersonNose = null;

// ===============================
// VARIÁVEIS DE ESTADO E PONTUAÇÃO
// ===============================
// Estado do jogo (START: menu inicial, PLAY: a jogar, END: fim do treino)
let gameState = "START"; 
let score = 0;
let highScore = 0;
let gameDuration = 60; // 60 segundos
let gameStartTime = 0;
let timeLeft = 60;

// Dificuldade atual do jogo e raio base dos alvos
// (FÁCIL, MÉDIO, DIFÍCIL)
let difficulty = "FÁCIL";
let targetBaseRadius = 90; // valor inicial, ajustado em applyDifficultySettings()

// Lista de pontuações guardadas (TOP 5)
let ranking = [];

// Guarda a pontuação do último jogo para mostrar no ranking
let lastScore = null;

// ===============================
// ALVOS DO JOGO E DO MENU
// ===============================
// Círculos que o jogador deve atingir com os pulsos (em jogo e no menu)
let targetL = { x: 0, y: 0, r: 80 }; 
let targetR = { x: 0, y: 0, r: 80 };
let menuTargetL, menuTargetR;

// ===============================
// VARIÁVEIS DO TEMPORIZADOR DE INTERAÇÃO
// ===============================
// Servem para controlar quanto tempo os pulsos ficam dentro dos círculos
let holdStartMillis = 0;
let isHolding = false;
// Tempo de permanência é agora aleatório entre 1 e 2 segundos
const HOLD_TIME_MIN = 1000; // 1 segundo (em milissegundos)
const HOLD_TIME_MAX = 2000; // 2 segundos (em milissegundos)
let requiredHoldTime = 1500; // será definido aleatoriamente em cada interação

// Escala e offset atuais do vídeo no canvas
let videoScale = 1;
let videoOffsetX = 0;
let videoOffsetY = 0;

// Carrega o modelo de pose corporal antes de iniciar o sketch
function preload() {
  // flipped: false, porque vamos tratar do espelho apenas ao nível do vídeo
  bodyPose = ml5.bodyPose("BlazePose", { flipped: false });
}

function setup() {
  // Carrega o recorde guardado (se existir) a partir do localStorage
  let storedHighScore = localStorage.getItem("highScore");
  if (storedHighScore !== null) {
    highScore = int(storedHighScore);
  }

  // Carrega o ranking guardado (se existir) a partir do localStorage
  let storedRanking = localStorage.getItem("ranking");
  if (storedRanking !== null) {
    try {
      ranking = JSON.parse(storedRanking);
    } catch (e) {
      ranking = [];
    }
  }

  // Se o ranking tiver valores, garante que o highScore acompanha o melhor
  if (ranking.length > 0) {
    highScore = max(highScore, ranking[0]);
  }

  createCanvas(1280, 720);
  
  // Cria a captura de vídeo da webcam
  video = createCapture(VIDEO); 
  // Não forçamos o tamanho do vídeo para evitar esticar a imagem;
  // usamos o tamanho nativo da câmara (video.width / video.height)
  video.hide();
  
  // Inicia a deteção contínua de poses do ml5
  bodyPose.detectStart(video, gotPoses);
  
  // Aplica as definições da dificuldade inicial
  applyDifficultySettings();
  updateMenuTargets();
}

// Define as posições dos círculos do menu (esquerda e direita em baixo)
function updateMenuTargets() {
  menuTargetL = { x: width * 0.25, y: height * 0.8, r: 80 };
  menuTargetR = { x: width * 0.75, y: height * 0.8, r: 80 };
}

// Callback chamado sempre que o ml5 deteta novas poses
function gotPoses(results) {
  poses = results;
}

// Função principal de desenho do p5.js.
// A cada frame faz, por esta ordem:
//  1) Desenha o vídeo da câmara (espelhado) a preencher o canvas;
//  2) Atualiza e suaviza as posições dos pulsos;
//  3) Converte essas posições para o espaço do canvas;
//  4) Aplica o filtro escuro de fundo nos ecrãs de menu;
//  5) Desenha os pontos verdes dos pulsos;
//  6) Desenha o ecrã correto (START / PLAY / END).
function draw() {
  background(20);
  
  // Calcula a escala para preencher o canvas mantendo a proporção da câmara
  if (video.width > 0 && video.height > 0) {
    videoScale = max(width / video.width, height / video.height);
    let drawW = video.width * videoScale;
    let drawH = video.height * videoScale;

    // Centra o vídeo no canvas
    videoOffsetX = (width - drawW) / 2;
    videoOffsetY = (height - drawH) / 2;

    // Desenha o vídeo EM ESPELHO, para que a esquerda/direita coincidam
    push();
    translate(width, 0);
    scale(-1, 1);
    // Ao espelhar o canvas, o vídeo é desenhado nas mesmas coordenadas,
    // mas visualmente invertido na horizontal
    image(video, videoOffsetX, videoOffsetY, drawW, drawH);
    pop();
  }
  
  // Atualiza as posições suavizadas dos pulsos (Filtro anti-tremor)
  updateWrists();

  // Converte as coordenadas dos pulsos para o sistema do canvas
  updateDisplayWrists();

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

// Desenha o ecrã inicial com título, instruções resumidas,
// recorde, dificuldade atual e tabela de ranking.
function drawStartScreen() {
  noStroke();

  // Título do jogo
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(58);
  text(GAME_NAME, width / 2, height * 0.16);

  // Painel central semi-transparente para texto de ajuda
  let panelX = width * 0.14;
  let panelY = height * 0.20;
  let panelW = width * 0.72;
  let panelH = height * 0.30;
  fill(0, 0, 0, 170);
  rect(panelX, panelY, panelW, panelH, 20);

  // Bloco "Como jogar"
  textAlign(CENTER, TOP);
  fill(255);
  textSize(26);
  text("COMO JOGAR", width / 2, panelY + 18);

  textSize(22);
  text("1. Move os braços até aos círculos.\n2. Mantém os dois pulsos nos círculos 1–2s.\n3. Ganha o máximo de pontos em 60s.",
       width / 2, panelY + 60);

    // Recorde e dificuldade atual (fora do painel, logo abaixo)
    let infoY = panelY + panelH + 20;
    fill(255, 215, 0);
    textSize(32);
    text("🏆 Recorde: " + highScore + " 🏆", width / 2, infoY);

    fill(173, 216, 230);
    textSize(20);
    text("Dificuldade: " + difficulty, width / 2, infoY + 32);

  // Instrução para iniciar
  fill(150, 255, 150);
  textSize(20);
  textAlign(CENTER, CENTER);
  text("PARA COMEÇAR:\nColoca os dois pulsos nos círculos.", width / 2, height * 0.66);

  // Desenha o ranking (se existir) mais abaixo, sem tapar o texto
  drawRanking(height * 0.74);
}

// Lógica principal enquanto o jogador está a jogar.
// Gere:
//  - o temporizador dos 60 segundos;
//  - a atualização da pontuação e do ranking (quando o tempo acaba);
//  - o "HUD" em cima (pontuação, tempo, dificuldade);
//  - a verificação de sucesso nos alvos (checkInteraction).
function playGame() {
  let elapsedTime = floor((millis() - gameStartTime) / 1000);
  timeLeft = gameDuration - elapsedTime;
  
  if (timeLeft <= 0) {
    // Atualiza ranking e recorde quando o jogo termina
    if (score > 0) {
      ranking.push(score);
      // Ordena do maior para o menor e mantém apenas o TOP 5
      ranking.sort((a, b) => b - a);
      if (ranking.length > 5) ranking = ranking.slice(0, 5);

      highScore = ranking[0];

      // Guarda ranking e recorde na localStorage
      localStorage.setItem("ranking", JSON.stringify(ranking));
      localStorage.setItem("highScore", highScore);
    }
    // Guarda a pontuação deste jogo para mostrar como "VOCÊ"
    lastScore = score;
    gameState = "END";
    return;
  }

  // Fundo semitransparente para tornar a informação mais legível
  noStroke();
  fill(0, 0, 0, 160);
  rect(20, 20, width - 40, 70, 15);

  fill(255); textSize(36);
  // Pontuação (canto superior esquerdo)
  textAlign(LEFT, TOP); 
  text("Pontuação: " + score, 40, 40);

  // Tempo restante (canto superior direito)
  textAlign(RIGHT, TOP);
  if (timeLeft <= 10) {
    fill(255, 50, 50);
  } else {
    fill(255);
  }
  text("Tempo: " + timeLeft + "s", width - 40, 40);

  // Informação da dificuldade atual (ao centro em cima)
  fill(173, 216, 230);
  textSize(24);
  textAlign(CENTER, TOP);
  text("Dificuldade: " + difficulty, width / 2, 40);

  checkInteraction(targetL, targetR, function() {
    score++;
    // Atualiza a dificuldade automaticamente com base na pontuação
    updateDifficultyByScore();
    generateTargets();
  });
}

// Desenha o ecrã de fim de jogo com a pontuação final,
// as instruções para repetir e o ranking atualizado.
function drawEndScreen() {
  textAlign(CENTER, CENTER);
  noStroke();
  
  fill(255); textSize(70);
  text("FIM DO TREINO!", width / 2, height * 0.18);
  
  textSize(45);
  text("Pontuação: " + score, width / 2, height * 0.34);
  
  fill(150, 255, 150); textSize(20);
  text("PARA REPETIR:\nColoca de novo os pulsos nos círculos.", width / 2, height * 0.55);
  // Desenha também o ranking no ecrã de fim, alinhado com o do início
  drawRanking(height * 0.63);
}

// ==========================================
// FUNÇÕES DE SUAVIZAÇÃO (LERP) E DESENHO
// ==========================================

// Escolhe qual das pessoas detetadas pelo modelo vai ser usada
// como "jogador principal". Se já tivermos um nariz guardado,
// escolhe a pose cujo nariz está mais perto dessa posição. Caso
// contrário, escolhe quem estiver mais perto do centro do vídeo.
function getMainPose() {
  if (!poses || poses.length === 0) return null;

  let bestPose = null;
  let bestScore = Infinity; // vamos minimizar esta "distância"

  for (let p of poses) {
    if (!p) continue;

    // Coordenadas de referência: nariz, ou média dos pulsos se necessário
    let refX, refY;
    if (p.nose) {
      refX = p.nose.x;
      refY = p.nose.y;
    } else if (p.left_wrist && p.right_wrist) {
      refX = (p.left_wrist.x + p.right_wrist.x) / 2;
      refY = (p.left_wrist.y + p.right_wrist.y) / 2;
    } else {
      continue;
    }

    let score;
    if (mainPersonNose) {
      // Distância ao nariz guardado (segue sempre a mesma pessoa)
      let dx = refX - mainPersonNose.x;
      let dy = refY - mainPersonNose.y;
      score = dx * dx + dy * dy;
    } else {
      // Ainda não há pessoa escolhida: usa proximidade ao centro do vídeo
      let centerX = video.width / 2;
      let centerY = video.height / 2;
      let dx = refX - centerX;
      let dy = refY - centerY;
      score = dx * dx + dy * dy;
    }

    if (score < bestScore) {
      bestScore = score;
      bestPose = p;
    }
  }

  if (bestPose) {
    // Atualiza o nariz da pessoa principal para o próximo frame
    if (bestPose.nose) {
      mainPersonNose = { x: bestPose.nose.x, y: bestPose.nose.y };
    }
  }

  return bestPose;
}

// Atualiza as coordenadas dos pulsos usando interpolação linear ("lerp").
// Isto suaviza o movimento, reduzindo o tremor natural da deteção do modelo
// e tornando mais agradável o seguimento dos pontos verdes.
function updateWrists() {
  // Em vez de usar sempre poses[0], escolhemos apenas UMA pessoa
  // (a principal), ignorando outras que possam aparecer na câmara.
  let pose = getMainPose();

  if (pose) {
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

// Converte as coordenadas dos pulsos para o sistema de coordenadas do canvas,
// tendo em conta a escala aplicada ao vídeo, o offset (centragem) e o facto
// de o vídeo estar espelhado na horizontal.
function updateDisplayWrists() {
  // Pulso esquerdo
  displayWristL.confidence = smoothWristL.confidence;
  if (smoothWristL.confidence > 0.1) {
    // Como o vídeo está espelhado, refletimos também a coordenada X
    displayWristL.x = width - (videoOffsetX + smoothWristL.x * videoScale);
    displayWristL.y = videoOffsetY + smoothWristL.y * videoScale;
  }

  // Pulso direito
  displayWristR.confidence = smoothWristR.confidence;
  if (smoothWristR.confidence > 0.1) {
    // Mesma reflexão em X para o pulso direito
    displayWristR.x = width - (videoOffsetX + smoothWristR.x * videoScale);
    displayWristR.y = videoOffsetY + smoothWristR.y * videoScale;
  }
}

// Desenha os círculos verdes nas posições dos pulsos (quando detetados)
function drawWrists() {
  fill(0, 255, 0); noStroke();
  if (displayWristL.confidence > 0.1) circle(displayWristL.x, displayWristL.y, 30);
  if (displayWristR.confidence > 0.1) circle(displayWristR.x, displayWristR.y, 30);
}

// ==========================================
// LÓGICA DE INTERAÇÃO E ALVOS
// ==========================================

// Verifica se ambos os pulsos estão dentro dos dois alvos durante um
// intervalo de tempo aleatório entre 1 e 2 segundos.
//  - tL e tR são os alvos (esquerdo e direito).
//  - onSuccessCallback é a função chamada quando a interação é concluída
//    com sucesso (iniciar jogo ou somar 1 ponto, consoante o estado).
function checkInteraction(tL, tR, onSuccessCallback) {
  let isHovering = false;

  // Agora usamos as coordenadas SUAVIZADAS para calcular a colisão!
  if (displayWristL.confidence > 0.1 && displayWristR.confidence > 0.1) {
    let distL = dist(displayWristL.x, displayWristL.y, tL.x, tL.y);
    let distR = dist(displayWristR.x, displayWristR.y, tR.x, tR.y);

    if (distL < tL.r && distR < tR.r) {
      isHovering = true;
    }
  }

  if (isHovering) {
    if (!isHolding) {
      isHolding = true;
      holdStartMillis = millis();
      // Escolhe aleatoriamente um tempo de permanência entre 1 e 2 segundos
      requiredHoldTime = random(HOLD_TIME_MIN, HOLD_TIME_MAX);
    } else {
      let holdDuration = millis() - holdStartMillis;
      if (holdDuration >= requiredHoldTime) {
        isHolding = false; 
        onSuccessCallback(); 
        return; 
      }
    }
  } else {
    isHolding = false; 
  }

  // Desenha os círculos alvo com cor consoante a dificuldade
  strokeWeight(4);
  if (difficulty === "FÁCIL") {
    stroke(0, 255, 0, 200);
  } else if (difficulty === "MÉDIO") {
    stroke(255, 165, 0, 220);
  } else {
    stroke(255, 80, 80, 220);
  }
  fill(0, 0, 0, 80);
  circle(tL.x, tL.y, tL.r * 2);
  circle(tR.x, tR.y, tR.r * 2);

   // Se o jogador estiver a cumprir os 3 segundos, desenha o "anel" de progresso
  if (isHovering && isHolding) {
    let holdDuration = millis() - holdStartMillis;
    let progress = map(holdDuration, 0, requiredHoldTime, 0, 360);
    progress = constrain(progress, 0, 360);

    stroke(0, 255, 0); noFill(); strokeWeight(8);
    arc(tL.x, tL.y, tL.r * 2, tL.r * 2, -HALF_PI, radians(progress) - HALF_PI);
    arc(tR.x, tR.y, tR.r * 2, tR.r * 2, -HALF_PI, radians(progress) - HALF_PI);
    
    fill(255); noStroke(); textAlign(CENTER, CENTER); textSize(24);
    // Mostra o tempo necessário nessa interação, em segundos com 1 casa decimal
    let secondsToHold = (requiredHoldTime / 1000).toFixed(1);
    text(secondsToHold + "s", tL.x, tL.y);
    text(secondsToHold + "s", tR.x, tR.y);
  }
}

// Gera novas posições aleatórias para os dois alvos durante o jogo,
// mantendo um alvo em cada metade do ecrã, para obrigar a abrir os braços.
function generateTargets() {
  let margin = 150; 
  // Ajusta o raio dos círculos conforme a dificuldade atual
  targetL.r = targetBaseRadius;
  targetR.r = targetBaseRadius;
  targetL.x = random(margin, (width / 2) - margin);
  targetL.y = random(margin, height - margin);
  targetR.x = random((width / 2) + margin, width - margin);
  targetR.y = random(margin, height - margin);
}

// Inicia / reinicia o jogo, definindo valores iniciais de pontuação,
// tempo, estado e dificuldade.
function startGame() {
  score = 0;
  timeLeft = gameDuration;
  gameStartTime = millis();
  isHolding = false;
  gameState = "PLAY";
  // Recomeça sempre em nível FÁCIL
  difficulty = "FÁCIL";
  applyDifficultySettings();
  generateTargets();
}

// ==========================================
// FUNÇÕES AUXILIARES DE DIFICULDADE E RANKING
// ==========================================

// Define o raio base dos alvos para cada nível de dificuldade.
function applyDifficultySettings() {
  if (difficulty === "FÁCIL") {
    targetBaseRadius = 100;
  } else if (difficulty === "MÉDIO") {
    targetBaseRadius = 80;
  } else if (difficulty === "DIFÍCIL") {
    // No nível difícil (a partir de 10 pontos), círculos vão ficando
    // progressivamente menores a cada ponto, até um mínimo seguro.
    let extraPoints = max(0, score - 10); // só conta a partir dos 10
    targetBaseRadius = max(30, 60 - extraPoints * 2);
  }
}

// Atualiza automaticamente a dificuldade com base na pontuação atual:
//  0–4 pontos  -> FÁCIL
//  5–9 pontos  -> MÉDIO
//  10+ pontos  -> DIFÍCIL
function updateDifficultyByScore() {
  if (score >= 10) {
    difficulty = "DIFÍCIL";
  } else if (score >= 5) {
    difficulty = "MÉDIO";
  } else {
    difficulty = "FÁCIL";
  }
  applyDifficultySettings();
}

// Desenha a tabela de ranking (TOP 5) com colunas "POS" e "PTS"
// e uma linha adicional "VOCÊ" com a pontuação do último jogo.
function drawRanking(startY) {
  if (ranking.length === 0 && lastScore === null) return;

  let tableWidth = 380;   // ligeiramente mais estreita para caber melhor
  let rowHeight = 20;     // linhas um pouco mais baixas
  let headerHeight = 28;  // cabeçalho ligeiramente mais compacto
  let xCenter = width / 2;
  let xLeft = xCenter - tableWidth / 2;
  let xColPos = xLeft + 40;
  let xColScore = xLeft + tableWidth - 60;

  // Fundo da tabela
  noStroke();
  fill(0, 0, 0, 170);
  let totalRows = max(ranking.length, 1) + (lastScore !== null ? 3 : 1);
  rect(xLeft, startY - 10, tableWidth, headerHeight + rowHeight * totalRows, 12);

  // Cabeçalho
  textAlign(CENTER, TOP);
  textSize(18);
  fill(255);
  text("RANKING", xCenter, startY - 4);

  textSize(14);
  textAlign(LEFT, TOP);
  fill(200);
  text("POS", xColPos, startY + headerHeight - 4);
  textAlign(RIGHT, TOP);
  text("PTS", xColScore, startY + headerHeight - 4);

  // Linhas do TOP 5
  for (let i = 0; i < ranking.length; i++) {
    let y = startY + headerHeight + rowHeight * (i + 1);
    if (i === 0) {
      fill(255, 215, 0); // destaque a dourado para o 1.º lugar (recorde)
    } else {
      fill(230);
    }
    textAlign(LEFT, TOP);
    text((i + 1) + "º", xColPos, y);
    textAlign(RIGHT, TOP);
    text(ranking[i] + " pts", xColScore, y);
  }

  // Linha "VOCÊ" com a pontuação do último jogo
  if (lastScore !== null) {
    let yLine = startY + headerHeight + rowHeight * (ranking.length + 1.2);
    stroke(255, 255, 255, 100);
    line(xLeft + 20, yLine, xLeft + tableWidth - 20, yLine);
    noStroke();

    let yPlayer = yLine + 6;
    // Se o utilizador tiver o recorde, destaca a verde; caso contrário, azul-claro
    if (ranking.length > 0 && lastScore === ranking[0]) {
      fill(50, 255, 120);
    } else {
      fill(135, 206, 250);
    }
    textAlign(LEFT, TOP);
    text("VOCÊ", xColPos, yPlayer);
    textAlign(RIGHT, TOP);
    text(lastScore + " pts", xColScore, yPlayer);
  }
}

// Permite mudar rapidamente a dificuldade com o teclado (1, 2, 3).
// Útil sobretudo para testes e demonstrações, ignorando a progressão
// automática pela pontuação.
function keyPressed() {
  if (key === '1') {
    difficulty = "FÁCIL";
  } else if (key === '2') {
    difficulty = "MÉDIO";
  } else if (key === '3') {
    difficulty = "DIFÍCIL";
  }
  applyDifficultySettings();
}