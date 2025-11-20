# KB Rewrite Smoke Test

## Test Objectives
Verify that the KB rewrite suggestion and approval flow works end-to-end.

## Prerequisites
- User must be authenticated
- At least one receptionist must exist in the database
- LOVABLE_API_KEY must be configured

## Test Steps

### 1. Generate KB Suggestions (Backend)
```bash
# Call the kb-rewrite function to analyze
curl -X POST https://xhihzexkqezhpwsryxqv.supabase.co/functions/v1/kb-rewrite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -d '{
    "action": "analyze",
    "receptionistId": "[RECEPTIONIST_ID]",
    "userId": "[USER_ID]"
  }'
```

Expected response:
```json
{
  "success": true,
  "analyzed": <number>,
  "suggestions": [...]
}
```

Verify:
- ✓ Response status is 200
- ✓ `kb_rewrite_log` table has a new entry with `auto_suggest=true`
- ✓ Suggestions array contains KB improvement recommendations

### 2. View Suggestions (Frontend)
```
1. Navigate to /kb-rewrite page
2. Verify pending suggestions are displayed
3. Click "Review Suggestions" on a suggestion card
```

Expected:
- ✓ Suggestions list loads without errors
- ✓ Each suggestion shows receptionist name, business name, and reason
- ✓ Clicking review opens the detail view

### 3. Review Side-by-Side Diff
```
In the detail view:
1. Verify "Original" and "Suggested" columns are displayed
2. Verify the diff is readable
3. Check that protected keys (services, prices, phone, etc.) are not removed
```

Expected:
- ✓ Side-by-side JSON comparison is displayed
- ✓ Original KB content matches database
- ✓ Suggested improvements are clear and non-destructive

### 4. Approve KB Rewrite
```
1. Click "Approve & Apply" button
2. Wait for success toast
```

Expected:
- ✓ POST request to kb-rewrite with action=apply
- ✓ Success toast appears
- ✓ `receptionists.knowledge_base` is updated in database
- ✓ `kb_rewrite_log.auto_suggest` is set to false
- ✓ Suggestion is removed from pending list

### 5. Edit & Apply Custom Changes
```
1. Open a suggestion detail view
2. Click "Edit & Apply"
3. Modify the knowledge base text
4. Click "Apply Edited Version"
```

Expected:
- ✓ Textarea appears with editable KB content
- ✓ Changes are saved to database
- ✓ Success toast appears
- ✓ Suggestion is removed from pending list

### 6. Reject Suggestion
```
1. Open a suggestion detail view
2. Click "Reject" button
3. Confirm rejection
```

Expected:
- ✓ `kb_rewrite_log.auto_suggest` is set to false
- ✓ Suggestion disappears from pending list
- ✓ No changes are made to receptionist KB

## Database Queries for Verification

### Check kb_rewrite_log entries
```sql
SELECT id, receptionist_id, reason, auto_suggest, created_at 
FROM kb_rewrite_log 
WHERE auto_suggest = true 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check receptionist KB updates
```sql
SELECT id, name, knowledge_base, updated_at 
FROM receptionists 
WHERE id = '[RECEPTIONIST_ID]';
```

### Check AI responses (for quality scoring)
```sql
SELECT id, receptionist_id, quality_score, confidence, created_at
FROM ai_responses
WHERE receptionist_id = '[RECEPTIONIST_ID]'
  AND quality_score::jsonb->>'overall' < '0.6'
ORDER BY created_at DESC
LIMIT 10;
```

## Security Checks

### Protected Keys Validation
Ensure the following keys cannot be automatically removed:
- services
- prices / pricing
- address / location
- phone / business_phone
- hours / hours_of_operation
- policies
- services_and_prices

### Ownership Verification
```
1. Try to apply a KB rewrite for a receptionist you don't own
2. Verify you get a 403/401 error
```

Expected:
- ✓ Error: "Unauthorized - you don't own this receptionist"
- ✓ No changes are made to the database

## Performance Checks

### Analyze Function
- Should complete in < 10 seconds for 50 low-quality responses
- Should handle missing LOVABLE_API_KEY gracefully

### Apply Function
- Should complete in < 2 seconds
- Should use database transaction for safety

## Edge Cases

### No Low-Quality Responses
```json
{
  "suggestions": [],
  "message": "No low-quality responses found - KB is performing well!"
}
```

### AI Response Parsing Error
- Should return empty suggestions array
- Should log warning to console
- Should not crash the function

### Missing Receptionist
```json
{
  "error": "Receptionist not found"
}
```

## Rollback Test

If something goes wrong:
```sql
-- Restore original KB from kb_rewrite_log
UPDATE receptionists
SET knowledge_base = (
  SELECT original->>'knowledge_base'
  FROM kb_rewrite_log
  WHERE id = '[LOG_ID]'
)
WHERE id = '[RECEPTIONIST_ID]';
```

## Test Results Template

```
Date: ___________
Tester: ___________

✓ / ✗  Backend analyze endpoint
✓ / ✗  Frontend suggestions list
✓ / ✗  Side-by-side diff view
✓ / ✗  Approve & apply flow
✓ / ✗  Edit & apply custom changes
✓ / ✗  Reject suggestion
✓ / ✗  Protected keys validation
✓ / ✗  Ownership verification
✓ / ✗  Performance requirements

Notes:
_________________________________
_________________________________
```
