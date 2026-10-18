/** Tope de lecturas de mitades por hora: Flashscore no necesita mas, y asi no se acumula un patron que parezca automatico. */
export const VENTANA_MS = 60 * 60 * 1000;
export const MAX_LECTURAS = 2;

export type Permiso = { ok: true; historial: number[] } | { ok: false; historial: number[]; libreEn: number };

/** Cuenta las lecturas de la ultima hora; si hay cupo, registra esta. */
export const revisarLimite = (historial: number[], ahora: number, max = MAX_LECTURAS, ventana = VENTANA_MS): Permiso => {
  const vigentes = historial.filter(t => ahora - t < ventana);
  if (vigentes.length < max) return { ok: true, historial: [...vigentes, ahora] };
  return { ok: false, historial: vigentes, libreEn: Math.min(...vigentes) + ventana };
};

export const textoLimite = (libreEn: number, max = MAX_LECTURAS): string => {
  const hora = new Date(libreEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `Ya hiciste ${max} lecturas de mitades en la última hora. Para no cargar a Flashscore, la siguiente puede ser a las ${hora}. Lo que ya leíste sigue guardado.`;
};
