// ═══════════════════════════════════════════════════════════════════════════════
// MONFINANCE — LOGIQUE MÉTIER PURE (partagée entre l'app et les tests unitaires)
// Ce fichier ne touche pas au DOM : il ne contient que des données et fonctions
// pures, pour pouvoir être testé avec Jest (Node) et utilisé tel quel par
// index.html dans le navigateur.
// ═══════════════════════════════════════════════════════════════════════════════

const CATS_DEP_GROUPED = {
  'Maison':  ['Maison'],
  'École':   ['École'],
  'Service': ['Service'],
  'Aide':    ['Aide'],
  'Facture': ['Facture'],
  'Loyer':   ['Loyer'],
  'Alimentation': ['Alimentation'],
  'Transport':    ['Transport'],
  'Entretien':    ['Entretien'],
  'Loisir':       ['Loisir'],
  'Resto':        ['Resto'],
};
const CATS_DEP_FLAT = Object.values(CATS_DEP_GROUPED).flat();

const TYPES_BANCAIRE = ['Salaire','Revenu annexe','Agios','Assurance','Épargne','Échéance prêt','Retrait app web','Retrait GAB','Virement','Frais'];
// Sens habituel de chaque type (le formulaire bascule automatiquement ; « Virement » reste au choix)
const BANK_TYPE_SENS = { 'Salaire':'credit', 'Revenu annexe':'credit', 'Agios':'debit', 'Assurance':'debit', 'Épargne':'debit',
  'Échéance prêt':'debit', 'Retrait app web':'debit', 'Retrait GAB':'debit', 'Frais':'debit' };
const AGENCES = ['CBAO Dakar','CBAO Kaolack','BIS Dakar','BIS Kaolack','Ecobank Dakar','Ecobank Kaolack','UBA Dakar','Wave','Orange Money','Autre'];

const GRP_COLORS = {
  'Maison':'#fb923c',
  'École':'#a78bfa',
  'Service':'#34d399',
  'Aide':'#f472b6',
  'Facture':'#facc15',
  'Loyer':'#22d3ee',
  'Alimentation':'#4ade80',
  'Transport':'#38bdf8',
  'Entretien':'#f97316',
  'Loisir':'#e879f9',
  'Resto':'#fbbf24',
};

function getCatColor(cat) {
  for (const [grp, cats] of Object.entries(CATS_DEP_GROUPED)) {
    if (cats.includes(cat)) return GRP_COLORS[grp];
  }
  return '#64748b';
}
function getGrpForCat(cat) {
  for (const [grp, cats] of Object.entries(CATS_DEP_GROUPED)) {
    if (cats.includes(cat)) return grp;
  }
  return 'Autre';
}

// ── Migration des anciennes catégories composées (ex: "Maison riz", "Aide mère Ndeye") ──
// vers les catégories propres/plates utilisées par les filtres et les couleurs,
// en réaffectant vers les nouvelles familles (Alimentation, Transport, Entretien, Loisir, Resto)
// quand c'est pertinent.
const CATEGORY_MIGRATION_RULES = [
  { cat:'Alimentation', kws:['aliment','riz','marché','marche','courses','nourriture','epicerie','épicerie','legume','légume','fruit','poisson','viande','boisson'] },
  { cat:'Transport',    kws:['transport','essence','carburant','taxi','moto','voiture','bus','gasoil','gas-oil','clando','car rapide'] },
  { cat:'Entretien',    kws:['entretien','réparation','reparation','plomberie','ménage','menage','nettoyage','bricolage'] },
  { cat:'Loisir',       kws:['loisir','sport','cinema','cinéma','sortie','vacances','fete','fête'] },
  { cat:'Resto',        kws:['resto','restaurant','café ','cafe ','fast food','fastfood'] },
  { cat:'École',        kws:['école','ecole','scolar','scolaire'] },
  { cat:'Service',      kws:['service','bonne','domestique','ménagère','menagere'] },
  { cat:'Aide',         kws:['aide','soutien'] },
  { cat:'Facture',      kws:['facture','woyofal','senelec','sde','électricité','electricite','internet','téléphone','telephone'] },
  { cat:'Loyer',        kws:['loyer'] },
  { cat:'Maison',       kws:['maison','logement'] },
];

