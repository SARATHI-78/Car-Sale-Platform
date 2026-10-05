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

export type BodyStyle =
  | 'SUV'
  | 'Sedan'
  | 'Hatchback'
  | 'MPV'
  | 'Coupe'
  | 'Wagon'
  | 'Convertible';

export type FuelType = 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid' | 'CNG' | 'Gasoline';

export type TransmissionType =
  | 'Automatic'
  | 'Manual'
  | 'AMT'
  | 'DCT'
  | 'CVT'
  | 'Dual-Clutch';

export type DrivetrainType = 'FWD' | 'RWD' | 'AWD' | '4WD';
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
  | 'Token Booking (UPI/Card)'
  | 'Full On-Road RTGS/NEFT Escrow'
  | 'Instant Card / NetBanking'
  | 'Pre-Approved Bank Auto Loan'
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

export type NotificationCategory =
  | 'order_update'
  | 'new_message'
  | 'listing_status'
  | 'price_alert';

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
  VIN_PATTERN: /^[A-Z0-9\-]{6,20}$/,
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
  PRICE_MAX: 200000000,
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

/**
 * Normalizes any legacy USD price (< 350,000) into realistic INR value,
 * while preserving native INR prices (>= 3,50,000).
 */
export function normalizeToINR(rawPrice: number): number {
  if (rawPrice < 350000) {
    return Math.round(rawPrice * 10);
  }
  return Math.round(rawPrice);
}

