export type ItemType = 'service' | 'product';

export interface ServiceTemplate {
  name: string;
  duration_minutes: number;
  description: string;
  type: ItemType;
  price?: number;
}

export interface BusinessTemplate {
  key: string;
  name: string;
  description: string;
  type: 'services' | 'products' | 'both';
  services: ServiceTemplate[];
}

export const SERVICE_TEMPLATES: Record<string, BusinessTemplate> = {
  dental: {
    key: "dental",
    name: "Dental Clinic",
    description: "Complete dental service templates",
    type: "services",
    services: [
      { name: "Teeth Cleaning", duration_minutes: 30, description: "Standard dental cleaning and polishing.", type: "service" },
      { name: "Dental Checkup", duration_minutes: 45, description: "Comprehensive oral examination.", type: "service" },
      { name: "Teeth Whitening", duration_minutes: 60, description: "Professional whitening treatment.", type: "service" },
      { name: "Root Canal", duration_minutes: 90, description: "Deep treatment for infected tooth.", type: "service" },
      { name: "X-Ray", duration_minutes: 15, description: "Full-mouth radiograph.", type: "service" },
      { name: "Filling", duration_minutes: 45, description: "Tooth cavity filling procedure.", type: "service" },
      { name: "Extraction", duration_minutes: 30, description: "Tooth removal service.", type: "service" },
    ],
  },
  spa: {
    key: "spa",
    name: "Spa & Wellness",
    description: "Relaxation and wellness services",
    type: "services",
    services: [
      { name: "Full Body Massage", duration_minutes: 60, description: "Relaxing therapeutic massage.", type: "service" },
      { name: "Facial Treatment", duration_minutes: 50, description: "Deep cleansing facial.", type: "service" },
      { name: "Pedicure", duration_minutes: 30, description: "Foot care and nail grooming.", type: "service" },
      { name: "Manicure", duration_minutes: 30, description: "Hand and nail care.", type: "service" },
      { name: "Hot Stone Massage", duration_minutes: 75, description: "Massage with heated stones.", type: "service" },
      { name: "Body Scrub", duration_minutes: 45, description: "Exfoliating body treatment.", type: "service" },
    ],
  },
  salon: {
    key: "salon",
    name: "Hair Salon",
    description: "Professional hair styling services",
    type: "services",
    services: [
      { name: "Haircut", duration_minutes: 45, description: "Professional haircut and styling.", type: "service" },
      { name: "Hair Coloring", duration_minutes: 90, description: "Premium hair dye service.", type: "service" },
      { name: "Blow Dry", duration_minutes: 30, description: "Professional blow dry styling.", type: "service" },
      { name: "Highlights", duration_minutes: 120, description: "Hair highlighting treatment.", type: "service" },
      { name: "Hair Treatment", duration_minutes: 45, description: "Deep conditioning treatment.", type: "service" },
    ],
  },
  barber: {
    key: "barber",
    name: "Barber Shop",
    description: "Men's grooming services",
    type: "services",
    services: [
      { name: "Fade Haircut", duration_minutes: 40, description: "Modern fade lineup.", type: "service" },
      { name: "Beard Trim", duration_minutes: 20, description: "Beard grooming and shaping.", type: "service" },
      { name: "Hot Towel Shave", duration_minutes: 25, description: "Traditional straight razor shave.", type: "service" },
      { name: "Hair & Beard Combo", duration_minutes: 60, description: "Complete grooming package.", type: "service" },
    ],
  },
  fitness: {
    key: "fitness",
    name: "Gym & Fitness",
    description: "Fitness and training services",
    type: "services",
    services: [
      { name: "Personal Training", duration_minutes: 60, description: "One-on-one fitness coaching.", type: "service" },
      { name: "Yoga Session", duration_minutes: 45, description: "Group yoga class.", type: "service" },
      { name: "HIIT Class", duration_minutes: 45, description: "High-intensity interval training.", type: "service" },
      { name: "Nutrition Consultation", duration_minutes: 30, description: "Personalized diet planning.", type: "service" },
    ],
  },
  clinic: {
    key: "clinic",
    name: "Medical Clinic",
    description: "Healthcare consultation services",
    type: "services",
    services: [
      { name: "General Consultation", duration_minutes: 30, description: "Meet with the doctor.", type: "service" },
      { name: "Follow-up Visit", duration_minutes: 15, description: "Short follow-up appointment.", type: "service" },
      { name: "Physical Examination", duration_minutes: 45, description: "Complete health checkup.", type: "service" },
      { name: "Vaccination", duration_minutes: 15, description: "Immunization service.", type: "service" },
    ],
  },
  restaurant: {
    key: "restaurant",
    name: "Restaurant",
    description: "Dining reservations",
    type: "services",
    services: [
      { name: "Table Reservation (2 people)", duration_minutes: 90, description: "Reserve a table for two.", type: "service" },
      { name: "Table Reservation (4 people)", duration_minutes: 90, description: "Reserve a table for four.", type: "service" },
      { name: "Table Reservation (Large Group)", duration_minutes: 120, description: "Group dining reservation.", type: "service" },
    ],
  },
  lawyer: {
    key: "lawyer",
    name: "Law Office",
    description: "Legal consultation services",
    type: "services",
    services: [
      { name: "Initial Consultation", duration_minutes: 60, description: "First legal advice session.", type: "service" },
      { name: "Follow-up Meeting", duration_minutes: 30, description: "Continued legal discussion.", type: "service" },
      { name: "Document Review", duration_minutes: 45, description: "Legal document analysis.", type: "service" },
    ],
  },
  realestate: {
    key: "realestate",
    name: "Real Estate",
    description: "Property viewing services",
    type: "services",
    services: [
      { name: "Property Viewing", duration_minutes: 30, description: "Tour of available property.", type: "service" },
      { name: "Consultation Meeting", duration_minutes: 45, description: "Discuss buying or selling options.", type: "service" },
    ],
  },
  generic: {
    key: "generic",
    name: "Generic Business",
    description: "Basic consultation services",
    type: "services",
    services: [
      { name: "Consultation", duration_minutes: 30, description: "General consultation meeting.", type: "service" },
      { name: "Appointment", duration_minutes: 60, description: "Standard appointment slot.", type: "service" },
    ],
  },
  // Product-based templates
  retailstore: {
    key: "retailstore",
    name: "Retail Store",
    description: "General retail products",
    type: "products",
    services: [
      { name: "T-Shirt", duration_minutes: 0, description: "Cotton casual t-shirt.", type: "product", price: 25 },
      { name: "Jeans", duration_minutes: 0, description: "Denim jeans.", type: "product", price: 65 },
      { name: "Sneakers", duration_minutes: 0, description: "Comfortable sneakers.", type: "product", price: 95 },
      { name: "Cap", duration_minutes: 0, description: "Casual baseball cap.", type: "product", price: 20 },
    ],
  },
  electronics: {
    key: "electronics",
    name: "Electronics Store",
    description: "Electronics and gadgets",
    type: "products",
    services: [
      { name: "Smartphone", duration_minutes: 0, description: "Latest smartphone model.", type: "product", price: 799 },
      { name: "Laptop", duration_minutes: 0, description: "High-performance laptop.", type: "product", price: 1299 },
      { name: "Headphones", duration_minutes: 0, description: "Wireless headphones.", type: "product", price: 199 },
      { name: "Tablet", duration_minutes: 0, description: "Portable tablet device.", type: "product", price: 499 },
      { name: "Smartwatch", duration_minutes: 0, description: "Fitness smartwatch.", type: "product", price: 299 },
    ],
  },
  bakery: {
    key: "bakery",
    name: "Bakery",
    description: "Fresh baked goods",
    type: "products",
    services: [
      { name: "Croissant", duration_minutes: 0, description: "Fresh butter croissant.", type: "product", price: 4 },
      { name: "Baguette", duration_minutes: 0, description: "French baguette bread.", type: "product", price: 5 },
      { name: "Birthday Cake", duration_minutes: 0, description: "Custom birthday cake.", type: "product", price: 45 },
      { name: "Cookies (dozen)", duration_minutes: 0, description: "Freshly baked cookies.", type: "product", price: 15 },
      { name: "Muffins (6 pack)", duration_minutes: 0, description: "Assorted muffins.", type: "product", price: 12 },
    ],
  },
  pharmacy: {
    key: "pharmacy",
    name: "Pharmacy",
    description: "Health and wellness products",
    type: "both",
    services: [
      { name: "Prescription Consultation", duration_minutes: 15, description: "Pharmacist consultation.", type: "service" },
      { name: "Health Screening", duration_minutes: 20, description: "Basic health checkup.", type: "service" },
      { name: "Vitamins", duration_minutes: 0, description: "Daily vitamins supplement.", type: "product", price: 25 },
      { name: "First Aid Kit", duration_minutes: 0, description: "Complete first aid kit.", type: "product", price: 35 },
      { name: "Skincare Set", duration_minutes: 0, description: "Skincare essentials.", type: "product", price: 50 },
    ],
  },
  petshop: {
    key: "petshop",
    name: "Pet Shop",
    description: "Pet supplies and services",
    type: "both",
    services: [
      { name: "Pet Grooming", duration_minutes: 60, description: "Full pet grooming session.", type: "service" },
      { name: "Vet Consultation", duration_minutes: 30, description: "Veterinary consultation.", type: "service" },
      { name: "Dog Food (10kg)", duration_minutes: 0, description: "Premium dog food.", type: "product", price: 45 },
      { name: "Cat Food (5kg)", duration_minutes: 0, description: "Premium cat food.", type: "product", price: 30 },
      { name: "Pet Toys", duration_minutes: 0, description: "Assorted pet toys.", type: "product", price: 15 },
      { name: "Pet Bed", duration_minutes: 0, description: "Comfortable pet bed.", type: "product", price: 60 },
    ],
  },
  florist: {
    key: "florist",
    name: "Florist",
    description: "Flowers and arrangements",
    type: "products",
    services: [
      { name: "Rose Bouquet", duration_minutes: 0, description: "Dozen red roses.", type: "product", price: 55 },
      { name: "Mixed Bouquet", duration_minutes: 0, description: "Seasonal mixed flowers.", type: "product", price: 45 },
      { name: "Wedding Arrangement", duration_minutes: 0, description: "Custom wedding flowers.", type: "product", price: 250 },
      { name: "Potted Plant", duration_minutes: 0, description: "Indoor potted plant.", type: "product", price: 35 },
    ],
  },
  carwash: {
    key: "carwash",
    name: "Car Wash",
    description: "Vehicle cleaning services",
    type: "services",
    services: [
      { name: "Basic Wash", duration_minutes: 20, description: "Exterior wash and dry.", type: "service" },
      { name: "Full Detail", duration_minutes: 90, description: "Interior and exterior detailing.", type: "service" },
      { name: "Interior Clean", duration_minutes: 45, description: "Deep interior cleaning.", type: "service" },
      { name: "Wax & Polish", duration_minutes: 60, description: "Full wax and polish.", type: "service" },
    ],
  },
  autoparts: {
    key: "autoparts",
    name: "Auto Parts",
    description: "Vehicle parts and accessories",
    type: "products",
    services: [
      { name: "Oil Filter", duration_minutes: 0, description: "Standard oil filter.", type: "product", price: 15 },
      { name: "Brake Pads", duration_minutes: 0, description: "Front brake pads set.", type: "product", price: 85 },
      { name: "Car Battery", duration_minutes: 0, description: "12V car battery.", type: "product", price: 120 },
      { name: "Wiper Blades", duration_minutes: 0, description: "Pair of wiper blades.", type: "product", price: 30 },
    ],
  },
  grocery: {
    key: "grocery",
    name: "Grocery Store",
    description: "Fresh groceries and essentials",
    type: "products",
    services: [
      { name: "Fresh Produce Box", duration_minutes: 0, description: "Weekly fresh vegetables.", type: "product", price: 35 },
      { name: "Dairy Essentials", duration_minutes: 0, description: "Milk, cheese, eggs bundle.", type: "product", price: 25 },
      { name: "Meat Pack", duration_minutes: 0, description: "Assorted meat selection.", type: "product", price: 55 },
      { name: "Pantry Basics", duration_minutes: 0, description: "Rice, pasta, essentials.", type: "product", price: 40 },
    ],
  },
};

