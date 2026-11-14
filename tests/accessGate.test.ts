import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideAccess } from '@/features/account/accessRules';

test('con la aprobación apagada, o sin respuesta del servidor, la app abre', () => {
  assert.equal(decideAccess(null, false), 'open');
  assert.equal(decideAccess({ required: false, has_email: false, approved: true }, false), 'open');
});

test('sin cuenta con correo se pide crearla', () => {
  assert.equal(decideAccess({ required: true, has_email: false, approved: false }, false), 'needs_account');
});

test('con la sesión perdida se pide volver a entrar, no se muestra la espera', () => {
  assert.equal(decideAccess({ required: true, has_email: false, approved: false }, true), 'needs_account');
});

test('con cuenta sin aprobar se espera; aprobada, entra', () => {
  assert.equal(decideAccess({ required: true, has_email: true, approved: false }, true), 'waiting');
  assert.equal(decideAccess({ required: true, has_email: true, approved: true }, true), 'open');
});
