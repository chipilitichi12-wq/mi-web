const audio = document.getElementById('mi-musica');
        const barra = document.getElementById('progreso-actual');
        const playIcon = document.getElementById('icon-play');
        const pauseIcon = document.getElementById('icon-pause');
        const videoFondo = document.getElementById('video-fondo');
        const portadaCancion = document.getElementById('portada-cancion');
        const tituloCancion = document.getElementById('titulo-cancion');
        const artistaCancion = document.getElementById('artista-cancion');
        const selectorCancion = document.getElementById('selector-cancion');
        const contadorCancion = document.getElementById('contador-cancion');
        const canciones = (Array.isArray(window.RAYITO_CANCIONES) && window.RAYITO_CANCIONES.length
            ? window.RAYITO_CANCIONES
            : ['tu-cancion.mp3'])
            .map((item, indice) => typeof item === 'string' ? { archivo: item } : { ...item })
            .filter(item => item.archivo)
            .map((item, indice) => ({ ...item, indice, metadataCargada: false }));
        let indiceCancionActual = 0;
        let portadaObjectUrl = null;
        const CLAVE_RECORDS = 'rayito-records-v2';
        const factoresDificultad = { facil: 0.76, normal: 1, dificil: 1.32 };

        let dificultadActual = localStorage.getItem('rayito-dificultad') || 'normal';
        let juegoPausado = false;
        let inicioPausaJuego = 0;
        let sonidoJuegoActivo = localStorage.getItem('rayito-sonido-juego') !== 'off';
        let contextoAudioJuego = null;
        let toastTimeout = null;
        let recursosCargados = new Set();
        let cargaCompletada = false;
        let records = {};

        try {
            records = JSON.parse(localStorage.getItem(CLAVE_RECORDS) || '{}');
        } catch {
            records = {};
        }

        function cambiarTema(tema, guardar = true) {
            const temas = ['rayito', 'neon', 'fuego', 'noche'];
            const coloresTema = {
                rayito: '#ffd700',
                neon: '#00f5d4',
                fuego: '#ff6b35',
                noche: '#8ea8ff'
            };
            const elegido = temas.includes(tema) ? tema : 'rayito';
            document.body.dataset.theme = elegido;
            document.getElementById('selector-tema').value = elegido;
            document.querySelector('meta[name="theme-color"]').content = coloresTema[elegido];
            if (guardar) localStorage.setItem('rayito-tema', elegido);
        }

        function mostrarToast(mensaje) {
            const toast = document.getElementById('toast');
            toast.textContent = mensaje;
            toast.classList.add('is-visible');
            clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2400);
        }

        async function copiarEnlace() {
            try {
                await navigator.clipboard.writeText(location.href);
                mostrarToast('Enlace copiado');
            } catch {
                mostrarToast('Copiá la dirección desde el navegador');
            }
        }

        async function compartirSitio() {
            const datos = {
                title: document.title,
                text: 'Entrá al mundo de Rayito ⚡️',
                url: location.href
            };
            if (navigator.share) {
                try {
                    await navigator.share(datos);
                    return;
                } catch (error) {
                    if (error.name === 'AbortError') return;
                }
            }
            copiarEnlace();
        }

        function actualizarCarga(nombre) {
            recursosCargados.add(nombre);
            const total = 4;
            const porcentaje = Math.min(100, Math.round((recursosCargados.size / total) * 100));
            document.getElementById('progreso-carga').style.width = `${porcentaje}%`;
            document.getElementById('texto-carga').textContent = porcentaje < 100
                ? `Preparando todo… ${porcentaje}%`
                : 'Video, música y juegos listos';

            if (porcentaje >= 100 && !cargaCompletada) {
                cargaCompletada = true;
                const boton = document.getElementById('btn-entrar');
                boton.disabled = false;
                boton.textContent = 'Mi Mundo';
                document.getElementById('indicacion-entrada').hidden = false;
            }
        }

        function iniciarCarga() {
            const avatar = document.getElementById('avatar-principal');
            if (avatar.complete) actualizarCarga('avatar');
            else avatar.addEventListener('load', () => actualizarCarga('avatar'), { once: true });

            if (videoFondo.readyState >= 3) actualizarCarga('video');
            else videoFondo.addEventListener('canplay', () => actualizarCarga('video'), { once: true });

            if (audio.readyState >= 1) actualizarCarga('audio');
            else audio.addEventListener('loadedmetadata', () => actualizarCarga('audio'), { once: true });

            if (document.readyState === 'complete') actualizarCarga('pagina');
            else window.addEventListener('load', () => actualizarCarga('pagina'), { once: true });

            setTimeout(() => {
                ['avatar', 'video', 'audio', 'pagina'].forEach(actualizarCarga);
            }, 5500);
        }

        function actualizarRecordsUI() {
            document.querySelectorAll('[data-record]').forEach(elemento => {
                const juego = elemento.dataset.record;
                elemento.textContent = `Récord: ${records[juego] || 0}`;
            });
            if (currentGame) {
                document.getElementById('record-juego').textContent = records[currentGame] || 0;
            }
        }

        function guardarRecord(juego, puntaje) {
            const valor = Math.max(0, Math.round(puntaje || 0));
            const fueNuevo = valor > (records[juego] || 0);
            if (fueNuevo) {
                records[juego] = valor;
                localStorage.setItem(CLAVE_RECORDS, JSON.stringify(records));
                actualizarRecordsUI();
                mostrarToast(`¡Nuevo récord: ${valor}!`);
                feedbackJuego('record');
            }
            if (window.RayitoApp && typeof window.RayitoApp.onScore === 'function') {
                window.RayitoApp.onScore(juego, valor, fueNuevo);
            }
            return fueNuevo;
        }

        function factorDificultad() {
            return factoresDificultad[dificultadActual] || 1;
        }

        function cambiarDificultad(valor) {
            dificultadActual = factoresDificultad[valor] ? valor : 'normal';
            localStorage.setItem('rayito-dificultad', dificultadActual);
            if (currentGame) reiniciarJuegoActual();
        }

        function toggleSonidoJuego() {
            sonidoJuegoActivo = !sonidoJuegoActivo;
            localStorage.setItem('rayito-sonido-juego', sonidoJuegoActivo ? 'on' : 'off');
            document.getElementById('btn-sonido-juego').textContent = sonidoJuegoActivo ? '🔊 Sonido' : '🔇 Sonido';
            if (sonidoJuegoActivo) feedbackJuego('punto');
        }

        function feedbackJuego(tipo = 'punto') {
            if (navigator.vibrate) {
                const patrones = { punto: 20, gol: [25, 30, 45], fin: [80, 40, 100], record: [30, 25, 30, 25, 80] };
                navigator.vibrate(patrones[tipo] || 20);
            }
            if (!sonidoJuegoActivo) return;

            try {
                contextoAudioJuego ??= new (window.AudioContext || window.webkitAudioContext)();
                const oscilador = contextoAudioJuego.createOscillator();
                const ganancia = contextoAudioJuego.createGain();
                const frecuencias = { punto: 560, gol: 780, fin: 170, record: 980 };
                oscilador.frequency.value = frecuencias[tipo] || 560;
                oscilador.type = tipo === 'fin' ? 'sawtooth' : 'sine';
                ganancia.gain.setValueAtTime(0.06, contextoAudioJuego.currentTime);
                ganancia.gain.exponentialRampToValueAtTime(0.001, contextoAudioJuego.currentTime + 0.12);
                oscilador.connect(ganancia);
                ganancia.connect(contextoAudioJuego.destination);
                oscilador.start();
                oscilador.stop(contextoAudioJuego.currentTime + 0.12);
            } catch {}
        }

        function prepararEstadoJuego() {
            juegoPausado = false;
            document.getElementById('pausa-overlay').hidden = true;
            document.getElementById('game-result-overlay').hidden = true;
            document.getElementById('survivor-upgrade-overlay').hidden = true;
            document.getElementById('penalty-scoreboard').hidden = currentGame !== 'penalty';
            document.getElementById('btn-pausa').textContent = '⏸ Pausa';
            document.getElementById('btn-sonido-juego').textContent = sonidoJuegoActivo ? '🔊 Sonido' : '🔇 Sonido';
            document.getElementById('dificultad-juego').value = dificultadActual;
            actualizarRecordsUI();
        }

        function togglePausaJuego() {
            if (!currentGame || !juegoActivo) return;
                        juegoPausado = !juegoPausado;
            if (juegoPausado) {
                inicioPausaJuego = performance.now();
            } else if (currentGame === 'cohete' && inicioPausaJuego) {
                inicioCohete += performance.now() - inicioPausaJuego;
                inicioPausaJuego = 0;
            } else if (currentGame === 'highway' && inicioPausaJuego) {
                ultimoTiempoHighway = performance.now();
                inicioPausaJuego = 0;
            } else if (currentGame === 'neon' && inicioPausaJuego) {
                ultimoTiempoNeon = performance.now();
                inicioPausaJuego = 0;
            }
            document.getElementById('pausa-overlay').hidden = !juegoPausado;
            document.getElementById('btn-pausa').textContent = juegoPausado ? '▶ Continuar' : '⏸ Pausa';
        }

        function mostrarResultado(titulo, texto, puntaje, icono = '🏆') {
            juegoActivo = false;
            juegoPausado = false;
            clearInterval(intervaloSnake);
            guardarRecord(currentGame, puntaje);
            document.getElementById('resultado-icono').textContent = icono;
            document.getElementById('resultado-titulo').textContent = titulo;
            document.getElementById('resultado-texto').textContent = `${texto} · ${Math.round(puntaje || 0)} puntos`;
            document.getElementById('game-result-overlay').hidden = false;
            document.getElementById('survivor-upgrade-overlay').hidden = true;
            document.getElementById('pausa-overlay').hidden = true;
            feedbackJuego(titulo.includes('GANASTE') ? 'gol' : 'fin');
        }

        function reiniciarJuegoActual() {
            const juego = currentGame;
            document.getElementById('game-result-overlay').hidden = true;

            // El reinicio también debe crear una NUEVA sesión verificada antes
            // de arrancar; si no, el siguiente score quedaría solo local.
            if (window.RayitoApp && typeof window.RayitoApp.restartVerifiedGame === 'function') {
                window.RayitoApp.restartVerifiedGame(juego);
                return;
            }

            const aperturas = {
                highway: abrirJuegoHighway,
                snake: abrirJuegoSnake,
                neon: abrirJuegoNeon,
                breakout: abrirJuegoBreakout,
                cohete: abrirJuegoCohete,
                penalty: abrirJuegoPenalty
            };
            if (aperturas[juego]) aperturas[juego]();
        }

        function abrirMiMundo() {
            if (!cargaCompletada) return;
            const entrada = document.getElementById('pantalla-entrada');
            const mundo = document.getElementById('pantalla-mi-mundo');
            if (entrada) entrada.style.display = 'none';
            if (mundo) {
                mundo.hidden = false;
                requestAnimationFrame(() => mundo.classList.add('is-visible'));
            }
        }

        function volverDesdeMiMundo() {
            const entrada = document.getElementById('pantalla-entrada');
            const mundo = document.getElementById('pantalla-mi-mundo');
            if (mundo) {
                mundo.classList.remove('is-visible');
                mundo.hidden = true;
            }
            if (entrada) entrada.style.display = 'flex';
        }

        function entrar() {
            if (!cargaCompletada) return;
            const entrada = document.getElementById('pantalla-entrada');
            const mundo = document.getElementById('pantalla-mi-mundo');
            if (entrada) entrada.style.display = 'none';
            if (mundo) {
                mundo.classList.remove('is-visible');
                mundo.hidden = true;
            }
            reproducirAudio();
        }

        function sincronizarIconosPlay() {
            const reproduciendo = !audio.paused && !audio.ended;
            playIcon.style.display = reproduciendo ? 'none' : 'block';
            pauseIcon.style.display = reproduciendo ? 'block' : 'none';
            if (window.RayitoApp && typeof window.RayitoApp.onPlaybackState === 'function') window.RayitoApp.onPlaybackState(reproduciendo);
        }

        async function reproducirAudio() {
            try {
                // Si el navegador todavía está cargando el archivo, esperamos a que pueda reproducir.
                if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
                    await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => { cleanup(); resolve(); }, 1800);
                        const onReady = () => { cleanup(); resolve(); };
                        const onError = () => { cleanup(); reject(new Error('No se pudo cargar el audio')); };
                        const cleanup = () => {
                            clearTimeout(timer);
                            audio.removeEventListener('canplay', onReady);
                            audio.removeEventListener('error', onError);
                        };
                        audio.addEventListener('canplay', onReady, { once: true });
                        audio.addEventListener('error', onError, { once: true });
                    });
                }
                await audio.play();
                sincronizarIconosPlay();
                return true;
            } catch (error) {
                sincronizarIconosPlay();
                const nombre = error && error.name ? error.name : '';
                if (nombre === 'NotAllowedError') {
                    mostrarToast('El navegador bloqueó el audio. Tocá Play para iniciarlo.');
                } else if (nombre !== 'AbortError') {
                    console.warn('Rayito Audio:', error);
                    mostrarToast('No se pudo reproducir la canción. Revisá el archivo MP3.');
                }
                return false;
            }
        }

        function togglePlay() {
            if (audio.paused) reproducirAudio();
            else {
                audio.pause();
                sincronizarIconosPlay();
            }
        }

        function ajustarVolumen(valor) {
            audio.volume = valor;
            const iconSound = document.getElementById('icon-sound');
            const iconMute = document.getElementById('icon-mute');
            if (valor == 0) { iconSound.style.display = 'none'; iconMute.style.display = 'block'; }
            else { iconSound.style.display = 'block'; iconMute.style.display = 'none'; }
        }

        function toggleMute() {
            audio.muted = !audio.muted;
            const iconSound = document.getElementById('icon-sound');
            const iconMute = document.getElementById('icon-mute');
            iconSound.style.display = audio.muted ? 'none' : 'block';
            iconMute.style.display = audio.muted ? 'block' : 'none';
        }

        function nombreDesdeArchivo(ruta = '') {
            const nombre = decodeURIComponent(ruta.split('/').pop() || 'Canción')
                .replace(/\.[a-z0-9]{2,5}$/i, '')
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            return nombre ? nombre.replace(/\b\w/g, letra => letra.toUpperCase()) : 'Canción';
        }

        function limpiarTextoId3(texto = '') {
            return String(texto).replace(/\u0000/g, '').trim();
        }

        function leerSynchsafe(bytes, offset) {
            return ((bytes[offset] & 0x7f) << 21) |
                   ((bytes[offset + 1] & 0x7f) << 14) |
                   ((bytes[offset + 2] & 0x7f) << 7) |
                   (bytes[offset + 3] & 0x7f);
        }

        function leerUint32(bytes, offset) {
            return ((bytes[offset] << 24) >>> 0) |
                   (bytes[offset + 1] << 16) |
                   (bytes[offset + 2] << 8) |
                   bytes[offset + 3];
        }

        function buscarFinTexto(bytes, inicio, encoding) {
            if (encoding === 1 || encoding === 2) {
                for (let i = inicio; i + 1 < bytes.length; i += 2) {
                    if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
                }
                return bytes.length;
            }
            for (let i = inicio; i < bytes.length; i++) {
                if (bytes[i] === 0) return i;
            }
            return bytes.length;
        }

        function decodificarTextoId3(bytes, encoding = 0) {
            if (!bytes || !bytes.length) return '';
            try {
                if (encoding === 3) return limpiarTextoId3(new TextDecoder('utf-8').decode(bytes));
                if (encoding === 1) {
                    let data = bytes;
                    if (data[0] === 0xff && data[1] === 0xfe) return limpiarTextoId3(new TextDecoder('utf-16le').decode(data.slice(2)));
                    if (data[0] === 0xfe && data[1] === 0xff) {
                        const invertido = new Uint8Array(Math.max(0, data.length - 2));
                        for (let i = 2; i + 1 < data.length; i += 2) {
                            invertido[i - 2] = data[i + 1];
                            invertido[i - 1] = data[i];
                        }
                        return limpiarTextoId3(new TextDecoder('utf-16le').decode(invertido));
                    }
                    return limpiarTextoId3(new TextDecoder('utf-16le').decode(data));
                }
                if (encoding === 2) {
                    const invertido = new Uint8Array(bytes.length);
                    for (let i = 0; i + 1 < bytes.length; i += 2) {
                        invertido[i] = bytes[i + 1];
                        invertido[i + 1] = bytes[i];
                    }
                    return limpiarTextoId3(new TextDecoder('utf-16le').decode(invertido));
                }
                return limpiarTextoId3(new TextDecoder('windows-1252').decode(bytes));
            } catch {
                return limpiarTextoId3(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
            }
        }

        function extraerMetadataId3(buffer) {
            const bytes = new Uint8Array(buffer);
            const metadata = {};
            if (bytes.length < 10 || String.fromCharCode(...bytes.slice(0, 3)) !== 'ID3') return metadata;

            const version = bytes[3];
            const tagSize = leerSynchsafe(bytes, 6);
            const limite = Math.min(bytes.length, 10 + tagSize);
            let pos = 10;

            while (pos + 10 <= limite) {
                const id = String.fromCharCode(...bytes.slice(pos, pos + 4));
                if (!/^[A-Z0-9]{4}$/.test(id)) break;
                const size = version === 4 ? leerSynchsafe(bytes, pos + 4) : leerUint32(bytes, pos + 4);
                if (!size || pos + 10 + size > bytes.length) break;
                const frame = bytes.slice(pos + 10, pos + 10 + size);

                if ((id === 'TIT2' || id === 'TPE1' || id === 'TALB') && frame.length > 1) {
                    const texto = decodificarTextoId3(frame.slice(1), frame[0]);
                    if (id === 'TIT2') metadata.titulo = texto;
                    if (id === 'TPE1') metadata.artista = texto;
                    if (id === 'TALB') metadata.album = texto;
                }

                if (id === 'APIC' && frame.length > 5 && !metadata.portadaBlob) {
                    const encoding = frame[0];
                    const finMime = frame.indexOf(0, 1);
                    if (finMime > 1) {
                        const mime = decodificarTextoId3(frame.slice(1, finMime), 0) || 'image/jpeg';
                        const descripcionInicio = finMime + 2;
                        const finDescripcion = buscarFinTexto(frame, descripcionInicio, encoding);
                        const salto = (encoding === 1 || encoding === 2) ? 2 : 1;
                        const imagenInicio = Math.min(frame.length, finDescripcion + salto);
                        if (imagenInicio < frame.length) {
                            metadata.portadaBlob = new Blob([frame.slice(imagenInicio)], { type: mime });
                        }
                    }
                }
                pos += 10 + size;
            }
            return metadata;
        }

        async function leerMetadataArchivo(cancion) {
            if (cancion.metadataCargada) return cancion;
            cancion.metadataCargada = true;
            cancion.tituloDetectado = cancion.titulo || nombreDesdeArchivo(cancion.archivo);
            cancion.artistaDetectado = cancion.artista || 'Rayito Playlist';

            try {
                const respuesta = await fetch(cancion.archivo, {
                    headers: { Range: 'bytes=0-2097151' },
                    cache: 'force-cache'
                });
                if (respuesta.ok || respuesta.status === 206) {
                    const metadata = extraerMetadataId3(await respuesta.arrayBuffer());
                    cancion.tituloDetectado = cancion.titulo || metadata.titulo || cancion.tituloDetectado;
                    cancion.artistaDetectado = cancion.artista || metadata.artista || metadata.album || cancion.artistaDetectado;
                    if (metadata.portadaBlob) cancion.portadaBlob = metadata.portadaBlob;
                }
            } catch {}

            const option = selectorCancion.querySelector(`option[value="${cancion.indice}"]`);
            if (option) option.textContent = cancion.tituloDetectado;
            return cancion;
        }

        function probarImagen(url) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve(url);
                img.onerror = () => resolve(null);
                img.src = url;
            });
        }

        async function buscarPortadaExterna(archivo) {
            const base = archivo.replace(/\.[^/.]+$/, '');
            for (const extension of ['jpg', 'jpeg', 'png', 'webp']) {
                const encontrada = await probarImagen(`${base}.${extension}`);
                if (encontrada) return encontrada;
            }
            return null;
        }

        async function actualizarPortada(cancion, token) {
            let nuevaPortada = cancion.portada || null;
            if (!nuevaPortada && cancion.portadaBlob) {
                nuevaPortada = URL.createObjectURL(cancion.portadaBlob);
            }
            if (!nuevaPortada) nuevaPortada = await buscarPortadaExterna(cancion.archivo);
            if (token !== indiceCancionActual) {
                if (nuevaPortada && nuevaPortada.startsWith('blob:')) URL.revokeObjectURL(nuevaPortada);
                return;
            }
            if (portadaObjectUrl) {
                URL.revokeObjectURL(portadaObjectUrl);
                portadaObjectUrl = null;
            }
            portadaCancion.src = nuevaPortada || 'avatar.gif';
            portadaCancion.alt = `Portada de ${cancion.tituloDetectado || nombreDesdeArchivo(cancion.archivo)}`;
            if (nuevaPortada && nuevaPortada.startsWith('blob:')) portadaObjectUrl = nuevaPortada;
        }

        async function seleccionarCancion(indice, reproducir = false) {
            if (!canciones.length) return;
            indiceCancionActual = (indice + canciones.length) % canciones.length;
            const cancion = canciones[indiceCancionActual];
            const estabaReproduciendo = !audio.paused;

            selectorCancion.value = String(indiceCancionActual);
            contadorCancion.textContent = `${indiceCancionActual + 1}/${canciones.length}`;
            tituloCancion.textContent = cancion.titulo || nombreDesdeArchivo(cancion.archivo);
            artistaCancion.textContent = cancion.artista || 'Detectando datos…';
            portadaCancion.src = cancion.portada || 'avatar.gif';
            barra.style.width = '0%';
            document.getElementById('tiempo-actual').textContent = '0:00';
            document.getElementById('duracion').textContent = '0:00';

            const origen = audio.querySelector('source');
            if (origen) origen.src = cancion.archivo;
            audio.src = cancion.archivo;
            audio.load();

            await leerMetadataArchivo(cancion);
            if (indiceCancionActual !== cancion.indice) return;
            tituloCancion.textContent = cancion.tituloDetectado;
            artistaCancion.textContent = cancion.artistaDetectado;
            await actualizarPortada(cancion, cancion.indice);
            if (window.RayitoApp && typeof window.RayitoApp.onTrackChange === 'function') window.RayitoApp.onTrackChange(cancion, indiceCancionActual);

            if (reproducir || estabaReproduciendo) reproducirAudio();
            else sincronizarIconosPlay();
        }

        function cancionAnterior() {
            seleccionarCancion(indiceCancionActual - 1, true);
        }

        function cancionSiguiente() {
            seleccionarCancion(indiceCancionActual + 1, true);
        }

        function inicializarPlaylist() {
            selectorCancion.innerHTML = '';
            canciones.forEach((cancion, indice) => {
                const option = document.createElement('option');
                option.value = String(indice);
                option.textContent = cancion.titulo || nombreDesdeArchivo(cancion.archivo);
                selectorCancion.appendChild(option);
            });
            seleccionarCancion(0, false);
            canciones.slice(1).forEach(cancion => leerMetadataArchivo(cancion));
        }

        audio.addEventListener('play', sincronizarIconosPlay);
        audio.addEventListener('pause', sincronizarIconosPlay);
        audio.addEventListener('ended', () => { if (typeof manejarFinCancion === 'function') manejarFinCancion(); else cancionSiguiente(); });
        audio.addEventListener('error', () => {
            artistaCancion.textContent = 'No se pudo cargar este archivo';
            sincronizarIconosPlay();
            const code = audio.error?.code || 0;
            if (code) console.warn(`Rayito Audio: error de carga (${code})`, audio.currentSrc || audio.src);
        });

        audio.addEventListener('timeupdate', () => {
            const porcentaje = Number.isFinite(audio.duration) && audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
            barra.style.width = porcentaje + '%';
            const progreso = document.querySelector('.barra-progreso');
            if (progreso) progreso.setAttribute('aria-valuenow', String(Math.round(porcentaje)));
            const m = Math.floor(audio.currentTime / 60);
            const s = Math.floor(audio.currentTime % 60);
            document.getElementById('tiempo-actual').innerText = m + ':' + (s < 10 ? '0' + s : s);
        });

        audio.addEventListener('loadedmetadata', () => {
            if (!Number.isFinite(audio.duration)) return;
            const m = Math.floor(audio.duration / 60);
            const s = Math.floor(audio.duration % 60);
            document.getElementById('duracion').innerText = m + ':' + (s < 10 ? '0' + s : s);
        });

        function setPos(event) {
            if (!Number.isFinite(audio.duration)) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const proporcion = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            audio.currentTime = proporcion * audio.duration;
        }

        function abrirMenuLibro() {
            const modal = document.getElementById('modal-libro');
            const caja = document.getElementById('caja-libro');
            actualizarRecordsUI();
            modal.style.display = 'block';
            setTimeout(() => {
                caja.classList.add('is-open');
                const primerBoton = caja.querySelector('button');
                if (primerBoton) primerBoton.focus({ preventScroll: true });
            }, 10);
        }

        function cerrarMenuLibro() {
            const modal = document.getElementById('modal-libro');
            const caja = document.getElementById('caja-libro');
            caja.classList.remove('is-open');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 400);
        }

        function cerrarTodoJuego() {
            juegoActivo = false;
            juegoPausado = false;
            currentGame = null;
            clearInterval(intervaloSnake);
            if (idAnimacionHighway) { cancelAnimationFrame(idAnimacionHighway); idAnimacionHighway = null; }
            if (idAnimacionNeon) { cancelAnimationFrame(idAnimacionNeon); idAnimacionNeon = null; }
            if (idAnimacionBreakout) { cancelAnimationFrame(idAnimacionBreakout); idAnimacionBreakout = null; }
            if (idAnimacionCohete) { cancelAnimationFrame(idAnimacionCohete); idAnimacionCohete = null; }
            if (idAnimacionPenalty) { cancelAnimationFrame(idAnimacionPenalty); idAnimacionPenalty = null; }
            if (timeoutPenalty) { clearTimeout(timeoutPenalty); timeoutPenalty = null; }
            if (canvas) {
                canvas.onmousemove = null;
                canvas.onclick = null;
                canvas.onpointermove = null;
                canvas.onpointerdown = null;
            }
            document.getElementById('controles-moviles').classList.remove('is-active');
            document.getElementById('penalty-scoreboard').hidden = true;
            document.getElementById('survivor-upgrade-overlay').hidden = true;
            document.getElementById('game-result-overlay').hidden = true;
            document.getElementById('pausa-overlay').hidden = true;
            document.getElementById('modal-juego').style.display = 'none';
            if (window.RayitoApp && typeof window.RayitoApp.navigate === 'function') window.RayitoApp.navigate('juegos');
            else abrirMenuLibro();
        }

        let juegoActivo = false;
        let currentGame = null;
        let canvas, ctx;

        function posicionEnCanvas(event) {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (event.clientX - rect.left) * canvas.width / rect.width,
                y: (event.clientY - rect.top) * canvas.height / rect.height
            };
        }

        function manejarPunteroJuego(event) {
            if (!juegoActivo || !canvas) return;
            event.preventDefault();
            const p = posicionEnCanvas(event);

            if (currentGame === 'highway') {
                objetivoXHighway = Math.max(245, Math.min(705, p.x));
                objetivoYHighway = Math.max(285, Math.min(canvas.height - 55, p.y));
            } else if (currentGame === 'neon') {
                objetivoXNeon = Math.max(0, Math.min(canvas.width, p.x));
            } else if (currentGame === 'breakout') {
                xPaleta = Math.max(0, Math.min(canvas.width - anchoPaletaBreakout, p.x - anchoPaletaBreakout / 2));
            } else if (currentGame === 'cohete') {
                coheteY = Math.max(20, Math.min(canvas.height - 20, p.y));
            }
        }

        function configurarControlesJuego() {
            const controles = document.getElementById('controles-moviles');
            prepararEstadoJuego();
            controles.classList.toggle('is-active', currentGame === 'snake');
            canvas.onpointermove = manejarPunteroJuego;
            canvas.onpointerdown = event => {
                if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
                manejarPunteroJuego(event);
            };
            canvas.focus({ preventScroll: true });
        }

        // ================= 1. HIGHWAY RUSH =================
        // Pseudo-3D nocturno: conducción con aceleración/freno, inercia lateral,
        // tráfico con velocidades propias, perspectiva, curvas y near miss.
        let jugadorHighway = null;
        let traficoHighway = [];
        let particulasHighway = [];
        let teclasHighway = new Set();
        let objetivoXHighway = 475;
        let objetivoYHighway = 490;
        let scoreHighway = 0;
        let distanciaHighway = 0; // metros
        let adelantadosHighway = 0;
        let nearMissHighway = 0;
        let comboHighway = 0;
        let mejorComboHighway = 0;
        let velocidadHighway = 150; // km/h
        let offsetCarreteraHighway = 0;
        let ultimoSpawnHighway = 0;
        let ultimoTiempoHighway = 0;
        let idAnimacionHighway = null;
        let curvaHighway = 0;
        let curvaObjetivoHighway = 0;
        let tiempoHighway = 0;
        let sacudidaHighway = 0;
        let tiempoQuietoHighway = 0;
        let referenciaXQuietoHighway = null;
        let antiCampHighwayActivo = false;

        const HIGHWAY_TIEMPO_ANTICAMP = 3;
        const HIGHWAY_UMBRAL_MOVIMIENTO_X = 7;

        const HIGHWAY_HORIZONTE = 72;
        const HIGHWAY_CENTRO = 475;
        const HIGHWAY_CARRILES = 4;

        function clampHighway(v, min, max) {
            return Math.max(min, Math.min(max, v));
        }

        function progresoPerspectivaHighway(y) {
            return clampHighway((y - HIGHWAY_HORIZONTE) / (canvas.height - HIGHWAY_HORIZONTE), 0, 1);
        }

        function centroCarreteraHighway(y) {
            const p = progresoPerspectivaHighway(y);
            return HIGHWAY_CENTRO + curvaHighway * Math.pow(1 - p, 1.45);
        }

        function mediaAnchuraCarreteraHighway(y) {
            const p = progresoPerspectivaHighway(y);
            return 148 + 205 * Math.pow(p, 0.82);
        }

        function xCarrilHighway(carril, y, desvio = 0) {
            const centro = centroCarreteraHighway(y);
            const media = mediaAnchuraCarreteraHighway(y);
            const anchoCarril = media * 2 / HIGHWAY_CARRILES;
            return centro - media + anchoCarril * (carril + 0.5) + desvio * (0.45 + progresoPerspectivaHighway(y) * 0.75);
        }

        function carrilDesdeXHighway(x, y) {
            const centro = centroCarreteraHighway(y);
            const media = mediaAnchuraCarreteraHighway(y);
            const anchoCarril = media * 2 / HIGHWAY_CARRILES;
            return clampHighway((x - (centro - media)) / anchoCarril - 0.5, 0, HIGHWAY_CARRILES - 1);
        }

        function abrirJuegoHighway() {
            if (window.RayitoApp && typeof window.RayitoApp.onGameStart === 'function') window.RayitoApp.onGameStart('highway');
            if (idAnimacionHighway) cancelAnimationFrame(idAnimacionHighway);
            cerrarMenuLibro();
            document.getElementById('modal-juego').style.display = 'flex';
            document.getElementById('titulo-juego-modal').innerText = 'Highway Rush 🏎️';
            document.getElementById('desc-juego-modal').innerText = 'A/D o ←/→ para doblar · W acelera · S frena. Adelantá tráfico realista y rozalo sin chocar para encadenar Near Miss.';
            canvas = document.getElementById('areaJuego');
            ctx = canvas.getContext('2d');

            jugadorHighway = {
                x: canvas.width / 2,
                y: canvas.height - 100,
                w: 48,
                h: 88,
                velocidadLateral: 0,
                angulo: 0,
                color: '#f4c430'
            };
            objetivoXHighway = jugadorHighway.x;
            objetivoYHighway = jugadorHighway.y;
            traficoHighway = [];
            particulasHighway = [];
            teclasHighway.clear();
            scoreHighway = 0;
            distanciaHighway = 0;
            adelantadosHighway = 0;
            nearMissHighway = 0;
            comboHighway = 0;
            mejorComboHighway = 0;
            velocidadHighway = 150;
            offsetCarreteraHighway = 0;
            ultimoSpawnHighway = performance.now() - 1000;
            ultimoTiempoHighway = performance.now();
            curvaHighway = 0;
            curvaObjetivoHighway = 0;
            tiempoHighway = 0;
            sacudidaHighway = 0;
            tiempoQuietoHighway = 0;
            referenciaXQuietoHighway = jugadorHighway.x;
            antiCampHighwayActivo = false;
            juegoActivo = true;
            currentGame = 'highway';
            configurarControlesJuego();
            bucleHighway(ultimoTiempoHighway);
        }

        function crearVehiculoHighway() {
            const progreso = Math.min(1, distanciaHighway / 7000);
            let carril = Math.floor(Math.random() * HIGHWAY_CARRILES);

            // Evita spawns imposibles: intenta elegir un carril sin coche pegado al horizonte.
            for (let intento = 0; intento < 8; intento++) {
                const candidato = Math.floor(Math.random() * HIGHWAY_CARRILES);
                const ocupado = traficoHighway.some(c => c.carril === candidato && c.y < 185);
                if (!ocupado) { carril = candidato; break; }
            }

            const r = Math.random();
            const tipo = r < 0.13 ? 'camion' : r < 0.30 ? 'suv' : r > 0.86 ? 'deportivo' : 'sedan';
            const specs = {
                camion:   { w: 57, h: 112, min: 82,  max: 112 },
                suv:      { w: 50, h: 91,  min: 96,  max: 135 },
                sedan:    { w: 45, h: 82,  min: 104, max: 152 },
                deportivo:{ w: 46, h: 78,  min: 142, max: 195 }
            }[tipo];
            const colores = tipo === 'deportivo'
                ? ['#d81e5b', '#e63946', '#ff6b35', '#1982c4']
                : tipo === 'camion'
                    ? ['#e6e8eb', '#5b6770', '#284b63', '#8d99ae']
                    : ['#f1f3f5', '#68727d', '#1f6feb', '#2f9e44', '#c92a2a', '#8e44ad', '#d4a017'];

            const ahora = performance.now();
            traficoHighway.push({
                carril,
                carrilBase: carril,
                carrilActual: carril,
                carrilObjetivo: carril,
                desvio: 0,
                y: HIGHWAY_HORIZONTE + 8,
                w: specs.w,
                h: specs.h,
                tipo,
                velocidadKmh: specs.min + Math.random() * (specs.max - specs.min) + progreso * 6,
                color: colores[Math.floor(Math.random() * colores.length)],
                procesado: false,
                fase: Math.random() * Math.PI * 2,
                proximoCambioCarril: ahora + 900 + Math.random() * (tipo === 'deportivo' ? 1250 : tipo === 'camion' ? 3300 : 2200),
                intermitente: 0,
                luzFreno: false
            });
        }

        function dimensionesVehiculoHighway(coche) {
            const p = progresoPerspectivaHighway(coche.y);
            const escala = 0.36 + 0.70 * Math.pow(p, 0.78);
            return { w: coche.w * escala, h: coche.h * escala, escala };
        }

        function cajaVehiculoHighway(coche) {
            const d = dimensionesVehiculoHighway(coche);
            const carrilVisual = Number.isFinite(coche.carrilActual) ? coche.carrilActual : coche.carril;
            return {
                x: xCarrilHighway(carrilVisual, coche.y, coche.desvio),
                y: coche.y,
                w: d.w,
                h: d.h
            };
        }

        function actualizarAntiCampHighway(delta) {
            if (referenciaXQuietoHighway === null) referenciaXQuietoHighway = jugadorHighway.x;

            // Solo cuenta como "quieto" si el jugador mantiene prácticamente la misma X.
            // Acelerar/frenar no evita el anti-camp: hay que mover realmente el auto hacia un costado.
            const movimientoReal = Math.abs(jugadorHighway.x - referenciaXQuietoHighway);

            if (movimientoReal >= HIGHWAY_UMBRAL_MOVIMIENTO_X) {
                tiempoQuietoHighway = 0;
                referenciaXQuietoHighway = jugadorHighway.x;
                antiCampHighwayActivo = false;
                return;
            }

            tiempoQuietoHighway += delta;
            if (tiempoQuietoHighway >= HIGHWAY_TIEMPO_ANTICAMP) {
                antiCampHighwayActivo = true;
            }
        }

        function objetivoTraficoAntiCampHighway(coche) {
            // Cuando el jugador campea 10 s, los autos que vienen corrigen gradualmente
            // su trayectoria hacia la X del jugador. No es un cambio aleatorio de carril.
            return carrilDesdeXHighway(jugadorHighway.x, coche.y);
        }

        function colisionRectHighway(a, b, margen = 4) {
            return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - margen &&
                   Math.abs(a.y - b.y) < (a.h + b.h) / 2 - margen;
        }

        function particulasNearMissHighway(x, y) {
            for (let i = 0; i < 15; i++) {
                particulasHighway.push({
                    x, y,
                    vx: (Math.random() - 0.5) * 165,
                    vy: 55 + Math.random() * 165,
                    vida: 0.32 + Math.random() * 0.42,
                    color: Math.random() < .45 ? '#f4c430' : '#f1f5f9'
                });
            }
            sacudidaHighway = Math.max(sacudidaHighway, 2.7);
        }

        function marchaHighway() {
            if (velocidadHighway < 45) return 1;
            if (velocidadHighway < 78) return 2;
            if (velocidadHighway < 115) return 3;
            if (velocidadHighway < 155) return 4;
            if (velocidadHighway < 205) return 5;
            return 6;
        }

        function rpmHighway() {
            const rangos = [0, 45, 78, 115, 155, 205, 290];
            const m = marchaHighway();
            const ini = rangos[m - 1], fin = rangos[m];
            return Math.round(1800 + clampHighway((velocidadHighway - ini) / Math.max(1, fin - ini), 0, 1) * 5000);
        }

        function dibujarVehiculoHighway(x, y, w, h, color, angulo = 0, jugador = false, camion = false, luzFreno = false) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angulo);

            // Sombra del vehículo sobre el asfalto.
            ctx.fillStyle = 'rgba(0,0,0,.42)';
            ctx.beginPath();
            ctx.ellipse(3, 5, w * 0.58, h * 0.54, 0, 0, Math.PI * 2);
            ctx.fill();

            // Neumáticos.
            ctx.fillStyle = '#07090c';
            const rw = Math.max(3, w * .12), rh = h * .22;
            [-1, 1].forEach(lado => {
                ctx.fillRect(lado * (w * .49) - (lado < 0 ? 0 : rw), -h * .30, rw, rh);
                ctx.fillRect(lado * (w * .49) - (lado < 0 ? 0 : rw), h * .10, rw, rh);
            });

            // Carrocería con forma, no un simple rectángulo.
            ctx.shadowColor = jugador ? 'rgba(244,196,48,.35)' : 'rgba(0,0,0,.25)';
            ctx.shadowBlur = jugador ? 12 : 5;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(-w * .34, -h * .50);
            ctx.quadraticCurveTo(-w * .47, -h * .34, -w * .47, -h * .08);
            ctx.lineTo(-w * .50, h * .34);
            ctx.quadraticCurveTo(-w * .42, h * .50, -w * .27, h * .52);
            ctx.lineTo(w * .27, h * .52);
            ctx.quadraticCurveTo(w * .42, h * .50, w * .50, h * .34);
            ctx.lineTo(w * .47, -h * .08);
            ctx.quadraticCurveTo(w * .47, -h * .34, w * .34, -h * .50);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            // Cabina / parabrisas.
            ctx.fillStyle = camion ? '#111820' : '#101820';
            ctx.beginPath();
            ctx.moveTo(-w * .30, -h * .20);
            ctx.lineTo(-w * .25, h * .13);
            ctx.lineTo(w * .25, h * .13);
            ctx.lineTo(w * .30, -h * .20);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(122,190,220,.18)';
            ctx.fillRect(-w * .25, -h * .16, w * .50, h * .10);

            // Línea de carrocería.
            ctx.strokeStyle = 'rgba(255,255,255,.18)';
            ctx.lineWidth = Math.max(1, w * .025);
            ctx.beginPath(); ctx.moveTo(0, -h * .45); ctx.lineTo(0, h * .42); ctx.stroke();

            // Faros delanteros (arriba) y luces traseras (abajo).
            ctx.fillStyle = '#f5f7ff';
            ctx.fillRect(-w * .34, -h * .47, w * .16, Math.max(2, h * .045));
            ctx.fillRect(w * .18, -h * .47, w * .16, Math.max(2, h * .045));
            ctx.fillStyle = luzFreno ? '#ff1f3d' : '#a80f24';
            ctx.shadowColor = '#ff1838'; ctx.shadowBlur = luzFreno ? 12 : 5;
            ctx.fillRect(-w * .35, h * .42, w * .17, Math.max(2, h * .05));
            ctx.fillRect(w * .18, h * .42, w * .17, Math.max(2, h * .05));
            ctx.shadowBlur = 0;

            if (jugador) {
                // Haz de luz tenue hacia adelante.
                const g = ctx.createLinearGradient(0, -h * .55, 0, -h * 2.5);
                g.addColorStop(0, 'rgba(255,250,205,.16)');
                g.addColorStop(1, 'rgba(255,250,205,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(-w * .34, -h * .52);
                ctx.lineTo(-w * .95, -h * 2.5);
                ctx.lineTo(w * .95, -h * 2.5);
                ctx.lineTo(w * .34, -h * .52);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        }

        function dibujarCarreteraHighway() {
            // Cielo nocturno y resplandor del horizonte.
            const cielo = ctx.createLinearGradient(0, 0, 0, canvas.height);
            cielo.addColorStop(0, '#03060b');
            cielo.addColorStop(.22, '#07111a');
            cielo.addColorStop(1, '#050708');
            ctx.fillStyle = cielo;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const halo = ctx.createRadialGradient(HIGHWAY_CENTRO, HIGHWAY_HORIZONTE, 10, HIGHWAY_CENTRO, HIGHWAY_HORIZONTE, 300);
            halo.addColorStop(0, 'rgba(56,99,140,.17)');
            halo.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = halo; ctx.fillRect(0, 0, canvas.width, 260);

            // Silueta de árboles / ciudad lejana.
            ctx.fillStyle = '#020405';
            for (let x = 0; x < canvas.width; x += 24) {
                const h = 12 + ((x * 17) % 31);
                ctx.fillRect(x, HIGHWAY_HORIZONTE - h, 18, h);
            }

            // Banquinas.
            const yTop = HIGHWAY_HORIZONTE;
            const leftTop = centroCarreteraHighway(yTop) - mediaAnchuraCarreteraHighway(yTop);
            const rightTop = centroCarreteraHighway(yTop) + mediaAnchuraCarreteraHighway(yTop);
            const leftBottom = centroCarreteraHighway(canvas.height) - mediaAnchuraCarreteraHighway(canvas.height);
            const rightBottom = centroCarreteraHighway(canvas.height) + mediaAnchuraCarreteraHighway(canvas.height);
            ctx.fillStyle = '#101513';
            ctx.fillRect(0, yTop, canvas.width, canvas.height - yTop);

            // Asfalto en trapecio.
            const asfalto = ctx.createLinearGradient(0, yTop, 0, canvas.height);
            asfalto.addColorStop(0, '#17191c');
            asfalto.addColorStop(1, '#222428');
            ctx.fillStyle = asfalto;
            ctx.beginPath();
            ctx.moveTo(leftTop, yTop); ctx.lineTo(rightTop, yTop);
            ctx.lineTo(rightBottom, canvas.height); ctx.lineTo(leftBottom, canvas.height);
            ctx.closePath(); ctx.fill();

            // Textura del asfalto.
            ctx.fillStyle = 'rgba(255,255,255,.035)';
            for (let i = 0; i < 90; i++) {
                const yy = (i * 71 + offsetCarreteraHighway * 1.7) % (canvas.height - yTop) + yTop;
                const m = mediaAnchuraCarreteraHighway(yy);
                const c = centroCarreteraHighway(yy);
                const xx = c + (((i * 113) % 1000) / 1000 * 2 - 1) * m;
                ctx.fillRect(xx, yy, 1.5 + progresoPerspectivaHighway(yy) * 2, 1.5 + progresoPerspectivaHighway(yy) * 4);
            }

            // Límites continuos y guardarraíles.
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(240,240,225,.82)';
            ['left','right'].forEach(lado => {
                ctx.beginPath();
                for (let y = yTop; y <= canvas.height; y += 12) {
                    const x = centroCarreteraHighway(y) + (lado === 'left' ? -1 : 1) * mediaAnchuraCarreteraHighway(y);
                    if (y === yTop) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

            // Marcas discontinuas con perspectiva.
            const desplazamiento = offsetCarreteraHighway % 88;
            for (let limite = 1; limite < HIGHWAY_CARRILES; limite++) {
                for (let yBase = -70; yBase < canvas.height + 100; yBase += 88) {
                    const y1 = yTop + ((yBase + desplazamiento + 900) % (canvas.height - yTop + 110));
                    if (y1 < yTop || y1 > canvas.height) continue;
                    const p = progresoPerspectivaHighway(y1);
                    const largo = 14 + p * 30;
                    const y2 = Math.min(canvas.height, y1 + largo);
                    const m1 = mediaAnchuraCarreteraHighway(y1), c1 = centroCarreteraHighway(y1);
                    const m2 = mediaAnchuraCarreteraHighway(y2), c2 = centroCarreteraHighway(y2);
                    const f = -1 + 2 * limite / HIGHWAY_CARRILES;
                    ctx.strokeStyle = 'rgba(245,245,238,.66)';
                    ctx.lineWidth = 1.2 + p * 2.8;
                    ctx.beginPath();
                    ctx.moveTo(c1 + m1 * f, y1);
                    ctx.lineTo(c2 + m2 * f, y2);
                    ctx.stroke();
                }
            }

            // Reflectores / postes laterales que pasan con la velocidad.
            for (let i = 0; i < 11; i++) {
                const yy = yTop + ((i * 67 + offsetCarreteraHighway * 1.25) % (canvas.height - yTop));
                const p = progresoPerspectivaHighway(yy);
                const c = centroCarreteraHighway(yy), m = mediaAnchuraCarreteraHighway(yy);
                const posteH = 5 + p * 19;
                ctx.fillStyle = '#d7dde2';
                ctx.fillRect(c - m - 17 - p * 11, yy - posteH, 2 + p * 3, posteH);
                ctx.fillRect(c + m + 15 + p * 8, yy - posteH, 2 + p * 3, posteH);
                ctx.fillStyle = '#f4c430';
                ctx.fillRect(c - m - 18 - p * 11, yy - posteH, 4 + p * 3, 2 + p * 2);
                ctx.fillRect(c + m + 14 + p * 8, yy - posteH, 4 + p * 3, 2 + p * 2);
            }

            // Líneas de velocidad a partir de 190 km/h.
            if (velocidadHighway > 190) {
                const alpha = Math.min(.20, (velocidadHighway - 190) / 500);
                ctx.strokeStyle = `rgba(220,235,245,${alpha})`;
                ctx.lineWidth = 1;
                for (let i = 0; i < 18; i++) {
                    const yy = (i * 53 + offsetCarreteraHighway * 2.4) % canvas.height;
                    const xx = (i * 197) % canvas.width;
                    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 18 + velocidadHighway * .05); ctx.stroke();
                }
            }
        }

        function dibujarHudHighway() {
            const marcha = marchaHighway();
            const rpm = rpmHighway();

            // Panel izquierdo.
            ctx.fillStyle = 'rgba(3,6,10,.72)';
            ctx.beginPath();
            ctx.roundRect(16, 14, 275, 76, 12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = '800 20px sans-serif';
            ctx.fillText(`${Math.round(scoreHighway)} pts`, 30, 41);
            ctx.fillStyle = '#aab4c2'; ctx.font = '600 12px sans-serif';
            ctx.fillText(`${(distanciaHighway / 1000).toFixed(2)} km  ·  ${adelantadosHighway} adelantados`, 30, 62);
            ctx.fillText(`Near Miss ${nearMissHighway}  ·  Combo x${Math.max(1, comboHighway)}`, 30, 80);

            // Velocímetro digital.
            ctx.fillStyle = 'rgba(3,6,10,.78)';
            ctx.beginPath(); ctx.roundRect(canvas.width - 190, 14, 174, 96, 12); ctx.fill();
            ctx.strokeStyle = 'rgba(244,196,48,.32)'; ctx.stroke();
            ctx.textAlign = 'right';
            ctx.fillStyle = '#f4c430'; ctx.font = '900 35px sans-serif';
            ctx.fillText(`${Math.round(velocidadHighway)}`, canvas.width - 30, 55);
            ctx.fillStyle = '#d7dde2'; ctx.font = '700 11px sans-serif';
            ctx.fillText('KM/H', canvas.width - 30, 72);
            ctx.fillStyle = '#fff'; ctx.font = '800 14px sans-serif';
            ctx.fillText(`D${marcha}  ·  ${rpm} RPM`, canvas.width - 30, 94);
            ctx.textAlign = 'left';

            // Barra de RPM.
            const pct = clampHighway((rpm - 1800) / 5000, 0, 1);
            ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(canvas.width - 174, 100, 142, 4);
            ctx.fillStyle = rpm > 6200 ? '#ff3b4f' : '#f4c430'; ctx.fillRect(canvas.width - 174, 100, 142 * pct, 4);

            if (antiCampHighwayActivo) {
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(120,12,20,.88)';
                ctx.beginPath(); ctx.roundRect(canvas.width / 2 - 105, 18, 210, 34, 10); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '900 12px sans-serif';
                ctx.fillText('⚠ MOVETE · TRÁFICO REACCIONANDO', canvas.width / 2, 40);
                ctx.textAlign = 'left';
            }
        }

        function bucleHighway(tiempo = performance.now()) {
            if (!juegoActivo || currentGame !== 'highway') return;
            if (juegoPausado) {
                ultimoTiempoHighway = tiempo;
                idAnimacionHighway = requestAnimationFrame(bucleHighway);
                return;
            }

            const delta = Math.min(0.032, Math.max(0.001, (tiempo - ultimoTiempoHighway) / 1000));
            ultimoTiempoHighway = tiempo;
            tiempoHighway += delta;
            const progreso = Math.min(1, distanciaHighway / 6500);

            // Motor: W acelera, S frena. Sin entrada mantiene una velocidad de crucero.
            const acelera = teclasHighway.has('w') || teclasHighway.has('arrowup');
            const frena = teclasHighway.has('s') || teclasHighway.has('arrowdown');
            const maxVel = 255 * Math.max(.92, factorDificultad());
            const minVel = 88;
            const crucero = 152 * Math.min(1.08, factorDificultad());
            if (acelera && !frena) velocidadHighway += (48 - Math.max(0, velocidadHighway - 205) * .12) * delta;
            else if (frena && !acelera) velocidadHighway -= 105 * delta;
            else velocidadHighway += (crucero - velocidadHighway) * Math.min(1, delta * 0.8);

            // En mouse/táctil, subir el puntero acelera y bajarlo frena suavemente.
            if (!acelera && !frena && Math.abs(objetivoYHighway - jugadorHighway.y) > 45) {
                const toque = clampHighway((jugadorHighway.y - objetivoYHighway) / 180, -1, 1);
                velocidadHighway += toque * (toque > 0 ? 26 : 46) * delta;
            }
            velocidadHighway = clampHighway(velocidadHighway, minVel, maxVel);

            // Inercia de dirección: el auto no se teletransporta lateralmente.
            const izquierda = teclasHighway.has('a') || teclasHighway.has('arrowleft');
            const derecha = teclasHighway.has('d') || teclasHighway.has('arrowright');
            let entradaDireccion = (derecha ? 1 : 0) - (izquierda ? 1 : 0);
            if (!izquierda && !derecha) {
                const error = objetivoXHighway - jugadorHighway.x;
                if (Math.abs(error) > 5) entradaDireccion = clampHighway(error / 105, -1, 1);
            }
            const agarre = 750 + velocidadHighway * 1.65;
            jugadorHighway.velocidadLateral += entradaDireccion * agarre * delta;
            jugadorHighway.velocidadLateral *= Math.pow(0.035, delta);
            jugadorHighway.velocidadLateral = clampHighway(jugadorHighway.velocidadLateral, -520, 520);
            jugadorHighway.x += jugadorHighway.velocidadLateral * delta;
            jugadorHighway.angulo += (clampHighway(jugadorHighway.velocidadLateral / 1100, -.24, .24) - jugadorHighway.angulo) * Math.min(1, delta * 8);

            // Banquina física según el ancho real en la parte inferior.
            const mediaInferior = mediaAnchuraCarreteraHighway(jugadorHighway.y);
            const centroInferior = centroCarreteraHighway(jugadorHighway.y);
            const minX = centroInferior - mediaInferior + jugadorHighway.w * .56;
            const maxX = centroInferior + mediaInferior - jugadorHighway.w * .56;
            if (jugadorHighway.x < minX || jugadorHighway.x > maxX) {
                velocidadHighway -= 52 * delta;
                jugadorHighway.velocidadLateral *= .93;
            }
            jugadorHighway.x = clampHighway(jugadorHighway.x, minX - 18, maxX + 18);

            actualizarAntiCampHighway(delta);

            distanciaHighway += (velocidadHighway / 3.6) * delta;
            scoreHighway += (velocidadHighway / 3.6) * delta * (0.42 + Math.min(.16, progreso * .16));
            offsetCarreteraHighway += (55 + velocidadHighway * 1.55) * delta;

            // Curvas largas y suaves, solo visuales/perspectivas.
            curvaObjetivoHighway = Math.sin(distanciaHighway / 310) * 54 + Math.sin(distanciaHighway / 690) * 24;
            curvaHighway += (curvaObjetivoHighway - curvaHighway) * Math.min(1, delta * .34);

            // Densidad aumenta de forma progresiva, sin paredes de coches imposibles.
            const intervaloSpawn = Math.max(510, 1060 - progreso * 330 - (velocidadHighway - 120) * 1.15);
            if (tiempo - ultimoSpawnHighway > intervaloSpawn) {
                crearVehiculoHighway();
                if (progreso > .62 && Math.random() < .16) {
                    setTimeout(() => {
                        if (juegoActivo && currentGame === 'highway') crearVehiculoHighway();
                    }, 180 + Math.random() * 120);
                }
                ultimoSpawnHighway = tiempo;
            }

            const jugadorBox = { x: jugadorHighway.x, y: jugadorHighway.y, w: jugadorHighway.w * .82, h: jugadorHighway.h * .84 };

            for (let i = traficoHighway.length - 1; i >= 0; i--) {
                const coche = traficoHighway[i];
                const diferencia = velocidadHighway - coche.velocidadKmh;
                const movimientoPantalla = 86 + diferencia * 1.82;
                coche.y += movimientoPantalla * delta;
                coche.luzFreno = diferencia > 70 && Math.random() < .08;

                // En conducción normal cada vehículo conserva SU carril original.
                if (!Number.isFinite(coche.carrilBase)) coche.carrilBase = Number.isFinite(coche.carril) ? coche.carril : 0;
                if (!Number.isFinite(coche.carrilActual)) coche.carrilActual = coche.carrilBase;

                // Anti-camp: solo después de 10 s sin movimiento lateral los autos que vienen
                // empiezan a corregir hacia el jugador. Apenas el jugador se mueve, vuelven a su carril.
                const puedeBuscarJugador = antiCampHighwayActivo && coche.y < jugadorHighway.y - 28;
                coche.carrilObjetivo = puedeBuscarJugador
                    ? objetivoTraficoAntiCampHighway(coche)
                    : coche.carrilBase;

                const rapidezCambio = puedeBuscarJugador
                    ? (coche.tipo === 'deportivo' ? 1.18 : coche.tipo === 'camion' ? 0.58 : 0.86)
                    : (coche.tipo === 'deportivo' ? 1.55 : coche.tipo === 'camion' ? 0.82 : 1.18);
                const diferenciaCarril = coche.carrilObjetivo - coche.carrilActual;
                const pasoMax = rapidezCambio * delta;
                coche.carrilActual += clampHighway(diferenciaCarril, -pasoMax, pasoMax);
                if (Math.abs(diferenciaCarril) < 0.008) coche.carrilActual = coche.carrilObjetivo;

                // Sin anti-camp no hay deriva lateral: circulan centrados y rectos en su carril.
                coche.desvio = 0;
                coche.intermitente = 0;

                const box = cajaVehiculoHighway(coche);
                if (colisionRectHighway(jugadorBox, box, 5)) {
                    sacudidaHighway = 10;
                    feedbackJuego('fin');
                    mostrarResultado('CHOQUE', `Recorriste ${(distanciaHighway / 1000).toFixed(2)} km · ${adelantadosHighway} adelantados · ${nearMissHighway} near miss`, Math.round(scoreHighway), '🏎️');
                    return;
                }

                if (!coche.procesado && coche.y - box.h / 2 > jugadorHighway.y + jugadorHighway.h / 2) {
                    coche.procesado = true;
                    adelantadosHighway++;
                    const separacion = Math.abs(box.x - jugadorHighway.x) - (box.w + jugadorHighway.w * .82) / 2;
                    if (separacion >= -1 && separacion < 27) {
                        comboHighway++;
                        mejorComboHighway = Math.max(mejorComboHighway, comboHighway);
                        nearMissHighway++;
                        const bonus = 38 + Math.min(110, comboHighway * 10) + Math.round(velocidadHighway * .10);
                        scoreHighway += bonus;
                        particulasNearMissHighway(jugadorHighway.x, jugadorHighway.y - 38);
                        feedbackJuego('gol');
                    } else {
                        scoreHighway += 12;
                        comboHighway = Math.max(0, comboHighway - 1);
                        feedbackJuego('punto');
                    }
                }

                if (coche.y > canvas.height + 145 || coche.y < HIGHWAY_HORIZONTE - 130) {
                    traficoHighway.splice(i, 1);
                }
            }

            for (let i = particulasHighway.length - 1; i >= 0; i--) {
                const p = particulasHighway[i];
                p.x += p.vx * delta;
                p.y += p.vy * delta;
                p.vida -= delta;
                if (p.vida <= 0) particulasHighway.splice(i, 1);
            }

            sacudidaHighway *= Math.pow(.015, delta);
            ctx.save();
            if (sacudidaHighway > .2) ctx.translate((Math.random() - .5) * sacudidaHighway, (Math.random() - .5) * sacudidaHighway);

            dibujarCarreteraHighway();

            // Ordenar por Y para que los vehículos lejanos queden detrás de los cercanos.
            traficoHighway.slice().sort((a, b) => a.y - b.y).forEach(coche => {
                const box = cajaVehiculoHighway(coche);
                const d = dimensionesVehiculoHighway(coche);
                dibujarVehiculoHighway(box.x, box.y, d.w, d.h, coche.color, 0, false, coche.tipo === 'camion', coche.luzFreno);
            });

            // El jugador se dibuja a tamaño completo.
            dibujarVehiculoHighway(
                jugadorHighway.x,
                jugadorHighway.y,
                jugadorHighway.w,
                jugadorHighway.h,
                jugadorHighway.color,
                jugadorHighway.angulo,
                true,
                false,
                frena
            );

            particulasHighway.forEach(p => {
                ctx.globalAlpha = Math.max(0, p.vida * 2);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 3.5, 10);
            });
            ctx.globalAlpha = 1;
            dibujarHudHighway();
            ctx.restore();

            idAnimacionHighway = requestAnimationFrame(bucleHighway);
        }

        // ================= 2. SNAKE =================
        let snake = [], comidaSnake = {}, obstaculosSnake = [], dirSnake = 'RIGHT', siguienteDirSnake = 'RIGHT', scoreSnake = 0, intervaloSnake;
        let comidasSnake = 0;
        const tileSize = 20;

        function velocidadSnakeMs() {
            const base = 122 / factorDificultad();
            return Math.max(58, Math.round(base - comidasSnake * 3.2));
        }

        function reiniciarRitmoSnake() {
            clearInterval(intervaloSnake);
            intervaloSnake = setInterval(bucleSnake, velocidadSnakeMs());
        }

        function abrirJuegoSnake() {
            if (window.RayitoApp && typeof window.RayitoApp.onGameStart === 'function') window.RayitoApp.onGameStart('snake');
            cerrarMenuLibro();
            document.getElementById('modal-juego').style.display = 'flex';
            document.getElementById('titulo-juego-modal').innerText = "Snake Rush 🐍";
            document.getElementById('desc-juego-modal').innerText = "Comé, acelerá y esquivá bloques. Cada 5 comidas aparece una fruta dorada que vale más puntos.";
            canvas = document.getElementById('areaJuego');
            ctx = canvas.getContext('2d');

            snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
            obstaculosSnake = [];
            dirSnake = 'RIGHT';
            siguienteDirSnake = 'RIGHT';
            scoreSnake = 0;
            comidasSnake = 0;
            generarComidaSnake();
            juegoActivo = true;
            currentGame = 'snake';

            configurarControlesJuego();
            reiniciarRitmoSnake();
        }

        function cambiarDireccionSnake(nuevaDireccion) {
            if (!juegoActivo || currentGame !== 'snake') return;
            const opuestas = { RIGHT: 'LEFT', LEFT: 'RIGHT', UP: 'DOWN', DOWN: 'UP' };
            if (opuestas[dirSnake] !== nuevaDireccion) siguienteDirSnake = nuevaDireccion;
        }

        function celdaOcupadaSnake(x, y, incluirComida = true) {
            if (snake.some(s => s.x === x && s.y === y)) return true;
            if (obstaculosSnake.some(o => o.x === x && o.y === y)) return true;
            return incluirComida && comidaSnake.x === x && comidaSnake.y === y;
        }

        function generarComidaSnake() {
            const cols = Math.floor(canvas.width / tileSize);
            const rows = Math.floor(canvas.height / tileSize);
            let intentos = 0;
            do {
                comidaSnake = {
                    x: Math.floor(Math.random() * cols),
                    y: Math.floor(Math.random() * rows),
                    bonus: (comidasSnake + 1) % 5 === 0
                };
                intentos++;
            } while (celdaOcupadaSnake(comidaSnake.x, comidaSnake.y, false) && intentos < 300);
        }

        function agregarObstaculoSnake() {
            if (obstaculosSnake.length >= 9) return;
            const cols = Math.floor(canvas.width / tileSize);
            const rows = Math.floor(canvas.height / tileSize);
            for (let intento = 0; intento < 120; intento++) {
                const x = 2 + Math.floor(Math.random() * Math.max(1, cols - 4));
                const y = 2 + Math.floor(Math.random() * Math.max(1, rows - 4));
                if (Math.abs(x - snake[0].x) + Math.abs(y - snake[0].y) < 7) continue;
                if (!celdaOcupadaSnake(x, y)) {
                    obstaculosSnake.push({ x, y });
                    return;
                }
            }
        }

        function bucleSnake() {
            if (!juegoActivo || currentGame !== 'snake') return;
            if (juegoPausado) return;

            dirSnake = siguienteDirSnake;
            const cabeza = { ...snake[0] };
            if (dirSnake === 'RIGHT') cabeza.x++;
            if (dirSnake === 'LEFT') cabeza.x--;
            if (dirSnake === 'UP') cabeza.y--;
            if (dirSnake === 'DOWN') cabeza.y++;

            const cols = Math.floor(canvas.width / tileSize);
            const rows = Math.floor(canvas.height / tileSize);
            const chocoObstaculo = obstaculosSnake.some(o => o.x === cabeza.x && o.y === cabeza.y);
            const chocoCuerpo = snake.some(s => s.x === cabeza.x && s.y === cabeza.y);

            if (cabeza.x < 0 || cabeza.x >= cols || cabeza.y < 0 || cabeza.y >= rows || chocoCuerpo || chocoObstaculo) {
                mostrarResultado('GAME OVER', chocoObstaculo ? 'Chocaste contra un bloque' : 'La serpiente chocó', scoreSnake, '🐍');
                return;
            }

            snake.unshift(cabeza);
            if (cabeza.x === comidaSnake.x && cabeza.y === comidaSnake.y) {
                const eraBonus = !!comidaSnake.bonus;
                scoreSnake += eraBonus ? 25 : 10;
                comidasSnake++;
                feedbackJuego(eraBonus ? 'gol' : 'punto');
                if (comidasSnake >= 4 && comidasSnake % 4 === 0) agregarObstaculoSnake();
                generarComidaSnake();
                reiniciarRitmoSnake();
            } else {
                snake.pop();
            }

            ctx.fillStyle = '#090d12';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(255,255,255,.025)';
            ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += tileSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
            for (let y = 0; y < canvas.height; y += tileSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

            obstaculosSnake.forEach(o => {
                ctx.fillStyle = '#323944';
                ctx.fillRect(o.x * tileSize + 2, o.y * tileSize + 2, tileSize - 4, tileSize - 4);
                ctx.strokeStyle = '#ff6b35';
                ctx.strokeRect(o.x * tileSize + 4, o.y * tileSize + 4, tileSize - 8, tileSize - 8);
            });

            ctx.fillStyle = comidaSnake.bonus ? '#ffd60a' : '#ff4d6d';
            ctx.beginPath();
            ctx.arc(comidaSnake.x * tileSize + tileSize / 2, comidaSnake.y * tileSize + tileSize / 2, comidaSnake.bonus ? 8 : 7, 0, Math.PI * 2);
            ctx.fill();

            snake.forEach((s, i) => {
                ctx.fillStyle = i === 0 ? '#9cffc9' : '#25d984';
                const inset = i === 0 ? 1 : 2;
                ctx.fillRect(s.x * tileSize + inset, s.y * tileSize + inset, tileSize - inset * 2, tileSize - inset * 2);
            });

            ctx.fillStyle = '#fff';
            ctx.font = '700 16px sans-serif';
            ctx.fillText(`Puntos: ${scoreSnake}`, 20, 30);
            ctx.fillStyle = '#aab4c2';
            ctx.font = '600 13px sans-serif';
            ctx.fillText(`Velocidad ${Math.round(1000 / velocidadSnakeMs())} · Bloques ${obstaculosSnake.length}`, 20, 52);
        }

        // ================= 3. NEON JUMP =================
        let jugadorNeon = null;
        let plataformasNeon = [];
        let monedasNeon = [];
        let particulasNeon = [];
        let teclasNeon = new Set();
        let objetivoXNeon = 475;
        let scoreNeon = 0;
        let alturaNeon = 0;
        let alturaMaxNeon = 0;
        let monedasTomadasNeon = 0;
        let perfectosNeon = 0;
        let ultimoTiempoNeon = 0;
        let idAnimacionNeon = null;

        function abrirJuegoNeon() {
            if (window.RayitoApp && typeof window.RayitoApp.onGameStart === 'function') window.RayitoApp.onGameStart('neon');
            if (idAnimacionNeon) cancelAnimationFrame(idAnimacionNeon);
            cerrarMenuLibro();
            document.getElementById('modal-juego').style.display = 'flex';
            document.getElementById('titulo-juego-modal').innerText = 'Neon Jump 🟣';
            document.getElementById('desc-juego-modal').innerText = 'Saltá cada vez más alto. Aparecen plataformas móviles y frágiles; aterrizar en el centro da bonus perfecto.';
            canvas = document.getElementById('areaJuego');
            ctx = canvas.getContext('2d');

            jugadorNeon = { x: canvas.width/2, y: canvas.height-115, w: 30, h: 38, vx: 0, vy: -620, enSuelo: false };
            objetivoXNeon = jugadorNeon.x;
            plataformasNeon = [];
            monedasNeon = [];
            particulasNeon = [];
            teclasNeon.clear();
            scoreNeon = 0; alturaNeon = 0; alturaMaxNeon = 0; monedasTomadasNeon = 0; perfectosNeon = 0;
            plataformasNeon.push({ x: canvas.width/2 - 70, y: canvas.height-55, w: 140, h: 14, tipo:'normal', vx:0, usada:false });
            let y = canvas.height - 135;
            for (let i=0; i<9; i++) {
                crearPlataformaNeon(y, i < 5 ? 'normal' : null);
                y -= 72 + Math.random()*24;
            }
            ultimoTiempoNeon = performance.now();
            juegoActivo = true;
            currentGame = 'neon';
            configurarControlesJuego();
            bucleNeon(ultimoTiempoNeon);
        }

        function crearPlataformaNeon(yForzado = -40, tipoForzado = null) {
            const dificultad = Math.min(1, alturaMaxNeon / 6000);
            const w = Math.max(72, 120 - dificultad * 35 + (Math.random()-.5)*24);
            const x = 55 + Math.random() * (canvas.width - 110 - w);
            const azar = Math.random();
            const tipo = tipoForzado || (dificultad > .25 && azar < .20 ? 'movil' : dificultad > .48 && azar < .34 ? 'fragil' : 'normal');
            const plataforma = { x, y:yForzado, w, h:13, tipo, vx: tipo==='movil' ? (Math.random()<.5?-1:1)*(55+Math.random()*45) : 0, usada:false };
            plataformasNeon.push(plataforma);
            if (Math.random() < .34) monedasNeon.push({ x:x+w/2, y:yForzado-24, r:7, tomada:false, fase:Math.random()*6.28 });
        }

        function particulasSaltoNeon(x,y,color='#b026ff') {
            for (let i=0;i<10;i++) particulasNeon.push({x,y,vx:(Math.random()-.5)*150,vy:-20-Math.random()*100,vida:.45+Math.random()*.3,color});
        }

        function bucleNeon(tiempo = performance.now()) {
            if (!juegoActivo || currentGame !== 'neon') return;
            if (juegoPausado) {
                ultimoTiempoNeon = tiempo;
                idAnimacionNeon = requestAnimationFrame(bucleNeon);
                return;
            }
            const delta = Math.min(.032, Math.max(.001,(tiempo-ultimoTiempoNeon)/1000));
            ultimoTiempoNeon = tiempo;
            const prevBottom = jugadorNeon.y + jugadorNeon.h/2;

            const izq = teclasNeon.has('a') || teclasNeon.has('arrowleft');
            const der = teclasNeon.has('d') || teclasNeon.has('arrowright');
            const aceleracion = 1120;
            if (izq) jugadorNeon.vx -= aceleracion*delta;
            if (der) jugadorNeon.vx += aceleracion*delta;
            if (!izq && !der) {
                const deseada = Math.max(-320, Math.min(320, (objetivoXNeon-jugadorNeon.x)*5));
                jugadorNeon.vx += (deseada-jugadorNeon.vx)*Math.min(1,delta*4.8);
            }
            jugadorNeon.vx *= Math.pow(.91, delta*60);
            jugadorNeon.vx = Math.max(-345,Math.min(345,jugadorNeon.vx));
            jugadorNeon.vy += 1280*factorDificultad()*delta;
            jugadorNeon.x += jugadorNeon.vx*delta;
            jugadorNeon.y += jugadorNeon.vy*delta;
            if (jugadorNeon.x < -jugadorNeon.w/2) jugadorNeon.x = canvas.width+jugadorNeon.w/2;
            if (jugadorNeon.x > canvas.width+jugadorNeon.w/2) jugadorNeon.x = -jugadorNeon.w/2;

            plataformasNeon.forEach(p => {
                if (p.tipo==='movil') {
                    p.x += p.vx*delta;
                    if (p.x < 25 || p.x+p.w > canvas.width-25) { p.vx *= -1; p.x=Math.max(25,Math.min(canvas.width-25-p.w,p.x)); }
                }
            });

            if (jugadorNeon.vy > 0) {
                const bottom = jugadorNeon.y + jugadorNeon.h/2;
                for (let i=plataformasNeon.length-1;i>=0;i--) {
                    const p = plataformasNeon[i];
                    if (prevBottom <= p.y+5 && bottom >= p.y && jugadorNeon.x+jugadorNeon.w/2 > p.x && jugadorNeon.x-jugadorNeon.w/2 < p.x+p.w) {
                        jugadorNeon.y = p.y-jugadorNeon.h/2;
                        jugadorNeon.vy = -625 - Math.min(70,alturaMaxNeon/120);
                        const errorCentro = Math.abs(jugadorNeon.x-(p.x+p.w/2));
                        if (errorCentro < Math.min(18,p.w*.18)) {
                            perfectosNeon++; scoreNeon += 30 + Math.min(70,perfectosNeon*4); particulasSaltoNeon(jugadorNeon.x,p.y,'#ffd60a'); feedbackJuego('gol');
                        } else {
                            perfectosNeon = Math.max(0,perfectosNeon-1); scoreNeon += 8; particulasSaltoNeon(jugadorNeon.x,p.y); feedbackJuego('punto');
                        }
                        if (p.tipo==='fragil') { p.usada=true; setTimeout(()=>{ p.rota=true; },120); }
                        break;
                    }
                }
            }

            // cámara: mantenemos al jugador en la zona alta y desplazamos el mundo.
            if (jugadorNeon.y < 215) {
                const desplazamiento = 215-jugadorNeon.y;
                jugadorNeon.y = 215;
                plataformasNeon.forEach(p=>p.y+=desplazamiento);
                monedasNeon.forEach(m=>m.y+=desplazamiento);
                alturaNeon += desplazamiento;
                alturaMaxNeon = Math.max(alturaMaxNeon,alturaNeon);
                scoreNeon += desplazamiento*.18;
            }

            plataformasNeon = plataformasNeon.filter(p => !p.rota && p.y < canvas.height+70);
            monedasNeon = monedasNeon.filter(m => !m.tomada && m.y < canvas.height+80);
            let minY = plataformasNeon.reduce((min,p)=>Math.min(min,p.y),canvas.height);
            while (minY > -90) {
                const dificultad = Math.min(1,alturaMaxNeon/6500);
                const gap = 72 + dificultad*28 + Math.random()*25;
                minY -= gap;
                crearPlataformaNeon(minY);
            }

            for (const m of monedasNeon) {
                if (!m.tomada && Math.hypot(jugadorNeon.x-m.x,jugadorNeon.y-m.y) < 28) {
                    m.tomada=true; monedasTomadasNeon++; scoreNeon += 25; particulasSaltoNeon(m.x,m.y,'#31d7ff'); feedbackJuego('gol');
                }
            }

            for (let i=particulasNeon.length-1;i>=0;i--) {
                const p=particulasNeon[i]; p.x+=p.vx*delta; p.y+=p.vy*delta; p.vy+=420*delta; p.vida-=delta;
                if(p.vida<=0) particulasNeon.splice(i,1);
            }

            if (jugadorNeon.y - jugadorNeon.h/2 > canvas.height + 55) {
                const final = Math.round(scoreNeon + alturaMaxNeon*.12);
                mostrarResultado('CAÍSTE', `Altura ${Math.round(alturaMaxNeon)} · ${monedasTomadasNeon} monedas`, final, '🟣');
                return;
            }

            // fondo neon
            ctx.fillStyle='#05050b'; ctx.fillRect(0,0,canvas.width,canvas.height);
            const grad=ctx.createLinearGradient(0,0,0,canvas.height); grad.addColorStop(0,'#110522'); grad.addColorStop(1,'#05050b'); ctx.fillStyle=grad; ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.strokeStyle='rgba(176,38,255,.09)'; ctx.lineWidth=1;
            for(let y=(alturaMaxNeon%48)-48;y<canvas.height;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
            for(let x=0;x<canvas.width;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}

            plataformasNeon.forEach(p=>{
                const color=p.tipo==='movil'?'#31d7ff':p.tipo==='fragil'?'#ff477e':'#b026ff';
                ctx.shadowColor=color; ctx.shadowBlur=14; ctx.fillStyle=color; ctx.fillRect(p.x,p.y,p.w,p.h); ctx.shadowBlur=0;
                ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillRect(p.x+5,p.y+2,Math.max(0,p.w-10),2);
            });
            monedasNeon.forEach(m=>{if(m.tomada)return;const pulso=1+Math.sin(tiempo/150+m.fase)*.15;ctx.shadowColor='#ffd60a';ctx.shadowBlur=16;ctx.beginPath();ctx.arc(m.x,m.y,m.r*pulso,0,Math.PI*2);ctx.fillStyle='#ffd60a';ctx.fill();ctx.shadowBlur=0;});
            particulasNeon.forEach(p=>{ctx.globalAlpha=Math.max(0,p.vida*1.7);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4);});ctx.globalAlpha=1;
            ctx.shadowColor='#c084fc';ctx.shadowBlur=22;ctx.fillStyle='#f2e9ff';ctx.fillRect(jugadorNeon.x-jugadorNeon.w/2,jugadorNeon.y-jugadorNeon.h/2,jugadorNeon.w,jugadorNeon.h);ctx.shadowBlur=0;
            ctx.fillStyle='#b026ff';ctx.fillRect(jugadorNeon.x-7,jugadorNeon.y-6,14,12);
            ctx.fillStyle='#fff';ctx.font='800 18px sans-serif';ctx.fillText(`Puntos: ${Math.round(scoreNeon+alturaMaxNeon*.12)}`,20,30);
            ctx.fillStyle='#aab4c2';ctx.font='600 13px sans-serif';ctx.fillText(`Altura ${Math.round(alturaMaxNeon)} · Monedas ${monedasTomadasNeon} · Perfectos ${perfectosNeon}`,20,52);
            idAnimacionNeon=requestAnimationFrame(bucleNeon);
        }

        // ================= 4. ROMPELADRILLOS =================
        let xPaleta = 400, pelotasBreakout = [], ladrillosBreakout = [];
        let scoreBreakout = 0;
        let vidasBreakout = 2;
        let ladrillosRotosBreakout = 0;
        let anchoPaletaBreakout = 110;
        let nivelBreakout = 1;
        let idAnimacionBreakout = null;

        function crearPelotaBreakout(direccion = 1) {
            const velocidadNivel = 1 + Math.min(0.65, (nivelBreakout - 1) * 0.07);
            const velocidad = factorDificultad() * velocidadNivel;
            return {
                x: canvas.width / 2,
                y: canvas.height - 70,
                dx: 3.1 * velocidad * direccion,
                dy: -3.3 * velocidad,
                radio: 8
            };
        }

        function crearNivelBreakout() {
            ladrillosBreakout = [];
            const filas = Math.min(7, 5 + Math.floor((nivelBreakout - 1) / 2));
            const blindajeExtra = Math.min(2, Math.floor((nivelBreakout - 1) / 4));

            for (let c = 0; c < 9; c++) {
                for (let r = 0; r < filas; r++) {
                    const rand = Math.random();
                    const probX3 = Math.min(0.13, 0.06 + nivelBreakout * 0.006);
                    const probX2 = Math.min(0.24, 0.14 + nivelBreakout * 0.007);
                    const probBlindado = Math.min(0.58, 0.31 + nivelBreakout * 0.025);
                    let tipo = 'normal', color = '#00d2ff', texto = '', vida = 1;

                    if (rand < probX3) {
                        tipo = 'x3'; color = '#ff6b35'; texto = 'x3';
                    } else if (rand < probX2) {
                        tipo = 'x2'; color = '#ffd60a'; texto = 'x2';
                    } else if (rand < probBlindado && r >= 1) {
                        tipo = 'blindado'; color = '#65758b';
                        vida = Math.min(4, 2 + blindajeExtra);
                        texto = String(vida);
                    }

                    ladrillosBreakout.push({
                        x: c * 96 + 40,
                        y: r * 31 + 42,
                        w: 86,
                        h: 21,
                        estado: 1,
                        tipo,
                        color,
                        texto,
                        vida,
                        vidaMaxima: vida
                    });
                }
            }
        }

        function abrirJuegoBreakout() {
            if (window.RayitoApp && typeof window.RayitoApp.onGameStart === 'function') window.RayitoApp.onGameStart('breakout');
            if (idAnimacionBreakout) cancelAnimationFrame(idAnimacionBreakout);
            cerrarMenuLibro();
            document.getElementById('modal-juego').style.display = 'flex';
            document.getElementById('titulo-juego-modal').innerText = "Rompeladrillos Core 🧱";
            document.getElementById('desc-juego-modal').innerText = "Superá tableros sin perder tus puntos. Cada nivel suma más bloques, blindaje y velocidad.";
            canvas = document.getElementById('areaJuego');
            ctx = canvas.getContext('2d');
            nivelBreakout = 1;
            anchoPaletaBreakout = 110;
            xPaleta = canvas.width / 2 - anchoPaletaBreakout / 2;
            scoreBreakout = 0;
            vidasBreakout = 2;
            ladrillosRotosBreakout = 0;
            crearNivelBreakout();
            pelotasBreakout = [crearPelotaBreakout(Math.random() > .5 ? 1 : -1)];
            juegoActivo = true;
            currentGame = 'breakout';
            configurarControlesJuego();
            bucleBreakout();
        }

        function acelerarBreakout() {
            pelotasBreakout.forEach(p => {
                const max = 8.2 * factorDificultad() * (1 + Math.min(0.5, (nivelBreakout - 1) * 0.055));
                const mod = Math.hypot(p.dx, p.dy) || 1;
                if (mod < max) {
                    p.dx *= 1.035;
                    p.dy *= 1.035;
                }
            });
        }

        function pasarNivelBreakout() {
            const nivelSuperado = nivelBreakout;
            const bonusNivel = 250 * nivelSuperado;
            scoreBreakout += bonusNivel;
            nivelBreakout++;
            anchoPaletaBreakout = Math.max(66, 110 - (nivelBreakout - 1) * 5);
            xPaleta = canvas.width / 2 - anchoPaletaBreakout / 2;
            crearNivelBreakout();
            pelotasBreakout = [crearPelotaBreakout(Math.random() > .5 ? 1 : -1)];
            mostrarToast(`🧱 Nivel ${nivelSuperado} superado · +${bonusNivel} · Nivel ${nivelBreakout}`);
            feedbackJuego('record');
        }

        function bucleBreakout() {
            if (!juegoActivo || currentGame !== 'breakout') return;
            if (juegoPausado) {
                idAnimacionBreakout = requestAnimationFrame(bucleBreakout);
                return;
            }
            ctx.fillStyle = '#080b10'; ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let i = pelotasBreakout.length - 1; i >= 0; i--) {
                const p = pelotasBreakout[i];
                p.x += p.dx; p.y += p.dy;
                if (p.x < p.radio || p.x > canvas.width - p.radio) p.dx *= -1;
                if (p.y < p.radio) p.dy = Math.abs(p.dy);

                if (p.y + p.radio >= canvas.height - 22 && p.y <= canvas.height - 7 && p.x >= xPaleta && p.x <= xPaleta + anchoPaletaBreakout && p.dy > 0) {
                    const impacto = (p.x - (xPaleta + anchoPaletaBreakout / 2)) / (anchoPaletaBreakout / 2);
                    p.dy = -Math.abs(p.dy);
                    p.dx += impacto * 1.65;
                    p.y = canvas.height - 31;
                }

                if (p.y > canvas.height + 25) {
                    pelotasBreakout.splice(i, 1);
                    continue;
                }

                for (const l of ladrillosBreakout) {
                    if (l.estado !== 1) continue;
                    if (p.x + p.radio > l.x && p.x - p.radio < l.x + l.w && p.y + p.radio > l.y && p.y - p.radio < l.y + l.h) {
                        p.dy *= -1;
                        l.vida--;
                        if (l.vida > 0) {
                            scoreBreakout += 5 + Math.max(0, nivelBreakout - 1);
                            feedbackJuego('punto');
                        } else {
                            l.estado = 0;
                            ladrillosRotosBreakout++;
                            const multiplicadorNivel = 1 + Math.min(1.5, (nivelBreakout - 1) * 0.08);
                            scoreBreakout += Math.round((l.tipo === 'blindado' ? 20 : 10) * multiplicadorNivel);
                            feedbackJuego('punto');
                            if (l.tipo === 'x2') {
                                pelotasBreakout.push({ ...p, x: l.x + l.w / 2, y: l.y + 28, dx: -Math.abs(p.dx || 3), dy: -Math.abs(p.dy || 3) });
                            } else if (l.tipo === 'x3') {
                                const base = Math.max(3, Math.abs(p.dy));
                                pelotasBreakout.push({ ...p, x: l.x + 18, y: l.y + 28, dx: -base * .8, dy: -base });
                                pelotasBreakout.push({ ...p, x: l.x + l.w - 18, y: l.y + 28, dx: base * .8, dy: -base });
                            }
                            if (ladrillosRotosBreakout % 8 === 0) acelerarBreakout();
                        }
                        break;
                    }
                }
            }

            let totalVivos = ladrillosBreakout.filter(l => l.estado === 1).length;
            if (ladrillosBreakout.length > 0 && totalVivos === 0) {
                pasarNivelBreakout();
                totalVivos = ladrillosBreakout.filter(l => l.estado === 1).length;
            }

            if (pelotasBreakout.length === 0) {
                if (vidasBreakout > 0) {
                    vidasBreakout--;
                    pelotasBreakout.push(crearPelotaBreakout(Math.random() > .5 ? 1 : -1));
                    xPaleta = canvas.width / 2 - anchoPaletaBreakout / 2;
                    mostrarToast(`🧱 Pelota perdida · ${vidasBreakout} vidas`);
                } else {
                    mostrarResultado(
                        'GAME OVER',
                        `Llegaste al nivel ${nivelBreakout} · Rompiste ${ladrillosRotosBreakout} bloques`,
                        scoreBreakout,
                        '🧱'
                    );
                    return;
                }
            }

            ladrillosBreakout.forEach(l => {
                if (l.estado !== 1) return;
                ctx.fillStyle = l.color;
                ctx.fillRect(l.x, l.y, l.w, l.h);
                if (l.tipo === 'blindado' && l.vida < l.vidaMaxima) {
                    ctx.fillStyle = 'rgba(255,255,255,.18)';
                    ctx.fillRect(l.x + 4, l.y + 4, l.w - 8, l.h - 8);
                }
                if (l.texto) {
                    ctx.fillStyle = '#081018'; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText(l.tipo === 'blindado' ? `${l.vida}` : l.texto, l.x + l.w / 2, l.y + 15); ctx.textAlign = 'left';
                }
            });

            xPaleta = Math.max(0, Math.min(canvas.width - anchoPaletaBreakout, xPaleta));
            ctx.fillStyle = '#fff'; ctx.fillRect(xPaleta, canvas.height - 20, anchoPaletaBreakout, 12);
            pelotasBreakout.forEach(p => {
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radio, 0, Math.PI * 2); ctx.fillStyle = '#ff6b35'; ctx.fill(); ctx.closePath();
            });
            ctx.fillStyle = '#fff'; ctx.font = '800 17px sans-serif'; ctx.fillText(`NIVEL ${nivelBreakout} · ${scoreBreakout} PTS`, 20, 28);
            ctx.fillStyle = '#aab4c2'; ctx.font = '600 13px sans-serif'; ctx.fillText(`Pelotas ${pelotasBreakout.length} · Vidas ${vidasBreakout} · Bloques ${totalVivos}`, 20, 50);
            idAnimacionBreakout = requestAnimationFrame(bucleBreakout);
        }

        // ================= 5. COHETE ESPACIAL =================
        let coheteY = 300;
        let idAnimacionCohete = null;
        let estrellasCohete = [];
        let obstaculosCohete = [];
        let scoreCohete = 0;
        let inicioCohete = 0;
        let asteroidesSuperados = 0;
        let velocidadCoheteActual = 4;
        let multiplicadorCohete = 1;

        function abrirJuegoCohete() {
            if (window.RayitoApp && typeof window.RayitoApp.onGameStart === 'function') window.RayitoApp.onGameStart('cohete');
            if (idAnimacionCohete) { 
                cancelAnimationFrame(idAnimacionCohete); 
                idAnimacionCohete = null;
            }

            cerrarMenuLibro();
            document.getElementById('modal-juego').style.display = 'flex';
            document.getElementById('titulo-juego-modal').innerText = "Cohete Espacial";
            document.getElementById('desc-juego-modal').innerText = "Esquivá los asteroides: cuanto más sobrevivas, más rápido se vuelve el juego.";
            canvas = document.getElementById('areaJuego');
            ctx = canvas.getContext('2d');
            coheteY = canvas.height / 2;
            scoreCohete = 0;
            asteroidesSuperados = 0;
            multiplicadorCohete = 1;
            velocidadCoheteActual = 4 * factorDificultad();
            inicioCohete = performance.now();
            
            estrellasCohete = [];
            for (let i = 0; i < 60; i++) {
                estrellasCohete.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 2 + 1, speed: Math.random() * 2 + 1 });
            }
            
            obstaculosCohete = [{
                x: canvas.width,
                y: Math.random() * 400 + 100,
                radio: 25,
                velocidadBase: 0.95 + Math.random() * 0.12
            }];

            juegoActivo = true;
            currentGame = 'cohete';
            configurarControlesJuego();
            bucleCohete();
        }

        function bucleCohete(tiempoActual = performance.now()) {
            if (!juegoActivo || currentGame !== 'cohete') return;
            if (juegoPausado) {
                idAnimacionCohete = requestAnimationFrame(bucleCohete);
                return;
            }
            const segundosSobrevividos = Math.max(0, (tiempoActual - inicioCohete) / 1000);
            multiplicadorCohete = 1 + segundosSobrevividos * 0.035;
            velocidadCoheteActual = 4 * factorDificultad() * multiplicadorCohete;
            scoreCohete = Math.floor(segundosSobrevividos * 3) + asteroidesSuperados * 25;

            ctx.fillStyle = '#050515';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#ffffff';
            estrellasCohete.forEach(s => {
                ctx.fillRect(s.x, s.y, s.size, s.size);
                s.x -= s.speed * Math.min(multiplicadorCohete, 3);
                if (s.x < 0) s.x = canvas.width;
            });

            let cx = 120, cy = coheteY;
            ctx.save();
            ctx.translate(cx, cy);

            ctx.beginPath();
            ctx.moveTo(-25, 0);
            ctx.lineTo(-45 - Math.random() * 10, -5);
            ctx.lineTo(-30, 0);
            ctx.lineTo(-45 - Math.random() * 10, 5);
            ctx.fillStyle = '#FF4500';
            ctx.fill();
            ctx.closePath();

            ctx.beginPath();
            ctx.moveTo(25, 0); 
            ctx.lineTo(-15, -12); 
            ctx.lineTo(-20, -5);
            ctx.lineTo(-25, -5);
            ctx.lineTo(-25, 5);
            ctx.lineTo(-20, 5);
            ctx.lineTo(-15, 12); 
            ctx.closePath();
            ctx.fillStyle = '#E0E0E0';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(25, 0);
            ctx.lineTo(10, -5);
            ctx.lineTo(10, 5);
            ctx.closePath();
            ctx.fillStyle = '#FF3333';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(2, -1, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#00D2FF';
            ctx.fill();
            ctx.strokeStyle = '#FFF';
            ctx.stroke();

            ctx.restore();

            let ultimoObs = obstaculosCohete[obstaculosCohete.length - 1];
            if (ultimoObs && ultimoObs.x < canvas.width - (300 / factorDificultad())) {
                obstaculosCohete.push({
                    x: canvas.width,
                    y: Math.random() * (canvas.height - 150) + 75,
                    radio: Math.random() * 15 + 20,
                    velocidadBase: 0.95 + Math.random() * 0.15
                });
            }

            let choque = false;
            for (let index = obstaculosCohete.length - 1; index >= 0; index--) {
                const obs = obstaculosCohete[index];
                obs.x -= velocidadCoheteActual * obs.velocidadBase;

                ctx.beginPath();
                ctx.arc(obs.x, obs.y, obs.radio, 0, Math.PI * 2);
                ctx.fillStyle = '#666';
                ctx.fill();
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.closePath();

                if (obs.x < -50) {
                    obstaculosCohete.splice(index, 1);
                    asteroidesSuperados++;
                    feedbackJuego('punto');
                    continue;
                }

                let distancia = Math.hypot(cx - obs.x, cy - obs.y);
                if (distancia < obs.radio + 15) {
                    choque = true;
                }
            }

            if (choque) {
                idAnimacionCohete = null;
                mostrarResultado('¡IMPACTO!', 'Un asteroide alcanzó el cohete', scoreCohete, '💥');
                return;
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText("🚀 PUNTOS: " + scoreCohete, 25, 35);
            ctx.fillStyle = multiplicadorCohete >= 2 ? '#ff6b35' : '#ffd60a';
            ctx.fillText(`⚡ VELOCIDAD: x${multiplicadorCohete.toFixed(1)}`, 25, 62);
            ctx.fillStyle = 'rgba(255,255,255,.72)';
            ctx.font = '600 14px sans-serif';
            ctx.fillText(`Tiempo: ${segundosSobrevividos.toFixed(1)} s`, 25, 86);

            idAnimacionCohete = requestAnimationFrame(bucleCohete);
        }

        // ================= 6. PENALTY MASTER =================
        const MAX_TIROS_PENALTY = 5;
        let nivelPenalty = 1;
        let golesPenalty = 0;
        let golesNivelPenalty = 0;
        let tirosPenalty = 0;
        let puntosPenalty = 0;
        let rachaPenalty = 0;
        let potenciaPenalty = 0.55;
        let direccionPotencia = 1;
        let estadoBalon = 'esperando';
        let objetivoPenalty = { x: 475, y: 170 };
        let zonaBonusPenalty = { x: 475, y: 145, radio: 24, dx: 0.7 };
        let balon = { x: 475, y: 520, radio: 13, inicioX: 475, inicioY: 520, destinoX: 475, destinoY: 170, progreso: 0, duracion: 52 };
        let mensajeResultado = "";
        let subtituloResultado = "";
        let tiempoMensaje = 0;
        let resultadosPenalty = [];
        let particulasPenalty = [];
        let idAnimacionPenalty = null;
        let timeoutPenalty = null;
        let portero = {
            x: 475,
            y: 172,
            objetivoX: 475,
            objetivoY: 172,
            inclinacion: 0,
            inclinacionObjetivo: 0,
            reaccion: 0,
            velocidad: 0.1,
            decidio: false,
            vaAAtajar: false
        };

        function golesNecesariosPenalty() {
            if (nivelPenalty <= 2) return 2;
            if (nivelPenalty <= 5) return 3;
            if (nivelPenalty <= 8) return 4;
            return 5;
        }

        function calcularProbabilidadAtajadaPenalty(x, y, potencia, dificultad = dificultadActual) {
            const baseDificultad = { facil: 0.18, normal: 0.32, dificil: 0.46 };
            const presionTanda = Math.min(0.14, tirosPenalty * 0.028);
            const presionNivel = Math.min(0.24, (nivelPenalty - 1) * 0.028);
            const centralidad = Math.max(0, 1 - Math.abs(x - 475) / 145);
            const alturaAlcanzable = Math.max(0, 1 - Math.abs(y - 172) / 75);
            const tiroAEsquina = Math.abs(x - 475) > 105 || y < 132;
            const probabilidad = (baseDificultad[dificultad] || 0.3) + presionTanda + presionNivel
                + centralidad * 0.3
                + alturaAlcanzable * 0.08
                - potencia * 0.14
                - (tiroAEsquina ? 0.16 : 0);
            return Math.max(0.08, Math.min(0.88, probabilidad));
        }

        function actualizarMarcadorPenalty(estado = 'Apuntá y pateá') {
            const nivelEl = document.getElementById('penalty-nivel');
            if (nivelEl) nivelEl.textContent = nivelPenalty;
            document.getElementById('penalty-tiros').textContent = `${tirosPenalty} / ${MAX_TIROS_PENALTY}`;
            document.getElementById('penalty-goles').textContent = golesPenalty;
            document.getElementById('penalty-puntos').textContent = puntosPenalty;
            document.getElementById('penalty-estado').textContent = estado;
        }

        function abrirJuegoPenalty() {
            if (window.RayitoApp && typeof window.RayitoApp.onGameStart === 'function') window.RayitoApp.onGameStart('penalty');
            if (idAnimacionPenalty) cancelAnimationFrame(idAnimacionPenalty);
            if (timeoutPenalty) clearTimeout(timeoutPenalty);

            cerrarMenuLibro();
            document.getElementById('modal-juego').style.display = 'flex';
            document.getElementById('titulo-juego-modal').innerText = "Penalty Master ⚽";
            document.getElementById('desc-juego-modal').innerText = "Tandas de 5 tiros por niveles. Los puntos se acumulan y el arquero mejora en cada nivel.";
            canvas = document.getElementById('areaJuego');
            ctx = canvas.getContext('2d');

            nivelPenalty = 1;
            golesPenalty = 0;
            golesNivelPenalty = 0;
            tirosPenalty = 0;
            puntosPenalty = 0;
            rachaPenalty = 0;
            resultadosPenalty = [];
            particulasPenalty = [];
            juegoActivo = true;
            currentGame = 'penalty';
            prepararEstadoJuego();
            actualizarMarcadorPenalty();
            reiniciarTiroPenalty();

            document.getElementById('controles-moviles').classList.remove('is-active');
            canvas.onpointermove = apuntarPenalty;
            canvas.onpointerdown = patearPenalty;
            canvas.onclick = null;
            canvas.focus({ preventScroll: true });
            buclePenalty();
        }

        function posicionCanvasPenalty(e) {
            return posicionEnCanvas(e);
        }

        function apuntarPenalty(e) {
            if (!juegoActivo || juegoPausado || currentGame !== 'penalty' || estadoBalon !== 'esperando') return;
            e.preventDefault();
            const p = posicionCanvasPenalty(e);
            objetivoPenalty.x = Math.max(320, Math.min(630, p.x));
            objetivoPenalty.y = Math.max(105, Math.min(255, p.y));
        }

        function patearPenalty(e) {
            if (!juegoActivo || juegoPausado || currentGame !== 'penalty') return;
            e.preventDefault();
            if (estadoBalon === 'final') {
                abrirJuegoPenalty();
                return;
            }
            if (estadoBalon !== 'esperando') return;

            apuntarPenalty(e);
            balon.inicioX = balon.x;
            balon.inicioY = balon.y;
            balon.destinoX = objetivoPenalty.x;
            balon.destinoY = objetivoPenalty.y;
            balon.progreso = 0;
            balon.duracion = 68 - potenciaPenalty * 30;
            estadoBalon = 'disparando';
            tirosPenalty++;

            const probabilidadAtajada = calcularProbabilidadAtajadaPenalty(
                balon.destinoX,
                balon.destinoY,
                potenciaPenalty
            );
            portero.vaAAtajar = Math.random() < probabilidadAtajada;
            if (portero.vaAAtajar) {
                portero.objetivoX = balon.destinoX + (Math.random() - 0.5) * 18;
                portero.objetivoY = Math.max(135, Math.min(205, balon.destinoY + 12));
            } else {
                const ladoEquivocado = balon.destinoX < 475 ? 1 : -1;
                portero.objetivoX = 475 + ladoEquivocado * (75 + Math.random() * 80);
                portero.objetivoY = 165 + (Math.random() - 0.5) * 40;
            }
            portero.inclinacionObjetivo = Math.max(-0.92, Math.min(0.92, (portero.objetivoX - 475) / 115));
            const presionNivel = Math.min(5.5, (nivelPenalty - 1) * 0.42);
            portero.reaccion = Math.max(2.6, (16 - tirosPenalty * 0.8 - potenciaPenalty * 3 - presionNivel) / factorDificultad());
            portero.velocidad = (portero.vaAAtajar ? 0.12 : 0.095) * factorDificultad() * (1 + Math.min(0.45, (nivelPenalty - 1) * 0.045));
            portero.decidio = true;
            actualizarMarcadorPenalty('¡Tiro en camino!');
        }

        function reiniciarTiroPenalty() {
            if (!juegoActivo || currentGame !== 'penalty') return;
            balon.x = canvas.width / 2;
            balon.y = canvas.height - 72;
            balon.progreso = 0;
            objetivoPenalty.x = canvas.width / 2;
            objetivoPenalty.y = 170;
            zonaBonusPenalty = { x: 390 + Math.random() * 170, y: 126 + Math.random() * 58, radio: Math.max(15, 24 - Math.floor((nivelPenalty - 1) / 2)), dx: (Math.random() > .5 ? 1 : -1) * (0.55 + tirosPenalty * 0.08 + (nivelPenalty - 1) * 0.045) };
            potenciaPenalty = 0.45;
            direccionPotencia = 1;
            portero.x = canvas.width / 2;
            portero.y = 172;
            portero.objetivoX = portero.x;
            portero.objetivoY = portero.y;
            portero.inclinacion = 0;
            portero.inclinacionObjetivo = 0;
            portero.decidio = false;
            portero.vaAAtajar = false;
            estadoBalon = 'esperando';
            actualizarMarcadorPenalty(tirosPenalty === 0 ? `Nivel ${nivelPenalty} · Necesitás ${golesNecesariosPenalty()}/5 goles` : 'Prepará el próximo tiro');
        }

        function resolverTiroPenalty() {
            const enArco = balon.destinoX >= 335 && balon.destinoX <= 615 && balon.destinoY >= 105 && balon.destinoY <= 222;
            const distanciaArquero = Math.abs(balon.destinoX - portero.x);
            const alcanceVertical = Math.abs(balon.destinoY - portero.y);
            const atajada = enArco
                && portero.vaAAtajar
                && distanciaArquero < 86
                && alcanceVertical < 90;

            if (!enArco) {
                rachaPenalty = 0;
                mensajeResultado = "¡AFUERA!";
                subtituloResultado = balon.destinoY < 105 ? "Se fue por arriba" : "Rozó el palo";
                estadoBalon = 'fuera';
                resultadosPenalty.push('fuera');
                actualizarMarcadorPenalty('Tiro afuera · +0 puntos');
                feedbackJuego('fin');
            } else if (atajada) {
                rachaPenalty = 0;
                mensajeResultado = "¡ATAJÓ!";
                subtituloResultado = "El arquero se tiró y llegó a la pelota";
                estadoBalon = 'atajado';
                resultadosPenalty.push('atajado');
                actualizarMarcadorPenalty('Atajó el arquero · +0 puntos');
                feedbackJuego('fin');
            } else {
                golesPenalty++;
                golesNivelPenalty++;
                rachaPenalty++;
                const esquina = Math.abs(balon.destinoX - 475) > 105 || balon.destinoY < 135;
                const bonusEsquina = esquina ? 150 : 0;
                const bonusPotencia = Math.round(potenciaPenalty * 100);
                const bonusRacha = Math.max(0, rachaPenalty - 1) * 50;
                const precision = Math.hypot(balon.destinoX - zonaBonusPenalty.x, balon.destinoY - zonaBonusPenalty.y) <= zonaBonusPenalty.radio + 12;
                const bonusPrecision = precision ? 120 : 0;
                const puntosGanados = 100 + bonusEsquina + bonusPotencia + bonusRacha + bonusPrecision;
                puntosPenalty += puntosGanados;
                mensajeResultado = esquina ? "¡GOLAZO!" : "¡GOOOL!";
                subtituloResultado = `+${puntosGanados} puntos${bonusPrecision ? ' · PRECISIÓN +120' : ''} · Total ${puntosPenalty}`;
                estadoBalon = 'gol';
                resultadosPenalty.push('gol');
                actualizarMarcadorPenalty(`¡Gol! +${puntosGanados} puntos`);
                crearParticulasPenalty(balon.destinoX, balon.destinoY);
                feedbackJuego('gol');
            }

            tiempoMensaje = 80;
            timeoutPenalty = setTimeout(() => {
                if (!juegoActivo || currentGame !== 'penalty') return;
                if (tirosPenalty >= MAX_TIROS_PENALTY) {
                    const requeridos = golesNecesariosPenalty();

                    if (golesNivelPenalty >= requeridos) {
                        const nivelSuperado = nivelPenalty;
                        const bonusNivel = nivelSuperado * 200 + golesNivelPenalty * 50;
                        puntosPenalty += bonusNivel;
                        nivelPenalty++;
                        tirosPenalty = 0;
                        golesNivelPenalty = 0;
                        rachaPenalty = 0;
                        resultadosPenalty = [];
                        estadoBalon = 'transicion';
                        mensajeResultado = `¡NIVEL ${nivelSuperado} SUPERADO!`;
                        subtituloResultado = `+${bonusNivel} bonus · Total ${puntosPenalty} · Próximo nivel ${nivelPenalty}`;
                        tiempoMensaje = 95;
                        actualizarMarcadorPenalty(`Nivel ${nivelPenalty} desbloqueado · ${puntosPenalty} puntos`);
                        feedbackJuego('record');

                        timeoutPenalty = setTimeout(() => {
                            if (!juegoActivo || currentGame !== 'penalty') return;
                            reiniciarTiroPenalty();
                        }, 1450);
                    } else {
                        mostrarResultado(
                            'TANDA TERMINADA',
                            `Nivel ${nivelPenalty} · ${golesNivelPenalty}/${MAX_TIROS_PENALTY} goles (necesitabas ${requeridos}) · ${golesPenalty} goles totales`,
                            puntosPenalty,
                            '⚽'
                        );
                    }
                } else {
                    reiniciarTiroPenalty();
                }
            }, 1350);
        }

        function crearParticulasPenalty(x, y) {
            const colores = ['#ffd60a', '#ffffff', '#42f5a7', '#40c9ff'];
            for (let i = 0; i < 42; i++) {
                particulasPenalty.push({
                    x, y,
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.8) * 9,
                    vida: 55 + Math.random() * 25,
                    color: colores[Math.floor(Math.random() * colores.length)]
                });
            }
        }

        function actualizarPenalty() {
            if (estadoBalon === 'esperando') {
                potenciaPenalty += 0.012 * factorDificultad() * (1 + tirosPenalty * 0.10 + (nivelPenalty - 1) * 0.035) * direccionPotencia;
                zonaBonusPenalty.x += zonaBonusPenalty.dx * factorDificultad();
                if (zonaBonusPenalty.x < 355 || zonaBonusPenalty.x > 595) zonaBonusPenalty.dx *= -1;
                if (potenciaPenalty >= 1 || potenciaPenalty <= 0.2) direccionPotencia *= -1;
                portero.x = 475 + Math.sin(performance.now() / 520) * 28;
            } else if (estadoBalon === 'disparando') {
                balon.progreso += 1 / balon.duracion;
                const t = Math.min(1, balon.progreso);
                const suave = 1 - Math.pow(1 - t, 2.2);
                balon.x = balon.inicioX + (balon.destinoX - balon.inicioX) * suave;
                balon.y = balon.inicioY + (balon.destinoY - balon.inicioY) * suave - Math.sin(t * Math.PI) * 48 * potenciaPenalty;

                if (portero.decidio && balon.progreso > portero.reaccion / balon.duracion) {
                    const dx = portero.objetivoX - portero.x;
                    const dy = portero.objetivoY - portero.y;
                    portero.x += dx * portero.velocidad;
                    portero.y += dy * portero.velocidad;
                    portero.inclinacion += (portero.inclinacionObjetivo - portero.inclinacion) * 0.14;
                }
                if (t >= 1) resolverTiroPenalty();
            }

            particulasPenalty.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.18;
                p.vida--;
            });
            particulasPenalty = particulasPenalty.filter(p => p.vida > 0);
        }

        function dibujarEstadioPenalty() {
            const gradiente = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradiente.addColorStop(0, '#071a2d');
            gradiente.addColorStop(0.31, '#12304a');
            gradiente.addColorStop(0.32, '#18834b');
            gradiente.addColorStop(1, '#075c35');
            ctx.fillStyle = gradiente;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'rgba(255,255,255,.08)';
            for (let x = 15; x < canvas.width; x += 30) {
                ctx.beginPath();
                ctx.arc(x, 88 + Math.sin(x) * 7, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            for (let y = 265; y < canvas.height; y += 54) {
                ctx.fillStyle = y % 108 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.035)';
                ctx.fillRect(0, y, canvas.width, 54);
            }

            ctx.strokeStyle = 'rgba(255,255,255,.78)';
            ctx.lineWidth = 3;
            ctx.strokeRect(245, 218, 460, 205);
            ctx.beginPath();
            ctx.arc(475, 420, 75, Math.PI, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(475, 505, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();

            ctx.fillStyle = 'rgba(0,0,0,.32)';
            ctx.fillRect(330, 102, 290, 120);
            ctx.strokeStyle = 'rgba(255,255,255,.2)';
            ctx.lineWidth = 1;
            for (let x = 335; x <= 615; x += 18) {
                ctx.beginPath(); ctx.moveTo(x, 105); ctx.lineTo(x, 222); ctx.stroke();
            }
            for (let y = 108; y <= 218; y += 15) {
                ctx.beginPath(); ctx.moveTo(335, y); ctx.lineTo(615, y); ctx.stroke();
            }
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 9;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(330, 222); ctx.lineTo(330, 100); ctx.lineTo(620, 100); ctx.lineTo(620, 222);
            ctx.stroke();
        }

        function dibujarPorteroPenalty() {
            ctx.save();
            ctx.translate(portero.x, portero.y);
            ctx.rotate(portero.inclinacion);
            ctx.strokeStyle = '#ff9f1c';
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-23, -2); ctx.lineTo(-57, 10);
            ctx.moveTo(23, -2); ctx.lineTo(57, 10);
            ctx.stroke();
            ctx.strokeStyle = '#eaf4ff';
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.moveTo(-56, 10); ctx.lineTo(-66, 12);
            ctx.moveTo(56, 10); ctx.lineTo(66, 12);
            ctx.stroke();
            ctx.fillStyle = '#ff7b00';
            ctx.roundRect(-28, -13, 56, 47, 10);
            ctx.fill();
            ctx.fillStyle = '#10243b';
            ctx.fillRect(-25, 27, 50, 12);
            ctx.strokeStyle = '#10243b';
            ctx.lineWidth = 11;
            ctx.beginPath();
            ctx.moveTo(-15, 35); ctx.lineTo(-28, 57);
            ctx.moveTo(15, 35); ctx.lineTo(28, 57);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, -27, 13, 0, Math.PI * 2);
            ctx.fillStyle = '#d89b71';
            ctx.fill();
            ctx.restore();
        }

        function dibujarBalonPenalty() {
            const escala = 0.52 + (balon.y / canvas.height) * 0.75;
            const radio = balon.radio * escala;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,.5)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(balon.x, balon.y, radio, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#172033';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(balon.x, balon.y, radio * .36, 0, Math.PI * 2);
            ctx.fillStyle = '#172033';
            ctx.fill();
            ctx.restore();
        }

        function dibujarHudPenalty() {
            ctx.fillStyle = 'rgba(4,12,24,.82)';
            ctx.roundRect(20, 18, 285, 65, 15);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '700 17px Segoe UI, sans-serif';
            const tiroMostrado = estadoBalon === 'esperando'
                ? Math.min(tirosPenalty + 1, MAX_TIROS_PENALTY)
                : Math.min(tirosPenalty, MAX_TIROS_PENALTY);
            ctx.fillText(`TIRO ${tiroMostrado} / ${MAX_TIROS_PENALTY}`, 38, 45);
            ctx.fillStyle = '#ffd60a';
            ctx.font = '800 19px Segoe UI, sans-serif';
            ctx.fillText(`${puntosPenalty} PTS`, 38, 70);
            ctx.fillStyle = '#fff';
            ctx.font = '700 15px Segoe UI, sans-serif';
            ctx.fillText(`NIVEL ${nivelPenalty}`, 178, 45);
            ctx.fillText(`GOLES ${golesNivelPenalty}/${MAX_TIROS_PENALTY}`, 178, 69);

            const inicio = 790;
            for (let i = 0; i < MAX_TIROS_PENALTY; i++) {
                ctx.beginPath();
                ctx.arc(inicio + i * 30, 48, 10, 0, Math.PI * 2);
                const resultado = resultadosPenalty[i];
                ctx.fillStyle = resultado === 'gol'
                    ? '#42f587'
                    : resultado === 'atajado'
                        ? '#40c9ff'
                        : resultado === 'fuera'
                            ? '#ff4d6d'
                            : 'rgba(255,255,255,.22)';
                ctx.fill();
            }

            if (estadoBalon === 'esperando') {
                ctx.setLineDash([8, 8]);
                ctx.strokeStyle = 'rgba(255,255,255,.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(balon.x, balon.y - 15);
                ctx.quadraticCurveTo((balon.x + objetivoPenalty.x) / 2, objetivoPenalty.y + 110, objetivoPenalty.x, objetivoPenalty.y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.save();
                ctx.strokeStyle = 'rgba(66,245,167,.9)';
                ctx.fillStyle = 'rgba(66,245,167,.08)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(zonaBonusPenalty.x, zonaBonusPenalty.y, zonaBonusPenalty.radio, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#42f5a7';
                ctx.font = '800 11px Segoe UI, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('+120', zonaBonusPenalty.x, zonaBonusPenalty.y + 4);
                ctx.restore();

                ctx.strokeStyle = '#ffd60a';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(objetivoPenalty.x, objetivoPenalty.y, 18, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(objetivoPenalty.x - 25, objetivoPenalty.y);
                ctx.lineTo(objetivoPenalty.x + 25, objetivoPenalty.y);
                ctx.moveTo(objetivoPenalty.x, objetivoPenalty.y - 25);
                ctx.lineTo(objetivoPenalty.x, objetivoPenalty.y + 25);
                ctx.stroke();

                ctx.fillStyle = 'rgba(4,12,24,.78)';
                ctx.roundRect(335, 555, 280, 25, 12);
                ctx.fill();
                const barraW = 266 * potenciaPenalty;
                const color = potenciaPenalty > .82 ? '#ff4d6d' : potenciaPenalty > .55 ? '#ffd60a' : '#42f587';
                ctx.fillStyle = color;
                ctx.roundRect(342, 562, barraW, 11, 5);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = '700 12px Segoe UI, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('POTENCIA', 475, 548);
                ctx.textAlign = 'left';
            }
        }

        function dibujarMensajesPenalty() {
            if (tiempoMensaje > 0 && estadoBalon !== 'final') {
                tiempoMensaje--;
                ctx.fillStyle = 'rgba(3,10,20,.86)';
                ctx.roundRect(300, 274, 350, 92, 18);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.fillStyle = estadoBalon === 'gol' ? '#ffd60a' : '#fff';
                ctx.font = '900 31px Segoe UI, sans-serif';
                ctx.fillText(mensajeResultado, 475, 314);
                ctx.fillStyle = '#cbd7e6';
                ctx.font = '600 15px Segoe UI, sans-serif';
                ctx.fillText(subtituloResultado, 475, 343);
                ctx.textAlign = 'left';
            }

            if (estadoBalon === 'final') {
                ctx.fillStyle = 'rgba(3,10,20,.9)';
                ctx.roundRect(260, 190, 430, 235, 24);
                ctx.fill();
                ctx.strokeStyle = '#ffd60a';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffd60a';
                ctx.font = '900 32px Segoe UI, sans-serif';
                ctx.fillText(golesPenalty >= 4 ? '¡CAMPEÓN!' : golesPenalty >= 2 ? '¡BUENA TANDA!' : '¡A ENTRENAR!', 475, 245);
                ctx.fillStyle = '#fff';
                ctx.font = '800 24px Segoe UI, sans-serif';
                ctx.fillText(`${golesPenalty} goles · ${puntosPenalty} puntos`, 475, 292);
                ctx.fillStyle = '#cbd7e6';
                ctx.font = '500 15px Segoe UI, sans-serif';
                ctx.fillText('El arquero aprende y la zona verde premia la precisión', 475, 326);
                ctx.fillStyle = '#ffd60a';
                ctx.roundRect(342, 354, 266, 44, 12);
                ctx.fill();
                ctx.fillStyle = '#102033';
                ctx.font = '800 16px Segoe UI, sans-serif';
                ctx.fillText('TOCÁ PARA LA REVANCHA', 475, 382);
                ctx.textAlign = 'left';
            }
        }

        function buclePenalty() {
            if (!juegoActivo || currentGame !== 'penalty') return;
            if (juegoPausado) {
                idAnimacionPenalty = requestAnimationFrame(buclePenalty);
                return;
            }
            actualizarPenalty();
            dibujarEstadioPenalty();
            dibujarPorteroPenalty();
            particulasPenalty.forEach(p => {
                ctx.globalAlpha = Math.max(0, p.vida / 70);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 5, 5);
            });
            ctx.globalAlpha = 1;
            dibujarBalonPenalty();
            dibujarHudPenalty();
            dibujarMensajesPenalty();
            idAnimacionPenalty = requestAnimationFrame(buclePenalty);
        }

        cambiarTema(localStorage.getItem('rayito-tema') || 'rayito', false);
        document.getElementById('dificultad-juego').value = dificultadActual;
        actualizarRecordsUI();
        inicializarPlaylist();
        iniciarCarga();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && currentGame && juegoActivo && !juegoPausado) {
                togglePausaJuego();
            }
        });

        document.addEventListener('keydown', event => {
            const direcciones = {
                ArrowUp: 'UP',
                ArrowDown: 'DOWN',
                ArrowLeft: 'LEFT',
                ArrowRight: 'RIGHT'
            };
            const tecla = event.key.toLowerCase();

            if (currentGame === 'highway' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(tecla)) {
                teclasHighway.add(tecla);
                event.preventDefault();
            }

            if (currentGame === 'neon' && ['a', 'd', 'arrowleft', 'arrowright'].includes(tecla)) {
                teclasNeon.add(tecla);
                event.preventDefault();
            }

            if (currentGame === 'snake' && direcciones[event.key]) {
                event.preventDefault();
                cambiarDireccionSnake(direcciones[event.key]);
            }

            if (currentGame && tecla === 'p') {
                event.preventDefault();
                togglePausaJuego();
            }

            if (currentGame && tecla === 'r') {
                event.preventDefault();
                reiniciarJuegoActual();
            }

            if (event.key === 'Escape') {
                if (document.getElementById('modal-juego').style.display === 'flex') {
                    cerrarTodoJuego();
                } else if (document.getElementById('modal-libro').style.display === 'block') {
                    cerrarMenuLibro();
                }
            }
        });

        document.addEventListener('keyup', event => {
            const tecla = event.key.toLowerCase();
            teclasHighway.delete(tecla);
            teclasNeon.delete(tecla);
        });

        window.addEventListener('blur', () => {
            teclasHighway.clear();
            teclasNeon.clear();
        });
