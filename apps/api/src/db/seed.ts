import { addDays, istDate, newId, weekStart, type GenderType, type Meal, type SharingType } from '@hostels/shared';
import { closeDb, db, schema } from './index';
import { seedCommunity } from './seed-community';
import { seedTenant } from './seed-tenant';

export const DEMO = { admin: '9000000001', owner: '9000000002', tenant: '9000000003' } as const;

const PHOTOS = [
  'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200',
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200',
  'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200',
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200',
];

type SeedHostel = {
  name: string;
  area: string;
  lat: number;
  lng: number;
  gender: GenderType;
  partner: boolean;
  pro?: boolean;
  rooms: [SharingType, number, number, number][]; // sharing, rent, totalBeds, bedsFree
  amenities: string[];
  description: string;
};

const HOSTELS: SeedHostel[] = [
  { name: 'Sunrise Residency', area: 'Gachibowli', lat: 17.4401, lng: 78.3489, gender: 'coliving', partner: true, pro: true, rooms: [['2-sharing', 9000, 24, 4], ['3-sharing', 7500, 18, 3], ['private', 14000, 6, 1]], amenities: ['WiFi', 'AC', 'Laundry', 'Power backup', 'CCTV', 'Housekeeping'], description: 'Bright co-living rooms a five-minute walk from DLF Cyber City. Home-style food cooked in our own kitchen, with a new theme every week.' },
  { name: 'CityNest Madhapur', area: 'Madhapur', lat: 17.4483, lng: 78.3915, gender: 'boys', partner: true, pro: true, rooms: [['2-sharing', 10500, 30, 5], ['private', 16000, 8, 2]], amenities: ['WiFi', 'AC', 'Gym', 'Laundry', 'Power backup', 'Housekeeping'], description: 'Premium boys hostel near HITEC City metro. Gym on the terrace, rotating South Indian, North Indian and Chinese menus.' },
  { name: 'BlueRoof Kondapur', area: 'Kondapur', lat: 17.4622, lng: 78.3568, gender: 'girls', partner: true, rooms: [['3-sharing', 7000, 27, 6], ['2-sharing', 8500, 16, 2]], amenities: ['WiFi', 'CCTV', 'Biometric entry', 'Laundry', 'Warden on site'], description: 'Safe, calm girls hostel with biometric entry, a resident warden and a 10pm quiet hour.' },
  { name: 'Orbit Stays HITEC City', area: 'HITEC City', lat: 17.4474, lng: 78.3762, gender: 'coliving', partner: true, rooms: [['2-sharing', 11000, 20, 3], ['4-sharing', 6500, 24, 8]], amenities: ['WiFi', 'AC', 'Gaming lounge', 'Laundry', 'Power backup'], description: 'Co-living for people who work in HITEC City. Gaming lounge, work pods and fast fibre WiFi.' },
  { name: 'Greenleaf Financial District', area: 'Financial District', lat: 17.4152, lng: 78.3398, gender: 'coliving', partner: true, rooms: [['private', 17500, 10, 2], ['2-sharing', 12000, 20, 4]], amenities: ['WiFi', 'AC', 'Swimming pool', 'Gym', 'Housekeeping'], description: 'Serviced rooms beside Nanakramguda with a pool and gym. Ideal if you work in the Financial District.' },
  { name: 'Ameerpet Scholars Hostel', area: 'Ameerpet', lat: 17.4375, lng: 78.4482, gender: 'boys', partner: true, rooms: [['3-sharing', 6000, 36, 9], ['4-sharing', 5000, 32, 6]], amenities: ['WiFi', 'Study room', 'RO water', 'Laundry'], description: 'Budget hostel for students and coaching-centre aspirants, two minutes from Ameerpet metro. Quiet study room open 24x7.' },
  { name: 'Lakshmi Ladies PG', area: 'Ameerpet', lat: 17.4361, lng: 78.4446, gender: 'girls', partner: false, rooms: [['3-sharing', 5500, 21, 4]], amenities: ['WiFi', 'RO water', 'CCTV'], description: 'Family-run ladies PG serving homely Andhra meals.' },
  { name: 'Sri Sai Boys Hostel', area: 'Madhapur', lat: 17.4512, lng: 78.3881, gender: 'boys', partner: false, rooms: [['2-sharing', 8000, 14, 2], ['3-sharing', 6500, 18, 5]], amenities: ['WiFi', 'Power backup', 'Washing machine'], description: 'No-frills boys hostel in Madhapur with meals and good WiFi.' },
  { name: 'Hilltop Co-living Kondapur', area: 'Kondapur', lat: 17.4655, lng: 78.3621, gender: 'coliving', partner: false, rooms: [['private', 13000, 8, 1]], amenities: ['WiFi', 'AC', 'Terrace'], description: 'Private rooms with a terrace view over Kondapur.' },
  { name: 'Vasavi Working Women Hostel', area: 'Gachibowli', lat: 17.4369, lng: 78.3601, gender: 'girls', partner: false, rooms: [['2-sharing', 9500, 12, 3]], amenities: ['WiFi', 'AC', 'CCTV', 'Housekeeping'], description: 'For working women near Gachibowli stadium; meals included.' },
  { name: 'TechPark Stay', area: 'HITEC City', lat: 17.4502, lng: 78.3811, gender: 'boys', partner: false, rooms: [['4-sharing', 5800, 28, 7]], amenities: ['WiFi', 'Power backup'], description: 'Affordable 4-sharing beds a short walk from Mindspace.' },
  { name: 'Nanakramguda Nest', area: 'Financial District', lat: 17.4183, lng: 78.3449, gender: 'coliving', partner: false, rooms: [['2-sharing', 10000, 16, 4]], amenities: ['WiFi', 'AC', 'Gym'], description: 'Modern co-living with a small gym, close to the Wipro circle.' },
];

