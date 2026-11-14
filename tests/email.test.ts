import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanEmail, isEmail } from '@/features/account/email';

test('se quitan los espacios de cualquier parte del correo', () => {
  assert.equal(cleanEmail(' Nombre.Apellido@gmail. com '), 'nombre.apellido@gmail.com');
  assert.equal(cleanEmail('nombre @ correo.cl'), 'nombre@correo.cl');
  assert.ok(isEmail(cleanEmail('nombre@gmail. com')));
});

test('los correos mal escritos no pasan', () => {
  for (const bad of ['nombre', 'nombre@', 'nombre@gmail', 'nombre@gmail.', 'nombre@gmail.c', '@gmail.com', 'a@@b.com'])
    assert.equal(isEmail(cleanEmail(bad)), false, bad);
});

test('los correos normales pasan', () => {
  for (const ok of ['a@b.co', 'nombre.apellido+kettai@empresa.com.ar', 'x_y@dominio.cl']) assert.ok(isEmail(ok), ok);
});
