import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settle, usageRecord } from '../supabase/functions/generate-plan/usage';

// Así llega el uso en una respuesta de Claude (los campos de caché pueden venir en null).
const reply = {
  model: 'claude-sonnet-5-5',
  usage: {
    input_tokens: 24_310,
    output_tokens: 6_042,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: null,
    service_tier: 'standard',
  },
};

test('el registro guarda el modelo y los tokens de la respuesta', () => {
  assert.deepEqual(usageRecord(reply, false), {
    model: 'claude-sonnet-5-5',
    input_tokens: 24_310,
    output_tokens: 6_042,
    cache_read_tokens: 0,
    cache_write_tokens: null,
    failed: false,
  });
});

test('una respuesta que no sirvió queda marcada como fallida, con su gasto', () => {
  const r = usageRecord({ model: 'claude-sonnet-5-5', usage: { input_tokens: 24_310, output_tokens: 16_000 } }, true);
  assert.equal(r.failed, true);
  assert.equal(r.output_tokens, 16_000);
});

test('sin uso o con valores raros se guarda vacío, sin fallar', () => {
  assert.deepEqual(usageRecord({ model: '', usage: null }, true), {
    model: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    failed: true,
  });
  const odd = usageRecord({ model: 'x', usage: { input_tokens: -3, output_tokens: Number.NaN } }, false);
  assert.equal(odd.input_tokens, null);
  assert.equal(odd.output_tokens, null);
});

test('con plan cuenta; si Claude respondió sin servir se registra; si no respondió se devuelve', () => {
  assert.equal(settle({ hasPlan: true, claude: reply }), 'success');
  assert.equal(settle({ hasPlan: false, claude: reply }), 'failed');
  assert.equal(settle({ hasPlan: false, claude: null }), 'release');
});
