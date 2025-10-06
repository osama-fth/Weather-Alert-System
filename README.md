# Weather Alert System ☁️⚠️

<p align="center">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white" />
  <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white" />
  <img alt="Flask" src="https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white" />
  <img alt="Redis" src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white" />
  <img alt="Kubernetes" src="https://img.shields.io/badge/Kubernetes-326CE5?logo=kubernetes&logoColor=white" />
  <img alt="Bootstrap" src="https://img.shields.io/badge/Bootstrap-7952B3?logo=bootstrap&logoColor=white" />
  <img alt="Open‑Meteo API" src="https://img.shields.io/badge/Open%E2%80%91Meteo%20API-0EA5E9?logo=cloudflare&logoColor=white" />
</p>

Sistema di allerta meteo composto da quattro microservizi:
- 🌦️ weather-fetcher: recupera i dati meteo (Open‑Meteo), applica filtri e invia alert all’Alert Manager
- 🧭 alert-manager: gestisce e indicizza gli alert su Redis, espone API per la dashboard
- 🗄️ redis: database in‑memory per la memorizzazione temporanea degli alert
- 🖥️ dashboard: interfaccia web che attiva fetch periodici e mostra gli alert per regione in tempo reale

🗂️ Repository e file principali:
- Docker Compose: [docker-compose.yaml](docker-compose.yaml)
- Kubernetes: [k8s/deployments.yaml](k8s/deployments.yaml), [k8s/services.yaml](k8s/services.yaml)
- Servizi:
  - Weather Fetcher: [weather-fetcher/src/main.py](weather-fetcher/src/main.py)
  - Alert Manager: [alert-manager/src/alert-manager.js](alert-manager/src/alert-manager.js)
  - Dashboard: [dashboard/server.js](dashboard/server.js), [dashboard/public/index.html](dashboard/public/index.html)

## Architettura 🏗️

🔄 Flusso principale:
1) La dashboard (utente) seleziona una regione e ogni N secondi invia una richiesta a weather-fetcher (via proxy interno).
2) weather-fetcher interroga Open‑Meteo con coordinate regionali e applica filtri/threshold.
3) Gli alert rilevati vengono inviati ad alert-manager.
4) alert-manager salva e indicizza su Redis (retention configurabile).
5) La dashboard legge gli alert della regione selezionata da alert-manager e li visualizza.

🔌 Comunicazioni:
- Dashboard → Weather Fetcher: HTTP interno (rete Docker/K8s)
- Weather Fetcher → Alert Manager: HTTP interno
- Alert Manager → Redis: TCP interno
- Dashboard (browser) → Dashboard (server): HTTP pubblico (porta esposta)

## Prerequisiti 🧰

- Docker Desktop
- Docker Compose v2
- Per Kubernetes:
  - Minikube
  - kubectl

Verifica strumenti:
```bash
docker --version
docker compose version
minikube version
kubectl version --client
```

---

## Esecuzione con Docker Compose 🐳

1) Avvio:
```bash
docker compose up --build
# http://localhost:3000
```

Le impostazioni di default sono già definite in [docker-compose.yaml](docker-compose.yaml). Non è necessario esporre alert-manager o weather-fetcher all’host: la dashboard li contatta via rete interna.

2) Comandi utili:
- Log:
```bash
docker compose logs -f
```
- Stop e cleanup:
```bash
docker compose down -v
```

---

## Deploy su Kubernetes con Minikube ☸️

I manifest sono in:
- Deployments: [k8s/deployments.yaml](k8s/deployments.yaml)
- Services: [k8s/services.yaml](k8s/services.yaml)

Nota immagini: i Deployment puntano a immagini locali (alert-manager:latest, weather-fetcher:latest, dashboard:latest) con imagePullPolicy: Never. Carica prima le immagini in Minikube.

1) Avvia Minikube:
```bash
minikube start --driver=docker
```

2) Build immagini locali (dal root del progetto):
```bash
docker build -t weather-fetcher:latest ./weather-fetcher
docker build -t alert-manager:latest ./alert-manager
docker build -t dashboard:latest ./dashboard
```

3) Copia le immagini nel cluster Minikube:
```bash
minikube image load alert-manager:latest
minikube image load weather-fetcher:latest
minikube image load dashboard:latest
```

4) Applica i manifest:
```bash
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/services.yaml
```

5) Verifica stato:
```bash
kubectl get pods
kubectl get svc
```

6) Accedi alla dashboard:
```bash
minikube service dashboard --url
# Apri l'URL restituito (es. http://127.0.0.1:xxxxx)
```

7) Cleanup:
```bash
kubectl delete -f k8s/services.yaml
kubectl delete -f k8s/deployments.yaml
# oppure distruggi il cluster
minikube delete
```

---
