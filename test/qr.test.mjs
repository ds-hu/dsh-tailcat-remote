import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvgGeometry } from '../src/qr.js';

const ADDRESS = `tc${'A1b2C3d4E5f6G7h8'.repeat(9)}`;

test('qrMatrix encodes a tailcat-sized address and is deterministic', () => {
  const first = qrMatrix(ADDRESS);
  const second = qrMatrix(ADDRESS);

  assert.equal(first.version >= 1 && first.version <= 20, true);
  assert.equal(first.size, first.rows.length);
  assert.equal(first.rows.every((row) => row.length === first.size), true);
  assert.deepEqual(first.rows, second.rows);
});

test('qrMatrix keeps the three finder patterns in the expected corners', () => {
  const matrix = qrMatrix('tcABC');
  const { rows, size } = matrix;

  for (const [row, column] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    assert.equal(rows[row].slice(column, column + 7), '1111111');
    assert.equal(rows[row + 1].slice(column, column + 7), '1000001');
    assert.equal(rows[row + 2].slice(column, column + 7), '1011101');
    assert.equal(rows[row + 5].slice(column, column + 7), '1000001');
    assert.equal(rows[row + 6].slice(column, column + 7), '1111111');
  }
});

test('qrMatrix works at the smallest version and rejects impossible input', () => {
  const small = qrMatrix('tcABC', { maxVersion: 1 });
  assert.equal(small.version, 1);
  assert.equal(small.size, 21);

  assert.throws(() => qrMatrix(''), /non-empty string/);
  assert.throws(() => qrMatrix('x'.repeat(5_000), { maxVersion: 20 }), /does not fit/);
  assert.throws(() => qrMatrix('x'.repeat(200), { maxVersion: 1 }), /does not fit/);
});

test('qrSvgGeometry wraps the matrix in a quiet zone and emits one path', () => {
  const matrix = qrMatrix('tcABC');
  const geometry = qrSvgGeometry(matrix);

  assert.equal(geometry.viewBox, `0 0 ${matrix.size + 4} ${matrix.size + 4}`);
  assert.match(geometry.path, /^M/);
  assert.match(geometry.path, /h\d+v1h-\d+z$/);
  assert.equal(geometry.path.includes('undefined'), false);
});

test('qrSvgGeometry supports a custom quiet zone', () => {
  const matrix = qrMatrix('tcABC');
  const geometry = qrSvgGeometry(matrix, 4);
  assert.equal(geometry.viewBox, `0 0 ${matrix.size + 8} ${matrix.size + 8}`);
});
