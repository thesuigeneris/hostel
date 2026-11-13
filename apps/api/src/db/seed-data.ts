import type { GenderType, Meal, SharingType } from '@hostels/shared';

export const DEMO_PHONES = { admin: '9000000001', owner: '9000000002', tenant: '9000000003' } as const;

export const PHOTOS = [
  'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200',
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200',
  'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200',
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200',
];

export const FOOD_PARTNERS = [
  { name: 'California Burrito', cuisine: 'Mexican' },
  { name: 'EatSure', cuisine: 'Multi-cuisine' },
  { name: 'FreshMenu', cuisine: 'Continental' },
  { name: 'Annapurna Tiffins', cuisine: 'South Indian' },
];

type Room = { sharing: SharingType; rent: number; advance: number; beds: number; free: number };
export type SeedHostel = {
  name: string;
  area: string;
  lat: number;
  lng: number;
  address: string;
  genderType: GenderType;
  partner: boolean;
  foodAvailable: boolean;
  description: string;
  amenities: string[];
  rooms: Room[];
  /** Index into the extra owners list for free listings; partner hostels belong to the demo owner. */
  owner?: number;
};

const COMMON_RULES = ['Gate closes at 11 pm (late entry on request)', 'No smoking inside rooms', 'Visitors in the common area only'];
export const RULES = COMMON_RULES;

