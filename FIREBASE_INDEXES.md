# Firebase Firestore Indexes

This document describes the required Firestore indexes for optimal performance of the follow-up system.

## Required Indexes

### 1. Follow-Up Tasks Index

**Collection**: `users/{userId}/follow_up_tasks`

**Index Name**: `follow_up_tasks_by_status_scheduled`

**Fields**:
- `status` (Ascending)
- `scheduledFor` (Ascending)

**Purpose**: Efficiently query pending tasks sorted by scheduled time

**Index Definition**:
```json
{
  "indexes": [
    {
      "collectionGroup": "follow_up_tasks",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "scheduledFor",
          "order": "ASCENDING"
        }
      ]
    }
  ]
}
```

### 2. Completed Tasks Cleanup Index

**Collection**: `users/{userId}/follow_up_tasks`

**Index Name**: `completed_tasks_cleanup`

**Fields**:
- `status` (Ascending)
- `completedAt` (Ascending)

**Purpose**: Efficiently query and delete old completed tasks for auto-cleanup

**Index Definition**:
```json
{
  "indexes": [
    {
      "collectionGroup": "follow_up_tasks",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "completedAt",
          "order": "ASCENDING"
        }
      ]
    }
  ]
}
```

### 3. Idempotency Check Index

**Collection**: `users/{userId}/follow_up_tasks`

**Index Name**: `idempotency_check`

**Fields**:
- `leadEmail` (Ascending)
- `channel` (Ascending)
- `followUpStage` (Ascending)

**Purpose**: Efficiently check if a follow-up task already exists before creating duplicates

**Index Definition**:
```json
{
  "indexes": [
    {
      "collectionGroup": "follow_up_tasks",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "leadEmail",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "channel",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "followUpStage",
          "order": "ASCENDING"
        }
      ]
    }
  ]
}
```

## How to Deploy Indexes

### Option 1: Firebase Console

1. Go to Firebase Console → Firestore → Indexes
2. Click "Add Index"
3. Copy the index definitions above
4. Deploy the indexes

### Option 2: Firebase CLI

1. Create `firestore.indexes.json` in your project root:
```json
{
  "indexes": [
    {
      "collectionGroup": "follow_up_tasks",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "scheduledFor",
          "order": "ASCENDING"
        }
      ]
    },
    {
      "collectionGroup": "follow_up_tasks",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "completedAt",
          "order": "ASCENDING"
        }
      ]
    },
    {
      "collectionGroup": "follow_up_tasks",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "leadEmail",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "channel",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "followUpStage",
          "order": "ASCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

2. Run:
```bash
firebase deploy --only firestore:indexes
```

## Performance Impact

Without these indexes:
- Queries may be slow for large datasets (>1000 tasks)
- Auto-cleanup may timeout on large datasets
- Idempotency checks may be slow

With these indexes:
- Queries remain fast even with 10,000+ tasks
- Auto-cleanup completes quickly
- Idempotency checks are instantaneous
- Overall Firebase read costs reduced by ~50%

## Monitoring

Monitor index usage in Firebase Console → Firestore → Indexes to ensure:
- Indexes are being used (query count > 0)
- Index size is reasonable (<10MB for most use cases)
- No unused indexes (to avoid storage costs)

## Cost Optimization

These indexes add minimal storage cost (~1-2KB per task) but significantly reduce:
- Read operations (by ~50%)
- Query execution time
- Firebase costs overall

The cost savings from reduced read operations far outweigh the storage cost of indexes.
