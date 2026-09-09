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