export const HOSTELS: SeedHostel[] = [
  // Verified partners: subscription, no advance.
  {
    name: 'Sunrise Residency', area: 'Gachibowli', lat: 17.4412, lng: 78.3496, address: 'Plot 21, Telecom Nagar, Gachibowli',
    genderType: 'boys', partner: true, foodAvailable: true,
    description: '2-sharing AC rooms five minutes from DLF Cyber City. In-house kitchen, weekly themed menus.',
    amenities: ['WiFi', 'AC', 'Laundry', 'Power backup', '24x7 security', 'Housekeeping'],
    rooms: [{ sharing: '2-sharing', rent: 11000, advance: 0, beds: 24, free: 4 }, { sharing: '3-sharing', rent: 8500, advance: 0, beds: 18, free: 3 }],
  },
  {
    name: 'CityNest Madhapur', area: 'Madhapur', lat: 17.4486, lng: 78.3908, address: '4th Lane, Ayyappa Society, Madhapur',
    genderType: 'girls', partner: true, foodAvailable: true,
    description: 'Women-only PG with biometric entry, a quiet study lounge and home-style food.',
    amenities: ['WiFi', 'AC', 'Biometric entry', 'Study room', 'Laundry', 'CCTV'],
    rooms: [{ sharing: 'private', rent: 16000, advance: 0, beds: 6, free: 1 }, { sharing: '2-sharing', rent: 12000, advance: 0, beds: 20, free: 5 }],
  },
  {
    name: 'BlueRoof Kondapur', area: 'Kondapur', lat: 17.4698, lng: 78.3577, address: 'Botanical Garden Road, Kondapur',
    genderType: 'coliving', partner: true, foodAvailable: true,
    description: 'Co-living with a rooftop common area, gym and a kitchen that cooks three meals a day.',
    amenities: ['WiFi', 'Gym', 'Rooftop lounge', 'Laundry', 'Power backup'],
    rooms: [{ sharing: '2-sharing', rent: 10500, advance: 0, beds: 16, free: 2 }, { sharing: '4-sharing', rent: 7000, advance: 0, beds: 24, free: 6 }],
  },
  {
    name: 'Habitat HiTech', area: 'HiTech City', lat: 17.4448, lng: 78.3779, address: 'Near Shilparamam, HiTech City',
    genderType: 'boys', partner: true, foodAvailable: true,
    description: 'Walk to Mindspace. Large rooms, fast WiFi and a pantry open all night.',
    amenities: ['WiFi', 'AC', 'Pantry', 'Housekeeping', 'Parking'],
    rooms: [{ sharing: 'private', rent: 15000, advance: 0, beds: 8, free: 2 }, { sharing: '3-sharing', rent: 9000, advance: 0, beds: 21, free: 4 }],
  },
  {
    name: 'Hive Financial District', area: 'Financial District', lat: 17.4162, lng: 78.3421, address: 'Nanakramguda Main Road, Financial District',
    genderType: 'coliving', partner: true, foodAvailable: true,
    description: 'New building next to the Wipro circle with a café-style dining hall.',
    amenities: ['WiFi', 'AC', 'Café', 'Gym', 'Laundry', 'CCTV'],
    rooms: [{ sharing: '2-sharing', rent: 12500, advance: 0, beds: 30, free: 7 }, { sharing: '3-sharing', rent: 9500, advance: 0, beds: 18, free: 2 }],
  },
  {
    name: 'Greenleaf Ameerpet', area: 'Ameerpet', lat: 17.4374, lng: 78.4482, address: 'Behind Metro Station, Ameerpet',
    genderType: 'girls', partner: true, foodAvailable: true,
    description: 'Two minutes from Ameerpet metro, close to coaching centres. Veg-first kitchen.',
    amenities: ['WiFi', 'Metro nearby', 'Laundry', 'Hot water', 'CCTV'],
    rooms: [{ sharing: '3-sharing', rent: 7500, advance: 0, beds: 24, free: 5 }, { sharing: '4-sharing', rent: 6000, advance: 0, beds: 20, free: 3 }],
  },
  // Free listings: own terms, advance allowed.
  {
    name: 'Sri Sai PG', area: 'Gachibowli', lat: 17.4368, lng: 78.3621, address: 'Indira Nagar, Gachibowli', owner: 0,
    genderType: 'boys', partner: false, foodAvailable: true,
    description: 'Budget PG with two meals a day.',
    amenities: ['WiFi', 'Hot water', 'Power backup'],
    rooms: [{ sharing: '3-sharing', rent: 7000, advance: 10000, beds: 15, free: 2 }],
  },
  {
    name: 'Lakshmi Ladies Hostel', area: 'Madhapur', lat: 17.4521, lng: 78.3871, address: 'Kavuri Hills, Madhapur', owner: 0,
    genderType: 'girls', partner: false, foodAvailable: true,
    description: 'Family-run ladies hostel near Kavuri Hills park.',
    amenities: ['WiFi', 'CCTV', 'Laundry'],
    rooms: [{ sharing: '2-sharing', rent: 9000, advance: 15000, beds: 12, free: 1 }, { sharing: '3-sharing', rent: 7500, advance: 10000, beds: 12, free: 2 }],
  },
  {
    name: 'Royal Stay Kondapur', area: 'Kondapur', lat: 17.4632, lng: 78.3652, address: 'Masjid Banda, Kondapur', owner: 1,
    genderType: 'boys', partner: false, foodAvailable: false,
    description: 'Rooms only, no food. Kitchenette on every floor.',
    amenities: ['WiFi', 'Kitchenette', 'Parking'],
    rooms: [{ sharing: 'private', rent: 12000, advance: 24000, beds: 6, free: 1 }, { sharing: '2-sharing', rent: 8000, advance: 16000, beds: 14, free: 3 }],
  },
  {
    name: 'Techie Nest', area: 'HiTech City', lat: 17.4489, lng: 78.3812, address: 'Madhapur Road, HiTech City', owner: 1,
    genderType: 'coliving', partner: false, foodAvailable: true,
    description: 'Co-living for working professionals with breakfast and dinner.',
    amenities: ['WiFi', 'AC', 'Housekeeping'],
    rooms: [{ sharing: '2-sharing', rent: 10000, advance: 20000, beds: 20, free: 4 }],
  },
  {
    name: 'Comfort Inn PG', area: 'Financial District', lat: 17.4121, lng: 78.3398, address: 'Khajaguda, Financial District', owner: 0,
    genderType: 'boys', partner: false, foodAvailable: true,
    description: 'Spacious rooms with attached bathrooms.',
    amenities: ['WiFi', 'Attached bathroom', 'Power backup'],
    rooms: [{ sharing: '3-sharing', rent: 8000, advance: 12000, beds: 18, free: 0 }, { sharing: '4-sharing', rent: 6500, advance: 10000, beds: 16, free: 4 }],
  },
  {
    name: 'Sai Krupa Hostel', area: 'Ameerpet', lat: 17.4351, lng: 78.4448, address: 'SR Nagar, Ameerpet', owner: 1,
    genderType: 'boys', partner: false, foodAvailable: true,
    description: 'Student hostel near coaching centres. Three meals included in rent.',
    amenities: ['WiFi', 'Hot water', 'Study room'],
    rooms: [{ sharing: '4-sharing', rent: 5500, advance: 5500, beds: 32, free: 6 }],
  },
];

export const EXTRA_OWNERS = [
  { phone: '9000000004', name: 'Ravi Kumar' },
  { phone: '9000000005', name: 'Padma Reddy' },
];

type Dish = { veg: string; nonVeg?: string; partner?: string };
export type ThemeMenu = { theme: string; days: Record<Meal, Dish>[] };

