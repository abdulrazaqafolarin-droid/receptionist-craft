export interface ServiceTemplate {
  name: string;
  duration_minutes: number;
  description: string;
}

export interface BusinessTemplate {
  key: string;
  name: string;
  description: string;
  services: ServiceTemplate[];
}

export const SERVICE_TEMPLATES: Record<string, BusinessTemplate> = {
  dental: {
    key: "dental",
    name: "Dental Clinic",
    description: "Complete dental service templates",
    services: [
      { name: "Teeth Cleaning", duration_minutes: 30, description: "Standard dental cleaning and polishing." },
      { name: "Dental Checkup", duration_minutes: 45, description: "Comprehensive oral examination." },
      { name: "Teeth Whitening", duration_minutes: 60, description: "Professional whitening treatment." },
      { name: "Root Canal", duration_minutes: 90, description: "Deep treatment for infected tooth." },
      { name: "X-Ray", duration_minutes: 15, description: "Full-mouth radiograph." },
      { name: "Filling", duration_minutes: 45, description: "Tooth cavity filling procedure." },
      { name: "Extraction", duration_minutes: 30, description: "Tooth removal service." },
    ],
  },
  spa: {
    key: "spa",
    name: "Spa & Wellness",
    description: "Relaxation and wellness services",
    services: [
      { name: "Full Body Massage", duration_minutes: 60, description: "Relaxing therapeutic massage." },
      { name: "Facial Treatment", duration_minutes: 50, description: "Deep cleansing facial." },
      { name: "Pedicure", duration_minutes: 30, description: "Foot care and nail grooming." },
      { name: "Manicure", duration_minutes: 30, description: "Hand and nail care." },
      { name: "Hot Stone Massage", duration_minutes: 75, description: "Massage with heated stones." },
      { name: "Body Scrub", duration_minutes: 45, description: "Exfoliating body treatment." },
    ],
  },
  salon: {
    key: "salon",
    name: "Hair Salon",
    description: "Professional hair styling services",
    services: [
      { name: "Haircut", duration_minutes: 45, description: "Professional haircut and styling." },
      { name: "Hair Coloring", duration_minutes: 90, description: "Premium hair dye service." },
      { name: "Blow Dry", duration_minutes: 30, description: "Professional blow dry styling." },
      { name: "Highlights", duration_minutes: 120, description: "Hair highlighting treatment." },
      { name: "Hair Treatment", duration_minutes: 45, description: "Deep conditioning treatment." },
    ],
  },
  barber: {
    key: "barber",
    name: "Barber Shop",
    description: "Men's grooming services",
    services: [
      { name: "Fade Haircut", duration_minutes: 40, description: "Modern fade lineup." },
      { name: "Beard Trim", duration_minutes: 20, description: "Beard grooming and shaping." },
      { name: "Hot Towel Shave", duration_minutes: 25, description: "Traditional straight razor shave." },
      { name: "Hair & Beard Combo", duration_minutes: 60, description: "Complete grooming package." },
    ],
  },
  fitness: {
    key: "fitness",
    name: "Gym & Fitness",
    description: "Fitness and training services",
    services: [
      { name: "Personal Training", duration_minutes: 60, description: "One-on-one fitness coaching." },
      { name: "Yoga Session", duration_minutes: 45, description: "Group yoga class." },
      { name: "HIIT Class", duration_minutes: 45, description: "High-intensity interval training." },
      { name: "Nutrition Consultation", duration_minutes: 30, description: "Personalized diet planning." },
    ],
  },
  clinic: {
    key: "clinic",
    name: "Medical Clinic",
    description: "Healthcare consultation services",
    services: [
      { name: "General Consultation", duration_minutes: 30, description: "Meet with the doctor." },
      { name: "Follow-up Visit", duration_minutes: 15, description: "Short follow-up appointment." },
      { name: "Physical Examination", duration_minutes: 45, description: "Complete health checkup." },
      { name: "Vaccination", duration_minutes: 15, description: "Immunization service." },
    ],
  },
  restaurant: {
    key: "restaurant",
    name: "Restaurant",
    description: "Dining reservations",
    services: [
      { name: "Table Reservation (2 people)", duration_minutes: 90, description: "Reserve a table for two." },
      { name: "Table Reservation (4 people)", duration_minutes: 90, description: "Reserve a table for four." },
      { name: "Table Reservation (Large Group)", duration_minutes: 120, description: "Group dining reservation." },
    ],
  },
  lawyer: {
    key: "lawyer",
    name: "Law Office",
    description: "Legal consultation services",
    services: [
      { name: "Initial Consultation", duration_minutes: 60, description: "First legal advice session." },
      { name: "Follow-up Meeting", duration_minutes: 30, description: "Continued legal discussion." },
      { name: "Document Review", duration_minutes: 45, description: "Legal document analysis." },
    ],
  },
  realestate: {
    key: "realestate",
    name: "Real Estate",
    description: "Property viewing services",
    services: [
      { name: "Property Viewing", duration_minutes: 30, description: "Tour of available property." },
      { name: "Consultation Meeting", duration_minutes: 45, description: "Discuss buying or selling options." },
    ],
  },
  generic: {
    key: "generic",
    name: "Generic Business",
    description: "Basic consultation services",
    services: [
      { name: "Consultation", duration_minutes: 30, description: "General consultation meeting." },
      { name: "Appointment", duration_minutes: 60, description: "Standard appointment slot." },
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
  };

  const key = mapping[normalizedType];
  return key ? SERVICE_TEMPLATES[key] : SERVICE_TEMPLATES.generic;
};
