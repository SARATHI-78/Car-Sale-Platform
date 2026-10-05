import { Timestamp } from 'firebase/firestore';

export type UserRole = 'buyer' | 'seller' | 'admin';

export interface UserProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  verifiedSeller: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BodyStyle = 'Coupe' | 'Sedan' | 'SUV' | 'Wagon' | 'Convertible';
export type FuelType = 'Electric' | 'Hybrid' | 'Gasoline';
export type TransmissionType = 'Automatic' | 'Manual' | 'Dual-Clutch';
export type DrivetrainType = 'AWD' | 'RWD' | 'FWD';
export type ListingStatus = 'active' | 'reserved' | 'sold' | 'archived';
export type ListingVisibility = 'public' | 'private';

export interface CarListing {
  id: string;
  title: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  bodyStyle: BodyStyle;
  fuelType: FuelType;
  transmission: TransmissionType;
  drivetrain: DrivetrainType;
  exteriorColor: string;
  location: string;
  vin: string;
  imageUrl: string;
  description: string;
  sellerId: string;
  sellerName: string;
  status: ListingStatus;
  visibility: ListingVisibility;
  featured: boolean;
  viewsCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  hasPendingWrites?: boolean;
}

export type PaymentMethodType =
  | 'Reservation Deposit'
  | 'Full Escrow Wire'
  | 'Instant Card Checkout'
  | 'Pre-Approved Financing';

export type OrderStatus = 'processing' | 'escrow_funded' | 'completed' | 'cancelled';

export interface OrderTransaction {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  amount: number;
  paymentType: PaymentMethodType;
  paymentLast4: string;
  shippingAddress: string;
  status: OrderStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  hasPendingWrites?: boolean;
}

export interface DirectMessage {
  id: string;
  listingId: string;
  listingTitle: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  hasPendingWrites?: boolean;
}

export type NotificationCategory = 'order_update' | 'new_message' | 'listing_status' | 'price_alert';

export interface UserNotification {
  id: string;
  recipientId: string;
  senderId: string;
  type: NotificationCategory;
  title: string;
  body: string;
  relatedId: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  hasPendingWrites?: boolean;
}

/**
 * Verbatim validation constants synchronized with firebase-blueprint.json and firestore.rules
 */
export const VALIDATION_RULES = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  ID_MAX_LENGTH: 128,
  VIN_PATTERN: /^[A-HJ-NPR-Z0-9]{11,17}$/,
  LAST4_PATTERN: /^[0-9]{4}$/,
  TITLE_MIN: 3,
  TITLE_MAX: 120,
  MAKE_MIN: 2,
  MAKE_MAX: 50,
  MODEL_MIN: 1,
  MODEL_MAX: 60,
  YEAR_MIN: 1950,
  YEAR_MAX: 2027,
  PRICE_MIN: 1000,
  PRICE_MAX: 10000000,
  MILEAGE_MIN: 0,
  MILEAGE_MAX: 500000,
  COLOR_MIN: 2,
  COLOR_MAX: 40,
  LOCATION_MIN: 2,
  LOCATION_MAX: 80,
  DESCRIPTION_MIN: 10,
  DESCRIPTION_MAX: 2000,
  MESSAGE_MAX: 1000,
  SHIPPING_ADDRESS_MIN: 5,
  SHIPPING_ADDRESS_MAX: 250,
} as const;

export function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, VALIDATION_RULES.ID_MAX_LENGTH);
}

export const INITIAL_SHOWCASE_LISTINGS: Omit<
  CarListing,
  'id' | 'sellerId' | 'sellerName' | 'createdAt' | 'updatedAt'
