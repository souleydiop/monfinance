const {
  migrateCategorie,
  getCatColor,
  getGrpForCat,
  isCurrentMonth,
  getSalaryPeriod,
  isInSalaryPeriod,
  fmtPeriodLabel,
  getPreviousSalaryPeriod,
  isInPreviousSalaryPeriod,
  normalizeLabel,
  getPeriodBlocks,
  analyzeSpending,
  evaluateBudgets,
  getCategoryPace,
  suggestCategory,
  suggestBankType,
  isTransfer,
  computeAccountBalances,
  buildTransferOps,
  isCashWithdrawal,
  getCashStatus,
  getCashSummary,
  monthlyPayment,
  buildAmortization,
  loanStatus,
  getDebtSummary,
  buildAiSummary,
  fmt,
  CATS_DEP_FLAT,
  isTokenValid,
  isValidDriveBackup,
  isDriveDataNewer,
  pickDriveFileId,
} = require('../assets/utils.js');

describe('migrateCategorie', () => {
  test('reconnaît une catégorie déjà propre et ne la modifie pas', () => {
    expect(migrateCategorie('Alimentation', 'Courses marché')).toBe('Alimentation');
    expect(migrateCategorie('Loyer', 'Loyer appartement')).toBe('Loyer');
  });

  test('réaffecte les anciennes catégories composées vers les bonnes familles', () => {
    expect(migrateCategorie('Maison riz', 'Courses marché')).toBe('Alimentation');
    expect(migrateCategorie('École Blossom', 'Frais scolarité Blossom')).toBe('École');
    expect(migrateCategorie('Service bonne', 'Salaire bonne')).toBe('Service');
    expect(migrateCategorie('Loyer VDN', 'Loyer appartement VDN')).toBe('Loyer');
    expect(migrateCategorie('Facture Woyofal DKR', 'Woyofal recharge DKR')).toBe('Facture');
    expect(migrateCategorie('Aide mère Ndeye', 'Aide maman')).toBe('Aide');
  });

  test('détecte les nouvelles familles par mot-clé même sans préfixe connu', () => {
    expect(migrateCategorie('Divers', 'Essence voiture')).toBe('Transport');
    expect(migrateCategorie('Divers', 'Sortie cinéma en famille')).toBe('Loisir');
    expect(migrateCategorie('Divers', 'Dîner au restaurant')).toBe('Resto');
  });

  test('retombe sur "Maison" par défaut si rien ne correspond', () => {
    expect(migrateCategorie('Xyz inconnu', 'Chose imprévue')).toBe('Maison');
  });

  test('toute catégorie migrée est une catégorie plate valide', () => {
    const samples = ['Maison riz', 'École Blossom', 'Service bonne', 'Loyer VDN', 'Facture Woyofal DKR', 'Aide mère Ndeye', 'Divers'];
    samples.forEach(s => {
      expect(CATS_DEP_FLAT).toContain(migrateCategorie(s, ''));
    });
  });
});

describe('getCatColor / getGrpForCat', () => {
  test('retourne une couleur pour une catégorie connue', () => {
    expect(getCatColor('Alimentation')).toBe('#4ade80');
    expect(getCatColor('Loyer')).toBe('#22d3ee');
  });
  test('retourne une couleur grise de secours pour une catégorie inconnue', () => {
    expect(getCatColor('Inconnu')).toBe('#64748b');
  });
  test('retrouve le groupe associé à une catégorie', () => {
    expect(getGrpForCat('Resto')).toBe('Resto');
    expect(getGrpForCat('Inconnu')).toBe('Autre');
  });
});

describe('isCurrentMonth', () => {
  test('vrai si la date est dans le même mois/année que la référence', () => {
    expect(isCurrentMonth('2026-07-15', new Date('2026-07-04T00:00:00'))).toBe(true);
  });
  test('faux si le mois diffère', () => {
    expect(isCurrentMonth('2026-06-15', new Date('2026-07-04T00:00:00'))).toBe(false);
  });
});

describe('getSalaryPeriod / isInSalaryPeriod', () => {
  const bancaire = [
    { type: 'Salaire', sens: 'credit', date: '2026-05-01' },
    { type: 'Retrait GAB', sens: 'debit', date: '2026-05-10' },
  ];

  test('la période démarre à la date du dernier virement de salaire passé', () => {
    const today = new Date('2026-05-15T00:00:00');
    const { start, end } = getSalaryPeriod(bancaire, today);
    expect(start.toISOString().slice(0,10)).toBe('2026-05-01');
    // fenêtre de 30 jours (jour 0 à jour 29)
    expect(end.toISOString().slice(0,10)).toBe('2026-05-30');
  });

  test('ignore les virements de salaire futurs par rapport à "aujourd\'hui"', () => {
    const withFuture = [...bancaire, { type: 'Salaire', sens: 'credit', date: '2026-06-01' }];
    const today = new Date('2026-05-15T00:00:00');
    const { start } = getSalaryPeriod(withFuture, today);
    expect(start.toISOString().slice(0,10)).toBe('2026-05-01');
  });

  test('sans nouveau salaire après 30 jours, le cycle reste ouvert jusqu\'à aujourd\'hui', () => {
    const late = new Date('2026-09-15T12:00:00');
    const { start, end } = getSalaryPeriod(bancaire, late);
    expect(start.toISOString().slice(0,10)).toBe('2026-05-01');
    expect(end.getMonth()).toBe(8); // septembre
    expect(end.getDate()).toBe(15);
    // une saisie du jour reste visible
    expect(isInSalaryPeriod('2026-09-15', bancaire, late)).toBe(true);
  });

  test('repli sur le mois calendaire si aucun salaire enregistré', () => {
    const today = new Date('2026-07-15T00:00:00');
    const { start } = getSalaryPeriod([], today);
    expect(start.getMonth()).toBe(6); // juillet (0-indexé)
    expect(start.getDate()).toBe(1);
  });

  test('isInSalaryPeriod reconnaît une date dans la fenêtre de 30 jours', () => {
    const today = new Date('2026-05-15T00:00:00');
    expect(isInSalaryPeriod('2026-05-10', bancaire, today)).toBe(true);
    expect(isInSalaryPeriod('2026-04-30', bancaire, today)).toBe(false);
    expect(isInSalaryPeriod('2026-06-05', bancaire, today)).toBe(false);
  });

  test('fmtPeriodLabel formate une plage lisible', () => {
    const today = new Date('2026-05-15T00:00:00');
    expect(fmtPeriodLabel(bancaire, today)).toMatch(/mai/i);
  });
});

