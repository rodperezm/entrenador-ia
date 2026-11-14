import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SILENT_MP4 } from './silentVideo';

// Mantiene la pantalla encendida mientras se entrena o corre el temporizador.
// En la app nativa basta expo-keep-awake. En la web no: el permiso se pierde cada vez que la
// pantalla se apaga o se cambia de app, y en el iPhone, en la app agregada a la pantalla de
// inicio, no funciona antes de iOS 18.4. Por eso en la web se vuelve a pedir al volver y, en
// iPhone, se suma un video en silencio (iOS no bloquea la pantalla mientras suena un video).
export function useStayAwake(tag: string) {
  useEffect(() => {
    if (Platform.OS === 'web') return stayAwakeOnWeb();
    let active = false;
    isAvailableAsync()
      .then((ok) => (ok ? activateKeepAwakeAsync(tag).then(() => (active = true)) : undefined))
      .catch(() => {});
    return () => {
      if (active) deactivateKeepAwake(tag).catch(() => {});
    };
  }, [tag]);
}

type Sentinel = { release: () => Promise<void>; addEventListener?: (type: 'release', fn: () => void) => void };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

function iosVersion(): number | null {
  const ua = navigator.userAgent;
  const iPadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (!/iPhone|iPad|iPod/.test(ua) && !iPadAsMac) return null;
  const m = ua.match(/OS (\d+)_(\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 10 : 0;
}

function stayAwakeOnWeb() {
  const nav = navigator as WakeLockNavigator;
  const ios = iosVersion();
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  // En iPhone el permiso nativo no basta en la app de inicio antes de 18.4: se usa el video.
  let useVideo = ios != null && (!nav.wakeLock || (standalone && ios < 18.4));
  let sentinel: Sentinel | null = null;
  let video: HTMLVideoElement | null = null;
  let stopped = false;

  const requestLock = () => {
    if (!nav.wakeLock || document.visibilityState !== 'visible') return;
    nav.wakeLock
      .request('screen')
      .then((s) => {
        if (stopped) {
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
        // El sistema lo suelta al apagar la pantalla o cambiar de app: se vuelve a pedir al volver.
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = null;
        });
      })
      .catch(() => {
        // Sin permiso nativo, en iPhone queda el video.
        if (ios != null) useVideo = true;
      });
  };

  const playVideo = () => {
    if (!useVideo || stopped || document.visibilityState !== 'visible') return;
    if (!video) {
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('title', 'Pantalla encendida');
      video.src = SILENT_MP4;
      // Sin «loop»: Safari no mantiene la pantalla con videos en bucle; se vuelve atrás a mano.
      video.addEventListener('timeupdate', () => {
        if (video && video.currentTime > 0.5) video.currentTime = Math.random();
      });
    }
    video.play().catch(() => {}); // si falla, se reintenta con el próximo toque
  };

  // Safari solo deja reproducir con un toque de la persona: se intenta en cada toque.
  const onTouch = () => {
    if (!sentinel) requestLock();
    if (useVideo && video?.paused !== false) playVideo();
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    requestLock();
    playVideo();
  };

  requestLock();
  playVideo();
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('touchend', onTouch, true);
  document.addEventListener('click', onTouch, true);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('touchend', onTouch, true);
    document.removeEventListener('click', onTouch, true);
    sentinel?.release().catch(() => {});
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };
}
