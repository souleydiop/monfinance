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

// ── Export UMD : window.* dans le navigateur, module.exports sous Node/Jest ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATS_DEP_GROUPED, CATS_DEP_FLAT, TYPES_BANCAIRE, AGENCES, GRP_COLORS,
    CATEGORY_MIGRATION_RULES,
    getCatColor, getGrpForCat, migrateCategorie,
    fmt, fmtDate, uid,
    isCurrentMonth, getSalaryPeriod, isInSalaryPeriod, fmtPeriodLabel,
    getPreviousSalaryPeriod, isInPreviousSalaryPeriod,
    isTokenValid, isValidDriveBackup, isDriveDataNewer, pickDriveFileId,
    DepenseSchema, BancaireSchema, RevenuSchema, AppDataSchema,
  };
}
