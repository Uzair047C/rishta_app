# Security TODOs — Credentials to Rotate & History Purge

## ⚠️ Credentials that MUST be rotated immediately

The following credentials have been exposed in the working tree and/or git history. Treat them as compromised.

| Credential | Location found | Action required |
|------------|----------------|-----------------|
| **Firebase Service Account** (project ID, client email, private key) | `backend/.env`, git history | Generate new service account in Firebase Console → Project Settings → Service Accounts. Update `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` in all environments. |
| **Stream Chat Secret** | `backend/.env`, git history | Rotate in Stream Dashboard → Keys → Regenerate secret. Update `STREAM_API_SECRET`. |
| **JWT Secret** | `backend/.env`, git history | Generate new 64+ char random string. Update `JWT_SECRET` everywhere. All existing access/refresh tokens will be invalidated. |
| **Database Password** | `backend/.env`, git history | Rotate PostgreSQL user password. Update `DATABASE_URL`. |
| **RevenueCat Webhook Secret** | `backend/.env` (if set), git history | Regenerate in RevenueCat Dashboard → Webhooks. Update `REVENUECAT_WEBHOOK_SECRET`. |
| **AWS Keys** (if used for Rekognition/S3) | `backend/.env`, git history | Rotate in AWS IAM → Access Keys. Update `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. |
| **Admin Token** | `backend/.env` (if set), git history | Replace with `ADMIN_USER_IDS` (comma-separated UUIDs) or rotate token. |

## 🔍 How to verify no other secrets remain

```bash
# Scan working tree
gitleaks detect --source . --verbose

# Scan entire git history
gitleaks detect --source . --log-opts="--all" --verbose
```

If gitleaks is not installed:
```bash
# macOS
brew install gitleaks

# Linux/WSL
curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz | tar -xz
sudo mv gitleaks /usr/local/bin/
```

## 🧹 Git history purge commands

**⚠️ WARNING: These commands rewrite git history. All collaborators must re-clone. Coordinate with your team before running.**

### Option A: git-filter-repo (recommended, faster)

```bash
# Install
pipx install git-filter-repo

# Create a backup first
git clone --mirror <remote-url> rishta-backup.git

# Run filter-repo to remove sensitive paths from ALL history
cd rishta-backup.git
git filter-repo \
  --path .claude --invert-paths \
  --path .antigravity --invert-paths \
  --path memory --invert-paths \
  --path .idea --invert-paths \
  --path logs_problem.logs --invert-paths \
  --path "debug_*.py" --invert-paths \
  --path "app/get-pip.py" --invert-paths \
  --path .gitignore.backup --invert-paths \
  --path ".env" --invert-paths \
  --path "backend/.env" --invert-paths \
  --force

# Force push to remote (requires --force-with-lease)
git push --force-with-lease --all
git push --force-with-lease --tags
```

### Option B: BFG Repo-Cleaner (simpler for large repos)

```bash
# Download BFG
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Create a mirror clone
git clone --mirror <remote-url> rishta-backup.git
cd rishta-backup.git

# Remove files by path pattern
java -jar ../bfg-1.14.0.jar --delete-folders .claude --delete-folders .antigravity --delete-folders memory --delete-folders .idea
java -jar ../bfg-1.14.0.jar --delete-files logs_problem.logs --delete-files debug_*.py --delete-files "app/get-pip.py" --delete-files .gitignore.backup --delete-files .env --delete-files "backend/.env"

# Clean up refs
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force-with-lease --all
git push --force-with-lease --tags
```

### Post-purge verification

```bash
# Verify sensitive files are gone from history
git log --all --full-history -- .env backend/.env .claude .antigravity memory .idea logs_problem.logs debug_*.py app/get-pip.py .gitignore.backup

# Should return empty
```

## 📋 Checklist after rotation

- [ ] Firebase service account regenerated and added to all environments (local, CI, staging, prod)
- [ ] Stream secret regenerated and added to all environments
- [ ] JWT secret regenerated (invalidates all user sessions — plan for user logout)
- [ ] Database password rotated and connection strings updated
- [ ] RevenueCat webhook secret regenerated
- [ ] AWS keys rotated (if applicable)
- [ ] Git history purged using one of the methods above
- [ ] All team members notified to re-clone
- [ ] CI/CD secrets updated in GitHub/GitLab/Azure DevOps
- [ ] `.env.example` updated with placeholder values (no real secrets)
- [ ] `SECURITY_TODO.md` archived or removed after completion