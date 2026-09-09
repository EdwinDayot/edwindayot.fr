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
