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

const TYPES_BANCAIRE = ['Salaire','Agios','Assurance','Épargne','Échéance prêt','Retrait app web','Retrait GAB','Virement'];
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

function analyzeSpending(data, now = new Date()) {
  const bancaire = (data && data.bancaire) || [];
  const depenses = (data && data.depenses) || [];
  const today0 = new Date(now); today0.setHours(0, 0, 0, 0);

  const blocks = getPeriodBlocks(bancaire, 4, now);
  const cur = blocks[0];
  const totalDays = Math.round((cur.end - cur.start) / DAY_MS) + 1;
  const daysElapsed = Math.min(Math.max(Math.round((today0 - cur.start) / DAY_MS) + 1, 1), totalDays);
  const elapsedFrac = daysElapsed / totalDays;

  const curItems = depenses.filter(d => _inBlock(d.date, cur));
  const curTotal = curItems.reduce((s, d) => s + d.montant, 0);
  const prevBlocks = blocks.slice(1).filter(b => depenses.some(d => _inBlock(d.date, b)));
  const prevTotals = prevBlocks.map(b => depenses.filter(d => _inBlock(d.date, b)).reduce((s, d) => s + d.montant, 0));

  const result = {
    enough: depenses.length >= 3,
    period: { start: cur.start, end: cur.end, daysElapsed, totalDays },
    totals: { current: curTotal, baseline: prevTotals.length ? _mean(prevTotals) : null },
    categories: [], insights: [], potentialSaving: 0,
    forecast: { nextCycle: null, trend: 'flat', projectedCurrent: null },
    income: 0, spendRatio: null,
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
  depenses.forEach(d => { if (prevBlocks.some(b => _inBlock(d.date, b))) cats.add(getGrpForCat(d.categorie)); });
  cats.forEach(g => {
    if (!prevBlocks.length) { catBase[g] = null; return; }
    const perBlock = prevBlocks.map(b =>
      depenses.filter(d => _inBlock(d.date, b) && getGrpForCat(d.categorie) === g).reduce((s, d) => s + d.montant, 0));
    catBase[g] = _mean(perBlock);
  });
  result.categories = [...cats].map(g => {
    const total = catCur[g] || 0, base = catBase[g];
    return { cat: g, current: total, baseline: base, count: (catItems[g] || []).length,
             delta: base == null ? null : total - base,
             pct: base ? (total / base - 1) : null,
             discretionary: g in CUT_RATES };
  }).sort((a, b) => b.current - a.current);

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
    } else if (base && base > 0 && !FIXED_CATS.includes(g) && elapsedFrac >= 0.15 && elapsedFrac < 0.7
               && total / elapsedFrac > base * 1.25) {
      const proj = total / elapsedFrac, saving = proj - base;
      if (saving >= MIN_SAVING) cands.push({ kind: 'pace', saving, severity: 'medium', icon: '⏱️',
        title: `${g} : rythme trop rapide`,
        detail: `Au rythme actuel (${daysElapsed}/${totalDays} jours), ${g} atteindrait ≈ ${fmt(proj)} contre ${fmt(base)} habituellement.` });
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
  const recurring = Object.values(groups)
    .filter(g => g.months.size >= 2 && _mean(g.amts) > 0 && _std(g.amts) / _mean(g.amts) <= 0.15)
    .map(g => ({ label: g.label, avg: _mean(g.amts) }))
    .sort((a, b) => b.avg - a.avg);

  // ── Ratio dépenses / revenus du cycle ──────────────────────────────────────
  const income = bancaire.filter(x => x.sens === 'credit' && _inBlock(x.date, cur)).reduce((s, x) => s + x.montant, 0);
  result.income = income;
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

// ── Résumé envoyé au conseiller IA ───────────────────────────────────────────
// Uniquement des agrégats du cycle : jamais l'historique brut, ni les soldes de
// compte, ni les identifiants. Les libellés n'apparaissent que dans le texte des
// pistes (ex. « brioche ×5 »), ce que l'écran de consentement indique.
function _ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function buildAiSummary(res) {
  const r0 = v => (v == null ? null : Math.round(v));
  return {
    devise: 'FCFA',
    cycle: { debut: _ymd(res.period.start), fin: _ymd(res.period.end), jours_ecoules: res.period.daysElapsed, jours_total: res.period.totalDays },
    revenu_cycle: r0(res.income),
    depenses_cycle: r0(res.totals.current),
    moyenne_cycles_precedents: r0(res.totals.baseline),
    ratio_depenses_revenu: res.spendRatio == null ? null : Math.round(res.spendRatio * 100) / 100,
    prevision: { fin_de_cycle: r0(res.forecast.projectedCurrent), prochain_cycle: r0(res.forecast.nextCycle), tendance: res.forecast.trend },
    categories: res.categories.slice(0, 12).map(c => ({ categorie: c.cat, ce_cycle: r0(c.current), moyenne: r0(c.baseline), nb_depenses: c.count })),
    pistes: res.insights.slice(0, 8).map(i => ({ type: i.kind, titre: i.title, detail: i.detail, economie: r0(i.saving), chiffree: i.counted })),
    economies_potentielles: r0(res.potentialSaving),
  };
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
    normalizeLabel, getPeriodBlocks, analyzeSpending, buildAiSummary, CUT_RATES, FIXED_CATS,
    isTokenValid, isValidDriveBackup, isDriveDataNewer, pickDriveFileId,
    DepenseSchema, BancaireSchema, RevenuSchema, AppDataSchema,
  };
}
