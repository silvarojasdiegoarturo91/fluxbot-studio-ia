# Phase 0 Test Suite

## Overview
Comprehensive test coverage for Phase 0 Foundation to ensure critical authentication, navigation, and API connectivity functionality remains stable across future changes.

## Test Organization

### `auth-jwt.test.ts`
**Purpose:** JWT session token validation  
**Coverage:**
- JWT token decoding and claim extraction
- Audience (aud) validation against API key
- Signature verification with HS256 HMAC
- Clock tolerance (10 second window for nbf/iat/exp)
- Error handling for malformed/expired tokens
- Bearer header parsing

**Why it matters:** The authentication flow is the entry point to the embedded app. JWT validation failures cause 401 errors that block access completely.

### `navigation-params.test.ts`
**Purpose:** Query parameter preservation across navigation  
**Coverage:**
- Preservation of shop/host/embedded params in URLs
- Back button navigation maintaining session context
- Quick link navigation with query strings
- Auth redirect prevention when shop param present
- Dev mode auto-complete of shop parameter

**Why it matters:** Losing embedded query parameters triggers re-authentication loops. Every navigation must preserve shop context.

### `shopify-connection.test.ts`
**Purpose:** Admin GraphQL API connectivity  
**Coverage:**
- Shop data query structure
- Response parsing for shop info (name, domain, plan)
- GraphQL error detection and handling
- Connection state validation
- Shop domain format validation
- Network error handling

**Why it matters:** Proves the app can successfully communicate with Shopify Admin API, which is required for all merchant-facing features.

### `environment-config.test.ts`
**Purpose:** Environment variable validation  
**Coverage:**
- Required Shopify credentials (API key, secret, app URL, scopes)
- Database URL configuration
- API key/secret format validation
- App URL HTTPS enforcement
- Scopes parsing and required scope verification
- Missing variable detection
- Shop domain configuration

**Why it matters:** Misconfigured environment variables cause cryptic runtime errors. These tests catch configuration issues at test time.

### `build-validation.test.ts`
**Purpose:** Project structure and build configuration  
**Coverage:**
- TypeScript configuration (strict mode)
- Project structure validation (app/, routes/ directories)
- All required admin routes exist
- Build scripts and dependencies present
- Git configuration (.gitignore)
- .env.example documentation
- Shopify API version (2026-01)
- Polaris integration

**Why it matters:** Ensures the project maintains its expected structure and no critical files are accidentally deleted or moved.

## Running Tests

### Install dependencies first
```bash
npm install
```

### Run all tests
```bash
npm test
```

### Run tests in watch mode (auto-rerun on changes)
```bash
npm run test:watch
```

### Run tests with UI viewer
```bash
npm run test:ui
```

### Run with coverage report
```bash
npm run test:coverage
```

## Test Results Interpretation

### Success criteria
✅ All tests passing  
✅ Coverage >80% on critical auth/navigation code  
✅ No TypeScript errors in test files  

### When tests fail
1. **JWT tests fail:** Check system clock synchronization (`timedatectl`), verify SHOPIFY_API_SECRET matches app config
2. **Navigation tests fail:** Inspect route files for missing location.search preservation
3. **Shopify connection tests fail:** Verify GraphQL query structure in `app._index.tsx`
4. **Environment tests fail:** Check `.env.local` has all required variables from `.env.example`
5. **Build tests fail:** Verify project structure hasn't changed, check tsconfig.json exists

## Adding New Tests

### For new routes
Add navigation param preservation tests in `navigation-params.test.ts`:
```typescript
it("should preserve query on new route", () => {
  const backUrl = `/app${mockEmbeddedQuery}`;
  expect(backUrl).toContain("shop=");
});
```

### For new environment variables
Add validation in `environment-config.test.ts`:
```typescript
it("should have NEW_VAR configured", () => {
  expect(process.env.NEW_VAR).toBeDefined();
});
```

### For new GraphQL queries
Add response parsing tests in `shopify-connection.test.ts`:
```typescript
it("should parse new query data", () => {
  const payload = mockResponse;
  expect(payload.data?.newField).toBeDefined();
});
```

## CI/CD Integration

Add to GitHub Actions workflow:
```yaml
- name: Run Phase 0 Tests
  run: npm test
  
- name: Generate Coverage Report
  run: npm run test:coverage
  
- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

## Test Philosophy

**Unit tests over integration tests:** Most Phase 0 tests are unit-level. They test logic in isolation without requiring a running Shopify app or database.

**Fast feedback:** All tests complete in <5 seconds. Run them frequently during development.

**Regression prevention:** These tests exist to catch breaking changes. If Phase 0 tests fail after a change, the change broke core functionality.

**Documentation through tests:** Tests serve as executable specifications. Reading the test file shows how auth, navigation, and API calls work.

## Dependencies

- **vitest:** Fast Vite-native test runner
- **@vitest/ui:** Visual test explorer interface
- **@vitest/coverage-v8:** Code coverage reporting
- **jose:** JWT verification (already in app dependencies)

## Maintenance

**When to update tests:**
- New routes added → update navigation tests
- New env vars required → update environment tests
- GraphQL queries changed → update connection tests
- Auth flow modified → update JWT tests

**Test data:**
- Test credentials defined in `test/setup.ts`
- Mock responses defined inline in test files
- No external fixtures or snapshots (keeps tests simple)

## Known Limitations

**Not covered by Phase 0 tests:**
- Database queries (Prisma)
- Webhook handling
- React component rendering (no @testing-library/react yet)
- Full E2E flows (no Playwright yet)
- Deployment/Docker configuration

**Next test phases:**
- Phase 1: Component unit tests for UI
- Phase 2: Integration tests with test database
- Phase 3: E2E tests with Shopify test store
- Phase 4: Performance/load tests

## Troubleshooting

### Tests hang or timeout
- Check for missing async/await
- Verify no open handles (database connections, timers)
- Run with `--reporter=verbose` for details

### Import errors
- Ensure vitest.config.ts has `vite-tsconfig-paths` plugin
- Check TypeScript paths in tsconfig.json
- Verify all test dependencies installed

### Coverage not generated
- Run `npm run test:coverage` (not `npm test`)
- Check vitest.config.ts coverage configuration
- Ensure `@vitest/coverage-v8` installed

### False positives
- Tests passing but functionality broken
- Usually means test is checking wrong thing
- Add more specific assertions
- Test actual behavior, not implementation details

## Support

For test issues:
1. Check this README
2. Review test file comments
3. Check vitest docs: https://vitest.dev
4. Review Phase 0 implementation in `/docs/IMPLEMENTATION.md`