>[] = [
  {
    title: '2024 Porsche 911 GT3 Touring Package',
    make: 'Porsche',
    model: '911 GT3 Touring',
    year: 2024,
    price: 258500,
    mileage: 1140,
    bodyStyle: 'Coupe',
    fuelType: 'Gasoline',
    transmission: 'Manual',
    drivetrain: 'RWD',
    exteriorColor: 'Slate Grey Neo',
    location: 'Monterey, CA',
    vin: 'WP0AC2A98RS270411',
    imageUrl: '/src/assets/images/hero_porsche_gt3_studio_1791181142895.jpg',
    description:
      'One-owner 992 GT3 with Touring Package in Slate Grey Neo over Exclusive Manufaktur Cohiba Brown leather. Equipped with 6-speed GT Sport manual transmission, Porsche Ceramic Composite Brakes (PCCB), front axle lift system, carbon fiber roof, and full front PPF from delivery.',
    status: 'active',
    visibility: 'public',
    featured: true,
    viewsCount: 412,
  },
  {
    title: '2025 Porsche Taycan Turbo S Cross Turismo',
    make: 'Porsche',
    model: 'Taycan Turbo S Cross Turismo',
    year: 2025,
    price: 194000,
    mileage: 680,
    bodyStyle: 'Wagon',
    fuelType: 'Electric',
    transmission: 'Automatic',
    drivetrain: 'AWD',
    exteriorColor: 'Chalk White',
    location: 'San Francisco, CA',
    vin: 'WP0BA2Y16SSA84102',
    imageUrl: '/src/assets/images/car_taycan_cross_turismo_1791181159900.jpg',
    description:
      '938-hp dual-motor flagship shooting brake featuring Porsche Active Ride suspension, Off-Road Design Package in Vesuvius Grey, 21-inch Cross Turismo Design wheels, Burmester 3D High-End Surround Sound, and 320 kW 800-volt fast-charging architecture.',
    status: 'active',
    visibility: 'public',
    featured: true,
    viewsCount: 289,
  },
  {
    title: '2024 Land Rover Defender 110 V8 Carpathian Edition',
    make: 'Land Rover',
    model: 'Defender 110 V8',
    year: 2024,
    price: 118900,
    mileage: 4250,
    bodyStyle: 'SUV',
    fuelType: 'Gasoline',
    transmission: 'Automatic',
    drivetrain: 'AWD',
    exteriorColor: 'Carpathian Grey Satin',
    location: 'Aspen, CO',
    vin: 'SALEWEEE9R2289415',
    imageUrl: '/src/assets/images/car_defender_110_v8_1791181171359.jpg',
    description:
      'Supercharged 5.0-liter V8 producing 518 horsepower, factory satin protective film over Carpathian Grey, Narvik Black contrast roof and bonnet, Electronic Active Differential, quad outboard-mounted exhaust pipes, and Vintage Tan Windsor leather interior.',
    status: 'active',
    visibility: 'public',
    featured: true,
    viewsCount: 334,
  },
  {
    title: '2025 Mercedes-AMG GT 63 4MATIC+ Coupe',
    make: 'Mercedes-AMG',
    model: 'GT 63 Coupe',
    year: 2025,
    price: 186400,
    mileage: 920,
    bodyStyle: 'Coupe',
    fuelType: 'Gasoline',
    transmission: 'Dual-Clutch',
    drivetrain: 'AWD',
    exteriorColor: 'Obsidian Black Metallic',
    location: 'Miami, FL',
    vin: 'W1K7X8JB4SA019382',
    imageUrl: '/src/assets/images/car_amg_gt_coupe_1791181182873.jpg',
    description:
      'Handcrafted AMG 4.0L V8 biturbo engine delivering 577 hp with AMG Performance 4MATIC+ all-wheel drive, active rear-axle steering, AMG ACTIVE RIDE CONTROL roll stabilization, Aerodynamics Package, and Nappa leather AMG Performance seats.',
    status: 'active',
    visibility: 'public',
    featured: false,
    viewsCount: 245,
  },
  {
    title: '2025 Lucid Air Sapphire Tri-Motor AWD',
    make: 'Lucid',
    model: 'Air Sapphire',
    year: 2025,
    price: 239000,
    mileage: 510,
    bodyStyle: 'Sedan',
    fuelType: 'Electric',
    transmission: 'Automatic',
    drivetrain: 'AWD',
    exteriorColor: 'Sapphire Blue Metallic',
    location: 'Scottsdale, AZ',
    vin: '50EA1GBA7SA004190',
    imageUrl: '/src/assets/images/car_lucid_air_sapphire_1791181195504.jpg',
    description:
      '1,234-hp tri-motor torque-vectoring super-sports sedan capable of 0-60 mph in 1.89 seconds and 427 miles of EPA-estimated range. Carbon-ceramic braking system standard, staggered Aero Sapphire wheels with Michelin Pilot Sport 4S tires, and Mojave PurLuxe alcantara cockpit.',
    status: 'active',
    visibility: 'public',
    featured: false,
    viewsCount: 318,
  },
];
