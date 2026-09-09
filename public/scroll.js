(() => {
  const progress = document.querySelector('.reading-progress');
  const reveals = [...document.querySelectorAll('.reveal')];
  const projectLinks = [...document.querySelectorAll('.project-nav a')];
  const projects = projectLinks.map(link => document.querySelector(link.hash)).filter(Boolean);
  const heroArt = document.querySelector('.hero-art');
  const heroImage = document.querySelector('.hero-reel-image');
  const heroCaption = document.querySelector('.hero-caption');
  const reelButtons = [...document.querySelectorAll('.hero-reel button')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (progress) progress.value = 100;

  if ('IntersectionObserver' in window && !reducedMotion) {
    const revealObserver = new IntersectionObserver((entries, current) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        current.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(element => revealObserver.observe(element));
  } else {
    reveals.forEach(element => element.classList.add('is-visible'));
  }

  if (heroArt && !reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    heroArt.addEventListener('pointermove', event => {
      const bounds = heroArt.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 12;
      heroArt.style.setProperty('--art-x', `${x.toFixed(2)}px`);
      heroArt.style.setProperty('--art-y', `${y.toFixed(2)}px`);
    }, { passive: true });
    heroArt.addEventListener('pointerleave', () => {
      heroArt.style.setProperty('--art-x', '0px');
      heroArt.style.setProperty('--art-y', '0px');
    });
  }

  if (heroImage && heroCaption && reelButtons.length) {
    let switchTimer;
    const switchReel = button => {
      const image = button.dataset.image;
      if (!image) return;
      reelButtons.forEach(item => item.setAttribute('aria-selected', item === button ? 'true' : 'false'));
      heroCaption.textContent = button.dataset.caption || '';
      heroImage.alt = button.dataset.alt || '';
      window.clearTimeout(switchTimer);
      if (reducedMotion) {
        heroImage.src = image;
        return;
      }
      heroArt?.classList.add('is-changing');
      switchTimer = window.setTimeout(() => {
        heroImage.src = image;
        heroArt?.classList.remove('is-changing');
      }, 140);
    };
    reelButtons.forEach(button => button.addEventListener('click', () => switchReel(button)));
  }

  const questItems = [...document.querySelectorAll('[data-quest-item]')];
  const questScore = document.querySelector('#quest-score');
  const questStatus = document.querySelector('#quest-status');
  const questProgress = document.querySelector('.quest-progress');
  const questFill = document.querySelector('#quest-progress-fill');
  const questReset = document.querySelector('#quest-reset');
  const questKey = 'edwin-dayot-exploration-v1';
  const questNames = questItems.map(item => item.dataset.questItem);
  let questState = {};

  try {
    questState = JSON.parse(window.localStorage.getItem(questKey) || '{}');
  } catch (error) {
    questState = {};
  }

  const showQuestToast = message => {
    const toast = document.createElement('div');
    toast.className = 'quest-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.append(toast);
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 280);
    }, 2300);
  };

  const renderQuest = () => {
    const complete = questNames.filter(name => questState[name]).length;
    questItems.forEach(item => item.classList.toggle('is-complete', Boolean(questState[item.dataset.questItem])));
    if (questScore) questScore.textContent = complete * 25;
    if (questStatus) questStatus.textContent = `${complete} / ${questNames.length} étapes`;
    if (questFill) questFill.style.width = `${(complete / questNames.length) * 100}%`;
    questProgress?.setAttribute('aria-valuenow', String(complete));
    document.body.classList.toggle('quest-complete', complete === questNames.length);
  };

  const completeQuest = (name, message) => {
    if (!questNames.includes(name) || questState[name]) return;
    questState[name] = true;
    try {
      window.localStorage.setItem(questKey, JSON.stringify(questState));
    } catch (error) {
      // The visual progression still works when storage is unavailable.
    }
    renderQuest();
    showQuestToast(message);
  };

  renderQuest();
  questReset?.addEventListener('click', () => {
    questState = {};
    try {
      window.localStorage.removeItem(questKey);
    } catch (error) {
      // Ignore storage restrictions.
    }
    renderQuest();
    showQuestToast('Parcours réinitialisé.');
  });

  const gameCanvas = document.querySelector('#shipping-game');
  const gameStart = document.querySelector('#game-start');
  const gameStartPanel = document.querySelector('.game-start');
  const gameStartLabel = gameStartPanel?.querySelector('span');
  const gameScore = document.querySelector('#game-score');
  const gameTime = document.querySelector('#game-time');
  const gameStatus = document.querySelector('#game-status');
  const gameControls = [...document.querySelectorAll('[data-game-control]')];

  if (gameCanvas && gameStart) {
    const context = gameCanvas.getContext('2d');
    const gameWidth = gameCanvas.width;
    const gameHeight = gameCanvas.height;
    const player = { x: gameWidth / 2 - 42, y: gameHeight - 62, width: 84, height: 28, speed: 440 };
    const pressed = new Set();
    let fallingItems = [];
    let gameScoreValue = 0;
    let gameSeconds = 30;
    let spawnClock = 0;
    let running = false;
    let lastFrame = 0;
    let animationFrame;

    const drawText = (text, x, y, color, size = 12) => {
      context.fillStyle = color;
      context.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.fillText(text, x, y);
    };

    const drawGame = () => {
      context.clearRect(0, 0, gameWidth, gameHeight);
      context.fillStyle = '#111515';
      context.fillRect(0, 0, gameWidth, gameHeight);
      context.strokeStyle = 'rgba(201,244,90,.12)';
      context.lineWidth = 1;
      for (let x = 0; x <= gameWidth; x += 48) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, gameHeight);
        context.stroke();
      }
      for (let y = 0; y <= gameHeight; y += 48) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(gameWidth, y);
        context.stroke();
      }
      fallingItems.forEach(item => {
        context.fillStyle = item.type === 'bug' ? '#ff7666' : item.type === 'ship' ? '#8ed8ff' : '#c9f45a';
        context.beginPath();
        context.arc(item.x, item.y, 18, 0, Math.PI * 2);
        context.fill();
        drawText(item.label, item.x - 9, item.y + 4, '#11150d', 10);
      });
      context.fillStyle = '#f0f1ea';
      context.beginPath();
      context.roundRect(player.x, player.y, player.width, player.height, 7);
      context.fill();
      context.fillStyle = '#c9f45a';
      context.beginPath();
      context.moveTo(player.x + 30, player.y);
      context.lineTo(player.x + 42, player.y - 18);
      context.lineTo(player.x + 54, player.y);
      context.fill();
      drawText('SHIP', player.x + 24, player.y + 18, '#11150d', 10);
      if (!running) drawText(gameScoreValue >= 12 ? 'BUILD LIVRÉ' : 'READY', 22, 34, '#c9f45a', 13);
    };

    const updateHud = () => {
      if (gameScore) gameScore.textContent = String(gameScoreValue);
      if (gameTime) gameTime.textContent = String(Math.max(0, Math.ceil(gameSeconds)));
    };

    const endGame = won => {
      running = false;
      window.cancelAnimationFrame(animationFrame);
      if (won) {
        completeQuest('game', 'Étape 05 débloquée. Produit livré.');
        if (gameStatus) gameStatus.textContent = 'Build livré. Tu peux rejouer pour battre ton score.';
        if (gameStartLabel) gameStartLabel.textContent = 'Le produit est en production.';
      } else {
        if (gameStatus) gameStatus.textContent = 'Le délai est passé. Rejoue et sécurise le build.';
        if (gameStartLabel) gameStartLabel.textContent = 'Le build a besoin d’un autre passage.';
      }
      gameStart.textContent = won ? 'Rejouer' : 'Réessayer';
      gameStartPanel?.classList.remove('is-hidden');
      drawGame();
    };

    const spawnItem = () => {
      const bug = Math.random() < 0.24;
      const ship = !bug && Math.random() < 0.12;
      fallingItems.push({
        x: 26 + Math.random() * (gameWidth - 52),
        y: -22,
        speed: 150 + Math.random() * 110,
        type: bug ? 'bug' : ship ? 'ship' : 'signal',
        label: bug ? '!' : ship ? '+' : '○'
      });
    };

    const frame = time => {
      if (!running) return;
      const delta = Math.min((time - lastFrame) / 1000, 0.05);
      lastFrame = time;
      gameSeconds -= delta;
      spawnClock += delta;
      if (spawnClock > 0.52) {
        spawnClock = 0;
        spawnItem();
      }
      if (pressed.has('ArrowLeft') || pressed.has('a')) player.x -= player.speed * delta;
      if (pressed.has('ArrowRight') || pressed.has('d')) player.x += player.speed * delta;
      player.x = Math.max(0, Math.min(gameWidth - player.width, player.x));
      fallingItems = fallingItems.filter(item => {
        item.y += item.speed * delta;
        const hit = item.x > player.x - 10 && item.x < player.x + player.width + 10 && item.y > player.y - 18 && item.y < player.y + player.height + 18;
        if (hit) {
          gameScoreValue += item.type === 'bug' ? -2 : item.type === 'ship' ? 2 : 1;
          gameScoreValue = Math.max(0, gameScoreValue);
          return false;
        }
        return item.y < gameHeight + 24;
      });
      updateHud();
      drawGame();
      if (gameScoreValue >= 12) return endGame(true);
      if (gameSeconds <= 0) return endGame(false);
      animationFrame = window.requestAnimationFrame(frame);
    };

    const startGame = () => {
      fallingItems = [];
      gameScoreValue = 0;
      gameSeconds = 30;
      spawnClock = 0;
      player.x = gameWidth / 2 - 42;
      running = true;
      lastFrame = performance.now();
      gameStartPanel?.classList.add('is-hidden');
      if (gameStatus) gameStatus.textContent = 'Collecte les signaux verts. Évite les bugs rouges.';
      updateHud();
      animationFrame = window.requestAnimationFrame(frame);
    };

    gameStart.addEventListener('click', startGame);
    gameControls.forEach(control => {
      const direction = control.dataset.gameControl === 'left' ? 'ArrowLeft' : 'ArrowRight';
      control.addEventListener('pointerdown', () => pressed.add(direction));
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(eventName => control.addEventListener(eventName, () => pressed.delete(direction)));
    });
    window.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(event.key)) {
        pressed.add(event.key);
        if (running) event.preventDefault();
      }
    });
    window.addEventListener('keyup', event => pressed.delete(event.key));
    drawGame();
    updateHud();
  }

  const plantGame = document.querySelector('.plant-game');
  const plantCards = [...document.querySelectorAll('.plant-card')];
  const plantButtons = [...document.querySelectorAll('[data-water]')];
  const plantPrompt = document.querySelector('#game-prompt');
  const plantFeedback = document.querySelector('#game-feedback');
  const plantRound = document.querySelector('#game-round');
  const plantScore = document.querySelector('#game-score');
  const plantStart = document.querySelector('#game-start');
  const plantStartPanel = document.querySelector('.plant-game .game-start');
  const plantStartLabel = plantStartPanel?.querySelector('span');
  const plantStatus = document.querySelector('#game-status');

  if (plantGame && plantStart && plantCards.length && !document.querySelector('#garden-world')) {
    const plants = new Map(plantCards.map(card => [card.dataset.plant, { moisture: Number(card.querySelector('.moisture-meter').getAttribute('aria-valuenow')) }]));
    let phase = 'seed';
    let selectedPlant = null;
    let careCount = 0;
    let careScore = 0;
    let running = false;
    let careLock = false;
    let timer;
    let updatePlantWorld = () => {};

    const updatePlantCard = (card, plant) => {
      const state = plants.get(plant);
      const meter = card.querySelector('.moisture-meter');
      const fill = card.querySelector('[data-moisture-fill]');
      const label = card.querySelector('[data-moisture-label]');
      meter.setAttribute('aria-valuenow', String(state.moisture));
      fill.style.width = `${state.moisture}%`;
      label.textContent = state.moisture < 35 ? 'soif' : state.moisture > 72 ? 'trop humide' : 'stable';
      card.classList.toggle('is-thirsty', state.moisture < 35);
      card.classList.toggle('is-overwatered', state.moisture > 72);
    };

    const setPhase = nextPhase => {
      phase = nextPhase;
      updatePlantWorld();
      plantCards.forEach(card => {
        const active = card.dataset.plant === selectedPlant;
        card.classList.toggle('is-selected', active);
        card.classList.toggle('is-sprouted', active && phase !== 'seed');
        card.classList.toggle('is-growing', active && phase === 'care' && careCount > 3);
      });
      plantButtons.forEach(button => {
        const active = button.dataset.water === selectedPlant;
        button.disabled = phase === 'seed' ? false : !active || !running || careLock;
        button.textContent = phase === 'seed' ? 'Planter + ' : phase === 'sprout' ? 'Faire germer ↗' : 'Arroser + ';
      });
      if (phase === 'seed') plantPrompt.textContent = 'Choisis un pot et plante ta graine.';
      if (phase === 'sprout') plantPrompt.textContent = 'La graine est en terre. Donne-lui son premier soin.';
      if (phase === 'care') plantPrompt.textContent = 'La pousse est là. Maintiens son humidité aussi longtemps que tu veux.';
    };

    const updateGameHud = () => {
      plantRound.textContent = String(careCount);
      plantScore.textContent = String(careScore);
      plantCards.forEach(card => updatePlantCard(card, card.dataset.plant));
    };

    const startPlantGame = () => {
      running = true;
      phase = 'seed';
      selectedPlant = null;
      careCount = 0;
      careScore = 0;
      careLock = false;
      plants.forEach(state => { state.moisture = 28; });
      plantFeedback.textContent = 'Lis les jauges, puis choisis ton pot.';
      plantStatus.textContent = 'Plante une graine pour commencer.';
      plantStartPanel.classList.add('is-hidden');
      setPhase('seed');
      updateGameHud();
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (!running) return;
        if (selectedPlant && phase === 'care') plants.get(selectedPlant).moisture = Math.max(0, plants.get(selectedPlant).moisture - 2);
        updateGameHud();
      }, 1000);
    };

    const worldHost = document.createElement('div');
    worldHost.className = 'three-stage';
    worldHost.innerHTML = '<canvas id="plant-world" aria-label="Scène 3D de la plante en cours de croissance"></canvas><span id="plant-world-label">Choisis un pot pour commencer.</span>';
    plantGame.querySelector('.plant-game-content')?.prepend(worldHost);
    const worldCanvas = worldHost.querySelector('canvas');
    const worldLabel = worldHost.querySelector('span');

    if (window.THREE && worldCanvas) {
      try {
        const scene = new window.THREE.Scene();
        const camera = new window.THREE.PerspectiveCamera(32, 2, 0.1, 100);
        camera.position.set(0, 1.7, 6.5);
        camera.lookAt(0, 1, 0);
        const renderer = new window.THREE.WebGLRenderer({ canvas: worldCanvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        scene.add(new window.THREE.HemisphereLight(0xd9f5cb, 0x16251c, 2.2));
        const keyLight = new window.THREE.DirectionalLight(0xc9f45a, 2.8);
        keyLight.position.set(-3, 5, 4);
        scene.add(keyLight);
        const ground = new window.THREE.Mesh(new window.THREE.CircleGeometry(2.5, 48), new window.THREE.MeshStandardMaterial({ color: 0x19241d, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.45;
        scene.add(ground);
        const plantWorld = new window.THREE.Group();
        const pot = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.78, .58, .85, 32), new window.THREE.MeshStandardMaterial({ color: 0xc66f36, roughness: .65 }));
        pot.position.y = 0;
        plantWorld.add(pot);
        const soil = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.64, .64, .08, 32), new window.THREE.MeshStandardMaterial({ color: 0x332219, roughness: 1 }));
        soil.position.y = .44;
        plantWorld.add(soil);
        const stem = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.065, .09, 2.2, 12), new window.THREE.MeshStandardMaterial({ color: 0x4c9a4c, roughness: .8 }));
        stem.position.y = 1.48;
        const leaves = [];
        for (let index = 0; index < 5; index += 1) {
          const leaf = new window.THREE.Mesh(new window.THREE.SphereGeometry(.46, 20, 12), new window.THREE.MeshStandardMaterial({ color: index % 2 ? 0x8acb54 : 0xc9f45a, roughness: .72 }));
          leaf.scale.set(.9, .18, .55);
          const angle = (index / 5) * Math.PI * 2;
          leaf.position.set(Math.cos(angle) * .52, 1.8 + (index % 2) * .42, Math.sin(angle) * .42);
          leaf.rotation.y = -angle;
          plantWorld.add(leaf);
          leaves.push(leaf);
        }
        plantWorld.add(stem);
        plantWorld.scale.setScalar(.08);
        plantWorld.position.y = -.15;
        scene.add(plantWorld);
        const resizeWorld = () => {
          const width = worldHost.clientWidth || 640;
          const height = worldHost.clientHeight || 270;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        const resizeObserver = new ResizeObserver(resizeWorld);
        resizeObserver.observe(worldHost);
        resizeWorld();
        updatePlantWorld = () => {
          const growth = phase === 'seed' ? .08 : phase === 'sprout' ? .52 : Math.min(1.08, .72 + careCount * .045);
          plantWorld.scale.setScalar(growth);
          plantWorld.rotation.y = selectedPlant ? (selectedPlant === 'monstera' ? -.22 : selectedPlant === 'calathea' ? .22 : 0) : 0;
          worldLabel.textContent = phase === 'seed' ? 'Graine prête à planter' : phase === 'sprout' ? 'Première pousse' : `Croissance ${careCount}`;
        };
        const animateWorld = time => {
          const secondsNow = time * .001;
          plantWorld.rotation.z = Math.sin(secondsNow * 1.2) * .035;
          leaves.forEach((leaf, index) => { leaf.rotation.z = Math.sin(secondsNow * 1.4 + index) * .12; });
          renderer.render(scene, camera);
          window.requestAnimationFrame(animateWorld);
        };
        updatePlantWorld();
        window.requestAnimationFrame(animateWorld);
      } catch (error) {
        worldLabel.textContent = 'Scène 3D indisponible dans ce navigateur';
      }
    }

    plantStart.addEventListener('click', startPlantGame);
    plantButtons.forEach(button => button.addEventListener('click', () => {
      if (!running) return;
      const plant = button.dataset.water;
      if (phase === 'seed') {
        selectedPlant = plant;
        careScore += 10;
        setPhase('sprout');
        plantFeedback.textContent = `Graine plantée dans le pot ${plant}.`;
        plantStatus.textContent = 'Encore un geste pour faire germer la graine.';
      } else if (phase === 'sprout' && plant === selectedPlant) {
        careScore += 20;
        plants.get(plant).moisture = 42;
        setPhase('care');
        plantFeedback.textContent = 'La pousse est sortie. La routine peut commencer.';
        plantStatus.textContent = 'Arrose quand la jauge passe dans la zone soif.';
      } else if (phase === 'care' && plant === selectedPlant) {
        const state = plants.get(plant);
        if (state.moisture > 68) {
          careScore = Math.max(0, careScore - 5);
          plantFeedback.textContent = 'Trop d’eau. Attends que la jauge redescende.';
          return;
        }
        state.moisture = Math.min(80, state.moisture + 24);
        careCount += 1;
        careScore += 10;
        if (careCount === 1) completeQuest('game', 'Étape 05 débloquée. La routine est lancée.');
        careLock = true;
        plantFeedback.textContent = `Soin ${careCount} réussi. La routine continue.`;
        window.setTimeout(() => { careLock = false; setPhase('care'); updateGameHud(); }, 650);
      }
      updateGameHud();
    }));
    setPhase('seed');
    updateGameHud();
  }

  const gardenCanvas = document.querySelector('#garden-world');
  if (gardenCanvas && window.THREE) {
    const gardenStage = gardenCanvas.parentElement;
    const gardenStatus = document.querySelector('#garden-status');
    const gardenToast = document.querySelector('#garden-toast');
    const gardenWaterCount = document.querySelector('#garden-water-count');
    const gardenPlantCount = document.querySelector('#garden-plant-count');
    const gardenCoins = document.querySelector('#garden-coins');
    const gardenKeys = new Set();
    const gardenWorld = new window.THREE.Scene();
    gardenWorld.fog = new window.THREE.Fog(0xc9e1c2, 12, 32);
    gardenWorld.background = new window.THREE.Color(0xc9e1c2);
    const gardenCamera = new window.THREE.PerspectiveCamera(42, 1, .1, 60);
    const gardenRenderer = new window.THREE.WebGLRenderer({ canvas: gardenCanvas, antialias: true });
    gardenRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gardenRenderer.shadowMap.enabled = true;
    gardenRenderer.shadowMap.type = window.THREE.PCFSoftShadowMap;
    gardenWorld.add(new window.THREE.HemisphereLight(0xf6ffe9, 0x6b806f, 2.3));
    const gardenSun = new window.THREE.DirectionalLight(0xfff4d6, 3.2);
    gardenSun.position.set(-6, 12, 7);
    gardenSun.castShadow = true;
    gardenWorld.add(gardenSun);
    const gardenGround = new window.THREE.Mesh(new window.THREE.PlaneGeometry(28, 22), new window.THREE.MeshStandardMaterial({ color: 0xa9c59a, roughness: 1 }));
    gardenGround.rotation.x = -Math.PI / 2;
    gardenGround.receiveShadow = true;
    gardenWorld.add(gardenGround);
    const river = new window.THREE.Mesh(new window.THREE.PlaneGeometry(3.8, 22), new window.THREE.MeshStandardMaterial({ color: 0x8fd4d1, roughness: .25, metalness: .05, transparent: true, opacity: .9 }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(4.7, .035, 0);
    gardenWorld.add(river);
    const riverBank = new window.THREE.Mesh(new window.THREE.BoxGeometry(4.6, .03, 22), new window.THREE.MeshStandardMaterial({ color: 0xd6d6a4, roughness: 1 }));
    riverBank.position.set(4.7, -.03, 0);
    gardenWorld.add(riverBank);
    const wateringCan = new window.THREE.Group();
    const canBody = new window.THREE.Mesh(new window.THREE.SphereGeometry(.28, 20, 12), new window.THREE.MeshStandardMaterial({ color: 0xffc978, roughness: .5 }));
    canBody.scale.set(1, .72, 1);
    const canSpout = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.07, .1, .55, 12), new window.THREE.MeshStandardMaterial({ color: 0xffc978, roughness: .5 }));
    canSpout.rotation.z = -Math.PI / 3;
    canSpout.position.set(.33, .1, 0);
    wateringCan.add(canBody, canSpout);
    wateringCan.position.set(.55, .95, .05);
    gardenWorld.add(wateringCan);
    const player = new window.THREE.Group();
    const playerBody = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(.28, .48, 8, 16), new window.THREE.MeshStandardMaterial({ color: 0xf38b68, roughness: .75 }));
    playerBody.position.y = .7;
    const playerHead = new window.THREE.Mesh(new window.THREE.SphereGeometry(.3, 18, 12), new window.THREE.MeshStandardMaterial({ color: 0xffd2a8, roughness: .9 }));
    playerHead.position.y = 1.3;
    const playerHat = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.42, .3, .13, 20), new window.THREE.MeshStandardMaterial({ color: 0x6b9f68, roughness: .8 }));
    playerHat.position.y = 1.61;
    player.add(playerBody, playerHead, playerHat);
    player.position.set(-5, 0, 3.2);
    gardenWorld.add(player);
    const gardenPlants = [
      { id: 'pilea', name: 'Pilea', position: [-2.9, 0, -2.8], color: 0x75b85b, potColor: 0xc8794a, growth: 0, upgrade: 0 },
      { id: 'monstera', name: 'Monstera', position: [-.5, 0, -3.8], color: 0x3c8d6b, potColor: 0xe6d3b4, growth: 0, upgrade: 0 },
      { id: 'calathea', name: 'Calathea', position: [2.2, 0, -2.2], color: 0x9d70b4, potColor: 0x8bb7af, growth: 0, upgrade: 0 }
    ];
    const plantModels = new Map();
    const makeLeaf = (color, scale, position, rotation = 0) => {
      const leaf = new window.THREE.Mesh(new window.THREE.SphereGeometry(.45, 16, 10), new window.THREE.MeshStandardMaterial({ color, roughness: .78 }));
      leaf.scale.set(...scale);
      leaf.position.set(...position);
      leaf.rotation.z = rotation;
      leaf.castShadow = true;
      return leaf;
    };
    const makePlant = data => {
      const group = new window.THREE.Group();
      const pot = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.55, .42, .58, 24), new window.THREE.MeshStandardMaterial({ color: data.potColor, roughness: .65 }));
      pot.position.y = .3;
      pot.castShadow = true;
      const soil = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.45, .45, .06, 24), new window.THREE.MeshStandardMaterial({ color: 0x473126, roughness: 1 }));
      soil.position.y = .6;
      group.add(pot, soil);
      const plant = new window.THREE.Group();
      const stem = new window.THREE.Mesh(new window.THREE.CylinderGeometry(.045, .07, 1.9, 10), new window.THREE.MeshStandardMaterial({ color: 0x4c8e57, roughness: .8 }));
      stem.position.y = 1.45;
      plant.add(stem);
      if (data.id === 'pilea') {
        for (let index = 0; index < 6; index += 1) { const angle = index * 1.05; plant.add(makeLeaf(data.color, [.55, .11, .42], [Math.cos(angle) * .5, 1.25 + index % 3 * .32, Math.sin(angle) * .4], angle)); }
      } else if (data.id === 'monstera') {
        for (let index = 0; index < 4; index += 1) { const angle = index * 1.5; plant.add(makeLeaf(data.color, [.25, .75, .11], [Math.cos(angle) * .48, 1.35 + index % 2 * .45, Math.sin(angle) * .38], -angle)); }
      } else {
        for (let index = 0; index < 5; index += 1) { const angle = index * 1.25; const leaf = makeLeaf(data.color, [.2, .8, .1], [Math.cos(angle) * .38, 1.35 + index % 2 * .35, Math.sin(angle) * .32], -angle); leaf.material = new window.THREE.MeshStandardMaterial({ color: index % 2 ? 0x9d70b4 : 0xc794cf, roughness: .75 }); plant.add(leaf); }
      }
      plant.scale.setScalar(.1);
      plant.position.y = .58;
      group.add(plant);
      group.position.set(...data.position);
      group.userData = { pot, plant, data };
      gardenWorld.add(group);
      plantModels.set(data.id, group);
    };
    gardenPlants.forEach(makePlant);
    let gardenWater = 0;
    let gardenResource = 0;
    let lastGardenFrame = performance.now();
    const refreshGardenHud = () => {
      gardenWaterCount.textContent = String(gardenWater);
      gardenCoins.textContent = String(gardenResource);
      gardenPlantCount.textContent = `${gardenPlants.filter(plant => plant.growth > 0).length} / 3`;
    };
    const sayGarden = message => { gardenStatus.textContent = message; gardenToast.textContent = message; gardenToast.classList.add('is-visible'); window.clearTimeout(sayGarden.timer); sayGarden.timer = window.setTimeout(() => gardenToast.classList.remove('is-visible'), 1800); };
    const nearestPlant = () => gardenPlants.map(plant => ({ plant, distance: player.position.distanceTo(new window.THREE.Vector3(...plant.position)) })).sort((a, b) => a.distance - b.distance)[0];
    const updatePlantModel = data => { const model = plantModels.get(data.id); const growth = Math.min(1.35, .1 + data.growth * .18); model.userData.plant.scale.setScalar(growth); model.userData.pot.material.color.setHex(data.upgrade === 0 ? data.potColor : data.upgrade === 1 ? 0xe8d6a8 : 0xa9e2d6); model.userData.pot.scale.setScalar(1 + data.upgrade * .07); };
    const gardenAction = action => {
      const closest = nearestPlant();
      const nearRiver = Math.abs(player.position.x - river.position.x) < 2.3;
      if (action === 'fill' || (action === 'act' && nearRiver && (!closest || closest.distance > 2.2))) { gardenWater = 100; refreshGardenHud(); sayGarden('Arrosoir rempli à la rivière.'); return; }
      if (action === 'upgrade' || action === 'act') {
        if (!closest || closest.distance > 2.2) { if (action === 'upgrade') sayGarden('Approche-toi d’un pot pour l’améliorer.'); return; }
        if (gardenWater === 0 && action === 'act') { sayGarden('La rivière est à droite.'); return; }
        if (action === 'upgrade') { if (closest.plant.upgrade >= 2) return sayGarden('Ce pot est déjà au niveau maximum.'); if (gardenResource < (closest.plant.upgrade + 1) * 2) return sayGarden('Il faut plus de ressources.'); gardenResource -= (closest.plant.upgrade + 1) * 2; closest.plant.upgrade += 1; updatePlantModel(closest.plant); refreshGardenHud(); sayGarden(`${closest.plant.name} a un nouveau pot.`); return; }
        if (gardenWater < 20) return sayGarden('Ton arrosoir est vide.');
        gardenWater -= 20; closest.plant.growth += 1; gardenResource += 1; updatePlantModel(closest.plant); refreshGardenHud(); sayGarden(`${closest.plant.name} grandit. Continue doucement.`); return;
      }
      if (action === 'water') gardenAction('act');
    };
    const updateGardenStatus = () => { const closest = nearestPlant(); if (Math.abs(player.position.x - river.position.x) < 2.3) gardenStatus.textContent = gardenWater < 100 ? 'E · remplir l’arrosoir dans la rivière' : 'Arrosoir plein. Retourne voir tes plantes.'; else if (closest.distance < 2.2) gardenStatus.textContent = `${closest.plant.name} · E arroser · U améliorer le pot`; else gardenStatus.textContent = 'Explore le jardin. Approche-toi d’une plante ou de la rivière.'; };
    const resizeGarden = () => { const width = gardenStage.clientWidth || 800; const height = gardenStage.clientHeight || 480; gardenRenderer.setSize(width, height, false); gardenCamera.aspect = width / height; gardenCamera.updateProjectionMatrix(); };
    new ResizeObserver(resizeGarden).observe(gardenStage);
    const gardenAnimate = time => { const delta = Math.min((time - lastGardenFrame) / 1000, .05); lastGardenFrame = time; const x = (gardenKeys.has('d') || gardenKeys.has('ArrowRight') ? 1 : 0) - (gardenKeys.has('a') || gardenKeys.has('ArrowLeft') ? 1 : 0); const z = (gardenKeys.has('s') || gardenKeys.has('ArrowDown') ? 1 : 0) - (gardenKeys.has('w') || gardenKeys.has('ArrowUp') ? 1 : 0); player.position.x += x * delta * 4; player.position.z += z * delta * 4; player.position.x = Math.max(-8, Math.min(8, player.position.x)); player.position.z = Math.max(-8, Math.min(8, player.position.z)); gardenCamera.position.lerp(new window.THREE.Vector3(player.position.x + 6.5, 9, player.position.z + 8), .08); gardenCamera.lookAt(player.position.x, .5, player.position.z); wateringCan.position.copy(player.position).add(new window.THREE.Vector3(.55, .95, .05)); wateringCan.rotation.y = Math.sin(time * .002) * .08; river.material.opacity = .84 + Math.sin(time * .0015) * .06; plantModels.forEach(model => { model.userData.plant.rotation.z = Math.sin(time * .0012 + model.position.x) * .035; }); updateGardenStatus(); gardenRenderer.render(gardenWorld, gardenCamera); window.requestAnimationFrame(gardenAnimate); };
    window.addEventListener('keydown', event => { if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.key)) { gardenKeys.add(event.key); event.preventDefault(); } if (event.key.toLowerCase() === 'e') gardenAction('act'); if (event.key.toLowerCase() === 'u') gardenAction('upgrade'); if (event.key.toLowerCase() === 'f') gardenAction('fill'); });
    window.addEventListener('keyup', event => gardenKeys.delete(event.key));
    document.querySelectorAll('[data-garden-action]').forEach(button => { button.addEventListener('click', () => { const action = button.dataset.gardenAction; if (['left', 'right', 'forward', 'back'].includes(action)) { const key = { left: 'a', right: 'd', forward: 'w', back: 's' }[action]; gardenKeys.add(key); window.setTimeout(() => gardenKeys.delete(key), 260); } else if (action === 'upgrade') gardenAction('upgrade'); else gardenAction('act'); }); });
    resizeGarden();
    refreshGardenHud();
    window.requestAnimationFrame(gardenAnimate);
  }
  projectLinks.forEach(link => link.addEventListener('click', () => completeQuest('project', 'Étape 01 débloquée.')));
  document.querySelectorAll('.project details').forEach(details => details.addEventListener('toggle', () => {
    if (details.open) completeQuest('details', 'Étape 02 débloquée.');
  }));

  if ('IntersectionObserver' in window && projectLinks.length) {
    const initialProject = projectLinks.find(link => link.hash === window.location.hash) || projectLinks[0];
    initialProject?.setAttribute('aria-current', 'location');
    const activeObserver = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      completeQuest('project', 'Étape 01 débloquée.');
      projectLinks.forEach(link => {
        link.toggleAttribute('aria-current', link.hash === `#${visible.target.id}`);
      });
    }, { threshold: [0.15, 0.45, 0.75], rootMargin: '-18% 0px -55% 0px' });
    projects.forEach(project => activeObserver.observe(project));
  }

  const contactSection = document.querySelector('.contact');
  if ('IntersectionObserver' in window && contactSection) {
    const contactObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) completeQuest('contact', 'Parcours terminé.');
    }, { threshold: 0.35 });
    contactObserver.observe(contactSection);
  }

  if (projectLinks.length && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const preview = document.createElement('figure');
    const previewImage = document.createElement('img');
    preview.className = 'project-preview';
    previewImage.alt = '';
    preview.append(previewImage);
    document.body.append(preview);

    projectLinks.forEach(link => {
      link.addEventListener('pointerenter', () => {
        previewImage.src = link.dataset.preview;
        previewImage.alt = `Aperçu de ${link.textContent}`;
        preview.classList.add('is-visible');
      });
      link.addEventListener('pointermove', event => {
        const x = Math.min(event.clientX + 20, window.innerWidth - 210);
        const y = Math.min(event.clientY + 20, window.innerHeight - 300);
        preview.style.setProperty('--preview-x', `${Math.max(12, x)}px`);
        preview.style.setProperty('--preview-y', `${Math.max(12, y)}px`);
      }, { passive: true });
      link.addEventListener('pointerleave', () => preview.classList.remove('is-visible'));
    });
  }

  const lightbox = document.createElement('dialog');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('aria-label', 'Aperçu de la capture');
  lightbox.innerHTML = '<button class="lightbox-close" type="button" aria-label="Fermer l\'aperçu">×</button><figure><img alt=""><figcaption></figcaption></figure>';
  document.body.append(lightbox);

  const lightboxImage = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('figcaption');
  const closeLightbox = () => lightbox.close();

  lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });

  document.querySelectorAll('.phone-row img').forEach(image => {
    image.setAttribute('tabindex', '0');
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `Agrandir : ${image.alt}`);

    const openLightbox = () => {
      completeQuest('capture', 'Étape 03 débloquée.');
      lightboxImage.src = image.currentSrc || image.src;
      lightboxImage.alt = image.alt;
      lightboxCaption.textContent = image.alt;
      lightbox.showModal();
    };

    image.addEventListener('click', openLightbox);
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLightbox();
      }
    });
  });
})();
