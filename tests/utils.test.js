const {
  migrateCategorie,
  getCatColor,
  getGrpForCat,
  isCurrentMonth,
  getSalaryPeriod,
  isInSalaryPeriod,
  fmtPeriodLabel,
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

describe('isValidDriveBackup', () => {
  test('valide si la sauvegarde contient un tableau bancaire', () => {
    expect(isValidDriveBackup({ bancaire: [], depenses: [] })).toBe(true);
    expect(isValidDriveBackup({ bancaire: [{ id: 1 }] })).toBe(true);
  });
  test('invalide si bancaire est absent, non-tableau, ou si data est vide/null', () => {
    expect(isValidDriveBackup({})).toBe(false);
    expect(isValidDriveBackup({ bancaire: 'oops' })).toBe(false);
    expect(isValidDriveBackup(null)).toBe(false);
    expect(isValidDriveBackup(undefined)).toBe(false);
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