function migrateCategorie(oldCat, label) {
  const raw = (oldCat || '').trim();
  // Déjà une catégorie propre → on ne touche à rien
  if (CATS_DEP_FLAT.includes(raw)) return raw;

  const text = (raw + ' ' + (label || '')).toLowerCase();
  for (const { cat, kws } of CATEGORY_MIGRATION_RULES) {
    if (kws.some(k => text.includes(k))) return cat;
  }
  // Dernier recours : le premier mot de l'ancienne catégorie correspond peut-être à un groupe existant
  const firstWord = raw.split(' ')[0];
  if (CATS_DEP_FLAT.includes(firstWord)) return firstWord;

  return 'Maison';
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS GÉNÉRIQUES
// ═══════════════════════════════════════════════════════════════════════════════
const fmt = n => new Intl.NumberFormat('fr-SN',{style:'currency',currency:'XOF',maximumFractionDigits:0}).format(n);
const fmtDate = d => new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
const uid = () => Date.now() + Math.random().toString(36).slice(2);

function isCurrentMonth(dateStr, now = new Date()) {
  const d = new Date(dateStr+'T00:00:00');
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// ── Période de 30 jours ancrée sur le dernier virement de salaire ────────────
function getSalaryPeriod(bancaire, now = new Date()) {
  const today = new Date(now); today.setHours(0,0,0,0);
  const salaryDates = (bancaire || [])
    .filter(x => x.type === 'Salaire' && x.sens === 'credit')
    .map(x => new Date(x.date+'T00:00:00'))
    .sort((a,b) => b-a);

  let start;
  if (salaryDates.length === 0) {
    // Pas de salaire enregistré → repli sur le mois calendaire en cours
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else {
    start = salaryDates.find(d => d <= today) || salaryDates[salaryDates.length-1];
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 29); // fenêtre de 30 jours (jour 0 à jour 29)
  // Aucun nouveau salaire enregistré après 30 jours : le cycle reste ouvert
  // jusqu'à aujourd'hui, pour que les saisies récentes restent visibles.
  if (end < today) end.setTime(today.getTime());
  return { start, end };
}
function isInSalaryPeriod(dateStr, bancaire, now = new Date()) {
  const { start, end } = getSalaryPeriod(bancaire, now);
  const d = new Date(dateStr+'T00:00:00');
  return d >= start && d <= end;
}
function fmtPeriodLabel(bancaire, now = new Date()) {
  const { start, end } = getSalaryPeriod(bancaire, now);
  const f = d => d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
  return `${f(start)} → ${f(end)}`;
}

// Période de 30 jours précédant le cycle courant (pour proposer de reconduire
// les opérations récurrentes du cycle passé).
function getPreviousSalaryPeriod(bancaire, now = new Date()) {
  const { start } = getSalaryPeriod(bancaire, now);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - 29);
  return { start: prevStart, end: prevEnd };
}
function isInPreviousSalaryPeriod(dateStr, bancaire, now = new Date()) {
  const { start, end } = getPreviousSalaryPeriod(bancaire, now);
  const d = new Date(dateStr+'T00:00:00');
  return d >= start && d <= end;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION DE STRUCTURE AVEC ZOD
// Navigateur : Zod est chargé en global via un <script> CDN (voir index.html) et
// expose `window.Zod`, qui a la même API que l'espace de nom `z` habituel.
// Node/Jest : chargé via le paquet npm `zod`.
// Si Zod n'est disponible ni d'un côté ni de l'autre (ex: CDN bloqué hors-ligne),
// on retombe sur une vérification plus permissive pour ne pas casser l'app.
// ═══════════════════════════════════════════════════════════════════════════════
const _z = (typeof module !== 'undefined' && module.exports)
  ? (() => { try { return require('zod').z; } catch (e) { return null; } })()
  : (typeof Zod !== 'undefined' ? Zod : null);

let DepenseSchema = null, BancaireSchema = null, RevenuSchema = null, AppDataSchema = null;
if (_z) {
  const idType = _z.union([_z.string(), _z.number()]);

  DepenseSchema = _z.object({
    id: idType,
    label: _z.string(),
    montant: _z.number(),
    date: _z.string(),
    categorie: _z.string(),
  }).passthrough();

  BancaireSchema = _z.object({
    id: idType,
    type: _z.string(),
    montant: _z.number(),
    date: _z.string(),
    sens: _z.enum(['credit', 'debit']),
    agence: _z.string(),
    note: _z.string().optional(),
  }).passthrough();

  RevenuSchema = _z.object({
    id: idType,
    label: _z.string(),
    montant: _z.number(),
    date: _z.string(),
    categorie: _z.string(),
  }).passthrough();

  AppDataSchema = _z.object({
    depenses: _z.array(DepenseSchema),
    bancaire: _z.array(BancaireSchema),
    revenus: _z.array(RevenuSchema).optional(),
  }).passthrough();
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE — LOGIQUE PURE (testable sans réseau ni DOM)
// ═══════════════════════════════════════════════════════════════════════════════

// Le token OAuth Google est valide s'il existe, qu'une expiration a été enregistrée,
// et que cette expiration n'est pas encore dépassée.
function isTokenValid(token, expiry, now = Date.now()) {
  return Boolean(token) && Boolean(expiry) && now < Number(expiry);
}

// Une sauvegarde Drive est considérée valide si elle respecte la structure
// attendue (validée avec Zod : types des champs, enum `sens`, etc.). Si Zod
// n'a pas pu être chargé, on retombe sur une simple vérification de forme.
function isValidDriveBackup(data) {
  if (!data || typeof data !== 'object') return false;
  if (AppDataSchema) return AppDataSchema.safeParse(data).success;
  return Array.isArray(data.bancaire);
}

// Détermine si la sauvegarde Drive est plus récente que la dernière sauvegarde
// locale, pour décider laquelle doit l'emporter lors du chargement.
function isDriveDataNewer(driveSavedAt, localLastSave) {
  const driveTime = driveSavedAt ? new Date(driveSavedAt) : new Date(0);
  const localTime = localLastSave ? new Date(localLastSave) : new Date(0);
  return driveTime > localTime;
}

// Extrait l'id du premier fichier trouvé dans une réponse de recherche Drive,
// ou null si aucun fichier ne correspond.
function pickDriveFileId(searchResult) {
  if (searchResult && Array.isArray(searchResult.files) && searchResult.files.length > 0) {
    return searchResult.files[0].id;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSE INTELLIGENTE — anomalies, tendances, pistes d'économies (cost cutting)
// Algorithmes statistiques exécutés 100 % en local : aucune donnée n'est envoyée.
//   • Z-score robuste (MAD) pour repérer les dépenses inhabituelles
//   • Moyenne mobile pondérée + tendance pour prévoir le prochain cycle
//   • Détection des charges récurrentes (faible coefficient de variation)
//   • Détection des micro-dépenses répétées (effet « petites dépenses »)
//   • Comparaison au cycle moyen des 3 cycles précédents (dérive par catégorie)
// ═══════════════════════════════════════════════════════════════════════════════
const DAY_MS = 86400000;
// Taux de réduction réalistes sur les postes discrétionnaires
const CUT_RATES = { Resto: 0.30, Loisir: 0.30, Entretien: 0.10, Transport: 0.10 };
// Charges peu compressibles à court terme (pas de suggestion « rythme »)
const FIXED_CATS = ['Loyer', 'École', 'Service', 'Aide'];
const MIN_SAVING = 2000;

function _mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function _median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function _std(a) {
  if (a.length < 2) return 0;
  const m = _mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

// « Brioche », « brioche 2 », « Salaire Mai 2026 » → clé de regroupement stable
function normalizeLabel(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|janv|fev|avr|juil|sept|oct|nov|dec)\b/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Blocs de 30 jours : [cycle courant, cycle -1, cycle -2, ...]
function getPeriodBlocks(bancaire, count = 4, now = new Date()) {
  const cur = getSalaryPeriod(bancaire, now);
  const blocks = [{ start: cur.start, end: cur.end, current: true }];
  let start = cur.start;
  for (let i = 1; i < count; i++) {
    const end = new Date(start); end.setDate(end.getDate() - 1);
    const s = new Date(end); s.setDate(s.getDate() - 29);
    blocks.push({ start: s, end, current: false });
    start = s;
  }
  return blocks;
}
function _inBlock(dateStr, b) {
  const d = new Date(dateStr + 'T00:00:00');
  return d >= b.start && d <= b.end;
}

// ── Rythme appris : combien l'on dépense d'habitude, par catégorie, AU MÊME STADE du cycle ──
// projected = dépensé à ce jour + ce qui reste habituellement à dépenser d'ici la fin du cycle
// (tient compte des charges payées en début de cycle, contrairement à une extrapolation linéaire).
// Sans historique : repli sur l'extrapolation linéaire du cycle en cours.
function _dayIndex(dateStr, b) { return Math.round((new Date(dateStr + 'T00:00:00') - b.start) / DAY_MS); }
function getCategoryPace(data, now = new Date(), opts = {}) {
  const bancaire = (data && data.bancaire) || [], depenses = (data && data.depenses) || [];
  const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
  const blocks = getPeriodBlocks(bancaire, 4, now);
  const cur = blocks[0];
  const totalDays = Math.round((cur.end - cur.start) / DAY_MS) + 1;
  const daysElapsed = Math.min(Math.max(Math.round((today0 - cur.start) / DAY_MS) + 1, 1), totalDays);
  const elapsedFrac = daysElapsed / totalDays;
  const prev = opts.cycleOnly ? [] : blocks.slice(1).filter(b => depenses.some(d => _inBlock(d.date, b)));
  const win = Math.min(daysElapsed, 30);

  const sum = (cat, b, days) => depenses
    .filter(d => getGrpForCat(d.categorie) === cat && _inBlock(d.date, b) && (days == null || _dayIndex(d.date, b) < days))
    .reduce((t, d) => t + d.montant, 0);

  const cats = new Set();
  depenses.forEach(d => { if (_inBlock(d.date, cur) || prev.some(b => _inBlock(d.date, b))) cats.add(getGrpForCat(d.categorie)); });
  const out = {};
  cats.forEach(cat => {
    const current = sum(cat, cur, null);
    if (prev.length) {
      const full = _mean(prev.map(b => sum(cat, b, null)));
      const toDate = _mean(prev.map(b => sum(cat, b, win)));
      out[cat] = { current, habitualToDate: toDate, habitualFull: full, projected: current + Math.max(0, full - toDate),
                   nCycles: prev.length, learned: true, daysElapsed, totalDays };
    } else {
      out[cat] = { current, habitualToDate: null, habitualFull: null,
                   projected: (elapsedFrac >= 0.2 && elapsedFrac < 1) ? current / elapsedFrac : current,
                   nCycles: 0, learned: false, daysElapsed, totalDays };
    }
  });
  return out;
}

// opts.cycleOnly : n'utilise AUCUNE donnée des cycles précédents (ni moyennes, ni médianes, ni récurrence)
function analyzeSpending(data, now = new Date(), opts = {}) {
  const cycleOnly = Boolean(opts.cycleOnly);
  const bancaire = (data && data.bancaire) || [];
  const depenses = (data && data.depenses) || [];
  const today0 = new Date(now); today0.setHours(0, 0, 0, 0);

  const blocks = getPeriodBlocks(bancaire, 7, now);
  const cur = blocks[0];
  const totalDays = Math.round((cur.end - cur.start) / DAY_MS) + 1;
  const daysElapsed = Math.min(Math.max(Math.round((today0 - cur.start) / DAY_MS) + 1, 1), totalDays);
  const elapsedFrac = daysElapsed / totalDays;

  const curItems = depenses.filter(d => _inBlock(d.date, cur));
  const curTotal = curItems.reduce((s, d) => s + d.montant, 0);
  const withData = b => depenses.some(d => _inBlock(d.date, b));
  const prevBlocks = cycleOnly ? [] : blocks.slice(1, 4).filter(withData);   // référence : 3 cycles précédents
  const histBlocks = cycleOnly ? [] : blocks.slice(1).filter(withData);      // apprentissage : jusqu'à 6 cycles
  const prevTotals = prevBlocks.map(b => depenses.filter(d => _inBlock(d.date, b)).reduce((s, d) => s + d.montant, 0));

  const result = {
    enough: depenses.length >= 3,
    period: { start: cur.start, end: cur.end, daysElapsed, totalDays },
    totals: { current: curTotal, baseline: prevTotals.length ? _mean(prevTotals) : null },
    categories: [], cycles: [], insights: [], potentialSaving: 0,
    forecast: { nextCycle: null, trend: 'flat', projectedCurrent: null },
    income: 0, incomeAnnexe: 0, spendRatio: null, cash: null, debt: null,
  };
  if (!result.enough) return result;

  // ── Par catégorie : total du cycle vs moyenne des cycles précédents ────────
  const catCur = {}, catItems = {};
  curItems.forEach(d => {
    const g = getGrpForCat(d.categorie);
    catCur[g] = (catCur[g] || 0) + d.montant;
    (catItems[g] = catItems[g] || []).push(d);
  });
  const catBase = {};
  const cats = new Set(Object.keys(catCur));
  depenses.forEach(d => { if (prevBlocks.some(b => _inBlock(d.date, b))) cats.add(getGrpForCat(d.categorie)); });  // vide si cycleOnly
  cats.forEach(g => {
    if (!prevBlocks.length) { catBase[g] = null; return; }
    const perBlock = prevBlocks.map(b =>
      depenses.filter(d => _inBlock(d.date, b) && getGrpForCat(d.categorie) === g).reduce((s, d) => s + d.montant, 0));
    catBase[g] = _mean(perBlock);
  });
  const pace = getCategoryPace(data, now, { cycleOnly });
  result.categories = [...cats].map(g => {
    const total = catCur[g] || 0, base = catBase[g], pc = pace[g];
    return { cat: g, current: total, baseline: base, count: (catItems[g] || []).length,
             habitualToDate: pc ? pc.habitualToDate : null, projected: pc ? pc.projected : total, learned: Boolean(pc && pc.learned),
             delta: base == null ? null : total - base,
             pct: base ? (total / base - 1) : null,
             discretionary: g in CUT_RATES };
  }).sort((a, b) => b.current - a.current);

  result.cycles = histBlocks.map(b => {
    const items = depenses.filter(d => _inBlock(d.date, b));
    const byCat = {};
    items.forEach(d => { const g = getGrpForCat(d.categorie); byCat[g] = (byCat[g] || 0) + d.montant; });
    const income = bancaire.filter(x => x.sens === 'credit' && !isTransfer(x) && _inBlock(x.date, b)).reduce((t, x) => t + x.montant, 0);
    return { start: b.start, end: b.end, total: items.reduce((t, d) => t + d.montant, 0), income, byCat };
  });

  // ── Pistes d'économies par catégorie (on garde la meilleure par catégorie) ─
  const counted = [];
  [...cats].forEach(g => {
    const total = catCur[g] || 0;
    if (total <= 0) return;
    const base = catBase[g];
    const cands = [];

    if (base && base > 0 && total > base * 1.15 && total - base >= MIN_SAVING) {
      const pct = total / base - 1, saving = total - base;
      cands.push({ kind: 'overspend', saving, severity: pct > 0.3 ? 'high' : 'medium', icon: '📈',
        title: `${g} au-dessus de votre moyenne`,
        detail: `${fmt(total)} ce cycle contre ${fmt(base)} en moyenne (+${Math.round(pct * 100)} %). Revenir à la moyenne économiserait ${fmt(saving)}.` });
    } else if (base && base > 0 && pace[g] && pace[g].learned && elapsedFrac < 1 && pace[g].projected > base * 1.25) {
      const pc = pace[g], saving = pc.projected - base;
      if (saving >= MIN_SAVING) cands.push({ kind: 'pace', saving, severity: 'medium', icon: '⏱️',
        title: `${g} : risque de dépassement`,
        detail: `D'ordinaire, à ce stade du cycle (jour ${daysElapsed}/${totalDays}), vous avez dépensé ≈ ${fmt(pc.habitualToDate)} en ${g} ; la projection de fin de cycle est ≈ ${fmt(pc.projected)} contre ${fmt(base)} en moyenne.` });
    }

    if (!FIXED_CATS.includes(g)) {
      const byLabel = {};
      (catItems[g] || []).forEach(d => {
        const k = normalizeLabel(d.label) || d.label;
        (byLabel[k] = byLabel[k] || { label: d.label, n: 0, sum: 0 });
        byLabel[k].n++; byLabel[k].sum += d.montant;
      });
      const micro = Object.values(byLabel)
        .filter(x => x.n >= 3 && x.sum >= 5000 && x.sum / x.n <= 15000)
        .sort((a, b) => b.sum - a.sum)[0];
      if (micro) {
        const saving = micro.sum * 0.3;
        if (saving >= MIN_SAVING) cands.push({ kind: 'micro', saving, severity: 'low', icon: '🔁',
          title: `Petites dépenses répétées : « ${micro.label} »`,
          detail: `${micro.n} achats = ${fmt(micro.sum)} ce cycle (moy. ${fmt(micro.sum / micro.n)}). En réduire 30 % économiserait ≈ ${fmt(saving)}.` });
      }
    }

    if (CUT_RATES[g]) {
      const saving = total * CUT_RATES[g];
      if (saving >= MIN_SAVING) cands.push({ kind: 'target', saving, severity: 'low', icon: '🎯',
        title: `Objectif d'économie : ${g}`,
        detail: `Poste discrétionnaire : ${fmt(total)} ce cycle. Viser −${Math.round(CUT_RATES[g] * 100)} % libérerait ${fmt(saving)}.` });
    }

    if (cands.length) {
      const best = cands.sort((a, b) => b.saving - a.saving)[0];
      counted.push({ id: best.kind + ':' + g, cat: g, counted: true, ...best });
    }
  });

  // ── Frais bancaires évitables (agios) ──────────────────────────────────────
  const agios = bancaire.filter(x => x.type === 'Agios' && x.sens === 'debit' && _inBlock(x.date, cur))
                        .reduce((s, x) => s + x.montant, 0);
  if (agios > 0) counted.push({ id: 'fees:agios', kind: 'fees', counted: true, saving: agios, severity: 'medium', icon: '🏦',
    title: 'Agios évitables',
    detail: `${fmt(agios)} d'agios ce cycle. Ils viennent généralement d'un découvert : garder le compte positif les supprime.` });

  // ── Anomalies : z-score robuste (MAD) sur l'historique de la catégorie ─────
  const anomalies = [];
  [...cats].forEach(g => {
    if (cycleOnly) return;                           // l'anomalie se mesure par rapport à l'historique de la catégorie
    const hist = depenses.filter(d => getGrpForCat(d.categorie) === g).map(d => d.montant);
    if (hist.length < 5) return;
    const med = _median(hist), mad = _median(hist.map(x => Math.abs(x - med)));
    (catItems[g] || []).forEach(d => {
      const x = d.montant;
      const flagged = mad > 0 ? (0.6745 * (x - med) / mad > 3.5 && x > med * 1.5) : (x >= med * 1.8 && _std(hist) > 0);
      if (flagged) anomalies.push({ id: 'anomaly:' + d.id, kind: 'anomaly', counted: false, saving: x - med, severity: 'medium', icon: '⚠️',
        title: `Dépense inhabituelle : ${d.label}`,
        detail: `${fmt(x)} en ${g} le ${fmtDate(d.date)} — habituellement ≈ ${fmt(med)}. À vérifier (erreur de saisie ou achat exceptionnel ?).` });
    });
  });
  anomalies.sort((a, b) => b.saving - a.saving);

  // ── Charges récurrentes (même libellé sur ≥ 2 mois, montant stable) ────────
  const groups = {};
  depenses.forEach(d => {
    const k = normalizeLabel(d.label); if (!k) return;
    (groups[k] = groups[k] || { label: d.label, months: new Set(), amts: [] });
    groups[k].months.add(d.date.slice(0, 7)); groups[k].amts.push(d.montant);
  });
  const recurring = cycleOnly ? [] : Object.values(groups)
    .filter(g => g.months.size >= 2 && _mean(g.amts) > 0 && _std(g.amts) / _mean(g.amts) <= 0.15)
    .map(g => ({ label: g.label, avg: _mean(g.amts) }))
    .sort((a, b) => b.avg - a.avg);

  // ── Ratio dépenses / revenus du cycle ──────────────────────────────────────
  // Les transferts entre ses propres comptes ne sont pas des revenus
  const incomeOps = bancaire.filter(x => x.sens === 'credit' && !isTransfer(x) && _inBlock(x.date, cur));
  const income = incomeOps.reduce((s, x) => s + x.montant, 0);
  result.income = income;
  result.incomeAnnexe = incomeOps.filter(x => x.type === 'Revenu annexe').reduce((s, x) => s + x.montant, 0);
  result.cash = getCashSummary(data, now);
  result.debt = (data.prets && data.prets.length) ? getDebtSummary(data, now) : null;
  const budgetCards = [];
  if (income > 0) {
    result.spendRatio = curTotal / income;
    if (result.spendRatio > 0.8) budgetCards.push({ id: 'budget:ratio', kind: 'budget', counted: false,
      saving: curTotal - 0.7 * income, severity: 'high', icon: '🚨',
      title: 'Dépenses élevées par rapport au revenu',
      detail: `Les dépenses représentent ${Math.round(result.spendRatio * 100)} % des revenus du cycle (${fmt(curTotal)} / ${fmt(income)}). Objectif sain : ≤ 70 %.` });
  }

  const infoCards = [];
  if (recurring.length) {
    const top = recurring.slice(0, 3).map(r => `${r.label} (${fmt(r.avg)})`).join(', ');
    infoCards.push({ id: 'recurring', kind: 'recurring', counted: false, saving: 0, severity: 'low', icon: '📌',
      title: `${recurring.length} charge${recurring.length > 1 ? 's' : ''} récurrente${recurring.length > 1 ? 's' : ''} détectée${recurring.length > 1 ? 's' : ''}`,
      detail: `≈ ${fmt(recurring.reduce((s, r) => s + r.avg, 0))} par cycle : ${top}. À renégocier ou résilier si non essentielles.` });
  }

  if (result.cash && result.cash.reste > 0 && result.cash.total > 0) {
    infoCards.push({ id: 'cash', kind: 'cash', counted: false, saving: 0, severity: 'medium', icon: '💵',
      title: 'Cash non ventilé',
      detail: `${fmt(result.cash.reste)} retirés en espèces ce cycle ne sont rattachés à aucune dépense (sur ${fmt(result.cash.total)} retirés). Ventilez-les depuis la Banque (✂️) pour savoir où part votre cash.` });
  }
  if (result.debt && result.debt.ratio != null && result.debt.ratio > 0.33) {
    budgetCards.push({ id: 'debt:ratio', kind: 'debt', counted: false, saving: 0, severity: 'high', icon: '🏦',
      title: 'Taux d\'endettement élevé',
      detail: `Les mensualités de crédit (${fmt(result.debt.mensualites)}) représentent ${Math.round(result.debt.ratio * 100)} % des revenus du cycle. Au-delà de 33 %, la marge de manœuvre devient fragile.` });
  }

  counted.sort((a, b) => b.saving - a.saving);
  result.insights = [
    ...budgetCards,            // alerte globale d'abord
    ...counted,                // puis les économies chiffrées, par gain décroissant
    ...anomalies.slice(0, 3),  // puis les anomalies à vérifier
    ...infoCards,              // enfin les informations (charges récurrentes)
  ];
  result.potentialSaving = counted.reduce((s, x) => s + x.saving, 0);

  // ── Prévision : moyenne pondérée des cycles complets + tendance ────────────
  if (prevTotals.length) {
    const w = [3, 2, 1].slice(0, prevTotals.length);
    result.forecast.nextCycle = prevTotals.slice(0, w.length).reduce((s, v, i) => s + v * w[i], 0) / w.reduce((s, x) => s + x, 0);
    if (prevTotals.length >= 2) {
      const ref = _mean(prevTotals.slice(1));
      const r = ref > 0 ? prevTotals[0] / ref : 1;
      result.forecast.trend = r > 1.1 ? 'up' : r < 0.9 ? 'down' : 'flat';
    }
  }
  if (elapsedFrac >= 0.3) result.forecast.projectedCurrent = curTotal / elapsedFrac;
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-CATÉGORISATION — apprend de l'historique, retombe sur des mots-clés
// ═══════════════════════════════════════════════════════════════════════════════
function _matchKeywords(text) {
  const t = String(text || '').toLowerCase();
  for (const { cat, kws } of CATEGORY_MIGRATION_RULES) if (kws.some(k => t.includes(k))) return cat;
  return null;
}
function _topCount(arr) {
  const c = {}; arr.forEach(x => { c[x] = (c[x] || 0) + 1; });
  const [top, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return { top, share: n / arr.length };
}

// → { cat, source: 'historique' | 'mots-clés', confidence } ou null
function suggestCategory(label, depenses) {
  const key = normalizeLabel(label);
  if (!key || key.length < 2) return null;
  const hist = (depenses || [])
    .map(d => ({ key: normalizeLabel(d.label), cat: getGrpForCat(d.categorie) }))
    .filter(h => h.key && h.cat !== 'Autre');

  // 1) même libellé déjà saisi → on reprend sa catégorie la plus fréquente
  const same = hist.filter(h => h.key === key);
  if (same.length) { const c = _topCount(same.map(h => h.cat)); return { cat: c.top, source: 'historique', confidence: c.share }; }

  // 2) mots du libellé : vote pondéré par la « pureté » du mot dans l'historique
  const score = {};
  key.split(' ').filter(t => t.length >= 3).forEach(t => {
    const m = hist.filter(h => h.key.split(' ').includes(t));
    if (m.length < 2) return;
    const c = _topCount(m.map(h => h.cat));
    if (c.share >= 0.7) score[c.top] = (score[c.top] || 0) + c.share * Math.min(m.length, 5);
  });
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best) return { cat: best[0], source: 'historique', confidence: Math.min(1, best[1] / 5) };

  // 3) mots-clés par défaut
  const kw = _matchKeywords(label);
  return kw ? { cat: kw, source: 'mots-clés', confidence: 0.5 } : null;
}

const BANK_TYPE_RULES = [
  { type: 'Agios',         kws: ['agios', 'agio', 'commission de compte', 'tenue de compte'] },
  { type: 'Assurance',     kws: ['assurance'] },
  { type: 'Échéance prêt', kws: ['échéance', 'echeance', 'mensualité', 'mensualite', 'crédit immo', 'credit immo', 'crédit auto', 'credit auto', 'prêt', 'pret '] },
  { type: 'Épargne',       kws: ['épargne', 'epargne'] },
  { type: 'Retrait GAB',   kws: ['gab', 'retrait', 'distributeur'] },
  { type: 'Salaire',       kws: ['salaire', 'paie ', 'virement employeur'] },
  { type: 'Revenu annexe', kws: ['loyer perçu', 'loyer percu', 'freelance', 'vente', 'prime', 'dividende', 'mission', 'bonus', 'revenu annexe'] },
  { type: 'Frais',         kws: ['frais'] },
];
// Propose le type d'opération bancaire d'après la note saisie
function suggestBankType(note) {
  const t = String(note || '').toLowerCase() + ' ';
  const r = BANK_TYPE_RULES.find(({ kws }) => kws.some(k => t.includes(k)));
  return r ? r.type : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFERTS ENTRE COMPTES & COMPTES (Wave, Orange Money, banques…)
// Un compte = la valeur du champ « agence » des opérations bancaires.
// Un transfert = 2 opérations liées par `transfertId` (ni revenu, ni dépense).
// ═══════════════════════════════════════════════════════════════════════════════
const WALLET_ACCOUNTS = ['Wave', 'Orange Money'];
function isTransfer(op) { return Boolean(op && op.transfertId); }

function computeAccountBalances(data) {
  const bancaire = (data && data.bancaire) || [];
  const comptes = (data && data.comptes) || {};
  const names = new Set([...WALLET_ACCOUNTS, ...Object.keys(comptes)]);
  bancaire.forEach(x => { if (x.agence) names.add(x.agence); });
  return [...names].map(nom => {
    const ops = bancaire.filter(x => x.agence === nom);
    const credits = ops.filter(x => x.sens === 'credit').reduce((s, x) => s + x.montant, 0);
    const debits = ops.filter(x => x.sens === 'debit').reduce((s, x) => s + x.montant, 0);
    const init = Number(comptes[nom] && comptes[nom].soldeInitial) || 0;
    return { nom, soldeInitial: init, credits, debits, solde: init + credits - debits, count: ops.length, wallet: WALLET_ACCOUNTS.includes(nom) };
  }).filter(a => a.wallet || a.count > 0 || a.soldeInitial !== 0)
    .sort((a, b) => {
      const ia = WALLET_ACCOUNTS.indexOf(a.nom), ib = WALLET_ACCOUNTS.indexOf(b.nom);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);   // Wave, Orange Money d'abord
      return a.nom.localeCompare(b.nom);
    });
}

// Construit les opérations d'un transfert : sortie, entrée, et frais éventuels (vraie dépense)
function buildTransferOps({ from, to, montant, frais = 0, date, note = '' }, newId) {
  const tid = 'tr-' + newId();
  const suffix = note ? ' — ' + note : '';
  const ops = [
    { id: newId(), type: 'Virement', sens: 'debit',  montant, date, agence: from, note: `Transfert vers ${to}${suffix}`, transfertId: tid },
    { id: newId(), type: 'Virement', sens: 'credit', montant, date, agence: to,   note: `Transfert depuis ${from}${suffix}`, transfertId: tid },
  ];
  if (frais > 0) ops.push({ id: newId(), type: 'Frais', sens: 'debit', montant: frais, date, agence: from, note: `Frais de transfert ${from} → ${to}` });
  return ops;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRAITS CASH À VENTILER — un retrait GAB se répartit en dépenses (retraitId)
// ═══════════════════════════════════════════════════════════════════════════════
const CASH_TYPES = ['Retrait GAB', 'Retrait app web'];
function isCashWithdrawal(op) { return Boolean(op) && op.sens === 'debit' && CASH_TYPES.includes(op.type); }

function getCashStatus(data, retraitId) {
  const op = ((data && data.bancaire) || []).find(x => String(x.id) === String(retraitId));
  if (!op) return null;
  const items = ((data && data.depenses) || []).filter(d => d.retraitId != null && String(d.retraitId) === String(retraitId));
  const ventile = items.reduce((s, d) => s + d.montant, 0);
  return { montant: op.montant, ventile, reste: op.montant - ventile, items, complet: ventile >= op.montant };
}
function getCashSummary(data, now = new Date()) {
  const bancaire = (data && data.bancaire) || [];
  const cur = getSalaryPeriod(bancaire, now);
  const retraits = bancaire.filter(x => isCashWithdrawal(x) && _inBlock(x.date, cur));
  let total = 0, ventile = 0, reste = 0;
  retraits.forEach(r => {
    const st = getCashStatus(data, r.id);
    total += r.montant; ventile += Math.min(r.montant, st.ventile); reste += Math.max(0, st.reste);
  });
  return { count: retraits.length, total, ventile, reste };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRÉDITS (immobilier, auto, bancaire) — échéancier d'amortissement à mensualité constante
// prêt = { id, kind, label, capital, taux (% annuel), dureeMois, premiereEcheance 'YYYY-MM-DD',
//          mensualite? (sinon calculée), assurance? (mensuelle, hors amortissement), agence?,
//          calage? { date, capitalRestant } (pour recaler sur le tableau d'amortissement réel) }
// ═══════════════════════════════════════════════════════════════════════════════
function monthlyPayment(capital, tauxAnnuelPct, n) {
  if (!(capital > 0) || !(n > 0)) return 0;
  const r = (Number(tauxAnnuelPct) || 0) / 1200;
  if (r === 0) return capital / n;
  return capital * r / (1 - Math.pow(1 + r, -n));
}
function _loanDate(startStr, k) {            // même jour du mois, ramené à la fin de mois si besoin
  const [y, m, d] = startStr.split('-').map(Number);
  const last = new Date(y, m - 1 + k + 1, 0).getDate();
  return new Date(y, m - 1 + k, Math.min(d, last));
}

function buildAmortization(loan) {
  const capital = Number(loan.capital) || 0;
  const r = (Number(loan.taux) || 0) / 1200;
  const duree = parseInt(loan.dureeMois, 10) || 0;
  if (!(capital > 0) || !(duree > 0) || !loan.premiereEcheance) return { rows: [], mensualite: 0, soldeDepart: capital, offset: 0 };

  let k = 0, balance = capital, offset = 0;
  if (loan.calage && Number(loan.calage.capitalRestant) > 0 && loan.calage.date) {
    const cal = new Date(loan.calage.date + 'T00:00:00');
    while (_loanDate(loan.premiereEcheance, k) <= cal && k < duree + 600) k++;   // 1re échéance après le calage
    offset = k;
    balance = Number(loan.calage.capitalRestant);
  }
  const restantMois = Math.max(1, duree - offset);
  const M = Number(loan.mensualite) > 0 ? Number(loan.mensualite) : monthlyPayment(balance, loan.taux, restantMois);
  const soldeDepart = balance;

  const rows = [];
  for (let i = 0; balance > 0.5 && i < 600; i++) {
    const interets = balance * r;
    if (M <= interets) break;                       // la mensualité ne couvre pas les intérêts : pas d'amortissement
    const principal = Math.min(balance, M - interets);
    balance -= principal;
    rows.push({ n: offset + i + 1, date: _loanDate(loan.premiereEcheance, offset + i),
                echeance: principal + interets, interets, capital: principal, restant: Math.max(0, balance) });
  }
  return { rows, mensualite: M, soldeDepart, offset };
}

function loanStatus(loan, now = new Date()) {
  const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
  const { rows, mensualite, soldeDepart } = buildAmortization(loan);
  const past = rows.filter(r => r.date < today0);
  const future = rows.filter(r => r.date >= today0);
  const restant = past.length ? past[past.length - 1].restant : soldeDepart;
  const capitalInit = Number(loan.capital) || 0;
  const assurance = Number(loan.assurance) || 0;
  return {
    mensualite, assurance, coutMensuel: mensualite + assurance,
    restant, pctRembourse: capitalInit > 0 ? Math.min(1, Math.max(0, 1 - restant / capitalInit)) : 0,
    next: future[0] || null, moisRestants: future.length,
    dateFin: rows.length ? rows[rows.length - 1].date : null,
    interetsRestants: future.reduce((s, r) => s + r.interets, 0),
    termine: rows.length > 0 && future.length === 0,
    rows,
  };
}

function getDebtSummary(data, now = new Date()) {
  const prets = (data && data.prets) || [];
  const bancaire = (data && data.bancaire) || [];
  const cur = getSalaryPeriod(bancaire, now);
  let mensualites = 0, restant = 0, actifs = 0;
  prets.forEach(l => {
    const st = loanStatus(l, now);
    if (!st.termine) { mensualites += st.coutMensuel; actifs++; }
    restant += st.restant;
  });
  let income = bancaire.filter(x => x.sens === 'credit' && !isTransfer(x) && _inBlock(x.date, cur)).reduce((s, x) => s + x.montant, 0);
  if (!(income > 0)) {                               // repli : dernier salaire connu
    const sal = bancaire.filter(x => x.type === 'Salaire' && x.sens === 'credit').sort((a, b) => b.date.localeCompare(a.date))[0];
    income = sal ? sal.montant : 0;
  }
  return { count: prets.length, actifs, mensualites, restant, income, ratio: income > 0 ? mensualites / income : null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGETS PAR CATÉGORIE — plafond (max), minimum (min) et seuil d'alerte
// data.budgets = { Alimentation: { min: 40000, max: 60000 }, ... }  (par cycle de salaire)
// data.budgetSettings = { alertPct: 80 }  → alerte « approche du plafond » à 80 % du max
// Statuts : over (plafond dépassé) > warn (seuil atteint) > pace (rythme trop rapide)
//           > under (minimum non atteint en fin de cycle) > ok
// ═══════════════════════════════════════════════════════════════════════════════
const BUDGET_RANK = { over: 0, warn: 1, pace: 2, under: 3, ok: 4 };

function evaluateBudgets(data, now = new Date(), opts = {}) {
  const budgets = (data && data.budgets) || {};
  const entries = Object.entries(budgets).filter(([, b]) => b && (Number(b.min) > 0 || Number(b.max) > 0));
  if (!entries.length) return [];

  const bancaire = data.bancaire || [], depenses = data.depenses || [];
  const alertPct = Math.min(100, Math.max(1, Number(data.budgetSettings && data.budgetSettings.alertPct) || 80));
  const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
  const cur = getSalaryPeriod(bancaire, now);
  const totalDays = Math.round((cur.end - cur.start) / DAY_MS) + 1;
  const daysElapsed = Math.min(Math.max(Math.round((today0 - cur.start) / DAY_MS) + 1, 1), totalDays);
  const elapsedFrac = daysElapsed / totalDays;
  const daysLeft = totalDays - daysElapsed;
  const pace = getCategoryPace(data, now, opts);

  const out = entries.map(([cat, b]) => {
    const max = Number(b.max) > 0 ? Number(b.max) : null;
    const min = Number(b.min) > 0 ? Number(b.min) : null;
    const spent = depenses
      .filter(d => _inBlock(d.date, cur) && getGrpForCat(d.categorie) === cat)
      .reduce((s, d) => s + d.montant, 0);
    const pc = pace[cat];
    const learned = Boolean(pc && pc.learned);
    const projected = pc ? pc.projected : spent;
    const perDay = (max != null && daysLeft > 0) ? Math.max(0, max - spent) / daysLeft : null;
    const perDayTxt = perDay != null ? ` (≈ ${fmt(perDay)}/jour pendant ${daysLeft} j)` : '';

    let status = 'ok', message;
    if (max != null && spent > max) {
      status = 'over';
      message = `Plafond dépassé de ${fmt(spent - max)} (${fmt(spent)} / ${fmt(max)})`;
    } else if (max != null && spent >= max * alertPct / 100) {
      status = 'warn';
      message = `${Math.round(spent / max * 100)} % du plafond utilisé — il reste ${fmt(max - spent)}${perDayTxt}`;
    } else if (max != null && projected > max && elapsedFrac < 1
               && (learned || (!FIXED_CATS.includes(cat) && elapsedFrac >= 0.2))) {
      status = 'pace';
      message = `Au rythme ${learned ? 'habituel (appris de vos cycles précédents)' : 'actuel'} : ≈ ${fmt(projected)} en fin de cycle, soit ${fmt(projected - max)} de dépassement prévu${perDayTxt}`;
    } else if (min != null && spent < min && elapsedFrac >= 0.7) {
      status = 'under';
      message = `Minimum non atteint : ${fmt(spent)} / ${fmt(min)} (il manque ${fmt(min - spent)})`;
    } else {
      message = max != null ? `${fmt(spent)} sur ${fmt(max)} (${Math.round(spent / max * 100)} %)${perDayTxt}`
                            : `${fmt(spent)} dépensés (minimum ${fmt(min)})`;
    }
    return { cat, spent, min, max, status, message, projected, learned, daysLeft, perDay,
             overrun: max != null ? Math.max(0, projected - max) : null,
             pct: max != null ? spent / max : null,
             remaining: max != null ? max - spent : null };
  });
  return out.sort((a, b) => (BUDGET_RANK[a.status] - BUDGET_RANK[b.status]) || ((b.pct || 0) - (a.pct || 0)));
}

// ── Résumé envoyé au conseiller IA ───────────────────────────────────────────
// Uniquement des agrégats du cycle : jamais l'historique brut, ni les soldes de
// compte, ni les identifiants. Les libellés n'apparaissent que dans le texte des
// pistes (ex. « brioche ×5 »), ce que l'écran de consentement indique.
function _ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// Pistes dont le texte ne dépend QUE du cycle en cours. Les autres comparent à l'historique
// (moyenne des cycles passés, médiane de la catégorie, charges récurrentes sur plusieurs mois).
const AI_CYCLE_ONLY_KINDS = ['micro', 'target', 'fees', 'budget', 'cash', 'debt'];

// opts.scope : 'history' (défaut) = cycle en cours + apprentissage des cycles précédents ; 'cycle' = cycle en cours seul
// opts.budgets : résultat de evaluateBudgets() → plan budgétaire (plafonds, reste par jour, dépassement prévu)
function buildAiSummary(res, opts = {}) {
  const history = opts.scope !== 'cycle';
  const r0 = v => (v == null ? null : Math.round(v));
  const ratio = v => (v == null ? null : Math.round(v * 100) / 100);

  const insights = history ? res.insights : res.insights.filter(i => AI_CYCLE_ONLY_KINDS.includes(i.kind));
  // L'économie potentielle est recalculée sur les pistes réellement transmises
  const potentiel = history ? res.potentialSaving
                            : insights.filter(i => i.counted).reduce((s, i) => s + i.saving, 0);
  const categories = (history ? res.categories : res.categories.filter(c => c.current > 0)).slice(0, 12)
    .map(c => history
      ? { categorie: c.cat, ce_cycle: r0(c.current), moyenne_cycles: r0(c.baseline), habituel_a_ce_stade: r0(c.habitualToDate),
          projection_fin_cycle: r0(c.projected), nb_depenses: c.count }
      : { categorie: c.cat, ce_cycle: r0(c.current), nb_depenses: c.count });

  const out = {
    devise: 'FCFA',
    portee: history ? 'avec_historique' : 'cycle_en_cours',
    cycle: { debut: _ymd(res.period.start), fin: _ymd(res.period.end), jours_ecoules: res.period.daysElapsed, jours_total: res.period.totalDays,
             jours_restants: res.period.totalDays - res.period.daysElapsed },
    revenu_cycle: r0(res.income),
    depenses_cycle: r0(res.totals.current),
    ratio_depenses_revenu: ratio(res.spendRatio),
    prevision: history
      ? { fin_de_cycle: r0(res.forecast.projectedCurrent), prochain_cycle: r0(res.forecast.nextCycle), tendance: res.forecast.trend }
      : { fin_de_cycle: r0(res.forecast.projectedCurrent) },          // simple projection du rythme du cycle en cours
    categories,
    pistes: insights.slice(0, 8).map(i => ({ type: i.kind, titre: i.title, detail: i.detail, economie: r0(i.saving), chiffree: i.counted })),
    economies_potentielles: r0(potentiel),
    revenus_annexes_cycle: r0(res.incomeAnnexe),
    cash_non_ventile: res.cash ? r0(res.cash.reste) : null,
    credits: res.debt ? Object.assign(
      { nb_actifs: res.debt.actifs, mensualites_totales: r0(res.debt.mensualites), taux_endettement: ratio(res.debt.ratio) },
      history ? { capital_restant_total: r0(res.debt.restant) } : {}) : null,
  };
  if (history) {
    out.moyenne_cycles_precedents = r0(res.totals.baseline);
    // Apprentissage : totaux par catégorie des cycles précédents (agrégats uniquement, jamais d'opération)
    out.historique = (res.cycles || []).slice(0, 6).map(c => ({
      debut: _ymd(c.start), fin: _ymd(c.end), depenses: r0(c.total), revenu: r0(c.income),
      par_categorie: Object.fromEntries(Object.entries(c.byCat).map(([k, v]) => [k, r0(v)])),
    }));
  }
  if (opts.budgets && opts.budgets.length) {
    out.budgets = opts.budgets.map(b => ({
      categorie: b.cat, plafond: r0(b.max), minimum: r0(b.min), depense: r0(b.spent), reste: r0(b.remaining),
      statut: b.status, par_jour_restant: r0(b.perDay), projection_fin_cycle: r0(b.projected), depassement_prevu: r0(b.overrun),
    }));
  }
  return out;
}

// ── Export UMD : window.* dans le navigateur, module.exports sous Node/Jest ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATS_DEP_GROUPED, CATS_DEP_FLAT, TYPES_BANCAIRE, AGENCES, GRP_COLORS,
    CATEGORY_MIGRATION_RULES,
    getCatColor, getGrpForCat, migrateCategorie,
    fmt, fmtDate, uid,
    isCurrentMonth, getSalaryPeriod, isInSalaryPeriod, fmtPeriodLabel,
    getPreviousSalaryPeriod, isInPreviousSalaryPeriod,
    normalizeLabel, getPeriodBlocks, getCategoryPace, analyzeSpending, evaluateBudgets, buildAiSummary, AI_CYCLE_ONLY_KINDS, CUT_RATES, FIXED_CATS,
    suggestCategory, suggestBankType, BANK_TYPE_RULES, BANK_TYPE_SENS,
    isTransfer, computeAccountBalances, buildTransferOps, WALLET_ACCOUNTS,
    isCashWithdrawal, getCashStatus, getCashSummary, CASH_TYPES,
    monthlyPayment, buildAmortization, loanStatus, getDebtSummary,
    isTokenValid, isValidDriveBackup, isDriveDataNewer, pickDriveFileId,
    DepenseSchema, BancaireSchema, RevenuSchema, AppDataSchema,
  };
}