export function formatINR(amount: number): string {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

export function formatLakhs(amount: number): string {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  return `₹${(amount / 100000).toFixed(2)} Lakh`;
}

export type IndianRegionCode = 'DL' | 'MH' | 'KA' | 'TN' | 'TS' | 'PN' | 'GJ' | 'KL';

export interface IndianRegionConfig {
  code: IndianRegionCode;
  city: string;
  state: string;
  rtoPrefix: string;
  hubName: string;
  petrolTaxPct: number;
  dieselTaxPct: number;
  hybridTaxPct: number;
  evTaxPct: number;
  cngTaxPct: number;
  rcTransferAndHypothecation: number;
  mcdOrGreenCess: number;
  interStateLogisticsFee: number;
}

export const INDIAN_REGIONS: IndianRegionConfig[] = [
  {
    code: 'DL',
    city: 'Delhi NCR',
    state: 'Delhi',
    rtoPrefix: 'DL-01',
    hubName: 'Gurugram CyberHub & Okhla Mega Hub',
    petrolTaxPct: 10.0,
    dieselTaxPct: 12.5,
    hybridTaxPct: 10.0,
    evTaxPct: 0.0,
    cngTaxPct: 8.0,
    rcTransferAndHypothecation: 4200,
    mcdOrGreenCess: 4000,
    interStateLogisticsFee: 14500,
  },
  {
    code: 'MH',
    city: 'Mumbai',
    state: 'Maharashtra',
    rtoPrefix: 'MH-01',
    hubName: 'Andheri West & Thane Wonder Mall Hub',
    petrolTaxPct: 12.0,
    dieselTaxPct: 14.0,
    hybridTaxPct: 11.0,
    evTaxPct: 0.0,
    cngTaxPct: 7.0,
    rcTransferAndHypothecation: 5100,
    mcdOrGreenCess: 2500,
    interStateLogisticsFee: 16000,
  },
  {
    code: 'KA',
    city: 'Bengaluru',
    state: 'Karnataka',
    rtoPrefix: 'KA-01',
    hubName: 'Whitefield & Bellandur Assured Hub',
    petrolTaxPct: 17.5,
    dieselTaxPct: 18.5,
    hybridTaxPct: 15.5,
    evTaxPct: 0.0,
    cngTaxPct: 14.0,
    rcTransferAndHypothecation: 5800,
    mcdOrGreenCess: 3500,
    interStateLogisticsFee: 15500,
  },
  {
    code: 'TN',
    city: 'Chennai',
    state: 'Tamil Nadu',
    rtoPrefix: 'TN-01',
    hubName: 'Guindy & OMR Navalur Inspection Hub',
    petrolTaxPct: 13.5,
    dieselTaxPct: 15.0,
    hybridTaxPct: 12.5,
    evTaxPct: 0.0,
    cngTaxPct: 11.0,
    rcTransferAndHypothecation: 4600,
    mcdOrGreenCess: 2200,
    interStateLogisticsFee: 15000,
  },
  {
    code: 'TS',
    city: 'Hyderabad',
    state: 'Telangana',
    rtoPrefix: 'TS-09',
    hubName: 'Madhapur & Banjara Hills Hub',
    petrolTaxPct: 13.0,
    dieselTaxPct: 14.5,
    hybridTaxPct: 12.0,
    evTaxPct: 0.0,
    cngTaxPct: 10.5,
    rcTransferAndHypothecation: 4400,
    mcdOrGreenCess: 2000,
    interStateLogisticsFee: 14000,
  },
  {
    code: 'PN',
    city: 'Pune',
    state: 'Maharashtra',
    rtoPrefix: 'MH-12',
    hubName: 'Wakad & Viman Nagar Assured Hub',
    petrolTaxPct: 11.5,
    dieselTaxPct: 13.5,
    hybridTaxPct: 10.5,
    evTaxPct: 0.0,
    cngTaxPct: 7.0,
    rcTransferAndHypothecation: 4800,
    mcdOrGreenCess: 2000,
    interStateLogisticsFee: 13500,
  },
  {
    code: 'GJ',
    city: 'Ahmedabad',
    state: 'Gujarat',
    rtoPrefix: 'GJ-01',
    hubName: 'SG Highway & Prahlad Nagar Hub',
    petrolTaxPct: 6.5,
    dieselTaxPct: 7.0,
    hybridTaxPct: 6.0,
    evTaxPct: 1.0,
    cngTaxPct: 5.5,
    rcTransferAndHypothecation: 3800,
    mcdOrGreenCess: 1500,
    interStateLogisticsFee: 12500,
  },
  {
    code: 'KL',
    city: 'Kochi',
    state: 'Kerala',
    rtoPrefix: 'KL-07',
    hubName: 'Edappally Bypass Assured Hub',
    petrolTaxPct: 15.0,
    dieselTaxPct: 16.5,
    hybridTaxPct: 14.0,
    evTaxPct: 5.0,
    cngTaxPct: 12.0,
    rcTransferAndHypothecation: 4900,
    mcdOrGreenCess: 2800,
    interStateLogisticsFee: 16500,
  },
];

export interface OnRoadBreakdown {
  region: IndianRegionConfig;
  exShowroomPrice: number;
  rtoRoadTax: number;
  roadTaxPctApplied: number;
  insuranceZeroDep: number;
  tcsCharge: number;
  fastagAndHsrp: number;
  rcTransferAndGreenCess: number;
  interStateNocLogistics: number;
  totalOnRoadPrice: number;
  monthlyEmiEstimate: number;
  isSameStateRto: boolean;
}

export function calculateRegionalOnRoadPrice(
  listing: CarListing,
  regionCode: IndianRegionCode
): OnRoadBreakdown {
  const region =
    INDIAN_REGIONS.find((r) => r.code === regionCode) || INDIAN_REGIONS[0];
  const basePrice = normalizeToINR(listing.price);

  // Determine fuel tax percentage
  let taxPct = region.petrolTaxPct;
  const fuel = listing.fuelType;
  if (fuel === 'Diesel') taxPct = region.dieselTaxPct;
  else if (fuel === 'Electric') taxPct = region.evTaxPct;
  else if (fuel === 'Hybrid') taxPct = region.hybridTaxPct;
  else if (fuel === 'CNG') taxPct = region.cngTaxPct;

  // Slab surcharge if luxury (> ₹20 Lakh) for non-EV
  if (basePrice > 2000000 && fuel !== 'Electric') {
    taxPct += 1.5;
  }

  const rtoRoadTax = Math.round((basePrice * taxPct) / 100);
  const insuranceZeroDep = Math.round(basePrice * 0.032 + 4500);
  const tcsCharge = basePrice > 1000000 ? Math.round(basePrice * 0.01) : 0;
  const fastagAndHsrp = 1100;
  const rcTransferAndGreenCess =
    region.rcTransferAndHypothecation + region.mcdOrGreenCess;

  const isSameStateRto =
    listing.location.toLowerCase().includes(region.city.toLowerCase()) ||
    listing.location.toLowerCase().includes(region.state.toLowerCase()) ||
    listing.vin.startsWith(region.rtoPrefix.replace('-', ''));

  const interStateNocLogistics = isSameStateRto ? 0 : region.interStateLogisticsFee;

  const totalOnRoadPrice =
    basePrice +
    rtoRoadTax +
    insuranceZeroDep +
    tcsCharge +
    fastagAndHsrp +
    rcTransferAndGreenCess +
    interStateNocLogistics;

  // Calculate 60-month EMI at 8.85% p.a. with 20% down payment on On-Road Price
  const loanPrincipal = totalOnRoadPrice * 0.8;
  const monthlyRate = 8.85 / 100 / 12;
  const n = 60;
  const monthlyEmiEstimate = Math.round(
    (loanPrincipal * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
      (Math.pow(1 + monthlyRate, n) - 1)
  );

  return {
    region,
    exShowroomPrice: basePrice,
    rtoRoadTax,
    roadTaxPctApplied: Number(taxPct.toFixed(1)),
    insuranceZeroDep,
    tcsCharge,
    fastagAndHsrp,
    rcTransferAndGreenCess,
    interStateNocLogistics,
    totalOnRoadPrice,
    monthlyEmiEstimate,
    isSameStateRto,
  };
}

export function calculateAllRegionsOnRoad(listing: CarListing): OnRoadBreakdown[] {
  return INDIAN_REGIONS.map((r) => calculateRegionalOnRoadPrice(listing, r.code));
}

export const INITIAL_SHOWCASE_LISTINGS: Omit<
  CarListing,
  'id' | 'sellerId' | 'sellerName' | 'createdAt' | 'updatedAt'
>[] = [
  {
    title: '2024 Mahindra XUV700 AX7 Luxury Pack AWD AT',
    make: 'Mahindra',
    model: 'XUV700 AX7L AWD',
    year: 2024,
    price: 2185000,
    mileage: 8400,
    bodyStyle: 'SUV',
    fuelType: 'Diesel',
    transmission: 'Automatic',
    drivetrain: 'AWD',
    exteriorColor: 'Midnight Black Metallic',
    location: 'Delhi NCR',
    vin: 'DL01CAXUV7700',
    imageUrl: '/src/assets/images/india_hero_mahindra_xuv700_1791184461015.jpg',
    description:
      '140-Point CARS24/BharatDrive Assured SUV. Single-owner 2.2L mHawk Turbo Diesel (185 PS / 450 Nm) with 6-speed Torque Converter Automatic and All-Wheel Drive. Features Level-2 ADAS, Sony 12-speaker 3D Audio, Dual 10.25-inch Superscreens, Panoramic Skyroof, 360-degree camera, and 100% original factory paint.',
    status: 'active',
    visibility: 'public',
    featured: true,
    viewsCount: 642,
  },
  {
    title: '2024 Tata Harrier Fearless+ Dark Edition AT',
    make: 'Tata',
    model: 'Harrier Fearless+ AT',
    year: 2024,
    price: 1940000,
    mileage: 6200,
    bodyStyle: 'SUV',
    fuelType: 'Diesel',
    transmission: 'Automatic',
    drivetrain: 'FWD',
    exteriorColor: 'Oberon Bronze Dark',
    location: 'Mumbai, Maharashtra',
    vin: 'MH01DK4421',
    imageUrl: '/src/assets/images/india_car_tata_harrier_ev_1791184474019.jpg',
    description:
      '5-Star Bharat NCAP safety rated flagship SUV powered by Kryotec 2.0L Turbocharged Diesel engine with 6-speed Hyundai-sourced automatic transmission. Equipped with ventilated front seats, 12.3-inch Harman touchscreen, JBL 10-speaker soundbar, gesture-controlled powered tailgate, and comprehensive zero-dep insurance.',
    status: 'active',
    visibility: 'public',
    featured: true,
    viewsCount: 518,
  },
  {
    title: '2024 Hyundai Creta SX(O) 1.5L Turbo GDi DCT',
    make: 'Hyundai',
    model: 'Creta SX(O) Turbo DCT',
    year: 2024,
    price: 1695000,
    mileage: 5100,
    bodyStyle: 'SUV',
    fuelType: 'Petrol',
    transmission: 'DCT',
    drivetrain: 'FWD',
    exteriorColor: 'Atlas White Pearl',
    location: 'Bengaluru, Karnataka',
    vin: 'KA01MJ8890',
    imageUrl: '/src/assets/images/india_car_hyundai_creta_1791184485214.jpg',
    description:
      '160 PS 1.5L Kappa Turbo GDi Petrol mated to a 7-speed Dual Clutch Transmission (DCT). Includes Hyundai SmartSense Level-2 ADAS (19 features), Bose Premium 8-speaker audio, voice-enabled smart panoramic sunroof, ventilated seats, and BlueLink connected car telemetry.',
    status: 'active',
    visibility: 'public',
    featured: true,
    viewsCount: 734,
  },
  {
    title: '2024 Maruti Suzuki Grand Vitara Alpha+ Strong Hybrid',
    make: 'Maruti Suzuki',
    model: 'Grand Vitara Alpha+ e-CVT',
    year: 2024,
    price: 1580000,
    mileage: 9300,
    bodyStyle: 'SUV',
    fuelType: 'Hybrid',
    transmission: 'CVT',
    drivetrain: 'FWD',
    exteriorColor: 'Celestial Blue',
    location: 'Chennai, Tamil Nadu',
    vin: 'TN01BV3310',
    imageUrl: '/src/assets/images/india_car_maruti_grand_vitara_1791184497312.jpg',
    description:
      'Intelligent Electric Hybrid (Strong Hybrid) delivering an ARAI-certified 27.97 km/l fuel efficiency with dedicated EV drive mode. Features Head-Up Display (HUD), 360-view camera, panoramic sunroof, wireless Apple CarPlay/Android Auto, and 8-year hybrid battery warranty.',
    status: 'active',
    visibility: 'public',
    featured: false,
    viewsCount: 489,
  },
  {
    title: '2024 Toyota Innova Hycross ZX(O) Strong Hybrid',
    make: 'Toyota',
    model: 'Innova Hycross ZX(O)',
    year: 2024,
    price: 2660000,
    mileage: 7850,
    bodyStyle: 'MPV',
    fuelType: 'Hybrid',
    transmission: 'Automatic',
    drivetrain: 'FWD',
    exteriorColor: 'Silver Metallic',
    location: 'Hyderabad, Telangana',
    vin: 'TS09UB9920',
    imageUrl: '/src/assets/images/india_car_toyota_hycross_1791184509008.jpg',
    description:
      '5th-Generation Toyota Hybrid System (2.0L TNGA engine + e-Drive transmission) with powered Ottoman captain seats in the second row, Toyota Safety Sense 3.0 ADAS, dual-zone climate control, JBL 9-speaker audio, and zero-waiting immediate hub delivery.',
    status: 'active',
    visibility: 'public',
    featured: true,
    viewsCount: 590,
  },
];
