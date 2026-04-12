# Plano de Migracao: Railway → AWS Sao Paulo (sa-east-1)

**Objetivo**: Migrar o Anonimizador LGPD para AWS na regiao sa-east-1 (Sao Paulo)
sem downtime, mantendo conformidade com LGPD (dados em territorio brasileiro).

**Data de elaboracao**: 2026-04-12

---

## 1. Arquitetura alvo na AWS

```
                    Route 53 (DNS)
                         |
                    CloudFront (CDN)
                    /           \
              S3 Bucket       ALB (Application Load Balancer)
              (frontend)        |
                           ECS Fargate (backend)
                           /        \
                      RDS PostgreSQL   ElastiCache (sessoes futuras)
                      (sa-east-1a/b)
```

### Servicos utilizados

| Componente | Railway atual | AWS alvo |
|---|---|---|
| Frontend | Railway (serve -s build) | S3 + CloudFront |
| Backend | Railway (Node.js) | ECS Fargate (container) |
| Banco de dados | Railway PostgreSQL | RDS PostgreSQL (Multi-AZ) |
| DNS | Railway subdomain | Route 53 |
| SSL | Railway automatico | ACM (AWS Certificate Manager) |
| Secrets | Railway env vars | AWS Secrets Manager |
| Logs | Railway logs | CloudWatch Logs |
| CI/CD | Railway auto-deploy | GitHub Actions → ECR → ECS |

---

## 2. Pre-requisitos

- [ ] Conta AWS com billing ativo
- [ ] AWS CLI configurado (`aws configure --region sa-east-1`)
- [ ] Dominio registrado (anonimizadorlgpd.com) com acesso ao DNS
- [ ] Docker instalado localmente para build de imagens
- [ ] Acesso ao banco Railway para export

---

## 3. Fase 1 — Preparar infraestrutura AWS (Dia 1-2)

### 3.1 VPC e rede
```bash
# Criar VPC dedicada com subnets publicas e privadas
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region sa-east-1
# Subnets privadas: 10.0.1.0/24 (sa-east-1a), 10.0.2.0/24 (sa-east-1b)
# Subnets publicas: 10.0.101.0/24 (sa-east-1a), 10.0.102.0/24 (sa-east-1b)
```

Recomendacao: usar Terraform ou CloudFormation para reproducibilidade.

### 3.2 RDS PostgreSQL
```bash
aws rds create-db-instance \
  --db-instance-identifier anonimizador-lgpd-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16 \
  --master-username anonimizador \
  --master-user-password <gerar-senha-forte> \
  --allocated-storage 20 \
  --storage-type gp3 \
  --multi-az \
  --vpc-security-group-ids <sg-id> \
  --db-subnet-group-name anonimizador-private \
  --backup-retention-period 7 \
  --storage-encrypted \
  --region sa-east-1
```

**Importante**:
- Multi-AZ para alta disponibilidade
- Encryption at rest habilitado (KMS)
- Backups automaticos: 7 dias
- Subnet privada (sem acesso publico)

### 3.3 ECR (Container Registry)
```bash
aws ecr create-repository --repository-name anonimizador-lgpd-backend --region sa-east-1
```

### 3.4 ECS Fargate (Cluster + Service)
```bash
aws ecs create-cluster --cluster-name anonimizador-lgpd --region sa-east-1
```

Task definition: 512 CPU, 1024 MB memoria (ajustar conforme carga).

### 3.5 S3 + CloudFront (Frontend)
```bash
aws s3 mb s3://anonimizador-lgpd-frontend --region sa-east-1
aws s3 website s3://anonimizador-lgpd-frontend --index-document index.html --error-document index.html
```

CloudFront distribution apontando para o bucket S3 com OAC (Origin Access Control).

### 3.6 Secrets Manager
```bash
aws secretsmanager create-secret \
  --name anonimizador-lgpd/production \
  --secret-string '{"DATABASE_URL":"...","JWT_SECRET":"...","ANTHROPIC_API_KEY":"..."}' \
  --region sa-east-1
```

---

## 4. Fase 2 — Containerizar backend (Dia 2)

### 4.1 Dockerfile
```dockerfile
FROM node:20-slim

# Deps para canvas (OCR)
RUN apt-get update && apt-get install -y \
    build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src

EXPOSE 3001
CMD ["node", "src/server.js"]
```

### 4.2 Build e push para ECR
```bash
docker build -t anonimizador-lgpd-backend ./backend
docker tag anonimizador-lgpd-backend:latest <account-id>.dkr.ecr.sa-east-1.amazonaws.com/anonimizador-lgpd-backend:latest
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.sa-east-1.amazonaws.com
docker push <account-id>.dkr.ecr.sa-east-1.amazonaws.com/anonimizador-lgpd-backend:latest
```

---

## 5. Fase 3 — Migrar dados (Dia 3)

### 5.1 Export do banco Railway
```bash
# Obter connection string do Railway
pg_dump -Fc --no-owner --no-privileges \
  -h maglev.proxy.rlwy.net -p 38018 -U postgres ferrovia \
  > backup_railway.dump
```

### 5.2 Import no RDS
```bash
pg_restore -h anonimizador-lgpd-db.xxxxx.sa-east-1.rds.amazonaws.com \
  -U anonimizador -d anonimizador --no-owner --no-privileges \
  backup_railway.dump
```