describe('getPreviousSalaryPeriod / isInPreviousSalaryPeriod', () => {
  const bancaire = [{ type: 'Salaire', sens: 'credit', date: '2026-05-01' }];
  const today = new Date('2026-05-15T00:00:00');

  test('la période précédente est exactement les 30 jours avant le cycle courant, sans chevauchement', () => {
    const prev = getPreviousSalaryPeriod(bancaire, today);
    expect(prev.start.toISOString().slice(0,10)).toBe('2026-04-01');
    expect(prev.end.toISOString().slice(0,10)).toBe('2026-04-30');
  });
  test('isInPreviousSalaryPeriod reconnaît une date du cycle précédent, pas du cycle courant', () => {
    expect(isInPreviousSalaryPeriod('2026-04-15', bancaire, today)).toBe(true);
    expect(isInPreviousSalaryPeriod('2026-05-10', bancaire, today)).toBe(false);
  });
});

describe('fmt', () => {
  test('formate un montant en FCFA sans décimales', () => {
    expect(fmt(650000)).toContain('650');
    expect(fmt(0)).toBeDefined();
  });
});

describe('isTokenValid (Drive)', () => {
  const now = new Date('2026-07-04T12:00:00Z').getTime();

  test('valide si le token existe et que l\'expiration est future', () => {
    expect(isTokenValid('abc123', now + 60_000, now)).toBe(true);
  });
  test('invalide si le token a expiré', () => {
    expect(isTokenValid('abc123', now - 1, now)).toBe(false);
  });
  test('invalide si le token est absent', () => {
    expect(isTokenValid(null, now + 60_000, now)).toBe(false);
  });
  test('invalide si aucune expiration n\'a été enregistrée (ancien format)', () => {
    expect(isTokenValid('abc123', 0, now)).toBe(false);
    expect(isTokenValid('abc123', null, now)).toBe(false);
  });
});

describe('isValidDriveBackup (validé avec Zod)', () => {
  const validBancaireItem = { id: 1, type: 'Salaire', montant: 500000, date: '2026-05-01', sens: 'credit', agence: 'CBAO Dakar' };
  const validDepenseItem = { id: 2, label: 'Courses marché', montant: 35000, date: '2026-05-02', categorie: 'Alimentation' };

  test('valide si les tableaux bancaire/dépenses sont vides ou bien formés', () => {
    expect(isValidDriveBackup({ bancaire: [], depenses: [] })).toBe(true);
    expect(isValidDriveBackup({ bancaire: [validBancaireItem], depenses: [validDepenseItem] })).toBe(true);
  });
  test('invalide si data est vide, nulle ou non-objet', () => {
    expect(isValidDriveBackup({})).toBe(false); // bancaire/depenses obligatoires : {} n'est pas une sauvegarde valide
    expect(isValidDriveBackup(null)).toBe(false);
    expect(isValidDriveBackup(undefined)).toBe(false);
    expect(isValidDriveBackup('oops')).toBe(false);
  });
  test('invalide si bancaire n\'est pas un tableau', () => {
    expect(isValidDriveBackup({ bancaire: 'oops' })).toBe(false);
  });
  test('invalide si un enregistrement bancaire est incomplet', () => {
    expect(isValidDriveBackup({ bancaire: [{ id: 1 }] })).toBe(false);
  });
  test('invalide si un champ a le mauvais type (ex: montant en texte)', () => {
    expect(isValidDriveBackup({ bancaire: [{ ...validBancaireItem, montant: '500000' }] })).toBe(false);
  });
  test('invalide si "sens" n\'est pas credit/debit', () => {
    expect(isValidDriveBackup({ bancaire: [{ ...validBancaireItem, sens: 'inconnu' }] })).toBe(false);
  });
  test('invalide si un enregistrement dépense est incomplet', () => {
    expect(isValidDriveBackup({ bancaire: [], depenses: [{ id: 1, montant: 1000 }] })).toBe(false);
  });
});