export const getTemplateByBusinessType = (businessType: string): BusinessTemplate | null => {
  const normalizedType = businessType.toLowerCase().replace(/\s+/g, '');
  
  const mapping: Record<string, string> = {
    'dentalclinic': 'dental',
    'dental': 'dental',
    'spa&wellness': 'spa',
    'spa': 'spa',
    'hairsalon': 'salon',
    'salon': 'salon',
    'barbershop': 'barber',
    'barber': 'barber',
    'gym&fitness': 'fitness',
    'fitness': 'fitness',
    'clinic': 'clinic',
    'medicalclinic': 'clinic',
    'hospital': 'clinic',
    'restaurant': 'restaurant',
    'lawoffice': 'lawyer',
    'lawyer': 'lawyer',
    'realestate': 'realestate',
    'generic': 'generic',
    'retailstore': 'retailstore',
    'retail': 'retailstore',
    'electronics': 'electronics',
    'electronicsstore': 'electronics',
    'bakery': 'bakery',
    'pharmacy': 'pharmacy',
    'petshop': 'petshop',
    'florist': 'florist',
    'carwash': 'carwash',
    'autoparts': 'autoparts',
    'grocery': 'grocery',
    'grocerystore': 'grocery',
  };

  const key = mapping[normalizedType];
  return key ? SERVICE_TEMPLATES[key] : SERVICE_TEMPLATES.generic;
};

// Helper to get only service templates
export const getServiceTemplates = (): BusinessTemplate[] => {
  return Object.values(SERVICE_TEMPLATES).filter(t => t.type === 'services' || t.type === 'both');
};

// Helper to get only product templates
export const getProductTemplates = (): BusinessTemplate[] => {
  return Object.values(SERVICE_TEMPLATES).filter(t => t.type === 'products' || t.type === 'both');
};
