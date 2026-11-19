# Deploying CampusSport to a VPS with Ansible

These playbooks turn a fresh Ubuntu 24.04 (or Debian 12) VPS into a CampusSport server: system updates, firewall, SSH hardening, swap, Docker, then the container stack from `../docker-compose.yml` behind Caddy with Let's Encrypt certificates, plus nightly database backups.

```
ansible/
├── site.yml              full install: server preparation + deploy
├── deploy.yml            update the application only
├── inventory/hosts.example.yml
├── group_vars/all/main.yml   every setting, with defaults
└── roles/
    ├── common            apt upgrade, base packages, time zone, unattended upgrades, swap file
    ├── security          ufw (22, 80, 443 tcp/udp), fail2ban, key-only SSH
    ├── docker            Docker Engine + Compose plugin from Docker's repository, log rotation
    ├── campussport       app user, git checkout, .env, docker compose up, health check, TOTP enrolment
    └── backups           nightly pg_dump of the app and Keycloak databases (14 days)
```

## 1. Prerequisites

**Control machine** (where you run Ansible). On Windows use WSL (Ubuntu):

```bash
sudo apt install ansible            # ansible-core 2.16+ (or: pipx install ansible)
cd ansible
ansible-galaxy collection install -r requirements.yml
```

WSL mounts `C:\` as world-writable, so Ansible ignores `ansible.cfg` there. Either copy the repo into the WSL home (`~/CampusSport`, recommended) or prefix commands with `ANSIBLE_CONFIG=$PWD/ansible.cfg`.

**VPS**: Ubuntu 24.04 / Debian 12, at least 2 vCPU and 4 GB RAM (Keycloak and the image builds; the playbook adds 2 GB of swap), SSH access as `root` or a sudo user **with an SSH key**: the `security` role turns off password logins (`server_harden_ssh: false` to skip that), so check `ssh -i <key> <user>@<vps>` works first.

**DNS**: two A records pointing at the VPS, for example `campussport.example.com` and `auth.campussport.example.com`. Caddy requests the certificates on the first start, so DNS must resolve before you deploy.

## 2. Configure

```bash
cp inventory/hosts.example.yml inventory/hosts.yml     # git-ignored
```

Set at least `ansible_host`, `campussport_domain`, `campussport_auth_domain`, `campussport_acme_email` and `campussport_mode`. Everything else is in `group_vars/all/main.yml` and can be overridden per host.

| Setting | `demo` | `production` |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| Example data (sports, resources, users) | loaded on every deploy | off (`campussport_seed_example_data: true` to load it once) |
| Development sign-in on `/login` and `/admin/login` | on | off |
| Keycloak realm | with test users `student1`, `teacher1`, `admin1` | realm only: create users in the Keycloak console, or point `OIDC_*` at the university IdP |
| Mailpit (catch-all SMTP) | on | off: set `campussport_smtp_host/port/from` |
| HTTPS, secure cookies, generated secrets | yes | yes |

**Private repository:** create a read-only deploy key in GitHub (*Settings → Deploy keys*), then set:

```yaml
campussport_repo_url: git@github.com:MaketaCampusSport/CampusSport.git
campussport_deploy_key_file: ~/.ssh/campussport_deploy
```

**Secrets** (database, JWT, QR HMAC, OIDC client, Keycloak admin, demo user password) are generated on the first run and stored on the control machine in `ansible/secrets/<host>/` (git-ignored). Keep a copy of that folder: if you lose it, the next run generates new values that no longer match the existing database. To manage them yourself, override the `campussport_*_password` / `*_secret` variables, for example with `ansible-vault`.

## 3. Install

```bash
ansible-playbook site.yml
```

The last task prints the URLs, the Keycloak console password, and, in demo mode, the password of the test users. A first run takes about 10 minutes, most of it building the images.

Then open `https://<domain>`:

- **demo:** use *Autentificare de dezvoltare* on `/login` (student, teacher, external) or `/admin/login` (admin), or sign in through Keycloak as `student1` / `teacher1` / `admin1`.
- **production:** sign in through SSO. Administrators also need TOTP (see below).

## 4. Everyday operations

```bash
ansible-playbook deploy.yml                                    # deploy the latest commit of campussport_repo_version
ansible-playbook deploy.yml -e campussport_repo_version=v1.0   # a tag, branch or commit
ansible-playbook deploy.yml -e campussport_mode=production      # switch mode (rewrites .env, restarts)

# TOTP for administrators (after the admin has signed in once through SSO, or exists in the seed data)
ansible-playbook deploy.yml --tags totp -e '{"campussport_totp_admins": ["admin1@campussport.example"]}'
```

Each TOTP run replaces the admin's secret; scan the printed `otpauth://` URI with an authenticator app.

On the server (`ssh` in, then `cd /opt/campussport`):

```bash
docker compose ps                         # state and health of every service
docker compose logs -f api worker web     # logs
docker compose exec postgres psql -U campussport campussport
docker compose run --rm seed              # reload the example data (demo, or SEED_EXAMPLE_DATA=true)
sudo /usr/local/bin/campussport-backup    # back up now; files in /var/backups/campussport
```

Mailpit (demo): `ssh -L 8025:127.0.0.1:8025 root@<vps>`, then open http://localhost:8025.

## 5. Notes

- The Keycloak realm is imported once, when its database is empty. If you change the domain later, update the client's redirect URIs in the Keycloak console (or drop the `keycloak` database to re-import).
- Restore a backup: `gunzip -c FILE.sql.gz | docker compose exec -T postgres psql -U campussport -d campussport`.
- Port 443/udp is open for HTTP/3. Only 22, 80 and 443 are reachable from outside; Postgres, Redis, the API and Keycloak are only on the Docker network.
- The worker (notifications, waitlist offers, no-shows) runs in every mode; push notifications need `campussport_vapid_public_key` / `_private_key` (`npx web-push generate-vapid-keys`).