describe('isDriveDataNewer', () => {
  test('vrai si la sauvegarde Drive est plus récente que la sauvegarde locale', () => {
    expect(isDriveDataNewer('2026-07-04T10:00:00Z', '2026-07-03T10:00:00Z')).toBe(true);
  });
  test('faux si la sauvegarde locale est plus récente', () => {
    expect(isDriveDataNewer('2026-07-01T10:00:00Z', '2026-07-04T10:00:00Z')).toBe(false);
  });
  test('traite une date manquante comme la plus ancienne possible', () => {
    expect(isDriveDataNewer(null, '2026-07-04T10:00:00Z')).toBe(false);
    expect(isDriveDataNewer('2026-07-04T10:00:00Z', null)).toBe(true);
    expect(isDriveDataNewer(null, null)).toBe(false);
  });
});

describe('pickDriveFileId', () => {
  test('retourne l\'id du premier fichier trouvé', () => {
    expect(pickDriveFileId({ files: [{ id: 'file-1' }, { id: 'file-2' }] })).toBe('file-1');
  });
  test('retourne null si aucun fichier, réponse vide ou malformée', () => {
    expect(pickDriveFileId({ files: [] })).toBeNull();
    expect(pickDriveFileId({})).toBeNull();
    expect(pickDriveFileId(null)).toBeNull();
    expect(pickDriveFileId({ files: 'oops' })).toBeNull();
  });
});

describe('Analyse intelligente (cost cutting)', () => {
  const now = new Date('2026-07-30T12:00:00');
  const bancaire = [
    { id: 1, type: 'Salaire', sens: 'credit', montant: 650000, date: '2026-06-01', agence: 'CBAO Dakar' },
    { id: 2, type: 'Salaire', sens: 'credit', montant: 650000, date: '2026-07-01', agence: 'CBAO Dakar' },
    { id: 3, type: 'Agios', sens: 'debit', montant: 4500, date: '2026-07-10', agence: 'CBAO Dakar' },
  ];
  const base = [
    { id: 1, label: 'Loyer appartement', montant: 100000, date: '2026-06-01', categorie: 'Loyer' },
    { id: 2, label: 'Loyer appartement', montant: 100000, date: '2026-07-01', categorie: 'Loyer' },
    { id: 3, label: 'Courses marché', montant: 30000, date: '2026-06-10', categorie: 'Alimentation' },
    { id: 4, label: 'Courses marché', montant: 30000, date: '2026-07-10', categorie: 'Alimentation' },
    { id: 5, label: 'resto midi', montant: 10000, date: '2026-06-05', categorie: 'Resto' },
  ];
  const brioches = [0, 1, 2, 3, 4].map(i => ({ id: 10 + i, label: 'brioche', montant: 4000, date: `2026-07-0${2 + i}`, categorie: 'Resto' }));

  test('normalizeLabel ignore casse, accents, chiffres et mois', () => {
    expect(normalizeLabel('Salaire Mai 2026')).toBe('salaire');
    expect(normalizeLabel('  Brioche 2 ')).toBe('brioche');
    expect(normalizeLabel('Frais scolarité')).toBe('frais scolarite');
  });

  test('getPeriodBlocks enchaîne des blocs de 30 jours sans trou ni chevauchement', () => {
    const [cur, prev] = getPeriodBlocks(bancaire, 3, now);
    expect(cur.start.getDate()).toBe(1); // cycle ancré sur le salaire du 1er juillet
    const gap = (cur.start - prev.end) / 86400000;
    expect(gap).toBe(1);
  });

  test('pas assez de données → enough=false et aucune piste', () => {
    const r = analyzeSpending({ bancaire, depenses: base.slice(0, 2) }, now);
    expect(r.enough).toBe(false);
    expect(r.insights).toEqual([]);
  });

  test('détecte la dérive d\'une catégorie vs la moyenne des cycles précédents', () => {
    const r = analyzeSpending({ bancaire, depenses: [...base, ...brioches] }, now);
    const resto = r.insights.find(i => i.id === 'overspend:Resto');
    expect(resto).toBeDefined();
    expect(resto.saving).toBe(10000); // 20 000 ce cycle − 10 000 de moyenne
    expect(resto.counted).toBe(true);
  });

  test('les agios du cycle sont comptés comme économie évitable', () => {
    const r = analyzeSpending({ bancaire, depenses: [...base, ...brioches] }, now);
    const fees = r.insights.find(i => i.kind === 'fees');
    expect(fees.saving).toBe(4500);
    expect(r.potentialSaving).toBe(14500); // Resto 10 000 + agios 4 500, sans double comptage
  });

  test('les charges fixes stables sont signalées comme récurrentes (non comptées)', () => {
    const r = analyzeSpending({ bancaire, depenses: [...base, ...brioches] }, now);
    const rec = r.insights.find(i => i.kind === 'recurring');
    expect(rec).toBeDefined();
    expect(rec.counted).toBe(false);
  });

  test('une dépense très supérieure à l\'historique de sa catégorie est une anomalie', () => {
    const hist = [29000, 30000, 31000, 30000, 30500].map((m, i) =>
      ({ id: 100 + i, label: 'Courses', montant: m, date: `2026-06-0${2 + i}`, categorie: 'Alimentation' }));
    const spike = { id: 200, label: 'Courses fête', montant: 95000, date: '2026-07-05', categorie: 'Alimentation' };
    const r = analyzeSpending({ bancaire, depenses: [...hist, spike] }, now);
    const a = r.insights.find(i => i.kind === 'anomaly');
    expect(a).toBeDefined();
    expect(a.title).toContain('Courses fête');
    expect(a.counted).toBe(false);
  });

  test('prévision du prochain cycle = moyenne pondérée des cycles complets', () => {
    const r = analyzeSpending({ bancaire, depenses: [...base, ...brioches] }, now);
    expect(r.forecast.nextCycle).toBe(140000); // un seul cycle complet : 100 000 + 30 000 + 10 000
  });

  test('ratio dépenses / revenu du cycle', () => {
    const r = analyzeSpending({ bancaire, depenses: [...base, ...brioches] }, now);
    expect(r.income).toBe(650000);
    expect(r.spendRatio).toBeCloseTo(150000 / 650000, 5);
  });
});

