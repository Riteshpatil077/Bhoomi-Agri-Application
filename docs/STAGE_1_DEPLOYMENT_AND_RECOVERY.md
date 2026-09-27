# Bhoomi Stage 1 AWS deployment and recovery runbook

Status: **runbook drafted; cloud deployment and restore drill not performed**. This project checkout has no AWS account, target region, domain, or production secrets configured. Treat the commands below as operator steps after those values are approved and provisioned.

## Stage 1 architecture

- Flask API and Celery worker/beat run as separate non-root containers behind an HTTPS load balancer.
- PostgreSQL runs on private Amazon RDS subnets with encryption at rest using a customer-managed KMS key, automated backups, deletion protection, and no public endpoint.
- Redis is private and authenticated; it is not exposed publicly.
- Verification documents use a private S3 bucket with Block Public Access, bucket-owner enforced object ownership, SSE-KMS by default, TLS-only bucket policy, and short-lived presigned URLs. Public media uses a separate bucket and policy.
- Runtime secrets live in AWS Secrets Manager and are injected into the service at runtime. They are not checked into the repository, container image, or CI logs.
- CloudWatch captures service, load balancer, RDS, Redis, and worker health. Sentry receives application exceptions with secrets and personal data scrubbed.

## Provisioning and release sequence

1. Select the AWS account, region, DNS name, RPO/RTO, data-retention window, and KMS key owners. Create isolated network subnets and security groups. Only the load balancer accepts public HTTPS; app tasks, RDS, and Redis remain private.
2. Create separate private-verification and public-media S3 buckets. Enable S3 Block Public Access, versioning where retention policy permits, default SSE-KMS, and deny non-TLS requests. Deny public access to the verification bucket. Grant the app task role only the bucket actions and prefixes it needs.
3. Create encrypted RDS PostgreSQL with private networking, automatic backups, deletion protection, and a Secrets Manager managed credential. Set backup retention and maintenance windows to the approved policy. Create private Redis with auth and encryption in transit/at rest.
4. Add production secrets and provider credentials to Secrets Manager. Configure `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `JWT_SECRET_KEY`, storage bucket names, KMS key IDs, CORS origins, and Sentry DSN from secret references. Use unique high-entropy secrets and never reuse development values.
5. Build and scan an immutable backend image, then deploy API and worker services. Configure health checks against `/healthz` and `/readyz`, graceful shutdown, resource limits, autoscaling bounds, and alarms for 5xx rate, latency, task restarts, queue depth, DB connections/storage, and backup failures.
6. Before routing traffic, run `flask db upgrade` once as a release job with the production configuration; verify `/readyz`, authentication, role checks, private upload URL generation, and upload/download permissions with a designated test account. Run `flask create-super-admin` interactively as a one-time protected bootstrap, then verify it created exactly one account and remove bootstrap access.
7. Route a small canary share to the release. Watch alarms and application logs, then increase traffic only after smoke checks pass. Keep the previous image available for rollback; apply only backward-compatible migrations while both versions may run.

## Mandatory RDS backup restore drill

Perform this before production sign-off and repeat on the approved cadence:

1. Record the source DB identifier, snapshot identifier, UTC start time, expected RPO/RTO, and the operator. Do not restore over production.
2. Restore the selected automated/manual snapshot to a new isolated, encrypted, private **drill** RDS instance using the approved KMS key and network rules. Keep deletion protection enabled until the drill is signed off.
3. Point a one-off application task at the restored instance using a separate drill secret. Confirm the schema migration head and query representative user, farm, plot, verification metadata, and audit records without exporting personal data.
4. Run read-only application health checks and verify the restored DB is isolated from production services and outbound integrations. Measure restore time and estimate data loss against the snapshot timestamp.
5. Record pass/fail, measured RTO/RPO, snapshot age, observed issues, and remediation owner in the operations log. If the result misses objectives, fix backup retention/automation and repeat.
6. After evidence is recorded, delete the drill instance and temporary secret using the approved change procedure. Preserve the snapshot and drill evidence according to retention policy.

## Release gate

Production release is not complete until the deployment smoke check and a successful restore drill are recorded by the operating team. This document is a procedure; it is not evidence that cloud resources exist or that a drill has passed.
