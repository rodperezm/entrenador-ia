// Qué pantalla corresponde según lo que responde la base (migración 0010) y si este teléfono tiene cuenta.
export type AccountStatus = { required: boolean; has_email: boolean; approved: boolean };

export function decideAccess(status: AccountStatus | null, hasAccount: boolean): 'open' | 'needs_account' | 'waiting' {
  if (!status || !status.required || status.approved) return 'open';
  return hasAccount && status.has_email ? 'waiting' : 'needs_account';
}