describe('buildAiSummary (résumé envoyé à l\'IA) — portée', () => {
  const now = new Date('2026-07-30T12:00:00');
  const bancaire = [
    { id: 1, type: 'Salaire', sens: 'credit', montant: 650000, date: '2026-06-01', agence: 'CBAO Dakar' },
    { id: 2, type: 'Salaire', sens: 'credit', montant: 650000, date: '2026-07-01', agence: 'CBAO Dakar' },
  ];
  // juin : Resto 10 000 ; juillet : Resto 25 000 (dérive vs moyenne) + 5 achats « brioche »
  const depenses = [
    { id: 1, label: 'resto midi', montant: 10000, date: '2026-06-05', categorie: 'Resto' },
    { id: 3, label: 'Courses', montant: 30000, date: '2026-06-10', categorie: 'Alimentation' },
    ...[0, 1, 2, 3, 4].map(i => ({ id: 10 + i, label: 'brioche', montant: 5000, date: `2026-07-0${2 + i}`, categorie: 'Resto' })),
  ];
  const res = () => analyzeSpending({ bancaire, depenses }, now, { cycleOnly: true });
  const resFull = () => analyzeSpending({ bancaire, depenses }, now);

  test('portée « cycle » : cycle en cours uniquement, aucune donnée d\'historique', () => {
    const s = buildAiSummary(res(), { scope: 'cycle' });
    expect(s.portee).toBe('cycle_en_cours');
    expect(s.moyenne_cycles_precedents).toBe(undefined);
    expect(s.prevision.prochain_cycle).toBe(undefined);
    expect(s.prevision.tendance).toBe(undefined);
    expect(s.categories.every(c => c.moyenne === undefined)).toBe(true);
    const json = JSON.stringify(s);
    expect(json).not.toContain('votre moyenne');     // aucun texte de piste comparé à l'historique
    expect(json).not.toContain('Alimentation');      // catégorie sans dépense ce cycle : absente
  });

  test('le moteur « cycle seul » n\'utilise aucun historique mais garde les pistes valables sur le cycle', () => {
    const full = resFull();
    expect(full.insights.some(i => i.kind === 'overspend')).toBe(true);      // moteur complet : dérive détectée…
    const r = res();
    expect(r.totals.baseline).toBe(null);
    expect(r.forecast.nextCycle).toBe(null);
    const kinds = buildAiSummary(r, { scope: 'cycle' }).pistes.map(p => p.type);
    ['overspend', 'pace', 'anomaly', 'recurring'].forEach(k => expect(kinds).not.toContain(k));
    expect(kinds).toContain('micro');                                         // …mais « brioche ×5 » reste proposé
  });

  test('filet de sécurité : même si on lui passe l\'analyse complète, le résumé « cycle » filtre l\'historique', () => {
    const kinds = buildAiSummary(resFull(), { scope: 'cycle' }).pistes.map(p => p.type);
    ['overspend', 'pace', 'anomaly', 'recurring'].forEach(k => expect(kinds).not.toContain(k));
    expect(buildAiSummary(resFull(), { scope: 'cycle' }).moyenne_cycles_precedents).toBe(undefined);
  });

  test('économies potentielles du mode cycle = pistes valables sur le cycle (ici « brioche » 7 500)', () => {
    expect(buildAiSummary(res(), { scope: 'cycle' }).economies_potentielles).toBe(7500);
    expect(buildAiSummary(resFull(), { scope: 'history' }).economies_potentielles > 7500).toBe(true);
  });

  test('scope « history » : moyennes, tendance et toutes les pistes', () => {
    const s = buildAiSummary(resFull(), { scope: 'history' });
    expect(s.portee).toBe('avec_historique');
    expect(s.moyenne_cycles_precedents).toBe(40000);
    expect(s.prevision.prochain_cycle).toBe(40000);
    expect(buildAiSummary(resFull()).portee).toBe('avec_historique');   // l'historique est la portée par défaut
    expect(s.pistes.map(p => p.type)).toContain('overspend');
  });

  test('contient les agrégats du cycle', () => {
    const s = buildAiSummary(res(), { scope: 'cycle' });
    expect(s.devise).toBe('FCFA');
    expect(s.depenses_cycle).toBe(25000);
    expect(s.revenu_cycle).toBe(650000);
    expect(s.cycle.debut).toBe('2026-07-01');
  });

  test('ne contient ni historique brut, ni agence, ni identifiant, ni date de transaction', () => {
    const json = JSON.stringify(buildAiSummary(resFull(), { scope: 'history' }));
    expect(json).not.toContain('CBAO');
    expect(json).not.toContain('"id"');
    expect(json).not.toContain('2026-07-05');
    expect(json).not.toContain('2026-06-10');
  });
});

