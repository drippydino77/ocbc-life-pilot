# Fix: Chat Bubbles Disappearing During Tool Chaining

## Problem
When the chatbot performed tool chaining (calling multiple tools sequentially), intermediate chat bubbles would disappear instead of remaining visible. The sequence was:

1. Tool call 1 streams a response (e.g., "finding all transactions...")
2. Bubble appears and shows text
3. **Reset signal received → bubble removed from DOM** ❌
4. Tool call 2 streams a response (e.g., "here's what I found...")
5. New bubble created and shown
6. **Reset signal received → bubble removed from DOM** ❌
7. Final response expected but chat ends with no confirmation modal

## Root Cause
In `frontend/js/lumi.js` (lines 223-227), the reset handler was **removing bubbles from the DOM** instead of just stopping updates to them:

```javascript
// BEFORE (buggy)
onReset: () => {
  if(bubble){ bubble.parentElement.remove(); bubble = null; }  // ❌ removes from DOM
  full = "";
  _lumiSetTyping(true);
}
```

The `reset` signal is sent by the server during tool chaining to hide intermediate tool-call thinking from the user. But the implementation was too aggressive — it deleted the entire bubble element, making it invisible.

## Solution
Keep the bubble visible but stop updating it. When a reset happens:
1. Stop writing to the current bubble (`bubble = null`)
2. **Don't remove it from the DOM** — leave it visible for the user
3. Clear the text buffer for the next independent stream
4. Create a new bubble when the next stream starts

```javascript
// AFTER (fixed)
onReset: () => {
  bubble = null;  // ✅ stop updating, but don't remove from DOM
  full = "";      // clear buffer for next stream
  _lumiSetTyping(true);
}
```

## What Changed
**File:** `frontend/js/lumi.js` (lines 223-227)

Removed the line: `bubble.parentElement.remove();`

This single-line removal ensures bubbles persist visually while still clearing the active reference.

## Testing
To test the fix:

1. **Start the server:**
   ```bash
   cd "C:\Users\dripp\Documents\OCBC chatbot"
   venv\Scripts\Activate.ps1
   uvicorn server:app --app-dir backend --port 8000
   ```

2. **Open the app:** Navigate to `http://localhost:8000`

3. **Test scenario:** Click the Lumi chat widget and ask:
   > "Delete all my transactions"

4. **Expected behavior:** 
   - ✅ First bubble appears with tool-chain thinking (e.g., "Let me find all transactions...")
   - ✅ Bubble **stays visible** even when reset arrives
   - ✅ Second bubble appears with what was found
   - ✅ Both bubbles remain visible
   - ✅ Confirmation modal appears (if actions proposed)

5. **Verify in browser console:**
   - Open DevTools (F12) → Console
   - You should NOT see any errors about removed bubbles
   - The message count in the test page shows bubbles created and resets received

## Impact
- **User Experience:** All intermediate thinking is now visible, providing transparency into the agent's reasoning
- **Chat History:** All bubbles persist and are correctly saved to localStorage/Supabase
- **Action Confirmations:** The final action confirmation modal now appears correctly after tool chaining

## Commits
This fix is minimal (1 line deleted) and should be bundled with the next feature work or released as a hotfix.
