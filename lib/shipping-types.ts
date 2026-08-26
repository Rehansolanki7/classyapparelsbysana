export const SHIPPING_ZONES = ["mumbai_local", "maharashtra", "rest_of_india"] as const;
export type ShippingZone = typeof SHIPPING_ZONES[number];

export type ShippingRateCard = {
  id: number;
  zone: ShippingZone;
  weightLimitGrams: number;
  carrierChargePaise: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  serviceable: boolean;
  lastReviewedAt: string | null;
};

export type PincodeRule = {
  id: number;
  pincode: string;
  zone: ShippingZone | null;
  serviceable: boolean;
  carrierChargePaise: number | null;
  manualQuoteRequired: boolean;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  note: string;
};