describe('Budgets par catégorie (min / max / seuil d\'alerte)', () => {
  const bancaire = [{ id: 1, type: 'Salaire', sens: 'credit', montant: 650000, date: '2026-07-01', agence: 'X' }];
  const dep = (cat, montant, date, id) => ({ id, label: cat + id, montant, date, categorie: cat });
  const run = (budgets, depenses, nowStr, settings) =>
    evaluateBudgets({ bancaire, depenses, budgets, budgetSettings: settings }, new Date(nowStr));
  const byCat = (res, cat) => res.find(r => r.cat === cat);

  test('aucun budget défini → liste vide', () => {
    expect(run({}, [], '2026-07-15T12:00:00')).toEqual([]);
    expect(run({ Resto: { min: null, max: null } }, [], '2026-07-15T12:00:00')).toEqual([]);
  });

  test('plafond dépassé → statut over avec le montant du dépassement', () => {
    const r = byCat(run({ Resto: { max: 20000 } }, [dep('Resto', 25000, '2026-07-05', 1)], '2026-07-15T12:00:00'), 'Resto');
    expect(r.status).toBe('over');
    expect(r.message).toContain('dépassé');
    expect(r.remaining).toBe(-5000);
  });

  test('seuil d\'alerte à 80 % par défaut → warn ; seuil personnalisable', () => {
    const d = [dep('Resto', 16000, '2026-07-05', 1)];
    expect(byCat(run({ Resto: { max: 20000 } }, d, '2026-07-15T12:00:00'), 'Resto').status).toBe('warn');   // 80 % exactement
    expect(byCat(run({ Resto: { max: 20000 } }, d, '2026-07-15T12:00:00', { alertPct: 90 }), 'Resto').status).toBe('pace'); // sous 90 % mais rythme élevé
    expect(byCat(run({ Resto: { max: 100000 } }, d, '2026-07-15T12:00:00'), 'Resto').status).toBe('ok');
  });

  test('rythme trop rapide → pace (au milieu du cycle, hors charges fixes)', () => {
    // 10 000 au jour 15/30 → ≈ 20 000 projetés > plafond 15 000 mais seuil 80 % (12 000) non atteint
    const r = byCat(run({ Resto: { max: 15000 } }, [dep('Resto', 10000, '2026-07-05', 1)], '2026-07-15T12:00:00'), 'Resto');
    expect(r.status).toBe('pace');
    // une charge fixe (Loyer) ne déclenche jamais « pace » : payée en une fois
    const loyer = byCat(run({ Loyer: { max: 150000 } }, [dep('Loyer', 100000, '2026-07-02', 2)], '2026-07-15T12:00:00'), 'Loyer');
    expect(loyer.status).toBe('ok');
  });

  test('minimum non atteint → under, seulement en fin de cycle (≥ 70 %)', () => {
    const d = [dep('Alimentation', 10000, '2026-07-05', 1)];
    expect(byCat(run({ Alimentation: { min: 40000 } }, d, '2026-07-10T12:00:00'), 'Alimentation').status).toBe('ok');    // début de cycle : trop tôt
    const late = byCat(run({ Alimentation: { min: 40000 } }, d, '2026-07-26T12:00:00'), 'Alimentation');
    expect(late.status).toBe('under');
    expect(late.message).toContain('manque');
  });

  test('minimum atteint → ok', () => {
    const d = [dep('Alimentation', 45000, '2026-07-05', 1)];
    expect(byCat(run({ Alimentation: { min: 40000, max: 80000 } }, d, '2026-07-26T12:00:00'), 'Alimentation').status).toBe('ok');
  });

  test('seules les dépenses du cycle courant comptent', () => {
    const d = [dep('Resto', 50000, '2026-06-10', 1), dep('Resto', 5000, '2026-07-05', 2)];
    expect(byCat(run({ Resto: { max: 20000 } }, d, '2026-07-15T12:00:00'), 'Resto').spent).toBe(5000);
  });

  test('tri : les statuts les plus graves d\'abord', () => {
    const d = [dep('Resto', 25000, '2026-07-05', 1), dep('Transport', 1000, '2026-07-05', 2)];
    const res = run({ Transport: { max: 100000 }, Resto: { max: 20000 } }, d, '2026-07-15T12:00:00');
    expect(res.map(r => r.cat)).toEqual(['Resto', 'Transport']);
  });
});

