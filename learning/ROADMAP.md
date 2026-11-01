# Learn cloud-native by building Teeny-URL (LocalStack Student plan)

A step-by-step path to cloud-native skills: server operations (SSH and Linux), containers, Kubernetes, infrastructure as code, configuration and secrets, architectural patterns, system design, observability, GitOps, security and resilience. Teeny-URL is the vehicle, and the LocalStack Student plan is a free, safe cloud to practise on.

**Last updated:** 2026-10-31 · **Current stage:** 0 (in progress)

---

## Goal and scope

**The goal is cloud-native skills, not AWS certification.** AWS appears because LocalStack emulates the AWS API. Most of what you learn here is not AWS-specific: Kubernetes, Terraform, OpenTelemetry, GitOps and supply-chain security work on any cloud.

"Cloud-native" here means a system that is: containerized, defined declaratively, orchestrated, observable, delivered by automation, resilient and secure by default. Each stage below builds one of those properties into Teeny-URL.

**Server operations is a parallel track (S1–S5).** Cloud-native systems still run on servers. Knowing how to SSH in, run a Linux box, deploy an app by hand and then describe the server as code makes containers and Kubernetes much easier to understand, because you will have done by hand what they automate. The Progress table is in the recommended order, with the S and A stages woven in.

**Application architecture and design is a second track (A1–A3):** configuration and secrets, architectural patterns, and system design. It turns "it runs" into "it is designed": where settings and secrets come from, how the code and services are structured, and how the system behaves at fifty times today's traffic.

**Principles**
- Use LocalStack where it gives you something you can't get otherwise: a cloud API, IAM enforcement, the EKS API, fault injection, state snapshots.
- Use plain local tools (Docker, k3d, Helm, Terraform, Prometheus…) everywhere else.
- Whenever something is AWS-specific, say so. The portable concept matters more than the AWS service name.
- Every stage opens with a short real-world story (why the skill matters) and ends with a **stage capstone**: a realistic scenario you deliver and write up. The **final capstone** at the end ties everything together.

### Student plan benefit map

What the plan includes, from LocalStack's licensing page (as of March 2026) and sign-up page, plus what was checked live on 2026-10-31.

| Benefit | What it gives you | Stage |
|---|---|---|
| Full AWS emulator service list | Verified on your instance: EKS, ECS, ECR, Lambda, FIS, RDS, DynamoDB, Step Functions and SQS all answer | all |
| **EKS** | Real Kubernetes (k3d/k3s clusters in Docker) behind the EKS API | 5 |
| **ECS** | A second container orchestrator to compare with Kubernetes | 5 (optional) |
| **IAM policy enforcement** (`ENFORCE_IAM`) | Real `AccessDenied` errors, not just policy syntax | 1, 9 |
| **Chaos Engineering / FIS** | Inject faults and latency into emulated AWS services | 10 |
| **Cloud Pods / snapshots** (500 MB on the Student plan) | Save and restore the whole lab: `lstk snapshot save` / `load` | 3, 10, final capstone |
| Persistence | State survives restarts (`PERSISTENCE`) | 0 on |
| **Secrets Manager, SSM Parameter Store, KMS** | A real secret store and encrypted parameters, with IAM enforcement deciding who can read them | A1, 9 |
| **ElastiCache** | A managed-Redis API for the A3 cache (the API answers; creating a cluster is not verified yet) | A3 |
| **EC2** (Docker VM manager; Base plan and up, so included) | Launch emulated instances you can SSH into, with key pairs and cloud-init user data. Instances are Docker containers, not real VMs. | S5 |
| CI integration, 1,000 CI/CD credits per month (sign-up page) | LocalStack inside GitHub Actions | 8 |
| Stack Insights, Extensions | Included; look at them when you have real workloads | 7 |

**Not on your plan (per the same pages):** Ephemeral Instances (cloud sandboxes). The Azure emulator is in public preview and, as far as LocalStack's pages say, students get the AWS emulator only. Because most of this roadmap is cloud-agnostic, that costs you little.

Student access lasts while your GitHub Education verification is active. LocalStack's pages don't say what happens if it lapses, so keep notes and infrastructure code in git. Check <https://education.github.com/pack> for other Student Pack credits that might help with the final capstone; offers change, so don't plan around them.

---

## How to use this file

**Interactive version:** run `pnpm roadmap` and open http://127.0.0.1:8765 (it rebuilds `learning/roadmap.html` from this file first; `ROADMAP_PORT` changes the port). You can also open `learning/roadmap.html` directly in a browser. After editing the roadmap, `pnpm roadmap:build` regenerates the page (`node learning/build-roadmap-html.mjs --check` tells you whether it is out of date). The page keeps your progress in your browser only, so this file stays the source of truth.

**For you.** Ask things like:
- "Start stage 4." / "What's next?"
- "I'm stuck on stage 4: my pods are in CrashLoopBackOff."
- "Explain readiness vs liveness probes."
- "Review my stage 3 work. Am I done?"
- "Be the review panel for my A3 design doc."

