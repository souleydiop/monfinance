# Proxy « Conseiller IA » de MonFinance

Petit serveur (Cloudflare Worker, gratuit) qui garde ta **clé Anthropic secrète** et appelle Claude
à la place de l'app. L'app n'envoie qu'un **résumé chiffré** du cycle, jamais l'historique brut.

Protections : origine verrouillée sur ton site, code d'accès personnel, limite de 30 demandes/jour,
taille des requêtes plafonnée, aucune erreur détaillée renvoyée au navigateur.

## Déploiement (≈ 10 min)

Prérequis : un compte Cloudflare gratuit, Node.js, et une clé API Anthropic
(console.anthropic.com → API keys). **Fixe aussi une limite de dépense mensuelle** dans la console
Anthropic (Settings → Limits) : c'est ta vraie protection si le code d'accès fuitait.

```bash
cd worker
npx wrangler login

# 1) Compteur quotidien (recommandé) : copie l'id affiché dans wrangler.toml
#    puis décommente le bloc [[kv_namespaces]]
npx wrangler kv namespace create RATE

# 2) Secrets (saisis la valeur quand c'est demandé)
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ACCESS_CODE        # choisis un code long, ex. 16+ caractères

# 3) Déployer
npx wrangler deploy
```

Wrangler affiche l'adresse du proxy : `https://monfinance-advisor.<ton-compte>.workers.dev`.

## Brancher l'app

Dans MonFinance → onglet **Trends** → carte « Analyse intelligente » → **⚙️ Réglages** :
colle l'adresse du proxy et ton code d'accès. Puis **🤖 Demander conseil à Claude**
(un écran de consentement s'affiche la première fois).

## Réglages utiles (`wrangler.toml`)

| Variable | Rôle |
|---|---|
| `ALLOWED_ORIGIN` | Sites autorisés (séparés par des virgules) |
| `MODEL` | Modèle Claude utilisé |
| `DAILY_LIMIT` | Demandes max par jour (nécessite le KV `RATE`) |
| `EFFORT` | Effort de réflexion : `low` (défaut), `medium`, `high`… |
| `MAX_TOKENS` | Plafond de la réponse, réflexion incluse (défaut 4096) |

Changer de code d'accès : `npx wrangler secret put ACCESS_CODE`, puis le ressaisir dans les Réglages de l'app.