describe('Catégorisation automatique', () => {
  const hist = [
    { id: 1, label: 'Courses marché', montant: 30000, date: '2026-06-10', categorie: 'Alimentation' },
    { id: 2, label: 'Courses Auchan', montant: 25000, date: '2026-06-20', categorie: 'Alimentation' },
    { id: 3, label: 'Taxi aéroport', montant: 8000, date: '2026-06-22', categorie: 'Transport' },
    { id: 4, label: 'Taxi bureau', montant: 3000, date: '2026-06-25', categorie: 'Transport' },
  ];
  test('libellé déjà saisi → catégorie de l\'historique', () => {
    const r = suggestCategory('courses MARCHÉ', hist);
    expect(r.cat).toBe('Alimentation');
    expect(r.source).toBe('historique');
  });
  test('mot récurrent de l\'historique → vote par mots (ex. « taxi »)', () => {
    const r = suggestCategory('Taxi Plateau', hist);
    expect(r.cat).toBe('Transport');
    expect(r.source).toBe('historique');
  });
  test('apprend vos habitudes : un même mot rangé ailleurs l\'emporte sur les mots-clés par défaut', () => {
    const h = [
      { id: 1, label: 'Essence Total', montant: 20000, date: '2026-06-01', categorie: 'Entretien' },
      { id: 2, label: 'Essence Shell', montant: 20000, date: '2026-06-08', categorie: 'Entretien' },
    ];
    expect(suggestCategory('Essence', h).cat).toBe('Entretien');
  });
  test('sans historique → mots-clés par défaut', () => {
    expect(suggestCategory('Woyofal recharge', []).cat).toBe('Facture');
    expect(suggestCategory('Dîner au restaurant', []).cat).toBe('Resto');
    expect(suggestCategory('Loyer juillet', []).source).toBe('mots-clés');
  });
  test('libellé inconnu ou vide → null', () => {
    expect(suggestCategory('zzqx', hist)).toBeNull();
    expect(suggestCategory('', hist)).toBeNull();
  });
  test('suggestBankType déduit le type d\'après la note', () => {
    expect(suggestBankType('Commission de compte')).toBe('Agios');
    expect(suggestBankType('retrait GAB Plateau')).toBe('Retrait GAB');
    expect(suggestBankType('Loyer perçu VDN')).toBe('Revenu annexe');
    expect(suggestBankType('Crédit auto — échéance')).toBe('Échéance prêt');
    expect(suggestBankType('bonjour')).toBeNull();
  });
});

describe('Comptes Wave / Orange Money et transferts', () => {
  const mk = () => { let i = 0; return () => ++i; };
  test('Wave et Orange Money existent toujours, avec leur solde initial', () => {
    const acc = computeAccountBalances({ bancaire: [], comptes: { Wave: { soldeInitial: 15000 } } });
    expect(acc.map(a => a.nom)).toEqual(['Wave', 'Orange Money']);
    expect(acc[0].solde).toBe(15000);
  });
  test('solde = solde initial + crédits − débits, par compte', () => {
    const bancaire = [
      { id: 1, type: 'Virement', sens: 'credit', montant: 50000, date: '2026-07-01', agence: 'Wave' },
      { id: 2, type: 'Virement', sens: 'debit', montant: 12000, date: '2026-07-02', agence: 'Wave' },
      { id: 3, type: 'Salaire', sens: 'credit', montant: 600000, date: '2026-07-01', agence: 'CBAO Dakar' },
    ];
    const acc = computeAccountBalances({ bancaire, comptes: { Wave: { soldeInitial: 1000 } } });
    expect(acc.find(a => a.nom === 'Wave').solde).toBe(39000);
    expect(acc.find(a => a.nom === 'CBAO Dakar').solde).toBe(600000);
  });
  test('un transfert crée une sortie et une entrée liées, plus les frais en vraie dépense', () => {
    const ops = buildTransferOps({ from: 'CBAO Dakar', to: 'Wave', montant: 40000, frais: 400, date: '2026-07-05' }, mk());
    expect(ops.length).toBe(3);
    expect(ops[0].sens).toBe('debit'); expect(ops[0].agence).toBe('CBAO Dakar');
    expect(ops[1].sens).toBe('credit'); expect(ops[1].agence).toBe('Wave');
    expect(ops[0].transfertId).toBe(ops[1].transfertId);
    expect(isTransfer(ops[0])).toBe(true);
    expect(ops[2].type).toBe('Frais');
    expect(isTransfer(ops[2])).toBe(false);   // les frais comptent comme dépense
  });
  test('un transfert ne change pas le solde total et ne compte pas comme revenu', () => {
    const bancaire = [{ id: 1, type: 'Salaire', sens: 'credit', montant: 600000, date: '2026-07-01', agence: 'CBAO Dakar' },
      ...buildTransferOps({ from: 'CBAO Dakar', to: 'Wave', montant: 100000, date: '2026-07-05' }, mk())];
    const total = computeAccountBalances({ bancaire }).reduce((s, a) => s + a.solde, 0);
    expect(total).toBe(600000);
    const r = analyzeSpending({ bancaire, depenses: [
      { id: 1, label: 'a', montant: 1000, date: '2026-07-02', categorie: 'Resto' },
      { id: 2, label: 'b', montant: 1000, date: '2026-07-03', categorie: 'Resto' },
      { id: 3, label: 'c', montant: 1000, date: '2026-07-04', categorie: 'Resto' }] }, new Date('2026-07-20T12:00:00'));
    expect(r.income).toBe(600000);            // le crédit du transfert est exclu
  });
});

describe('Retraits cash à ventiler', () => {
  const data = {
    bancaire: [
      { id: 10, type: 'Retrait GAB', sens: 'debit', montant: 100000, date: '2026-07-03', agence: 'CBAO Dakar' },
      { id: 11, type: 'Salaire', sens: 'credit', montant: 600000, date: '2026-07-01', agence: 'CBAO Dakar' },
    ],
    depenses: [
      { id: 1, label: 'Marché', montant: 30000, date: '2026-07-04', categorie: 'Alimentation', retraitId: 10 },
      { id: 2, label: 'Taxi', montant: 10000, date: '2026-07-05', categorie: 'Transport', retraitId: 10 },
      { id: 3, label: 'Autre', montant: 5000, date: '2026-07-05', categorie: 'Resto' },
    ],
  };
  test('isCashWithdrawal ne reconnaît que les retraits en débit', () => {
    expect(isCashWithdrawal(data.bancaire[0])).toBe(true);
    expect(isCashWithdrawal(data.bancaire[1])).toBe(false);
  });
  test('reste à ventiler = montant du retrait − dépenses rattachées', () => {
    const st = getCashStatus(data, 10);
    expect(st.ventile).toBe(40000);
    expect(st.reste).toBe(60000);
    expect(st.items.length).toBe(2);
    expect(st.complet).toBe(false);
  });
  test('résumé du cycle', () => {
    const s = getCashSummary(data, new Date('2026-07-20T12:00:00'));
    expect(s).toEqual({ count: 1, total: 100000, ventile: 40000, reste: 60000 });
  });
  test('retrait entièrement ventilé → complet', () => {
    const d2 = { ...data, depenses: [{ id: 9, label: 'Tout', montant: 100000, date: '2026-07-04', categorie: 'Maison', retraitId: 10 }] };
    expect(getCashStatus(d2, 10).complet).toBe(true);
    expect(getCashSummary(d2, new Date('2026-07-20T12:00:00')).reste).toBe(0);
  });
});

