/**
 * Firestore Security Rules Test Suite — Phase 0 Verification
 * Verifies that all "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation / Self-Admin on Signup',
    operation: 'create',
    path: '/users/attacker_1',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attacker_1',
      displayName: 'Attacker',
      role: 'admin',
      verifiedSeller: true,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Listing Create',
    operation: 'create',
    path: '/listings/listing_1',
    auth: { uid: 'seller_1', email: 'seller@example.com', email_verified: true },
    payload: {
      title: '2024 Porsche 911 GT3',
      make: 'Porsche',
      model: '911 GT3',
      year: 2024,
      price: 245000,
      mileage: 1200,
      bodyStyle: 'Coupe',
      fuelType: 'Gasoline',
      transmission: 'Dual-Clutch',
      drivetrain: 'RWD',
      exteriorColor: 'Slate Grey',
      location: 'Los Angeles, CA',
      vin: 'WP0AC2A99RS271094',
      imageUrl: '/src/assets/images/hero.jpg',
      description: 'Full factory warranty and ceramic brakes.',
      sellerId: 'seller_1',
      sellerName: 'Apex Motors',
      status: 'active',
      visibility: 'public',
      featured: false,
      viewsCount: 0,
      isSponsoredHack: true,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Admin Spoofing',
    operation: 'delete',
    path: '/listings/listing_1',
    auth: { uid: 'spoof_admin', email: 'sundarasarathi78@gmail.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User Profile Scraping / PII Leak',
    operation: 'get',
    path: '/users/victim_user',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Identity Spoofing on Listing Creation',
    operation: 'create',
    path: '/listings/listing_spoof',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      sellerId: 'victim_seller',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned Order Creation for Non-Existent Listing',
    operation: 'create',
    path: '/orders/order_orphan',
    auth: { uid: 'buyer_1', email: 'buyer@example.com', email_verified: true },
    payload: {
      listingId: 'non_existent_car',
      buyerId: 'buyer_1',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Terminal State Bypass on Sold Vehicle',
    operation: 'update',
    path: '/listings/sold_car_1',
    auth: { uid: 'seller_1', email: 'seller@example.com', email_verified: true },
    payload: {
      price: 5000,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Value Poisoning on Whitelisted Update Key',
    operation: 'update',
    path: '/listings/active_car_1',
    auth: { uid: 'seller_1', email: 'seller@example.com', email_verified: true },
    payload: {
      price: -99999,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Temporal Manipulation / Backdating Order',
    operation: 'create',
    path: '/orders/order_backdated',
    auth: { uid: 'buyer_1', email: 'buyer@example.com', email_verified: true },
    payload: {
      createdAt: '1970-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immortal Field Mutation on Update',
    operation: 'update',
    path: '/listings/active_car_1',
    auth: { uid: 'seller_1', email: 'seller@example.com', email_verified: true },
    payload: {
      sellerId: 'new_owner_id',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unauthorized List Scraping on Orders',
    operation: 'list',
    path: '/orders',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'ID Poisoning / Invalid Characters in Path Variable',
    operation: 'create',
    path: '/messages/bad$id!with@invalid#chars',
    auth: { uid: 'buyer_1', email: 'buyer@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