const THEMES = ['South Indian week', 'North Indian week', 'Hyderabadi week', 'Indo-Chinese week'];
const DISHES: Record<Meal, { veg: string[]; nonVeg: (string | null)[] }> = {
  breakfast: { veg: ['Idli, sambar, chutney', 'Poha with peanuts', 'Aloo paratha, curd', 'Upma, coconut chutney', 'Pesarattu with ginger chutney', 'Masala dosa', 'Bread omelette (egg-free option: veg sandwich)'], nonVeg: [null, null, null, 'Egg bhurji', null, null, 'Masala omelette'] },
  lunch: { veg: ['Rice, dal, bendi fry, curd', 'Rajma chawal, salad', 'Veg pulao, raita', 'Sambar rice, potato fry', 'Chole, jeera rice', 'Veg biryani, mirchi ka salan', 'Curd rice, mango pickle'], nonVeg: ['Chicken curry', null, 'Egg curry', null, 'Fish fry', 'Chicken dum biryani', null] },
  dinner: { veg: ['Chapati, paneer butter masala', 'Veg fried rice, manchurian', 'Chapati, mixed veg', 'Rice, tomato pappu', 'Hakka noodles, chilli paneer', 'Phulka, dal tadka', 'Khichdi, kadhi'], nonVeg: ['Butter chicken', 'Chilli chicken', null, 'Mutton curry', 'Chicken noodles', null, null] },
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function seed() {
  const [admin, owner, tenant] = await db
    .insert(schema.users)
    .values([
      { id: newId('usr'), phone: DEMO.admin, name: 'Platform Admin', role: 'admin' },
      { id: newId('usr'), phone: DEMO.owner, name: 'Ravi Kumar', role: 'owner', email: 'ravi@example.com' },
      { id: newId('usr'), phone: DEMO.tenant, name: 'Asha Reddy', role: 'tenant' },
    ])
    .returning();
  const extraOwners = await db
    .insert(schema.users)
    .values([
      { id: newId('usr'), phone: '9000000004', name: 'Lakshmi Devi', role: 'owner' },
      { id: newId('usr'), phone: '9000000005', name: 'Srinivas Rao', role: 'owner' },
    ])
    .returning();
  const owners = [owner!, ...extraOwners];

  const foodPartners = await db
    .insert(schema.foodPartners)
    .values([
      { id: newId('fdp'), name: 'California Burrito', cuisine: 'Mexican' },
      { id: newId('fdp'), name: 'EatSure', cuisine: 'Multi-cuisine' },
      { id: newId('fdp'), name: 'FreshMenu', cuisine: 'Continental' },
      { id: newId('fdp'), name: 'Amma Tiffins', cuisine: 'South Indian tiffin' },
    ])
    .returning();

  const thisWeek = weekStart(istDate());
  const created: (typeof schema.hostels.$inferSelect)[] = [];

  for (const [i, h] of HOSTELS.entries()) {
    const id = newId('hst');
    const [row] = await db
      .insert(schema.hostels)
      .values({
        id,
        ownerId: h.partner ? owners[0]!.id : owners[1 + (i % 2)]!.id,
        slug: slugify(h.name),
        name: h.name,
        description: h.description,
        city: 'Hyderabad',
        area: h.area,
        address: `${10 + i}-${i + 2}/${i + 1}, Main Road, ${h.area}, Hyderabad`,
        lat: h.lat,
        lng: h.lng,
        genderType: h.gender,
        amenities: h.amenities,
        rules: ['Gate closes at 11pm (inform warden if late)', 'No smoking inside rooms', 'Visitors allowed in the lounge till 8pm'],
        contactPhone: `98480${String(10000 + i).slice(-5)}`,
        whatsappPhone: `98480${String(10000 + i).slice(-5)}`,
        foodAvailable: true,
        status: 'live',
        partnerStatus: h.partner ? 'verified' : 'none',
        ownerPlan: h.pro ? 'pro' : 'free',
        platformFeePct: 10,
      })
      .returning();
    created.push(row!);

    await db.insert(schema.roomTypes).values(
      h.rooms.map(([sharing, rent, total, free]) => ({
        id: newId('rmt'),
        hostelId: id,
        sharing,
        monthlyRent: rent,
        advanceAmount: h.partner ? 0 : rent,
        totalBeds: total,
        bedsAvailable: free,
      })),
    );
    await db.insert(schema.hostelPhotos).values(
      [0, 1, 2].map((k) => ({ id: newId('pho'), hostelId: id, url: PHOTOS[(i + k * 3) % PHOTOS.length]!, sortOrder: k })),
    );

    if (h.partner) {
      for (const [w, ws] of [thisWeek, addDays(thisWeek, 7)].entries()) {
        const menuWeekId = newId('mnw');
        await db.insert(schema.menuWeeks).values({ id: menuWeekId, hostelId: id, weekStart: ws, theme: THEMES[(i + w) % THEMES.length]! });
        const items: (typeof schema.menuItems.$inferInsert)[] = [];
        for (let d = 0; d < 7; d++) {
          for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
            const k = (d + i + w) % 7;
            items.push({
              id: newId('mni'),
              menuWeekId,
              date: addDays(ws, d),
              meal,
              vegDish: DISHES[meal].veg[k]!,
              nonVegDish: DISHES[meal].nonVeg[k] ?? null,
              // Friday dinner comes from a partner brand.
              foodPartnerId: d === 4 && meal === 'dinner' ? foodPartners[(i + w) % foodPartners.length]!.id : null,
            });
          }
        }
        await db.insert(schema.menuItems).values(items);
      }
    }
  }

  const ctx = { admin: admin!, owner: owner!, tenant: tenant!, owners, hostels: created, foodPartners };
  await seedTenant(ctx);
  await seedCommunity(ctx);
  return ctx;
}


if (import.meta.main) {
  await seed();
  console.log(`seeded ${HOSTELS.length} hostels. Demo logins (OTP 123456): admin ${DEMO.admin}, owner ${DEMO.owner}, tenant ${DEMO.tenant}`);
  await closeDb();
}
