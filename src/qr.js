import { qrcode } from '../vendor/qrcode.mjs';

/**
 * Encode one ASCII tailcat address as a QR matrix. The generator has no
 * auto-version mode, so try versions from smallest to largest and keep the
 * first that fits. Error-correction level M is the usual screen-scanning
 * compromise for a short URL-like string.
 * @param {string} text - address or other short text.
 * @param {{ maxVersion?: number, errorCorrection?: 'L' | 'M' | 'Q' | 'H' }} [options] - limits.
 * @returns {{ version: number, size: number, rows: string[] }} matrix without a quiet zone.
 */
export function qrMatrix(text, options = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('qrMatrix: text must be a non-empty string');
  const maxVersion = Math.min(Math.max(options.maxVersion ?? 20, 1), 40);
  const errorCorrection = options.errorCorrection ?? 'M';
  let lastError;
  for (let version = 1; version <= maxVersion; version += 1) {
    try {
      const qr = qrcode(version, errorCorrection);
      qr.addData(text);
      qr.make();
      const size = qr.getModuleCount();
      const rows = [];
      for (let row = 0; row < size; row += 1) {
        let bits = '';
        for (let column = 0; column < size; column += 1) bits += qr.isDark(row, column) ? '1' : '0';
        rows.push(bits);
      }
      return { version, size, rows };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`qrMatrix: text does not fit QR version ${maxVersion} at level ${errorCorrection}: ${String(lastError)}`);
}

/**
 * Render a matrix as one SVG path command string, including a two-module
 * quiet zone. One path keeps large matrices cheap to mount in React.
 * @param {{ size: number, rows: string[] }} matrix - matrix from {@link qrMatrix}.
 * @param {number} [quietZone] - modules of white border.
 * @returns {{ viewBox: string, path: string }} SVG geometry.
 */
export function qrSvgGeometry(matrix, quietZone = 2) {
  const total = matrix.size + quietZone * 2;
  let path = '';
  for (let row = 0; row < matrix.rows.length; row += 1) {
    const bits = matrix.rows[row];
    let column = 0;
    while (column < bits.length) {
      if (bits[column] !== '1') {
        column += 1;
        continue;
      }
      const start = column;
      while (column < bits.length && bits[column] === '1') column += 1;
      path += `M${start + quietZone} ${row + quietZone}h${column - start}v1h-${column - start}z`;
    }
  }
  return { viewBox: `0 0 ${total} ${total}`, path };
}
