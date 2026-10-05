(() => {
  'use strict';
  const STATES = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
  const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
  const stripMarks = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
  function normalizeOcrText(value) {
    return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, ' ')
      .replace(/[|¦]/gu, 'I').replace(/[“”]/gu, '"').replace(/[‘’]/gu, "'")
      .replace(/[ \t]+/gu, ' ').replace(/\s*\n\s*/gu, '\n').trim();
  }
  function normalizePhone(value) {
    const digits = String(value ?? '').replace(/\D/gu, '').replace(/^55(?=\d{10,11}$)/u, '');
    if (/^0800\d{7}$/u.test(digits)) return { value: digits, valid: true };
    if (!/^\d{10,11}$/u.test(digits)) return { value: '', valid: false, warning: 'Telefone incompleto ou ambíguo.' };
    const ddd = Number(digits.slice(0, 2));
    if (!DDDS.has(String(ddd)) || (digits.length === 11 && digits[2] !== '9'))
      return { value: '', valid: false, warning: 'Telefone fora do padrão brasileiro.' };
    return { value: digits, valid: true };
  }
  function normalizePostalCode(value) {
    const digits = String(value ?? '').replace(/\D/gu, '');
    return /^\d{8}$/u.test(digits) ? { value: `${digits.slice(0, 5)}-${digits.slice(5)}`, valid: true } : { value: '', valid: false, warning: 'CEP incompleto ou ambíguo.' };
  }
  function normalizeState(value) {
    const state = stripMarks(value).toUpperCase().replace(/[^A-Z]/gu, '').slice(0, 2);
    return STATES.has(state) ? { value: state, valid: true } : { value: '', valid: false, warning: 'UF não reconhecida.' };
  }
  function parseBrl(value) {
    let raw = String(value ?? '').replace(/[^\d,.-]/gu, '');
    if (!raw || /-/u.test(raw)) return { value: '', valid: false, warning: 'Valor ausente ou ambíguo.' };
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./gu, '').replace(',', '.');
    else if ((raw.match(/[.,]/gu) || []).length > 1) return { value: '', valid: false, warning: 'Separadores de moeda ambíguos.' };
    else raw = raw.replace(',', '.');
    if (!/^\d{1,7}(?:\.\d{1,2})?$/u.test(raw)) return { value: '', valid: false, warning: 'Valor fora do limite ou formato esperado.' };
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999999) return { value: '', valid: false, warning: 'Valor fora do limite.' };
    return { value: amount.toFixed(2), valid: true };
  }
  function normalizeStreet(value) {
    return normalizeOcrText(value).replace(/\bR\s*\.?\s+/giu, 'Rua ').replace(/\bAv\s*\.?\s+/giu, 'Avenida ')
      .replace(/\bTrav\s*\.?\s+/giu, 'Travessa ').replace(/\bAl\s*\.?\s+/giu, 'Alameda ')
      .replace(/\bRod\s*\.?\s+/giu, 'Rodovia ').trim();
  }
  function normalizeAddressNumber(value) {
    const matches = [...String(value ?? '').matchAll(/(?:^|[,\s])(?:n[º°.]?\s*)?(\d{1,5}[A-Za-z]?)(?=$|[,\s])/gu)].map(match => match[1]);
    const unique = [...new Set(matches)];
    return unique.length === 1 ? { value: unique[0].toUpperCase(), valid: true } : { value: '', valid: false, warning: unique.length ? 'Mais de um número possível.' : 'Número ausente.' };
  }
  const api = Object.freeze({ STATES: [...STATES], stripMarks, normalizeOcrText, normalizePhone, normalizePostalCode, normalizeState, parseBrl, normalizeStreet, normalizeAddressNumber });
  globalThis.RotaMotoOcrNormalization = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
