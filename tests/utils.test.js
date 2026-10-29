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

describe('buildAiSummary (résumé envoyé à l\'IA)', () => {
  const now = new Date('2026-07-30T12:00:00');
  const bancaire = [
    { id: 1, type: 'Salaire', sens: 'credit', montant: 650000, date: '2026-06-01', agence: 'CBAO Dakar' },
    { id: 2, type: 'Salaire', sens: 'credit', montant: 650000, date: '2026-07-01', agence: 'CBAO Dakar' },
  ];
  const depenses = [
    { id: 1, label: 'resto midi', montant: 10000, date: '2026-06-05', categorie: 'Resto' },
    { id: 2, label: 'resto', montant: 25000, date: '2026-07-05', categorie: 'Resto' },
    { id: 3, label: 'Courses', montant: 30000, date: '2026-06-10', categorie: 'Alimentation' },
  ];

  test('contient les agrégats du cycle', () => {
    const s = buildAiSummary(analyzeSpending({ bancaire, depenses }, now));
    expect(s.devise).toBe('FCFA');
    expect(s.depenses_cycle).toBe(25000);
    expect(s.revenu_cycle).toBe(650000);
    expect(s.cycle.debut).toBe('2026-07-01');
  });

  test('ne contient ni historique brut, ni agence, ni identifiant, ni date de transaction', () => {
    const json = JSON.stringify(buildAiSummary(analyzeSpending({ bancaire, depenses }, now)));
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
