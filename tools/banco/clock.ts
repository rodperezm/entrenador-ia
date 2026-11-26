// Reloj simulado: el banco vive semanas en minutos. Mucha lógica de la app usa la fecha de hoy
// (ciclo, descarga, dolor reciente), así que se reemplaza Date por uno que marca la hora simulada.
// Debe importarse antes que cualquier código de la app.

const RealDate = Date;
let simNow = RealDate.now();

class SimDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(simNow);
    else super(...(args as [string]));
  }
  static now() {
    return simNow;
  }
}

globalThis.Date = SimDate as DateConstructor;

export const setNow = (ms: number) => {
  simNow = ms;
};
export const getNow = () => simNow;
export const realNow = () => RealDate.now();
