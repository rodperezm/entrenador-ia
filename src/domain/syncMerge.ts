// Qué versión se queda al traer el respaldo: la del teléfono o la de la nube.
// Perfil, semana y rutina son un solo documento cada uno; gana el más reciente y nunca se
// reemplaza lo del teléfono por algo más antiguo.

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
};

// Mismo contenido aunque las claves vengan en otro orden (la base de datos las reordena).
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export type DocChoice = {
  use: 'cloud' | 'local';
  /** El teléfono tiene algo más nuevo que la nube: hay que volver a subirlo. */
  resend: boolean;
};

export function chooseDoc<T>(input: {
  local: T | null;
  cloud: T | null;
  localAt?: string | null;
  cloudAt?: string | null;
  /** Al entrar a una cuenta que ya existe, manda la cuenta (así se le avisa a la persona). */
  preferCloud?: boolean;
}): DocChoice {
  const { local, cloud } = input;
  if (cloud == null) return { use: 'local', resend: local != null };
  if (local == null) return { use: 'cloud', resend: false };
  if (canonical(local) === canonical(cloud)) return { use: 'local', resend: false };
  if (input.preferCloud) return { use: 'cloud', resend: false };

  const localAt = time(input.localAt);
  const cloudAt = time(input.cloudAt);
  // Sin fecha en el teléfono no se puede saber: se confía en la nube, como se hacía antes.
  if (localAt == null) return { use: 'cloud', resend: false };
  if (cloudAt == null) return { use: 'local', resend: true };
  if (cloudAt > localAt) return { use: 'cloud', resend: false };
  // Misma fecha y distinto contenido: se queda lo del teléfono, sin pelear por la nube.
  return { use: 'local', resend: localAt > cloudAt };
}
