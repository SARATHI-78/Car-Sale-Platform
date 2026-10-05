import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Search,
  Bell,
  WifiOff,
  RefreshCw,
  LogOut,
  Shield,
  MessageSquare,
  Plus,
  SlidersHorizontal,
  ArrowUpRight,
  Check,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  BodyStyle,
  CarListing,
  DirectMessage,
  FuelType,
  INITIAL_SHOWCASE_LISTINGS,
  OrderTransaction,
  UserNotification,
  UserProfile,
  UserRole,
} from './types/marketplace';
import {
  requestPushPermission,
  triggerBrowserPushNotification,
  useOnlineStatus,
} from './hooks/useOnlineStatus';
import { PWAInstallButton } from './components/PWAInstallButton';
import { VehicleImage } from './components/VehicleImage';
import { CheckoutModal } from './components/CheckoutModal';
import { ListingFormModal } from './components/ListingFormModal';
import { MessagingDrawer } from './components/MessagingDrawer';
import { AdminAnalyticsView } from './components/AdminAnalyticsView';
import { VehicleDetailModal } from './components/VehicleDetailModal';

const BOOTSTRAPPED_ADMIN_EMAIL = 'sundarasarathi78@gmail.com';

export default function App() {
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Navigation view state
  const [activeView, setActiveView] = useState<'marketplace' | 'admin_analytics'>('marketplace');

  // Firestore real-time collections
  const [firestoreListings, setFirestoreListings] = useState<CarListing[]>([]);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [orders, setOrders] = useState<OrderTransaction[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBodyStyle, setSelectedBodyStyle] = useState<'All' | BodyStyle>('All');
  const [selectedFuel, setSelectedFuel] = useState<'All' | FuelType>('All');
  const [maxPrice, setMaxPrice] = useState<number>(300000);
  const [sortBy, setSortBy] = useState<
    'featured' | 'price_asc' | 'price_desc' | 'mileage_asc' | 'year_desc'
  >('featured');

  // Modals & Drawers
  const [detailListing, setDetailListing] = useState<CarListing | null>(null);
  const [checkoutListing, setCheckoutListing] = useState<CarListing | null>(null);
  const [showListingForm, setShowListingForm] = useState(false);
  const [editingListing, setEditingListing] = useState<CarListing | null>(null);
  const [showMessaging, setShowMessaging] = useState(false);
  const [messagingInitialListing, setMessagingInitialListing] = useState<CarListing | null>(null);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [showOfflineSyncModal, setShowOfflineSyncModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  );
  const [toastBanner, setToastBanner] = useState<{ title: string; subtitle: string } | null>(null);

  const { isOnline, simulatedOffline, toggleSimulatedOffline, lastSyncedAt, markSynced } =
    useOnlineStatus();

  const isAdminUser = Boolean(
    fbUser &&
      ((fbUser.email === BOOTSTRAPPED_ADMIN_EMAIL && fbUser.emailVerified) ||
        userProfile?.role === 'admin')
  );

  const showToast = (title: string, subtitle: string) => {
    setToastBanner({ title, subtitle });
    setTimeout(() => {
      setToastBanner((prev) => (prev?.title === title ? null : prev));
    }, 4500);
  };

  // 1. Auth Listener & Profile Bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      setAuthReady(true);

      if (!user) {
        setUserProfile(null);
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userDocRef);
        const isBootstrappedAdmin =
          user.email === BOOTSTRAPPED_ADMIN_EMAIL && user.emailVerified;

        if (!snap.exists()) {
          const initialRole: UserRole = isBootstrappedAdmin ? 'admin' : 'seller';
          const newProfile = {
            uid: user.uid,
            displayName: (user.displayName || user.email?.split('@')[0] || 'Veloce Member').slice(
              0,
              80
            ),
            role: initialRole,
            verifiedSeller: isBootstrappedAdmin ? true : false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userDocRef, newProfile);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    });
    return () => unsub();
  }, []);

  // 2. Listen to Current User Profile & Seed Showcase Vehicles if DB is empty
  useEffect(() => {
    if (!authReady || !fbUser) return;

    const userRef = doc(db, 'users', fbUser.uid);
    const unsubProfile = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`);
      }
    );

    return () => unsubProfile();
  }, [authReady, fbUser]);

  // 3. Real-time Public Listings Listener
  useEffect(() => {
    const q = query(collection(db, 'listings'), where('visibility', '==', 'public'));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const items: CarListing[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<CarListing, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setFirestoreListings(items);
        setListingsLoaded(true);
        if (!snap.metadata.hasPendingWrites) {
          markSynced();
        }

        // Seed initial 5 showcase listings once when an authenticated user has a profile and DB is empty
        if (snap.empty && fbUser && userProfile) {
          for (let i = 0; i < INITIAL_SHOWCASE_LISTINGS.length; i++) {
            const item = INITIAL_SHOWCASE_LISTINGS[i];
            const seedId = `veloce_lot_${i + 1}`;
            try {
              await setDoc(doc(db, 'listings', seedId), {
                ...item,
                sellerId: fbUser.uid,
                sellerName: userProfile.displayName || 'Veloce Reserve Concierge',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, `listings/${seedId}`);
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'listings');
      }
    );

    return () => unsub();
  }, [fbUser, userProfile]);

  // 4. Real-time Orders, Messages, Notifications, and Users Listeners for Authenticated User
  useEffect(() => {
    if (!authReady || !fbUser) {
      setOrders([]);
      setMessages([]);
      setNotifications([]);
      setAllUsers([]);
      return;
    }

    // Orders listener
    const ordersQuery = isAdminUser
      ? collection(db, 'orders')
      : query(collection(db, 'orders'), where('buyerId', '==', fbUser.uid));

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        const list: OrderTransaction[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<OrderTransaction, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setOrders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );

    // Messages sent & received listeners
    const sentQuery = query(collection(db, 'messages'), where('senderId', '==', fbUser.uid));
    const recQuery = query(collection(db, 'messages'), where('recipientId', '==', fbUser.uid));

    let sentDocs: DirectMessage[] = [];
    let recDocs: DirectMessage[] = [];

    const mergeMessages = () => {
      const map = new Map<string, DirectMessage>();
      for (const m of [...sentDocs, ...recDocs]) {
        map.set(m.id, m);
      }
      const merged = Array.from(map.values()).sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return ta - tb;
      });
      setMessages(merged);
    };

    const unsubSent = onSnapshot(
      sentQuery,
      (snap) => {
        sentDocs = snap.docs.map((d) => ({
          ...(d.data() as Omit<DirectMessage, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        mergeMessages();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'messages');
      }
    );

    const unsubRec = onSnapshot(
      recQuery,
      (snap) => {
        recDocs = snap.docs.map((d) => ({
          ...(d.data() as Omit<DirectMessage, 'id'>),
          id: d.id,
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        mergeMessages();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'messages');
      }
    );

    // Notifications listener
    const notifQuery = query(
      collection(db, 'notifications'),
      where('recipientId', '==', fbUser.uid)
    );
    const unsubNotif = onSnapshot(
      notifQuery,
      (snap) => {
        const list: UserNotification[] = snap.docs
          .map((d) => ({
            ...(d.data() as Omit<UserNotification, 'id'>),
            id: d.id,
            hasPendingWrites: d.metadata.hasPendingWrites,
          }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setNotifications(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      }
    );

    // Users list (Admin or self)
    const usersQuery = isAdminUser
      ? collection(db, 'users')
      : query(collection(db, 'users'), where('uid', '==', fbUser.uid));

    const unsubUsers = onSnapshot(
      usersQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserProfile);
        setAllUsers(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );

    return () => {
      unsubOrders();
      unsubSent();
      unsubRec();
      unsubNotif();
      unsubUsers();
    };
  }, [authReady, fbUser, isAdminUser]);

  // Combine Firestore listings with fallback showcase if database has not been seeded yet
  const activeListings: CarListing[] = useMemo(() => {
    if (firestoreListings.length > 0) {
      return firestoreListings;
    }
    return INITIAL_SHOWCASE_LISTINGS.map((item, idx) => ({
      ...item,
      id: `veloce_lot_${idx + 1}`,
      sellerId: 'veloce_concierge_specialist',
      sellerName: 'Veloce Reserve Concierge',
      createdAt: { toMillis: () => Date.now() } as CarListing['createdAt'],
      updatedAt: { toMillis: () => Date.now() } as CarListing['updatedAt'],
    }));
  }, [firestoreListings]);

  // Filtered and sorted listings
  const filteredListings = useMemo(() => {
    return activeListings
      .filter((car) => {
        if (selectedBodyStyle !== 'All' && car.bodyStyle !== selectedBodyStyle) return false;
        if (selectedFuel !== 'All' && car.fuelType !== selectedFuel) return false;
        if (car.price > maxPrice) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            car.title.toLowerCase().includes(q) ||
            car.make.toLowerCase().includes(q) ||
            car.model.toLowerCase().includes(q) ||
            car.location.toLowerCase().includes(q) ||
            car.exteriorColor.toLowerCase().includes(q) ||
            car.vin.toLowerCase().includes(q) ||
            String(car.year).includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price_asc') return a.price - b.price;
        if (sortBy === 'price_desc') return b.price - a.price;
        if (sortBy === 'mileage_asc') return a.mileage - b.mileage;
        if (sortBy === 'year_desc') return b.year - a.year;
        return Number(b.featured) - Number(a.featured);
      });
  }, [activeListings, selectedBodyStyle, selectedFuel, maxPrice, searchQuery, sortBy]);

  const heroListing = useMemo(() => {
    return activeListings.find((c) => c.featured) || activeListings[0];
  }, [activeListings]);

  const pendingSyncCount = useMemo(() => {
    const lCount = firestoreListings.filter((i) => i.hasPendingWrites).length;
    const oCount = orders.filter((i) => i.hasPendingWrites).length;
    const mCount = messages.filter((i) => i.hasPendingWrites).length;
    return lCount + oCount + mCount;
  }, [firestoreListings, orders, messages]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const unreadMessagesCount = useMemo(
    () =>
      messages.filter((m) => fbUser && m.recipientId === fbUser.uid && !m.read).length,
    [messages, fbUser]
  );

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in to Veloce Reserve', 'Escrow vault, messaging, and offline sync enabled.');
    } catch (error) {
      console.error('Authentication error:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveView('marketplace');
    showToast('Signed Out', 'Session closed safely.');
  };

  const handleInspectListing = async (car: CarListing) => {
    setDetailListing(car);
    // Increment view counter if backed by Firestore and user is signed in
    if (fbUser && firestoreListings.some((f) => f.id === car.id)) {
      try {
        await updateDoc(doc(db, 'listings', car.id), {
          viewsCount: (car.viewsCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore view increment error if offline or unverified
      }
    }
  };

  const handleMarkNotificationRead = async (n: UserNotification) => {
    if (n.read) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), {
        read: true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${n.id}`);
    }
  };

  const handleEnablePushNotifications = async () => {
    const perm = await requestPushPermission();
    setPushStatus(perm);
    if (perm === 'granted') {
      triggerBrowserPushNotification(
        'Veloce Reserve Real-Time Alerts Active',
        'You will receive instant push notifications for escrow status updates and buyer inquiries.'
      );
      showToast('Push Notifications Enabled', 'Real-time order and message alerts are active.');
    } else {
      showToast(
        'In-App Real-Time Feed Active',
        'Browser push permission is blocked by your browser; live in-app alerts remain active.'
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F8] text-slate-900">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-8 py-4 bg-[#F9F9F8]/95 backdrop-blur-xs border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#showroom"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('marketplace');
          }}
          className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Veloce Reserve
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveView('marketplace')}
            className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
              activeView === 'marketplace' ? 'text-slate-900 underline' : ''
            }`}
          >
            Showroom
          </button>
          <button
            onClick={() => {
              if (!userProfile) {
                handleSignIn();
              } else {
                setEditingListing(null);
                setShowListingForm(true);
              }
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Consign Vehicle
          </button>
          <button
            onClick={() => {
              if (!userProfile) {
                handleSignIn();
              } else {
                setMessagingInitialListing(null);
                setShowMessaging(true);
              }
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Concierge{unreadMessagesCount > 0 ? ` (${unreadMessagesCount})` : ''}
          </button>
          <button
            onClick={() => {
              if (!userProfile) {
                handleSignIn();
              } else {
                setActiveView('admin_analytics');
              }
            }}
            className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
              activeView === 'admin_analytics' ? 'text-slate-900 underline' : ''
            }`}
          >
            Analytics & Admin
          </button>
          <button
            onClick={() => setShowOfflineSyncModal(true)}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            {isOnline ? 'Sync Vault' : 'Offline Mode Active'}
          </button>
        </nav>

        {/* Zone 3: 1-2 Primary Actions */}
        <div className="flex items-center gap-2.5">
          <PWAInstallButton />

          {userProfile ? (
            <>
              <button
                onClick={() => setShowNotificationsDrawer(true)}
                className="relative rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                aria-label="Open notifications"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Alerts</span>
                {unreadNotificationsCount > 0 && (
                  <span className="font-mono font-semibold text-amber-700">
                    ({unreadNotificationsCount})
                  </span>
                )}
              </button>

              <button
                onClick={handleSignOut}
                className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                title={`Signed in as ${userProfile.displayName} (${
                  isAdminUser ? 'Admin' : userProfile.role
                })`}
              >
                <span className="truncate max-w-[110px]">{userProfile.displayName}</span>
                <LogOut className="w-3.5 h-3.5 text-slate-300" />
              </button>
            </>
          ) : (
            <button
              onClick={handleSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In with Google
            </button>
          )}
        </div>
      </header>

      {/* Mobile Secondary Navigation Bar */}
      <div className="flex md:hidden items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 text-xs font-medium text-slate-700 overflow-x-auto gap-4">
        <button
          onClick={() => setActiveView('marketplace')}
          className={`whitespace-nowrap ${
            activeView === 'marketplace' ? 'text-slate-900 font-semibold' : ''
          }`}
        >
          Showroom
        </button>
        <button
          onClick={() => {
            if (!userProfile) handleSignIn();
            else {
              setEditingListing(null);
              setShowListingForm(true);
            }
          }}
          className="whitespace-nowrap"
        >
          Consign
        </button>
        <button
          onClick={() => {
            if (!userProfile) handleSignIn();
            else setShowMessaging(true);
          }}
          className="whitespace-nowrap"
        >
          Messages{unreadMessagesCount > 0 ? ` (${unreadMessagesCount})` : ''}
        </button>
        <button
          onClick={() => {
            if (!userProfile) handleSignIn();
            else setActiveView('admin_analytics');
          }}
          className={`whitespace-nowrap ${
            activeView === 'admin_analytics' ? 'text-slate-900 font-semibold' : ''
          }`}
        >
          Analytics & Admin
        </button>
        <button onClick={() => setShowOfflineSyncModal(true)} className="whitespace-nowrap">
          {isOnline ? 'Sync Status' : 'Offline Vault'}
        </button>
      </div>

      {/* Toast Notification Banner */}
      {toastBanner && (
        <div className="fixed top-20 right-4 z-50 max-w-sm rounded-xl bg-slate-900 text-white px-4 py-3 shadow-xl border border-slate-700">
          <div className="text-xs font-semibold">{toastBanner.title}</div>
          <div className="text-[11px] text-slate-300 mt-0.5">{toastBanner.subtitle}</div>
        </div>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1">
        {activeView === 'admin_analytics' && userProfile ? (
          <AdminAnalyticsView
            currentUser={userProfile}
            isAdminUser={isAdminUser}
            listings={activeListings}
            orders={orders}
            messages={messages}
            users={allUsers.length > 0 ? allUsers : [userProfile]}
            onOpenCreateModal={() => {
              setEditingListing(null);
              setShowListingForm(true);
            }}
            onOpenEditModal={(car) => {
              setEditingListing(car);
              setShowListingForm(true);
            }}
          />
        ) : (
          <div className="space-y-16 pb-20">
            {/* SECTION 1: STOREFRONT HERO SHOWCASE */}
            {heroListing && (
              <section className="max-w-[1360px] mx-auto px-4 sm:px-8 pt-6 sm:pt-10">
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-lg">
                  <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
                    {/* Hero Image with Measured Scrim */}
                    <div className="lg:col-span-7 relative min-h-[320px] sm:min-h-[460px]">
                      <VehicleImage
                        src={heroListing.imageUrl}
                        alt={heroListing.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-slate-950/20 lg:to-slate-950" />
                    </div>

                    {/* Hero Editorial & Purchase Action Column */}
                    <div className="lg:col-span-5 p-6 sm:p-10 flex flex-col justify-between text-white bg-slate-950">
                      <div className="space-y-4">
                        <div className="text-xs text-amber-400 tracking-wide">
                          <span>Curated Flagship Lot</span>
                          <span className="mx-1.5">·</span>
                          <span>{heroListing.location}</span>
                          <span className="mx-1.5">·</span>
                          <span className="font-mono">{heroListing.vin}</span>
                        </div>

                        <h1
                          className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-white leading-tight"
                          style={{ textWrap: 'balance' }}
                        >
                          {heroListing.title}
                        </h1>

                        <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
                          {heroListing.description}
                        </p>

                        <div className="pt-3 flex items-center gap-4 text-xs text-slate-400">
                          <span>{heroListing.mileage.toLocaleString()} miles</span>
                          <span>·</span>
                          <span>{heroListing.transmission}</span>
                          <span>·</span>
                          <span>{heroListing.drivetrain}</span>
                          <span>·</span>
                          <span>{heroListing.exteriorColor}</span>
                        </div>
                      </div>

                      <div className="pt-8 mt-8 border-t border-slate-800 space-y-5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-slate-400">Direct Escrow Asking Price</span>
                          <span className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-white">
                            ${heroListing.price.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => handleInspectListing(heroListing)}
                            className="flex-1 py-3 px-5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                          >
                            Inspect Dossier & Reserve
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (!userProfile) {
                                handleSignIn();
                              } else {
                                setMessagingInitialListing(heroListing);
                                setShowMessaging(true);
                              }
                            }}
                            className="py-3 px-4 rounded-lg border border-slate-700 text-white text-xs font-medium hover:bg-slate-900 transition-colors whitespace-nowrap"
                          >
                            Message Seller
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* SECTION 2: FILTERABLE REAL-TIME MARKETPLACE CATALOG */}
            <section id="showroom" className="max-w-[1360px] mx-auto px-4 sm:px-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">
                    Verified Collector & Performance Inventory
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Real-time listings backed by independent mechanical inspection and escrow
                    settlement
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span>
                    Showing <strong className="font-mono">{filteredListings.length}</strong> of{' '}
                    <strong className="font-mono">{activeListings.length}</strong> vehicles
                  </span>
                  <span>·</span>
                  <button
                    onClick={() => {
                      if (!userProfile) handleSignIn();
                      else {
                        setEditingListing(null);
                        setShowListingForm(true);
                      }
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:underline underline-offset-4"
                  >
                    <Plus className="w-3.5 h-3.5" /> Consign a Vehicle
                  </button>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Search Input */}
                  <div className="md:col-span-5 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by make, model, year, exterior color, location, or VIN..."
                      className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-slate-900"
                    />
                  </div>

                  {/* Body Style Segmented Filter */}
                  <div className="md:col-span-4 flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                    {(['All', 'Coupe', 'Sedan', 'SUV', 'Wagon'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => setSelectedBodyStyle(style)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          selectedBodyStyle === style
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>

                  {/* Sort Order */}
                  <div className="md:col-span-3 flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                    >
                      <option value="featured">Sort: Featured First</option>
                      <option value="price_asc">Price: Low to High</option>
                      <option value="price_desc">Price: High to Low</option>
                      <option value="mileage_asc">Mileage: Lowest First</option>
                      <option value="year_desc">Year: Newest First</option>
                    </select>
                  </div>
                </div>

                {/* Secondary Filter Row: Powertrain + Price Ceiling */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Powertrain:</span>
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['All', 'Gasoline', 'Electric', 'Hybrid'] as const).map((fuel) => (
                        <button
                          key={fuel}
                          onClick={() => setSelectedFuel(fuel)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            selectedFuel === fuel
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {fuel}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      Max Price:{' '}
                      <strong className="font-mono tabular-nums text-slate-900">
                        ${maxPrice.toLocaleString()}
                      </strong>
                    </span>
                    <input
                      type="range"
                      min={50000}
                      max={300000}
                      step={5000}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(Number(e.target.value))}
                      className="w-36 accent-slate-900"
                    />
                    {(selectedBodyStyle !== 'All' ||
                      selectedFuel !== 'All' ||
                      maxPrice < 300000 ||
                      searchQuery) && (
                      <button
                        onClick={() => {
                          setSelectedBodyStyle('All');
                          setSelectedFuel('All');
                          setMaxPrice(300000);
                          setSearchQuery('');
                        }}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3-Column Product Grid */}
              {!listingsLoaded && firestoreListings.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="rounded-xl bg-white border border-slate-200 overflow-hidden animate-pulse"
                    >
                      <div className="aspect-4/3 bg-slate-200" />
                      <div className="p-5 space-y-3">
                        <div className="h-3 w-1/2 bg-slate-200 rounded" />
                        <div className="h-5 w-3/4 bg-slate-200 rounded" />
                        <div className="h-4 w-1/3 bg-slate-200 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredListings.length === 0 ? (
                <div className="rounded-xl bg-white border border-slate-200 p-12 text-center space-y-3">
                  <p className="text-base font-semibold text-slate-900">
                    No vehicles match your current filter criteria
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Try expanding your maximum price slider or clearing your powertrain and chassis
                    filters.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedBodyStyle('All');
                      setSelectedFuel('All');
                      setMaxPrice(300000);
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {filteredListings.map((car) => (
                    <article
                      key={car.id}
                      onClick={() => handleInspectListing(car)}
                      className="group cursor-pointer rounded-xl bg-white border border-slate-200 overflow-hidden transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between"
                    >
                      <div>
                        {/* 4:3 Studio Vehicle Imagery */}
                        <div className="aspect-4/3 w-full bg-[#18181B] overflow-hidden relative">
                          <VehicleImage
                            src={car.imageUrl}
                            alt={car.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        </div>

                        {/* Card Copy — Zero Pill Metadata Discipline */}
                        <div className="p-5 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>
                              {car.make} · {car.bodyStyle} · {car.fuelType}
                            </span>
                            <span
                              className={`font-medium capitalize ${
                                car.status === 'active'
                                  ? 'text-emerald-700'
                                  : car.status === 'reserved'
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {car.hasPendingWrites ? 'Syncing' : car.status}
                            </span>
                          </div>

                          <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-1">
                            {car.title}
                          </h3>

                          <div className="text-xs text-slate-500">
                            <span className="font-mono tabular-nums">
                              {car.mileage.toLocaleString()} mi
                            </span>
                            <span className="mx-1.5">·</span>
                            <span>{car.transmission}</span>
                            <span className="mx-1.5">·</span>
                            <span>{car.location}</span>
                          </div>
                        </div>
                      </div>

                      {/* Price & Quick Action Baseline */}
                      <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="text-[15px] font-mono tabular-nums font-semibold text-slate-900">
                          ${car.price.toLocaleString()}
                        </div>

                        <div
                          className="flex items-center gap-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              if (!userProfile) {
                                handleSignIn();
                              } else {
                                setMessagingInitialListing(car);
                                setShowMessaging(true);
                              }
                            }}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
                          >
                            Inquire
                          </button>
                          {car.status === 'active' ? (
                            <button
                              onClick={() => {
                                if (!userProfile) {
                                  handleSignIn();
                                } else {
                                  setCheckoutListing(car);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
                            >
                              Reserve
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-slate-400 capitalize">
                              {car.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* SECTION 3: PROVENANCE, ESCROW ARCHITECTURE & QUANTITATIVE PROOF */}
            <section className="max-w-[1360px] mx-auto px-4 sm:px-8">
              <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="text-xs text-slate-500">
                    <span>01. Institutional Settlement & Offline Resilience</span>
                    <span className="mx-1.5">·</span>
                    <span>ISO-27001 Escrow Custody</span>
                  </div>
                  <h2
                    className="text-2xl sm:text-3xl font-display font-bold text-slate-900"
                    style={{ textWrap: 'balance' }}
                  >
                    Every transaction is protected by multi-stage escrow, direct specialist
                    messaging, and automatic offline synchronization.
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                    Whether inspecting a vehicle in an underground storage vault without cellular
                    reception or executing a cross-border wire settlement, Veloce Reserve caches
                    dossiers locally and synchronizes orders and messages automatically once
                    connectivity is restored.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-6 text-xs">
                    <div>
                      <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                        $142.8M+
                      </div>
                      <div className="text-slate-500">Escrow Volume Settled in 12 Months</div>
                    </div>
                    <div>
                      <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                        11.4 Days
                      </div>
                      <div className="text-slate-500">Median Time from Listing to Funded Wire</div>
                    </div>
                    <div>
                      <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                        100%
                      </div>
                      <div className="text-slate-500">VIN & Paint-Meter Verified Inventory</div>
                    </div>
                  </div>
                </div>

                {/* Attributable Testimonial (Claim-to-Proof Adjacency) */}
                <div className="lg:col-span-5 p-6 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <p className="text-sm text-slate-700 leading-relaxed italic">
                    “Before moving our private collection sales to Veloce Reserve, wire verification
                    and pre-purchase inspection coordination took nearly three weeks per vehicle.
                    With integrated escrow holds and direct dossier messaging, we closed our 992 GT3
                    Touring in 48 hours with zero settlement friction.”
                  </p>
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900">Marcus Vance</div>
                    <div className="text-slate-500">
                      Managing Director, Vance Motorsport Holdings (Monterey, CA)
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* QUIET FOOTER */}
      <footer className="border-t border-slate-200 bg-white px-4 sm:px-8 py-6">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span>© {new Date().getFullYear()} Veloce Reserve Exchange</span>
            <span className="mx-2">·</span>
            <span>Collector & Performance Vehicle Marketplace</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={() => setShowOfflineSyncModal(true)}
              className="hover:text-slate-900 transition-colors"
            >
              Offline Sync & Push Settings
            </button>
            <button
              onClick={() => {
                if (!userProfile) handleSignIn();
                else setActiveView('admin_analytics');
              }}
              className="hover:text-slate-900 transition-colors"
            >
              Executive Analytics
            </button>
          </div>
        </div>
      </footer>

      {/*PERSISTENT OFFLINE / PENDING SYNC INDICATOR */}
      {(!isOnline || pendingSyncCount > 0) && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl border border-slate-700">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div>
              {!isOnline
                ? 'Offline Vault Mode Active — Cached Data & Queue Enabled'
                : `Synchronizing ${pendingSyncCount} Pending Write(s)...`}
            </div>
            <div className="text-[11px] text-slate-400">
              Changes sync automatically when online
            </div>
          </div>
          {simulatedOffline && (
            <button
              onClick={toggleSimulatedOffline}
              className="ml-2 px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
            >
              Reconnect & Sync Now
            </button>
          )}
        </div>
      )}

      {/* VEHICLE DETAIL MODAL (PDP) */}
      {detailListing && (
        <VehicleDetailModal
          listing={detailListing}
          currentUser={userProfile}
          isAdminUser={isAdminUser}
          onClose={() => setDetailListing(null)}
          onOpenCheckout={(car) => {
            setDetailListing(null);
            setCheckoutListing(car);
          }}
          onOpenMessage={(car) => {
            setDetailListing(null);
            setMessagingInitialListing(car);
            setShowMessaging(true);
          }}
          onOpenEdit={(car) => {
            setDetailListing(null);
            setEditingListing(car);
            setShowListingForm(true);
          }}
          onRequireAuth={() => {
            setDetailListing(null);
            handleSignIn();
          }}
        />
      )}

      {/* SECURE ESCROW CHECKOUT MODAL */}
      {checkoutListing && userProfile && (
        <CheckoutModal
          listing={checkoutListing}
          currentUser={userProfile}
          isOnline={isOnline}
          onClose={() => setCheckoutListing(null)}
          onSuccess={(orderId) => {
            showToast(
              `Order #${orderId.slice(-6).toUpperCase()} Recorded`,
              isOnline
                ? 'Escrow payment processed and synced in real time.'
                : 'Order queued in Offline Vault; will sync automatically when online.'
            );
          }}
        />
      )}

      {/* CREATE / EDIT CONSIGNMENT MODAL */}
      {showListingForm && userProfile && (
        <ListingFormModal
          currentUser={userProfile}
          existingListing={editingListing}
          onClose={() => {
            setShowListingForm(false);
            setEditingListing(null);
          }}
          onSaved={() => {
            showToast(
              editingListing ? 'Listing Updated' : 'Vehicle Consigned Live',
              isOnline
                ? 'Published to the real-time marketplace.'
                : 'Saved to Offline Vault; will sync automatically when online.'
            );
          }}
        />
      )}

      {/* DIRECT BUYER-SELLER MESSAGING DRAWER */}
      {showMessaging && userProfile && (
        <MessagingDrawer
          currentUser={userProfile}
          messages={messages}
          listings={activeListings}
          initialListing={messagingInitialListing}
          onClose={() => {
            setShowMessaging(false);
            setMessagingInitialListing(null);
          }}
        />
      )}

      {/* REAL-TIME NOTIFICATIONS & PUSH ALERTS DRAWER */}
      {showNotificationsDrawer && userProfile && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold">Real-Time Order & Dossier Alerts</h2>
              </div>
              <button
                onClick={() => setShowNotificationsDrawer(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Browser Push Notifications
                </div>
                <div className="text-[11px] text-slate-500">
                  Status: {pushStatus === 'granted' ? 'Enabled' : 'Click to enable instant alerts'}
                </div>
              </div>
              <button
                onClick={handleEnablePushNotifications}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {pushStatus === 'granted' ? 'Send Test Push' : 'Enable Push'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No notifications yet. Order updates, escrow releases, and buyer messages appear
                  here in real time.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleMarkNotificationRead(n)}
                    className={`p-4 cursor-pointer transition-colors ${
                      n.read ? 'bg-white' : 'bg-amber-50/40 hover:bg-amber-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="uppercase tracking-wider font-medium">
                        {n.type.replace('_', ' ')}
                      </span>
                      <span>{n.read ? 'Read' : 'New Alert'}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 mt-1">{n.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.body}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* OFFLINE SYNC & RBAC CONTROL MODAL */}
      {showOfflineSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold">
                  Offline Persistence, Auto-Sync & Role Controls
                </h2>
              </div>
              <button
                onClick={() => setShowOfflineSyncModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">Firestore Network State</span>
                  <span
                    className={`font-mono font-semibold ${
                      isOnline ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {isOnline ? 'ONLINE (Live Cloud Sync)' : 'OFFLINE VAULT (Local IndexedDB)'}
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Veloce Reserve uses persistent IndexedDB caching. When offline, you can continue
                  browsing listings, submitting consignment updates, reserving vehicles, and sending
                  messages. All queued writes synchronize automatically as soon as connectivity is
                  restored.
                </p>
                <div className="pt-2 flex items-center justify-between text-slate-500 border-t border-slate-200">
                  <span>Pending Local Writes: {pendingSyncCount}</span>
                  <span className="font-mono">
                    Last Synced: {lastSyncedAt.toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200">
                <div>
                  <div className="font-semibold text-slate-900">
                    Simulate Offline Mode (Test Auto-Sync)
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Disconnects Firestore network transport to test offline queuing & automatic
                    resync
                  </div>
                </div>
                <button
                  onClick={toggleSimulatedOffline}
                  className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    simulatedOffline
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {simulatedOffline ? 'Go Online & Auto-Sync' : 'Go Offline'}
                </button>
              </div>

              {userProfile && (
                <div className="p-4 rounded-lg border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-slate-700" />
                      Active RBAC Profile Role
                    </span>
                    <span className="font-mono uppercase font-semibold text-slate-900">
                      {isAdminUser ? 'admin (verified)' : userProfile.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(['buyer', 'seller'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'users', userProfile.uid), {
                              role: r,
                              updatedAt: serverTimestamp(),
                            });
                            showToast('Role Updated', `Switched active workspace role to ${r}.`);
                          } catch (error) {
                            handleFirestoreError(
                              error,
                              OperationType.UPDATE,
                              `users/${userProfile.uid}`
                            );
                          }
                        }}
                        className={`flex-1 py-2 rounded-lg border font-medium capitalize inline-flex items-center justify-center gap-1.5 transition-colors ${
                          userProfile.role === r
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {userProfile.role === r && <Check className="w-3.5 h-3.5" />}
                        {r} Account
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setShowOfflineSyncModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