describe('Crédits : amortissement', () => {
  test('mensualité (formule d\'annuité) et cas taux 0', () => {
    expect(Math.round(monthlyPayment(10000000, 6, 120))).toBe(111021);   // 10 M à 6 % sur 10 ans
    expect(monthlyPayment(1200000, 0, 12)).toBe(100000);
  });
  const loan = { id: 1, kind: 'immobilier', label: 'Maison', capital: 10000000, taux: 6, dureeMois: 120, premiereEcheance: '2026-02-05' };
  test('échéancier : N lignes, solde final nul, capital remboursé = capital', () => {
    const { rows } = buildAmortization(loan);
    expect(rows.length).toBe(120);
    expect(rows[rows.length - 1].restant).toBe(0);
    const cap = rows.reduce((s, r) => s + r.capital, 0);
    expect(Math.round(cap)).toBe(10000000);
    expect(rows[0].interets).toBeCloseTo(50000, 0);                      // 10 M × 0,5 %
  });
  test('statut à une date : échéances passées, restant dû, prochaine échéance, fin', () => {
    const st = loanStatus(loan, new Date('2026-07-20T12:00:00'));        // échéances des 5/02 … 5/07 passées = 6
    expect(st.moisRestants).toBe(114);
    expect(st.next.n).toBe(7);
    expect(st.restant).toBeCloseTo(loanStatus(loan, new Date('2026-07-20T12:00:00')).rows[5].restant, 2);
    expect(st.dateFin.getFullYear()).toBe(2036);
    expect(st.pctRembourse > 0.03 && st.pctRembourse < 0.045).toBe(true);   // ≈ 3,7 % après 6 échéances
    expect(st.termine).toBe(false);
  });
  test('assurance ajoutée au coût mensuel sans toucher à l\'amortissement', () => {
    const st = loanStatus({ ...loan, assurance: 5000 }, new Date('2026-07-20T12:00:00'));
    expect(Math.round(st.coutMensuel - st.mensualite)).toBe(5000);
  });
  test('mensualité imposée par la banque : le prêt s\'arrête quand le capital est soldé', () => {
    const { rows } = buildAmortization({ ...loan, mensualite: 150000 });
    expect(rows.length < 120).toBe(true);
    expect(rows[rows.length - 1].restant).toBe(0);
  });
  test('calage sur le capital restant réel : l\'échéancier repart de ce solde', () => {
    const l = { ...loan, calage: { date: '2026-07-20', capitalRestant: 9000000 } };
    const { rows, offset } = buildAmortization(l);
    expect(offset).toBe(6);                                              // 6 échéances déjà passées
    expect(rows[0].n).toBe(7);
    expect(rows[0].interets).toBeCloseTo(45000, 0);                      // 9 M × 0,5 %
    expect(rows.length).toBe(114);
  });
  test('prêt terminé et données invalides', () => {
    const old = { ...loan, capital: 100000, dureeMois: 6, premiereEcheance: '2024-01-10' };
    expect(loanStatus(old, new Date('2026-07-20T12:00:00')).termine).toBe(true);
    expect(buildAmortization({ capital: 0 }).rows).toEqual([]);
  });
  test('fin de mois : échéance du 31 ramenée au dernier jour des mois courts', () => {
    const { rows } = buildAmortization({ capital: 100000, taux: 0, dureeMois: 3, premiereEcheance: '2026-01-31' });
    expect(rows[1].date.getMonth()).toBe(1);
    expect(rows[1].date.getDate()).toBe(28);
  });
  test('taux d\'endettement = mensualités des prêts actifs / revenus du cycle', () => {
    const data = {
      prets: [{ ...loan, assurance: 0 }],
      bancaire: [{ id: 1, type: 'Salaire', sens: 'credit', montant: 500000, date: '2026-07-01', agence: 'X' }],
    };
    const d = getDebtSummary(data, new Date('2026-07-20T12:00:00'));
    expect(d.actifs).toBe(1);
    expect(Math.round(d.mensualites)).toBe(111021);
    expect(d.ratio).toBeCloseTo(111021 / 500000, 3);
  });
});

