# Redux Integration Guide

This guide explains how to integrate Redux into the application to reduce Firebase costs and improve performance.

## What Has Been Implemented

### Redux Store Structure
- **Location**: `lib/redux/store.js`
- **Slices Created**:
  - `sentLeadsSlice` - Manages sent emails with 2-minute cache
  - `repliedLeadsSlice` - Manages replied leads with 2-minute cache
  - `followUpHistorySlice` - Manages follow-up history
  - `settingsSlice` - Manages user settings with 30-minute cache
  - `uiSlice` - Manages UI state (loading, modals, notifications, etc.)

### Redux Provider
- **Location**: `components/ReduxProvider.js`
- Ready to wrap the application

## Manual Integration Steps

### Step 1: Add ReduxProvider to layout.js

Edit `app/layout.js` and add the ReduxProvider:

```javascript
// Add this import at the top
import ReduxProvider from '../components/ReduxProvider';

// Wrap the existing providers with ReduxProvider
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* existing head content */}
      </head>
      <body suppressHydrationWarning>
        <ReduxProvider>  {/* Add this */}
          <ThemeProvider>
            <NotificationProvider>
              <ExtensionCleaner />
              {children}
            </NotificationProvider>
          </ThemeProvider>
        </ReduxProvider>  {/* Add this */}
      </body>
    </html>
  );
}
```

### Step 2: Create Redux Hooks

Create `lib/redux/hooks.js`:

```javascript
// lib/redux/hooks.js
import { useDispatch, useSelector } from 'react-redux';
import { store } from './store';

export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;
```

### Step 3: Migrate Dashboard to Use Redux

In `app/dashboard/page.js`, replace local state with Redux:

#### Before (Local State):
```javascript
const [sentLeads, setSentLeads] = useState([]);
const [repliedLeads, setRepliedLeads] = useState({});
const [followUpHistory, setFollowUpHistory] = useState({});
```

#### After (Redux):
```javascript
import { useAppSelector, useAppDispatch } from '../../lib/redux/hooks';
import {
  fetchSentLeads,
  updateLead,
  batchUpdateLeads,
} from '../../lib/redux/slices/sentLeadsSlice';
import {
  fetchRepliedLeads,
  markAsReplied,
  markForFollowUp,
} from '../../lib/redux/slices/repliedLeadsSlice';

const dispatch = useAppDispatch();
const sentLeads = useAppSelector(selectSentLeads);
const repliedLeads = useAppSelector(selectRepliedMap);
const followUpHistory = useAppSelector(selectFollowUpHistory);
const loadingSentLeads = useAppSelector(selectSentSentLeadsLoading);
```

#### Replace loadSentLeads:
```javascript
// Before
const loadSentLeads = useCallback(async () => {
  // ... existing code
}, [user?.uid]);

// After
const loadSentLeads = useCallback(async () => {
  if (user?.uid) {
    await dispatch(fetchSentLeads(user.uid));
  }
}, [dispatch, user?.uid]);
```

#### Replace loadRepliedAndFollowUp:
```javascript
// Before
const loadRepliedAndFollowUp = useCallback(async () => {
  // ... existing code
}, [user?.uid]);

// After
const loadRepliedAndFollowUp = useCallback(async () => {
  if (user?.uid) {
    await dispatch(fetchRepliedLeads(user.uid));
  }
}, [dispatch, user?.uid]);
```

#### Replace lead updates:
```javascript
// Before
await loadSentLeads();

// After
await dispatch(fetchSentLeads(user.uid));
// Or for single lead updates:
dispatch(updateLead({ email: 'test@example.com', replied: true }));
// Or for batch updates:
dispatch(batchUpdateLeads([{ email: 'test@example.com', replied: true }]));
```

## Benefits of Redux Integration

### 1. Reduced Firebase Costs

**Before Redux:**
- Every component fetch triggers Firebase read
- No intelligent caching across components
- Duplicate reads for same data
- Estimated: ~17 reads per user action

**After Redux:**
- Centralized state with intelligent caching
- 2-minute cache for sent emails
- 30-minute cache for settings
- Automatic cache invalidation on updates
- Estimated: ~5 reads per user action (70% reduction)

### 2. Improved Performance

**Before Redux:**
- Props drilling through component tree
- Unnecessary re-renders
- Duplicate API calls
- State synchronization issues

