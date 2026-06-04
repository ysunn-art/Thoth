// Mock expert directory data matching the swe-directory Figma design.
// The /smes API only carries name/specialization/sub_areas/email, so the
// richer profile fields (availability, bio, skills, location, projects) live here.

export type Availability = "Available" | "Busy" | "Away";

export interface Expert {
  id: string;
  name: string;
  initials: string;
  avatar: string; // tailwind bg color class
  role: string;
  team: string; // specialization tag
  availability: Availability;
  description: string;
  skills: string[];
  location: string;
  timezone: string;
  experience: string;
  openToMentor: boolean;
  email: string;
  slack: string;
  github: string;
  languages: string[];
  projects: string[];
  kbArticles: number;
  consultations: number;
}

export const EXPERTS: Expert[] = [
  {
    id: "aisha-patel",
    name: "Aisha Patel",
    initials: "AP",
    avatar: "bg-blue-500",
    role: "Principal SME · 5G & Network Strategy",
    team: "5G Network Architecture",
    availability: "Available",
    description:
      "Authoritative expert on T-Mobile's 5G Standalone (SA) rollout. Advises on spectrum deployment, network slicing use cases, and 3GPP Release alignment across the nationwide footprint.",
    skills: ["5G SA", "Network Slicing", "3GPP", "Spectrum Planning", "mmWave", "Mid-Band 2.5GHz"],
    location: "Bellevue, WA",
    timezone: "PT",
    experience: "14y experience",
    openToMentor: true,
    email: "aisha.patel@t-mobile.com",
    slack: "@aisha.patel",
    github: "@aishapatel-tmobile",
    languages: ["English", "Hindi"],
    projects: ["Ultra Capacity 5G Expansion", "Network Slicing for Enterprise", "n41 Spectrum Refarm"],
    kbArticles: 22,
    consultations: 4,
  },
  {
    id: "marcus-webb",
    name: "Marcus Webb",
    initials: "MW",
    avatar: "bg-teal-600",
    role: "Senior SME · Customer Experience",
    team: "Customer Care Operations",
    availability: "Available",
    description:
      "Subject matter expert on Care contact-deflection strategy and the Team of Experts model. Author of T-Mobile's frontline playbooks.",
    skills: ["Care Operations", "Team of Experts", "NPS", "Contact Deflection", "Knowledge Base"],
    location: "Austin, TX",
    timezone: "CT",
    experience: "9y experience",
    openToMentor: true,
    email: "marcus.webb@t-mobile.com",
    slack: "@marcus.webb",
    github: "@marcuswebb-tmobile",
    languages: ["English"],
    projects: ["Team of Experts Rollout", "Contact Deflection Program"],
    kbArticles: 17,
    consultations: 6,
  },
  {
    id: "priya-nair",
    name: "Priya Nair",
    initials: "PN",
    avatar: "bg-orange-500",
    role: "Principal SME · Revenue Assurance",
    team: "Billing & Revenue Assurance",
    availability: "Busy",
    description:
      "Owns billing-system policy and revenue-assurance controls for postpaid, prepaid, and T-Mobile for Business. Trusted authority on rating.",
    skills: ["Amdocs Billing", "Proration", "Revenue Assurance", "Tax & Regulatory Fees", "Rate Plans"],
    location: "Frisco, TX",
    timezone: "CT",
    experience: "12y experience",
    openToMentor: false,
    email: "priya.nair@t-mobile.com",
    slack: "@priya.nair",
    github: "@priyanair-tmobile",
    languages: ["English", "Hindi"],
    projects: ["Postpaid Rating Engine", "Revenue Assurance Controls"],
    kbArticles: 19,
    consultations: 3,
  },
  {
    id: "jordan-kim",
    name: "Jordan Kim",
    initials: "JK",
    avatar: "bg-purple-500",
    role: "Senior SME · Device Engineering",
    team: "Device Certification",
    availability: "Available",
    description:
      "Leads device certification and OEM relationships for iOS and Android handsets on the T-Mobile network. Expert in VoLTE/VoNR.",
    skills: ["Device Certification", "VoLTE", "VoNR", "eSIM", "Carrier Bundle"],
    location: "Bellevue, WA",
    timezone: "PT",
    experience: "8y experience",
    openToMentor: true,
    email: "jordan.kim@t-mobile.com",
    slack: "@jordan.kim",
    github: "@jordankim-tmobile",
    languages: ["English", "Korean"],
    projects: ["eSIM Activation Flow", "VoNR Certification"],
    kbArticles: 14,
    consultations: 5,
  },
  {
    id: "devon-okafor",
    name: "Devon Okafor",
    initials: "DO",
    avatar: "bg-green-700",
    role: "SME II · Information Security",
    team: "Cybersecurity & Fraud",
    availability: "Available",
    description:
      "Fraud and SIM-swap prevention specialist. Maintains T-Mobile's account-takeover detection rules, port-out PIN enforcement.",
    skills: ["SIM Swap Prevention", "Port-Out PIN", "Account Takeover", "KBA", "Fraud Analytics"],
    location: "Frisco, TX",
    timezone: "CT",
    experience: "7y experience",
    openToMentor: true,
    email: "devon.okafor@t-mobile.com",
    slack: "@devon.okafor",
    github: "@devonokafor-tmobile",
    languages: ["English"],
    projects: ["SIM-Swap Detection Rules", "Port-Out PIN Enforcement"],
    kbArticles: 11,
    consultations: 4,
  },
  {
    id: "samira-hassan",
    name: "Samira Hassan",
    initials: "SH",
    avatar: "bg-orange-600",
    role: "Principal SME · Network Engineering",
    team: "RF & Spectrum Engineering",
    availability: "Away",
    description:
      "RF and spectrum engineering authority. Designs propagation models, manages 600 MHz / 2.5 GHz / mmWave deployments.",
    skills: ["RF Engineering", "Propagation Modeling", "600 MHz n71", "2.5 GHz n41", "mmWave n258"],
    location: "Bellevue, WA",
    timezone: "PT",
    experience: "15y experience",
    openToMentor: false,
    email: "samira.hassan@t-mobile.com",
    slack: "@samira.hassan",
    github: "@samirahassan-tmobile",
    languages: ["English", "Arabic"],
    projects: ["600 MHz Buildout", "mmWave Dense Urban"],
    kbArticles: 25,
    consultations: 2,
  },
  {
    id: "tyler-nguyen",
    name: "Tyler Nguyen",
    initials: "TN",
    avatar: "bg-pink-500",
    role: "Senior SME · Network Operations",
    team: "Network Operations",
    availability: "Available",
    description:
      "NOC incident-command lead. Owns major-outage runbooks, cross-vendor escalation paths, and the post-incident review process.",
    skills: ["Incident Command", "Outage Runbooks", "Vendor Escalation", "KPI Monitoring", "Postmortems"],
    location: "Austin, TX",
    timezone: "CT",
    experience: "10y experience",
    openToMentor: true,
    email: "tyler.nguyen@t-mobile.com",
    slack: "@tyler.nguyen",
    github: "@tylernguyen-tmobile",
    languages: ["English", "Vietnamese"],
    projects: ["NOC Runbook Modernization", "Major Incident Review"],
    kbArticles: 16,
    consultations: 7,
  },
  {
    id: "rina-castillo",
    name: "Rina Castillo",
    initials: "RC",
    avatar: "bg-magenta",
    role: "SME II · Retail Channel",
    team: "Retail Operations",
    availability: "Available",
    description:
      "Retail operations expert. Authors in-store sales playbooks, EIP (Equipment Installment Plan) eligibility rules.",
    skills: ["Retail Operations", "EIP", "Trade-In Valuation", "JUMP! Upgrade", "Promo Stacking"],
    location: "Frisco, TX",
    timezone: "CT",
    experience: "6y experience",
    openToMentor: false,
    email: "rina.castillo@t-mobile.com",
    slack: "@rina.castillo",
    github: "@rinacastillo-tmobile",
    languages: ["English", "Spanish"],
    projects: ["EIP Eligibility Engine", "In-Store Playbooks"],
    kbArticles: 9,
    consultations: 5,
  },
  {
    id: "leon-marchetti",
    name: "Leon Marchetti",
    initials: "LM",
    avatar: "bg-green-600",
    role: "Principal SME · T-Mobile for Business",
    team: "Enterprise / B2B",
    availability: "Busy",
    description:
      "Enterprise and government solutions lead. Advises on Private 5G deployments, FirstNet adjacency, MDM integrations.",
    skills: ["Private 5G", "Enterprise Sales", "MDM Integration", "Fleet Activation", "SLAs"],
    location: "Bellevue, WA",
    timezone: "PT",
    experience: "13y experience",
    openToMentor: true,
    email: "leon.marchetti@t-mobile.com",
    slack: "@leon.marchetti",
    github: "@leonmarchetti-tmobile",
    languages: ["English", "Italian"],
    projects: ["Private 5G for Logistics", "Fleet Activation Platform"],
    kbArticles: 21,
    consultations: 3,
  },
  {
    id: "fatima-al-rashid",
    name: "Fatima Al-Rashid",
    initials: "FA",
    avatar: "bg-purple-600",
    role: "Senior SME · Legal & Regulatory",
    team: "Regulatory & Compliance",
    availability: "Available",
    description:
      "Regulatory compliance expert. Handles FCC filings, CPNI (Customer Proprietary Network Information) controls, state-level rules.",
    skills: ["FCC Compliance", "CPNI", "Lifeline Program", "USF", "CALEA"],
    location: "Frisco, TX",
    timezone: "CT",
    experience: "11y experience",
    openToMentor: false,
    email: "fatima.alrashid@t-mobile.com",
    slack: "@fatima.alrashid",
    github: "@fatimaalrashid-tmobile",
    languages: ["English", "Arabic"],
    projects: ["CPNI Controls Audit", "Lifeline Compliance"],
    kbArticles: 18,
    consultations: 2,
  },
  {
    id: "chris-park",
    name: "Chris Park",
    initials: "CP",
    avatar: "bg-purple-500",
    role: "SME II · Global Roaming",
    team: "Roaming & Interconnect",
    availability: "Busy",
    description:
      "International roaming and interconnect specialist. Manages partner carrier agreements, IR.21 documentation, and steering.",
    skills: ["IR.21", "Roaming Agreements", "GSMA Standards", "IPX Interconnect", "Steering of Roaming"],
    location: "Austin, TX",
    timezone: "CT",
    experience: "9y experience",
    openToMentor: true,
    email: "chris.park@t-mobile.com",
    slack: "@chris.park",
    github: "@chrispark-tmobile",
    languages: ["English", "Korean"],
    projects: ["IR.21 Automation", "Steering of Roaming"],
    kbArticles: 12,
    consultations: 4,
  },
  {
    id: "grace-osei",
    name: "Grace Osei",
    initials: "GO",
    avatar: "bg-orange-500",
    role: "Senior SME · IoT Solutions",
    team: "IoT & Connected Devices",
    availability: "Available",
    description:
      "IoT and connected-device expert. Advises customers on NB-IoT vs LTE-M trade-offs, designs M2M activation flows.",
    skills: ["NB-IoT", "LTE-M", "M2M Activation", "Connected Car", "Asset Tracking"],
    location: "Bellevue, WA",
    timezone: "PT",
    experience: "8y experience",
    openToMentor: true,
    email: "grace.osei@t-mobile.com",
    slack: "@grace.osei",
    github: "@graceosei-tmobile",
    languages: ["English", "Twi"],
    projects: ["NB-IoT Asset Tracking", "Connected Car Platform"],
    kbArticles: 15,
    consultations: 6,
  },
];

