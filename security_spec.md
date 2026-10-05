# Veloce Reserve — Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Global Default Deny**: Any path not explicitly matched in `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false;`).
2. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates its document ID with `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
3. **Verified Identity & Anti-Spoofing**:
   - Standard writes require `isSignedIn() && request.auth.token.email_verified == true`.
   - Bootstrapped Admin check requires BOTH `request.auth.token.email == 'sundarasarathi78@gmail.com'` AND `request.auth.token.email_verified == true`, or existence of `/admins/$(request.auth.uid)`.
   - Users cannot self-assign `role == 'admin'` or `verifiedSeller == true` upon profile creation unless `isAdmin()` is true.
4. **PII & Profile Isolation**: `/users/{userId}` documents can only be read (`get`/`list`) by the profile owner (`userId == request.auth.uid`) or `isAdmin()`. Blanket `isSignedIn()` reads on `/users` are strictly forbidden.
5. **Relational Integrity**:
   - Creating a `/listings/{listingId}` requires `incoming().sellerId == request.auth.uid` and `exists(/databases/$(database)/documents/users/$(request.auth.uid))`.
   - Creating an `/orders/{orderId}` requires `incoming().buyerId == request.auth.uid` and `exists(/databases/$(database)/documents/listings/$(incoming().listingId))`.
   - Creating a `/messages/{messageId}` requires `incoming().senderId == request.auth.uid`, `incoming().senderId != incoming().recipientId`, and `exists(/databases/$(database)/documents/listings/$(incoming().listingId))`.
6. **Terminal State Locking**:
   - Once a `/listings/{listingId}` reaches `status == 'sold'`, non-admin users cannot mutate it further.
   - Once an `/orders/{orderId}` reaches `status == 'completed'` or `status == 'cancelled'`, non-admin users cannot mutate it further.
7. **Temporal Integrity**: All `create` operations enforce `incoming().createdAt == request.time && incoming().updatedAt == request.time`. All `update` operations enforce `incoming().updatedAt == request.time && incoming().createdAt == existing().createdAt`.
8. **Secure List Queries**: Every `allow list` rule enforces document-level boundaries on `resource.data` (e.g., `resource.data.visibility == 'public'` for listings, `resource.data.buyerId == request.auth.uid || resource.data.sellerId == request.auth.uid` for orders, `resource.data.recipientId == request.auth.uid` for notifications).

---

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity, and State)

1. **Payload 1 (Privilege Escalation / Self-Admin on Signup)**:
   - Target: `CREATE /users/attacker_1`
   - Payload: `{ uid: "attacker_1", displayName: "Attacker", role: "admin", verifiedSeller: true, createdAt: SERVER_TIME, updatedAt: SERVER_TIME }`
   - Expected: `PERMISSION_DENIED` (non-admin cannot create profile with `role: "admin"` or `verifiedSeller: true`).

2. **Payload 2 (Shadow Field Injection on Listing Create)**:
   - Target: `CREATE /listings/listing_1`
   - Payload: Valid `CarListing` fields + `{ isSponsoredHack: true }`
   - Expected: `PERMISSION_DENIED` (`hasOnly` rejects unknown shadow keys).

3. **Payload 3 (Unverified Email Admin Spoofing)**:
   - Target: `DELETE /listings/listing_1` as user with `email: "sundarasarathi78@gmail.com"` but `email_verified: false`.
   - Expected: `PERMISSION_DENIED` (`isAdmin()` requires `email_verified == true`).

4. **Payload 4 (Cross-User Profile Scraping / PII Leak)**:
   - Target: `GET /users/victim_user` as `attacker_user`.
   - Expected: `PERMISSION_DENIED` (`allow get` restricted to owner or admin).

5. **Payload 5 (Identity Spoofing on Listing Creation)**:
   - Target: `CREATE /listings/listing_spoof` by `attacker_1` setting `sellerId: "victim_seller"`.
   - Expected: `PERMISSION_DENIED` (`incoming().sellerId == request.auth.uid` fails).

6. **Payload 6 (Orphaned Order Creation for Non-Existent Listing)**:
   - Target: `CREATE /orders/order_orphan` referencing `listingId: "non_existent_car"`.
   - Expected: `PERMISSION_DENIED` (`exists(.../listings/$(incoming().listingId))` fails).

7. **Payload 7 (Terminal State Bypass on Sold Vehicle)**:
   - Target: `UPDATE /listings/sold_car_1` where `existing().status == 'sold'`, seller attempts to change `price: 5000`.
   - Expected: `PERMISSION_DENIED` (Terminal State Lock blocks updates when `existing().status == 'sold'`).

8. **Payload 8 (Value Poisoning on Whitelisted Update Key)**:
   - Target: `UPDATE /listings/active_car_1` where seller updates `price: -99999` or `title: "A" * 500`.
   - Expected: `PERMISSION_DENIED` (`isValidCarListing(incoming())` wraps the entire `allow update` block).

9. **Payload 9 (Temporal Manipulation / Backdating Order)**:
   - Target: `CREATE /orders/order_backdated` with `createdAt: Timestamp.fromMillis(1000000)`.
   - Expected: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).

10. **Payload 10 (Immortal Field Mutation on Update)**:
    - Target: `UPDATE /listings/active_car_1` attempting to mutate `createdAt` or `sellerId`.
    - Expected: `PERMISSION_DENIED` (`incoming().sellerId == existing().sellerId && incoming().createdAt == existing().createdAt`).

11. **Payload 11 (Unauthorized List Scraping on Orders)**:
    - Target: `LIST /orders` without filtering by `buyerId == request.auth.uid` or `sellerId == request.auth.uid`.
    - Expected: `PERMISSION_DENIED` (`allow list` checks `resource.data.buyerId == request.auth.uid || resource.data.sellerId == request.auth.uid`).

12. **Payload 12 (ID Poisoning / Oversized Path Variable)**:
    - Target: `CREATE /messages/bad$id!with@invalid#chars`
    - Expected: `PERMISSION_DENIED` (`isValidId(messageId)` regex guard rejects non-alphanumeric characters).
