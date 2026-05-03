# Phase 4: Desktop Runtime & Packaging

## Overview
Tauri desktop application setup for portable distribution on USB drives and local systems.

## Desktop App Structure

```
apps/desktop/
├── src-tauri/
│   ├── tauri.conf.json       # Tauri app configuration
│   ├── src/
│   │   ├── main.rs           # Rust entry point
│   │   └── lib.rs            # Rust module definitions
│   └── Cargo.toml            # Rust dependencies
├── src/
│   └── main.tsx              # React entry point (shared with web)
└── package.json              # Node dependencies
```

## Tauri Configuration

### Key Settings
- **Window**: 1200x800px (min 800x600)
- **Frontend**: Points to web app build output
- **Dev Server**: http://localhost:5173

### Permissions (Minimal)
- **Filesystem**: Read/write for data, config files
- **HTTP**: API communication only
- **Dialog**: File open/save dialogs
- **Window**: Window management
- **Shell**: Launch external applications (if needed)

### Security
- CSP disabled (Tauri handles security)
- No arbitrary code execution
- API calls only to configured backend

## Runtime Bridge

### Desktop ↔ Web Communication
```typescript
// Detect desktop environment
const isDesktop = '__TAURI__' in window;

// Use Tauri API for file operations
if (isDesktop) {
  const data = await invoke('get_app_data');
}

// Use standard APIs for web
else {
  const data = await fetch('/api/app-data');
}
```

### Offline Capability
- Tauri apps run locally (no internet required)
- Local API server (optional sidecar)
- Database bundled with app
- Automatic sync when online

## Packaging & Distribution

### Build Process
```bash
# Production build
npm run tauri build

# Outputs:
# - Linux: .deb, .tar.gz, .rpm
# - macOS: .dmg, .app
# - Windows: .msi, .exe
```

### Portable Build
```bash
# Create portable executable (no installer)
# For USB deployment, use Windows Portable edition
```

### System Requirements
- **Windows**: Windows 7+ (x64)
- **macOS**: 10.15+ (Intel/Apple Silicon)
- **Linux**: Ubuntu 16.04+ (various distros)

## Health Checks

### Startup Verification
1. Window creation succeeds
2. Web app loads from bundled assets
3. API connectivity check (if needed)
4. Database initialization
5. User session restore (if applicable)

### Runtime Monitoring
- Window close/minimize handling
- Background task management
- Memory usage limits
- Disk space monitoring

## Offline Mode

### Features
- Full app functionality without internet
- Local data storage (SQLite/IndexedDB)
- Automatic sync queue
- Conflict resolution on reconnect

### Sync Strategy
```
Offline Changes:
1. Store locally with metadata
2. Queue for upload
3. On reconnect: upload queue
4. Server validation
5. Conflict resolution
6. Refresh local cache
```

## Logging & Diagnostics

### Desktop-specific Logs
- App startup messages
- Window events
- File operations
- API errors
- Memory/performance metrics

### Log Location
```
Windows: %APPDATA%/Tuari/logs/
macOS:   ~/Library/Application Support/Tuari/logs/
Linux:   ~/.config/Tuari/logs/
```

## Development Workflow

### Local Development
```bash
# Terminal 1: Start web dev server
npm run dev

# Terminal 2: Start Tauri development
npm run tauri dev
```

### Testing
```bash
# Run tests in Tauri context
npm run tauri test

# Check permissions
npm run tauri permission:check
```

## Release Process

### Pre-release Checklist
- [x] Typecheck passes
- [x] Tests passing
- [x] Performance benchmarks acceptable
- [ ] Installer signing certificates ready
- [ ] Code signing setup complete
- [ ] Update server configured (optional)

### Release Steps
1. Bump version in tauri.conf.json
2. Build for all platforms
3. Sign executables
4. Create release notes
5. Upload to distribution channel
6. Update version manifest

## Distribution Channels

### Direct Download
- GitHub Releases
- Company website
- Email/USB for offline delivery

### Update System
- Built-in updater (optional)
- Check for updates on startup
- Download in background
- Restart to install

## Known Limitations
- Web APIs not available (localStorage is local)
- File dialog instead of system file picker (in some cases)
- No background service (app must run)
- Single window only (configurable)

## Performance Targets
- Startup: <3 seconds
- Initial load: <2 seconds
- API response: <1 second
- Memory: <200MB idle

## Next Steps (Phase 5)
1. Build and test on Windows
2. Build and test on macOS
3. Build and test on Linux
4. Create installer packages
5. Test portable USB distribution
6. Setup update mechanism
7. Create deployment documentation

## Security Considerations
- App signed with trusted certificate
- No untrusted code execution
- Encrypted local storage (optional)
- HTTPS for remote API calls
- Regular dependency updates

## Monitoring in Production
- Error reporting (Sentry/similar)
- Usage analytics (privacy-respecting)
- Crash dumps
- Performance metrics
