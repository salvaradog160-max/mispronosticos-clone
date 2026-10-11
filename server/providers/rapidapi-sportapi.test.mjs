import test from 'node:test';
import assert from 'node:assert/strict';
import * as sportapi from './rapidapi-sportapi.mjs';

const aFraccional = sportapi.fraccionalADecimal;
const { cuotas1x2, sinMargen, TORNEOS, CATEGORIAS } = sportapi;

// Fraccional -> decimal. Este es el dato mas importante del provider:
// si esta conversion falla, toda la calibracion queda mal.
test('fraccion simple', () => {
  assert.equal(aFraccional('61/100'), 1.61);
  assert.equal(aFraccional('11/25'), 1.44);
  assert.equal(aFraccional('1/1'), 2);
  assert.equal(aFraccional('100/100'), 2);
});

test('decimal exactamente 1.00 no es una cuota valida', () => {
  // "0/5" son 0 unidades netas -> 1.00 decimal. Un precio de 1.00
  // significa "no hay cuota", no "apuesta garantizada", asi que el
  // provider lo descarta en vez de devolver un numero que romperia
  // el calculo de sin margen (1/1.00 = 100% de probabilidad).
  assert.equal(aFraccional('0/5'), null);
  assert.equal(aFraccional('0/1'), null);
});

test('fraccion con decimales', () => {
  assert.equal(aFraccional('13/25'), 1.52);
  assert.equal(aFraccional('31/50'), 1.62);
});

test('valores invalidos devuelven null, nunca un numero inventado', () => {
  assert.equal(aFraccional(null), null);
  assert.equal(aFraccional(undefined), null);
  assert.equal(aFraccional(''), null);
  assert.equal(aFraccional('abc'), null);
  assert.equal(aFraccional('10'), null);        // no hay denominador
  assert.equal(aFraccional('10/0'), null);      // division por cero
  assert.equal(aFraccional('x/y'), null);
  assert.equal(aFraccional('5/-10'), null);      // decimal < 1
});

test('1X2 devuelve apertura y cierre en decimal', () => {
  // Fragmento real del endpoint (Chelsea vs Bournemouth, evento 16363873)
  const payload = {
    markets: [{
      marketGroup: '1X2',
      marketPeriod: 'Full-time',
      choices: [
        { name: '1', initialFractionalValue: '3/4', fractionalValue: '4/5' },
        { name: 'X', initialFractionalValue: '3/1', fractionalValue: '29/10' },
        { name: '2', initialFractionalValue: '31/10', fractionalValue: '16/5' },
      ],
    }],
  };
  const r = cuotas1x2(payload);
  assert.deepEqual(r.apertura, { 1: 1.75, X: 4, 2: 4.1 });
  assert.deepEqual(r.cierre, { 1: 1.8, X: 3.9, 2: 4.2 });
});

test('1X2 ignora mercados que no son de partido completo', () => {
  const payload = {
    markets: [
      { marketGroup: '1X2', marketPeriod: '1st half', choices: [{ name: '1', initialFractionalValue: '6/5', fractionalValue: '13/10' }] },
      {
        marketGroup: '1X2', marketPeriod: 'Full-time',
        choices: [
          { name: '1', initialFractionalValue: '1/1', fractionalValue: '1/1' },
          { name: 'X', initialFractionalValue: '2/1', fractionalValue: '2/1' },
          { name: '2', initialFractionalValue: '2/1', fractionalValue: '2/1' },
        ],
      },
    ],
  };
  const r = cuotas1x2(payload);
  assert.deepEqual(r.apertura, { 1: 2, X: 3, 2: 3 });
});

test('1X2 incompleto devuelve null', () => {
  assert.equal(cuotas1x2({ markets: [] }), null);
  assert.equal(cuotas1x2(null), null);
  assert.equal(cuotas1x2({}), null);
  // Solo dos de tres lados
  assert.equal(cuotas1x2({
    markets: [{
      marketGroup: '1X2', marketPeriod: 'Full-time',
      choices: [
        { name: '1', initialFractionalValue: '1/1', fractionalValue: '1/1' },
        { name: 'X', initialFractionalValue: '2/1', fractionalValue: '2/1' },
      ],
    }],
  }), null);
});

test('apertura incompleta invalida el registro', () => {
  assert.equal(cuotas1x2({
    markets: [{
      marketGroup: '1X2', marketPeriod: 'Full-time',
      choices: [
        { name: '1', initialFractionalValue: null, fractionalValue: '4/5' },
        { name: 'X', initialFractionalValue: '3/1', fractionalValue: '29/10' },
        { name: '2', initialFractionalValue: '31/10', fractionalValue: '16/5' },
      ],
    }],
  }), null);
});

test('sin margen: las probabilidades suman 1', () => {
  const p = sinMargen({ 1: 1.8, X: 3.9, 2: 4.2 });
  const suma = Object.values(p).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(suma - 1) < 0.002, `suma ${suma}`);
  // El favorito debe tener la probabilidad mas alta
  assert.ok(p['1'] > p['X'] && p['1'] > p['2']);
});

test('sin margen con cuota muy corta: sigue dando ~91%, no ~99%', () => {
  // Con cuota 1.01 y alternativas a 20, el margen del libro es enorme:
  // 1/1.01 = 0.990, 1/20 = 0.050 cada una, suma 1.090.
  // La probabilidad real del favorito es 0.990/1.090 = 0.908.
  // Un 0.99 aqui seria el error tipico de olvidar quitar el margen.
  const p = sinMargen({ 1: 1.01, X: 20, 2: 20 });
  assert.ok(p['1'] > 0.90 && p['1'] < 0.92, `esperaba ~0.908, dio ${p['1']}`);
});

test('los ids de torneo y categoria cubren todas las ligas del proyecto', () => {
  const ligas = ['E1', 'SP1', 'I1', 'D1', 'F1', 'N1', 'P1', 'B1', 'T1', 'G1', 'SC0',
    'mex.1', 'arg.1', 'col.1', 'chi.1'];
  for (const l of ligas) {
    assert.ok(TORNEOS[l], `falta TORNEOS[${l}]`);
    assert.ok(CATEGORIAS[l], `falta CATEGORIAS[${l}]`);
  }
});