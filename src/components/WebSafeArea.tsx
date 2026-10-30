import { type ReactNode, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

// Instalada en iPhone, la versión web no recibe el margen de abajo de la librería.
// Se mide aquí para que cada barra se extienda hasta el borde con su propio color.
// El margen de arriba lo aplica #root en public/index.html.
export function WebSafeArea({ children }: { children: ReactNode }) {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const probe = document.createElement('div');
    probe.id = 'safe-area-probe';
    probe.style.cssText = 'position:fixed;width:0;height:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const measure = () => setBottom(parseFloat(getComputedStyle(probe).paddingBottom) || 0);
    measure();
    // Safari puede tardar un momento en entregar el valor al abrir la app.
    const retry = setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(retry);
      window.removeEventListener('resize', measure);
      probe.remove();
    };
  }, []);

  if (Platform.OS !== 'web') return children;
  return (
    <SafeAreaInsetsContext.Provider value={{ top: 0, right: 0, left: 0, bottom }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
}