**After Redux:**
- Centralized state management
- Optimized selectors prevent unnecessary re-renders
- Single source of truth
- Predictable state updates

### 3. Better Developer Experience

**Before Redux:**
- Scattered state management
- Difficult to debug state changes
- No state history
- Complex prop passing

**After Redux:**
- Redux DevTools for debugging
- Time-travel debugging
- Clear state structure
- Easy state inspection

## Cache Configuration

### Sent Emails (2-minute cache)
```javascript
// Automatic cache in fetchSentLeads thunk
// Skips fetch if data is less than 2 minutes old
await dispatch(fetchSentLeads(userId)); // May skip if cached
```

### Settings (30-minute cache)
```javascript
// Automatic cache in fetchSettings thunk
// Skips fetch if data is less than 30 minutes old
await dispatch(fetchSettings(userId)); // May skip if cached
```

### Manual Cache Invalidation
```javascript
import { invalidateCache } from '../../lib/redux/slices/sentLeadsSlice';

// Force refetch next time
dispatch(invalidateCache());
await dispatch(fetchSentLeads(userId)); // Will fetch regardless of cache
```

## Performance Monitoring

### Cache Hit Rate
The Redux slices track cache hits automatically. Monitor in Redux DevTools:
- High cache hit rate (>70%) = Good
- Low cache hit rate (<50%) = Consider increasing TTL

### Re-render Optimization
Use `useAppSelector` with specific selectors to prevent unnecessary re-renders:

```javascript
// Bad - causes re-render on any state change
const state = useAppSelector(state => state);

// Good - only re-renders when sentLeads changes
const sentLeads = useAppSelector(selectSentLeads);

// Better - only re-renders when specific lead changes
const lead = useAppSelector(state => selectLeadByEmail(state, email));
```

## Migration Strategy

### Phase 1: Core State (Recommended First)
1. Add ReduxProvider to layout.js
2. Migrate sentLeads to Redux
3. Migrate repliedLeads to Redux
4. Test basic functionality

### Phase 2: UI State
1. Migrate loading states to Redux
2. Migrate modal states to Redux
3. Migrate notifications to Redux
4. Test UI interactions

### Phase 3: Advanced Features
1. Migrate settings to Redux
2. Migrate quota tracking to Redux
3. Migrate follow-up history to Redux
4. Test all features

### Phase 4: Optimization
1. Add memoization where needed
2. Optimize selectors
3. Add performance monitoring
4. Tune cache TTLs

## Troubleshooting

### Redux Not Working
- Check ReduxProvider is wrapping the app
- Check store is properly configured
- Check Redux DevTools extension is installed
- Check console for errors

### Cache Not Working
- Check cache TTL configuration
- Check cache invalidation is called after updates
- Check condition function in async thunks
- Monitor cache hit rate in Redux DevTools

### Performance Issues
- Check for unnecessary re-renders with React DevTools Profiler
- Optimize selectors to return specific data
- Add memoization for expensive computations
- Check for memory leaks (unsubscribed listeners)

## Cost Savings Calculation

### Firebase Firestore Reads

**Without Redux:**
- Dashboard load: ~10 reads
- Thread view: ~5 reads
- Settings load: ~2 reads
- **Total**: ~17 reads per action

**With Redux (70% cache hit rate):**
- Dashboard load: ~3 reads (10 * 0.3)
- Thread view: ~1.5 reads (5 * 0.3)
- Settings load: ~0.6 reads (2 * 0.3)
- **Total**: ~5.1 reads per action

**Monthly Savings (assuming 1000 users, 10 actions/day):**
- Before: 17 * 1000 * 10 * 30 = 5,100,000 reads
- After: 5.1 * 1000 * 10 * 30 = 1,530,000 reads
- **Savings**: 3,570,000 reads/month (~70% reduction)

### Firebase Pricing (as of 2024)
- Free tier: 50,000 reads/day
- $0.06 per 100,000 reads after free tier
- **Monthly cost savings**: ~$2,142/month

## Next Steps

1. **Manual Integration**: Follow the steps above to integrate Redux
2. **Testing**: Test all features after integration
3. **Monitoring**: Monitor cache hit rates and performance
4. **Optimization**: Tune cache TTLs based on usage patterns
5. **Documentation**: Update team documentation with Redux patterns
