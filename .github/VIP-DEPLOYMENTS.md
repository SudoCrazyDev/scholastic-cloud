# VIP / Self-Hosting Client Deployments

When you push updates to `master`, the **App** and **API** are deployed to your production environment **and** to every VIP/self-hosting client. Each client has their own GitHub Environment with their own hosting credentials.

## How it works

- **App** (`deploy-app.yml`): Builds the app with that client’s config (e.g. `.env`), then deploys to their FTP server. One matrix job per client.
- **API** (`deploy-api.yml`): Builds the API once, then deploys the same package to each client’s server via SFTP/SSH. One build job, then one deploy job per client.

Both workflows use a **matrix** of `deployment_target` values (e.g. `prod`, `vip-client-1`). Each value must match a **GitHub Environment** name. That environment’s secrets are used for that deployment.

## Adding a new VIP/self-hosting client

### 1. Create a GitHub Environment

1. Repo → **Settings** → **Environments** → **New environment**.
2. Name it exactly what you’ll use in the matrix (e.g. `vip-client-1` or `acme-corp`).
3. (Optional) Add protection rules (e.g. required reviewers, deployment branches).

### 2. Add secrets for the new environment

**For the App** (FTP), add these secrets to that environment:

| Secret                   | Description                          |
|--------------------------|--------------------------------------|
| `ENV_FILE_CONTENT`       | Full contents of the app’s `.env` (e.g. API URL for that client). |
| `DEPLOYMENT_SERVER`      | FTP host.                            |
| `DEPLOYMENT_USERNAME`    | FTP user.                            |
| `DEPLOYMENT_PASSWORD`    | FTP password.                        |
| `DEPLOYMENT_DIRECTORY`   | Remote path for the app (e.g. `/public_html/app`). |

**For the API** (SFTP/SSH), add these secrets to that environment:

| Secret                      | Description                                      |
|-----------------------------|--------------------------------------------------|
| `DEPLOYMENT_SSH_SERVER`     | SSH/SFTP host.                                   |
| `DEPLOYMENT_SSH_USERNAME`   | SSH user.                                        |
| `DEPLOYMENT_SSH_PASSWORD`   | SSH password.                                    |
| `DEPLOYMENT_SSH_PORT`       | SSH port (e.g. `22`).                            |
| `DEPLOYMENT_REMOTE_DIR`     | Directory on the server where the API is deployed (e.g. `~/domains/client.com/public_html/v2/`). The zip is uploaded here and extracted here. **Required for all API targets**, including `prod` (e.g. `~/domains/scholastic.cloud/public_html/v2/`). |

### 3. Add the client to the workflow matrices

Edit both workflow files and add the new environment name to the matrix:

**`.github/workflows/deploy-app.yml`**

```yaml
matrix:
  deployment_target: [prod, vip-client-1, vip-client-2]  # add new slug
```

**`.github/workflows/deploy-api.yml`**

```yaml
matrix:
  deployment_target: [prod, vip-client-1, vip-client-2]  # add new slug
```

Commit and push. The next run (on push to `master` or manual dispatch) will deploy to the new client as well.

## Naming

- Use a short, stable slug for the environment (e.g. `vip-client-1`, `acme-corp`). It appears in the workflow matrix and in the Actions UI.
- You can rename later by creating a new environment, moving secrets, updating the matrix, and removing the old environment.

## Failures

- Both workflows use `fail-fast: false`, so a failure for one client does not stop deployments to the others.
- Check the Actions run and open the failed job for that client to see logs and fix that client’s credentials or paths.

### "dial tcp ... i/o timeout" on API (SFTP) deploy

This means the GitHub Actions runner **cannot reach your server** on the SSH port. The TCP connection times out before it is established.

**Common causes:**

1. **Firewall / security group**  
   The server only allows SSH from certain IPs. GitHub-hosted runners use **dynamic IPs** that change. You must either:
   - Allow inbound SSH (port 22 or your `DEPLOYMENT_SSH_PORT`) from a range that includes GitHub's IPs (see [GitHub's IP ranges](https://api.github.com/meta), keys `actions` and `hooks`), or
   - Use a **self-hosted runner** in a network that can reach the server (e.g. same VPC or behind your firewall).

2. **Wrong host or port**  
   Double-check `DEPLOYMENT_SSH_SERVER` and `DEPLOYMENT_SSH_PORT` in the environment secrets. Ensure the server is up and SSH is listening on that port.

3. **Network / hosting restrictions**  
   Some hosts block or throttle SSH from cloud IPs. Confirm with your provider that outbound SSH from GitHub's runners is allowed to your server.

The workflow uses a 120s connection timeout; if the problem is firewall, increasing it will not help until the server is reachable.

## First-time setup for a client

1. Create the environment and secrets (steps 1–2 above).
2. Add the client to both matrices (step 3).
3. Ensure their server has:
   - **App**: FTP access and the target directory writable.
   - **API**: SSH/SFTP access, PHP 8.2+, Composer dependencies (or we deploy with vendor), and a `.env` on the server (or it will be created/restored from backup on first deploy). The `DEPLOYMENT_REMOTE_DIR` must exist and be writable.

After that, every push to `master` that touches `app/**` or `api/**` will deploy to prod and to all listed VIP clients.
