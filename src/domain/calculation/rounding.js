/**
 * Decimal-safe rounding helpers. Values are scaled to integers before rounding to avoid
 * binary floating-point surprises such as 1.005 → 1.00.
 */
export function roundTo(value, decimals = 2, mode = 'half-up') {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  // toPrecision guards against representation error (e.g. 4.7 * 100 = 469.99999999999994)
  const scaled = Number((value * factor).toPrecision(15));
  let r;
  switch (mode) {
    case 'truncate': r = Math.trunc(scaled); break;
    case 'floor': r = Math.floor(scaled); break;
    case 'ceil': r = Math.ceil(scaled); break;
    case 'half-even': {
      const fl = Math.floor(scaled);
      const diff = scaled - fl;
      if (diff > 0.5) r = fl + 1;
      else if (diff < 0.5) r = fl;
      else r = fl % 2 === 0 ? fl : fl + 1;
      break;
    }
    case 'half-up':
    default:
      r = Math.sign(scaled) * Math.round(Math.abs(scaled));
  }
  return r / factor;
}

/** Sum that keeps a fixed number of decimals at every step. */
export function preciseSum(values, decimals = 4) {
  return roundTo(values.reduce((a, b) => a + b, 0), decimals);
}
