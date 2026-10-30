import { supabase } from './supabase';

// Lectura y escritura del respaldo en la tabla user_items. La seguridad la da
// Supabase: cada cuenta solo puede leer y escribir sus propias filas.

// Oculto hasta configurar el correo que envía los códigos (SMTP en Supabase).
export const CLOUD_BACKUP_READY = false;

export type ItemKind = 'profile' | 'week' | 'plan' | 'session' | 'tape' | 'fold';
export type CloudItem = { kind: ItemKind; item_id: string; data: unknown; deleted: boolean };

const CHUNK = 200;
const PAGE = 1000;

export const itemKey = (i: Pick<CloudItem, 'kind' | 'item_id'>) => `${i.kind}:${i.item_id}`;

export async function pullItems() {
  const items: CloudItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('user_items')
      .select('kind,item_id,data,deleted')
      .order('kind')
      .order('item_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    items.push(...(data as CloudItem[]));
    if (data.length < PAGE) return items;
  }
}

export async function pushItems(items: CloudItem[]) {
  const updated_at = new Date().toISOString();
  for (let i = 0; i < items.length; i += CHUNK) {
    const rows = items.slice(i, i + CHUNK).map((item) => ({ ...item, updated_at }));
    const { error } = await supabase.from('user_items').upsert(rows, { onConflict: 'user_id,kind,item_id' });
    if (error) throw error;
  }
}

// Borra la cuenta y sus datos en la nube; lo guardado en el teléfono no se toca.
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

// El respaldo nuevo convierte la sesión anónima en cuenta: conserva el mismo usuario.
export async function requestBackupCode(email: string) {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}

export async function verifyBackupCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
  if (error) throw error;
}

// Recuperar: entra a una cuenta que ya existe, por ejemplo en un teléfono nuevo.
export async function requestLoginCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw error;
}

export async function verifyLoginCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}
