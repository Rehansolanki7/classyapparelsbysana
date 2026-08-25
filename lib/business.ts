function value(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function businessConfiguration() {
  const configuration = {
    legalName: value("BUSINESS_LEGAL_NAME"),
    address: value("BUSINESS_ADDRESS"),
    customerCareEmail: value("CUSTOMER_CARE_EMAIL") || value("OWNER_EMAIL"),
    customerCarePhone: value("CUSTOMER_CARE_PHONE") || "+91 77159 10151",
    grievanceOfficer: value("GRIEVANCE_OFFICER"),
    exchangeReturnShippingPolicy: value("EXCHANGE_RETURN_SHIPPING_POLICY"),
  };
  return {
    ...configuration,
    ready: Object.values(configuration).every(Boolean),
  };
}