// All specialization tags shown as filter chips.
export const TEAMS = [
  "Device Certification",
  "RF & Spectrum Engineering",
  "Network Operations",
  "Roaming & Interconnect",
  "Customer Care Operations",
  "Retail Operations",
  "5G Network Architecture",
  "Enterprise / B2B",
  "Cybersecurity & Fraud",
  "Regulatory & Compliance",
  "Billing & Revenue Assurance",
  "IoT & Connected Devices",
];

const TEAM_COLORS: Record<string, string> = {
  "5G Network Architecture": "text-blue-600",
  "Customer Care Operations": "text-purple-600",
  "Billing & Revenue Assurance": "text-orange-600",
  "Device Certification": "text-blue-600",
  "Cybersecurity & Fraud": "text-red-600",
  "RF & Spectrum Engineering": "text-pink-600",
  "Network Operations": "text-green-600",
  "Retail Operations": "text-orange-600",
  "Enterprise / B2B": "text-blue-600",
  "Regulatory & Compliance": "text-indigo-600",
  "Roaming & Interconnect": "text-cyan-600",
  "IoT & Connected Devices": "text-amber-600",
};

export function teamColor(team: string): string {
  return TEAM_COLORS[team] ?? "text-neutral-600";
}

export function availabilityColor(a: Availability): string {
  return a === "Available"
    ? "text-green-600"
    : a === "Busy"
      ? "text-orange-500"
      : "text-neutral-400";
}

export function availabilityDot(a: Availability): string {
  return a === "Available"
    ? "bg-green-500"
    : a === "Busy"
      ? "bg-orange-400"
      : "bg-neutral-300";
}
