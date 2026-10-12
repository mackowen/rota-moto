(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RotaMotoGpsQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function accept(latitude, longitude, accuracy, timestamp, previousTimestamp = 0) {
    const lat = Number(latitude), lng = Number(longitude), capturedAt = Number(timestamp);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    if (!Number.isFinite(capturedAt) || capturedAt <= 0 || capturedAt < Number(previousTimestamp || 0)) return null;
    const meters = Number(accuracy);
    return { lat, lng, accuracy: Number.isFinite(meters) && meters > 0 ? meters : null, timestamp: capturedAt, at: new Date(capturedAt).toISOString() };
  }

  function accuracyText(accuracy) {
    const meters = Number(accuracy);
    if (!Number.isFinite(meters) || meters <= 0) return 'Precisão não informada';
    const quality = meters <= 20 ? 'boa' : meters <= 100 ? 'moderada' : 'baixa';
    return `Precisão ${quality}: margem informada de cerca de ${Math.max(1, Math.round(meters))} m`;
  }

  function ageText(timestamp, now = Date.now()) {
    const capturedAt = Number(timestamp);
    if (!Number.isFinite(capturedAt) || capturedAt <= 0) return 'Horário não informado';
    const seconds = Math.max(0, Math.floor((Number(now) - capturedAt) / 1000));
    if (seconds < 60) return 'leitura recente';
    if (seconds < 3600) return `leitura de ${Math.floor(seconds / 60)} min atrás`;
    return `leitura de ${Math.floor(seconds / 3600)} h atrás`;
  }

  return Object.freeze({ accept, accuracyText, ageText });
});
