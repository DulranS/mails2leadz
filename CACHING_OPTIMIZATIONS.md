# Caching Optimizations

This document describes all caching optimizations implemented to reduce Firebase costs and improve application performance.

## Firebase Query Caching

### Cache Implementation (`lib/firebase-cache.js`)

The Firebase cache provides in-memory caching for Firestore queries with the following features:

- **Collection-specific TTLs**: Different cache durations for different data types
- **Hit/Miss Tracking**: Monitor cache effectiveness
- **Automatic Cleanup**: Removes expired entries when cache exceeds 100 items
- **Cache Statistics**: View hit rate, total entries, active/expired counts

### Cache TTL Configuration

| Collection | TTL | Reason |
|-----------|-----|--------|
| `settings` | 30 minutes | User settings rarely change |
| `templates` | 30 minutes | Email templates rarely change |
| `sent_emails` | 2 minutes | Changes frequently (emails sent, replies received) |
| `deals` | 5 minutes | Deal stages change occasionally |
| `company_tracking` | 10 minutes | Company data changes infrequently |

### Cached Operations

1. **User Settings** (`loadSettingsFromFirebase`)
   - Cache key: `user_settings|{userId}`
   - TTL: 10 minutes
   - Invalidated on: `saveSettingsToFirebase`

2. **Sent Leads** (`loadSentLeads`)
   - Cache key: `sent_emails|{userId}`
   - TTL: 2 minutes
   - Invalidated on: Email send, follow-up send

3. **Replied & Follow-up Data** (`loadRepliedAndFollowUp`)
   - Cache key: `replied_followup|{userId}`
   - TTL: 2 minutes
   - Invalidated on: Email send, follow-up send

## API Route Caching

### Send Email API (`app/api/send-email/route.js`)

**Cache Invalidation:**
- After batch email send completes
- After follow-up update

**Impact:**
- Reduces Firebase read operations for sent emails
- Ensures fresh data after email operations

### Get Thread API (`app/api/get-thread/route.js`)

**Gmail Thread Caching:**
- In-memory cache for Gmail thread data
- TTL: 5 minutes
- Max entries: 50 (with automatic cleanup)
- Cache key: `threadId` or `messageId` or `email`

**Impact:**
- Reduces Gmail API calls significantly
- Faster thread loading when viewing conversations
- Reduced API quota usage

**Cache Response:**
```json
{
  "success": true,
  "cached": true,  // Indicates if data came from cache
  "threadId": "...",
  "messages": [...],
  "totalMessages": 3
}
```

## Dashboard Cache Invalidation

The dashboard invalidates cache at the following points:

1. **After Individual Follow-up Send**
   ```javascript
   invalidateCache('sent_emails');
   invalidateCache('replied_followup');
   ```

2. **After Batch Follow-up Send**
   ```javascript
   invalidateCache('sent_emails');
   invalidateCache('replied_followup');
   ```

3. **After Email Operations**
   - Initial email send
   - Reply detection
   - Deal stage updates

## Cache Monitoring

### View Cache Statistics

```javascript
import { getCacheStats } from './lib/firebase-cache.js';

const stats = getCacheStats();
console.log(stats);
// Output:
// {
//   totalEntries: 45,
//   activeEntries: 38,
//   expiredEntries: 7,
//   hits: 1250,
//   misses: 320,
//   hitRate: "79.61%"
// }
```

### Cache Hit Rate Target

- **Target**: >70% hit rate
- **Good**: >80% hit rate
- **Excellent**: >90% hit rate

## Cost Savings

### Firebase Firestore Read Savings

Without caching:
- Dashboard load: ~10 reads per refresh
- Thread view: ~5 reads per view
- Settings load: ~2 reads per load
- **Total**: ~17 reads per user action

With caching (70% hit rate):
- Dashboard load: ~3 reads per refresh (10 * 0.3)
- Thread view: ~1.5 reads per view (5 * 0.3)
- Settings load: ~0.6 reads per load (2 * 0.3)
- **Total**: ~5.1 reads per user action

**Savings**: ~70% reduction in Firestore reads

### Gmail API Savings

Without caching:
- Thread view: 2-3 API calls per view
- Message refresh: 1-2 API calls per refresh

With caching (5 minute TTL):
- Thread view: 0.2-0.3 API calls per view (80% hit rate)
- Message refresh: 0.1-0.2 API calls per refresh

**Savings**: ~80% reduction in Gmail API calls

## Best Practices

1. **Always Invalidate Cache After Writes**
   - After updating Firebase documents
   - After sending emails
   - After changing settings

2. **Use Appropriate TTLs**
   - Stable data: 30+ minutes
   - Semi-stable data: 5-10 minutes
   - Frequently changing data: 1-2 minutes

3. **Monitor Cache Hit Rate**
   - Low hit rate (<50%): Consider increasing TTL
   - Very high hit rate (>95%): Consider reducing TTL for freshness

4. **Cache Expensive Operations**
   - Gmail API calls
   - Complex Firebase queries
   - External API calls

## Future Optimizations

1. **Redis Cache**: Replace in-memory cache with Redis for multi-instance deployments
2. **CDN Caching**: Cache API responses at CDN level for static data
3. **Database Query Optimization**: Add composite indexes for frequently queried fields
4. **Batch Cache Invalidation**: Group cache invalidations to reduce overhead