**For Claude (read this first in any session about cloud, containers, Kubernetes, Terraform, configuration and secrets, architecture, system design, observability, GitOps or LocalStack):**
1. Read this whole file, then the [Progress](#progress) table and the [Session log](#session-log) to see where the user is.
2. Re-check the environment before acting: `command -v lstk aws docker terraform kubectl k3d helm ssh virsh ansible sops gitleaks k6` and `lstk status`. The CLI is `lstk`; the older `localstack`, `awslocal`, `tflocal`, `cdklocal` and `samlocal` commands are deprecated.
3. Teach in **coach mode** by default: explain the concept, let the user predict, give hints before answers, and have the user type the key commands. Switch to "just do it" only when the user asks.
4. Work on a branch named `learn/stage-N-<topic>`. `pnpm typecheck && pnpm lint && pnpm test` must stay green (the v1 suite has 161 tests). Application code changes go through the project's sub-agents (see `CLAUDE.md`). The user switches models by hand; there is no automatic switching. Before any coding-heavy work (changing the app, writing Dockerfiles, Terraform, manifests or scripts, building the HTML page), stop and say so, so the user can switch to a stronger model, and continue once they say go. Teaching, reviewing and documentation stay on whichever model is active. Coach mode still applies to what the learner types.
5. A stage is finished only when its [definition of done](#definition-of-done-for-every-stage) is met, including its stage capstone. Then update the Progress table and add a Session log row.
6. Stage capstones are where the user works mostly alone. Act as the stakeholder or reviewer, give hints only when asked, check the deliverable against its acceptance criteria, and be honest about gaps. When a capstone calls for a blind diagnosis, you may plant a fault, but only on a throwaway branch or in the lab VM or cluster, and tell the user only that a fault exists.
7. Do not skip ahead. Never run anything against a real cloud or a non-local cluster outside the [final capstone](#final-capstone--platform-day).
8. Commit only when the user asks. Never commit tokens, credentials, kubeconfigs or Terraform state.

---

## Learner and environment snapshot (2026-10-31)

| Item | Value |
|---|---|
| Background | TypeScript/Node developer; knows Express, Postgres and Docker basics; new to cloud; GitHub Student Developer Pack holder |
| Machine | Linux, Docker 29.8, 16 CPUs, 15 GB RAM (about 7 GB free at last check), Node 24.14, pnpm 12.5. LocalStack plus a Kubernetes cluster plus Prometheus gets tight: stop unrelated containers (`dichi-*`) while labs run. |
| Installed | `lstk` 1.4.3 (Homebrew), AWS CLI 2.39 (Homebrew), Terraform (`/usr/bin`), Docker, OpenSSH client 10.2, libvirt/KVM tooling (`virsh`, `virt-install`, `qemu`), `rsync`, the old `localstack` CLI (deprecated; can stay) |
| Not installed yet | `kubectl`, `k3d` (or `kind`), `helm`, `kustomize`, Argo CD CLI, `trivy`, `syft`, `cosign`, `k6`, `ansible`, `packer`, `sops`, `age`, `gitleaks`, `redis-cli`. Install each when its stage starts. `lstk terraform`, `lstk cdk` and `lstk sam` only wrap the real tools. |
| LocalStack | Running (container `localstack-aws`, version 2026.10.4), plan label "LocalStack Student", no resources yet. It was started with the global default config, so **persistence is not on yet**: stage 0 step 3 fixes that. |
| Server lab | KVM works (`/dev/kvm`; you are in the `kvm`, `libvirt` and `docker` groups) and libvirt is reachable without sudo. Host OS is Ubuntu 26.04. No SSH server runs on this machine, which is fine: the lab VM runs one. **Gotcha:** Linuxbrew's Python comes first in your PATH and lacks the `gi` module, so plain `virt-install` crashes. Run `/usr/bin/python3 /usr/bin/virt-install …` (verified: it then works). |
| SSH keys | `~/.ssh` holds your personal `id_ed25519` and an `ec2-sim.pem` key pair (probably from an earlier EC2 experiment). Key contents were never read. Create a separate lab key in S1 and keep your personal key off lab machines. |
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
| Stateless processes | **No:** the rate limiter keeps counters in memory, so each replica has its own limit | 4 (seen), A3 (shared limiter) |
| Real client IP behind a proxy | **No:** `trust proxy` is not set, so behind nginx or an ingress all clients share one rate-limit bucket | S3, 4 |
| Admin processes (migrations, key CLI) | Run by hand with `pnpm`. On a server they become a deploy step; in a cluster, a Job or init container. | S3, 4 |
| Hot path stays fast | **No:** clicks are written inside the redirect transaction, which serializes on one row for a viral link | 6 |
| Secrets in a secret store | **No:** the database password lives inside `DATABASE_URL`, in `.env` and in the process environment | A1 |
| Code depends on abstractions | **Partly:** routes, services and database are separate layers, but the services call Drizzle directly, so storage can't be swapped or faked | A2 |
| Designed for scale | **Not yet:** every redirect reads Postgres, there is no cache, and nobody has estimated the load | A3 |

### Open decisions

| Decision | Options | Needed by | Recommendation |
|---|---|---|---|
| IaC tool | Terraform (`lstk terraform`) or CDK | Stage 3 | **Terraform.** It is already installed, and its skill transfers across clouds. Tell me if you'd rather use CDK. |
| LocalStack run mode | `lstk` with a project config, or compose | Stage 0 | **`lstk` with `.lstk/config.toml`** (decided). |
| Persistence / IAM enforcement | on / off | Stages 0 / 1 | **On** for both: `PERSISTENCE = "1"` now, `ENFORCE_IAM = "1"` from stage 1. |
| Local Kubernetes | k3d or kind | Stage 4 | **k3d:** the same engine LocalStack's EKS uses, lightweight, ingress built in. kind is the upstream-like alternative. **Undecided: ask the user.** |
| GitOps tool | Argo CD or Flux | Stage 8 | **Argo CD:** its UI makes the reconciliation loop visible. **Undecided.** |
| Observability stack | OpenTelemetry + Prometheus + Grafana | Stage 7 | **Decided:** all three are open standards or CNCF projects and portable. |
| Server practice target | A local KVM VM (libvirt), LocalStack EC2, or a real VPS | S1 | **A local KVM VM** as the main lab server: it has a real kernel, systemd, firewall and disks. Use LocalStack EC2 for the cloud side in S5. A real VPS is optional, for the final capstone. **Confirm with the user.** |
| Configuration management | Ansible, or shell scripts and cloud-init only | S5 | **Ansible:** agentless, works over SSH, the common default for this job. |
| Secrets in git (for GitOps) | SOPS with age, or Sealed Secrets | A1 | **SOPS + age:** works with any tool and offline, and Argo CD can decrypt it later. Sealed Secrets ties you to one cluster's key. |
| A3 cache | Redis in the cluster, or LocalStack ElastiCache | A3 | **Redis in the cluster first** (simple and measurable), then ElastiCache to see the managed-service version. |

---

## Progress

"Core" stages are the essential path. "Deepening" stages add breadth and can be postponed, or done in any order after the core. The table is in the recommended order, with the server-operations (S1–S5) and architecture (A1–A3) stages woven in.

| Stage | Topic | Track | Status | Started | Finished | Notes |
|---|---|---|---|---|---|---|
| 0 | Setup and the mental model | Core | in progress | 2026-10-29 | | LocalStack running, plan recognized. Left: project config with persistence, your own bucket |
| 1 | Cloud primitives: IAM and object storage | Core | not started | | | |
| S1 | SSH and secure remote access | Core | not started | | | |
| S2 | Linux server administration | Core | not started | | | |
| S3 | Deploy Teeny-URL the traditional way | Core | not started | | | |
| 2 | Containers and 12-factor | Core | not started | | | |
| A1 | Configuration and secrets management | Core | not started | | | |
| 3 | Infrastructure as code (Terraform) | Core | not started | | | |
| S4 | Hardening and day-2 operations | Deepening | not started | | | |
| S5 | Configuration management and servers in the cloud | Core | not started | | | |
| 4 | Kubernetes fundamentals (local cluster) | Core | not started | | | |
| 5 | Kubernetes on EKS (LocalStack) | Core | not started | | | |
| A2 | Architectural patterns | Core | not started | | | |
| 6 | Serverless and event-driven | Deepening | not started | | | |
| 7 | Observability | Core | not started | | | |
| A3 | System design | Core | not started | | | |
| 8 | Delivery: CI/CD, GitOps, supply chain | Core | not started | | | |
| 9 | Security and policy | Deepening | not started | | | |
| 10 | Resilience and chaos | Deepening | not started | | | |
| C | Final capstone: platform day | Deepening | not started | | | |

Rough time per stage: 0 → 1–2 h · 1 → 3–4 h · S1 → 3–5 h · S2 → 5–8 h · S3 → 6–10 h · 2 → 4–6 h · A1 → 4–6 h · 3 → 5–8 h · S4 → 5–8 h · S5 → 6–10 h · 4 → 6–10 h · 5 → 6–10 h · A2 → 6–10 h · 6 → 8–12 h · 7 → 6–10 h · A3 → 6–10 h · 8 → 6–10 h · 9 → 5–8 h · 10 → 4–6 h · final capstone → 4–8 h. Each stage capstone adds roughly 1–3 hours on top. That is roughly 120–220 hours in total, and the core is a bit over half. Treat these as guides, not deadlines.

---

## The learning loop (every stage)

Start by reading the stage's "Why it matters" story: it is the real-world reason you are doing the work.

1. **Predict.** Write down what you expect to happen before you run anything. Notes go in `learning/notes/stage-N.md`.
2. **Do.** Build it, using the LocalStack web app (Resource Browser), `lstk aws`, `kubectl` or code.
3. **Break it.** Run the stage's break-it drills and read the errors carefully.
4. **Rebuild.** Delete everything and recreate it. From stage 3 on, this means from code.
5. **Explain.** Answer the checkpoint questions in your own words, without looking.
6. **Ship it.** Deliver the stage capstone: a realistic scenario that uses the whole stage, with a short written readout in `learning/capstones/`.

### Definition of done for every stage

- The exercise works end to end.
- You ran every break-it drill and wrote down what you saw.
- You answered the checkpoint questions in your own words.
- The stage capstone meets its acceptance criteria, with the write-up in `learning/capstones/`.
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- From stage 3 on: destroying and re-applying everything works with one command.
- The Progress table and Session log are updated.

### Suggested layout (create as you go)

```
learning/ROADMAP.md      this file
learning/notes/          your notes per stage: predictions vs. what happened
learning/capstones/      write-ups and evidence for each stage capstone
learning/roadmap.html    interactive view, generated from this file
learning/build-roadmap-html.mjs   the generator (no dependencies)
learning/serve-roadmap.mjs        local server behind `pnpm roadmap`
Dockerfile               the app image (stage 2)
infra/                   Terraform (stage 3+)
servers/                 lab VM scripts, sshd/nginx/systemd configs, Ansible (S1+)
deploy/                  Kubernetes manifests, Helm values, Kustomize overlays (stage 4+)
lambdas/                 function code (stage 6)
docs/architecture/       C4 diagrams (A2)
docs/adr/                architecture decision records (A2)
docs/design/             system design docs (A3)
.lstk/config.toml        LocalStack config for this project (stage 0)
```

### Safety rules while learning

- Use `lstk aws`, `lstk terraform` and `lstk cdk`: they point the tool at LocalStack with dummy credentials, and `lstk aws` refuses to run when LocalStack is down instead of falling through to real AWS. For SDKs and the plain `aws` CLI, use the profile from `lstk setup aws` (`AWS_PROFILE=localstack`), which has the dummy `test` / `test` keys.
- **Check your Kubernetes context before every `kubectl`, `helm` or `terraform apply`:** `kubectl config current-context`. In these labs it must be a local k3d context or the LocalStack EKS context (`arn:aws:eks:us-east-1:000000000000:cluster/<name>`). Stop if it is anything else.
- Never put real cloud credentials in this project's environment until the final capstone.
- **Secrets drills use fake secrets.** In A1 the leaked key, the planted secret and the rotated password are all throwaway values made for the lab. Never test a scanner or a rotation with a real credential.
- **SSH hygiene:** use a dedicated lab key (never your personal `id_ed25519`) and never copy a private key onto a server. Don't disable host-key checking out of habit: verify the fingerprint once, then let `known_hosts` protect you. Before changing `sshd_config` or the firewall, keep one working session open, and keep the VM console (`virsh console`) as your way back in.
- Lab servers live on the local libvirt network only. Don't expose them to the internet, and never run break-it drills (brute force, bad configs) against machines you don't own.
- LocalStack is an emulator. It is not proof that something works on a real cloud. See [what LocalStack won't teach you](#what-localstack-wont-teach-you).

---

## Stage 0 — Setup and the mental model

**Goal:** a running LocalStack you can talk to with `lstk`, and a clear picture of what it is.

**Why it matters** *(illustrative scenario)*

> Your lead says, "Spin up staging and try it." In a real cloud that means an account, a billing alarm and a worry about leaving something running overnight. Teams that can create a faithful throwaway copy of their cloud on a laptop experiment freely, test in CI and onboard a new hire in minutes instead of days. Knowing exactly what the emulator is, and isn't, keeps you from trusting it too much.

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

**Stage capstone — "Cloud on a laptop"** *(write-up: `learning/capstones/stage-0-onboarding.md`)*
- **Scenario:** A new teammate starts tomorrow. Give them a one-page guide that takes them from nothing to a working LocalStack with a bucket in ten minutes.
- **Deliver:** the exact commands (login, config, start, status, a bucket, and a restart-and-persistence check), a troubleshooting section (including the Docker credential-helper problem), and a "what LocalStack is not" list with three differences from a real cloud.
- **Accept when:** someone else, or you in a fresh shell following only the guide, gets a working setup without asking questions; every command was actually run; no secrets appear anywhere in it.
- **Stretch:** a `pnpm lab:up` script that wraps the start-up, so one command brings the lab up.

---

## Stage 1 — Cloud primitives: IAM and object storage

**Goal:** understand identity and permissions, the foundation every cloud-native system sits on, and use object storage safely.

**Why it matters** *(illustrative scenario)*

> A developer commits an access key to a public repository, or leaves a storage bucket readable by anyone "just for the demo". Mistakes like these are a common cause of cloud data leaks, and they usually happen because permissions were far broader than the job needed and nobody noticed. The people who can write a least-privilege policy and read an access-denied message are the ones who can say "this service only needs to write to this one folder."

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

**Gap:** LocalStack's IAM enforcement is an emulation. Verify tricky policies on a real cloud in the final capstone.

**Stage capstone — "The export that can't leak"** *(write-up: `learning/capstones/stage-1-safe-export.md`)*
- **Scenario:** Finance wants a nightly click-stats export that partners can download. Security's rules: nothing is public, the app holds no long-lived admin credentials, and every download link expires.
- **Deliver:** a private bucket; a policy that lets the exporter write only under `exports/`; presigned download links that expire in 15 minutes; proof of three denied actions (wrong prefix, delete, list) with the `AccessDenied` output; and a one-paragraph threat model covering what happens if a link leaks and what happens if the exporter's key leaks.
- **Accept when:** every denied action is shown denied; the threat model names a concrete limit on the damage in each case; and the exporter still works end to end.
- **Stretch:** add a bucket policy that rejects requests not made over TLS.

---

## Track S — Server operations (SSH and Linux)

**Why:** you will SSH in, run a Linux server, deploy Teeny-URL by hand, and then describe the server as code. Doing it the manual way first shows exactly what containers (stage 2) and Kubernetes (stage 4) automate.

**Practice targets**

| Target | Use it for | Limits |
|---|---|---|
| **Lab VM** (local KVM, libvirt) | Everything in S1–S5 that needs a real OS: kernel, systemd, firewall, disks, reboots | Local only. You build it from an Ubuntu cloud image with cloud-init. |
| **LocalStack EC2** (Docker VM manager) | The cloud side in S5: key pairs, user data, security groups, SSH to a mapped port | Instances are Docker containers: no real reboot, disks or firewall. Only the `default` security group, up to 32 ingress ports. Instance records persist but the instances themselves don't survive a restart. Only some EC2 API calls exist (the docs say 245 of 807). |
| A real VPS (optional) | The final capstone | Costs credits or money, and is exposed to the internet |

**Verification status (2026-10-31).** Written from the docs and an inventory of your machine; **no Track S command has been run yet**, and each stage's exact commands are verified when it starts. Already checked: OpenSSH client 10.2; KVM works and libvirt is reachable without sudo (`qemu:///system`, the default NAT network and storage pool are active, 526 GB free); `virt-install` 5.1.0 supports `--cloud-init` but only works through the system Python (see the gotcha in the snapshot); `genisoimage` and `xorriso` are available for building cloud-init ISOs; LocalStack EC2 answers, the Docker socket is mounted into the LocalStack container, and the two launchable images exist (`ami-61ad6e59d7b0` = Ubuntu 26.04 and `ami-024f768332f0` = Amazon Linux 2023; the other ~1,200 catalog entries are mock). **Not yet verified:** building the VM, SSH into it, and launching and SSH-ing into a LocalStack instance.

**What I'll need from you:** `ansible` on the host (S5). Optional: `postgresql-client` (the S1 tunnel exercise; `docker exec` also works) and `mkcert` (S3; `openssl` also works). Downloading the Ubuntu cloud image (several hundred MB) needs your OK when S1 starts.

---

## Stage S1 — SSH and secure remote access

**Goal:** connect to a server securely and comfortably, and understand what SSH is protecting.

**Why it matters** *(illustrative scenario)*

> It is 2 a.m., the app is down, and SSH is the only way in. The engineer who can reach the server through a bastion, read the journal and tunnel to the database without opening it to the internet fixes it in minutes. The one who relies on a shared password, or a key copied between laptops, either can't get in or has quietly weakened every server's security. SSH is the front door to most servers, and one of the first things attackers probe.

**Learn:** public-key authentication; ed25519 keys; passphrases and `ssh-agent`; host keys and `known_hosts` (trust on first use, fingerprint verification); `~/.ssh/config` (host aliases, `IdentityFile`, `IdentitiesOnly`, `ServerAliveInterval`); `scp`, `rsync` and `sftp`; port forwarding (`-L`, `-R`, `-D`); jump hosts (`ProxyJump`) and why agent forwarding is risky; the essential `sshd_config` options; debugging with `ssh -v` and `journalctl -u ssh`; `authorized_keys` options; SSH certificates (concept only).

**Exercise**
1. Create a dedicated lab key with a passphrase (`ssh-keygen -t ed25519 -f ~/.ssh/lab_ed25519`) and load it into the agent.
2. Build the lab VM from an Ubuntu cloud image with `virt-install --cloud-init` (run as `/usr/bin/python3 /usr/bin/virt-install …`), so cloud-init creates your admin user and installs the lab public key. Exact commands are written and verified when you start.
3. Before trusting the VM, read its host key fingerprint on the console (`virsh console`, then `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) and compare it with what `ssh` shows on the first connection.
4. Add a `lab` alias to `~/.ssh/config`. Use `scp` and `rsync` to copy files; run a command remotely.
5. Forward a port with `-L` to reach a service bound to the VM's localhost. Use a high local port (for example 15432) because 5432 is already taken on your machine. Optionally add a second small VM and reach it with `ProxyJump`.
6. Harden `sshd`: key-only login, no root login, `AllowUsers`. Keep one session open, run `sudo sshd -t` to check the config, then `sudo systemctl reload ssh`, and test from a second terminal.

**Break it:** loosen the permissions on `~/.ssh` or the key and see the refusal; change the VM's host key and read the "host identification has changed" warning (understand it, don't just delete the line); lock yourself out with a bad `sshd_config` and recover through the console.

**Checkpoint:** What does the host key protect against, compared with your user key? Why must the private key never leave your machine? What is the difference between `-L` and `-R`? Why `sshd -t` before a reload? What does `ProxyJump` do that agent forwarding doesn't, and why is it safer?

**Done when:** key-only login works through an alias, you can tunnel to a service on the VM, `sshd` is hardened, and you recovered from a deliberate lockout.

**Gap:** a local VM isn't on the internet, so brute-force noise and port scans aren't realistic. S4 covers them.

**Stage capstone — "Locked-down front door"** *(write-up: `learning/capstones/stage-S1-front-door.md`)*
- **Scenario:** You are handing the lab server to an on-call rotation. Each person needs their own access, and you must be able to remove someone quickly.
- **Deliver:** key-only access with one key per person; `AllowUsers`; a `lab` alias and a jump-host alias in `~/.ssh/config`; a documented fingerprint check; a short runbook for adding and revoking a person; proof that password login, an unknown key and a revoked key are all refused (with the error output); and a rehearsed recovery from a deliberately broken `sshd_config` using only the console.
- **Accept when:** all three refusals are shown; the revoke steps work when followed literally; and the recovery was done without a second working SSH session.
- **Stretch:** issue a short-lived SSH certificate (`ssh-keygen -s`) and show it stop working after it expires.

---

## Stage S2 — Linux server administration

**Goal:** operate a server day to day from the shell.

**Why it matters** *(illustrative scenario)*

> A service starts failing at 3 p.m. with "no space left on device", yet the dashboard says the disk is half empty. Servers fail in boring, specific ways: a full disk or inode table, exhausted memory, one wrong permission, a unit that restarts forever. Going from symptom to cause with a handful of command-line tools is the base skill under every container, orchestrator and cloud service, because all of them run on Linux.

**Learn:** users, groups and `sudoers` (`visudo`); permissions, ownership, `umask` and a first look at ACLs; `apt`, repositories and `unattended-upgrades`; processes and signals; systemd (units, targets, `systemctl`, `journalctl`, timers vs cron); logs in `/var/log` and the journal, `logrotate`; disks and filesystems (`lsblk`, `df`, `du`, `mount`, `fstab`, inodes, the idea of LVM); networking tools (`ip`, `ss`, `dig`, `curl`, basic `tcpdump`); the firewall (`ufw` and the idea behind nftables); time sync; triage with `top`, `vmstat`, `iostat`, `free`, `dmesg` and the OOM killer.

**Exercise:** on the lab VM:
- Create a non-admin `deploy` user with key-only login and `sudo` for specific commands only.
- Write a systemd service and a timer for a small script (for example a heartbeat logged every minute) and read its output with `journalctl`.
- Attach a small extra disk, format and mount it (with a safe `fstab` entry), fill it up, and diagnose with `df` and `du`.
- Create CPU and memory pressure and triage it with the tools above; trigger and find an OOM kill.
- Enable `ufw` to allow only SSH and HTTP, and test it from the host with `nc` and `curl`.

**Break it:** remove the execute bit from a script a unit runs; fill a disk to 100% and see what breaks; compare `kill -9` with `SIGTERM`; put a bad line in `fstab` (use `nofail`) and recover from emergency mode through the console; break `sudoers` (and see why `visudo` exists).

**Checkpoint:** What does `chmod 640` mean for owner, group and others? `systemctl restart` vs `reload`? How do you find which process listens on port 80? What is the OOM killer? Why prefer timers to cron?

**Done when:** you can create a user, run a service under systemd and read its logs, diagnose a full disk and a busy CPU, and explain every firewall rule you set.

**Stage capstone — "Three tickets, one afternoon"** *(write-up: `learning/capstones/stage-S2-three-tickets.md`)*
- **Scenario:** Three tickets arrive for the lab server: "the disk is full", "the service keeps restarting", "port 8080 isn't reachable from my laptop".
- **Deliver:** diagnose all three using only command-line tools, fix them, and write a short note for each: symptom, evidence (the commands and their output), cause, fix, and how to prevent it. In coach mode, ask Claude to inject the three faults on the lab VM without telling you what they are.
- **Accept when:** all three are fixed; each note shows the evidence trail that led to the cause; and each has a prevention step (for example log rotation, a unit restart limit, a firewall rule kept in version control).
- **Stretch:** add a systemd timer that warns when any filesystem passes 80% full.

---

## Stage S3 — Deploy Teeny-URL the traditional way

**Goal:** run the app on a plain server the way it was done before containers, so you see what containers and Kubernetes automate.

**Why it matters** *(illustrative scenario)*

> Before containers and Kubernetes, deploying meant copying code to a machine, installing the runtime, configuring a process supervisor and a reverse proxy, and hoping staging matched production. Plenty of real systems still run this way, and many teams that moved to Kubernetes can't say what it replaced. Having done it by hand once, you understand release directories, process supervision, TLS termination and backups as concrete problems, not magic.

**Learn:** a dedicated service user; environment files and secrets on disk (permissions); systemd units for a Node app (`Restart=`, `TimeoutStopSec`); a reverse proxy (nginx or Caddy) and TLS termination with a local certificate (Let's Encrypt needs a public domain, so use `mkcert` or a self-signed cert); `X-Forwarded-For` and Express `trust proxy`; PostgreSQL on a server (roles, `pg_hba.conf`, `pg_dump` and restore); release directories and symlink rollbacks; log rotation.

**Exercise**
- On the lab VM install Node 24 and PostgreSQL (the distro's current version is fine; the app is tested on 17). Create the database and a role for the app.
- Create a `teeny` system user, a release directory (`/opt/teeny-url/releases/<sha>` with a `current` symlink) and `/etc/teeny-url/env` with `0600` permissions.
- Write `teeny-url.service` (`ExecStart=/usr/bin/node src/server.ts`, `Restart=on-failure`, a `TimeoutStopSec` longer than the app's 10 s graceful shutdown).
- Put nginx in front on :80 and :443, with TLS and `X-Forwarded-For`. Set `trust proxy` to the number of proxies (1) in the app, through the sub-agents, and verify that rate limits now apply per client IP. (This fixes the readiness-audit gap.)
- Write a `deploy.sh` that rsyncs a release over SSH, installs production dependencies, runs the migrations, flips the symlink, restarts the unit and checks `/health`. (`/livez` and `/readyz` arrive in stage 2.)
- Back up with a systemd timer running `pg_dump`, then restore into a fresh database and compare link counts.

**Break it:** `kill -9` the process and watch systemd restart it; stop Postgres and watch the app; deploy a bad migration and roll back by symlink; fill the disk with logs; set wrong permissions on the env file; use an expired or mismatched certificate.

**Checkpoint:** Why a dedicated service user? What does `Restart=on-failure` give you compared with running `node` in a terminal? Why does `X-Forwarded-For` need `trust proxy`, and what goes wrong if you trust it blindly? Name three manual steps here that containers later replace. Why test restores and not just backups?

**Done when:** the app serves HTTPS redirects through nginx on the VM, survives `kill -9` and a reboot, can be deployed and rolled back with one script, and a backup restores cleanly.

**Stage capstone — "Friday deploy, Monday rollback"** *(write-up: `learning/capstones/stage-S3-bad-release.md`)*
- **Scenario:** The product owner wants a change shipped on Friday afternoon. The change contains a bad database migration that you don't notice until it is live.
- **Deliver:** ship the change with `deploy.sh`, detect the problem through the health check and the logs, roll back the code with one command, restore the data from backup, and write a short post-incident note with a timeline and the one change you'd make to the process.
- **Accept when:** the rollback takes under two minutes; the restored data matches the pre-deploy link count; and the note names a process change (for example a pre-deploy backup step or a migration dry run).
- **Stretch:** run two app instances behind nginx and flip between them for a zero-downtime release.

---

## Stage 2 — Containers and 12-factor

**Goal:** package Teeny-URL as a production-grade image and make it behave properly on a container platform.

**Why it matters** *(illustrative scenario)*

> "It works on my machine" can cost days: the developer has Node 24, the server has an older version, a system library differs, an environment variable is missing. A container image packages the app and its dependencies into one immutable artifact that behaves the same on a laptop, in CI and in production. That single artifact is what every later tool (registries, Kubernetes, scanners, GitOps) moves around.

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

**Stage capstone — "One image, three places"** *(write-up: `learning/capstones/stage-2-one-image.md`)*
- **Scenario:** The same image must run on your laptop, in CI and later in a cluster, with only environment variables changing between them.
- **Deliver:** the `Dockerfile` and `.dockerignore`; a non-root image under a size budget you set and justify; the `/livez` and `/readyz` endpoints; a note on layers and what is cached; and the same image digest started in two configurations (different `PORT`, `BASE_URL` and `DATABASE_URL`) without rebuilding.
- **Accept when:** both runs pass the health checks; the digest is identical in both; the container runs as a non-root user; and the tests are green.
- **Stretch:** scan the image for known vulnerabilities and fix the highest-severity finding by changing the base image or a dependency.

---

## Track A — Application architecture and design

**Why:** the main path teaches you how to run software; this track teaches you how to shape it. Where configuration and secrets come from in every environment, which architectural patterns fit which problem, and how to design for scale and failure before you build. Teeny-URL is an ideal vehicle: "design a URL shortener" is a classic system design question, and you have a real one to change and measure.

**Where it fits:** A1 comes right after containers (stage 2), because every later stage needs configuration and secrets handled properly. A2 comes after Kubernetes on EKS (stage 5), when you have a platform to place services on. A3 comes after observability (stage 7), so you can measure your design instead of guessing.

**Verification status (2026-10-31).** Written from the docs; **no Track A command has been run yet**. Checked on your LocalStack: Secrets Manager, SSM Parameter Store, KMS, ElastiCache, EventBridge and CloudTrail all answer read-only list calls. **Not yet verified:** creating and reading secrets with IAM enforcement on, rotation, and whether creating an ElastiCache cluster gives you a usable Redis.

**What I'll need from you:** for A1, `sops`, `age` and `gitleaks`; for A3, `k6` (also used in stage 10) and optionally `redis-cli` (`docker exec` into Redis works too).

---

## Stage A1 — Configuration and secrets management

**Goal:** every setting comes from the environment, every secret comes from a secret store, and nothing sensitive ends up in git, images or logs.

**Why it matters** *(illustrative scenario)*

> A team keeps the production database password in a `.env` file that "nobody commits". One day someone runs `git add .` on a new laptop, the file reaches a public fork, and automated scanners that crawl public repositories find it soon after. The fix eats a weekend: rotate the password, audit what used it, purge history, and discover three other services that hard-coded the same credential. Good configuration management makes that a non-event: secrets live in a store, are fetched at runtime with narrow permissions, rotate without a redeploy, and a scanner stops the mistake before it is pushed.

**Learn:** configuration vs secrets; twelve-factor config in environment variables; validating configuration at startup (Teeny-URL's `src/env.ts` already does this with zod); precedence (defaults, files, environment, flags); per-environment settings (dev, test, staging, prod) without branching code; what `.env` files are good for and where they stop (gitignored `.env`, committed `.env.example`, Node's `--env-file-if-exists`); secret stores: AWS Secrets Manager vs SSM Parameter Store (`SecureString`), KMS and envelope encryption; fetching secrets at startup vs injecting them at deploy time; least-privilege access to one secret; rotation (versions and the `AWSCURRENT` / `AWSPREVIOUS` labels, dual credentials); encrypting secrets in git with SOPS and age, for GitOps later; secret scanning (gitleaks, pre-commit hooks, push protection); never logging secrets (v1 already redacts `Authorization` in pino); secrets in containers (never baked into images or build args) and in CI; why a Kubernetes Secret is only base64-encoded unless encryption at rest is configured.

**Exercise**
- Audit every setting the app reads (`src/env.ts`) and classify each as config or secret. Write down where each one lives today in dev, tests, CI, the lab VM (S3) and the container (stage 2).
- Store per-environment config in SSM Parameter Store under `/teeny-url/<env>/…` and the database credentials in Secrets Manager. With IAM enforcement on, give the app an identity that can read only its own paths.
- Teach the app to read its database credentials from Secrets Manager at startup when an optional `DATABASE_SECRET_ID` is set, keeping `DATABASE_URL` for local development. Make it fail fast with a clear message when the secret can't be read. Do this through the sub-agents, with tests.
- Rotate the database password with no downtime: create the new credential, store it as a new secret version, restart the app, verify, then revoke the old one. Watch the version labels move.
- Encrypt a secrets file with SOPS and age, commit only the encrypted file, and decrypt it in a deploy script.
- Add secret scanning: run gitleaks over the whole history and as a pre-commit hook.

**Break it:** commit a fake key on a throwaway branch and watch the scanner catch it; remove the app's permission to read its secret and read the startup error; pass a secret as a Docker build argument and find it again in `docker history`; log the whole environment once and see what redaction does and doesn't cover; change the database password without updating the secret and watch what fails.

**Checkpoint:** What is the difference between config and a secret, and why does it matter where each lives? Why validate configuration at startup instead of failing later? Secrets Manager or Parameter Store: when each? Why is a Kubernetes Secret not secret by default? How do you rotate a credential without downtime? What do you do in the first hour after a secret leaks?

**Done when:** no secret is in git history, an image or the logs; the app reads its database credentials from the secret store with least-privilege access; a password rotation caused no failed requests; and `.env.example` documents every setting.

**Gap:** LocalStack's Secrets Manager and KMS are emulations; rotation Lambdas and key policies can behave differently on a real cloud, and push protection needs a real GitHub repository.

**Stage capstone — "The leaked key drill"** *(write-up: `learning/capstones/stage-A1-leaked-key.md`)*
- **Scenario:** At 10:00 a teammate reports that the Teeny-URL database password was pasted into a public chat. You own the response.
- **Deliver:** a timed runbook, executed for real in the lab with a fake credential: rotate the password with zero downtime while a load test runs; prove the old password is rejected; scan the git history and images for other copies; and a short post-incident note with a timeline and the preventive control you added (a scanner, a pre-commit hook or narrower permissions).
- **Accept when:** the old credential is rejected; no redirect failed during the rotation; the history and image scans are clean; and the note names one control that would have prevented or shortened the incident.
- **Stretch:** automate monthly rotation with a scheduled EventBridge rule and a Lambda on LocalStack.

---

## Stage 3 — Infrastructure as code (Terraform)

**Goal:** describe the lab as code so rebuilding is routine, and keep every later stage declarative.

**Why it matters** *(illustrative scenario)*

> A teammate "tweaked a setting in the console" last month, nobody remembers which, and staging and production now differ in ways no one can list. When infrastructure is code, changes are reviewed in pull requests, environments are rebuilt on demand, and "what is deployed?" has an answer in git. It is also how teams recover from disasters: re-apply instead of re-remember.

**Learn:** declarative vs imperative; state, plan, apply, destroy; drift; variables, outputs and modules; local vs remote state; committing `.terraform.lock.hcl` but never state; tagging; the difference between Terraform state and a LocalStack snapshot.

**Exercise:** codify stages 1, 2 and A1 (the bucket, the IAM user and policy, the ECR repository, the secrets and parameters) in `infra/`, and run it with `lstk terraform` (alias `lstk tf`), which points the AWS provider at LocalStack.
- Parameterize the endpoint so the same code can target a real cloud later.
- Run `init`, `plan`, `apply`, then `destroy`, then `apply` again.
- Take a snapshot of the whole lab before and after: `lstk snapshot save <path>` and `lstk snapshot load <path>` (cloud pods count against your 500 MB).

**Break it:** change a resource by hand and see the drift in `plan`; rename a resource and watch it get replaced; delete the state file and see what Terraform thinks exists; run `apply` twice and confirm it is idempotent.

**Checkpoint:** What is state, and why must it not be committed? What does `plan` tell you before you apply? How is a LocalStack snapshot different from Terraform state? What is the difference between `terraform destroy` and deleting resources by hand?

**Done when:** one command destroys everything and one command brings it back, and a snapshot save/load round trip works.

**Stage capstone — "Rebuild the lab from scratch"** *(write-up: `learning/capstones/stage-3-rebuild.md`)*
- **Scenario:** LocalStack's state is wiped, or your laptop is replaced. You have to get the lab back, and nobody remembers how it was set up.
- **Deliver:** `infra/` with everything from stages 1, 2 and A1; a three-command README for it; a timed run from an empty LocalStack to a working lab; a second `apply` that changes nothing; a resource you changed by hand that `plan` detects and `apply` corrects; and a snapshot saved and restored.
- **Accept when:** the timed rebuild works from empty; the second apply is a no-op; the drift was found by `plan` before you went looking for it; and the README is enough for someone else to follow.
- **Stretch:** turn the "private bucket with a least-privilege writer" into a module and use it twice.

---

## Stage S4 — Hardening and day-2 operations (deepening)

**Goal:** keep a server safe and recoverable after day one.

**Why it matters** *(illustrative scenario)*

> Soon after a server gets a public address, its logs typically show automated login attempts. Most attacks aren't clever; they're opportunistic, and they succeed against unpatched, over-permissive systems. Hardening is the unglamorous work (updates, least privilege, sandboxing, backups you have actually restored) that turns a probable incident into a non-event. When something does go wrong, runbooks and a rehearsed restore decide whether it's a ten-minute blip or a lost weekend.

**Learn:** attack surface and a CIS-style baseline; SSH hardening revisited (`fail2ban`, `MaxAuthTries`); security updates and a patch cadence; systemd sandboxing options (`NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`, `ReadOnlyPaths`) and `systemd-analyze security`; AppArmor basics; `auditd`; reading `auth` logs for failed logins; host monitoring with `node_exporter` and Prometheus (this links to stage 7); recovery objectives (RPO and RTO); runbooks.

**Exercise:** run `systemd-analyze security teeny-url.service` and improve its score without breaking the app; install `fail2ban` and trigger a ban from a second lab VM (lab only); turn on `unattended-upgrades`; scrape `node_exporter` from a Prometheus on your host; write one-page runbooks for "app down", "disk full" and "can't SSH"; run a restore game day (delete the database, restore it, time it).

**Break it:** over-tighten the sandbox until the service fails and read why; ban yourself with `fail2ban` and recover; skip a security update window and look at what is pending.

**Checkpoint:** What does each sandboxing option take away from the process? What is an RPO versus an RTO, and what were yours? Why alert on failed backups as well as failed services?

**Done when:** the unit's security score is measurably better, a ban and a restore both worked, and the runbooks exist.

**Stage capstone — "Survive the audit"** *(write-up: `learning/capstones/stage-S4-audit.md`)*
- **Scenario:** Security asks for evidence that the Teeny-URL server meets a baseline before it can go to production.
- **Deliver:** a one-page server baseline checklist with evidence (command output) for each item: key-only SSH, automatic security updates, the service's sandbox score before and after, firewall rules, a timed restore against a stated RTO, and the three runbooks.
- **Accept when:** every checklist item has evidence you produced; the restore time is measured and compared with your own RTO; and at least one item failed on the first check and was fixed.
- **Stretch:** write a small audit script that checks the baseline and fails when someone deliberately weakens one item.

---

## Stage S5 — Configuration management and servers in the cloud

**Goal:** stop hand-editing servers, and see how a cloud server relates to the lab VM.

**Why it matters** *(illustrative scenario)*

> A server built by hand over two years is a "pet": nobody dares reboot it, and nobody can rebuild it. Cloud teams treat servers as replaceable: define them in code, and replace them when they drift or need a patch. The skill that joins both worlds is knowing which tool owns what: Terraform asks the cloud for machines, and Ansible (or cloud-init, or a prebuilt image) turns them into your machines.

**Learn:** pets vs cattle; idempotency; Ansible (inventory, modules, playbooks, roles, handlers, Vault, `--check --diff`); cloud-init and user data; golden images (Packer, as a concept); mutable vs immutable servers; EC2 concepts (AMI, key pair, security group, user data); bastion hosts; what Terraform owns (provisioning) versus what Ansible owns (configuration).

**Exercise**
- Install Ansible. Write a role (or playbook) that rebuilds S1–S3 on a fresh VM: users, `sshd` hardening, packages, `ufw`, PostgreSQL, Node, nginx and the systemd unit. Run it twice; the second run must report no changes.
- Destroy the VM and rebuild it with one command (a VM script plus the playbook).
- On LocalStack: create a key pair, launch an instance from the Ubuntu image (`ami-61ad6e59d7b0`) with user data that installs a package, and SSH in on the mapped port (`ssh -p <PORT> -i key.pem root@127.0.0.1`; LocalStack logs the port when the instance starts). Open another ingress port with `authorize-security-group-ingress`. Then do the same with Terraform (`aws_instance`, key pair, security group) through `lstk terraform`.
- Run the parts of the playbook that don't need systemd against the LocalStack instance, and note what fails and why.
- Optional bastion: reach the lab VM through a second VM with `ProxyJump`.

**Break it:** change something on the server by hand and re-run the playbook to see the drift corrected; write a non-idempotent shell task and see it report "changed" every time; put a secret in a playbook and then move it into Ansible Vault; restart LocalStack and see what happens to the instance.

**Checkpoint:** What does "idempotent" mean in practice? Terraform vs Ansible: what does each own? Why are cattle-style servers replaced instead of patched? What did the LocalStack instance have in common with the VM, and what didn't it have (kernel, disks, systemd, reboot)?

**Done when:** one command rebuilds the lab server from scratch into a working Teeny-URL deployment, the second run changes nothing, and you have SSH-ed into a LocalStack instance on its mapped port.

**Gap:** LocalStack's EC2 instances are Docker containers. Use the VM for anything that needs a real operating system.

**Stage capstone — "Kill the pet"** *(write-up: `learning/capstones/stage-S5-kill-the-pet.md`)*
- **Scenario:** The lab server is "corrupted", so you delete it. Rebuild it without touching anything by hand.
- **Deliver:** one command (a script) that recreates the VM and configures it into a working Teeny-URL deployment that passes the S3 acceptance checks; an Ansible run that reports no changes the second time; a LocalStack EC2 instance created with Terraform, with user data and an SSH login on the mapped port; and a one-page "who owns what" table covering Terraform, Ansible, cloud-init and prebuilt images.
- **Accept when:** the timed rebuild succeeds; the second run changes nothing; the SSH login to the LocalStack instance is shown; and the table gives a reason for each choice.
- **Stretch:** capture a prepared VM disk image, boot a copy, and compare the time with running the playbook.

---

## Stage 4 — Kubernetes fundamentals (local cluster)

**Goal:** run Teeny-URL on Kubernetes and understand what the cluster does for you.

**Why it matters** *(illustrative scenario)*

> Your service must stay up while you deploy, scale when traffic spikes, and recover when a machine dies, at 3 a.m. and without anyone logging in. Kubernetes is the common answer: you declare the desired state (three healthy replicas), and controllers keep working to make reality match it. Most platform teams expect you to be able to read a Deployment, debug a `CrashLoopBackOff` and roll back a bad release.

**Learn:** control plane vs nodes; Pod, ReplicaSet, Deployment; Service and Ingress; ConfigMap and Secret; probes; requests and limits; rolling updates and rollbacks; HorizontalPodAutoscaler; Jobs and CronJobs; namespaces, labels and selectors; debugging with `kubectl describe`, `logs`, `events`, `exec` and `port-forward`; Kustomize or Helm basics.

**Install first:** `kubectl`, `k3d` (or `kind`), `helm`.

**Exercise:** manifests in `deploy/` for a local cluster.
- Create the cluster and get the image in (`k3d image import` or a k3d registry).
- A `Deployment` with probes on `/livez` and `/readyz`, resource requests and limits, and `terminationGracePeriodSeconds`; a `Service`; an `Ingress`; a `ConfigMap` and `Secret` for configuration, following your A1 rules for what is config and what is a secret.
- A migration `Job` that runs `node src/db/migrate.ts`; a dev-only Postgres inside the cluster.
- Set `trust proxy` in the app so the ingress passes the real client IP.
- Scale to 3 replicas and observe the in-memory rate limiter giving each replica its own limit. Write down the options (shared store, gateway limits, accept it) and pick one.
- Roll out a bad image tag and roll it back.

**Break it:** point a probe at a wrong path; set a tiny memory limit and watch `OOMKilled`; delete a pod during load; drain the node; break the Secret.

**Checkpoint:** Pod vs Deployment? Why does readiness gate traffic during a rollout? What does a Service do that a Pod IP doesn't? Why do per-replica rate limits surprise people?

**Done when:** 3 replicas serve redirects through the Ingress, a bad rollout was rolled back, and migrations run as a Job.

**Gap:** a single-node local cluster has no real multi-zone scheduling or node failures.

**Stage capstone — "Ship during a traffic spike"** *(write-up: `learning/capstones/stage-4-traffic-spike.md`)*
- **Scenario:** Marketing posts a link and traffic jumps tenfold. In the middle of it you have to ship a fix.
- **Deliver:** a HorizontalPodAutoscaler (install metrics-server if your cluster lacks it); a load generator running (`hey`, `k6` or a simple loop); a rolling update to a new image tag with the success rate recorded; then a deliberately bad image that never receives traffic, followed by a `kubectl rollout undo`; and a timeline of the whole thing.
- **Accept when:** zero failed redirects during the good rollout; the bad rollout is blocked by the readiness probe; the rollback completes within a minute; and the replica count rose and fell with the load.
- **Stretch:** add a PodDisruptionBudget and drain the node during the load.

---

## Stage 5 — Kubernetes on EKS (LocalStack)

**Goal:** run the same workload on a managed-Kubernetes API and learn what the cloud adds around Kubernetes.

**Why it matters** *(illustrative scenario)*

> Few teams run their own Kubernetes control plane; they rent it (EKS, GKE, AKS) and spend their time on the parts that are theirs: networking, identity, images, cost. Real migrations succeed or fail on knowing which parts of your manifests are portable and which quietly depend on one cloud's load balancer, IAM or storage.

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

**Stage capstone — "Move without rewriting"** *(write-up: `learning/capstones/stage-5-migration-report.md`)*
- **Scenario:** Leadership asks: "Could we move this from our local cluster to a managed cloud cluster in a week?"
- **Deliver:** the same manifests deployed to both the k3d cluster and LocalStack EKS, with the differences held in overlays or Helm values; a migration report listing every change that was needed (image registry, ingress, secrets, storage, DNS) and classifying each as portable or cloud-specific; and the Terraform that builds the EKS side.
- **Accept when:** both clusters serve redirects from the same base manifests; every difference you had to make is in the report; and destroy followed by apply works.
- **Stretch:** add a second overlay for a production-like environment with more replicas and stricter resource limits.

---

## Stage A2 — Architectural patterns

**Goal:** know the common patterns, the problem each one solves and what it costs, and apply a few to Teeny-URL on purpose, with the decisions written down.

**Why it matters** *(illustrative scenario)*

> A team splits a working monolith into twelve microservices because that is what large companies do. A year later every feature touches four repositories, a simple bug needs tracing across five services, and the database is still shared, so the services can't be deployed independently anyway. Another team keeps a well-structured modular monolith, extracts exactly one service when its scaling needs really diverge, and ships faster. Patterns are tools with trade-offs; the skill is choosing one and writing down why.

**Learn:** layered architecture (what Teeny-URL has today: routes, services, database); hexagonal architecture (ports and adapters) and dependency inversion; modular monolith vs microservices, and the "distributed monolith" trap; domain boundaries (bounded contexts, a first taste of domain-driven design); synchronous calls (REST, gRPC) vs asynchronous events; event-driven patterns: publish/subscribe, the transactional outbox, idempotent consumers, sagas (orchestrated and choreographed), CQRS and event sourcing as concepts; integration patterns: API gateway, backend-for-frontend, strangler fig, anti-corruption layer; Kubernetes patterns: sidecar, ambassador, init container; architecture decision records (ADRs) and C4 diagrams.

**Exercise**
- Draw Teeny-URL as C4 context and container diagrams (Mermaid works well) in `docs/architecture/`.
- Introduce a port: a `LinkRepository` interface that the services depend on, with the current Drizzle and Postgres code as one adapter and an in-memory adapter for fast unit tests. Do this through the sub-agents.
- Implement a transactional outbox: creating or deleting a link writes a `link_events` row in the same transaction, and a small relay publishes pending events to an SQS queue on LocalStack and marks them sent. Make the consumer idempotent.
- Plan, on paper, how the strangler-fig pattern would move the redirect path into its own service without a big-bang rewrite (stage 6a builds one version of it), and which traffic moves first.
- Write three ADRs in `docs/adr/`: the repository port, the outbox, and "modular monolith now, extract later".

**Break it:** publish the event before the transaction commits, crash between the two steps, and find the lost or phantom event; deliver the same event twice and check the consumer; let a Drizzle type leak through the port and see the coupling come back; count the files a small change touches before and after the port.

**Checkpoint:** What does hexagonal architecture solve, and what does it cost? When is splitting out a microservice justified? What is a distributed monolith? What goes wrong with "write to the database, then publish", and how does the outbox fix it? Orchestrated or choreographed sagas: what is the trade-off? What belongs in an ADR?

**Done when:** the services depend on a port instead of Drizzle; the outbox delivers every event at least once to an idempotent consumer; the C4 diagrams and three ADRs exist; and the tests are green.

**Stage capstone — "Should we split it?"** *(write-up: `learning/capstones/stage-A2-split-decision.md`)*
- **Scenario:** The team lead proposes splitting Teeny-URL into three microservices (links, redirects, analytics) before the next growth phase. You are asked for a recommendation.
- **Deliver:** a short architecture proposal: the current C4 diagram and the proposed one; a trade-off table (deployability, latency, data ownership, operational cost, team size); a migration plan in small steps using the strangler fig if you recommend splitting, or the module boundaries if you don't; and the ADR that records the decision.
- **Accept when:** the recommendation follows from the trade-off table; data ownership for each service or module is explicit; every migration step is small and reversible; and the ADR lists the alternatives you rejected and why.
- **Stretch:** actually extract the analytics module into its own process that consumes the outbox events.

---

## Stage 6 — Serverless and event-driven (deepening)

**Goal:** the other cloud-native execution model, and how to decouple work with messages.

**Why it matters** *(illustrative scenario)*

> A link goes viral and the redirect path gets a hundred times its usual traffic for an hour, then almost none for a week. Paying for idle servers through the quiet week is wasteful, and scaling them for the spike is slow. Event-driven and serverless designs scale to zero and burst, and queues let the fast path (the redirect) stay fast while slower work (counting, analytics) catches up. That pattern sits behind most high-traffic systems.

**Learn:** Lambda (handler, execution role, timeout, memory, cold starts); API Gateway HTTP APIs; SQS, SNS and EventBridge; at-least-once delivery and idempotency; visibility timeout; dead-letter queues; DynamoDB basics (partition and sort keys, conditional writes, TTL).

**Exercise (three parts)**
- **6a: Lambda + API.** Move `GET /{code}` to a Lambda behind an HTTP API, first with an in-code map so you isolate the plumbing, then reading real data. A redirect is `statusCode: 302` plus a `location` header.
- **6b: asynchronous clicks.** The redirect sends a `ClickRecorded` message to SQS and returns immediately; a worker consumes it **idempotently** and updates counts; a dead-letter queue catches failures after 3 tries. This fixes the hot-row problem in the readiness audit.
- **6c: schedule and data.** An EventBridge scheduled rule triggers a nightly rollup. Write `learning/notes/stage-6-lambda-vs-containers.md` covering when you would choose each, and (optional) store links in DynamoDB with a decision note on DynamoDB vs Postgres.

**Break it:** throw an error in the handler; set a 1-second timeout; send a poison message and watch it reach the DLQ; stop the worker, send 1,000 clicks, restart it; deliver the same message twice and check the counts.

**Checkpoint:** What is a cold start? Why does at-least-once delivery force idempotency? SQS vs SNS vs EventBridge: when each? Lambda or a container for this workload, and why?

**Done when:** redirects succeed with the worker stopped, and after restart the counts catch up exactly once.

**Gap:** LocalStack's Lambda runs in Docker containers, so the first invocation is slow. Real cold starts and concurrency limits differ.

**Stage capstone — "Survive the viral link"** *(write-up: `learning/capstones/stage-6-viral-link.md`)*
- **Scenario:** A link goes viral: 5,000 redirects in one minute, while the click worker is down for part of it.
- **Deliver:** a load test with redirect p95 latency recorded before and during the worker outage; queue depth over time; the final counts compared with the number of requests sent; one poison message that lands in the DLQ and is redriven; and a decision record on whether the redirect path should run on Lambda or in a container.
- **Accept when:** redirect latency is not affected by the outage; the final count equals the requests sent exactly (no loss, no double counting); and the decision record states the numbers behind the choice.
- **Stretch:** repeat the test with a FIFO queue and compare the throughput and the guarantees.

---

## Stage 7 — Observability

**Goal:** answer "is it healthy, what is slow, why did it fail" from telemetry alone.

**Why it matters** *(illustrative scenario)*

> Users say "the links are slow sometimes." Without telemetry you guess: the database, the network, last night's deploy? Teams with traces, metrics and good alerts find the slow query in minutes, learn about a problem before users do, and can argue about reliability with numbers (SLOs) instead of opinions.

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

**Stage capstone — "Find the planted bug"** *(write-up: `learning/capstones/stage-7-planted-bug.md`)*
- **Scenario:** Something in the app got slower, or started failing for certain requests. You aren't told what or where.
- **Deliver:** ask Claude to plant a fault on a throwaway branch (`capstone/stage-7-fault`) without telling you; find it using only dashboards, traces and logs, without reading the diff first; write an incident note with a timeline, the evidence (a trace ID, a PromQL query), the root cause and the fix; and add an alert or SLO that would have caught it sooner.
- **Accept when:** you named the cause before reading the diff; the new alert fires when the fault is replayed; and the note says how long detection took.
- **Stretch:** add an error-budget burn-rate alert for the redirect SLO.

---

## Stage A3 — System design

**Goal:** design a system from requirements to a scalable, reliable architecture, back the design with numbers, and test its riskiest assumption on the real thing.

**Why it matters** *(illustrative scenario)*

> "Design a URL shortener" is one of the most common system design interview questions, because a simple product hides real problems: billions of reads, hot keys, unique ID generation, caching and analytics at scale. The same reasoning shows up at work whenever a feature meets real traffic: someone has to estimate the load, find the bottleneck before users do, and choose which trade-off to accept. Engineers who can do that on a whiteboard and then prove it with a load test are the ones trusted with big changes.

**Learn:** functional and non-functional requirements; back-of-the-envelope estimation (requests per second at average and peak, storage, bandwidth, read/write ratio); the latency numbers every engineer should know; vertical vs horizontal scaling; load balancing; caching (cache-aside, write-through, TTLs, invalidation, hot keys, stampede protection) and CDNs; database scaling (indexes, read replicas, partitioning and sharding, connection pooling); consistency models, CAP and PACELC; unique ID generation (random codes, counters, Snowflake-style IDs) and collision probability; rate-limiting algorithms (token bucket, sliding window); asynchronous processing; availability maths (nines, SLOs, redundancy); multi-region trade-offs; writing a design doc.

**Exercise**
- Write a design doc in `docs/design/` for 100 million new links and 10 billion redirects a month: requirements, your own estimates (peak redirect rate, five-year storage, cache size for the hottest links), a high-level diagram, the data model, ID generation and the collision maths for Teeny-URL's 7-character base62 codes, the read, write and analytics paths, and the failure modes.
- Measure the current read path: load-test redirects with k6 against your stage 4 or 5 deployment and find the bottleneck with stage 7's telemetry.
- Add a cache-aside layer for redirects (Redis in the cluster first, then try LocalStack's ElastiCache), with TTLs and invalidation on delete. Measure p95, p99 and database load before and after.
- Protect against a hot key and a cache stampede (request coalescing or early refresh) and show the effect under load.
- Move rate limiting from per-replica memory to a shared store with a token bucket or sliding window. This closes the "stateless processes" gap from the readiness audit.
- Optional: add an emulated read replica, route reads to it, and reason about replication lag for a link created a moment ago.

**Break it:** flush the cache under load and watch the database; make one link extremely hot; stop Redis and confirm redirects still work, degraded but not down; create a link and redirect to it immediately through a lagging replica.

**Checkpoint:** What is your peak redirect rate, and how did you get it? What is the probability of a code collision at your scale, and what happens when one occurs? Cache-aside or write-through: when each? What is a cache stampede, and what are two ways to prevent it? Where does CAP actually bite in Teeny-URL? Are random codes better or worse than a counter for a public shortener, and why?

**Done when:** the design doc has estimates and diagrams; load tests show the cache's effect on p99 and database load; redirects keep working when the cache is down; and the rate limiter holds across replicas.

**Gap:** Redis on LocalStack or in a local cluster behaves like the real thing but performs like your laptop. Load tests here show relative improvements, not production capacity.

**Stage capstone — "The design review"** *(write-up: `learning/capstones/stage-A3-design-review.md`)*
- **Scenario:** Teeny-URL is about to be featured on a big site, and traffic will be fifty times normal for a week. You present your design to a review panel; Claude plays the panel and asks hard questions.
- **Deliver:** the design doc updated for the spike; the riskiest assumption identified and tested with a load test; a capacity plan (what scales, by how much, and a rough monthly cost on a real cloud at list prices); and the panel's questions with your written answers.
- **Accept when:** every number in the doc traces back to an estimate or a measurement; the riskiest assumption was tested, not just argued; the design survives losing the cache and losing one replica; and every panel question has a written answer.
- **Stretch:** sketch a multi-region version and the consistency trade-offs it forces.

---

## Stage 8 — Delivery: CI/CD, GitOps and supply chain

**Goal:** every change is checked, built once, scanned, signed and deployed by automation, and rollback is a `git revert`.

**Why it matters** *(illustrative scenario)*

> "Deploy day" used to be a stressful ritual: someone running commands from a laptop, tested by hope. Mature teams make deployment boring: every merge is built once, tested, scanned, signed and rolled out by automation, and a rollback is a revert. Supply-chain problems (a vulnerable dependency, a tampered image) also turned "what exactly is running, and where did it come from?" into an everyday question.

**Learn:** pipeline stages; build once, promote many; immutable tags (the git SHA); GitOps (desired state lives in git and a controller reconciles the cluster); Argo CD or Flux; Kustomize overlays for environments; vulnerability scanning (Trivy), SBOMs (Syft), image signing (cosign); why cloud pipelines use OIDC instead of stored keys.

**Exercise**
- A GitHub Actions workflow: typecheck, lint, tests; build the image tagged with the git SHA; scan it; generate an SBOM; sign it.
- Run LocalStack in the job: install it with `npm install -g @localstack/lstk`, start with `lstk start`, and use `lstk reset --force` between suites. Use a CI auth token (not your personal one) stored as the repository secret `LOCALSTACK_AUTH_TOKEN`. There is no `lstk` GitHub Action yet; the older `setup-localstack` Action installs the deprecated CLI. Check how your 1,000 monthly CI credits are consumed before running on every push.
- Install Argo CD (or Flux) in the cluster, point it at a config path in git, and deploy through it.
- Promote by changing the image tag in a pull request; roll back by reverting it.

**Break it:** push a bad tag and watch the app go degraded, then revert; use a vulnerable base image and let the scan gate fail the build; change an image after signing and see the verification fail.

**Checkpoint:** What does the reconciliation loop do? Why immutable tags rather than `latest`? Push vs pull deployment? What does an SBOM let you answer after a new vulnerability is announced?

**Done when:** merging to `main` builds, scans, signs and deploys through the controller, and a revert rolls it back.

**Stage capstone — "A day of changes"** *(write-up: `learning/capstones/stage-8-day-of-changes.md`)*
- **Scenario:** Three pull requests land in one afternoon: an ordinary feature, a change that pulls in a vulnerable base image, and a release that passes the tests but breaks health checks in the cluster.
- **Deliver:** show the pipeline handling each: the first flows to the cluster through GitOps with no manual step; the second is blocked by the scan gate; the third is deployed, shows as degraded in the GitOps tool, and is reverted with `git revert`. Then answer, for one running pod: which commit, which SBOM and which signature.
- **Accept when:** all three behave as described with logs or screenshots as evidence; and the provenance answer is derived from artifacts rather than remembered.
- **Stretch:** add a staging overlay and promote to it by pull request before production.

---

## Stage 9 — Security and policy (deepening)

**Goal:** least privilege and guardrails by default, enforced by the platform, not by good intentions.

**Why it matters** *(illustrative scenario)*

> Real breaches are rarely one dramatic hack; they are a chain: an over-permissioned service, a secret in an environment variable, a container running as root, no network boundary. Each link was "fine" on its own. Platform guardrails (least privilege, admission policies, network rules) break the chain by default, so one mistake doesn't turn into a compromise.

**Learn:** least-privilege IAM (enforced); delivering secrets into the cluster (the External Secrets Operator reading your A1 secret store, or Sealed Secrets); Kubernetes RBAC and ServiceAccounts; NetworkPolicy; Pod Security Standards; policy engines (Kyverno or OPA Gatekeeper); verifying image signatures at admission.

**Exercise:** a minimal IAM role per workload; secrets delivered from Secrets Manager into the cluster; a scoped RBAC role for the CI deployer; a NetworkPolicy that lets only the app reach the database; admission policies that deny `:latest` tags, missing resource limits, root containers and unsigned images.

**Break it:** remove a permission and find the cause from logs alone; deploy something that violates each policy and read the denial; rotate a secret.

**Checkpoint:** How do you find which permission is missing? Why never `*:*`? What does an admission controller see that a pipeline doesn't? What does a NetworkPolicy need from the network plugin to work?

**Done when:** nothing runs with admin rights, every policy has a failing example you triggered, and a signed image is required.

**Stage capstone — "Assume breach"** *(write-up: `learning/capstones/stage-9-assume-breach.md`)*
- **Scenario:** Assume an attacker has code execution inside the Teeny-URL pod. What can they reach?
- **Deliver:** a before-and-after map of what they could do (read secrets, call cloud APIs, reach the database or other pods, start a privileged pod, deploy an unsigned image); an attack-drill script (`learning/capstones/stage-9-drill.sh`) that attempts each action from inside the pod and shows it blocked; and a short list of the risks that remain.
- **Accept when:** every blocked action is demonstrated with its denial message; the "before" map was written before hardening rather than reconstructed afterwards; and the remaining-risk list is honest.
- **Stretch:** rotate a "leaked" secret and measure the time from detection to a clean rollout.

---

## Stage 10 — Resilience and chaos (deepening)

**Goal:** find weaknesses on purpose, before an outage does.

**Why it matters** *(illustrative scenario)*

> Systems rarely fail the way you expect: the database gets slow instead of going down, a dependency throws errors for thirty seconds, a retry loop turns a blip into an outage. Teams that rehearse failure (game days, chaos experiments) find those weaknesses in daylight, with everyone awake, instead of at 3 a.m. with customers watching.

**Learn:** timeouts, retries with backoff and jitter, idempotency, circuit breakers, bulkheads; autoscaling; the chaos method (hypothesis, experiment, limited blast radius, learn); LocalStack's Chaos Engineering / FIS (AWS Fault Injection Service) to inject faults into emulated AWS services; load testing with k6.

**Exercise:** run a game day.
- Write three hypotheses, for example "redirects stay available when the queue is unavailable" or "p99 stays under your SLO with +200 ms database latency".
- Inject the faults with LocalStack FIS experiments (see the Chaos Engineering docs) and by killing pods; drive load with k6; watch your dashboards and alerts.
- Add or tune timeouts, retries and autoscaling, and write a short post-incident review.

**Break it:** retry without backoff and see the retry storm; remove a timeout and watch requests pile up.

**Checkpoint:** Why do retries need jitter and idempotency? What is a blast radius? When does autoscaling make an outage worse?

**Done when:** three experiments ran, at least one real weakness was found and fixed, and the game-day report is written.

**Stage capstone — "Is it ready for launch week?"** *(write-up: `learning/capstones/stage-10-launch-readiness.md`)*
- **Scenario:** A big launch is next week. A stakeholder asks whether Teeny-URL is ready and wants an answer they can act on.
- **Deliver:** a two-page reliability review: your SLOs, the three game-day experiments with hypothesis and result, what you fixed and how a re-run proved it, a risk register for what remains (likelihood, impact, cost to fix), and a clear recommendation: ship, ship with conditions, or wait.
- **Accept when:** at least one hypothesis was disproved, fixed and re-tested; the register has a cost estimate for each open risk; and the recommendation follows from the evidence.
- **Stretch:** add an on-call runbook for the top two risks and rehearse it once.

---

## Final capstone — platform day

**Goal:** prove the whole platform is reproducible, then feel what the emulator hides. Budget half a day or more.

**Do**
- From a clean checkout: `lstk terraform apply` builds the infrastructure, Argo CD syncs the app, and one command restores your lab from a snapshot.
- Run your stage 10 game day against it.
- Hold a final design review: compare your A3 design doc with what you actually built, and record where reality differed.
- Optional: deploy the same Terraform and manifests to a real cloud with Student Pack credits, or run your S5 playbook against a real VPS, then destroy it.

**Before any real-cloud step:** use a new or sandbox account; turn on MFA and don't use root; create a billing budget with an alert *before* creating resources; use SSO or a least-privilege user; check the current free-tier and credit terms; never commit credentials. Hourly-billed resources (NAT gateways, load balancers, managed databases, clusters) are the usual surprise.

**Observe and write down:** latency, real IAM denials, throttling and quotas, eventual consistency, node and network behavior, anything that worked locally and failed there, and what it cost.

**Done when:** a clean checkout rebuilds the platform, the game day report exists, and (if you did the real-cloud step) it is fully destroyed and you wrote a "what differed" note.

---

## What LocalStack won't teach you

- **Cost:** real pricing, free-tier limits and billing surprises.
- **Real performance and limits:** latency, throttling, quotas and cold starts.
- **Real nodes and networks:** the emulated EKS is k3d in Docker, so multi-zone scheduling, node failures, real load balancers and VPC behavior are not the real thing.
- **Real servers:** LocalStack's EC2 instances are Docker containers, so kernels, disks, reboots and firewalls need your local VM.
- **Security enforcement:** IAM enforcement is an emulation.

## Optional certification path

Cloud-native: KCNA (Kubernetes and Cloud Native Associate) after stages 2–4, then CKAD or CKA. Infrastructure as code: HashiCorp Terraform Associate after stage 3. Cloud provider basics, if you want them: AWS Cloud Practitioner, then Developer Associate. Linux and servers: LFCS (Linux Foundation Certified System Administrator) or LPIC-1 after S1–S3. System design and architecture: no certificate replaces practice; your A2 proposal and A3 design doc are portfolio pieces, and AWS Solutions Architect Associate covers some of the cloud side.

## Useful references

- LocalStack docs: https://docs.localstack.cloud
- `lstk` docs: https://docs.localstack.cloud/aws/developer-tools/running-localstack/lstk/ (migration guide: `…/lstk/migration/`)
- Kubernetes: https://kubernetes.io/docs/ · k3d: https://k3d.io · Helm: https://helm.sh/docs/
- The twelve-factor app: https://12factor.net · CNCF landscape: https://landscape.cncf.io
- OpenTelemetry: https://opentelemetry.io/docs/ · Argo CD: https://argo-cd.readthedocs.io
- OpenSSH: https://www.openssh.com/manual.html · systemd: https://www.freedesktop.org/software/systemd/man/ · Ansible: https://docs.ansible.com · libvirt: https://libvirt.org/docs.html
- System design: https://github.com/donnemartin/system-design-primer · Patterns: https://microservices.io/patterns/ · C4 model: https://c4model.com · ADRs: https://adr.github.io
- Secrets: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html · SOPS: https://github.com/getsops/sops · Book: *Designing Data-Intensive Applications* (Martin Kleppmann)
- Quick checks: `lstk status`, `lstk logs --tail 20`, `lstk aws s3 ls`, `kubectl config current-context`, `kubectl get pods -A`, `ssh lab`, `systemctl status <unit>`

---

## Session log

| Date | Stage | What happened | Next step |
|---|---|---|---|
| 2026-10-29 | — | Roadmap created. Environment checked: only Docker, Node and pnpm installed. | Stage 0: install tools, start LocalStack |
| 2026-10-29 | — | Plan confirmed as the LocalStack Student plan (Ultimate-equivalent). Persistence and IAM enforcement decisions resolved; gap notes updated. | Stage 0 |
| 2026-10-29 | 0 | Rewrote stage 0 and every CLI reference for `lstk` (it replaces `localstack`, `awslocal`, `tflocal`, `cdklocal` and `samlocal`, all deprecated). Verified without logging in: `lstk doctor` passes; `lstk aws` and `lstk status` fail cleanly while LocalStack is down; `lstk setup aws` output (in a throwaway home); a project-local `.lstk/config.toml` is picked up. | Run `lstk login`, then verify start, bucket and persistence |
| 2026-10-31 | all | Re-scoped from "learn AWS" to **cloud-native skills** that use the Student plan's benefits (EKS, ECS, IAM enforcement, FIS chaos, snapshots, CI credits). New stage order: primitives, containers, IaC, Kubernetes local then on EKS, serverless (deepening), observability, GitOps and supply chain, security (deepening), chaos (deepening). Added a benefit map and a cloud-native readiness audit of Teeny-URL. User had logged in and started LocalStack (Student plan recognized, no resources). Verified on the running instance: `sts get-caller-identity`, bucket round trip, `logs --tail`, `snapshot list`, and list calls for EKS, ECS, ECR, Lambda, FIS, RDS, DynamoDB, SQS and Step Functions. | Stage 0 step 3: project config with persistence, then your own bucket |
| 2026-10-31 | all | Added **Track S (server operations)**: S1 SSH, S2 Linux administration, S3 traditional deployment, S4 hardening (deepening), S5 Ansible and EC2 on LocalStack. Practice target is a local KVM VM; LocalStack EC2 covers the cloud side. Checked: KVM and libvirt work without sudo; `virt-install` works only through the system Python (Linuxbrew's lacks `gi`); LocalStack EC2 answers and the two launchable images exist. No Track S command has been run yet. | Stage 0 step 3, then S1 when you get there |
| 2026-10-31 | all | Every stage now opens with a **"Why it matters" real-world story** and ends with a **stage capstone** (scenario, deliverables, acceptance criteria, stretch). The closing capstone is renamed the **final capstone**. Added rules for Claude acting as stakeholder and planting faults only on throwaway branches or lab machines. Time estimate is now roughly 100–180 hours. | Stage 0 step 3, then S1 when you get there |
| 2026-10-31 | all | Added the **interactive page** `learning/roadmap.html`, generated from this file by `learning/build-roadmap-html.mjs` (no dependencies, works offline). It shows the path, stage pages with stories, checklists and capstone cards, per-stage status and notes saved in the browser, search, dark mode and a mobile layout. Capstone "Accept when" criteria are now `; `-separated so they split into checkboxes. Tested in the built-in browser. | Stage 0 step 3, then S1 when you get there |
| 2026-10-31 | all | Added **Track A (application architecture and design)**: A1 configuration and secrets management (after stage 2), A2 architectural patterns (after stage 5) and A3 system design (after stage 7), each with a story, exercises, drills, checkpoint and stage capstone. Linked them from stages 3, 4, 9 and the final capstone, and added audit rows, decisions, benefit-map rows and references. Checked on LocalStack: Secrets Manager, SSM, KMS, ElastiCache, EventBridge and CloudTrail answer. No Track A command has been run yet. | Stage 0 step 3 |
