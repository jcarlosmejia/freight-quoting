export interface Place {
  address: string;
  city: string;
  state: string;
  zip: string;
  references: string;
  lat: number | null;
  lon: number | null;
}

export const blankPlace = (): Place => ({ address: '', city: '', state: '', zip: '', references: '', lat: null, lon: null });
