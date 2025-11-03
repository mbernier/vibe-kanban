# Publishing to npm - Quick Guide

## Current Status
- **Latest npm version**: `0.0.114`
- **Current local version**: `0.0.113` (root package.json), `0.0.114` (npx-cli/package.json)
- **New features**: Ticket template system merged to main

## Publishing Process

### Step 1: Create a Pre-Release

**Direct link**: https://github.com/mbernier/vibe-kanban/actions/workflows/pre-release.yml

1. Click "Run workflow" button (top right)
2. Select:
   - **Version type**: `patch` (for 0.0.114 → 0.0.115)
   - **Branch**: `main`
3. Click the green "Run workflow" button

**Note**: The workflow will automatically check the latest npm version (`0.0.114`) and bump to `0.0.115`

This will:
- ✅ Check latest npm version (`0.0.114`)
- ✅ Bump to `0.0.115` (patch increment)
- ✅ Update all package.json files and Cargo.toml files
- ✅ Build frontend and backend
- ✅ Create platform-specific binaries
- ✅ Package everything
- ✅ Create a GitHub pre-release with tag `v0.0.115-TIMESTAMP`

### Step 2: Verify Pre-Release

1. Go to GitHub Releases: https://github.com/mbernier/vibe-kanban/releases
2. Find the pre-release `v0.0.115-TIMESTAMP`
3. Verify:
   - ✅ Frontend dist zip file
   - ✅ npm package (.tgz file)
   - ✅ Release notes look good

### Step 3: Convert to Full Release

1. On the pre-release page, click "Edit release"
2. Uncheck "Set as a pre-release"
3. Optionally update release notes
4. Click "Update release"

This automatically triggers the `publish.yml` workflow which will:
- ✅ Download the package from the release
- ✅ Verify package integrity
- ✅ Publish to npm registry as `@mkbernier/vibe-kanban@0.0.115`
- ✅ Update release description with "Published to npm registry"

### Step 4: Verify Publication

```bash
npm view @mkbernier/vibe-kanban version
# Should show: 0.0.115
```

## Manual Alternative (if needed)

If you need to publish manually:

```bash
# 1. Update versions
npm version patch --no-git-tag-version
cd npx-cli && npm version $(node -p "require('../package.json').version") --no-git-tag-version --allow-same-version
cd ../frontend && npm version $(node -p "require('../package.json').version") --no-git-tag-version --allow-same-version
cd ..
cargo set-version --workspace $(node -p "require('./package.json').version")

# 2. Build
npm run build:npx

# 3. Pack
cd npx-cli
npm pack

# 4. Publish (requires npm login)
npm publish --access public
```

## Version Strategy

- **patch** (0.0.x): Bug fixes, minor features (like template system)
- **minor** (0.x.0): Significant new features
- **major** (x.0.0): Breaking changes

Since we added a new feature (template system), use **patch** → `0.0.115`

