import axios from "axios";

const API_URL = process.env["PHARMACY_API_URL"] ?? "https://67e14fb758cc6bf785254550.mockapi.io/pharmacies";

export interface Pharmacy {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  state: string;
  prescriptions: Array<{ drug: string; count: number }>;
}

export type PharmacyLookupResult =
  | { found: true; pharmacy: Pharmacy; rxVolume: number; location: string }
  | { found: false };

export async function lookupPharmacyByPhone(phone: string): Promise<PharmacyLookupResult> {
  const response = await axios.get<Pharmacy[]>(API_URL, { timeout: 5000 });
  const match = response.data.find((p) => p.phone === phone);

  if (!match) return { found: false };

  const rxVolume = match.prescriptions.reduce((sum, rx) => sum + rx.count, 0);
  const location = `${match.city}, ${match.state}`;

  return { found: true, pharmacy: match, rxVolume, location };
}
