# Learn cloud-native by building Teeny-URL (LocalStack Student plan)

A step-by-step path to cloud-native skills: containers, Kubernetes, infrastructure as code, observability, GitOps, security and resilience. Teeny-URL is the vehicle, and the LocalStack Student plan is a free, safe cloud to practise on.

**Last updated:** 2026-10-31 · **Current stage:** 0 (in progress)

---

## Goal and scope

**The goal is cloud-native skills, not AWS certification.** AWS appears because LocalStack emulates the AWS API. Most of what you learn here is not AWS-specific: Kubernetes, Terraform, OpenTelemetry, GitOps and supply-chain security work on any cloud.

"Cloud-native" here means a system that is: containerized, defined declaratively, orchestrated, observable, delivered by automation, resilient and secure by default. Each stage below builds one of those properties into Teeny-URL.

**Principles**
- Use LocalStack where it gives you something you can't get otherwise: a cloud API, IAM enforcement, the EKS API, fault injection, state snapshots.
- Use plain local tools (Docker, k3d, Helm, Terraform, Prometheus…) everywhere else.
- Whenever something is AWS-specific, say so. The portable concept matters more than the AWS service name.

### Student plan benefit map

What the plan includes, from LocalStack's licensing page (as of March 2026) and sign-up page, plus what was checked live on 2026-10-31.

| Benefit | What it gives you | Stage |
|---|---|---|
| Full AWS emulator service list | Verified on your instance: EKS, ECS, ECR, Lambda, FIS, RDS, DynamoDB, Step Functions and SQS all answer | all |
| **EKS** | Real Kubernetes (k3d/k3s clusters in Docker) behind the EKS API | 5 |
| **ECS** | A second container orchestrator to compare with Kubernetes | 5 (optional) |
| **IAM policy enforcement** (`ENFORCE_IAM`) | Real `AccessDenied` errors, not just policy syntax | 1, 9 |
| **Chaos Engineering / FIS** | Inject faults and latency into emulated AWS services | 10 |
| **Cloud Pods / snapshots** (500 MB on the Student plan) | Save and restore the whole lab: `lstk snapshot save` / `load` | 3, 10, capstone |
| Persistence | State survives restarts (`PERSISTENCE`) | 0 on |
| CI integration, 1,000 CI/CD credits per month (sign-up page) | LocalStack inside GitHub Actions | 8 |
| Stack Insights, Extensions | Included; look at them when you have real workloads | 7 |

**Not on your plan (per the same pages):** Ephemeral Instances (cloud sandboxes). The Azure emulator is in public preview and, as far as LocalStack's pages say, students get the AWS emulator only. Because most of this roadmap is cloud-agnostic, that costs you little.

Student access lasts while your GitHub Education verification is active. LocalStack's pages don't say what happens if it lapses, so keep notes and infrastructure code in git. Check <https://education.github.com/pack> for other Student Pack credits that might help with the capstone; offers change, so don't plan around them.

---

## How to use this file

**For you.** Ask things like:
- "Start stage 4." / "What's next?"
- "I'm stuck on stage 4: my pods are in CrashLoopBackOff."
- "Explain readiness vs liveness probes."
- "Review my stage 3 work. Am I done?"

