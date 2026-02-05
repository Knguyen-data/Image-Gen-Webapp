# Spicy Mode - Seedream 4.5 Edit Integration

## Overview
Add "Spicy Mode" toggle with chili icon to switch between Nano Banana Pro (Gemini) and Seedream 4.5 Edit APIs.

**Branch:** `spicy_mode`
**Priority:** P2
**Status:** Complete

## API Comparison

| Feature | Nano Banana Pro | Seedream 4.5 Edit |
|---------|-----------------|-------------------|
| API Type | Sync (direct) | Async (polling) |
| Endpoint | generativelanguage.googleapis.com | api.kie.ai |
| Auth | x-goog-api-key | Bearer token |
| Image Input | Base64 inline | URL (upload first) |
| Temperature | Yes (0-2) | **No** |
| Quality | 1K, 2K, 4K | basic (2K), high (4K) |
| Output | Base64 | URL (download) |

## UI Changes Required

1. **Hide when Spicy Mode ON:**
   - Temperature slider
   - Safety filter toggle

2. **Modify when Spicy Mode ON:**
   - Quality dropdown: only "Basic (2K)" and "High (4K)"

3. **Add:**
   - Spicy Mode toggle button with chili icon
   - Separate API key input for Kie.ai

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | [Create Seedream service](./phase-01-seedream-service.md) | ✅ Complete |
| 2 | [Add UI toggle and state](./phase-02-ui-toggle.md) | ✅ Complete |
| 2.5 | [Credit monitoring system](./phase-02.5-credit-monitoring.md) | ✅ Complete |
| 3 | [Integrate with generation flow](./phase-03-integration.md) | ✅ Complete |
| 4 | [Unit tests](./phase-04-tests.md) | ✅ Complete |

## Key Files to Modify

- `src/constants.ts` - Add Spicy Mode settings
- `src/types/index.ts` - Add SpicyMode types
- `src/services/seedream-service.ts` - NEW
- `src/services/seedream-rate-limiter.ts` - NEW (20 req/10s token bucket)
- `src/services/seedream-credit-service.ts` - NEW (credit balance API)
- `src/components/left-panel.tsx` - Add toggle, conditional UI, credit display
- `src/app.tsx` - Mode state, service routing

## Rate Limit

- **Limit:** 20 requests per 10 seconds per account
- **Behavior:** HTTP 429 if exceeded (not queued)
- **Strategy:** Token bucket client-side rate limiter

## Success Criteria

- [ ] Toggle switches mode gracefully
- [ ] Temperature slider hidden in Spicy Mode
- [ ] Quality shows only basic/high in Spicy Mode
- [ ] Generation works with both APIs
- [ ] Unit tests pass for seedream-service
