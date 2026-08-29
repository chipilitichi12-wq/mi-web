(() => {
  'use strict';

  const CONFIG = window.RAYITO_CONFIG || {};
  const PROFILE_KEY = 'rayito-hub-profile-v2';
  const LOCAL_RANKING_KEY = 'rayito-local-ranking-v2';
  const DAILY_KEY = 'rayito-daily-v2';
  const LAST_TRACK_KEY = 'rayito-last-track-v2';
  const VOLUME_KEY = 'rayito-volume-v2';
  const REPEAT_KEY = 'rayito-repeat-v2';
  const SHUFFLE_KEY = 'rayito-shuffle-v2';
  const PLAYER_DEFAULT_AVATAR = 'player-default.svg';
  const LOCAL_AVATAR_DB = 'rayito-hub-local-assets-v1';
  const LOCAL_AVATAR_STORE = 'assets';
  const LOCAL_AVATAR_KEY = 'player-avatar';
  const ACCOUNT_PROGRESS_TABLE = 'rayito_player_progress';
  const ACCOUNT_SYNC_STAMP_KEY = 'rayito-account-sync-stamp-v1';
  const PENDING_ACCOUNT_EMAIL_KEY = 'rayito-pending-account-email-v1';
  const GAME_LABELS = {
    highway: 'Highway Rush', snake: 'Snake', neon: 'Neon Jump',
    breakout: 'Rompeladrillos', cohete: 'Cohete Espacial', penalty: 'Penalty Master'
  };
  const GAME_EMOJIS = { highway:'🏎️', snake:'🐍', neon:'🟣', breakout:'🧱', cohete:'🚀', penalty:'⚽' };
  const GAME_OPENERS = {
    highway: 'abrirJuegoHighway', snake: 'abrirJuegoSnake', neon: 'abrirJuegoNeon',
    breakout: 'abrirJuegoBreakout', cohete: 'abrirJuegoCohete', penalty: 'abrirJuegoPenalty'
  };

  const PERIPHERAL_FIELDS = [
    { key:'cpu', label:'Procesador' },
    { key:'gpu', label:'Tarjeta gráfica' },
    { key:'motherboard', label:'Motherboard' },
    { key:'ram', label:'Memoria RAM' },
    { key:'storage', label:'Almacenamiento' },
    { key:'psu', label:'Fuente' },
    { key:'case', label:'Gabinete' },
    { key:'cooling', label:'Refrigeración' },
    { key:'keyboard', label:'Teclado' },
    { key:'mouse', label:'Mouse' },
    { key:'headset', label:'Auriculares' },
    { key:'microphone', label:'Micrófono' },
    { key:'monitor', label:'Monitor principal' },
    { key:'controller', label:'Mando / Volante' },
  ];

  const ACHIEVEMENTS = [
    { id:'first_game', icon:'🎮', title:'Primera partida', desc:'Jugá tu primera partida.' },
    { id:'score_100', icon:'💯', title:'Triple dígito', desc:'Conseguí 100 puntos en un juego.' },
    { id:'score_500', icon:'🔥', title:'En llamas', desc:'Conseguí 500 puntos en un juego.' },
    { id:'all_games', icon:'🕹️', title:'Arcade completo', desc:'Probá los 6 minijuegos.' },
    { id:'favorite_song', icon:'♥', title:'Tiene favorito', desc:'Marcá una canción como favorita.' },
    { id:'daily', icon:'☀️', title:'Misión cumplida', desc:'Completá un desafío diario.' },
    { id:'level_5', icon:'⚡', title:'Nivel 5', desc:'Alcanzá el nivel 5.' },
    { id:'music_lover', icon:'🎧', title:'Music lover', desc:'Reproducí 10 canciones.' }
  ];

  function safeJSON(value, fallback) {
    try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
  }
  function sanitizePeripherals(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const clean = {};
    PERIPHERAL_FIELDS.forEach(({ key }) => {
      clean[key] = String(source[key] || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    });
    return clean;
  }
  function uid() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `r_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }
  function defaultProfile() {
    return {
      playerId: uid(), name: 'Jugador', xp: 0, gamesPlayed: 0,
      gameStarts: {}, achievements: [], favorites: [], trackPlays: 0,
      activities: [], createdAt: Date.now()
    };
  }
  let profile = { ...defaultProfile(), ...safeJSON(localStorage.getItem(PROFILE_KEY), {}) };
  profile.gameStarts ||= {};
  profile.achievements ||= [];
  profile.favorites ||= [];
  profile.activities ||= [];
  profile.peripherals = sanitizePeripherals(profile.peripherals);
  profile.avatarPath ||= '';
  profile.avatarVersion ||= 0;
  if (!profile.playerId) profile.playerId = uid();

  let localRankings = safeJSON(localStorage.getItem(LOCAL_RANKING_KEY), {});
  let repeatMode = localStorage.getItem(REPEAT_KEY) || 'off'; // off | all | one
  let shuffleEnabled = localStorage.getItem(SHUFFLE_KEY) === 'on';
  let musicFilter = 'all';
  let currentSearch = '';
  let deferredInstallPrompt = null;
  let lastPlaybackCountedTrack = null;
  let reactiveAnimationId = 0;
  const libraryObjectUrls = new Set();

  function saveProfile() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    if (!accountHydrating) scheduleAccountProgressSync();
  }
  function addActivity(icon, title, detail) {
    profile.activities.unshift({ icon, title, detail, at: Date.now() });
    profile.activities = profile.activities.slice(0, 5);
    saveProfile();
    renderActivity();
  }
  function levelInfo() {
    const xp = Math.max(0, Number(profile.xp) || 0);
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 180)) + 1);
    const currentFloor = Math.pow(level - 1, 2) * 180;
    const nextFloor = Math.pow(level, 2) * 180;
    return { level, xp, currentFloor, nextFloor, into: xp - currentFloor, need: nextFloor - currentFloor };
  }
  function buildPublicStats() {
    const info = levelInfo();
    return {
      level: info.level,
      xp: info.xp,
      gamesPlayed: Math.max(0, Number(profile.gamesPlayed) || 0),
      favorites: Array.isArray(profile.favorites) ? profile.favorites.length : 0,
      achievements: Array.isArray(profile.achievements)
        ? profile.achievements.filter(id => ACHIEVEMENTS.some(a => a.id === id)).slice(0, ACHIEVEMENTS.length)
        : [],
    };
  }

  function normalizePublicStats(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const ids = Array.isArray(source.achievements)
      ? source.achievements.filter(id => ACHIEVEMENTS.some(a => a.id === id)).slice(0, ACHIEVEMENTS.length)
      : [];
    return {
      level: Math.max(1, Math.min(999, Number(source.level) || 1)),
      xp: Math.max(0, Math.min(999999999, Number(source.xp) || 0)),
      gamesPlayed: Math.max(0, Math.min(999999999, Number(source.gamesPlayed) || 0)),
      favorites: Math.max(0, Math.min(999999, Number(source.favorites) || 0)),
      achievements: ids,
    };
  }
  function addXP(amount, reason, quiet = false) {
    const before = levelInfo().level;
    profile.xp = Math.max(0, (Number(profile.xp) || 0) + Math.round(amount || 0));
    saveProfile();
    const after = levelInfo().level;
    if (after >= 5) unlockAchievement('level_5', true);
    if (!quiet && amount > 0) mostrarToast(`+${amount} XP · ${reason}`);
    if (after > before) addActivity('⚡', `Subiste a nivel ${after}`, `${profile.xp} XP totales`);
    renderProfile();
    renderHomeStats();
    schedulePublicProfileSync();
  }
  function unlockAchievement(id, quiet = false) {
    if (profile.achievements.includes(id)) return false;
    profile.achievements.push(id);
    saveProfile();
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    if (achievement) {
      addActivity('🏅', `Logro: ${achievement.title}`, achievement.desc);
      if (!quiet) mostrarToast(`🏅 Logro desbloqueado: ${achievement.title}`);
      profile.xp += 60;
      saveProfile();
    }
    renderAchievements();
    renderHomeStats();
    schedulePublicProfileSync();
    return true;
  }

  function applyConfig() {
    const p = CONFIG.profile || {};
    const socials = CONFIG.socials || {};
    const setup = CONFIG.setup || {};
    const name = p.name || 'Rayito ⚡';
    const avatar = p.avatar || 'avatar.gif';
    const setText = (id, value) => { const el = document.getElementById(id); if (el && value != null) el.textContent = value; };
    const setSrc = (id, value) => { const el = document.getElementById(id); if (el && value) el.src = value; };
    setText('nombre-perfil', name);
    setText('brand-name', name.replace(/⚡/g,'').trim());
    setText('texto-bienvenida', p.welcome || 'Música, juegos y todo mi setup en un solo lugar.');
    setText('mundo-bienvenida', p.welcome || 'Música, juegos, competencia y mi setup en un solo lugar.');
    setSrc('mundo-avatar', avatar);
    // El perfil de Inicio pertenece a Rayito y es SOLO de presentación.
    // Nunca copiamos ese avatar al perfil editable de los visitantes.
    setSrc('avatar-principal', avatar);
    const links = [['link-tiktok',socials.tiktok],['link-youtube',socials.youtube],['link-spotify',socials.spotify]];
    links.forEach(([id, href]) => { const el=document.getElementById(id); if (el && href) el.href=href; });
    setText('spec-cpu', setup.cpu || 'Sin configurar');
    setText('spec-gpu', setup.gpu || 'Sin configurar');
    setText('spec-motherboard', setup.motherboard || 'Sin configurar');
    const monitors = document.getElementById('lista-monitores');
    if (monitors) monitors.innerHTML = (setup.monitors || []).map(m => `<li>${escapeHTML(m)}</li>`).join('');
    const peripherals = document.getElementById('lista-perifericos');
    if (peripherals) peripherals.innerHTML = (setup.peripherals || []).map(m => `<li>${escapeHTML(m)}</li>`).join('');
    const images = setup.images || {};
    [['spec-cpu','cpu'],['spec-gpu','gpu'],['spec-motherboard','motherboard']].forEach(([id,key]) => {
      const card = document.getElementById(id)?.closest('.setup-card');
      if (card && images[key]) { card.style.setProperty('--setup-image', `url("${String(images[key]).replace(/"/g,'\"')}")`); card.classList.add('has-setup-image'); }
    });
  }

  function escapeHTML(text='') {
    return String(text).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  }

  function navigate(section, updateHash = true) {
    const valid = ['inicio','musica','juegos','ranking','perfil','setup'];
    const target = valid.includes(section) ? section : 'inicio';
    document.querySelectorAll('.app-section').forEach(sec => {
      const active = sec.dataset.page === target;
      sec.hidden = !active;
      sec.classList.toggle('is-active', active);
    });
    document.querySelectorAll('[data-section]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.section === target));
    if (updateHash && location.hash !== `#${target}`) history.replaceState(null,'',`#${target}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (target === 'juegos') renderPersonalRecords();
    if (target === 'ranking') {
      renderRanking();
      renderCommunityChat();
      ensureSupabaseSession().then(startRankingRealtime).catch(() => {});
    }
    if (target === 'musica') { renderMusicLibrary(); if (songRequestDrawerOpen()) renderSongRequests(true).catch(() => {}); }
    if (target === 'perfil') renderProfile();
  }

  function renderHomeStats() {
    const vals = Object.values(records || {}).map(Number).filter(Number.isFinite);
    const best = vals.length ? Math.max(...vals) : 0;
    const info = levelInfo();
    const map = {
      'stat-partidas': profile.gamesPlayed || 0,
      'stat-mejor-record': best,
      'stat-nivel': info.level,
      'stat-logros': profile.achievements.length
    };
    Object.entries(map).forEach(([id,val]) => { const el=document.getElementById(id); if (el) el.textContent=val; });
  }
  function renderActivity() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    const activities = profile.activities.length ? profile.activities : [
      { icon:'⚡', title:'Rayito Hub listo', detail:'Jugá o escuchá música para empezar tu historial.' }
    ];
    feed.innerHTML = activities.slice(0,4).map(a => `<div class="activity-item"><span class="activity-icon">${escapeHTML(a.icon)}</span><div><strong>${escapeHTML(a.title)}</strong><span>${escapeHTML(a.detail)}</span></div></div>`).join('');
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function hashString(s) {
    let h=2166136261;
    for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
    return h >>> 0;
  }
  function getDailyChallenge() {
    const date = todayKey();
    const options = [
      {game:'snake', target:100, reward:150, title:'Serpiente eléctrica', text:'Conseguí 100 puntos en Snake.'},
      {game:'highway', target:500, reward:180, title:'Rey de la autopista', text:'Conseguí 500 puntos en Highway Rush.'},
      {game:'neon', target:350, reward:150, title:'Salto de neón', text:'Conseguí 350 puntos en Neon Jump.'},
      {game:'breakout', target:250, reward:170, title:'Muro demolido', text:'Conseguí 250 puntos en Rompeladrillos.'},
      {game:'cohete', target:200, reward:170, title:'Piloto espacial', text:'Conseguí 200 puntos en Cohete Espacial.'},
      {game:'penalty', target:150, reward:160, title:'Especialista desde los 12 pasos', text:'Conseguí 150 puntos en Penalty Master.'}
    ];
    return { date, ...options[hashString(date) % options.length] };
  }
  function getDailyState() {
    const challenge = getDailyChallenge();
    const stored = safeJSON(localStorage.getItem(DAILY_KEY), {});
    if (stored.date !== challenge.date) return { date:challenge.date, progress:0, completed:false };
    return stored;
  }
  function saveDailyState(state) { localStorage.setItem(DAILY_KEY, JSON.stringify(state)); scheduleAccountProgressSync(); }
  function renderDaily() {
    const c = getDailyChallenge(); const s = getDailyState();
    const pct = Math.min(100, Math.round((s.progress / c.target) * 100));
    const ids = {
      'daily-title': c.title, 'daily-description': c.text,
      'daily-progress-text': `${Math.min(s.progress,c.target)} / ${c.target}`,
      'daily-reward': s.completed ? 'COMPLETADO ✓' : `+${c.reward} XP`,
      'daily-date': new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'short'}).format(new Date())
    };
    Object.entries(ids).forEach(([id,val])=>{ const e=document.getElementById(id); if(e)e.textContent=val; });
    const bar=document.getElementById('daily-progress-bar'); if(bar)bar.style.width=`${pct}%`;
    const btn=document.getElementById('daily-play-button');
    if(btn){ btn.textContent=s.completed?'Desafío completado ✓':`Jugar ${GAME_LABELS[c.game]}`; btn.disabled=s.completed; btn.onclick=()=>openGame(c.game); }
  }
  function updateDaily(game, score) {
    const c=getDailyChallenge(); if(c.game!==game) return;
    const s=getDailyState(); if(s.completed) return;
    if(score>s.progress){ s.progress=score; }
    if(s.progress>=c.target){ s.completed=true; saveDailyState(s); unlockAchievement('daily', true); addXP(c.reward,'desafío diario',true); addActivity('☀️','Desafío diario completado',`${GAME_LABELS[game]} · ${score} puntos`); mostrarToast(`☀️ Desafío completado · +${c.reward} XP`); }
    else saveDailyState(s);
    renderDaily();
  }

  function onGameStart(game) {
    profile.gamesPlayed = (profile.gamesPlayed || 0) + 1;
    profile.gameStarts[game] = (profile.gameStarts[game] || 0) + 1;
    saveProfile();
    if (profile.gamesPlayed === 1) addActivity('🎮','Primera partida',`Empezaste ${GAME_LABELS[game] || game}`);
    unlockAchievement('first_game', true);
    if (Object.keys(profile.gameStarts).filter(g => profile.gameStarts[g] > 0).length >= 6) unlockAchievement('all_games');
    addXP(10,'partida iniciada',true);

    renderHomeStats(); renderProfile();
    schedulePublicProfileSync();
  }

  function onScore(game, score, wasNew) {
    score = Math.max(0, Math.round(Number(score)||0));
    saveLocalRanking(game, score);
    updateDaily(game, score);
    if (score >= 100) unlockAchievement('score_100');
    if (score >= 500) unlockAchievement('score_500');
    if (wasNew) {
      addXP(35,'nuevo récord',true);
      addActivity('🏆',`Nuevo récord en ${GAME_LABELS[game] || game}`,`${score} puntos`);
    }

    // SEGURIDAD: ya no existe ningún endpoint cliente que acepte un score crudo.
    // Solo se puede finalizar la sesión emitida al comenzar ESTA partida.
    if (score > 0 && globalEnabled() && isPermanentSession(readStoredSupabaseSession()) && secureGameSessions.has(game)) {
      finishSecureGameSession(game, score).then((ok) => {
        if (ok) renderRanking();
      });
    }

    renderHomeStats(); renderPersonalRecords(); renderRanking();
    schedulePublicProfileSync();
    scheduleAccountProgressSync();
  }

  function saveLocalRanking(game, score) {
    if (!game || !score) return;
    const name = (profile.name || 'Jugador').trim().slice(0,20) || 'Jugador';
    localRankings[game] ||= [];
    const existing = localRankings[game].find(x => x.playerId === profile.playerId);
    if (existing) {
      existing.name = name;
      existing.avatarPath = profile.avatarPath || '';
      existing.avatarVersion = profile.avatarVersion || 0;
      if (score > existing.score) { existing.score=score; existing.at=Date.now(); }
    } else {
      localRankings[game].push({
        playerId:profile.playerId,
        name,
        avatarPath:profile.avatarPath || '',
        avatarVersion:profile.avatarVersion || 0,
        score,
        at:Date.now()
      });
    }
    localRankings[game].sort((a,b)=>b.score-a.score);
    localRankings[game]=localRankings[game].slice(0,10);
    localStorage.setItem(LOCAL_RANKING_KEY,JSON.stringify(localRankings));
  }

  const SUPABASE_SESSION_KEY = 'rayito-supabase-session-v1';
  const AVATAR_BUCKET = 'rayito-avatars';
  const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
  const AVATAR_TYPES = new Map([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ]);
  let avatarPreviewObjectUrl = '';
  let avatarLocalObjectUrl = '';
  let avatarLocalBackupAt = 0;
  let pendingAvatarSyncPromise = null;
  let remoteProfileLoaded = false;
  let publicProfileSyncTimer = 0;
  let publicProfileOpenUserId = '';
  let supabaseSessionPromise = null;
  const secureGameSessions = new Map();
  const secureGameStartPromises = new Map();
  let lastSecurityNoticeAt = 0;

  // Ranking global en tiempo real. Usamos el WebSocket nativo de Supabase
  // y mantenemos un refresco suave como respaldo si Realtime se desconecta.
  let rankingRealtimeSocket = null;
  let rankingRealtimeHeartbeatId = 0;
  let rankingRealtimeReconnectId = 0;
  let rankingRealtimeRefreshId = 0;
  let homeRankingRenderSequence = 0;
  let rankingRealtimeRef = 0;
  let rankingRealtimeSessionToken = '';
  let rankingFallbackPollId = 0;
  let rankingRenderSequence = 0;

  // Chat público de la comunidad. Los mensajes viven en Supabase y el perfil
  // (nombre + avatar/GIF) siempre se resuelve desde rayito_profiles.
  let communityChatRefreshId = 0;
  let communityChatRenderSequence = 0;
  let communityChatSending = false;
  let communityChatCanWrite = false;
  let communityChatOwnProfile = null;

  // Pedidos de canciones: solo cuentas permanentes pueden enviar.
  // El estado aceptado/rechazado solo lo puede cambiar el Fundador, validado también en Supabase.
  let songRequestRefreshId = 0;
  let songRequestRenderSequence = 0;
  let songRequestSending = false;
  let songRequestCanWrite = false;
  let songRequestIsFounder = false;
  let songRequestOwnProfile = null;

  let accountProgressSyncTimer = 0;
  let accountProgressSyncBusy = false;
  let accountHydrating = false;
  let pendingRecoverySession = null;
  let pendingPasswordSetupMode = '';

  function globalConfig() { return CONFIG.globalRanking || {}; }

  function globalPublicKey() {
    const g = globalConfig();
    return String(g.publishableKey || g.anonKey || '').trim();
  }

  function globalEnabled() {
    const g = globalConfig();
    const key = globalPublicKey();
    return Boolean(
      g.enabled &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(g.supabaseUrl || '').trim()) &&
      key.length > 20
    );
  }

  function supabaseBase() {
    return String(globalConfig().supabaseUrl || '').trim().replace(/\/$/, '');
  }

  function publicSupabaseHeaders(extra = {}) {
    const key = globalPublicKey();
    return {
      apikey: key,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  function decodeJwtPayload(token) {
    try {
      const part = String(token || '').split('.')[1] || '';
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
    } catch { return {}; }
  }

  function sessionIsAnonymous(session) {
    if (!session?.access_token) return true;
    if (typeof session.user?.is_anonymous === 'boolean') return session.user.is_anonymous;
    const payload = decodeJwtPayload(session.access_token);
    if (typeof payload?.is_anonymous === 'boolean') return payload.is_anonymous;
    return !String(session.user?.email || payload?.email || '').trim();
  }

  function isPermanentSession(session = readStoredSupabaseSession()) {
    if (!session?.access_token || !session?.user?.id) return false;
    const payload = decodeJwtPayload(session.access_token);
    const email = String(session.user?.email || payload?.email || '').trim();
    return Boolean(email && !sessionIsAnonymous(session));
  }

  function currentAccountEmail(session = readStoredSupabaseSession()) {
    const payload = decodeJwtPayload(session?.access_token || '');
    return String(session?.user?.email || payload?.email || '').trim();
  }

  function readStoredSupabaseSession() {
    try {
      return JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function storeSupabaseSession(session) {
    if (!session?.access_token) return null;

    const tokenPayload = decodeJwtPayload(session.access_token);
    const email = String(session.user?.email || tokenPayload?.email || '').trim();
    const anonymous = typeof session.user?.is_anonymous === 'boolean'
      ? session.user.is_anonymous
      : (typeof tokenPayload?.is_anonymous === 'boolean' ? tokenPayload.is_anonymous : !email);

    const stored = {
      access_token: session.access_token,
      refresh_token: session.refresh_token || '',
      expires_at:
        Number(session.expires_at) ||
        Math.floor(Date.now() / 1000) + (Number(session.expires_in) || 3600),
      user: session.user?.id || tokenPayload?.sub ? {
        id: session.user?.id || tokenPayload?.sub,
        email,
        is_anonymous: Boolean(anonymous),
      } : null,
    };

    localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(stored));

    if (stored.user?.id) {
      const nextUserId = stored.user.id;
      const previousGlobalId = String(profile.globalPlayerId || '');

      if (
        previousGlobalId &&
        previousGlobalId !== nextUserId &&
        profile.avatarPath &&
        !String(profile.avatarPath).startsWith(`${nextUserId}/`)
      ) {
        // No eliminamos la copia local del avatar. Si el usuario acaba de iniciar
        // sesión en una cuenta nueva, se migrará desde IndexedDB a su nuevo UUID.
        profile.avatarPath = '';
        profile.avatarVersion = 0;
        remoteProfileLoaded = false;
      }

      profile.globalPlayerId = nextUserId;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }

    renderAccountState?.();
    return stored;
  }

  async function refreshSupabaseSession(session) {
    if (!session?.refresh_token) return null;

    const res = await fetch(`${supabaseBase()}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: publicSupabaseHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!res.ok) return null;

    const next = await res.json();
    return storeSupabaseSession(next);
  }

  async function createAnonymousSupabaseSession() {
    const res = await fetch(`${supabaseBase()}/auth/v1/signup`, {
      method: 'POST',
      headers: publicSupabaseHeaders(),
      body: JSON.stringify({
        data: { app: 'rayito-hub' },
        gotrue_meta_security: { captcha_token: null },
      }),
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload?.access_token) {
      const detail = payload?.msg || payload?.message || payload?.error_description || payload?.error || `HTTP ${res.status}`;
      throw new Error(`Supabase Auth: ${detail}`);
    }

    return storeSupabaseSession(payload);
  }

  async function ensureSupabaseSession() {
    if (!globalEnabled()) return null;

    const existing = readStoredSupabaseSession();
    const now = Math.floor(Date.now() / 1000);

    if (
      existing?.access_token &&
      Number(existing.expires_at) > now + 90
    ) {
      if (existing.user?.id && profile.globalPlayerId !== existing.user.id) {
        const previousGlobalId = profile.globalPlayerId || '';
        profile.globalPlayerId = existing.user.id;
        // Un avatar guardado bajo otro UUID no puede reutilizarse como escritura
        // del nuevo usuario. Lo conservamos solo si pertenece al UUID actual.
        if (profile.avatarPath && !String(profile.avatarPath).startsWith(`${existing.user.id}/`)) {
          profile.avatarPath = '';
          profile.avatarVersion = 0;
          if (previousGlobalId) setTimeout(() => mostrarToast('Tu sesión de jugador cambió. Volvé a subir tu avatar una vez.'), 600);
        }
        saveProfile();
      }
      return existing;
    }

    if (supabaseSessionPromise) return supabaseSessionPromise;

    supabaseSessionPromise = (async () => {
      let session = existing;

      try {
        const refreshed = await refreshSupabaseSession(session);
        if (refreshed) return refreshed;
      } catch (err) {
        console.warn('Supabase refresh:', err);
      }

      localStorage.removeItem(SUPABASE_SESSION_KEY);
      return createAnonymousSupabaseSession();
    })();

    try {
      return await supabaseSessionPromise;
    } finally {
      supabaseSessionPromise = null;
    }
  }


  function authRedirectUrl() {
    const configured = String(globalConfig().authRedirectUrl || '').trim();
    if (/^https:\/\//i.test(configured)) return configured.replace(/#.*$/, '');
    if (!/^https?:$/.test(location.protocol)) return '';
    return `${location.origin}${location.pathname}`;
  }

  function authEndpoint(path, includeRedirect = false) {
    let url = `${supabaseBase()}/auth/v1/${path}`;
    const redirect = includeRedirect ? authRedirectUrl() : '';
    if (redirect) url += `${url.includes('?') ? '&' : '?'}redirect_to=${encodeURIComponent(redirect)}`;
    return url;
  }

  async function authPayloadError(res, payload = null) {
    const body = payload || await res.json().catch(() => null);
    const detail = body?.msg || body?.message || body?.error_description || body?.error || `HTTP ${res.status}`;
    return String(detail || 'Error de autenticación').slice(0, 220);
  }

  async function stageGuestProgressForUpgrade(session) {
    if (!session?.access_token || !session?.user?.id || !sessionIsAnonymous(session)) return false;
    try {
      const result = await rpcAuthenticated(session, 'stage_rayito_guest_progress', { p_progress: buildAccountProgressSnapshot() });
      return Boolean(result?.ok);
    } catch (err) {
      console.warn('Preparar progreso invitado:', err);
      return false;
    }
  }

  async function signUpPermanentAccount(email) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const session = await ensureSupabaseSession();
    if (!session?.access_token || !session?.user?.id) throw new Error('No se pudo iniciar el modo invitado.');
    if (isPermanentSession(session)) throw new Error('Ya tenés una cuenta conectada.');

    // Guardamos una copia de migración bajo el UUID invitado ANTES de enviar el
    // correo. Así el progreso se conserva incluso si el enlace se abre en otro navegador.
    await stageGuestProgressForUpgrade(session);

    const res = await fetch(authEndpoint('user', true), {
      method: 'PUT',
      headers: publicSupabaseHeaders({ Authorization: `Bearer ${session.access_token}` }),
      body: JSON.stringify({ email: cleanEmail }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(await authPayloadError(res, payload));

    localStorage.setItem(PENDING_ACCOUNT_EMAIL_KEY, cleanEmail);

    // Si el proyecto no exige confirmación de email, el refresh ya puede devolver
    // un JWT permanente. Si exige confirmación, mantenemos el invitado hasta que
    // el usuario abra el enlace recibido por correo.
    let refreshed = null;
    try { refreshed = await refreshSupabaseSession(session); } catch {}
    if (refreshed && isPermanentSession(refreshed)) {
      pendingRecoverySession = refreshed;
      pendingPasswordSetupMode = 'signup';
      openAccountModal('new-password');
      return { session: refreshed, confirmationRequired: false, needsPassword: true };
    }

    return { session, confirmationRequired: true, email: cleanEmail };
  }

  async function signInPermanentAccount(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const res = await fetch(`${supabaseBase()}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: publicSupabaseHeaders(),
      body: JSON.stringify({ email: cleanEmail, password }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.access_token) throw new Error(await authPayloadError(res, payload));
    const session = storeSupabaseSession(payload);
    if (!isPermanentSession(session)) throw new Error('La cuenta todavía no está confirmada. Revisá tu correo.');
    await afterPermanentLogin(session, { firstLogin: false });
    return session;
  }

  async function requestPasswordRecovery(email) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const res = await fetch(authEndpoint('recover', true), {
      method: 'POST', headers: publicSupabaseHeaders(), body: JSON.stringify({ email: cleanEmail }),
    });
    if (!res.ok) throw new Error(await authPayloadError(res));
    return true;
  }

  async function fetchAuthUser(accessToken) {
    const res = await fetch(`${supabaseBase()}/auth/v1/user`, {
      headers: publicSupabaseHeaders({ Authorization: `Bearer ${accessToken}` }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.id) throw new Error(await authPayloadError(res, payload));
    return payload;
  }

  async function updateRecoveryPassword(password) {
    const session = pendingRecoverySession || readStoredSupabaseSession();
    if (!session?.access_token) throw new Error('El enlace de recuperación ya no es válido.');
    const creatingAccount = pendingPasswordSetupMode === 'signup';
    const res = await fetch(`${supabaseBase()}/auth/v1/user`, {
      method: 'PUT',
      headers: publicSupabaseHeaders({ Authorization: `Bearer ${session.access_token}` }),
      body: JSON.stringify({ password }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(await authPayloadError(res, payload));
    pendingRecoverySession = null;
    pendingPasswordSetupMode = '';
    localStorage.removeItem(PENDING_ACCOUNT_EMAIL_KEY);
    await afterPermanentLogin(readStoredSupabaseSession(), { firstLogin: creatingAccount });
    return true;
  }

  async function signOutPermanentAccount() {
    const old = readStoredSupabaseSession();
    if (old?.access_token) {
      fetch(`${supabaseBase()}/auth/v1/logout`, {
        method: 'POST', headers: publicSupabaseHeaders({ Authorization: `Bearer ${old.access_token}` }),
      }).catch(() => {});
    }

    if (accountProgressSyncTimer) { clearTimeout(accountProgressSyncTimer); accountProgressSyncTimer = 0; }
    stopRankingRealtime();
    localStorage.removeItem(SUPABASE_SESSION_KEY);
    remoteProfileLoaded = false;
    secureGameSessions.clear(); secureGameStartPromises.clear();

    // El progreso de la cuenta ya quedó en Supabase. Limpiamos solo los datos
    // competitivos locales para que la próxima persona use un invitado limpio.
    profile = defaultProfile();
    profile.peripherals = sanitizePeripherals({});
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    localStorage.removeItem(DAILY_KEY);
    localStorage.removeItem(LOCAL_RANKING_KEY);
    localStorage.removeItem('rayito-records-v2');
    try { records = {}; } catch {}
    localRankings = {};
    await clearLocalAvatarBackup().catch(() => {});

    const guest = await createAnonymousSupabaseSession();
    startRankingRealtime(guest);
    renderAllAccountDependentUI();
    await renderRanking().catch(() => {});
    mostrarToast('Sesión cerrada · ahora estás como invitado');
    return guest;
  }

  function buildAccountProgressSnapshot() {
    const rawRecords = safeJSON(localStorage.getItem('rayito-records-v2'), {});
    const cleanRecords = {};
    Object.keys(GAME_LABELS).forEach(game => {
      cleanRecords[game] = Math.max(0, Math.min(100000000, Math.round(Number(rawRecords?.[game]) || 0)));
    });
    const rawDaily = safeJSON(localStorage.getItem(DAILY_KEY), {});
    const daily = {
      date: String(rawDaily?.date || '').slice(0, 20),
      progress: Math.max(0, Math.min(100000000, Math.round(Number(rawDaily?.progress) || 0))),
      completed: Boolean(rawDaily?.completed),
    };
    return {
      version: 1,
      xp: Math.max(0, Math.min(999999999, Math.round(Number(profile.xp) || 0))),
      gamesPlayed: Math.max(0, Math.min(999999999, Math.round(Number(profile.gamesPlayed) || 0))),
      gameStarts: Object.fromEntries(Object.keys(GAME_LABELS).map(g => [g, Math.max(0, Math.min(9999999, Math.round(Number(profile.gameStarts?.[g]) || 0)))])),
      achievements: Array.isArray(profile.achievements) ? profile.achievements.filter(id => ACHIEVEMENTS.some(a => a.id === id)).slice(0, ACHIEVEMENTS.length) : [],
      favorites: Array.isArray(profile.favorites) ? profile.favorites.map(String).slice(0, 200) : [],
      trackPlays: Math.max(0, Math.min(999999999, Math.round(Number(profile.trackPlays) || 0))),
      activities: Array.isArray(profile.activities) ? profile.activities.slice(0, 5).map(a => ({
        icon: String(a?.icon || '').slice(0, 8), title: String(a?.title || '').slice(0, 80),
        detail: String(a?.detail || '').slice(0, 120), at: Math.max(0, Number(a?.at) || 0),
      })) : [],
      records: cleanRecords,
      daily: daily,
      profileDraft: {
        name: String(profile.name || 'Jugador').trim().replace(/\s+/g,' ').slice(0,20),
        peripherals: sanitizePeripherals(profile.peripherals),
      },
      clientUpdatedAt: Date.now(),
    };
  }

  function normalizeAccountProgress(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const cleanRecords = {};
    Object.keys(GAME_LABELS).forEach(game => {
      cleanRecords[game] = Math.max(0, Math.min(100000000, Math.round(Number(source.records?.[game]) || 0)));
    });
    const starts = {};
    Object.keys(GAME_LABELS).forEach(game => starts[game] = Math.max(0, Math.min(9999999, Math.round(Number(source.gameStarts?.[game]) || 0))));
    return {
      xp: Math.max(0, Math.min(999999999, Math.round(Number(source.xp) || 0))),
      gamesPlayed: Math.max(0, Math.min(999999999, Math.round(Number(source.gamesPlayed) || 0))),
      gameStarts: starts,
      achievements: Array.isArray(source.achievements) ? source.achievements.filter(id => ACHIEVEMENTS.some(a => a.id === id)).slice(0, ACHIEVEMENTS.length) : [],
      favorites: Array.isArray(source.favorites) ? source.favorites.map(String).slice(0, 200) : [],
      trackPlays: Math.max(0, Math.min(999999999, Math.round(Number(source.trackPlays) || 0))),
      activities: Array.isArray(source.activities) ? source.activities.slice(0, 5).map(a => ({
        icon: String(a?.icon || '').slice(0, 8), title: String(a?.title || '').slice(0, 80),
        detail: String(a?.detail || '').slice(0, 120), at: Math.max(0, Number(a?.at) || 0),
      })) : [],
      records: cleanRecords,
      daily: {
        date: String(source.daily?.date || '').slice(0,20),
        progress: Math.max(0, Math.min(100000000, Math.round(Number(source.daily?.progress) || 0))),
        completed: Boolean(source.daily?.completed),
      },
      profileDraft: {
        name: String(source.profileDraft?.name || 'Jugador').trim().replace(/\s+/g,' ').slice(0,20),
        peripherals: sanitizePeripherals(source.profileDraft?.peripherals || {}),
      },
    };
  }

  async function fetchRemoteAccountProgress(session) {
    if (!isPermanentSession(session)) return null;
    const url = `${supabaseBase()}/rest/v1/${ACCOUNT_PROGRESS_TABLE}?select=user_id,progress,updated_at&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`;
    const res = await fetch(url, { headers: publicSupabaseHeaders({ Authorization: `Bearer ${session.access_token}` }), cache: 'no-store' });
    if (!res.ok) throw new Error(`Progreso ${res.status}: ${(await res.text().catch(() => '')).slice(0,180)}`);
    const rows = await res.json();
    return rows?.[0] || null;
  }

  async function saveRemoteAccountProgress(session, snapshot = buildAccountProgressSnapshot()) {
    if (!isPermanentSession(session)) return false;
    const url = `${supabaseBase()}/rest/v1/${ACCOUNT_PROGRESS_TABLE}?on_conflict=user_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: publicSupabaseHeaders({ Authorization: `Bearer ${session.access_token}`, Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ user_id: session.user.id, progress: snapshot, updated_at: new Date().toISOString() }),
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new Error(`Progreso ${res.status}: ${(await res.text().catch(() => '')).slice(0,180)}`);
    localStorage.setItem(ACCOUNT_SYNC_STAMP_KEY, String(Date.now()));
    return true;
  }

  function applyRemoteAccountProgress(value) {
    const data = normalizeAccountProgress(value);
    accountHydrating = true;
    try {
      profile.xp = data.xp;
      profile.gamesPlayed = data.gamesPlayed;
      profile.gameStarts = data.gameStarts;
      profile.achievements = data.achievements;
      profile.favorites = data.favorites;
      profile.trackPlays = data.trackPlays;
      profile.activities = data.activities;
      const draftName = String(data.profileDraft?.name || '').trim();
      if (draftName.length >= 2 && draftName.toLowerCase() !== 'jugador') profile.name = draftName;
      profile.peripherals = sanitizePeripherals(data.profileDraft?.peripherals || profile.peripherals || {});
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      localStorage.setItem('rayito-records-v2', JSON.stringify(data.records));
      localStorage.setItem(DAILY_KEY, JSON.stringify(data.daily));
      try { records = { ...data.records }; actualizarRecordsUI(); } catch {}
    } finally {
      accountHydrating = false;
    }
    renderHomeStats(); renderActivity(); renderDaily(); renderProfile(); renderPersonalRecords();
  }

  async function hydrateAccountProgress(session, { migrateLocalIfEmpty = true } = {}) {
    if (!isPermanentSession(session)) return false;
    accountHydrating = true;
    try {
      const remote = await fetchRemoteAccountProgress(session);
      if (remote?.progress && Object.keys(remote.progress || {}).length) {
        applyRemoteAccountProgress(remote.progress);
        return true;
      }
      if (migrateLocalIfEmpty) {
        await saveRemoteAccountProgress(session, buildAccountProgressSnapshot());
        return true;
      }
      return false;
    } finally {
      accountHydrating = false;
    }
  }

  function scheduleAccountProgressSync(delay = 900) {
    if (accountHydrating) return;
    const session = readStoredSupabaseSession();
    if (!isPermanentSession(session)) return;
    if (accountProgressSyncTimer) clearTimeout(accountProgressSyncTimer);
    accountProgressSyncTimer = setTimeout(() => {
      accountProgressSyncTimer = 0;
      syncAccountProgressNow().catch(err => console.warn('Sync progreso:', err));
    }, Math.max(250, delay));
  }

  async function syncAccountProgressNow() {
    if (accountProgressSyncBusy) return false;
    accountProgressSyncBusy = true;
    try {
      const session = await ensureSupabaseSession();
      if (!isPermanentSession(session)) return false;
      await saveRemoteAccountProgress(session);
      const cleanName = String(profile.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
      if (cleanName.length >= 2 && cleanName.toLowerCase() !== 'jugador') {
        await saveRemotePlayerProfile(session, cleanName, ownedAvatarPathForSession(session), profile.peripherals, buildPublicStats()).catch(() => {});
      }
      return true;
    } finally { accountProgressSyncBusy = false; }
  }

  async function afterPermanentLogin(session, { firstLogin = false } = {}) {
    if (!isPermanentSession(session)) return false;
    remoteProfileLoaded = false;
    // Si la cuenta ya tenía progreso, gana la nube. Si es nueva, migramos lo que
    // el visitante consiguió antes de registrarse.
    try {
      await hydrateAccountProgress(session, { migrateLocalIfEmpty: true });
    } catch (err) {
      console.warn('Progreso de cuenta pendiente:', err);
    }

    let remoteProfile = null;
    try {
      remoteProfile = await fetchRemotePlayerProfile(session);
      if (remoteProfile) {
        profile.globalPlayerId = remoteProfile.user_id;
        if (remoteProfile.display_name) profile.name = String(remoteProfile.display_name).slice(0,20);
        profile.avatarPath = remoteProfile.avatar_path || '';
        profile.peripherals = sanitizePeripherals(remoteProfile.peripherals || {});
        profile.avatarVersion = remoteProfile.updated_at ? Date.parse(remoteProfile.updated_at) || Date.now() : Date.now();
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      } else {
        const localName = String(profile.name || '').trim().replace(/\s+/g,' ').slice(0,20);
        if (localName.length >= 2 && localName.toLowerCase() !== 'jugador') {
          remoteProfile = await saveRemotePlayerProfile(session, localName, null, profile.peripherals, buildPublicStats());
        }
      }
      remoteProfileLoaded = true;
    } catch (err) { console.warn('Migrar perfil a cuenta:', err); }

    // Solo migramos el avatar local cuando esta sesión acaba de convertirse
    // desde invitado o cuando la cuenta todavía no tenía Perfil remoto. Al
    // iniciar sesión en una cuenta existente, la nube gana y no se pisa su
    // avatar con una foto temporal del invitado de este navegador.
    if (firstLogin || !remoteProfile) {
      try { await syncPendingLocalAvatarToSupabase(session, { force: firstLogin }); } catch {}
    }
    startRankingRealtime(session);
    schedulePublicProfileSync(120);
    renderAllAccountDependentUI();
    await renderRanking().catch(() => {});
    await renderCommunityChat(true).catch(() => {});
    return true;
  }

  function renderAllAccountDependentUI() {
    renderAccountState(); renderProfile(); renderHomeStats(); renderActivity(); renderDaily();
    renderPersonalRecords(); renderCommunityChat(true).catch(() => {});
  }

  function setAccountFormStatus(id, message, kind = '') {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = String(message || '');
    el.className = `account-form-status${kind ? ` is-${kind}` : ''}`;
  }

  function showAccountView(view = 'menu') {
    document.querySelectorAll('[data-account-view]').forEach(el => { el.hidden = el.dataset.accountView !== view; });
    const title = document.getElementById('account-dialog-title');
    if (title) title.textContent = view === 'signup' ? 'Crear cuenta' : view === 'login' ? 'Iniciar sesión' : view === 'recover' ? 'Recuperar contraseña' : view === 'new-password' ? (pendingPasswordSetupMode === 'signup' ? 'Crear contraseña' : 'Nueva contraseña') : 'Cuenta';
    if (view === 'new-password') {
      const h = document.getElementById('new-password-title');
      const c = document.getElementById('new-password-copy');
      if (h) h.textContent = pendingPasswordSetupMode === 'signup' ? 'Creá tu contraseña' : 'Nueva contraseña';
      if (c) c.textContent = pendingPasswordSetupMode === 'signup'
        ? 'Tu correo ya está verificado. Elegí la contraseña con la que vas a volver a entrar.'
        : 'Escribí la nueva contraseña de tu cuenta.';
    }
  }

  function openAccountModal(view = 'menu') {
    const modal = document.getElementById('account-modal'); if (!modal) return;
    renderAccountState(); showAccountView(view); modal.hidden = false; document.body.classList.add('modal-open');
  }

  function closeAccountModal() {
    const modal = document.getElementById('account-modal'); if (!modal) return;
    if (pendingRecoverySession) return; // La recuperación debe terminar antes de cerrar.
    modal.hidden = true; document.body.classList.remove('modal-open');
  }

  function renderAccountState() {
    const session = readStoredSupabaseSession();
    const permanent = isPermanentSession(session);
    const email = currentAccountEmail(session);
    const state = document.getElementById('mundo-account-state');
    const copy = document.getElementById('mundo-account-copy');
    const guestActions = document.getElementById('mundo-account-guest-actions');
    const connected = document.getElementById('mundo-account-connected');
    const connectedEmail = document.getElementById('mundo-account-email');
    const enter = document.getElementById('mundo-enter-button');
    const chip = document.getElementById('account-chip');
    const chipText = document.getElementById('account-chip-text');
    const menuGuest = document.getElementById('account-menu-guest');
    const menuUser = document.getElementById('account-menu-user');
    const statusLabel = document.getElementById('account-status-label');
    const statusValue = document.getElementById('account-status-value');
    const statusDetail = document.getElementById('account-status-detail');
    const statusIcon = document.getElementById('account-status-icon');

    if (state) { state.classList.toggle('is-connected', permanent); state.innerHTML = permanent ? '<i></i> CUENTA' : '<i></i> INVITADO'; }
    if (copy) copy.textContent = permanent ? 'Tu cuenta está conectada. Tu progreso competitivo se guarda automáticamente.' : 'Podés mirar y jugar sin registrarte. Para competir y guardar todo, creá tu cuenta.';
    if (guestActions) guestActions.hidden = permanent;
    if (connected) connected.hidden = !permanent;
    if (connectedEmail) connectedEmail.textContent = email || 'Cuenta conectada';
    if (enter) enter.innerHTML = permanent ? 'Entrar <span>→</span>' : 'Entrar como invitado <span>→</span>';
    if (chip) chip.classList.toggle('is-connected', permanent);
    if (chipText) chipText.textContent = permanent ? (profile.name && profile.name !== 'Jugador' ? profile.name : 'Mi cuenta') : 'Invitado';
    if (menuGuest) menuGuest.hidden = permanent;
    if (menuUser) menuUser.hidden = !permanent;
    if (statusLabel) statusLabel.textContent = permanent ? 'CUENTA CONECTADA' : 'MODO INVITADO';
    if (statusValue) statusValue.textContent = permanent ? (email || 'Cuenta Rayito Hub') : 'Entraste sin cuenta';
    if (statusDetail) statusDetail.textContent = permanent ? 'Ranking, chat, perfil público y progreso en la nube están habilitados.' : 'Podés explorar y jugar. Para competir y guardar tu progreso necesitás una cuenta.';
    if (statusIcon) statusIcon.textContent = permanent ? '☁️' : '👤';
  }

  async function handleAuthCallbackFromUrl() {
    const hash = String(location.hash || '');
    if (!hash.includes('access_token=')) return false;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || '';
    const type = params.get('type') || '';
    const expiresIn = Number(params.get('expires_in')) || 3600;
    if (!accessToken) return false;
    history.replaceState(null, '', `${location.pathname}${location.search}#inicio`);
    try {
      const user = await fetchAuthUser(accessToken);
      const session = storeSupabaseSession({ access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user });
      if (type === 'recovery') {
        pendingRecoverySession = session;
        pendingPasswordSetupMode = 'recovery';
        openAccountModal('new-password');
      } else if (isPermanentSession(session)) {
        const pendingEmail = String(localStorage.getItem(PENDING_ACCOUNT_EMAIL_KEY) || '').trim().toLowerCase();
        const sessionEmail = currentAccountEmail(session).toLowerCase();
        if (type === 'email_change' || type === 'signup' || (pendingEmail && pendingEmail === sessionEmail)) {
          pendingRecoverySession = session;
          pendingPasswordSetupMode = 'signup';
          openAccountModal('new-password');
        } else {
          await afterPermanentLogin(session, { firstLogin: false });
          mostrarToast('Cuenta confirmada');
        }
      }
      return true;
    } catch (err) {
      console.warn('Callback Auth:', err); return false;
    }
  }


  function openLocalAvatarDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { resolve(null); return; }
      const request = indexedDB.open(LOCAL_AVATAR_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_AVATAR_STORE)) {
          db.createObjectStore(LOCAL_AVATAR_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB no disponible'));
    });
  }

  async function saveLocalAvatarBackup(file) {
    if (!file) return false;
    try {
      const db = await openLocalAvatarDb();
      if (!db) return false;
      const updatedAt = Date.now();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_AVATAR_STORE, 'readwrite');
        tx.objectStore(LOCAL_AVATAR_STORE).put({
          blob: file,
          type: String(file.type || ''),
          updatedAt,
        }, LOCAL_AVATAR_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el avatar local'));
        tx.onabort = () => reject(tx.error || new Error('Guardado local cancelado'));
      });
      db.close();
      avatarLocalBackupAt = updatedAt;
      if (avatarLocalObjectUrl) {
        try { URL.revokeObjectURL(avatarLocalObjectUrl); } catch {}
      }
      avatarLocalObjectUrl = URL.createObjectURL(file);
      return true;
    } catch (err) {
      console.warn('Backup local de avatar:', err);
      return false;
    }
  }

  async function readLocalAvatarBackupRecord() {
    const db = await openLocalAvatarDb();
    if (!db) return null;
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_AVATAR_STORE, 'readonly');
        const request = tx.objectStore(LOCAL_AVATAR_STORE).get(LOCAL_AVATAR_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('No se pudo leer el avatar local'));
      });
    } finally {
      db.close();
    }
  }

  async function clearLocalAvatarBackup() {
    try {
      const db = await openLocalAvatarDb();
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(LOCAL_AVATAR_STORE, 'readwrite');
          tx.objectStore(LOCAL_AVATAR_STORE).delete(LOCAL_AVATAR_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('No se pudo limpiar el avatar local'));
          tx.onabort = () => reject(tx.error || new Error('Limpieza cancelada'));
        });
        db.close();
      }
    } finally {
      avatarLocalBackupAt = 0;
      if (avatarLocalObjectUrl) { try { URL.revokeObjectURL(avatarLocalObjectUrl); } catch {} }
      avatarLocalObjectUrl = '';
      if (avatarPreviewObjectUrl) { try { URL.revokeObjectURL(avatarPreviewObjectUrl); } catch {} }
      avatarPreviewObjectUrl = '';
    }
  }

  async function restoreLocalAvatarBackup() {
    try {
      const record = await readLocalAvatarBackupRecord();
      if (!record?.blob) return false;
      if (avatarLocalObjectUrl) {
        try { URL.revokeObjectURL(avatarLocalObjectUrl); } catch {}
      }
      avatarLocalObjectUrl = URL.createObjectURL(record.blob);
      avatarLocalBackupAt = Number(record.updatedAt) || 0;
      renderProfile();
      return true;
    } catch (err) {
      console.warn('Restaurar avatar local:', err);
      return false;
    }
  }


  function encodeStoragePath(path = '') {
    return String(path)
      .split('/')
      .filter(Boolean)
      .map(part => encodeURIComponent(part))
      .join('/');
  }

  function avatarPublicUrl(path = '', version = 0) {
    const clean = String(path || '').trim();
    if (!clean || !globalEnabled()) return '';
    const base = `${supabaseBase()}/storage/v1/object/public/${AVATAR_BUCKET}/${encodeStoragePath(clean)}`;
    return version ? `${base}?v=${encodeURIComponent(String(version))}` : base;
  }

  function currentPlayerAvatarUrl() {
    if (avatarPreviewObjectUrl) return avatarPreviewObjectUrl;

    // Si el usuario eligió una foto más nueva que la última confirmada por Supabase,
    // conservamos la copia local persistente hasta que el servidor la confirme.
    if (avatarLocalObjectUrl && avatarLocalBackupAt > (Number(profile.avatarVersion) || 0)) {
      return avatarLocalObjectUrl;
    }

    if (profile.avatarPath) return avatarPublicUrl(profile.avatarPath, profile.avatarVersion);
    if (avatarLocalObjectUrl) return avatarLocalObjectUrl;
    return PLAYER_DEFAULT_AVATAR;
  }

  function rankingAvatarMarkup(row, className) {
    const initials = escapeHTML(playerInitials(row?.name || 'Jugador'));
    const isCurrentPlayer = Boolean(
      row?.playerId &&
      (row.playerId === profile.globalPlayerId || row.playerId === profile.playerId)
    );
    const avatarPath = row?.avatarPath || (isCurrentPlayer ? profile.avatarPath : '') || '';
    const avatarVersion = row?.avatarVersion || (isCurrentPlayer ? profile.avatarVersion : 0) || 0;
    const url = avatarPath ? avatarPublicUrl(avatarPath, avatarVersion) : '';

    if (url) {
      return `<span class="${className} has-image"><span class="ranking-avatar-fallback">${initials}</span><img src="${escapeHTML(url)}" alt="Avatar de ${escapeHTML(row?.name || 'Jugador')}" loading="eager" decoding="async" data-ranking-avatar="1"></span>`;
    }

    return `<span class="${className}"><span class="ranking-avatar-fallback">${initials}</span></span>`;
  }

  async function fetchRemotePlayerProfile(session) {
    if (!session?.access_token || !session?.user?.id) return null;

    const url =
      `${supabaseBase()}/rest/v1/rayito_profiles` +
      `?select=user_id,display_name,avatar_path,community_role,peripherals,public_stats,updated_at` +
      `&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`;

    const res = await fetch(url, {
      headers: publicSupabaseHeaders({
        Authorization: `Bearer ${session.access_token}`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Perfil ${res.status}: ${detail.slice(0, 200)}`);
    }

    const rows = await res.json();
    return rows?.[0] || null;
  }


  async function saveRemotePlayerProfile(session, displayName, avatarPath = profile.avatarPath || null, peripherals = profile.peripherals, publicStats = buildPublicStats()) {
    if (!session?.access_token || !session?.user?.id) throw new Error('Sesión de jugador no disponible.');
    if (!isPermanentSession(session)) throw new Error('account_required');

    const userId = String(session.user.id || '');
    const cleanName = String(displayName || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (cleanName.length < 2 || cleanName.toLowerCase() === 'jugador') {
      throw new Error('Elegí un nombre de jugador válido.');
    }

    // Nunca enviamos una ruta de avatar de otro UUID. Las policies RLS vuelven
    // a comprobarlo en Supabase, así que el navegador no puede escribir perfiles ajenos.
    let safeAvatarPath = String(avatarPath || '').trim();
    if (safeAvatarPath && !safeAvatarPath.startsWith(`${userId}/`)) {
      safeAvatarPath = '';
      profile.avatarPath = '';
      profile.avatarVersion = 0;
    }

    const safePeripherals = sanitizePeripherals(peripherals);
    const safePublicStats = normalizePublicStats(publicStats);

    const url = `${supabaseBase()}/rest/v1/rayito_profiles?on_conflict=user_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: publicSupabaseHeaders({
        Authorization: `Bearer ${session.access_token}`,
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify({
        user_id: userId,
        display_name: cleanName,
        avatar_path: safeAvatarPath || null,
        peripherals: safePeripherals,
        public_stats: safePublicStats,
        updated_at: new Date().toISOString(),
      }),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });

    const detail = await res.text().catch(() => '');
    if (!res.ok) {
      let message = detail;
      try {
        const parsed = JSON.parse(detail || '{}');
        message = parsed?.message || parsed?.details || parsed?.hint || parsed?.code || detail;
      } catch {}
      throw new Error(`Perfil Supabase ${res.status}: ${String(message || 'error desconocido').slice(0, 220)}`);
    }

    let rows = [];
    try { rows = JSON.parse(detail || '[]'); } catch {}
    const row = Array.isArray(rows) ? rows[0] : rows;
    profile.globalPlayerId = userId;
    if (row?.avatar_path !== undefined) profile.avatarPath = row.avatar_path || '';
    if (row?.peripherals !== undefined) profile.peripherals = sanitizePeripherals(row.peripherals);
    if (row?.updated_at) profile.avatarVersion = Date.parse(row.updated_at) || Date.now();
    saveProfile();
    return row || { user_id: userId, display_name: cleanName, avatar_path: safeAvatarPath || null, peripherals: safePeripherals, public_stats: safePublicStats };
  }

  async function ensureRemotePlayerProfile(force = false) {
    if (!globalEnabled()) return null;
    if (remoteProfileLoaded && !force) return readStoredSupabaseSession();

    const session = await ensureSupabaseSession();
    if (!session?.access_token || !session?.user?.id) return null;
    if (!isPermanentSession(session)) { remoteProfileLoaded = true; return session; }

    const row = await fetchRemotePlayerProfile(session);

    if (row) {
      profile.globalPlayerId = row.user_id;
      if (row.display_name) profile.name = String(row.display_name).slice(0, 20);
      profile.avatarPath = row.avatar_path || '';
      profile.peripherals = sanitizePeripherals(row.peripherals);
      profile.avatarVersion = row.updated_at ? Date.parse(row.updated_at) || Date.now() : Date.now();
      saveProfile();
    } else {
      // No creamos perfiles "Jugador" automáticamente. Para competir globalmente
      // el visitante debe elegir y guardar un nombre propio desde Perfil.
      profile.globalPlayerId = session.user.id;
      saveProfile();
    }

    remoteProfileLoaded = true;
    renderProfile();
    if (row) schedulePublicProfileSync(300);
    return session;
  }

  async function uploadPlayerAvatar(file, suppliedSession = null, { silent = false } = {}) {
    if (!file) return false;

    if (!globalEnabled()) {
      mostrarToast('Activá Supabase para guardar el avatar global.');
      return false;
    }

    const cleanPlayerName = String(profile.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (cleanPlayerName.length < 2 || cleanPlayerName.toLowerCase() === 'jugador') {
      mostrarToast('Primero elegí y guardá tu nombre de jugador.');
      return false;
    }

    const extension = AVATAR_TYPES.get(String(file.type || '').toLowerCase());
    if (!extension) {
      mostrarToast('Formato no permitido. Usá PNG, JPG, WebP o GIF.');
      return false;
    }

    if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
      mostrarToast('La foto/GIF debe pesar como máximo 8 MB.');
      return false;
    }

    const status = document.getElementById('profile-avatar-status');
    const chooseButton = document.getElementById('choose-player-avatar');
    if (!silent && status) status.textContent = 'Subiendo avatar…';
    if (!silent && chooseButton) chooseButton.disabled = true;

    try {
      const session = suppliedSession?.access_token ? suppliedSession : await ensureSupabaseSession();
      if (!session?.access_token || !session?.user?.id) throw new Error('No se pudo identificar al jugador.');
      if (!isPermanentSession(session)) throw new Error('Creá una cuenta para publicar tu avatar y perfil.');

      // SEGURIDAD: usamos un nombre fijo controlado por formato. Las policies
      // de Storage solo permiten avatar.png/jpg/webp/gif dentro del UUID propio,
      // evitando que una cuenta abuse del bucket creando miles de objetos.
      const stamp = Date.now();
      const path = `${session.user.id}/avatar.${extension}`;
      const uploadUrl = `${supabaseBase()}/storage/v1/object/${AVATAR_BUCKET}/${encodeStoragePath(path)}`;

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          apikey: globalPublicKey(),
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': file.type,
          'cache-control': '60',
          'x-upsert': 'true',
        },
        body: file,
      });

      if (!uploadRes.ok) {
        const detail = await uploadRes.text().catch(() => '');
        throw new Error(`Storage ${uploadRes.status}: ${detail.slice(0, 300)}`);
      }

      const previousPath = profile.avatarPath || '';

      // Guardamos el perfil por REST bajo RLS estricta: Supabase vuelve a validar
      // auth.uid() y que la ruta del avatar pertenezca al usuario autenticado.
      await saveRemotePlayerProfile(session, profile.name || 'Jugador', path);

      // Verificación obligatoria: no mostramos "guardado" hasta que Supabase
      // devuelva exactamente la ruta del avatar/GIF que acabamos de subir.
      const savedProfile = await fetchRemotePlayerProfile(session);
      if (!savedProfile || savedProfile.avatar_path !== path) {
        throw new Error('Supabase no confirmó avatar_path. Volvé a elegir la foto/GIF.');
      }

      profile.avatarPath = path;
      profile.avatarVersion = savedProfile.updated_at
        ? Date.parse(savedProfile.updated_at) || stamp
        : stamp;
      saveProfile();

      // El avatar anterior ya no se usa. Lo limpiamos en segundo plano; si falla,
      // no afecta al nuevo avatar ni al ranking.
      if (previousPath && previousPath !== path) {
        fetch(`${supabaseBase()}/storage/v1/object/${AVATAR_BUCKET}/${encodeStoragePath(previousPath)}`, {
          method: 'DELETE',
          headers: {
            apikey: globalPublicKey(),
            Authorization: `Bearer ${session.access_token}`,
          },
        }).catch(() => {});
      }

      if (avatarPreviewObjectUrl) {
        try { URL.revokeObjectURL(avatarPreviewObjectUrl); } catch {}
        avatarPreviewObjectUrl = '';
      }

      if (!silent && status) status.textContent = file.type === 'image/gif'
        ? 'GIF guardado y sincronizado con el ranking.'
        : 'Avatar guardado y sincronizado con el ranking.';

      if (!silent) mostrarToast(file.type === 'image/gif' ? 'GIF de perfil guardado' : 'Avatar guardado');
      renderProfile();
      if (!silent) await renderRanking();
      return true;
    } catch (err) {
      console.warn('Avatar global:', err);
      if (!silent && status) status.textContent = `No se pudo subir: ${String(err?.message || err).slice(0, 120)}`;
      if (!silent) mostrarToast(`Supabase: ${String(err?.message || err).slice(0, 90)}`);
      return false;
    } finally {
      if (!silent && chooseButton) chooseButton.disabled = false;
    }
  }

  async function syncPendingLocalAvatarToSupabase(session = null, { force = false } = {}) {
    if (!globalEnabled()) return false;
    if (pendingAvatarSyncPromise) return pendingAvatarSyncPromise;

    pendingAvatarSyncPromise = (async () => {
      try {
        const cleanName = String(profile.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
        if (cleanName.length < 2 || cleanName.toLowerCase() === 'jugador') return false;

        const authSession = session?.access_token ? session : await ensureSupabaseSession();
        if (!authSession?.access_token || !authSession?.user?.id || !isPermanentSession(authSession)) return false;

        const localRecord = await readLocalAvatarBackupRecord();
        if (!localRecord?.blob) return false;

        const remote = await fetchRemotePlayerProfile(authSession).catch(() => null);
        const remoteUpdatedAt = remote?.updated_at ? Date.parse(remote.updated_at) || 0 : 0;
        const localUpdatedAt = Number(localRecord.updatedAt) || 0;
        const remoteHasAvatar = Boolean(String(remote?.avatar_path || '').trim());

        // Si Supabase todavía no tiene avatar, migramos automáticamente la copia
        // persistente del navegador. También reintentamos si la copia local es más nueva.
        if (!force && remoteHasAvatar && localUpdatedAt <= remoteUpdatedAt) {
          profile.avatarPath = remote.avatar_path || profile.avatarPath || '';
          profile.avatarVersion = remoteUpdatedAt || profile.avatarVersion || 0;
          saveProfile();
          return false;
        }

        const synced = await uploadPlayerAvatar(localRecord.blob, authSession, { silent: true });
        if (!synced) return false;

        const confirmed = await fetchRemotePlayerProfile(authSession);
        if (!confirmed?.avatar_path) return false;

        profile.globalPlayerId = confirmed.user_id || authSession.user.id;
        profile.avatarPath = confirmed.avatar_path;
        profile.avatarVersion = confirmed.updated_at ? Date.parse(confirmed.updated_at) || Date.now() : Date.now();
        saveProfile();
        renderProfile();
        return true;
      } catch (err) {
        console.warn('Sincronización automática de avatar:', err);
        return false;
      } finally {
        pendingAvatarSyncPromise = null;
      }
    })();

    return pendingAvatarSyncPromise;
  }

  async function handlePlayerAvatarFile(file) {
    if (!file) return;

    const extension = AVATAR_TYPES.get(String(file.type || '').toLowerCase());
    if (!extension || file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
      if (!extension) mostrarToast('Usá PNG, JPG, WebP o GIF.');
      else mostrarToast('El archivo supera el límite de 8 MB.');
      return;
    }

    // Guardamos primero una copia persistente en IndexedDB. De esta forma la
    // foto elegida no desaparece al recargar aunque Supabase esté temporalmente caído.
    await saveLocalAvatarBackup(file);

    if (avatarPreviewObjectUrl) {
      try { URL.revokeObjectURL(avatarPreviewObjectUrl); } catch {}
    }
    avatarPreviewObjectUrl = URL.createObjectURL(file);
    renderProfile();

    const currentSession = readStoredSupabaseSession();
    let synced = false;
    if (isPermanentSession(currentSession)) {
      synced = await uploadPlayerAvatar(file, currentSession);
    } else {
      const status = document.getElementById('profile-avatar-status');
      if (status) status.textContent = 'Avatar guardado en este navegador. Creá una cuenta para publicarlo y conservarlo en la nube.';
      mostrarToast('Avatar guardado localmente · modo invitado');
    }

    // La vista previa blob solo vive durante la subida. Luego mostramos la versión
    // remota confirmada o, si falló, la copia local persistente.
    if (avatarPreviewObjectUrl) {
      try { URL.revokeObjectURL(avatarPreviewObjectUrl); } catch {}
      avatarPreviewObjectUrl = '';
    }
    if (!synced) {
      const status = document.getElementById('profile-avatar-status');
      if (status && !String(status.textContent || '').includes('No se pudo')) {
        status.textContent = 'Guardado en este navegador · sincronización con Supabase pendiente.';
      }
    }
    renderProfile();
  }

  async function rpcAuthenticated(session, functionName, payload = {}) {
    if (!session?.access_token) throw new Error('Sesión de jugador no disponible.');
    const fn = String(functionName || '').replace(/[^a-z0-9_]/gi, '');
    if (!fn) throw new Error('RPC inválida.');

    const res = await fetch(`${supabaseBase()}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: publicSupabaseHeaders({
        Authorization: `Bearer ${session.access_token}`,
      }),
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });

    const body = await res.json().catch(async () => ({
      error: (await res.text().catch(() => '')).slice(0, 200),
    }));

    if (!res.ok) {
      const error = new Error(`RPC ${fn} ${res.status}: ${String(body?.message || body?.error || '').slice(0, 200)}`);
      error.status = res.status;
      throw error;
    }

    return body;
  }

  function ownedAvatarPathForSession(session) {
    const userId = String(session?.user?.id || '');
    const path = String(profile.avatarPath || '').trim();
    if (!userId || !path) return null;
    return path.startsWith(`${userId}/`) ? path : null;
  }

  async function prepareSecureGame(game) {
    if (!globalEnabled()) return true;
    if (!GAME_LABELS[game]) return false;

    // Evita dobles clics y dos sesiones paralelas para el mismo juego.
    if (secureGameStartPromises.has(game)) {
      return secureGameStartPromises.get(game);
    }

    const promise = (async () => {
      const active = await beginSecureGameSession(game);
      if (!active) return false;
      secureGameSessions.set(game, active);
      return true;
    })();

    secureGameStartPromises.set(game, promise);
    try {
      return await promise;
    } finally {
      secureGameStartPromises.delete(game);
    }
  }

  async function startVerifiedGame(game) {
    const fn = window[GAME_OPENERS[game]];
    if (typeof fn !== 'function') return false;

    const session = globalEnabled() ? await ensureSupabaseSession().catch(() => null) : null;
    if (globalEnabled() && isPermanentSession(session)) {
      mostrarToast('Verificando partida competitiva…');
      const ready = await prepareSecureGame(game);
      if (!ready) {
        secureGameSessions.delete(game);
        mostrarToast('La partida arranca en modo local. Completá tu Perfil o revisá Supabase para competir.');
      }
    } else {
      secureGameSessions.delete(game);
      if (Date.now() - lastSecurityNoticeAt > 5000) {
        lastSecurityNoticeAt = Date.now();
        mostrarToast('Modo invitado · jugás normal, pero este récord no entra al ranking global.');
      }
    }

    fn();
    return true;
  }

  async function restartVerifiedGame(game) {
    secureGameSessions.delete(game);
    return startVerifiedGame(game);
  }

  async function beginSecureGameSession(game) {
    try {
      const session = await ensureSupabaseSession();
      if (!session?.access_token || !session?.user?.id) {
        throw new Error('No hay sesión autenticada de Supabase.');
      }
      if (!isPermanentSession(session)) {
        throw new Error('account_required');
      }

      // Antes de emitir una sesión de juego confirmamos que el UUID actual tenga
      // un perfil remoto válido. Esto evita que un cambio de sesión anónima deje
      // el juego sin poder crear rayito_game_sessions aunque la UI conserve el nombre.
      let remote = null;
      try {
        remote = await fetchRemotePlayerProfile(session);
      } catch (profileError) {
        console.warn('Verificación de perfil antes de jugar:', profileError);
      }

      const localName = String(profile.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
      if (!remote && localName.length >= 2 && localName.toLowerCase() !== 'jugador') {
        await saveRemotePlayerProfile(session, localName, ownedAvatarPathForSession(session));
        remote = await fetchRemotePlayerProfile(session);
      }

      if (remote?.user_id) {
        profile.globalPlayerId = remote.user_id;
        if (remote.display_name) profile.name = String(remote.display_name).slice(0, 20);
        profile.avatarPath = remote.avatar_path || profile.avatarPath || '';
        profile.avatarVersion = remote.updated_at ? Date.parse(remote.updated_at) || Date.now() : Date.now();
        saveProfile();
      }

      let result = await rpcAuthenticated(session, 'begin_rayito_game_v2', { p_game: game });

      // Si Supabase indica que falta perfil, lo reparamos una vez y reintentamos.
      if (result?.error === 'profile_required' && localName.length >= 2 && localName.toLowerCase() !== 'jugador') {
        await saveRemotePlayerProfile(session, localName, ownedAvatarPathForSession(session));
        result = await rpcAuthenticated(session, 'begin_rayito_game_v2', { p_game: game });
      }

      if (!result?.ok || !result?.session_id) {
        const reason = String(result?.error || 'session_not_created');
        if (Date.now() - lastSecurityNoticeAt > 8000) {
          lastSecurityNoticeAt = Date.now();
          if (reason === 'profile_required') {
            mostrarToast('Guardá tu nombre en Perfil antes de competir.');
          } else if (reason === 'rate_limited') {
            mostrarToast('Demasiadas partidas seguidas. Esperá un momento.');
          } else {
            mostrarToast('No se pudo verificar esta partida con Supabase.');
          }
        }
        console.warn('Sesión de juego rechazada:', reason, result);
        return null;
      }

      console.info('[Rayito] Sesión V2 creada', game, result.session_id);
      return { session, sessionId: result.session_id, game };
    } catch (err) {
      console.warn('Inicio de partida verificada:', err);
      if (Date.now() - lastSecurityNoticeAt > 8000) {
        lastSecurityNoticeAt = Date.now();
        mostrarToast('Ranking global: no se pudo verificar el inicio de esta partida.');
      }
      return null;
    }
  }

  async function finishSecureGameSession(game, score) {
    const active = secureGameSessions.get(game);
    secureGameSessions.delete(game);
    if (!active) {
      console.warn('[Rayito] No existe sesión verificada activa para', game);
      if (Date.now() - lastSecurityNoticeAt > 5000) {
        lastSecurityNoticeAt = Date.now();
        mostrarToast('Esta partida no tenía sesión global válida; el récord quedó solo local.');
      }
      return false;
    }

    try {
      if (!active?.session?.access_token || !active?.sessionId || active.game !== game) return false;

      const result = await rpcAuthenticated(active.session, 'finish_rayito_game_v2', {
        p_session_id: active.sessionId,
        p_score: Math.max(0, Math.round(Number(score) || 0)),
      });

      if (!result?.ok) {
        const reason = String(result?.error || 'score_not_saved');
        console.warn('Puntaje global rechazado:', reason, result);
        if (Date.now() - lastSecurityNoticeAt > 8000) {
          lastSecurityNoticeAt = Date.now();
          if (reason === 'score_not_verified') mostrarToast('El servidor rechazó este puntaje por validación.');
          else if (reason === 'session_expired') mostrarToast('La sesión de juego expiró.');
          else mostrarToast('El puntaje no pudo guardarse en el ranking global.');
        }
        return false;
      }

      console.info('[Rayito] Puntaje V2 aceptado', game, result);
      return true;
    } catch (err) {
      console.warn('Fin de partida verificada:', err);
      return false;
    }
  }

  function rankingSectionVisible() {
    const section = document.querySelector('.app-section[data-page="ranking"]');
    return Boolean(section && !section.hidden);
  }

  function scheduleRealtimeRankingRefresh(delay = 120) {
    if (rankingRealtimeRefreshId) clearTimeout(rankingRealtimeRefreshId);
    rankingRealtimeRefreshId = setTimeout(() => {
      rankingRealtimeRefreshId = 0;
      if (rankingSectionVisible()) renderRanking(true).catch(() => {});
      if (homeRankingDrawerOpen()) renderHomeGlobalRanking(true).catch(() => {});
    }, Math.max(0, delay));
  }

  function stopRankingRealtime() {
    if (rankingRealtimeHeartbeatId) {
      clearInterval(rankingRealtimeHeartbeatId);
      rankingRealtimeHeartbeatId = 0;
    }
    if (rankingRealtimeReconnectId) {
      clearTimeout(rankingRealtimeReconnectId);
      rankingRealtimeReconnectId = 0;
    }
    if (rankingRealtimeSocket) {
      try { rankingRealtimeSocket.onclose = null; rankingRealtimeSocket.close(); } catch {}
      rankingRealtimeSocket = null;
    }
    rankingRealtimeSessionToken = '';
  }

  function startRankingFallbackPolling() {
    if (rankingFallbackPollId) return;
    rankingFallbackPollId = setInterval(() => {
      if (rankingSectionVisible()) {
        renderRanking(true).catch(() => {});
        renderCommunityChat(true).catch(() => {});
      }
      if (homeRankingDrawerOpen()) renderHomeGlobalRanking(true).catch(() => {});
      if (songRequestDrawerOpen()) renderSongRequests(true).catch(() => {});
    }, 5000);
  }

  function startRankingRealtime(session) {
    if (!globalEnabled() || !session?.access_token) return;
    startRankingFallbackPolling();
    if (!('WebSocket' in window)) return;

    // Si ya estamos conectados con la misma sesión no abrimos otro socket.
    if (
      rankingRealtimeSocket &&
      rankingRealtimeSocket.readyState <= WebSocket.OPEN &&
      rankingRealtimeSessionToken === session.access_token
    ) return;

    stopRankingRealtime();
    rankingRealtimeSessionToken = session.access_token;

    const wsBase = supabaseBase().replace(/^https:/i, 'wss:');
    const url = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(globalPublicKey())}&vsn=1.0.0`;
    let socket;
    try { socket = new WebSocket(url); }
    catch (err) { console.warn('Realtime ranking:', err); return; }
    rankingRealtimeSocket = socket;

    const send = (topic, event, payload, ref = null, joinRef = null) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ topic, event, payload, ref, join_ref: joinRef }));
    };

    socket.addEventListener('open', () => {
      if (socket !== rankingRealtimeSocket) return;
      const ref = String(++rankingRealtimeRef);
      send('realtime:rayito-ranking', 'phx_join', {
        config: {
          broadcast: { ack: false, self: false },
          presence: { enabled: false },
          postgres_changes: [
            { event: '*', schema: 'public', table: 'rayito_leaderboard' },
            { event: '*', schema: 'public', table: 'rayito_profiles' },
            { event: '*', schema: 'public', table: 'rayito_community_messages' },
            { event: '*', schema: 'public', table: 'rayito_song_requests' },
          ],
        },
        access_token: session.access_token,
      }, ref, ref);

      rankingRealtimeHeartbeatId = setInterval(() => {
        send('phoenix', 'heartbeat', {}, String(++rankingRealtimeRef), null);
      }, 25000);
    });

    socket.addEventListener('message', (event) => {
      if (socket !== rankingRealtimeSocket) return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg?.event === 'postgres_changes') {
        const table = String(msg?.payload?.data?.table || msg?.payload?.table || '');
        if (table === 'rayito_community_messages') {
          scheduleCommunityChatRefresh(60);
        } else if (table === 'rayito_song_requests') {
          scheduleSongRequestRefresh(60);
        } else if (table === 'rayito_profiles') {
          // Un cambio de nombre o avatar debe verse tanto en Ranking como en mensajes/pedidos antiguos.
          scheduleRealtimeRankingRefresh(80);
          scheduleCommunityChatRefresh(80);
          scheduleSongRequestRefresh(80);
        } else if (table === 'rayito_leaderboard') {
          scheduleRealtimeRankingRefresh(80);
        } else {
          // Compatibilidad con payloads Realtime que no incluyen el nombre de tabla.
          scheduleRealtimeRankingRefresh(100);
          scheduleCommunityChatRefresh(100);
          scheduleSongRequestRefresh(100);
        }
      }
    });

    socket.addEventListener('close', () => {
      if (socket !== rankingRealtimeSocket) return;
      rankingRealtimeSocket = null;
      if (rankingRealtimeHeartbeatId) {
        clearInterval(rankingRealtimeHeartbeatId);
        rankingRealtimeHeartbeatId = 0;
      }
      rankingRealtimeReconnectId = setTimeout(async () => {
        rankingRealtimeReconnectId = 0;
        try {
          const nextSession = await ensureSupabaseSession();
          if (nextSession?.access_token) startRankingRealtime(nextSession);
        } catch {}
      }, 2000);
    });

    socket.addEventListener('error', () => {
      // El evento close se encarga de reconectar; el polling de respaldo evita
      // que el ranking se quede congelado si Realtime no está disponible.
    });
  }

  function schedulePublicProfileSync(delay = 900) {
    if (publicProfileSyncTimer) clearTimeout(publicProfileSyncTimer);
    publicProfileSyncTimer = setTimeout(async () => {
      publicProfileSyncTimer = 0;
      const cleanName = String(profile.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
      if (!globalEnabled() || cleanName.length < 2 || cleanName.toLowerCase() === 'jugador') return;
      try {
        const session = await ensureSupabaseSession();
        if (!isPermanentSession(session)) return;
        await saveRemotePlayerProfile(session, cleanName, profile.avatarPath || null, profile.peripherals, buildPublicStats());
      } catch (err) {
        console.warn('Sincronizar perfil público:', err);
      }
    }, Math.max(0, delay));
  }

  async function fetchPublicCommunityProfile(userId) {
    const cleanId = String(userId || '').trim();
    if (!cleanId) throw new Error('Perfil no disponible.');
    const session = await ensureSupabaseSession();
    const rows = await rpcAuthenticated(session, 'get_rayito_public_profile', { p_user_id: cleanId });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.user_id) throw new Error('Este perfil ya no está disponible.');
    return {
      userId: row.user_id,
      displayName: row.display_name || 'Jugador',
      avatarPath: row.avatar_path || '',
      updatedAt: row.profile_updated_at || '',
      peripherals: sanitizePeripherals(row.peripherals || {}),
      publicStats: normalizePublicStats(row.public_stats || {}),
      scores: row.scores && typeof row.scores === 'object' ? row.scores : {},
    };
  }

  function publicProfileAvatar(profileRow) {
    const name = String(profileRow?.displayName || 'Jugador');
    const path = String(profileRow?.avatarPath || '');
    const version = profileRow?.updatedAt ? Date.parse(profileRow.updatedAt) || 0 : 0;
    const url = path ? avatarPublicUrl(path, version) : '';
    const initials = escapeHTML(playerInitials(name));
    if (url) return `<span class="public-profile-avatar has-image"><span>${initials}</span><img src="${escapeHTML(url)}" alt="Avatar de ${escapeHTML(name)}" decoding="async"></span>`;
    return `<span class="public-profile-avatar"><span>${initials}</span></span>`;
  }

  function renderPublicProfileModal(profileRow) {
    const content = document.getElementById('public-profile-content');
    if (!content) return;
    const stats = normalizePublicStats(profileRow.publicStats);
    const unlocked = ACHIEVEMENTS.filter(a => stats.achievements.includes(a.id));
    const equipment = PERIPHERAL_FIELDS
      .map(field => ({ ...field, value: String(profileRow.peripherals?.[field.key] || '').trim() }))
      .filter(item => item.value);
    const scoreRows = Object.keys(GAME_LABELS)
      .map(game => ({ game, score: Math.max(0, Number(profileRow.scores?.[game]) || 0) }))
      .filter(item => item.score > 0)
      .sort((a,b) => b.score - a.score);

    content.innerHTML = `
      <div class="public-profile-hero">
        ${publicProfileAvatar(profileRow)}
        <div class="public-profile-identity">
          <p class="eyebrow">PERFIL DE LA COMUNIDAD</p>
          <h2>${escapeHTML(profileRow.displayName)}</h2>
          <span>Jugador de Rayito Hub ⚡</span>
        </div>
      </div>
      <div class="public-profile-stats">
        <div><strong>${stats.level}</strong><span>Nivel</span></div>
        <div><strong>${stats.gamesPlayed}</strong><span>Partidas</span></div>
        <div><strong>${stats.achievements.length}</strong><span>Logros</span></div>
        <div><strong>${stats.favorites}</strong><span>Favoritas</span></div>
      </div>
      <section class="public-profile-section">
        <div class="public-profile-section-head"><div><p class="eyebrow">COMPETITIVO</p><h3>Mejores récords</h3></div></div>
        ${scoreRows.length ? `<div class="public-profile-records">${scoreRows.map(item => `<div><span>${GAME_EMOJIS[item.game] || '🎮'} ${escapeHTML(GAME_LABELS[item.game] || item.game)}</span><strong>${item.score} pts</strong></div>`).join('')}</div>` : '<p class="public-profile-empty">Todavía no tiene récords globales.</p>'}
      </section>
      <section class="public-profile-section">
        <div class="public-profile-section-head"><div><p class="eyebrow">COLECCIÓN</p><h3>Logros</h3></div><span>${stats.achievements.length}/${ACHIEVEMENTS.length}</span></div>
        ${unlocked.length ? `<div class="public-profile-achievements">${unlocked.map(a => `<div><span>${a.icon}</span><strong>${escapeHTML(a.title)}</strong></div>`).join('')}</div>` : '<p class="public-profile-empty">Todavía no desbloqueó logros públicos.</p>'}
      </section>
      <section class="public-profile-section">
        <div class="public-profile-section-head"><div><p class="eyebrow">MI EQUIPO</p><h3>PC y periféricos</h3></div></div>
        ${equipment.length ? `<div class="public-profile-equipment">${equipment.map(item => `<div><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(item.value)}</strong></div>`).join('')}</div>` : '<p class="public-profile-empty">Este usuario todavía no cargó su equipo.</p>'}
      </section>`;
  }

  async function openPublicProfile(userId) {
    const modal = document.getElementById('public-profile-modal');
    const content = document.getElementById('public-profile-content');
    if (!modal || !content) return;
    publicProfileOpenUserId = String(userId || '');
    modal.hidden = false;
    document.body.classList.add('public-profile-open');
    content.innerHTML = '<div class="public-profile-loading"><span>⚡</span><strong>Cargando perfil…</strong></div>';
    try {
      const row = await fetchPublicCommunityProfile(publicProfileOpenUserId);
      if (String(row.userId) !== String(publicProfileOpenUserId)) return;
      renderPublicProfileModal(row);
    } catch (err) {
      content.innerHTML = `<div class="public-profile-loading is-error"><span>!</span><strong>No se pudo abrir el perfil</strong><p>${escapeHTML(String(err?.message || err).slice(0, 150))}</p></div>`;
    }
  }

  function closePublicProfile() {
    const modal = document.getElementById('public-profile-modal');
    if (modal) modal.hidden = true;
    publicProfileOpenUserId = '';
    document.body.classList.remove('public-profile-open');
  }

  function communityChatVisible() {
    return rankingSectionVisible() && Boolean(document.getElementById('community-chat-card'));
  }

  function scheduleCommunityChatRefresh(delay = 100) {
    if (communityChatRefreshId) clearTimeout(communityChatRefreshId);
    communityChatRefreshId = setTimeout(() => {
      communityChatRefreshId = 0;
      if (communityChatVisible()) renderCommunityChat(true).catch(() => {});
    }, Math.max(0, delay));
  }

  function chatInitials(name = 'Jugador') {
    return playerInitials(name);
  }

  function chatAvatarMarkup(row, className = 'community-message-avatar') {
    const name = String(row?.displayName || row?.display_name || 'Jugador');
    const path = String(row?.avatarPath || row?.avatar_path || '');
    const version = Number(row?.avatarVersion || 0) || (row?.profile_updated_at ? Date.parse(row.profile_updated_at) || 0 : 0);
    const url = path ? avatarPublicUrl(path, version) : '';
    const initials = escapeHTML(chatInitials(name));
    if (url) {
      return `<span class="${className}"><span>${initials}</span><img src="${escapeHTML(url)}" alt="Avatar de ${escapeHTML(name)}" loading="lazy" decoding="async"></span>`;
    }
    return `<span class="${className}"><span>${initials}</span></span>`;
  }

  function formatCommunityChatTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return new Intl.DateTimeFormat('es-AR', sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    ).format(date);
  }

  async function fetchCommunityChatMessages(session) {
    const rows = await rpcAuthenticated(session, 'get_rayito_community_chat', {});
    return (Array.isArray(rows) ? rows : []).map(row => ({
      id: row.message_id,
      userId: row.user_id,
      displayName: row.display_name || 'Jugador',
      avatarPath: row.avatar_path || '',
      avatarVersion: row.profile_updated_at ? Date.parse(row.profile_updated_at) || 0 : 0,
      communityRole: String(row.community_role || 'member'),
      message: String(row.message || ''),
      createdAt: row.created_at || '',
    }));
  }

  function renderCommunityChatMessages(rows, currentUserId) {
    const list = document.getElementById('community-chat-messages');
    if (!list) return;
    const shouldStick = list.scrollHeight - list.scrollTop - list.clientHeight < 90;

    if (!rows.length) {
      list.innerHTML = '<div class="community-chat-empty">Todavía no hay mensajes. Cuando alguien con Perfil escriba, aparecerá acá en tiempo real.</div>';
      return;
    }

    list.innerHTML = rows.map(row => {
      const mine = String(row.userId || '') === String(currentUserId || '');
      return `<article class="community-message ${mine ? 'is-me' : ''}" data-message-id="${escapeHTML(row.id || '')}">
        <button type="button" class="community-profile-trigger" data-public-profile-id="${escapeHTML(row.userId || '')}" aria-label="Ver perfil de ${escapeHTML(row.displayName || 'Jugador')}">
          ${chatAvatarMarkup(row)}
        </button>
        <div class="community-message-main">
          <div class="community-message-meta">
            <button type="button" class="community-profile-name" data-public-profile-id="${escapeHTML(row.userId || '')}">${escapeHTML(row.displayName || 'Jugador')}</button>
            ${row.communityRole === 'founder' ? '<span class="community-founder-badge">Fundador</span>' : ''}
            <time datetime="${escapeHTML(row.createdAt || '')}">${escapeHTML(formatCommunityChatTime(row.createdAt))}</time>
          </div>
          <p class="community-message-text">${escapeHTML(row.message || '')}</p>
        </div>
      </article>`;
    }).join('');

    if (shouldStick) list.scrollTop = list.scrollHeight;
  }

  function setCommunityChatComposer(profileRow, session) {
    communityChatOwnProfile = profileRow || null;
    const cleanName = String(profileRow?.display_name || '').trim();
    const avatarPath = String(profileRow?.avatar_path || '').trim();
    communityChatCanWrite = Boolean(
      isPermanentSession(session) && cleanName.length >= 2 && cleanName.toLowerCase() !== 'jugador' && avatarPath
    );

    const form = document.getElementById('community-chat-form');
    const gate = document.getElementById('community-chat-gate');
    const input = document.getElementById('community-chat-input');
    const send = document.getElementById('community-chat-send');
    const me = document.getElementById('community-chat-me');
    if (gate && !communityChatCanWrite) {
      const strong = gate.querySelector('strong');
      const small = gate.querySelector('small');
      const button = gate.querySelector('button');
      if (!isPermanentSession(session)) {
        if (strong) strong.textContent = 'Creá una cuenta para escribir';
        if (small) small.textContent = 'Como invitado podés leer. Para participar necesitás una cuenta y un Perfil con foto/GIF.';
        if (button) { button.textContent = 'Crear cuenta'; button.removeAttribute('data-section'); button.dataset.accountAction = 'signup'; }
      } else {
        if (strong) strong.textContent = 'Completá tu Perfil para escribir';
        if (small) small.textContent = 'Necesitás un nombre y una foto o GIF. Todos pueden leer el chat.';
        if (button) { button.textContent = 'Ir a Perfil'; delete button.dataset.accountAction; button.dataset.section = 'perfil'; }
      }
    }

    if (form) form.classList.toggle('is-locked', !communityChatCanWrite);
    if (gate) gate.hidden = communityChatCanWrite;
    if (input) input.disabled = !communityChatCanWrite;
    if (send) send.disabled = !communityChatCanWrite;
    if (me) {
      me.innerHTML = profileRow
        ? chatAvatarMarkup({
            displayName: profileRow.display_name,
            avatarPath: profileRow.avatar_path,
            avatarVersion: profileRow.updated_at ? Date.parse(profileRow.updated_at) || 0 : 0,
          }, 'community-chat-me-avatar')
        : '';
    }
  }

  async function renderCommunityChat(silent = false) {
    const seq = ++communityChatRenderSequence;
    const list = document.getElementById('community-chat-messages');
    const status = document.getElementById('community-chat-status');
    const live = document.getElementById('community-chat-live');
    if (!list || !globalEnabled()) return;

    if (!silent && !list.querySelector('.community-message')) {
      list.innerHTML = '<div class="community-chat-loading">Conectando con la comunidad…</div>';
    }

    try {
      const session = await ensureSupabaseSession();
      if (!session?.access_token) throw new Error('Sesión no disponible');
      const [rows, ownProfile] = await Promise.all([
        fetchCommunityChatMessages(session),
        fetchRemotePlayerProfile(session).catch(() => null),
      ]);
      if (seq !== communityChatRenderSequence) return;
      setCommunityChatComposer(ownProfile, session);
      renderCommunityChatMessages(rows, session.user?.id);
      if (status) {
        status.className = 'community-chat-note';
        status.textContent = communityChatCanWrite
          ? 'Tu cuenta y Perfil están conectados. Los mensajes nuevos aparecen en tiempo real.'
          : (isPermanentSession(session)
            ? 'Podés leer el chat. Para escribir, completá tu Perfil con nombre y foto/GIF.'
            : 'Modo invitado: podés leer el chat. Creá una cuenta para escribir.');
      }
      if (live) live.classList.remove('is-offline');
    } catch (err) {
      console.warn('Chat comunidad:', err);
      if (seq !== communityChatRenderSequence) return;
      if (live) live.classList.add('is-offline');
      if (status) {
        status.className = 'community-chat-note is-error';
        status.textContent = 'Chat sin conexión. Reintentando automáticamente…';
      }
      if (!silent) list.innerHTML = '<div class="community-chat-empty">No se pudo conectar con el chat en este momento.</div>';
    }
  }

  async function sendCommunityChatMessage(text) {
    if (communityChatSending) return false;
    const clean = String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, 280);
    if (!clean) return false;
    if (!communityChatCanWrite) {
      if (!isPermanentSession(readStoredSupabaseSession())) {
        mostrarToast('Creá una cuenta para escribir en la comunidad.');
        openAccountModal('signup');
      } else {
        mostrarToast('Completá tu Perfil con nombre y foto/GIF para escribir.');
      }
      return false;
    }

    communityChatSending = true;
    const send = document.getElementById('community-chat-send');
    const status = document.getElementById('community-chat-status');
    if (send) { send.disabled = true; send.textContent = 'Enviando…'; }

    try {
      const session = await ensureSupabaseSession();
      const result = await rpcAuthenticated(session, 'send_rayito_community_message', { p_message: clean });
      if (!result?.ok) {
        const code = String(result?.error || 'send_failed');
        if (code === 'profile_required') throw new Error('Completá tu Perfil con nombre y foto/GIF.');
        if (code === 'rate_limited') throw new Error('Esperá un momento antes de enviar otro mensaje.');
        throw new Error('No se pudo enviar el mensaje.');
      }
      const input = document.getElementById('community-chat-input');
      const count = document.getElementById('community-chat-count');
      if (input) { input.value = ''; input.style.height = ''; }
      if (count) count.textContent = '0';
      if (status) {
        status.className = 'community-chat-note is-success';
        status.textContent = 'Mensaje enviado.';
      }
      await renderCommunityChat(true);
      return true;
    } catch (err) {
      console.warn('Enviar chat:', err);
      if (status) {
        status.className = 'community-chat-note is-error';
        status.textContent = String(err?.message || 'No se pudo enviar el mensaje.').slice(0, 120);
      }
      mostrarToast(String(err?.message || 'No se pudo enviar el mensaje.').slice(0, 100));
      return false;
    } finally {
      communityChatSending = false;
      if (send) { send.disabled = !communityChatCanWrite; send.textContent = 'Enviar'; }
    }
  }


  function musicSectionVisible() {
    const section = document.querySelector('.app-section[data-page="musica"]');
    return Boolean(section && !section.hidden);
  }

  function songRequestDrawerOpen() {
    return Boolean(document.getElementById('song-request-drawer')?.classList.contains('is-open'));
  }

  function scheduleSongRequestRefresh(delay = 100) {
    if (songRequestRefreshId) clearTimeout(songRequestRefreshId);
    songRequestRefreshId = setTimeout(() => {
      songRequestRefreshId = 0;
      if (musicSectionVisible() && songRequestDrawerOpen()) renderSongRequests(true).catch(() => {});
    }, Math.max(0, delay));
  }

  function setSongRequestDrawerOpen(force) {
    const drawer = document.getElementById('song-request-drawer');
    const toggle = document.getElementById('song-request-toggle');
    if (!drawer) return;
    const next = typeof force === 'boolean' ? force : !drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', next);
    drawer.setAttribute('aria-hidden', next ? 'false' : 'true');
    if (toggle) toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) {
      ensureSupabaseSession().then(session => {
        startRankingRealtime(session);
        renderSongRequests(false).catch(() => {});
      }).catch(() => renderSongRequests(false).catch(() => {}));
      setTimeout(() => document.getElementById('song-request-input')?.focus(), 220);
    }
  }

  async function fetchSongRequests(session) {
    const rows = await rpcAuthenticated(session, 'get_rayito_song_requests', {});
    return (Array.isArray(rows) ? rows : []).map(row => ({
      id: String(row.request_id || ''),
      userId: String(row.user_id || ''),
      displayName: String(row.display_name || 'Jugador'),
      avatarPath: String(row.avatar_path || ''),
      avatarVersion: row.profile_updated_at ? Date.parse(row.profile_updated_at) || 0 : 0,
      text: String(row.request_text || ''),
      status: ['accepted','rejected'].includes(String(row.status || '')) ? String(row.status) : 'pending',
      createdAt: row.created_at || '',
      reviewedAt: row.reviewed_at || '',
    }));
  }

  function songRequestAvatarMarkup(row) {
    const name = String(row?.displayName || 'Jugador');
    const path = String(row?.avatarPath || '');
    const url = path ? avatarPublicUrl(path, Number(row?.avatarVersion || 0)) : '';
    const initials = escapeHTML(playerInitials(name));
    if (url) return `<span class="song-request-avatar"><span>${initials}</span><img src="${escapeHTML(url)}" alt="Avatar de ${escapeHTML(name)}" loading="lazy" decoding="async"></span>`;
    return `<span class="song-request-avatar"><span>${initials}</span></span>`;
  }

  function songRequestStatusLabel(status) {
    if (status === 'accepted') return 'Agregada';
    if (status === 'rejected') return 'No se agrega';
    return 'Pendiente';
  }

  function renderSongRequestRows(rows) {
    const list = document.getElementById('song-request-list');
    if (!list) return;
    const shouldStick = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
    if (!rows.length) {
      list.innerHTML = '<div class="song-request-empty">Todavía no hay pedidos. Sé el primero en recomendar una canción.</div>';
      return;
    }
    list.innerHTML = rows.map(row => {
      const status = row.status || 'pending';
      const disabled = songRequestIsFounder ? '' : ' disabled';
      const title = songRequestIsFounder ? '' : ' title="Solo el Fundador puede marcar pedidos"';
      return `<article class="song-request-item ${status === 'accepted' ? 'is-accepted' : status === 'rejected' ? 'is-rejected' : ''}" data-song-request-id="${escapeHTML(row.id)}">
        <div class="song-request-user">
          ${songRequestAvatarMarkup(row)}
          <div class="song-request-user-meta"><strong>${escapeHTML(row.displayName || 'Jugador')}</strong><small>Solicitud de canción</small></div>
          <time datetime="${escapeHTML(row.createdAt || '')}">${escapeHTML(formatCommunityChatTime(row.createdAt))}</time>
        </div>
        <div class="song-request-message-row">
          <p class="song-request-text">${escapeHTML(row.text)}</p>
          <div class="song-request-actions" aria-label="Estado del pedido">
            <button type="button" class="song-request-review accept ${status === 'accepted' ? 'is-active' : ''}" data-song-request-review="accepted" data-request-id="${escapeHTML(row.id)}" aria-label="Marcar como agregada"${disabled}${title}><span class="song-request-review-icon">✓</span><b>${status === 'accepted' ? '1' : '0'}</b></button>
            <button type="button" class="song-request-review reject ${status === 'rejected' ? 'is-active' : ''}" data-song-request-review="rejected" data-request-id="${escapeHTML(row.id)}" aria-label="Marcar como no agregada"${disabled}${title}><span class="song-request-review-icon">×</span><b>${status === 'rejected' ? '1' : '0'}</b></button>
          </div>
        </div>
      </article>`;
    }).join('');
    if (shouldStick) list.scrollTop = list.scrollHeight;
  }

  function setSongRequestComposer(profileRow, session) {
    songRequestOwnProfile = profileRow || null;
    songRequestCanWrite = isPermanentSession(session);
    songRequestIsFounder = Boolean(songRequestCanWrite && String(profileRow?.community_role || '') === 'founder');
    const form = document.getElementById('song-request-form');
    const gate = document.getElementById('song-request-gate');
    const input = document.getElementById('song-request-input');
    const send = document.getElementById('song-request-send');
    const note = document.getElementById('song-request-note');
    if (form) form.classList.toggle('is-locked', !songRequestCanWrite);
    if (gate) gate.hidden = songRequestCanWrite;
    if (input) input.disabled = !songRequestCanWrite;
    if (send) send.disabled = !songRequestCanWrite;
    if (note) {
      note.className = 'song-request-note';
      note.textContent = songRequestCanWrite
        ? (songRequestIsFounder ? 'Modo Fundador: podés aceptar o rechazar cualquier pedido.' : 'Tu cuenta está conectada. Escribí una canción para pedirla.')
        : 'Modo invitado: creá una cuenta para pedir canciones.';
    }
  }

  async function renderSongRequests(silent = false) {
    const seq = ++songRequestRenderSequence;
    const list = document.getElementById('song-request-list');
    const note = document.getElementById('song-request-note');
    if (!list || !globalEnabled()) return;
    if (!silent && !list.querySelector('.song-request-item')) list.innerHTML = '<div class="song-request-loading">Conectando con los pedidos…</div>';
    try {
      const session = await ensureSupabaseSession();
      const ownProfile = isPermanentSession(session) ? await fetchRemotePlayerProfile(session).catch(() => null) : null;
      if (seq !== songRequestRenderSequence) return;
      setSongRequestComposer(ownProfile, session);
      if (!songRequestCanWrite) {
        list.innerHTML = '<div class="song-request-empty">Creá una cuenta para ver y participar en los pedidos de canciones.</div>';
        return;
      }
      const rows = await fetchSongRequests(session);
      if (seq !== songRequestRenderSequence) return;
      renderSongRequestRows(rows);
    } catch (err) {
      console.warn('Pedidos de canciones:', err);
      if (seq !== songRequestRenderSequence) return;
      list.innerHTML = '<div class="song-request-empty">No se pudieron cargar los pedidos en este momento.</div>';
      if (note) { note.className = 'song-request-note is-error'; note.textContent = 'Pedidos sin conexión. Reintentando automáticamente…'; }
    }
  }

  async function sendSongRequest(text) {
    if (songRequestSending) return false;
    const clean = String(text || '').replace(/\r\n?/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (!clean) return false;
    const session = await ensureSupabaseSession().catch(() => null);
    if (!isPermanentSession(session)) {
      mostrarToast('Creá una cuenta para pedir canciones.');
      openAccountModal('signup');
      return false;
    }
    songRequestSending = true;
    const send = document.getElementById('song-request-send');
    const note = document.getElementById('song-request-note');
    if (send) { send.disabled = true; send.textContent = 'Enviando…'; }
    try {
      const result = await rpcAuthenticated(session, 'send_rayito_song_request', { p_request: clean });
      if (!result?.ok) {
        const code = String(result?.error || 'send_failed');
        if (code === 'account_required') throw new Error('Necesitás una cuenta para pedir canciones.');
        if (code === 'rate_limited') throw new Error('Esperá unos segundos antes de mandar otro pedido.');
        throw new Error('No se pudo enviar el pedido.');
      }
      const input = document.getElementById('song-request-input');
      const count = document.getElementById('song-request-count');
      if (input) { input.value = ''; input.style.height = ''; }
      if (count) count.textContent = '0';
      if (note) { note.className = 'song-request-note is-success'; note.textContent = 'Pedido enviado. Ahora queda pendiente de revisión.'; }
      await renderSongRequests(true);
      return true;
    } catch (err) {
      if (note) { note.className = 'song-request-note is-error'; note.textContent = String(err?.message || err).slice(0, 120); }
      mostrarToast(String(err?.message || 'No se pudo enviar el pedido.').slice(0, 100));
      return false;
    } finally {
      songRequestSending = false;
      if (send) { send.disabled = !songRequestCanWrite; send.textContent = 'Pedir'; }
    }
  }

  async function reviewSongRequest(requestId, status) {
    if (!songRequestIsFounder) {
      mostrarToast('Solo el Fundador puede marcar pedidos.');
      return false;
    }
    if (!['accepted','rejected'].includes(status)) return false;
    try {
      const session = await ensureSupabaseSession();
      const result = await rpcAuthenticated(session, 'review_rayito_song_request', { p_request_id: requestId, p_status: status });
      if (!result?.ok) {
        if (String(result?.error || '') === 'forbidden') throw new Error('Solo el Fundador puede hacer esto.');
        throw new Error('No se pudo actualizar el pedido.');
      }
      await renderSongRequests(true);
      return true;
    } catch (err) {
      mostrarToast(String(err?.message || err).slice(0, 100));
      return false;
    }
  }

  async function fetchGlobalRanking(game, session = null) {
    const authSession = session?.access_token ? session : await ensureSupabaseSession();
    if (!authSession?.access_token) throw new Error('Sesión global no disponible.');

    const loadRows = async () => {
      const rows = await rpcAuthenticated(authSession, 'get_rayito_top10', { p_game: game });
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        playerId: r.player_id,
        name: r.player_name || 'Jugador',
        avatarPath: r.avatar_path || '',
        avatarVersion: r.profile_updated_at ? Date.parse(r.profile_updated_at) || 0 : 0,
        score: Number(r.score) || 0,
        at: r.updated_at ? Date.parse(r.updated_at) : 0,
      }));
    };

    let mapped = await loadRows();
    const ownId = String(authSession.user?.id || profile.globalPlayerId || '');
    const ownRow = mapped.find(r => String(r.playerId || '') === ownId);

    // Migración automática: si el ranking ya reconoce al usuario pero todavía
    // no tiene avatar remoto, intentamos subir la copia persistente y recargamos
    // el Top 10 una vez. Así Perfil y Ranking quedan enlazados sin pasos manuales.
    if (ownRow && !ownRow.avatarPath) {
      const changed = await syncPendingLocalAvatarToSupabase(authSession);
      if (changed) mapped = await loadRows();
    }

    return mapped;
  }

  function homeRankingDrawerOpen() {
    return Boolean(document.getElementById('home-global-ranking')?.classList.contains('is-open'));
  }

  function homeRankingAvatarMarkup(row) {
    return rankingAvatarMarkup(row, 'home-ranking-avatar');
  }

  function homeRankingDisplayName(row, isMe = false) {
    // Para la fila del propio usuario usamos el nombre actual del Perfil, no una
    // copia vieja guardada en el leaderboard. Esto evita insignias/caracteres
    // residuales que hayan quedado en un puntaje anterior.
    let name = String((isMe && profile.name && profile.name !== 'Jugador')
      ? profile.name
      : (row?.name || 'Jugador')).trim();

    // En el ranking rápido de Inicio normalizamos cualquier variante vieja
    // de Rayito (por ejemplo "Rayito R" o "Rayito ⚡") para que ningún
    // carácter residual tape el icono del rayo.
    if (/^Rayito(?:\s|$)/i.test(name)) name = 'Rayito';
    return name || 'Jugador';
  }

  async function renderHomeGlobalRanking(silent = false) {
    const list = document.getElementById('home-ranking-list');
    if (!list) return;
    const seq = ++homeRankingRenderSequence;
    const gameSelect = document.getElementById('home-ranking-game');
    const mainSelect = document.getElementById('ranking-game');
    const game = gameSelect?.value || mainSelect?.value || 'snake';

    if (!silent) list.innerHTML = '<div class="home-ranking-loading">Cargando Top 10 global…</div>';

    if (!globalEnabled()) {
      if (seq === homeRankingRenderSequence) list.innerHTML = '<div class="home-ranking-empty">El ranking global todavía no está conectado.</div>';
      return;
    }

    try {
      const session = await ensureSupabaseSession();
      const currentPlayerId = String(session?.user?.id || profile.globalPlayerId || profile.playerId || '');
      const data = await fetchGlobalRanking(game, session);
      if (seq !== homeRankingRenderSequence) return;

      if (!data.length) {
        list.innerHTML = '<div class="home-ranking-empty">Todavía no hay puntuaciones en este juego.<br>¡Sé el primero!</div>';
        return;
      }

      list.innerHTML = data.slice(0,10).map((row,index) => {
        const position = index + 1;
        const rec = rankingRecognition(position);
        const isMe = String(row.playerId || '') === currentPlayerId;
        const displayName = homeRankingDisplayName(row, isMe);
        const isRayitoRow = /^Rayito$/i.test(displayName);
        const displayNameMarkup = isRayitoRow
          ? `${escapeHTML(displayName)} <span class="home-ranking-rayito-bolt" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M13.2 1.8 4 13.4h6.7l-1 8.8L20 9.6h-7l.2-7.8Z" fill="currentColor"/></svg></span>`
          : escapeHTML(displayName);
        const accessibleName = isRayitoRow ? 'Rayito ⚡' : displayName;
        return `<button type="button" class="home-ranking-row ${isMe ? 'is-me' : ''}" data-public-profile-id="${escapeHTML(row.playerId || '')}" aria-label="Ver perfil de ${escapeHTML(accessibleName)}">
          <span class="home-ranking-position">${position <= 3 ? rec.icon : `#${position}`}</span>
          ${homeRankingAvatarMarkup(row)}
          <span class="home-ranking-player"><strong>${displayNameMarkup}</strong><small>${escapeHTML(rec.label)}</small></span>
          <span class="home-ranking-score">${Number(row.score) || 0}</span>
        </button>`;
      }).join('');
    } catch (err) {
      console.warn('Ranking rápido de Inicio:', err);
      if (seq === homeRankingRenderSequence) list.innerHTML = '<div class="home-ranking-empty">No se pudo conectar con el ranking global.</div>';
    }
  }

  function setHomeRankingOpen(force) {
    const rail = document.getElementById('home-global-ranking');
    const toggle = document.getElementById('home-ranking-toggle');
    const book = document.getElementById('home-ranking-book');
    if (!rail || !toggle || !book) return;
    const open = typeof force === 'boolean' ? force : !rail.classList.contains('is-open');
    rail.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    book.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      const homeSelect = document.getElementById('home-ranking-game');
      const mainSelect = document.getElementById('ranking-game');
      if (homeSelect && mainSelect && !homeSelect.dataset.touched) homeSelect.value = mainSelect.value || 'snake';
      renderHomeGlobalRanking(false).catch(() => {});
    }
  }

  function rankingRecognition(position) {
    if (position === 1) return { icon:'👑', label:'Campeón', className:'champion' };
    if (position === 2) return { icon:'🥈', label:'Subcampeón', className:'silver' };
    if (position === 3) return { icon:'🥉', label:'Podio', className:'bronze' };
    if (position <= 5) return { icon:'💎', label:'Élite', className:'elite' };
    return { icon:'⭐', label:'Top 10', className:'top10' };
  }

  function playerInitials(name='Jugador') {
    const parts=String(name).trim().split(/\s+/).filter(Boolean).slice(0,2);
    return (parts.map(p=>p[0]).join('') || 'J').toUpperCase().slice(0,2);
  }

  function renderRankingPodium(data, currentPlayerId) {
    const podium=document.getElementById('ranking-podium');
    if(!podium)return;
    const top=data.slice(0,3);
    if(!top.length){ podium.innerHTML=''; return; }
    const order=[top[1],top[0],top[2]].filter(Boolean);
    podium.innerHTML=order.map(r=>{
      const originalIndex=data.indexOf(r);
      const position=originalIndex+1;
      const rec=rankingRecognition(position);
      const isPlayer=r.playerId===currentPlayerId;
      return `<article class="podium-player podium-${position} ${isPlayer?'is-player':''} is-profile-link" data-public-profile-id="${escapeHTML(r.playerId || '')}" role="button" tabindex="0" aria-label="Ver perfil de ${escapeHTML(r.name || 'Jugador')}">
        <div class="podium-crown">${rec.icon}</div>
        ${rankingAvatarMarkup(r, 'podium-avatar')}
        <strong>${escapeHTML(r.name||'Jugador')}${isPlayer?' · vos':''}</strong>
        <span>${rec.label}</span>
        <b>${Number(r.score)||0} pts</b>
        <div class="podium-place">#${position}</div>
      </article>`;
    }).join('');
  }

  async function renderRanking(silent = false) {
    const renderSequence = ++rankingRenderSequence;
    const body = document.getElementById('ranking-table-body');
    const empty = document.getElementById('ranking-empty');
    if (!body) return;

    const game = document.getElementById('ranking-game')?.value || 'snake';
    const badge = document.getElementById('ranking-mode');
    let currentPlayerId = profile.playerId;
    let data = (localRankings[game] || []).slice(0, 10);

    if (!silent) {
      body.innerHTML =
        '<tr class="ranking-loading-row"><td colspan="6">Cargando ranking…</td></tr>';
      if (empty) empty.hidden = true;
    }

    if (globalEnabled()) {
      if (badge && !silent) badge.textContent = 'Ranking global · conectando…';

      try {
        const session = await ensureSupabaseSession();
        currentPlayerId = session?.user?.id || profile.globalPlayerId || profile.playerId;
        data = await fetchGlobalRanking(game, session);

        if (badge) {
          badge.textContent = data.length
            ? 'Ranking global · online'
            : 'Ranking global · esperando primeros puntajes';
        }
      } catch (err) {
        console.warn('Lectura ranking global:', err);
        if (badge) badge.textContent = 'Ranking global · sin conexión';
        // Nunca presentamos datos manipulables de localStorage como si fueran globales.
        data = [];
      }
    } else if (badge) {
      badge.textContent = 'Ranking local · Supabase pendiente';
    }

    if (renderSequence !== rankingRenderSequence) return;
    renderRankingPodium(data, currentPlayerId);

    if (!data.length) {
      body.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    body.innerHTML = data.map((r, i) => {
      const position = i + 1;
      const rec = rankingRecognition(position);
      const isPlayer = r.playerId === currentPlayerId;
      const date = r.at
        ? new Intl.DateTimeFormat('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          }).format(new Date(r.at))
        : '—';

      return `<tr class="ranking-table-row rank-${rec.className} ${isPlayer ? 'is-player' : ''}">
        <td data-label="Puesto"><span class="table-position"><b>#${position}</b><i>${rec.icon}</i></span></td>
        <td data-label="Jugador"><button type="button" class="table-player public-profile-table-trigger" data-public-profile-id="${escapeHTML(r.playerId || '')}">${rankingAvatarMarkup(r, 'table-avatar')}<span><strong>${escapeHTML(r.name || 'Jugador')}${isPlayer ? ' · vos' : ''}</strong><small>${position <= 3 ? 'En el podio' : 'Competidor Top 10'}</small></span></button></td>
        <td data-label="Reconocimiento"><span class="rank-recognition rank-recognition-${rec.className}">${rec.icon} ${rec.label}</span></td>
        <td data-label="Juego" class="rank-game-col"><span class="rank-game-name">${GAME_EMOJIS[game] || '🎮'} ${escapeHTML(GAME_LABELS[game] || game)}</span></td>
        <td data-label="Puntos" class="rank-score-col"><strong>${Number(r.score) || 0}</strong></td>
        <td data-label="Actualizado" class="rank-date-col">${date}</td>
      </tr>`;
    }).join('');
  }

  function renderPersonalRecords() {
    const box=document.getElementById('personal-records'); if(!box)return;
    box.innerHTML=Object.keys(GAME_LABELS).map(g=>`<div class="record-tile"><span>${GAME_EMOJIS[g]} ${GAME_LABELS[g]}</span><strong>${records?.[g]||0}</strong></div>`).join('');
  }

  function renderProfile() {
    const info=levelInfo();
    const el=id=>document.getElementById(id);
    if(el('player-name-input') && document.activeElement!==el('player-name-input')) el('player-name-input').value=profile.name||'Jugador';
    if(el('profile-avatar')) {
      const avatarEl = el('profile-avatar');
      const nextAvatar = currentPlayerAvatarUrl();
      if (nextAvatar && avatarEl.getAttribute('src') !== nextAvatar) avatarEl.src = nextAvatar;
      // El fallback del perfil del visitante es genérico. Nunca mostramos el avatar
      // personal de Rayito que pertenece exclusivamente a la sección Inicio.
      avatarEl.onerror = () => {
        avatarEl.onerror = null;
        if (avatarLocalObjectUrl && avatarEl.src !== avatarLocalObjectUrl) {
          avatarEl.src = avatarLocalObjectUrl;
        } else {
          avatarEl.src = PLAYER_DEFAULT_AVATAR;
        }
      };
    }
    if(el('profile-level-badge')) el('profile-level-badge').textContent=`LV. ${info.level}`;
    if(el('profile-level-text')) el('profile-level-text').textContent=`Nivel ${info.level}`;
    if(el('profile-xp-text')) el('profile-xp-text').textContent=`${info.into} / ${info.need} XP`;
    if(el('profile-xp-bar')) el('profile-xp-bar').style.width=`${Math.min(100,(info.into/info.need)*100)}%`;
    if(el('profile-games')) el('profile-games').textContent=profile.gamesPlayed||0;
    if(el('profile-favorites')) el('profile-favorites').textContent=profile.favorites.length;
    if(el('profile-achievements-count')) el('profile-achievements-count').textContent=profile.achievements.length;
    document.querySelectorAll('[data-peripheral-key]').forEach(input => {
      const key = String(input.dataset.peripheralKey || '');
      if (!key || document.activeElement === input) return;
      input.value = String(profile.peripherals?.[key] || '');
    });
    renderAchievements();
  }
  function renderAchievements() {
    const box=document.getElementById('achievements-grid'); if(!box)return;
    box.innerHTML=ACHIEVEMENTS.map(a=>`<div class="achievement ${profile.achievements.includes(a.id)?'is-unlocked':''}"><span class="achievement-icon">${a.icon}</span><div><strong>${escapeHTML(a.title)}</strong><p>${escapeHTML(a.desc)}</p></div></div>`).join('');
    const progress=document.getElementById('achievement-progress'); if(progress)progress.textContent=`${profile.achievements.length}/${ACHIEVEMENTS.length}`;
  }

  function currentTrack() { try { return canciones[indiceCancionActual] || null; } catch { return null; } }
  function trackId(c) { return c?.archivo || ''; }
  function isFavorite(c) { return profile.favorites.includes(trackId(c)); }
  async function coverFor(c) {
    if (!c) return CONFIG.profile?.avatar || 'avatar.gif';
    if (c.libraryCoverUrl) return c.libraryCoverUrl;
    if (c.portada) return c.portada;
    if (c.portadaBlob) {
      c.libraryCoverUrl=URL.createObjectURL(c.portadaBlob); libraryObjectUrls.add(c.libraryCoverUrl); return c.libraryCoverUrl;
    }
    try {
      const found=await buscarPortadaExterna(c.archivo);
      if(found){ c.libraryCoverUrl=found; return found; }
    } catch {}
    return CONFIG.profile?.avatar || 'avatar.gif';
  }
  async function ensureTrackData(c) {
    try { await leerMetadataArchivo(c); } catch {}
    if (!Number.isFinite(c.duracion)) {
      c.duracion = await new Promise(resolve => {
        const probe=new Audio(); probe.preload='metadata';
        const clean=()=>{ probe.removeAttribute('src'); probe.load(); };
        const timer=setTimeout(()=>{clean();resolve(NaN)},4500);
        probe.addEventListener('loadedmetadata',()=>{ clearTimeout(timer); const d=probe.duration; clean(); resolve(d); },{once:true});
        probe.addEventListener('error',()=>{clearTimeout(timer);clean();resolve(NaN)},{once:true});
        probe.src=c.archivo;
      });
    }
    return c;
  }
  function formatTime(seconds) {
    if(!Number.isFinite(seconds)) return '--:--';
    const m=Math.floor(seconds/60), s=Math.floor(seconds%60); return `${m}:${String(s).padStart(2,'0')}`;
  }
  async function renderMusicLibrary() {
    const box=document.getElementById('music-library'); if(!box)return;
    let tracks=[]; try{tracks=[...canciones]}catch{return;}
    const search=currentSearch.trim().toLowerCase();
    tracks=tracks.filter(c=>{
      const title=(c.tituloDetectado||c.titulo||nombreDesdeArchivo(c.archivo)).toLowerCase();
      const artist=(c.artistaDetectado||c.artista||'Rayito Playlist').toLowerCase();
      const matches=!search || `${title} ${artist}`.includes(search);
      const filter=musicFilter==='favorites' ? isFavorite(c) : true;
      return matches && filter;
    });
    const empty=document.getElementById('empty-music'); if(empty)empty.hidden=tracks.length>0;
    box.innerHTML=tracks.map(c=>{
      const title=c.tituloDetectado||c.titulo||nombreDesdeArchivo(c.archivo);
      const artist=c.artistaDetectado||c.artista||'Rayito Playlist';
      return `<div class="track-row ${c.indice===indiceCancionActual?'is-active':''}" data-track-index="${c.indice}"><div class="track-vinyl ${c.indice===indiceCancionActual && !audio.paused?'is-playing':''}" aria-hidden="true"><span class="track-vinyl-label"></span><span class="track-vinyl-hole"></span></div><div class="track-meta"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(artist)}</span></div><span class="track-duration" data-duration-index="${c.indice}">${formatTime(c.duracion)}</span><button class="track-favorite ${isFavorite(c)?'is-favorite':''}" data-favorite-index="${c.indice}" aria-label="Favorito">${isFavorite(c)?'♥':'♡'}</button></div>`;
    }).join('');
    box.querySelectorAll('.track-row').forEach(row=>row.addEventListener('click',e=>{
      if(e.target.closest('[data-favorite-index]')) return;
      seleccionarCancion(Number(row.dataset.trackIndex),true);
    }));
    box.querySelectorAll('[data-favorite-index]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toggleFavorite(Number(btn.dataset.favoriteIndex));}));
    tracks.forEach(async c=>{
      await ensureTrackData(c);
      const d=box.querySelector(`[data-duration-index="${c.indice}"]`); if(d)d.textContent=formatTime(c.duracion);
      const row=box.querySelector(`[data-track-index="${c.indice}"]`);
      if(row){ const strong=row.querySelector('.track-meta strong'),span=row.querySelector('.track-meta span'); if(strong)strong.textContent=c.tituloDetectado||c.titulo||nombreDesdeArchivo(c.archivo); if(span)span.textContent=c.artistaDetectado||c.artista||'Rayito Playlist'; }
    });
    updateQueue();
  }
  function toggleFavorite(index=indiceCancionActual) {
    let c; try{c=canciones[index]}catch{return;}
    if(!c)return;
    const id=trackId(c); const pos=profile.favorites.indexOf(id);
    if(pos>=0){ profile.favorites.splice(pos,1); mostrarToast('Quitada de favoritas'); }
    else { profile.favorites.push(id); unlockAchievement('favorite_song',true); addXP(20,'favorita',true); mostrarToast('♥ Agregada a favoritas'); }
    saveProfile(); renderMusicLibrary(); updateFavoriteButton(); renderProfile();
  }
  function updateFavoriteButton() {
    const btn=document.getElementById('btn-favorito'); const c=currentTrack(); if(!btn||!c)return;
    const fav=isFavorite(c); btn.classList.toggle('is-favorite',fav); btn.textContent=fav?'♥':'♡'; btn.title=fav?'Quitar de favoritas':'Agregar a favoritas';
  }
  function nextIndex() {
    if(shuffleEnabled && canciones.length>1){ let n=indiceCancionActual; while(n===indiceCancionActual)n=Math.floor(Math.random()*canciones.length); return n; }
    return (indiceCancionActual+1)%canciones.length;
  }
  function manejarFinCancion() {
    if(repeatMode==='one'){ audio.currentTime=0; reproducirAudio(); return; }
    if(repeatMode==='off' && !shuffleEnabled && indiceCancionActual===canciones.length-1){ audio.currentTime=0; sincronizarIconosPlay(); return; }
    seleccionarCancion(nextIndex(),true);
  }
  function updateRepeatButton() {
    const b=document.getElementById('btn-repeat'); if(!b)return;
    const label={off:'off',all:'todo',one:'1'}[repeatMode]||'off'; b.textContent=`↻ Repetir: ${label}`; b.classList.toggle('is-active',repeatMode!=='off');
  }
  function updateShuffleButton() {
    const b=document.getElementById('btn-shuffle'); if(!b)return; b.textContent=shuffleEnabled?'🔀 Aleatorio: sí':'🔀 Aleatorio'; b.classList.toggle('is-active',shuffleEnabled);
  }
  function updateQueue() {
    const box=document.getElementById('queue-list'); if(!box)return;
    let list=[]; try{
      for(let step=1;step<=Math.min(6,canciones.length);step++){
        const idx=(indiceCancionActual+step)%canciones.length; if(idx===indiceCancionActual)continue; list.push(canciones[idx]);
      }
    }catch{}
    box.innerHTML=list.length?list.map((c,i)=>`<div class="queue-item"><span>${i+1}. ${escapeHTML(c.tituloDetectado||c.titulo||nombreDesdeArchivo(c.archivo))}</span><span>${escapeHTML(c.artistaDetectado||c.artista||'Rayito Playlist')}</span></div>`).join(''):'<div class="empty-state">No hay más canciones.</div>';
  }
  async function onTrackChange(c, index) {
    localStorage.setItem(LAST_TRACK_KEY,String(index));
    const title=c.tituloDetectado||c.titulo||nombreDesdeArchivo(c.archivo);
    const artist=c.artistaDetectado||c.artista||'Rayito Playlist';
    const homeTitle=document.getElementById('home-track-title'), homeArtist=document.getElementById('home-track-artist'), homeCover=document.getElementById('home-track-cover');
    if(homeTitle)homeTitle.textContent=title; if(homeArtist)homeArtist.textContent=artist;
    if(homeCover)homeCover.src=await coverFor(c);
    updateFavoriteButton(); renderMusicLibrary(); updateQueue();
  }
  function onPlaybackState(playing) {
    const home=document.getElementById('home-play-icon'); if(home)home.textContent=playing?'❚❚':'▶';
    const visual=document.querySelector('.player-visual'); if(visual)visual.classList.toggle('is-playing',playing);
    const vinyl=document.querySelector('.vinyl-record'); if(vinyl)vinyl.classList.toggle('is-playing',playing);
    document.querySelectorAll('.track-vinyl').forEach(v=>v.classList.remove('is-playing'));
    if(playing){ const activeVinyl=document.querySelector('.track-row.is-active .track-vinyl'); if(activeVinyl)activeVinyl.classList.add('is-playing'); }
    if(playing){
      const c=currentTrack(); const id=trackId(c);
      if(id && id!==lastPlaybackCountedTrack){
        lastPlaybackCountedTrack=id; profile.trackPlays=(profile.trackPlays||0)+1; saveProfile();
        if(profile.trackPlays>=10)unlockAchievement('music_lover');
      }
      startAudioReactive();
    } else {
      stopAudioReactive();
    }
  }

  // Efecto visual desacoplado del elemento <audio>.
  // No usa createMediaElementSource(), así que nunca puede cortar la salida de sonido.
  function startAudioReactive() {
    if(reactiveAnimationId) return;
    const loop=()=>{
      if(audio.paused || audio.ended){ stopAudioReactive(); return; }
      const t=Number.isFinite(audio.currentTime) ? audio.currentTime : performance.now()/1000;
      const pulse=(Math.sin(t*5.2)+1)/2;
      document.documentElement.style.setProperty('--beat-scale',String(.78+pulse*.055));
      document.documentElement.style.setProperty('--beat-opacity',String(.16+pulse*.075));
      reactiveAnimationId=requestAnimationFrame(loop);
    };
    reactiveAnimationId=requestAnimationFrame(loop);
  }

  function stopAudioReactive() {
    if(reactiveAnimationId){ cancelAnimationFrame(reactiveAnimationId); reactiveAnimationId=0; }
    document.documentElement.style.setProperty('--beat-scale','.78');
    document.documentElement.style.setProperty('--beat-opacity','.18');
  }

  async function openGame(game) {
    navigate('juegos');
    return startVerifiedGame(game);
  }

  function setupPWA() {
    if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(()=>{});
    window.addEventListener('beforeinstallprompt',e=>{
      e.preventDefault(); deferredInstallPrompt=e;
      document.querySelectorAll('.install-trigger').forEach(b=>{ b.hidden=false; b.disabled=false; });
    });
    document.querySelectorAll('.install-trigger').forEach(b=>b.addEventListener('click',async()=>{
      if(!deferredInstallPrompt){ mostrarToast('La instalación aparece en HTTPS o localhost cuando el navegador la admite.'); return; }
      deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null;
      document.querySelectorAll('.install-trigger').forEach(x=>x.disabled=true);
    }));
  }

  function restorePlayerSettings() {
    const vol=Math.max(0,Math.min(1,Number(localStorage.getItem(VOLUME_KEY) ?? .8)));
    audio.volume=Number.isFinite(vol)?vol:.8;
    const slider=document.getElementById('volumen-slider'); if(slider)slider.value=String(audio.volume);
    audio.addEventListener('volumechange',()=>{ localStorage.setItem(VOLUME_KEY,String(audio.volume)); if(slider && document.activeElement!==slider)slider.value=String(audio.volume); });
    const idx=Number(localStorage.getItem(LAST_TRACK_KEY));
    if(Number.isInteger(idx) && idx>=0){ setTimeout(()=>{ try{ if(idx<canciones.length)seleccionarCancion(idx,false); }catch{} },80); }
  }

  function bindUI() {
    document.addEventListener('click', e => {
      const close = e.target.closest('[data-close-public-profile]');
      if (close) { closePublicProfile(); return; }
      const trigger = e.target.closest('[data-public-profile-id]');
      if (trigger?.dataset?.publicProfileId) {
        e.preventDefault();
        openPublicProfile(trigger.dataset.publicProfileId);
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('public-profile-modal')?.hidden) closePublicProfile();
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.matches?.('.podium-player[data-public-profile-id]')) {
        e.preventDefault();
        openPublicProfile(document.activeElement.dataset.publicProfileId);
      }
    });
    document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.section)));
    document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
    document.getElementById('music-search')?.addEventListener('input',e=>{currentSearch=e.target.value;renderMusicLibrary();});
    document.querySelectorAll('[data-music-filter]').forEach(btn=>btn.addEventListener('click',()=>{ musicFilter=btn.dataset.musicFilter; document.querySelectorAll('[data-music-filter]').forEach(x=>x.classList.toggle('is-active',x===btn)); renderMusicLibrary(); }));
    document.getElementById('btn-favorito')?.addEventListener('click',()=>toggleFavorite());
    document.getElementById('btn-shuffle')?.addEventListener('click',()=>{shuffleEnabled=!shuffleEnabled;localStorage.setItem(SHUFFLE_KEY,shuffleEnabled?'on':'off');updateShuffleButton();updateQueue();});
    document.getElementById('btn-repeat')?.addEventListener('click',()=>{repeatMode=repeatMode==='off'?'all':repeatMode==='all'?'one':'off';localStorage.setItem(REPEAT_KEY,repeatMode);updateRepeatButton();});
    document.getElementById('btn-queue-toggle')?.addEventListener('click',()=>{const q=document.getElementById('queue-panel');q.hidden=!q.hidden;if(!q.hidden)updateQueue();});
    document.getElementById('queue-close')?.addEventListener('click',()=>document.getElementById('queue-panel').hidden=true);
    document.getElementById('song-request-toggle')?.addEventListener('click',()=>setSongRequestDrawerOpen());
    document.getElementById('song-request-close')?.addEventListener('click',()=>setSongRequestDrawerOpen(false));
    document.getElementById('song-request-form')?.addEventListener('submit',async e=>{
      e.preventDefault();
      await sendSongRequest(document.getElementById('song-request-input')?.value || '');
    });
    document.getElementById('song-request-input')?.addEventListener('input',e=>{
      const value=String(e.target?.value||'').slice(0,180);
      const count=document.getElementById('song-request-count');
      if(count) count.textContent=String(value.length);
      e.target.style.height='auto';
      e.target.style.height=`${Math.min(e.target.scrollHeight,80)}px`;
    });
    document.getElementById('song-request-input')?.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.getElementById('song-request-form')?.requestSubmit();}
    });
    document.getElementById('song-request-list')?.addEventListener('click',async e=>{
      const button=e.target.closest('[data-song-request-review]');
      if(!button)return;
      await reviewSongRequest(button.dataset.requestId||'',button.dataset.songRequestReview||'');
    });
    document.getElementById('home-ranking-toggle')?.addEventListener('click',()=>setHomeRankingOpen());
    document.getElementById('home-ranking-game')?.addEventListener('change',e=>{
      e.currentTarget.dataset.touched='1';
      const main=document.getElementById('ranking-game');
      if(main) main.value=e.currentTarget.value;
      renderHomeGlobalRanking(false).catch(()=>{});
    });
    document.getElementById('ranking-game')?.addEventListener('change',e=>{
      renderRanking();
      const home=document.getElementById('home-ranking-game');
      if(home) home.value=e.currentTarget.value;
      if(homeRankingDrawerOpen()) renderHomeGlobalRanking(true).catch(()=>{});
    });
    document.getElementById('community-chat-form')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const input=document.getElementById('community-chat-input');
      await sendCommunityChatMessage(input?.value||'');
    });
    document.getElementById('community-chat-input')?.addEventListener('input',e=>{
      const value=String(e.target?.value||'').slice(0,280);
      const count=document.getElementById('community-chat-count');
      if(count)count.textContent=String(value.length);
      e.target.style.height='auto';
      e.target.style.height=`${Math.min(e.target.scrollHeight,110)}px`;
    });
    document.getElementById('community-chat-input')?.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        document.getElementById('community-chat-form')?.requestSubmit();
      }
    });
    document.getElementById('save-player-name')?.addEventListener('click',async()=>{
      const input=document.getElementById('player-name-input');
      const name=(input?.value||'').trim().replace(/\s+/g,' ').slice(0,20);
      if(name.length<2){mostrarToast('Usá un nombre de al menos 2 caracteres.');return;}

      profile.name=name;
      saveProfile();
      addActivity('◎','Nombre actualizado',name);
      renderProfile();

      const profileSession = globalEnabled() ? await ensureSupabaseSession().catch(() => null) : null;
      if(globalEnabled() && isPermanentSession(profileSession)){
        try{
          const session=profileSession;
          await saveRemotePlayerProfile(session,name,profile.avatarPath||null);
          const remote = await fetchRemotePlayerProfile(session);
          if (remote) {
            profile.globalPlayerId = remote.user_id;
            profile.avatarPath = remote.avatar_path || profile.avatarPath || '';
            profile.avatarVersion = remote.updated_at ? Date.parse(remote.updated_at) || Date.now() : Date.now();
            saveProfile();
          }
          // Si había una foto/GIF guardada localmente de un intento anterior,
          // la sincronizamos ahora que el perfil ya tiene permisos válidos.
          await syncPendingLocalAvatarToSupabase(session);
          mostrarToast('Perfil sincronizado');
        }catch(err){
          console.warn('Guardar perfil global:',err);
          mostrarToast(`Supabase: ${String(err?.message || err).slice(0, 90)}`);
        }
      }else{
        mostrarToast(globalEnabled() ? 'Perfil guardado en este navegador · creá una cuenta para publicarlo.' : 'Perfil guardado');
      }

      await renderRanking();
      await renderCommunityChat(true).catch(()=>{});
    });
    document.getElementById('save-player-peripherals')?.addEventListener('click', async()=>{
      const status = document.getElementById('profile-peripherals-status');
      const values = {};
      document.querySelectorAll('[data-peripheral-key]').forEach(input => {
        const key = String(input.dataset.peripheralKey || '');
        if (key) values[key] = input.value;
      });
      profile.peripherals = sanitizePeripherals(values);
      saveProfile();
      renderProfile();

      const cleanName = String(profile.name || '').trim().replace(/\s+/g,' ').slice(0,20);
      const peripheralSession = globalEnabled() ? await ensureSupabaseSession().catch(() => null) : null;
      if (!globalEnabled() || !isPermanentSession(peripheralSession) || cleanName.length < 2 || cleanName.toLowerCase() === 'jugador') {
        if (status) status.textContent = isPermanentSession(peripheralSession)
          ? 'Guardados en este navegador. Completá tu Perfil para sincronizarlos.'
          : 'Guardados en este navegador. Creá una cuenta para conservarlos en la nube.';
        mostrarToast('PC y periféricos guardados localmente');
        return;
      }

      try {
        const session = peripheralSession;
        const row = await saveRemotePlayerProfile(session, cleanName, profile.avatarPath || null, profile.peripherals);
        if (row?.peripherals !== undefined) profile.peripherals = sanitizePeripherals(row.peripherals);
        saveProfile();
        renderProfile();
        if (status) status.textContent = 'Periféricos sincronizados con tu perfil.';
        mostrarToast('Periféricos sincronizados');
      } catch (err) {
        console.warn('Guardar periféricos:', err);
        if (status) status.textContent = `Guardados localmente · Supabase: ${String(err?.message || err).slice(0,90)}`;
        mostrarToast('Periféricos guardados localmente');
      }
    });
    document.querySelectorAll('[data-peripheral-key]').forEach(input => input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){ e.preventDefault(); document.getElementById('save-player-peripherals')?.click(); }
    }));
    document.getElementById('player-name-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('save-player-name')?.click();});
    document.getElementById('choose-player-avatar')?.addEventListener('click',()=>document.getElementById('player-avatar-input')?.click());
    document.getElementById('player-avatar-input')?.addEventListener('change',async e=>{
      const file=e.target?.files?.[0];
      if(file) await handlePlayerAvatarFile(file);
      e.target.value='';
    });

    document.addEventListener('click', async e => {
      const close = e.target.closest('[data-account-close]');
      if (close) { closeAccountModal(); return; }
      const target = e.target.closest('[data-account-action]');
      if (!target) return;
      const action = target.dataset.accountAction;
      if (action === 'signup') openAccountModal('signup');
      else if (action === 'login') openAccountModal('login');
      else if (action === 'recover') openAccountModal('recover');
      else if (action === 'menu' || action === 'manage') openAccountModal('menu');
      else if (action === 'sync') {
        target.disabled = true;
        try {
          const ok = await syncAccountProgressNow();
          mostrarToast(ok ? 'Progreso sincronizado con la nube' : 'Iniciá sesión para sincronizar');
        } catch (err) { mostrarToast(`No se pudo sincronizar: ${String(err?.message || err).slice(0,80)}`); }
        finally { target.disabled = false; }
      } else if (action === 'logout') {
        target.disabled = true;
        try { await syncAccountProgressNow().catch(() => {}); await signOutPermanentAccount(); closeAccountModal(); }
        finally { target.disabled = false; }
      }
    });

    document.querySelector('[data-account-view="signup"]')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('signup-email')?.value || '';
      const submit = e.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
      setAccountFormStatus('signup-status','Preparando verificación…');
      try {
        const result = await signUpPermanentAccount(email);
        if (result.confirmationRequired) {
          setAccountFormStatus('signup-status','Te enviamos un correo. Abrí el enlace para verificarlo y volver a Rayito Hub; ahí vas a crear tu contraseña.','success');
        } else if (result.needsPassword) {
          setAccountFormStatus('signup-status','Correo verificado. Ahora creá tu contraseña.','success');
        }
      } catch (err) {
        const msg = String(err?.message || err);
        setAccountFormStatus('signup-status', msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')
          ? 'Ese correo ya pertenece a una cuenta. Usá “Iniciar sesión”.'
          : msg, 'error');
      } finally { submit.disabled = false; }
    });

    document.querySelector('[data-account-view="login"]')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('login-email')?.value || '';
      const pass = document.getElementById('login-password')?.value || '';
      const submit = e.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
      setAccountFormStatus('login-status','Iniciando sesión…');
      try {
        await signInPermanentAccount(email, pass);
        setAccountFormStatus('login-status','Cuenta conectada. Progreso recuperado.','success');
        renderAccountState(); setTimeout(closeAccountModal,650);
      } catch (err) { setAccountFormStatus('login-status',String(err?.message || err),'error'); }
      finally { submit.disabled = false; }
    });

    document.querySelector('[data-account-view="recover"]')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('recover-email')?.value || '';
      const submit = e.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
      setAccountFormStatus('recover-status','Enviando enlace…');
      try {
        await requestPasswordRecovery(email);
        setAccountFormStatus('recover-status',/^https?:$/.test(location.protocol)
          ? 'Listo. Revisá tu correo y abrí el enlace para elegir una contraseña nueva.'
          : 'Solicitud enviada. La recuperación debe completarse desde la URL pública configurada en Supabase.', 'success');
      } catch (err) { setAccountFormStatus('recover-status',String(err?.message || err),'error'); }
      finally { submit.disabled = false; }
    });

    document.querySelector('[data-account-view="new-password"]')?.addEventListener('submit', async e => {
      e.preventDefault();
      const pass = document.getElementById('new-password')?.value || '';
      const confirm = document.getElementById('new-password-confirm')?.value || '';
      if (pass.length < 8) { setAccountFormStatus('new-password-status','Usá al menos 8 caracteres.','error'); return; }
      if (pass !== confirm) { setAccountFormStatus('new-password-status','Las contraseñas no coinciden.','error'); return; }
      const submit = e.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
      setAccountFormStatus('new-password-status','Actualizando contraseña…');
      try { await updateRecoveryPassword(pass); setAccountFormStatus('new-password-status','Contraseña actualizada. Ya podés usar tu cuenta.','success'); setTimeout(() => { pendingRecoverySession = null; closeAccountModal(); },800); }
      catch (err) { setAccountFormStatus('new-password-status',String(err?.message || err),'error'); }
      finally { submit.disabled = false; }
    });

    window.addEventListener('keydown', e => { if (e.key === 'Escape' && !pendingRecoverySession) closeAccountModal(); });
    window.addEventListener('hashchange',()=>navigate(location.hash.replace('#','')||'inicio',false));
  }

  function init() {
    const authCallbackPromise = handleAuthCallbackFromUrl();
    applyConfig(); bindUI(); setupPWA(); restorePlayerSettings(); renderAccountState();
    restoreLocalAvatarBackup().then(async (restored) => {
      if (restored && globalEnabled()) {
        const changed = await syncPendingLocalAvatarToSupabase().catch(() => false);
        if (changed) await renderRanking().catch(() => {});
      }
    }).catch(() => {});
    renderHomeStats(); renderActivity(); renderDaily(); renderProfile(); renderPersonalRecords(); renderRanking(); renderCommunityChat();
    updateRepeatButton(); updateShuffleButton();
    const initial=(location.hash||'#inicio').slice(1); navigate(initial,false);
    setTimeout(()=>{ renderMusicLibrary(); const c=currentTrack(); if(c)onTrackChange(c,indiceCancionActual); },250);
    window.addEventListener('beforeunload',()=>{
      stopRankingRealtime();
      if (rankingFallbackPollId) { clearInterval(rankingFallbackPollId); rankingFallbackPollId = 0; }
      if (rankingRealtimeRefreshId) { clearTimeout(rankingRealtimeRefreshId); rankingRealtimeRefreshId = 0; }
      if (communityChatRefreshId) { clearTimeout(communityChatRefreshId); communityChatRefreshId = 0; }
      if (songRequestRefreshId) { clearTimeout(songRequestRefreshId); songRequestRefreshId = 0; }
      if (publicProfileSyncTimer) { clearTimeout(publicProfileSyncTimer); publicProfileSyncTimer = 0; }
      if (accountProgressSyncTimer) { clearTimeout(accountProgressSyncTimer); accountProgressSyncTimer = 0; }
      libraryObjectUrls.forEach(url=>{try{URL.revokeObjectURL(url)}catch{}});
      if (avatarPreviewObjectUrl) { try { URL.revokeObjectURL(avatarPreviewObjectUrl); } catch {} }
      if (avatarLocalObjectUrl) { try { URL.revokeObjectURL(avatarLocalObjectUrl); } catch {} }
    });
  }

  if(globalEnabled() && !String(location.hash || '').includes('access_token=')) {
    ensureSupabaseSession()
      .then(async (session) => {
        if (isPermanentSession(session)) {
          const pendingEmail = String(localStorage.getItem(PENDING_ACCOUNT_EMAIL_KEY) || '').trim().toLowerCase();
          if (pendingEmail && pendingEmail === currentAccountEmail(session).toLowerCase()) {
            pendingRecoverySession = session;
            pendingPasswordSetupMode = 'signup';
            openAccountModal('new-password');
          }
          try { await hydrateAccountProgress(session, { migrateLocalIfEmpty: true }); }
          catch (err) { console.warn('Progreso en la nube:', err); }
          try { await ensureRemotePlayerProfile(); }
          catch (err) { console.warn('Perfil global:', err); }
          try { await syncPendingLocalAvatarToSupabase(session); } catch {}
        }
        renderAccountState();
        startRankingRealtime(session);
        await renderRanking();
        await renderCommunityChat().catch(() => {});
        return session;
      })
      .catch(err => console.warn('Supabase Auth:', err));
  }


  // Exponemos únicamente el puente mínimo que necesita legacy.js y lo congelamos
  // para evitar sobrescrituras accidentales o manipulaciones triviales.
  Object.defineProperty(window, 'RayitoApp', {
    value: Object.freeze({ onGameStart, onScore, onTrackChange, onPlaybackState, navigate, openGame, restartVerifiedGame }),
    writable: false,
    configurable: false,
    enumerable: false,
  });
  window.manejarFinCancion = manejarFinCancion;

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