const southIndian: ThemeMenu = {
  theme: 'South Indian week',
  days: [
    { breakfast: { veg: 'Idli, sambar, coconut chutney' }, lunch: { veg: 'Sambar rice, beans poriyal, curd', nonVeg: 'Chicken chettinad, rice' }, dinner: { veg: 'Lemon rice, potato fry', nonVeg: 'Egg curry, chapati' } },
    { breakfast: { veg: 'Masala dosa' }, lunch: { veg: 'Rasam rice, cabbage thoran', nonVeg: 'Fish curry, rice' }, dinner: { veg: 'Curd rice, mango pickle', nonVeg: 'Pepper chicken, parotta' } },
    { breakfast: { veg: 'Pongal, vada' }, lunch: { veg: 'Bisi bele bath, raita', nonVeg: 'Mutton kurma, rice' }, dinner: { veg: 'Vegetable uthappam' } },
    { breakfast: { veg: 'Upma, chutney' }, lunch: { veg: 'Tomato rice, avial', nonVeg: 'Chicken 65, rice' }, dinner: { veg: 'Chapati, kurma', nonVeg: 'Egg bhurji, chapati' } },
    { breakfast: { veg: 'Pesarattu', partner: 'Annapurna Tiffins' }, lunch: { veg: 'Pulihora, dal', nonVeg: 'Andhra chicken curry, rice' }, dinner: { veg: 'Ragi mudde, sambar' } },
    { breakfast: { veg: 'Rava dosa' }, lunch: { veg: 'Veg biryani, raita', nonVeg: 'Hyderabadi chicken biryani' }, dinner: { veg: 'Idiyappam, stew', nonVeg: 'Kerala chicken stew, appam' } },
    { breakfast: { veg: 'Poori, potato masala' }, lunch: { veg: 'Full meals, payasam', nonVeg: 'Full meals with fish fry' }, dinner: { veg: 'Dosa, chutney' } },
  ],
};

const northIndian: ThemeMenu = {
  theme: 'North Indian week',
  days: [
    { breakfast: { veg: 'Aloo paratha, curd' }, lunch: { veg: 'Rajma chawal', nonVeg: 'Butter chicken, jeera rice' }, dinner: { veg: 'Dal tadka, roti' } },
    { breakfast: { veg: 'Poha, jalebi' }, lunch: { veg: 'Chole, bhature', nonVeg: 'Chicken curry, rice' }, dinner: { veg: 'Paneer butter masala, naan', nonVeg: 'Chicken tikka masala, naan' } },
    { breakfast: { veg: 'Stuffed paratha' }, lunch: { veg: 'Kadhi chawal', nonVeg: 'Keema, roti' }, dinner: { veg: 'Mix veg, roti' } },
    { breakfast: { veg: 'Chole kulche' }, lunch: { veg: 'Dal makhani, rice', nonVeg: 'Egg curry, rice', partner: 'EatSure' }, dinner: { veg: 'Palak paneer, roti', nonVeg: 'Mutton rogan josh, roti' } },
    { breakfast: { veg: 'Besan chilla' }, lunch: { veg: 'Veg pulao, raita', nonVeg: 'Chicken pulao' }, dinner: { veg: 'Aloo gobi, roti' } },
    { breakfast: { veg: 'Puri, aloo sabzi' }, lunch: { veg: 'Paneer biryani', nonVeg: 'Chicken dum biryani' }, dinner: { veg: 'Kadai paneer, naan', nonVeg: 'Tandoori chicken, naan' } },
    { breakfast: { veg: 'Sabudana khichdi' }, lunch: { veg: 'Thali: dal, sabzi, roti, rice, kheer' }, dinner: { veg: 'Khichdi, papad' } },
  ],
};

const panAsian: ThemeMenu = {
  theme: 'Indo-Chinese week',
  days: [
    { breakfast: { veg: 'Bread omelette or veg sandwich' }, lunch: { veg: 'Veg fried rice, manchurian', nonVeg: 'Chicken fried rice, chilli chicken' }, dinner: { veg: 'Hakka noodles' } },
    { breakfast: { veg: 'Idli, chutney' }, lunch: { veg: 'Schezwan rice, gobi manchurian', nonVeg: 'Schezwan chicken rice' }, dinner: { veg: 'Veg momos, soup', nonVeg: 'Chicken momos, soup' } },
    { breakfast: { veg: 'Upma' }, lunch: { veg: 'Thai green curry, rice', nonVeg: 'Thai chicken curry, rice' }, dinner: { veg: 'Chilli paneer, noodles' } },
    { breakfast: { veg: 'Poha' }, lunch: { veg: 'Burnt garlic rice, veg', nonVeg: 'Garlic chicken, rice' }, dinner: { veg: 'Veg thukpa', nonVeg: 'Chicken thukpa' } },
    { breakfast: { veg: 'Masala dosa' }, lunch: { veg: 'Triple schezwan rice' }, dinner: { veg: 'Spring rolls, fried rice', nonVeg: 'Chicken lollipop, fried rice' } },
    { breakfast: { veg: 'Aloo paratha' }, lunch: { veg: 'Veg biryani', nonVeg: 'Chicken biryani' }, dinner: { veg: 'Burrito bowl', nonVeg: 'Chicken burrito bowl', partner: 'California Burrito' } },
    { breakfast: { veg: 'Puri, curry' }, lunch: { veg: 'Paneer chilli rice', nonVeg: 'Dragon chicken, rice' }, dinner: { veg: 'Noodle soup' } },
  ],
};

export const THEMES = [southIndian, northIndian, panAsian];
