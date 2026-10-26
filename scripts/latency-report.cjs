function percentile(values, percent) {
  const valid = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  return valid.length ? Math.round(valid[Math.max(0, Math.ceil(valid.length * percent / 100) - 1)]) : null;
}
module.exports = { percentile };