### 5.3 Verificar dados
```bash
psql -h <rds-endpoint> -U anonimizador -d anonimizador \
  -c "SELECT count(*) FROM \"Organizacao\"; SELECT count(*) FROM \"Usuario\"; SELECT count(*) FROM \"Documento\";"
```

---

## 6. Fase 4 — Deploy sem downtime (Dia 3-4)

### Estrategia: Blue-Green via DNS

1. **Backend AWS rodando** com banco RDS (dados migrados)
2. **Frontend no S3/CloudFront** com `REACT_APP_API_URL` apontando para o ALB AWS
3. **Testar em URL temporaria** (ALB direto ou subdominio staging)
4. **Validar funcionalidades**:
   - [ ] Login de camara
   - [ ] Login de admin
   - [ ] Upload e anonimizacao de PDF (texto normal)
   - [ ] Upload e anonimizacao de PDF (escaneado/OCR)
   - [ ] Upload de DOCX e texto puro
   - [ ] Listagem de documentos
   - [ ] Painel admin: CRUD de organizacoes e usuarios
   - [ ] Toggle de modulos
   - [ ] Perfil da organizacao

5. **Migrar DNS** (Route 53):
   - Reduzir TTL para 60s (24h antes da migracao)
   - Apontar `anonimizadorlgpd.com` para CloudFront
   - Apontar `api.anonimizadorlgpd.com` para ALB
   - Aguardar propagacao DNS (~5 min com TTL 60s)

6. **Sync final do banco** (se houver gap):
   ```bash
   # Export incremental dos dados criados durante a migracao
   pg_dump -Fc --no-owner -h maglev.proxy.rlwy.net -p 38018 \
     -t '"Documento"' -t '"LogAuditoria"' \
     --data-only ferrovia > incremental.dump
   pg_restore -h <rds-endpoint> -U anonimizador -d anonimizador \
     --data-only incremental.dump
   ```

7. **Desligar Railway** apos confirmar que AWS esta operacional

---

## 7. Fase 5 — Pos-migracao (Dia 4-5)

### 7.1 CI/CD com GitHub Actions
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: sa-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - run: |
          docker build -t backend ./backend
          docker tag backend:latest $ECR_URI:latest
          docker push $ECR_URI:latest
      - run: aws ecs update-service --cluster anonimizador-lgpd --service backend --force-new-deployment

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd frontend && npm ci && npm run build
        env:
          REACT_APP_API_URL: https://api.anonimizadorlgpd.com
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: sa-east-1
      - run: aws s3 sync frontend/build s3://anonimizador-lgpd-frontend --delete
      - run: aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths "/*"
```

### 7.2 Monitoramento
- CloudWatch Alarms: CPU > 80%, memoria > 80%, 5xx > 5/min
- CloudWatch Logs: centralizar logs do ECS
- RDS Performance Insights: monitorar queries lentas
- Billing Alert: alerta se custo mensal > R$ 500

### 7.3 Backup e DR
- RDS: snapshots automaticos diarios (retencao 7 dias)
- RDS: replica de leitura em sa-east-1b (opcional, para escala)
- S3: versionamento habilitado no bucket do frontend
- Export semanal para S3 Glacier (retencao 90 dias)

---

## 8. Estimativa de custo mensal (AWS sa-east-1)

| Servico | Spec | Custo estimado/mes |
|---|---|---|
| ECS Fargate | 0.5 vCPU, 1 GB, 24/7 | ~US$ 35 |
| RDS PostgreSQL | db.t3.micro, Multi-AZ, 20 GB | ~US$ 30 |
| S3 | < 1 GB frontend | ~US$ 1 |
| CloudFront | < 10 GB transfer | ~US$ 2 |
| Route 53 | 1 hosted zone | ~US$ 0.50 |
| Secrets Manager | 3 secrets | ~US$ 1.20 |
| CloudWatch | Logs + metricas basicas | ~US$ 5 |
| **Total estimado** | | **~US$ 75/mes** |

Nota: custos de sa-east-1 sao ~15-20% maiores que us-east-1.
Para comparacao, Railway atualmente custa ~US$ 20/mes (2 servicos + DB).

---

## 9. Checklist de seguranca pos-migracao

- [ ] RDS em subnet privada (sem acesso publico)
- [ ] Security groups: backend so aceita trafego do ALB
- [ ] HTTPS obrigatorio em ALB e CloudFront
- [ ] Secrets em Secrets Manager (nao em env vars do ECS)
- [ ] IAM roles com principio do menor privilegio
- [ ] Logs de acesso do ALB habilitados
- [ ] VPC Flow Logs habilitados
- [ ] Encryption at rest em RDS e S3
- [ ] WAF no CloudFront (opcional, contra bots/DDoS)

---

## 10. Rollback

Se algo falhar durante a migracao:
1. Reverter DNS para Railway (TTL 60s = propagacao rapida)
2. Railway continua rodando ate DNS propagar
3. Investigar problema na AWS
4. Nao desligar Railway ate 48h apos migracao bem-sucedida

---

## 11. Timeline resumida

| Dia | Acao |
|---|---|
| D-1 | Reduzir TTL DNS para 60s |
| D+0 | Criar infraestrutura AWS (VPC, RDS, ECS, S3, CloudFront) |
| D+1 | Containerizar backend, testar localmente |
| D+2 | Migrar dados, deploy em staging AWS, validar |
| D+3 | Migrar DNS, sync final, validar em producao |
| D+4 | Monitorar, configurar CI/CD, desligar Railway |
