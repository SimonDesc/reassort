# Réassort

> README en cours de rédaction : le besoin métier, la démo et les choix techniques arrivent avec les lots suivants.

## Lancer en local

Prérequis : Java 21+ et Node 24. Aucune base à installer : PostgreSQL est embarqué en local et dans les tests.

```bash
cd backend && ./mvnw spring-boot:test-run
```

```bash
cd frontend && npm install && npm run dev
```

Le front est sur http://localhost:5173, l'API sur http://localhost:8080.
