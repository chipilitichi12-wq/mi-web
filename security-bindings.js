(() => {
  'use strict';

  // Defensa básica contra clickjacking cuando el hosting (p. ej. GitHub Pages)
  // no permite configurar X-Frame-Options/frame-ancestors por cabecera.
  try {
    if (window.top !== window.self) window.top.location = window.self.location.href;
  } catch {
    document.documentElement.textContent = '';
    return;
  }

  const call = (name, ...args) => {
    const fn = window[name];
    if (typeof fn === 'function') return fn(...args);
  };

  const clickActions = {
    'open-world': () => call('abrirMiMundo'),
    'back-world': () => call('volverDesdeMiMundo'),
    enter: () => call('entrar'),
    'music-prev': () => call('cancionAnterior'),
    'music-toggle': () => call('togglePlay'),
    'music-next': () => call('cancionSiguiente'),
    'music-mute': () => call('toggleMute'),
    'game-highway': () => window.RayitoApp?.openGame('highway'),
    'game-snake': () => window.RayitoApp?.openGame('snake'),
    'game-neon': () => window.RayitoApp?.openGame('neon'),
    'game-breakout': () => window.RayitoApp?.openGame('breakout'),
    'game-cohete': () => window.RayitoApp?.openGame('cohete'),
    'game-penalty': () => window.RayitoApp?.openGame('penalty'),
    share: () => call('compartirSitio'),
    'copy-link': () => call('copiarEnlace'),
    'open-library': () => call('abrirMenuLibro'),
    'close-library': () => call('cerrarMenuLibro'),
    'game-sound': () => call('toggleSonidoJuego'),
    'game-pause': () => call('togglePausaJuego'),
    'game-restart': () => call('reiniciarJuegoActual'),
    'game-close': () => call('cerrarTodoJuego'),
    'snake-up': () => call('cambiarDireccionSnake', 'UP'),
    'snake-left': () => call('cambiarDireccionSnake', 'LEFT'),
    'snake-down': () => call('cambiarDireccionSnake', 'DOWN'),
    'snake-right': () => call('cambiarDireccionSnake', 'RIGHT'),
  };

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-secure-action]');
    if (!target) return;
    const action = target.dataset.secureAction;

    if (action === 'music-seek') {
      call('setPos', { currentTarget: target, clientX: event.clientX });
      return;
    }

    const handler = clickActions[action];
    if (handler) handler();
  });

  document.addEventListener('change', (event) => {
    const target = event.target.closest('[data-secure-change]');
    if (!target) return;
    switch (target.dataset.secureChange) {
      case 'theme':
        call('cambiarTema', target.value);
        break;
      case 'music-track':
        call('seleccionarCancion', Number(target.value), true);
        break;
      case 'difficulty':
        call('cambiarDificultad', target.value);
        break;
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target.closest('[data-secure-input]');
    if (!target) return;
    if (target.dataset.secureInput === 'music-volume') {
      call('ajustarVolumen', target.value);
    }
  });

  // CSP bloquea handlers inline. Este listener reemplaza el antiguo onerror
  // de los avatares del ranking sin relajar script-src.
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.dataset.rankingAvatar === '1') {
      img.remove();
    }
  }, true);
})();