describe('Rythme appris de l\'historique et plan anti-dépassement', () => {
  // Cycle courant : salaire le 1er juillet ; aujourd'hui = 16 juillet (jour 16/30)
  const now = new Date('2026-07-16T12:00:00');
  const bancaire = [
    { id: 1, type: 'Salaire', sens: 'credit', montant: 600000, date: '2026-05-02', agence: 'X' },
    { id: 2, type: 'Salaire', sens: 'credit', montant: 600000, date: '2026-06-01', agence: 'X' },
    { id: 3, type: 'Salaire', sens: 'credit', montant: 600000, date: '2026-07-01', agence: 'X' },
  ];
  const d = (id, cat, montant, date) => ({ id, label: cat + id, montant, date, categorie: cat });
  const depenses = [
    d(1, 'Loyer', 100000, '2026-05-02'), d(2, 'Alimentation', 20000, '2026-05-10'), d(3, 'Alimentation', 40000, '2026-05-25'),   // cycle -2
    d(4, 'Loyer', 100000, '2026-06-01'), d(5, 'Alimentation', 20000, '2026-06-05'), d(6, 'Alimentation', 40000, '2026-06-20'),   // cycle -1
    d(7, 'Loyer', 100000, '2026-07-01'), d(8, 'Alimentation', 25000, '2026-07-05'),                                              // cycle courant
  ];
  const data = { bancaire, depenses };

  test('à ce stade du cycle, l\'habitude est apprise par catégorie (20 000 en Alimentation)', () => {
    const p = getCategoryPace(data, now);
    expect(p.Alimentation.learned).toBe(true);
    expect(p.Alimentation.nCycles).toBe(2);
    expect(p.Alimentation.habitualToDate).toBe(20000);
    expect(p.Alimentation.habitualFull).toBe(60000);
  });

  test('projection apprise = déjà dépensé + reste habituel (25 000 + 40 000), pas une extrapolation linéaire', () => {
    const p = getCategoryPace(data, now);
    expect(p.Alimentation.projected).toBe(65000);
    expect(25000 / (16 / 30)).toBeCloseTo(46875, 0);        // la linéaire sous-estimerait : 46 875
  });

  test('une charge payée en début de cycle n\'est pas sur-projetée (Loyer reste 100 000, pas 187 500)', () => {
    expect(getCategoryPace(data, now).Loyer.projected).toBe(100000);
  });

  test('sans historique : repli sur l\'extrapolation linéaire', () => {
    const p = getCategoryPace(data, now, { cycleOnly: true });
    expect(p.Alimentation.learned).toBe(false);
    expect(p.Alimentation.projected).toBeCloseTo(46875, 0);
  });

  test('budget : dépassement prévu détecté AVANT qu\'il arrive, avec le reste par jour', () => {
    const [b] = evaluateBudgets({ ...data, budgets: { Alimentation: { max: 62000 } } }, now);
    expect(b.status).toBe('pace');
    expect(b.learned).toBe(true);
    expect(b.overrun).toBe(3000);                            // 65 000 projetés − 62 000 de plafond
    expect(b.daysLeft).toBe(14);
    expect(b.perDay).toBeCloseTo((62000 - 25000) / 14, 2);   // ≈ 2 643 F/jour pour tenir le plafond
    expect(b.message).toContain('dépassement prévu');
  });

  test('budget : une charge fixe sous son plafond reste « ok » (pas de fausse alerte)', () => {
    const [b] = evaluateBudgets({ ...data, budgets: { Loyer: { max: 150000 } } }, now);
    expect(b.status).toBe('ok');          // 100 000 / 150 000 = 67 % : sous le seuil, et pas sur-projeté (187 500) par l'extrapolation
  });

  test('résumé IA (historique) : cycles précédents agrégés, rythme habituel, projection et plan budgétaire', () => {
    const full = analyzeSpending(data, now);
    const budgets = evaluateBudgets({ ...data, budgets: { Alimentation: { max: 62000 } } }, now);
    const s = buildAiSummary(full, { scope: 'history', budgets });
    expect(s.historique.length).toBe(2);
    expect(s.historique[0].par_categorie.Alimentation).toBe(60000);
    const ali = s.categories.find(c => c.categorie === 'Alimentation');
    expect(ali.habituel_a_ce_stade).toBe(20000);
    expect(ali.projection_fin_cycle).toBe(65000);
    expect(s.cycle.jours_restants).toBe(14);
    expect(s.budgets[0]).toEqual({ categorie: 'Alimentation', plafond: 62000, minimum: null, depense: 25000, reste: 37000,
      statut: 'pace', par_jour_restant: 2643, projection_fin_cycle: 65000, depassement_prevu: 3000 });
  });

  test('résumé IA (cycle seul) : plan budgétaire conservé mais aucun historique ni projection apprise', () => {
    const only = analyzeSpending(data, now, { cycleOnly: true });
    const budgets = evaluateBudgets({ ...data, budgets: { Alimentation: { max: 62000 } } }, now, { cycleOnly: true });
    const s = buildAiSummary(only, { scope: 'cycle', budgets });
    expect(s.historique).toBe(undefined);
    expect(s.moyenne_cycles_precedents).toBe(undefined);
    expect(s.categories.every(c => c.habituel_a_ce_stade === undefined)).toBe(true);
    expect(s.budgets[0].plafond).toBe(62000);
  });

  test('aucun montant d\'opération ni date de transaction dans le résumé d\'historique', () => {
    const json = JSON.stringify(buildAiSummary(analyzeSpending(data, now), { scope: 'history' }));
    expect(json).not.toContain('2026-05-10');
    expect(json).not.toContain('"id"');
    expect(json).not.toContain('Alimentation5');             // pas de libellé d'opération
  });
});