**For Claude (read this first in any session about cloud, containers, Kubernetes, Terraform, observability, GitOps or LocalStack):**
1. Read this whole file, then the [Progress](#progress) table and the [Session log](#session-log) to see where the user is.
2. Re-check the environment before acting: `command -v lstk aws docker terraform kubectl k3d helm` and `lstk status`. The CLI is `lstk`; the older `localstack`, `awslocal`, `tflocal`, `cdklocal` and `samlocal` commands are deprecated.
3. Teach in **coach mode** by default: explain the concept, let the user predict, give hints before answers, and have the user type the key commands. Switch to "just do it" only when the user asks.
4. Work on a branch named `learn/stage-N-<topic>`. `pnpm typecheck && pnpm lint && pnpm test` must stay green (the v1 suite has 161 tests). Application code changes go through the project's sub-agents (see `CLAUDE.md`).
5. A stage is finished only when its [definition of done](#definition-of-done-for-every-stage) is met. Then update the Progress table and add a Session log row.
6. Do not skip ahead. Never run anything against a real cloud or a non-local cluster outside the [capstone](#capstone--platform-day).
7. Commit only when the user asks. Never commit tokens, credentials, kubeconfigs or Terraform state.

---

## Learner and environment snapshot (2026-10-31)

| Item | Value |
|---|---|
| Background | TypeScript/Node developer; knows Express, Postgres and Docker basics; new to cloud; GitHub Student Developer Pack holder |
| Machine | Linux, Docker 29.8, 16 CPUs, 15 GB RAM (about 7 GB free at last check), Node 24.14, pnpm 12.5. LocalStack plus a Kubernetes cluster plus Prometheus gets tight: stop unrelated containers (`dichi-*`) while labs run. |
| Installed | `lstk` 1.4.3 (Homebrew), AWS CLI 2.39 (Homebrew), Terraform (`/usr/bin`), Docker, the old `localstack` CLI (deprecated; can stay) |
| Not installed yet | `kubectl`, `k3d` (or `kind`), `helm`, `kustomize`, Argo CD CLI, `trivy`, `syft`, `cosign`, `k6`. Install each when its stage starts. `lstk terraform`, `lstk cdk` and `lstk sam` only wrap the real tools. |
| LocalStack | Running (container `localstack-aws`, version 2026.10.4), plan label "LocalStack Student", no resources yet. It was started with the global default config, so **persistence is not on yet**: stage 0 step 3 fixes that. |
| Authentication | Done with `lstk login`. `lstk` reads `LOCALSTACK_AUTH_TOKEN` first, then its stored login. It does not read `.env` files or the old `~/.localstack/auth.json`. The token is secret: never commit it and never paste it into a chat. |
| Docker pull gotcha | `~/.docker/config.json` sets `credsStore: desktop`, but that helper isn't on PATH, so `docker pull` fails. Workaround that leaves your config alone: `DOCKER_CONFIG=<dir containing a config.json with {}> docker pull <image>`. Not needed so far, because the LocalStack image is cached. |
| Ports used by other projects | 5432 (`dichi-postgres`), 6379 (`dichi-redis`), 9000–9001 (`dichi-minio`), 5434 (`postgres-ss`). LocalStack's gateway is **4566**. |
| Port conflict to remember | Teeny-URL's compose binds `127.0.0.1:5432`, so it can't start while `dichi-postgres` is running. Stop one of them, or change `POSTGRES_PORT` in `.env`. |

### The app being migrated

Teeny-URL v1 is on `main`: Express 5 + TypeScript (run natively by Node 24), PostgreSQL 17 + Drizzle, zod contracts, OpenAPI docs at `/docs`. See `README.md` and `CLAUDE.md`.

### Cloud-native readiness audit (what the stages will fix)

| Principle | Teeny-URL today | Fixed in |
|---|---|---|
| Config in the environment | Yes: `DATABASE_URL`, `PORT`, `BASE_URL`… validated by zod in `src/env.ts` | already good |
| Logs as an event stream | Yes: pino writes JSON to stdout (pretty only in development) | already good |
| Backing services as attached resources | Yes: the database is just `DATABASE_URL` | already good |
| Disposability | Mostly: `SIGTERM` closes the server and the DB pool, with a 10 s hard exit. Not yet checked against a rolling update. | 4 |
| One artifact to build, release and run | **No image yet** | 2 |
| Health checks | **Partial:** one `/health` that checks the DB. As a liveness probe, a DB outage would restart every pod. It needs separate `/livez` and `/readyz`. | 2 |
| Stateless processes | **No:** the rate limiter keeps counters in memory, so each replica has its own limit | 4 (and a design decision) |
| Real client IP behind a proxy | **No:** `trust proxy` is not set, so behind an ingress all clients share one rate-limit bucket | 4 |
| Admin processes (migrations, key CLI) | Run by hand with `pnpm`. In a cluster they need a Job or init container. | 4 |
| Hot path stays fast | **No:** clicks are written inside the redirect transaction, which serializes on one row for a viral link | 6 |

### Open decisions

| Decision | Options | Needed by | Recommendation |
|---|---|---|---|
| IaC tool | Terraform (`lstk terraform`) or CDK | Stage 3 | **Terraform.** It is already installed, and its skill transfers across clouds. Tell me if you'd rather use CDK. |
| LocalStack run mode | `lstk` with a project config, or compose | Stage 0 | **`lstk` with `.lstk/config.toml`** (decided). |
| Persistence / IAM enforcement | on / off | Stages 0 / 1 | **On** for both: `PERSISTENCE = "1"` now, `ENFORCE_IAM = "1"` from stage 1. |
| Local Kubernetes | k3d or kind | Stage 4 | **k3d:** the same engine LocalStack's EKS uses, lightweight, ingress built in. kind is the upstream-like alternative. **Undecided: ask the user.** |
| GitOps tool | Argo CD or Flux | Stage 8 | **Argo CD:** its UI makes the reconciliation loop visible. **Undecided.** |
| Observability stack | OpenTelemetry + Prometheus + Grafana | Stage 7 | **Decided:** all three are open standards or CNCF projects and portable. |

---

## Progress

"Core" stages are the essential cloud-native path. "Deepening" stages add breadth; do them after the core, in any order.

| Stage | Topic | Track | Status | Started | Finished | Notes |
|---|---|---|---|---|---|---|
| 0 | Setup and the mental model | Core | in progress | 2026-10-29 | | LocalStack running, plan recognized. Left: project config with persistence, your own bucket |
| 1 | Cloud primitives: IAM and object storage | Core | not started | | | |
| 2 | Containers and 12-factor | Core | not started | | | |
| 3 | Infrastructure as code (Terraform) | Core | not started | | | |
| 4 | Kubernetes fundamentals (local cluster) | Core | not started | | | |
| 5 | Kubernetes on EKS (LocalStack) | Core | not started | | | |
| 6 | Serverless and event-driven | Deepening | not started | | | |
| 7 | Observability | Core | not started | | | |
| 8 | Delivery: CI/CD, GitOps, supply chain | Core | not started | | | |
| 9 | Security and policy | Deepening | not started | | | |
| 10 | Resilience and chaos | Deepening | not started | | | |
| C | Capstone: platform day | Deepening | not started | | | |

Rough time per stage: 0 → 1–2 h · 1 → 3–4 h · 2 → 4–6 h · 3 → 5–8 h · 4 → 6–10 h · 5 → 6–10 h · 6 → 8–12 h · 7 → 6–10 h · 8 → 6–10 h · 9 → 5–8 h · 10 → 4–6 h · capstone → 4–8 h. That is roughly 60–90 hours in total, and the core alone is about half. Treat these as guides, not deadlines.

---

## The learning loop (every stage)

1. **Predict.** Write down what you expect to happen before you run anything. Notes go in `learning/notes/stage-N.md`.
2. **Do.** Build it, using the LocalStack web app (Resource Browser), `lstk aws`, `kubectl` or code.
3. **Break it.** Run the stage's break-it drills and read the errors carefully.
4. **Rebuild.** Delete everything and recreate it. From stage 3 on, this means from code.
5. **Explain.** Answer the checkpoint questions in your own words, without looking.

### Definition of done for every stage

- The exercise works end to end.
- You ran every break-it drill and wrote down what you saw.
- You answered the checkpoint questions in your own words.
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- From stage 3 on: destroying and re-applying everything works with one command.
- The Progress table and Session log are updated.

### Suggested layout (create as you go)

```
learning/ROADMAP.md      this file
learning/notes/          your notes per stage: predictions vs. what happened
Dockerfile               the app image (stage 2)
infra/                   Terraform (stage 3+)
deploy/                  Kubernetes manifests, Helm values, Kustomize overlays (stage 4+)
lambdas/                 function code (stage 6)
.lstk/config.toml        LocalStack config for this project (stage 0)
```

### Safety rules while learning

- Use `lstk aws`, `lstk terraform` and `lstk cdk`: they point the tool at LocalStack with dummy credentials, and `lstk aws` refuses to run when LocalStack is down instead of falling through to real AWS. For SDKs and the plain `aws` CLI, use the profile from `lstk setup aws` (`AWS_PROFILE=localstack`), which has the dummy `test` / `test` keys.
- **Check your Kubernetes context before every `kubectl`, `helm` or `terraform apply`:** `kubectl config current-context`. In these labs it must be a local k3d context or the LocalStack EKS context (`arn:aws:eks:us-east-1:000000000000:cluster/<name>`). Stop if it is anything else.
- Never put real cloud credentials in this project's environment until the capstone.
- LocalStack is an emulator. It is not proof that something works on a real cloud. See [what LocalStack won't teach you](#what-localstack-wont-teach-you).

---

## Stage 0 — Setup and the mental model

**Goal:** a running LocalStack you can talk to with `lstk`, and a clear picture of what it is.

**Learn:** AWS accounts, regions, endpoints and credentials. What LocalStack emulates: one container, a gateway on port 4566, a fake account `000000000000`, dummy credentials accepted. `lstk` is LocalStack's current CLI. It starts the emulator and wraps other tools (`lstk aws`, `lstk terraform`, `lstk cdk`, `lstk sam`) so they point at LocalStack automatically.

**Old to new commands** (the old ones are deprecated; the rest of this file uses the new ones):

| Old | New |
|---|---|
| `localstack start` / `localstack start -d` | `lstk start` (waits until ready; there is no daemon flag) |
| `localstack stop` | `lstk stop` |
| `localstack status` | `lstk status` (also lists deployed resources) |
| `localstack logs -f` | `lstk logs --follow` (and `--tail N`) |
| `localstack state reset` | `lstk reset` |
| `localstack auth set-token` | `lstk login`, or the `LOCALSTACK_AUTH_TOKEN` env var |
| `awslocal …` | `lstk aws …` |
| `tflocal …` | `lstk terraform …` (alias `lstk tf`) |
| `cdklocal …` | `lstk cdk …` |
| `samlocal …` | `lstk sam …` |

The `lstk aws|terraform|cdk|sam` commands are wrappers: the underlying tool must be installed separately, and all arguments pass through unchanged. A few things only the old `localstack` CLI still does (IAM Policy Stream, extension management, the AWS Replicator); we don't need them.

**Verification status (2026-10-31).** Verified on this machine: `lstk doctor` passes; `lstk aws` and `lstk status` fail cleanly while LocalStack is down; `lstk setup aws` output (in a throwaway home); a project-local `.lstk/config.toml` is picked up; and, on the running LocalStack, `lstk status`, `lstk logs --tail`, `lstk aws sts get-caller-identity`, a bucket create/list/delete round trip, read-only list calls for the services in the benefit map, and `lstk snapshot list`. **Not yet verified:** persistence across a restart with the project config, and the `DOCKER_CONFIG` prefix for `lstk start` (not needed so far). Update this paragraph when they are.

**Steps**
1. **Check prerequisites.** `lstk --version`, `aws --version`, `docker ps`, then `lstk doctor` (checks network, Docker, memory and disk).
2. **Sign in once.** `lstk login` opens a browser and stores the credential. Scripts and CI use `LOCALSTACK_AUTH_TOKEN` instead; the env var always wins. *(Done: the plan label reads "LocalStack Student".)*
3. **Add the project config.** Create `.lstk/config.toml` in the repo root. It contains no secrets, so it can be committed. `lstk` prefers it over the user-level file; `lstk config path` shows which file is in use.
   ```toml
   [[containers]]
   type = "aws"
   tag  = "latest"     # pin a version later (e.g. "2026.4") for reproducible runs
   port = "4566"
   env  = ["dev"]

   [env.dev]
   PERSISTENCE = "1"   # keep state across restarts; stage 1 adds ENFORCE_IAM = "1"
   ```
4. **(Re)start LocalStack.** `lstk restart` (or `lstk start` if it is stopped). If it fails while pulling the image, use the Docker workaround from the snapshot table: `DOCKER_CONFIG=<dir with an empty config.json> lstk start`.
5. **Look at it.** `lstk status`, then `lstk logs --tail 20`.
6. **Identity and a bucket.** `lstk aws sts get-caller-identity` (note the account ID and who you are), then `lstk aws s3 mb s3://hello` and `lstk aws s3 ls`. Find the same bucket in the LocalStack web app (Resource Browser).
7. **Meet your benefits.** List the empty resources for the services in the benefit map (for example `lstk aws eks list-clusters`, `lstk aws fis list-experiment-templates`) and note which ones you'll use in which stage.
8. **Optional now, needed in stage 1: an AWS profile for SDKs.** `lstk setup aws` writes a profile named `localstack` into `~/.aws` (in a throwaway home it created `config` and `credentials`, both `0600`, with dummy keys `test` / `test`, region `us-east-1`, and `http://localhost.localstack.cloud:4566` as the endpoint; the default profile is untouched). Use it with `AWS_PROFILE=localstack`.

**Break it**
- With LocalStack stopped, run `lstk aws s3 ls`. Verified: it prints "LocalStack AWS Emulator is not running" and exits with 1; it never reaches a real cloud.
- After step 6, run `lstk stop` and `lstk start`. Does the bucket survive? Remove `PERSISTENCE` from the config and repeat. Then try `lstk reset`.

**Checkpoint:** What does `lstk aws` do differently from plain `aws`? Where does the account ID come from, and who is "root" here? What happens to your data when the container restarts, with and without persistence? Why does `lstk` take the env var before the stored login, and what must never happen to the token?

**Done when:** you created a bucket yourself, `lstk status` shows it, persistence works across a restart, and you can list three differences between LocalStack and a real cloud.

---

## Stage 1 — Cloud primitives: IAM and object storage

**Goal:** understand identity and permissions, the foundation every cloud-native system sits on, and use object storage safely.

**Learn:** everything in a cloud is an authenticated API call. IAM users, roles and policies; principal / action / resource / condition; identity-based vs resource-based policies; explicit deny beats allow. S3 buckets and keys, versioning, lifecycle rules, bucket policies, block-public-access, presigned URLs.

**Exercise:** add "export click stats as CSV". The API writes the file to a bucket (for example `teeny-url-exports`) and returns a presigned GET URL that expires in 15 minutes.
- Turn on IAM enforcement first: add `ENFORCE_IAM = "1"` to the `[env.dev]` profile, then `lstk restart`.
- Use the AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`). Point the client at LocalStack and set `forcePathStyle: true`.
- Create an IAM user whose policy allows only `s3:PutObject` and `s3:GetObject` on one prefix, and run the exporter as that user.

**Break it**
- Remove the permission and read the `AccessDenied`.
- Make the presigned URL expire after 5 seconds and try it with `curl` before and after.
- Try making an object public, then block public access.

**Checkpoint:** Identity policy vs resource policy: when do you need each? Why does a presigned URL work without the caller having credentials? Why is an explicit `Deny` stronger than any `Allow`?

**Done when:** the exporter works as the restricted user, and you can explain each statement in its policy.

**Gap:** LocalStack's IAM enforcement is an emulation. Verify tricky policies on a real cloud in the capstone.

---

## Stage 2 — Containers and 12-factor

**Goal:** package Teeny-URL as a production-grade image and make it behave properly on a container platform.

**Learn:** images, layers and build caching; multi-stage builds; running as a non-root user; `.dockerignore`; the twelve-factor app (see the readiness audit above); liveness vs readiness vs startup probes; graceful shutdown; a container registry (ECR on LocalStack).

**Exercise**
- Write a `Dockerfile`: a slim Node 24 base, `pnpm install --prod --frozen-lockfile`, copy `src/` and `drizzle/`, run as a non-root user, start with `node src/server.ts` (Node runs the TypeScript directly). Add a `.dockerignore`.
- Add `/livez` (the process is up; never touches the DB) and `/readyz` (the DB is reachable) next to `/health`, with tests. Do this through the sub-agents in `CLAUDE.md`.
- Run the image with `docker run`, passing configuration only through environment variables, and against the compose Postgres.
- Create a repository in LocalStack ECR (`lstk aws ecr create-repository`), tag the image with the `repositoryUri` it returns, authenticate Docker against it, and push.

**Break it**
- Stop the database. `/livez` should stay 200 while `/readyz` goes 503. Why does that matter?
- Send `SIGTERM` during a stream of requests and watch what in-flight requests do.
- Run the container with a read-only filesystem and non-root user; fix what breaks.
- Rebuild after touching one source file and see which layers are cached.

**Checkpoint:** What goes wrong if a liveness probe checks the database? Why run as non-root? What makes an image "immutable", and why does that matter for rollbacks? Which of the twelve factors did the app already meet?

**Done when:** `docker run` with environment variables only passes the health checks, the image is in LocalStack ECR, the image size is noted, and the tests are green.

---

## Stage 3 — Infrastructure as code (Terraform)

**Goal:** describe the lab as code so rebuilding is routine, and keep every later stage declarative.

**Learn:** declarative vs imperative; state, plan, apply, destroy; drift; variables, outputs and modules; local vs remote state; committing `.terraform.lock.hcl` but never state; tagging; the difference between Terraform state and a LocalStack snapshot.

**Exercise:** codify stages 1–2 (the bucket, the IAM user and policy, the ECR repository) in `infra/`, and run it with `lstk terraform` (alias `lstk tf`), which points the AWS provider at LocalStack.
- Parameterize the endpoint so the same code can target a real cloud later.
- Run `init`, `plan`, `apply`, then `destroy`, then `apply` again.
- Take a snapshot of the whole lab before and after: `lstk snapshot save <path>` and `lstk snapshot load <path>` (cloud pods count against your 500 MB).

**Break it:** change a resource by hand and see the drift in `plan`; rename a resource and watch it get replaced; delete the state file and see what Terraform thinks exists; run `apply` twice and confirm it is idempotent.

**Checkpoint:** What is state, and why must it not be committed? What does `plan` tell you before you apply? How is a LocalStack snapshot different from Terraform state? What is the difference between `terraform destroy` and deleting resources by hand?

**Done when:** one command destroys everything and one command brings it back, and a snapshot save/load round trip works.

---

## Stage 4 — Kubernetes fundamentals (local cluster)

**Goal:** run Teeny-URL on Kubernetes and understand what the cluster does for you.

**Learn:** control plane vs nodes; Pod, ReplicaSet, Deployment; Service and Ingress; ConfigMap and Secret; probes; requests and limits; rolling updates and rollbacks; HorizontalPodAutoscaler; Jobs and CronJobs; namespaces, labels and selectors; debugging with `kubectl describe`, `logs`, `events`, `exec` and `port-forward`; Kustomize or Helm basics.

**Install first:** `kubectl`, `k3d` (or `kind`), `helm`.

**Exercise:** manifests in `deploy/` for a local cluster.
- Create the cluster and get the image in (`k3d image import` or a k3d registry).
- A `Deployment` with probes on `/livez` and `/readyz`, resource requests and limits, and `terminationGracePeriodSeconds`; a `Service`; an `Ingress`; a `ConfigMap` and `Secret` for configuration.
- A migration `Job` that runs `node src/db/migrate.ts`; a dev-only Postgres inside the cluster.
- Set `trust proxy` in the app so the ingress passes the real client IP.
- Scale to 3 replicas and observe the in-memory rate limiter giving each replica its own limit. Write down the options (shared store, gateway limits, accept it) and pick one.
- Roll out a bad image tag and roll it back.

**Break it:** point a probe at a wrong path; set a tiny memory limit and watch `OOMKilled`; delete a pod during load; drain the node; break the Secret.

**Checkpoint:** Pod vs Deployment? Why does readiness gate traffic during a rollout? What does a Service do that a Pod IP doesn't? Why do per-replica rate limits surprise people?

**Done when:** 3 replicas serve redirects through the Ingress, a bad rollout was rolled back, and migrations run as a Job.

**Gap:** a single-node local cluster has no real multi-zone scheduling or node failures.

---

## Stage 5 — Kubernetes on EKS (LocalStack)

**Goal:** run the same workload on a managed-Kubernetes API and learn what the cloud adds around Kubernetes.

**Learn:** a managed control plane; node groups; the IAM roles a cluster needs; VPC and subnets; ECR to cluster image pulls; load balancers and ingress; RDS as a managed database; what is portable between k3d and EKS and what is cloud-specific. LocalStack's EKS runs real k3d/k3s clusters in Docker; read its EKS docs page for the ingress and load-balancer notes (the default load balancer port is 8081).

**Exercise**
- Terraform for a VPC with two subnets, an IAM role and an EKS cluster (plus the ECR repository from stage 2), applied with `lstk terraform`.
- `lstk aws eks update-kubeconfig --name <cluster>`, then check `kubectl config current-context` before anything else.
- Deploy the stage 4 manifests with the image pulled from LocalStack ECR; expose it through an Ingress.
- Optionally move the database to an emulated RDS instance instead of Postgres in the cluster.
- Write `learning/notes/stage-5-k3d-vs-eks.md`: what stayed identical, what changed, and what the cloud added.
- Optional: run the same container on ECS and compare it with Kubernetes in two paragraphs.

**Break it:** give the cluster a wrong role ARN; push the wrong image tag; mix up kubeconfig contexts and notice how easy it is.

**Checkpoint:** What does EKS manage that k3d doesn't? What is portable between the two? Where do cloud IAM and Kubernetes RBAC meet?

**Done when:** Teeny-URL answers redirects through the EKS ingress, the whole cluster is Terraform-managed, and destroy/apply works.

**Gap:** LocalStack's EKS is k3d clusters in Docker. There is no real VPC networking, node autoscaling or multi-zone behavior, ingress differs from a real cloud load balancer, and it uses a lot of RAM.

---

## Stage 6 — Serverless and event-driven (deepening)

**Goal:** the other cloud-native execution model, and how to decouple work with messages.

**Learn:** Lambda (handler, execution role, timeout, memory, cold starts); API Gateway HTTP APIs; SQS, SNS and EventBridge; at-least-once delivery and idempotency; visibility timeout; dead-letter queues; DynamoDB basics (partition and sort keys, conditional writes, TTL).

**Exercise (three parts)**
- **6a: Lambda + API.** Move `GET /{code}` to a Lambda behind an HTTP API, first with an in-code map so you isolate the plumbing, then reading real data. A redirect is `statusCode: 302` plus a `location` header.
- **6b: asynchronous clicks.** The redirect sends a `ClickRecorded` message to SQS and returns immediately; a worker consumes it **idempotently** and updates counts; a dead-letter queue catches failures after 3 tries. This fixes the hot-row problem in the readiness audit.
- **6c: schedule and data.** An EventBridge scheduled rule triggers a nightly rollup. Write `learning/notes/stage-6-lambda-vs-containers.md` covering when you would choose each, and (optional) store links in DynamoDB with a decision note on DynamoDB vs Postgres.

**Break it:** throw an error in the handler; set a 1-second timeout; send a poison message and watch it reach the DLQ; stop the worker, send 1,000 clicks, restart it; deliver the same message twice and check the counts.

**Checkpoint:** What is a cold start? Why does at-least-once delivery force idempotency? SQS vs SNS vs EventBridge: when each? Lambda or a container for this workload, and why?

**Done when:** redirects succeed with the worker stopped, and after restart the counts catch up exactly once.

**Gap:** LocalStack's Lambda runs in Docker containers, so the first invocation is slow. Real cold starts and concurrency limits differ.

---

## Stage 7 — Observability

**Goal:** answer "is it healthy, what is slow, why did it fail" from telemetry alone.

**Learn:** logs, metrics and traces; OpenTelemetry (SDK, Collector, OTLP); RED metrics (rate, errors, duration); Prometheus scraping and PromQL basics; Grafana dashboards; alerting; SLIs, SLOs and error budgets; correlation (Teeny-URL already returns an `X-Request-Id`).

**Install first:** `helm` (from stage 4). The Prometheus and Grafana stack comes from a Helm chart.

**Exercise**
- Instrument Teeny-URL with OpenTelemetry (HTTP, Express and Postgres). Check the OpenTelemetry Node docs for how to load the SDK under native TypeScript and ESM.
- Run an OpenTelemetry Collector and a Prometheus + Grafana stack in the cluster.
- Build a RED dashboard for redirects, an alert on the 5xx rate and on latency, and define one SLO of your own with its error budget.
- If you did stage 6, look at the Lambda and SQS metrics in CloudWatch and alarm on DLQ depth.

**Break it:** add a `sleep` to one query and find it in a trace; stop the database and watch the alert fire; add a high-cardinality metric label and see what it does to Prometheus.

**Checkpoint:** Logs vs metrics vs traces: what question does each answer best? What is an SLO and an error budget? Why not alert on CPU? What is a span?

**Done when:** you have a dashboard, one working alert, and a trace of a redirect from the app down to the database, and you can diagnose an injected fault from telemetry only.

---

## Stage 8 — Delivery: CI/CD, GitOps and supply chain

**Goal:** every change is checked, built once, scanned, signed and deployed by automation, and rollback is a `git revert`.

**Learn:** pipeline stages; build once, promote many; immutable tags (the git SHA); GitOps (desired state lives in git and a controller reconciles the cluster); Argo CD or Flux; Kustomize overlays for environments; vulnerability scanning (Trivy), SBOMs (Syft), image signing (cosign); why cloud pipelines use OIDC instead of stored keys.

**Exercise**
- A GitHub Actions workflow: typecheck, lint, tests; build the image tagged with the git SHA; scan it; generate an SBOM; sign it.
- Run LocalStack in the job: install it with `npm install -g @localstack/lstk`, start with `lstk start`, and use `lstk reset --force` between suites. Use a CI auth token (not your personal one) stored as the repository secret `LOCALSTACK_AUTH_TOKEN`. There is no `lstk` GitHub Action yet; the older `setup-localstack` Action installs the deprecated CLI. Check how your 1,000 monthly CI credits are consumed before running on every push.
- Install Argo CD (or Flux) in the cluster, point it at a config path in git, and deploy through it.
- Promote by changing the image tag in a pull request; roll back by reverting it.

**Break it:** push a bad tag and watch the app go degraded, then revert; use a vulnerable base image and let the scan gate fail the build; change an image after signing and see the verification fail.

**Checkpoint:** What does the reconciliation loop do? Why immutable tags rather than `latest`? Push vs pull deployment? What does an SBOM let you answer after a new vulnerability is announced?

**Done when:** merging to `main` builds, scans, signs and deploys through the controller, and a revert rolls it back.

---

## Stage 9 — Security and policy (deepening)

**Goal:** least privilege and guardrails by default, enforced by the platform, not by good intentions.

**Learn:** least-privilege IAM (enforced); secrets management (Secrets Manager with the External Secrets Operator, or Sealed Secrets); Kubernetes RBAC and ServiceAccounts; NetworkPolicy; Pod Security Standards; policy engines (Kyverno or OPA Gatekeeper); verifying image signatures at admission.

**Exercise:** a minimal IAM role per workload; secrets delivered from Secrets Manager into the cluster; a scoped RBAC role for the CI deployer; a NetworkPolicy that lets only the app reach the database; admission policies that deny `:latest` tags, missing resource limits, root containers and unsigned images.

**Break it:** remove a permission and find the cause from logs alone; deploy something that violates each policy and read the denial; rotate a secret.

**Checkpoint:** How do you find which permission is missing? Why never `*:*`? What does an admission controller see that a pipeline doesn't? What does a NetworkPolicy need from the network plugin to work?

**Done when:** nothing runs with admin rights, every policy has a failing example you triggered, and a signed image is required.

---

## Stage 10 — Resilience and chaos (deepening)

**Goal:** find weaknesses on purpose, before an outage does.

**Learn:** timeouts, retries with backoff and jitter, idempotency, circuit breakers, bulkheads; autoscaling; the chaos method (hypothesis, experiment, limited blast radius, learn); LocalStack's Chaos Engineering / FIS (AWS Fault Injection Service) to inject faults into emulated AWS services; load testing with k6.

**Exercise:** run a game day.
- Write three hypotheses, for example "redirects stay available when the queue is unavailable" or "p99 stays under your SLO with +200 ms database latency".
- Inject the faults with LocalStack FIS experiments (see the Chaos Engineering docs) and by killing pods; drive load with k6; watch your dashboards and alerts.
- Add or tune timeouts, retries and autoscaling, and write a short post-incident review.

**Break it:** retry without backoff and see the retry storm; remove a timeout and watch requests pile up.

**Checkpoint:** Why do retries need jitter and idempotency? What is a blast radius? When does autoscaling make an outage worse?

**Done when:** three experiments ran, at least one real weakness was found and fixed, and the game-day report is written.

---

## Capstone — platform day

**Goal:** prove the whole platform is reproducible, then feel what the emulator hides. Budget half a day or more.

**Do**
- From a clean checkout: `lstk terraform apply` builds the infrastructure, Argo CD syncs the app, and one command restores your lab from a snapshot.
- Run your stage 10 game day against it.
- Optional: deploy the same Terraform and manifests to a real cloud with Student Pack credits, then destroy it.

**Before any real-cloud step:** use a new or sandbox account; turn on MFA and don't use root; create a billing budget with an alert *before* creating resources; use SSO or a least-privilege user; check the current free-tier and credit terms; never commit credentials. Hourly-billed resources (NAT gateways, load balancers, managed databases, clusters) are the usual surprise.

**Observe and write down:** latency, real IAM denials, throttling and quotas, eventual consistency, node and network behavior, anything that worked locally and failed there, and what it cost.

**Done when:** a clean checkout rebuilds the platform, the game day report exists, and (if you did the real-cloud step) it is fully destroyed and you wrote a "what differed" note.

---

## What LocalStack won't teach you

- **Cost:** real pricing, free-tier limits and billing surprises.
- **Real performance and limits:** latency, throttling, quotas and cold starts.
- **Real nodes and networks:** the emulated EKS is k3d in Docker, so multi-zone scheduling, node failures, real load balancers and VPC behavior are not the real thing.
- **Security enforcement:** IAM enforcement is an emulation.

## Optional certification path

Cloud-native: KCNA (Kubernetes and Cloud Native Associate) after stages 2–4, then CKAD or CKA. Infrastructure as code: HashiCorp Terraform Associate after stage 3. Cloud provider basics, if you want them: AWS Cloud Practitioner, then Developer Associate.

## Useful references

- LocalStack docs: https://docs.localstack.cloud
- `lstk` docs: https://docs.localstack.cloud/aws/developer-tools/running-localstack/lstk/ (migration guide: `…/lstk/migration/`)
- Kubernetes: https://kubernetes.io/docs/ · k3d: https://k3d.io · Helm: https://helm.sh/docs/
- The twelve-factor app: https://12factor.net · CNCF landscape: https://landscape.cncf.io
- OpenTelemetry: https://opentelemetry.io/docs/ · Argo CD: https://argo-cd.readthedocs.io
- Quick checks: `lstk status`, `lstk logs --tail 20`, `lstk aws s3 ls`, `kubectl config current-context`, `kubectl get pods -A`

---

## Session log

| Date | Stage | What happened | Next step |
|---|---|---|---|
| 2026-10-29 | — | Roadmap created. Environment checked: only Docker, Node and pnpm installed. | Stage 0: install tools, start LocalStack |
| 2026-10-29 | — | Plan confirmed as the LocalStack Student plan (Ultimate-equivalent). Persistence and IAM enforcement decisions resolved; gap notes updated. | Stage 0 |
| 2026-10-29 | 0 | Rewrote stage 0 and every CLI reference for `lstk` (it replaces `localstack`, `awslocal`, `tflocal`, `cdklocal` and `samlocal`, all deprecated). Verified without logging in: `lstk doctor` passes; `lstk aws` and `lstk status` fail cleanly while LocalStack is down; `lstk setup aws` output (in a throwaway home); a project-local `.lstk/config.toml` is picked up. | Run `lstk login`, then verify start, bucket and persistence |
| 2026-10-31 | all | Re-scoped from "learn AWS" to **cloud-native skills** that use the Student plan's benefits (EKS, ECS, IAM enforcement, FIS chaos, snapshots, CI credits). New stage order: primitives, containers, IaC, Kubernetes local then on EKS, serverless (deepening), observability, GitOps and supply chain, security (deepening), chaos (deepening). Added a benefit map and a cloud-native readiness audit of Teeny-URL. User had logged in and started LocalStack (Student plan recognized, no resources). Verified on the running instance: `sts get-caller-identity`, bucket round trip, `logs --tail`, `snapshot list`, and list calls for EKS, ECS, ECR, Lambda, FIS, RDS, DynamoDB, SQS and Step Functions. | Stage 0 step 3: project config with persistence, then your own bucket |
