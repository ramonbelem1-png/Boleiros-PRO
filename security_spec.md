# Security Specification - Boleiros Bons de Bico

## 1. Data Invariants
- A **Match** must have a valid date and status.
- A **Player** must have a position and level (1-5).
- A **Transaction** must have an amount and be linked to a valid category.
- Users can only mark *themselves* as confirmed or absent in a match (Identity Integrity).
- Only authenticated users can read or write any club data.

## 2. The "Dirty Dozen" Payloads (Red Team Test Cases)

1. **Identity Spoofing**: Attempt to create a player document where the ID is not the user's UID (unless they are a manager).
2. **Privilege Escalation**: Attempt to update a player's `balance` directly from the client.
3. **State Shortcutting**: Attempt to move a match status from `OPEN` to `FINISHED` without being an admin.
4. **ID Poisoning**: Attempt to use `../poison/doc` as a match ID.
5. **Shadow Field Injection**: create a match with a hidden `isAdmin: true` field.
6. **Relational Sync Break**: Create a transaction for a non-existent player.
7. **Negative Charge**: Create a transaction with a negative amount.
8. **Future Tampering**: Update a `createdAt` timestamp to a backdated value.
9. **Spam Injection**: Create a player name that is 1MB in size.
10. **Role Ghosting**: Confirmation in a match for someone else's ID.
11. **Orphaned Writes**: Creating an award for a match id that doesn't exist.
12. **Bulk Leak**: Querying all players without being logged in.

## 3. Test Runner (Draft Plan)
The `firestore.rules` will implement:
- `isValidId(id)`: Regex `^[a-zA-Z0-9_\-]+$` + size check.
- `isValidPlayer(data)`: Schema verification.
- `affectedKeys().hasOnly()`: Strict update paths.
- `request.auth.uid`: Ownership verification.
- `exists()`: Reference validation.
